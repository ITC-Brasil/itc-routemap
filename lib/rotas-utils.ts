import type { Ponto } from "@/lib/db/pontos"

/**
 * Tipos e helpers puros de rotas/alocação — client-safe.
 *
 * NOTA DE MIGRAÇÃO: extraídos de lib/firestore/rotas.ts para que client
 * components (ex.: calcular-rotas/page.tsx usa obterDestinosPorUM e
 * gerarLoteId) possam continuar importando depois que o CRUD migrar para
 * lib/db/rotas.ts, que é server-only. O import de Ponto é type-only
 * (apagado na compilação), então não dispara o guardrail do server-only.
 */

// ============================================================
// TIPOS
// ============================================================

/**
 * Modos de transporte suportados pelo Google Routes API.
 *
 * - DRIVE / TWO_WHEELER / WALK / BICYCLE: suportados pelo Compute Route Matrix
 * - TRANSIT (transporte público): SÓ no Compute Routes (single), precisa
 *   ser chamado um por par origem→destino, mais custoso
 */
export type ModoTransporte =
  | "DRIVE"
  | "TWO_WHEELER"
  | "WALK"
  | "BICYCLE"
  | "TRANSIT"

/** Métricas de deslocamento de um único modo de transporte. */
export type MetricaModo = {
  distanciaMetros: number
  duracaoSegundos: number
  observacao?: string // ex: "Sem rota viável" / "Inclui pedágio"
}

/** Ciclo de vida de uma rota. */
export type StatusRota = "Sugerida" | "Confirmada" | "Cancelada"

/**
 * Origem da decisão de uma rota (13.11 — Alocação Manual).
 *
 * - "auto"            → 100% do algoritmo Húngaro, sem alteração humana
 * - "ajuste-pos-auto" → algoritmo sugeriu, usuário ajustou 1+ pares antes de confirmar
 * - "manual"          → reservado pra futura modalidade onde usuário monta do zero
 *
 * Decisão de design: aplicado por LOTE, não por par. Se qualquer par do lote
 * foi ajustado, todas as rotas do lote ganham "ajuste-pos-auto". Suficiente
 * pro caso de uso (badge no histórico) e simples de manter.
 */
export type OrigemDecisao = "auto" | "manual" | "ajuste-pos-auto"

// ============================================================
// CONSTANTES
// ============================================================

/**
 * Status "Agendado" no `Ponto`: indica que ele está vinculado a uma rota
 * Confirmada. Quando uma nova etapa começa (manual ou via sync), o ponto
 * transiciona pra "Histórico".
 */
export const STATUS_PONTO_AGENDADO = "Agendado"

// ============================================================
// HELPERS DE NEGÓCIO (puros)
// ============================================================

/**
 * Identifica o destino de uma UM para uma rota de alocação.
 *
 * Regra de negócio (definida com o cliente em 09/06/2026):
 * - Pega todos os pontos da UM com status "Pendente"
 * - Retorna o de MAIOR (ciclo, etapa) — o mais recente importado
 *   da planilha, ainda sem técnico atribuído
 * - Se a UM não tem Pendente, retorna null (UM fica fora do cálculo)
 *
 * @param pontos     Lista completa de pontos
 * @param projetoId  ID do projeto-alvo
 * @param umNome     Nome da UM (ex: "BSBIA01")
 */
export function obterDestinoDaUM(
  pontos: Ponto[],
  projetoId: string,
  umNome: string
): Ponto | null {
  const candidatos = pontos.filter(
    (p) =>
      p.projetoId === projetoId &&
      p.umNome === umNome &&
      p.status === "Pendente"
  )

  if (candidatos.length === 0) return null

  // Ordena (ciclo desc, etapa desc) e pega o primeiro
  candidatos.sort((a, b) => {
    if (b.ciclo !== a.ciclo) return b.ciclo - a.ciclo
    return b.etapa - a.etapa
  })

  return candidatos[0]
}

/**
 * Retorna {umNome → ponto destino} para todas as UMs de um projeto que
 * estão aptas ao cálculo (têm pelo menos um Pendente).
 *
 * Útil pra montar a UI de seleção: lista de UMs com seu destino atual visível.
 */
export function obterDestinosPorUM(
  pontos: Ponto[],
  projetoId: string
): Map<string, Ponto> {
  const umsDoProjeto = new Set(
    pontos.filter((p) => p.projetoId === projetoId).map((p) => p.umNome)
  )

  const resultado = new Map<string, Ponto>()
  for (const um of umsDoProjeto) {
    const destino = obterDestinoDaUM(pontos, projetoId, um)
    if (destino) resultado.set(um, destino)
  }
  return resultado
}

/**
 * Retorna o ponto destino de uma UM considerando status realocáveis:
 * Pendente, Agendado ou Atual — exclui Histórico.
 *
 * 13.12 Re-otimização: usado pra incluir pontos de técnicos com rotas ativas
 * no cálculo de re-otimização.
 */
export function obterDestinoRealocavelDaUM(
  pontos: Ponto[],
  projetoId: string,
  umNome: string
): Ponto | null {
  const STATUS_REALOCAVEIS = new Set(["Pendente", "Agendado", "Atual"])
  const candidatos = pontos.filter(
    (p) =>
      p.projetoId === projetoId &&
      p.umNome === umNome &&
      STATUS_REALOCAVEIS.has(p.status)
  )
  if (candidatos.length === 0) return null
  candidatos.sort((a, b) => {
    if (b.ciclo !== a.ciclo) return b.ciclo - a.ciclo
    return b.etapa - a.etapa
  })
  return candidatos[0]
}

/**
 * Retorna {umNome → ponto destino} para todas as UMs de um projeto que
 * têm ao menos um ponto realocável (Pendente, Agendado ou Atual).
 *
 * 13.12 Re-otimização: escopo mais amplo que obterDestinosPorUM.
 */
export function obterDestinosRealocaveisPorUM(
  pontos: Ponto[],
  projetoId: string
): Map<string, Ponto> {
  const umsDoProjeto = new Set(
    pontos.filter((p) => p.projetoId === projetoId).map((p) => p.umNome)
  )
  const resultado = new Map<string, Ponto>()
  for (const um of umsDoProjeto) {
    const destino = obterDestinoRealocavelDaUM(pontos, projetoId, um)
    if (destino) resultado.set(um, destino)
  }
  return resultado
}

/**
 * Gera um ID de lote (UUID v4).
 * Disponível em browsers modernos e Node 14.17+.
 */
export function gerarLoteId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback (improvável no nosso ambiente, mas safe)
  return (
    Math.random().toString(36).slice(2) + Date.now().toString(36)
  )
}
