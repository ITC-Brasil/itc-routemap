import { NextResponse } from "next/server"
import { exigirSessaoApi } from "@/lib/session-server"
import {
  listarLocalidades,
  nomesTecnicos,
  parsearCoordenadas,
  ErroNocodb,
  type LinhaLocalidade,
} from "@/lib/nocodb"
import {
  buscarProjetoAdmin,
  listarPontosPorProjetoAdmin,
  criarPontoAdmin,
  atualizarPontoAdmin,
  deletarPontosEmBatchPreservandoEmUsoAdmin,
  marcarSincronizacaoAdmin,
  calcularHashPonto,
} from "@/lib/db/pontos"
import { listarTecnicos } from "@/lib/db/tecnicos"
import type { Ponto, PontoInput } from "@/lib/db/pontos"

// ============================================================
// TIPOS DE RESPOSTA
// ============================================================

/** Quantas linhas cada UM trouxe — substitui o antigo resumo por aba. */
type ResumoUm = {
  um: string
  totalLinhas: number
}

/** Linha que não entrou na sync, com o motivo. */
type AvisoLinha = {
  nocodbId: number
  um: string
  nome: string
  motivo: string
}

type RelatorioSync = {
  sucesso: true
  totalLinhas: number
  novos: number
  atualizados: number
  /**
   * Pontos cuja única mudança foi a coordenada. Contados à parte de
   * `atualizados` porque latitude/longitude não entram no hash.
   */
  coordenadasCorrigidas: number
  /** Pontos antigos (sem nocodbId) casados pela chave natural nesta sync. */
  vinculadosPorChave: number
  deletados: number
  /** Pontos que sumiram do NocoDB mas estavam em uso: viraram "Histórico". */
  preservados: number
  ignorados: number
  ums: ResumoUm[]
  /** Linhas com Status vazio ou desconhecido — NÃO importadas. */
  avisosStatus: AvisoLinha[]
  /** Linhas sem UM — não há onde encaixar o ponto. */
  avisosSemUm: AvisoLinha[]
  /**
   * Linhas "Atual" cujo técnico diverge do que o RouteMap tem para o ponto.
   * Só aviso: o RouteMap é a autoridade sobre o técnico e a sync não o altera.
   */
  avisosTecnico: string[]
  /**
   * Pontos com escrita de volta pendente: o NocoDB ainda não reflete o que o
   * Postgres tem, então a sync não os sobrescreve até o reenvio.
   */
  aguardandoReenvio: number
  duracao: number // milissegundos
}

type RespostaErro = {
  sucesso: false
  erro: string
  detalhe?: string
}

// ============================================================
// API ROUTE
// ============================================================

/**
 * POST /api/sincronizar
 * Body: { projetoId: string }
 *
 * Sincroniza os pontos de um projeto com a tabela Localidades do NocoDB,
 * lendo só as linhas cujo Projeto é a sigla do projeto.
 *
 * Algoritmo:
 *   1. Lê o projeto e as linhas do NocoDB com Projeto = sigla
 *   2. Valida tudo ANTES de escrever (técnico das linhas "Atual")
 *   3. Para cada linha: cria/atualiza/ignora pelo nocodbId e hash MD5
 *   4. Detecta pontos que sumiram do NocoDB (com guarda de deleção)
 *   5. Retorna relatório consolidado
 */
export async function POST(request: Request) {
  // Blindagem: sessao obrigatoria ANTES de qualquer escrita no banco ou
  // chamada a API externa.
  const { erro: erroSessao } = await exigirSessaoApi()
  if (erroSessao) return erroSessao

  const inicio = Date.now()

  try {
    // 1. PARSE DO BODY
    const body = await request.json()
    const projetoId: string | undefined = body.projetoId

    if (!projetoId) {
      return respostaErro("Parâmetro 'projetoId' é obrigatório.", 400)
    }

    // 2. BUSCAR PROJETO
    const projeto = await buscarProjetoAdmin(projetoId)
    if (!projeto) {
      return respostaErro("Projeto não encontrado.", 404)
    }

    // 3. LER O NOCODB — só as linhas deste projeto
    let linhas: LinhaLocalidade[]
    try {
      linhas = await listarLocalidades([projeto.sigla])
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : String(err)
      const status = err instanceof ErroNocodb ? 502 : 500
      return respostaErro("Erro ao ler o NocoDB.", status, mensagem)
    }

    const pontosExistentes = await listarPontosPorProjetoAdmin(projetoId)

    // Guarda contra sigla divergente: zero linhas para um projeto que tem
    // pontos faria a etapa 7 apagar o projeto inteiro. Quase sempre é a sigla
    // do RouteMap diferente da opção Projeto no NocoDB ("BSB.IA" x "BSBIA").
    if (linhas.length === 0 && pontosExistentes.length > 0) {
      return respostaErro(
        `O NocoDB não tem nenhuma linha com Projeto "${projeto.sigla}".`,
        409,
        `O projeto tem ${pontosExistentes.length} ponto(s) no RouteMap e nada foi alterado. ` +
          "Confira se a sigla do projeto é idêntica à opção Projeto do NocoDB."
      )
    }

    // 4. VALIDAR ANTES DE ESCREVER
    // O técnico das linhas "Atual" é comparado por nome IDÊNTICO com
    // tecnicos.nome. Sem casamento aproximado: "Lucas" não vira "Lucas
    // Andrade".
    //
    // A validação NÃO vincula nada: o RouteMap é a autoridade sobre o
    // técnico (pontos.tecnicoId, ums.tecnicoAtualId). O nome do NocoDB só
    // serve para comparar e avisar (etapa 6). Por isso nome que não existe no
    // RouteMap vira aviso; o que ainda aborta, antes da primeira escrita, é a
    // linha "Atual" sem técnico ou com mais de um, e nome que casa com dois
    // cadastros — dado que não dá nem para comparar.
    const tecnicos = await listarTecnicos()
    const tecnicoPorNome = new Map<string, string[]>()
    for (const t of tecnicos) {
      const ids = tecnicoPorNome.get(t.nome) ?? []
      ids.push(t.id)
      tecnicoPorNome.set(t.nome, ids)
    }
    const nomeTecnicoPorId = new Map(tecnicos.map((t) => [t.id, t.nome]))

    const errosTecnico: string[] = []
    const tecnicoNocodbPorLinha = new Map<number, string>()
    const tecnicoInexistentePorLinha = new Map<number, string>()

    for (const linha of linhas) {
      if (normalizarStatus(linha.Status) !== "Agendado") continue

      const nomes = nomesTecnicos(linha.Tecnico)
      const ref = `${linha.UM ?? "?"} ${linha.Nome ?? ""} (NocoDB #${linha.Id})`

      if (nomes.length !== 1) {
        errosTecnico.push(
          nomes.length === 0
            ? `${ref}: linha "Atual" sem técnico.`
            : `${ref}: linha "Atual" com ${nomes.length} técnicos (${nomes.join(", ")}); deve ter exatamente um.`
        )
        continue
      }

      const ids = tecnicoPorNome.get(nomes[0]) ?? []
      if (ids.length === 0) {
        tecnicoInexistentePorLinha.set(linha.Id, nomes[0])
      } else if (ids.length > 1) {
        errosTecnico.push(
          `${ref}: há ${ids.length} técnicos chamados "${nomes[0]}" no RouteMap.`
        )
      } else {
        tecnicoNocodbPorLinha.set(linha.Id, nomes[0])
      }
    }

    if (errosTecnico.length > 0) {
      return respostaErro(
        "Técnico das linhas \"Atual\" não pode ser comparado com o cadastro. Nada foi alterado.",
        422,
        errosTecnico.join(" | ")
      )
    }

    // 5. INDEXAR PONTOS EXISTENTES
    // Identidade é o nocodbId. A chave natural só serve para a primeira sync:
    // casa o ponto antigo (sem nocodbId) com a sua linha no NocoDB, e a partir
    // daí o vínculo é pelo id.
    const porNocodbId = new Map<number, Ponto>()
    const semNocodbIdPorChave = new Map<string, Ponto[]>()
    for (const p of pontosExistentes) {
      if (p.nocodbId !== null) {
        porNocodbId.set(p.nocodbId, p)
      } else {
        const chave = criarChaveComposta(p)
        const lista = semNocodbIdPorChave.get(chave) ?? []
        lista.push(p)
        semNocodbIdPorChave.set(chave, lista)
      }
    }

    // 6. PROCESSAR LINHAS
    let novos = 0
    let atualizados = 0
    let coordenadasCorrigidas = 0
    let vinculadosPorChave = 0
    let ignorados = 0
    let aguardandoReenvio = 0
    const avisosStatus: AvisoLinha[] = []
    const avisosSemUm: AvisoLinha[] = []
    const avisosTecnico: string[] = []
    const idsPresentes = new Set<string>()
    const linhasPorUm = new Map<string, number>()

    for (const linha of linhas) {
      const um = (linha.UM ?? "").trim()
      const aviso = (motivo: string): AvisoLinha => ({
        nocodbId: linha.Id,
        um,
        nome: linha.Nome ?? "",
        motivo,
      })

      if (um) linhasPorUm.set(um, (linhasPorUm.get(um) ?? 0) + 1)

      // Localiza o ponto ANTES de decidir se a linha importa: uma linha que
      // não pode ser importada agora (Status vazio) não é uma linha que
      // sumiu, e o ponto dela não pode ir para a deleção.
      let existente = porNocodbId.get(linha.Id) ?? null
      let vincularNocodbId = false
      if (!existente && um) {
        const candidatos =
          semNocodbIdPorChave.get(
            criarChaveComposta({
              projetoId,
              umNome: um,
              ciclo: inteiro(linha.Ciclo),
              etapa: inteiro(linha.Etapa),
              plusCode: linha.PlusCode ?? "",
            })
          ) ?? []
        // Só casa quando há exatamente um candidato ainda livre; ambíguo vira
        // ponto novo em vez de herdar o vínculo errado.
        const livres = candidatos.filter((c) => !idsPresentes.has(c.id))
        if (livres.length === 1) {
          existente = livres[0]
          vincularNocodbId = true
        }
      }
      if (existente) idsPresentes.add(existente.id)

      if (!um) {
        avisosSemUm.push(aviso("Linha sem UM."))
        ignorados++
        continue
      }

      const status = normalizarStatus(linha.Status)
      if (!status) {
        // Vazio NUNCA vira "Pendente": tornaria roteirizável um ponto que
        // ninguém classificou. Fica de fora até alguém preencher o Status.
        avisosStatus.push(
          aviso(
            linha.Status?.trim()
              ? `Status "${linha.Status}" desconhecido.`
              : "Status vazio."
          )
        )
        ignorados++
        continue
      }

      // Escrita de volta pendente: o NocoDB está atrás do Postgres. Aplicar a
      // linha agora desfaria a alocação confirmada. Espera o reenvio — mas o
      // vínculo pelo id é gravado, senão um ponto pendente por falta de
      // nocodbId nunca conseguiria ser reenviado.
      if (existente?.nocodbPendente) {
        if (vincularNocodbId) {
          await atualizarPontoAdmin(existente.id, {
            nocodbId: linha.Id,
            linhaOrigem: linha.Id,
          })
          vinculadosPorChave++
        }
        aguardandoReenvio++
        continue
      }

      // Técnico: só compara. Divergência vira aviso e nada é alterado — nem
      // pontos.tecnicoId, nem ums.tecnicoAtualId.
      const inexistente = tecnicoInexistentePorLinha.get(linha.Id)
      if (inexistente) {
        avisosTecnico.push(
          `UM ${um}: NocoDB diz ${inexistente}, que não existe no RouteMap com esse nome exato`
        )
      }
      const tecnicoNocodb = tecnicoNocodbPorLinha.get(linha.Id)
      if (tecnicoNocodb) {
        const tecnicoSistema = existente?.tecnicoId
          ? (nomeTecnicoPorId.get(existente.tecnicoId) ?? existente.tecnicoId)
          : null
        if (tecnicoSistema !== tecnicoNocodb) {
          avisosTecnico.push(
            `UM ${um}: NocoDB diz ${tecnicoNocodb}, sistema diz ${tecnicoSistema ?? "nenhum"}`
          )
        }
      }

      const input = converterLinhaParaPontoInput(linha, projetoId, um, status)
      const coordenadasDaOrigem =
        input.latitude !== null && input.longitude !== null
          ? { latitude: input.latitude, longitude: input.longitude }
          : null

      if (!existente) {
        // NOVO: nunca esteve no banco
        await criarPontoAdmin(input)
        novos++
        continue
      }

      if (vincularNocodbId) vinculadosPorChave++

      if (existente.hashMd5 !== input.hashMd5 || vincularNocodbId) {
        // ALTERADO (ou primeiro vínculo pelo nocodbId)
        await atualizarPontoAdmin(
          existente.id,
          // O NocoDB só é autoridade sobre a coordenada quando TEM
          // coordenada: vazio significa "não sei", não "apague" — preserva o
          // que o geocoding gravou.
          coordenadasDaOrigem ? input : semCoordenadas(input)
        )
        if (existente.hashMd5 !== input.hashMd5) atualizados++
      } else if (
        coordenadasDaOrigem &&
        divergem(existente.latitude, coordenadasDaOrigem.latitude,
                 existente.longitude, coordenadasDaOrigem.longitude)
      ) {
        // Hash igual, coordenada diferente: latitude/longitude não entram no
        // hash, então sem este ramo uma coordenada errada nunca seria corrigida.
        await atualizarPontoAdmin(existente.id, coordenadasDaOrigem)
        coordenadasCorrigidas++
      }
    }

    // 7. DETECTAR DELETADOS
    // Pontos que estão no banco mas cuja linha não está mais no NocoDB. Os
    // que estiverem em uso (com rota ou "Agendado") são preservados como
    // "Histórico".
    const idsParaDeletar = pontosExistentes
      .filter((p) => !idsPresentes.has(p.id))
      .map((p) => p.id)

    const { deletados, preservados } =
      await deletarPontosEmBatchPreservandoEmUsoAdmin(idsParaDeletar)

    // 8. ATUALIZAR TIMESTAMP DE SYNC
    await marcarSincronizacaoAdmin(projetoId)

    // 9. MONTAR RELATÓRIO
    const relatorio: RelatorioSync = {
      sucesso: true,
      totalLinhas: linhas.length,
      novos,
      atualizados,
      coordenadasCorrigidas,
      vinculadosPorChave,
      deletados,
      preservados: preservados.length,
      ignorados,
      ums: Array.from(linhasPorUm, ([um, totalLinhas]) => ({ um, totalLinhas }))
        .sort((a, b) => a.um.localeCompare(b.um)),
      avisosStatus,
      avisosSemUm,
      avisosTecnico,
      aguardandoReenvio,
      duracao: Date.now() - inicio,
    }

    if (avisosStatus.length > 0) {
      console.warn(
        `Sincronizacao ${projeto.sigla}: ${avisosStatus.length} linha(s) NAO importada(s) por Status:`,
        avisosStatus.map((a) => `#${a.nocodbId} ${a.um} ${a.nome}: ${a.motivo}`).join(", ")
      )
    }

    if (avisosTecnico.length > 0) {
      console.warn(
        `Sincronizacao ${projeto.sigla}: tecnico divergente (nada alterado):`,
        avisosTecnico.join("; ")
      )
    }

    if (avisosSemUm.length > 0) {
      console.warn(
        `Sincronizacao ${projeto.sigla}: ${avisosSemUm.length} linha(s) sem UM:`,
        avisosSemUm.map((a) => `#${a.nocodbId}`).join(", ")
      )
    }

    // Sempre logado, mesmo quando zero: a preservação é a evidência de que a
    // guarda impediu uma deleção destrutiva.
    console.info(
      `Sincronizacao ${projeto.sigla}: ${deletados} ponto(s) deletado(s), ` +
        `${preservados.length} preservado(s) como "Historico"` +
        (preservados.length > 0 ? ` [${preservados.join(", ")}]` : "") +
        `, ${vinculadosPorChave} vinculado(s) por chave natural`
    )

    return NextResponse.json(relatorio)
  } catch (err) {
    console.error("Erro na sincronização:", err)
    const mensagem = err instanceof Error ? err.message : String(err)
    return respostaErro("Erro interno na sincronização.", 500, mensagem)
  }
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Chave natural do ponto: projetoId + umNome + ciclo + etapa + Plus Code.
 *
 * Desde a troca para o NocoDB ela só serve para a PRIMEIRA sync de cada
 * ponto: casa o ponto antigo (sem nocodbId) com a sua linha, e depois o
 * vínculo é pelo nocodbId. Ver o histórico em d15ee58 para o porquê de cada
 * campo.
 *
 * O Plus Code entra só pelo CÓDIGO ("3X38+48"), sem a localidade que o NocoDB
 * acrescenta ("3X38+48 Riacho Fundo II, Brasília - DF"). Comparado literal, um
 * ponto gravado com o formato curto não casaria com a linha do NocoDB e seria
 * recriado — perdendo rota e técnico vinculados. O código sozinho já é único
 * dentro de UM + ciclo + etapa.
 */
function criarChaveComposta(p: {
  projetoId: string
  umNome: string
  ciclo: number
  etapa: number
  plusCode: string | null
}): string {
  return [p.projetoId, p.umNome, p.ciclo, p.etapa, codigoPlusCode(p.plusCode)].join("|")
}

function codigoPlusCode(plusCode: string | null): string {
  return (plusCode ?? "").trim().split(/\s+/)[0].toUpperCase()
}

/**
 * Vocabulário de status: NocoDB → app. Mapeamento 1:1:
 *
 *   Pendente   → Pendente    aguardando nova alocação
 *   Atual      → Agendado    em andamento, técnico atribuído
 *   Histórico  → Histórico   ciclo encerrado
 *
 * Vazio ou desconhecido devolve null, e a linha NÃO é importada (vai para o
 * relatório). Antes, na planilha, caía em "Pendente" — o que tornava
 * roteirizável um ponto que ninguém tinha classificado.
 */
const STATUS_POR_VALOR_DO_NOCODB: Record<string, string> = {
  pendente: "Pendente",
  atual: "Agendado",
  historico: "Histórico",
}

/** Remove acentos e caixa para casar "Histórico", "historico", "HISTÓRICO". */
function chaveStatus(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
}

function normalizarStatus(cru: string | null): string | null {
  if (!cru || !cru.trim()) return null
  return STATUS_POR_VALOR_DO_NOCODB[chaveStatus(cru)] ?? null
}

/** Ciclo/Etapa vêm como Number; null (célula vazia) vira 0, como antes. */
function inteiro(valor: number | null): number {
  return typeof valor === "number" && Number.isFinite(valor) ? Math.trunc(valor) : 0
}

/**
 * Copia do input sem latitude/longitude, para o Prisma não tocar nessas colunas
 * (campo `undefined` é ignorado no update). Usado quando o NocoDB não tem
 * coordenada e o que está gravado veio do geocoding.
 */
function semCoordenadas(input: PontoInput): Partial<PontoInput> {
  const copia: Partial<PontoInput> = { ...input }
  delete copia.latitude
  delete copia.longitude
  return copia
}

/**
 * Compara par de coordenadas com tolerância de 1e-7 grau (~1 cm), para não
 * reescrever o ponto a cada sync por diferença na última casa do double.
 */
function divergem(
  latAtual: number | null,
  latNova: number,
  lngAtual: number | null,
  lngNova: number
): boolean {
  if (latAtual === null || lngAtual === null) return true
  const TOLERANCIA = 1e-7
  return (
    Math.abs(latAtual - latNova) > TOLERANCIA ||
    Math.abs(lngAtual - lngNova) > TOLERANCIA
  )
}

function converterLinhaParaPontoInput(
  linha: LinhaLocalidade,
  projetoId: string,
  um: string,
  status: string
): PontoInput {
  const coordenadas = parsearCoordenadas(linha.Coordenadas)

  const inputSemHash = {
    projetoId,
    // Informativo: o "número da linha" agora é o Id do NocoDB.
    linhaOrigem: linha.Id,
    nocodbId: linha.Id,
    ciclo: inteiro(linha.Ciclo),
    etapa: inteiro(linha.Etapa),
    // MultiSelect: "Allan,Paulo" em linhas antigas com mais de um técnico.
    // Texto histórico, e entra no hash; o vínculo de verdade (tecnicoId) é
    // do RouteMap e a sync não o toca.
    tecnicoNomeHistorico: nomesTecnicos(linha.Tecnico).join(", "),
    // A UM vem do campo UM. Na planilha vinha do nome da aba; as abas
    // viraram views da mesma tabela.
    umNome: um,
    raNome: (linha.Cidade ?? "").trim(),
    uf: (linha.UF ?? "").trim(),
    plusCode: (linha.PlusCode ?? "").trim(),
    endereco: (linha.Endereco ?? "").trim(),
    referencia: (linha.Referencia ?? "").trim(),
    linkMaps: (linha.Link ?? "").trim(),
    latitude: coordenadas?.latitude ?? null,
    longitude: coordenadas?.longitude ?? null,
    // Já normalizado: o status entra no hash, e normalizar depois faria a
    // sync ver divergência a cada execução.
    status,
  }

  return { ...inputSemHash, hashMd5: calcularHashPonto(inputSemHash) }
}

function respostaErro(
  mensagem: string,
  status: number,
  detalhe?: string
): NextResponse<RespostaErro> {
  return NextResponse.json(
    { sucesso: false, erro: mensagem, detalhe },
    { status }
  )
}
