import "server-only"

import { prisma } from "@/lib/prisma"
import {
  listarRotas,
  listarRotasPorLote,
  type Rota,
} from "@/lib/db/rotas"
import type { ModoTransporte, OrigemDecisao } from "@/lib/rotas-utils"

/**
 * Camada de "lotes de alocação".
 *
 * Um lote não é uma tabela própria — é uma agregação derivada da tabela
 * `rotas`, agrupada pelo campo `loteId`. Esta abordagem (aggregation em
 * memória) é simples e funciona bem até ~1000 rotas. Se o volume crescer,
 * migrar pra tabela `lotes` materializada na confirmação da alocação.
 *
 * Lotes com APENAS rotas `Sugerida` (rascunhos) são excluídos do histórico.
 * Só entram lotes que tem pelo menos uma rota Confirmada ou Cancelada.
 *
 * NOTAS DE MIGRAÇÃO (vs lib/firestore/lotes.ts):
 * - cancelarLote: writeBatch → prisma.$transaction. A guarda de 450
 *   operações era limitação do Firestore e foi removida — Postgres não
 *   tem esse teto.
 * - O filtro "só libera pontos Agendados" saiu do read-then-write e foi
 *   para o WHERE do updateMany — mesma idempotência, mais atômico.
 */

// ============================================================
// TIPOS
// ============================================================

export type StatusLote = "Confirmada" | "Cancelada" | "Mista"

export type LoteSumario = {
  loteId: string
  /** Data de criação do lote (= data da rota mais antiga relevante do lote). */
  dataConfirmacao: Date
  qtdRotas: number
  qtdRotasConfirmadas: number
  qtdRotasCanceladas: number
  /** Total de pontos atendidos no lote (= qtdRotas, já que 1 rota = 1 ponto). */
  qtdPontos: number
  /** Nomes distintos de técnicos envolvidos, ordenados alfabeticamente. */
  tecnicosNomes: string[]
  /** Nomes distintos de UMs atendidas, ordenados alfabeticamente. */
  umsNomes: string[]
  /** Modo de transporte que aparece em mais rotas do lote. */
  modoPredominante: ModoTransporte
  /** Soma de duracaoSegundos do modoPrincipal de cada rota. */
  tempoTotalSegundos: number
  /** Soma de distanciaMetros do modoPrincipal de cada rota. */
  distanciaTotalMetros: number
  statusLote: StatusLote
  /**
   * 13.11: Como o lote foi formado.
   * Todas as rotas de um mesmo lote têm a mesma origemDecisao (design do bloco 1).
   * "auto" = veio do algoritmo sem ajuste; "ajuste-pos-auto" = teve swap manual antes
   * de confirmar; "manual" = reservado pra futura modalidade.
   */
  origemDecisao: OrigemDecisao
  /**
   * 13.12: true quando ao menos uma rota do lote substituiu uma rota anterior
   * (campo realocadaDe preenchido). Usado pra exibir badge "Re-otimização"
   * no card do histórico.
   */
  temRealocacoes: boolean
  /** Justificativa da IA (pega da 1ª rota — todas do lote têm a mesma). */
  justificativaGemini?: string
  /** IDs distintos de projetos atendidos no lote. */
  projetoIds: string[]
}

export type ResultadoCancelamento = {
  rotasCanceladas: number
  pontosLiberados: number
}

// ============================================================
// LEITURA
// ============================================================

/**
 * Lê todas as rotas, agrupa por loteId, retorna sumários ordenados por
 * data desc (mais recentes primeiro).
 *
 * Lotes que só têm rotas Sugerida (rascunho) são descartados.
 */
export async function listarLotes(): Promise<LoteSumario[]> {
  const rotas = await listarRotas() // já ordenado por criadoEm desc

  const grupos = new Map<string, Rota[]>()
  for (const rota of rotas) {
    if (!rota.loteId) continue
    const lista = grupos.get(rota.loteId) ?? []
    lista.push(rota)
    grupos.set(rota.loteId, lista)
  }

  const lotes: LoteSumario[] = []
  for (const [loteId, rotasDoLote] of grupos) {
    const sumario = sumarizarLote(loteId, rotasDoLote)
    if (sumario) lotes.push(sumario)
  }

  return lotes.sort(
    (a, b) => b.dataConfirmacao.getTime() - a.dataConfirmacao.getTime()
  )
}

/**
 * Re-exporta `listarRotasPorLote` do módulo rotas.ts, pra os componentes
 * de histórico não precisarem importar de 2 lugares diferentes.
 */
export { listarRotasPorLote as obterRotasDoLote }

// ============================================================
// CANCELAMENTO ATÔMICO
// ============================================================

/**
 * Cancela todas as rotas Confirmadas de um lote e libera os pontos
 * (Agendado → Pendente) em uma única transação atômica.
 *
 * Idempotente: rotas já Canceladas e pontos que não estão Agendados
 * são ignorados silenciosamente.
 */
export async function cancelarLote(
  loteId: string
): Promise<ResultadoCancelamento> {
  return prisma.$transaction(async (tx) => {
    // 1. Busca as rotas ativas do lote
    const rotasAtivas = await tx.rota.findMany({
      where: { loteId, status: "Confirmada" },
      select: { id: true, pontoId: true },
    })

    if (rotasAtivas.length === 0) {
      throw new Error("Nenhuma rota ativa pra cancelar neste lote.")
    }

    // 2. Coleta pontoIds únicos das rotas ativas (1 ponto por rota)
    const pontoIds = Array.from(
      new Set(rotasAtivas.map((r) => r.pontoId).filter(Boolean))
    )

    // 3. Cancela as rotas ativas
    await tx.rota.updateMany({
      where: { id: { in: rotasAtivas.map((r) => r.id) } },
      data: { status: "Cancelada" },
    })

    // 4. Libera apenas os pontos que estão Agendados (idempotência)
    const { count: pontosLiberados } = await tx.ponto.updateMany({
      where: { id: { in: pontoIds }, status: "Agendado" },
      data: {
        status: "Pendente",
        tecnicoId: null,
        rotaId: null,
      },
    })

    return {
      rotasCanceladas: rotasAtivas.length,
      pontosLiberados,
    }
  })
}

// ============================================================
// AGREGAÇÃO (interna)
// ============================================================

/**
 * Resume um conjunto de rotas (todas com o mesmo loteId) em um LoteSumario.
 * Retorna null se o lote só tiver rotas Sugerida (= rascunho, não vai pro histórico).
 */
function sumarizarLote(loteId: string, rotas: Rota[]): LoteSumario | null {
  const confirmadas = rotas.filter((r) => r.status === "Confirmada")
  const canceladas = rotas.filter((r) => r.status === "Cancelada")
  const relevantes = [...confirmadas, ...canceladas]

  // Lote só com Sugeridas → descarta do histórico
  if (relevantes.length === 0) return null

  let statusLote: StatusLote
  if (canceladas.length === 0) statusLote = "Confirmada"
  else if (confirmadas.length === 0) statusLote = "Cancelada"
  else statusLote = "Mista"

  // Data: usa a rota mais antiga das relevantes
  const datas = relevantes
    .map((r) => r.criadoEm)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime())
  const dataConfirmacao = datas[0] ?? new Date()

  const tecnicosNomes = Array.from(
    new Set(relevantes.map((r) => r.tecnicoNome).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, "pt-BR"))

  const umsNomes = Array.from(
    new Set(relevantes.map((r) => r.umNome).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, "pt-BR"))

  // Modo predominante: conta ocorrências de modoPrincipal, pega o mais frequente
  const modoCount = new Map<ModoTransporte, number>()
  for (const r of relevantes) {
    if (!r.modoPrincipal) continue
    modoCount.set(r.modoPrincipal, (modoCount.get(r.modoPrincipal) ?? 0) + 1)
  }
  const modoPredominante =
    (Array.from(modoCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ??
      "DRIVE") as ModoTransporte

  // Tempo e distância: somar de metricas[modoPrincipal] de cada rota
  let tempoTotalSegundos = 0
  let distanciaTotalMetros = 0
  for (const r of relevantes) {
    const metrica = r.metricas[r.modoPrincipal]
    if (metrica) {
      tempoTotalSegundos += metrica.duracaoSegundos ?? 0
      distanciaTotalMetros += metrica.distanciaMetros ?? 0
    }
  }

  const projetoIds = Array.from(
    new Set(
      relevantes
        .map((r) => r.projetoId)
        .filter((id): id is string => !!id)
    )
  )

  // 13.11: origemDecisao do lote — pega da primeira rota.
  // Todas as rotas de um mesmo lote têm a mesma origemDecisao (design do bloco 1).
  // Fallback "auto" pra rotas antigas pré-13.11 que não têm o campo no banco.
  const origemDecisao: OrigemDecisao = relevantes[0]?.origemDecisao ?? "auto"

  // 13.12: true se qualquer rota do lote substituiu uma rota anterior.
  const temRealocacoes = relevantes.some((r) => r.realocadaDe !== null)

  // Justificativa: todas as rotas do lote compartilham. Pega da primeira.
  const justificativa = relevantes[0]?.loteJustificativa
  const justificativaGemini =
    justificativa && justificativa.trim().length > 0 ? justificativa : undefined

  return {
    loteId,
    dataConfirmacao,
    qtdRotas: relevantes.length,
    qtdRotasConfirmadas: confirmadas.length,
    qtdRotasCanceladas: canceladas.length,
    qtdPontos: relevantes.length, // 1 rota = 1 ponto
    tecnicosNomes,
    umsNomes,
    modoPredominante,
    tempoTotalSegundos,
    distanciaTotalMetros,
    statusLote,
    origemDecisao,
    temRealocacoes,
    justificativaGemini,
    projetoIds,
  }
}
