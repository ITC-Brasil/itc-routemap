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
  deletarPontosEmBatchAdmin,
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

type RelatorioSync = {
  sucesso: true
  totalLinhasPlanilha: number
  novos: number
  atualizados: number
  deletados: number
  ignorados: number
  abas: ResumoAba[]
  /** Status desconhecidos encontrados (não bloqueiam a sincronização). */
  avisosStatus: AvisoStatus[]
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

    // 5. INDEXAR POR (abaOrigem + linhaOrigem) — chave composta única
    // Por que composta? Várias abas podem ter o mesmo numeroLinha (linha 2, 3...)
    // — só ficam distintos quando combinados com o nome da aba.
    const mapaExistentes = new Map<string, Ponto>()
    for (const p of pontosExistentes) {
      mapaExistentes.set(criarChaveComposta(p.umNome, p.linhaOrigem), p)
    }

    // 6. PROCESSAR LINHAS
    let novos = 0
    let atualizados = 0
    let ignorados = 0
    const avisosStatus: AvisoStatus[] = []
    const chavesPresentes = new Set<string>()

    for (const linha of todasLinhas) {
      const inputCompleto = converterLinhaParaPontoInput(linha, projetoId, avisosStatus)
      if (!inputCompleto) {
        ignorados++
        continue
      }

      // Chave composta: aba + linha (ex: "BSBIA01:2")
      const chave = criarChaveComposta(linha.abaOrigem, linha.numeroLinha)
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
    // Pontos que estão no Firestore mas NÃO estão mais na planilha
    const idsParaDeletar: string[] = []
    for (const p of pontosExistentes) {
      const chave = criarChaveComposta(p.umNome, p.linhaOrigem)
      if (!chavesPresentes.has(chave)) {
        idsParaDeletar.push(p.id)
      }
    }

    if (idsParaDeletar.length > 0) {
      await deletarPontosEmBatchAdmin(idsParaDeletar)
    }

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
      deletados: idsParaDeletar.length,
      ignorados,
      abas: abasResumo,
      avisosStatus,
      duracao: Date.now() - inicio,
    }

    if (avisosStatus.length > 0) {
      console.warn(
        `Sincronizacao: ${avisosStatus.length} linha(s) com Status desconhecido (entraram como "Pendente"):`,
        avisosStatus.map((a) => `${a.aba}!L${a.linha}="${a.statusCru}"`).join(", ")
      )
    }

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
 * Cria uma chave única combinando o nome da UM/aba com o número da linha.
 *
 * Necessária porque o mesmo numeroLinha pode existir em várias abas
 * (toda planilha começa na linha 2). Sem essa combinação, daria conflito.
 *
 * Ex: criarChaveComposta("BSBIA01", 2) === "BSBIA01:2"
 */
function criarChaveComposta(umNome: string, numeroLinha: number): string {
  return `${umNome}:${numeroLinha}`
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