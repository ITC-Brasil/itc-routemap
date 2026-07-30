import { NextResponse } from "next/server"
import { exigirSessaoApi } from "@/lib/session-server"
import {
  lerLinhasDeAbas,
  consolidarLinhas,
  type LinhaComAba,
  type ResultadoLeituraAba,
} from "@/lib/google-sheets"
import {
  buscarProjetoAdmin,
  listarPontosPorProjetoAdmin,
  criarPontoAdmin,
  atualizarPontoAdmin,
  deletarPontosEmBatchPreservandoEmUsoAdmin,
  marcarSincronizacaoAdmin,
  calcularHashPonto,
} from "@/lib/db/pontos"
import type { Ponto, PontoInput } from "@/lib/db/pontos"

// ============================================================
// TIPOS DE RESPOSTA
// ============================================================

/**
 * Resumo por aba sincronizada.
 * Útil pra UI mostrar status de cada UM (1 aba = 1 UM no nosso modelo).
 */
type ResumoAba = {
  nomeAba: string
  totalLinhas: number
  erro: string | null
}

/** Linha cujo Status não foi reconhecido — entrou como "Pendente". */
type AvisoStatus = {
  aba: string
  linha: number
  statusCru: string
}

/** Linha sem Plus Code — não pôde ser identificada e foi pulada. */
type AvisoSemPlusCode = {
  aba: string
  linha: number
  cidade: string
}

type RelatorioSync = {
  sucesso: true
  totalLinhasPlanilha: number
  novos: number
  atualizados: number
  deletados: number
  /** Pontos que sumiram da planilha mas estavam em uso: viraram "Histórico". */
  preservados: number
  ignorados: number
  abas: ResumoAba[]
  /** Status desconhecidos encontrados (não bloqueiam a sincronização). */
  avisosStatus: AvisoStatus[]
  /** Linhas puladas por não terem Plus Code (sem ele não há identidade). */
  avisosSemPlusCode: AvisoSemPlusCode[]
  duracao: number  // milissegundos
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
 * Sincroniza pontos do Firestore com TODAS as abas configuradas
 * no projeto. Cada aba representa tipicamente uma UM.
 *
 * Algoritmo (PRD seção 8):
 *   1. Lê o projeto (URL da planilha + lista de abas)
 *   2. Lê todas as abas em paralelo
 *   3. Para cada linha: cria/atualiza/ignora baseado em hash MD5
 *   4. Detecta pontos deletados (no Firestore mas não na planilha)
 *   5. Retorna relatório consolidado
 */
export async function POST(request: Request) {
  // Blindagem: sessao obrigatoria ANTES de qualquer escrita no banco ou
  // chamada paga a API externa.
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

    if (!projeto.sheetId) {
      return respostaErro(
        "Este projeto não tem planilha configurada. Edite e informe a URL.",
        400
      )
    }

    if (!projeto.sheetAbas || projeto.sheetAbas.length === 0) {
      return respostaErro(
        "Este projeto não tem abas configuradas. Edite e adicione pelo menos uma.",
        400
      )
    }

    // 3. LER TODAS AS ABAS EM PARALELO
    let resultados: ResultadoLeituraAba[]
    try {
      resultados = await lerLinhasDeAbas(projeto.sheetId, projeto.sheetAbas)
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : String(err)
      return respostaErro("Erro ao ler a planilha.", 400, mensagem)
    }

    // Se TODAS as abas falharam, retorna erro
    const todasComErro = resultados.every((r) => r.erro !== null)
    if (todasComErro) {
      const primeiroErro = resultados.find((r) => r.erro)?.erro
      return respostaErro(
        "Nenhuma aba pôde ser lida.",
        400,
        primeiroErro ?? "Erro desconhecido."
      )
    }

    // Consolida linhas de todas as abas bem-sucedidas
    const todasLinhas = consolidarLinhas(resultados)

    // 4. BUSCAR PONTOS EXISTENTES NO FIRESTORE
    const pontosExistentes = await listarPontosPorProjetoAdmin(projetoId)

    // 5. INDEXAR PELA CHAVE NATURAL DO PONTO
    const mapaExistentes = new Map<string, Ponto>()
    for (const p of pontosExistentes) {
      mapaExistentes.set(criarChaveComposta(p), p)
    }

    // 6. PROCESSAR LINHAS
    let novos = 0
    let atualizados = 0
    let ignorados = 0
    const avisosStatus: AvisoStatus[] = []
    const avisosSemPlusCode: AvisoSemPlusCode[] = []
    const chavesPresentes = new Set<string>()

    for (const linha of todasLinhas) {
      // Sem Plus Code não existe identidade: a linha seria indistinguível de
      // outra da mesma UM no mesmo ciclo/etapa. Pular e avisar é melhor que
      // deixar a chave degradar em silêncio e fundir dois pontos em um.
      if (!linha.plusCode.trim()) {
        avisosSemPlusCode.push({
          aba: linha.abaOrigem,
          linha: linha.numeroLinha,
          cidade: linha.cidade,
        })
        ignorados++
        continue
      }

      const inputCompleto = converterLinhaParaPontoInput(linha, projetoId, avisosStatus)
      if (!inputCompleto) {
        ignorados++
        continue
      }

      const chave = criarChaveComposta(inputCompleto)
      chavesPresentes.add(chave)

      const existente = mapaExistentes.get(chave)

      if (!existente) {
        // NOVO: nunca esteve no Firestore
        await criarPontoAdmin(inputCompleto)
        novos++
      } else if (existente.hashMd5 !== inputCompleto.hashMd5) {
        // ALTERADO: hash mudou
        await atualizarPontoAdmin(existente.id, inputCompleto)
        atualizados++
      }
      // Hash igual: já sincronizado, nada a fazer
    }

    // 7. DETECTAR DELETADOS
    // Pontos que estão no banco mas NÃO estão mais na planilha. Os que estiverem
    // em uso (com rota ou "Agendado") são preservados como "Histórico".
    const idsParaDeletar: string[] = []
    for (const p of pontosExistentes) {
      if (!chavesPresentes.has(criarChaveComposta(p))) {
        idsParaDeletar.push(p.id)
      }
    }

    const { deletados, preservados } =
      await deletarPontosEmBatchPreservandoEmUsoAdmin(idsParaDeletar)

    // 8. ATUALIZAR TIMESTAMP DE SYNC
    await marcarSincronizacaoAdmin(projetoId)

    // 9. MONTAR RELATÓRIO
    const abasResumo: ResumoAba[] = resultados.map((r) => ({
      nomeAba: r.nomeAba,
      totalLinhas: r.linhas.length,
      erro: r.erro,
    }))

    const relatorio: RelatorioSync = {
      sucesso: true,
      totalLinhasPlanilha: todasLinhas.length,
      novos,
      atualizados,
      deletados,
      preservados: preservados.length,
      ignorados,
      abas: abasResumo,
      avisosStatus,
      avisosSemPlusCode,
      duracao: Date.now() - inicio,
    }

    if (avisosStatus.length > 0) {
      console.warn(
        `Sincronizacao: ${avisosStatus.length} linha(s) com Status desconhecido (entraram como "Pendente"):`,
        avisosStatus.map((a) => `${a.aba}!L${a.linha}="${a.statusCru}"`).join(", ")
      )
    }

    if (avisosSemPlusCode.length > 0) {
      console.warn(
        `Sincronizacao: ${avisosSemPlusCode.length} linha(s) PULADA(S) por falta de Plus Code:`,
        avisosSemPlusCode.map((a) => `${a.aba}!${a.linha} (${a.cidade})`).join(", ")
      )
    }

    // Sempre logado, mesmo quando zero: a preservação é a evidência de que a
    // guarda impediu uma deleção destrutiva.
    console.info(
      `Sincronizacao ${projeto.sigla}: ${deletados} ponto(s) deletado(s), ` +
        `${preservados.length} preservado(s) como "Historico"` +
        (preservados.length > 0 ? ` [${preservados.join(", ")}]` : "")
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
 * Chave natural do ponto: projetoId + umNome + ciclo + etapa + plusCode.
 *
 * Era `umNome + linhaOrigem` — a POSIÇÃO da linha na aba. Isso quebrava na
 * operação normal: inserir uma etapa no meio da aba desloca todas as linhas
 * seguintes, e cada ponto deslocado era lido como "a linha antiga sumiu" +
 * "apareceu uma linha nova". A sincronização deletava e recriava a aba inteira,
 * perdendo os vínculos de rota.
 *
 * `plusCode` entra na chave porque sem ele há 5 pares de visitas legítimas
 * indistinguíveis nos dados de produção (duas visitas à mesma cidade na mesma
 * etapa, em locais diferentes). Com ele a chave é única nos 131 pontos, dos dois
 * lados. O custo é que corrigir um Plus Code recria o ponto — evento raro, e que
 * já altera o hash hoje.
 *
 * Ex: "abc123|BSBIA01|2|7|3WWH+977"
 */
function criarChaveComposta(p: {
  projetoId: string
  umNome: string
  ciclo: number
  etapa: number
  plusCode: string
}): string {
  return [p.projetoId, p.umNome, p.ciclo, p.etapa, p.plusCode.trim()].join("|")
}

/**
 * Converte uma linha bruta consolidada (com aba origem) em PontoInput.
 * Retorna null se a linha estiver com dados essenciais faltando.
 */
/**
 * Vocabulário de status: planilha → app. Mapeamento 1:1, três estados de cada
 * lado (confirmado com o cliente em 2026-07-28):
 *
 *   Pendente   → Pendente    aguardando nova alocação
 *   Atual      → Agendado    em andamento, técnico atribuído
 *   Histórico  → Histórico    ciclo encerrado
 *
 * O ciclo operacional é: confirma a rota no app → o app grava "Agendado" → a
 * planilha é marcada como "Atual" e a linha anterior vira "Histórico".
 *
 * Antes desta normalização o valor da planilha era gravado CRU, então "Atual"
 * entrava literalmente em `Ponto.status` — um estado que nenhuma query do app
 * reconhece (`obterDestinoDaUM` e `listarPontosPendentesSemCoordenadas` filtram
 * "Pendente"; `cancelarLote` filtra "Agendado"). Eram pontos invisíveis.
 */
const STATUS_POR_VALOR_DA_PLANILHA: Record<string, string> = {
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

/**
 * Traduz o Status da planilha para o vocabulário do app.
 *
 * Valor desconhecido cai em "Pendente" (o mesmo default de célula vazia) e gera
 * aviso no relatório: "Pendente" é o estado seguro — o ponto continua visível
 * para roteirização e alguém percebe. Mandar para "Histórico" faria o ponto
 * desaparecer em silêncio, e abortar a sincronização seria severo demais para
 * um erro de digitação numa célula.
 */
function normalizarStatus(
  cru: string,
  aba: string,
  numeroLinha: number,
  avisos: AvisoStatus[]
): string {
  if (!cru.trim()) return "Pendente"
  const conhecido = STATUS_POR_VALOR_DA_PLANILHA[chaveStatus(cru)]
  if (conhecido) return conhecido
  avisos.push({ aba, linha: numeroLinha, statusCru: cru })
  return "Pendente"
}

function converterLinhaParaPontoInput(
  linha: LinhaComAba,
  projetoId: string,
  avisosStatus: AvisoStatus[]
): PontoInput | null {
  // Validação mínima: precisa ter cidade ou plus code ou endereço
  if (!linha.cidade && !linha.plusCode && !linha.endereco) {
    return null
  }

  const ciclo = parseInt(linha.ciclo) || 0
  const etapa = parseInt(linha.etapa) || 0
  const latitude = linha.latitude ? parseFloat(linha.latitude) : null
  // Coluna N. Antes era `longitude: null` fixo (esquecimento, não decisão — ver
  // lib/google-sheets.ts): a latitude vinha da planilha e a longitude não, então
  // todo ponto sincronizado ficava "sem coordenadas" para o batch de geocoding.
  const longitude = linha.longitude ? parseFloat(linha.longitude) : null

  // umNome vem da ABA ORIGEM (ex: "BSBIA01"), não do campo F da planilha.
  // Isso é importante: a aba é a fonte de verdade pra identificação da UM.
  const inputSemHash = {
    projetoId,
    // Informativo (aparece na UI e ajuda a achar a linha na planilha). Não entra
    // na chave de identidade nem no hash — ver criarChaveComposta.
    linhaOrigem: linha.numeroLinha,
    ciclo,
    etapa,
    tecnicoNomeHistorico: linha.tecnico,
    umNome: linha.abaOrigem,
    raNome: linha.cidade,
    uf: linha.uf,
    plusCode: linha.plusCode,
    endereco: linha.endereco,
    referencia: linha.referencia,
    linkMaps: linha.link,
    latitude: !isNaN(latitude ?? NaN) ? latitude : null,
    longitude: !isNaN(longitude ?? NaN) ? longitude : null,
    // Normalizado ANTES do calcularHashPonto (logo abaixo): o status é o 13º
    // campo do hash, então normalizar depois faria a sync ver divergência a cada
    // execução e reescrever o ponto indefinidamente.
    status: normalizarStatus(linha.status, linha.abaOrigem, linha.numeroLinha, avisosStatus),
  }

  const hashMd5 = calcularHashPonto(inputSemHash)

  return {
    ...inputSemHash,
    hashMd5,
  }
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