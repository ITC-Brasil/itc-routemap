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

/**
 * O que a coluna Json `rotas.metricas` guarda: um dicionário aberto de modos,
 * mais a âncora de chegada que gerou os números de TRANSIT.
 *
 * `ancoraIso` fica no mesmo objeto em vez de virar coluna própria porque é
 * metadado da medição, não campo de consulta — nada filtra ou ordena por ele.
 * A chave não colide com nenhum `ModoTransporte`, e nenhum consumidor itera
 * este objeto genericamente (todos indexam por modo).
 *
 * Presente só em rotas calculadas depois da âncora de chegada; em rotas
 * anteriores o campo é `undefined` e o TRANSIT daquele lote foi medido a
 * partir do instante do cálculo.
 */
export type MetricasSnapshot = Partial<Record<ModoTransporte, MetricaModo>> & {
  /** RFC 3339 com offset −03:00, ex.: "2026-09-16T08:00:00-03:00". */
  ancoraIso?: string
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

/**
 * Status de um ponto que já saiu da fila de alocação por estar em campo.
 *
 * NÃO use isto para montar destinos de cálculo. Pendente → Agendado/Atual →
 * Histórico é o ciclo de vida de uma mesma linha da planilha, e cada etapa nova
 * gera uma linha Pendente por UM: o conjunto calculável é sempre o dos
 * pendentes. Um ponto aqui é passado, não alternativa.
 *
 * A constante existe para DIAGNÓSTICO de dado legado. "Agendado" é o
 * vocabulário canônico do app — a sincronização traduz o "Atual" da planilha
 * para cá (STATUS_POR_VALOR_DA_PLANILHA em app/api/sincronizar/route.ts). Mas
 * antes dessa normalização o valor da planilha era gravado cru, então podem
 * existir pontos com status "Atual" no banco, e esses são invisíveis para
 * TODAS as queries do app (todo filtro compara com "Pendente", "Agendado" ou
 * "Histórico"). Para auditar:
 *
 *   SELECT status, COUNT(*) FROM pontos GROUP BY status ORDER BY 2 DESC;
 *
 * Havendo linhas com "Atual", elas precisam de um UPDATE para "Agendado" —
 * ninguém as enxerga hoje.
 */
export const STATUS_PONTO_OCUPADO = ["Agendado", "Atual"] as const

/** Status aceitos no cálculo: só o que está livre para alocar. */
export const STATUS_DESTINO_PADRAO = ["Pendente"] as const

// ============================================================
// HELPERS DE NEGÓCIO (puros)
// ============================================================

/**
 * Identifica o destino de uma UM para uma rota de alocação.
 *
 * Regra de negócio (definida com o cliente em 09/06/2026):
 * - Pega todos os pontos da UM cujo status esteja em `statusAceitos`
 * - Retorna o de MAIOR (ciclo, etapa) — o mais recente importado da planilha
 * - Se a UM não tem nenhum candidato, retorna null (fica fora do cálculo)
 *
 * `statusAceitos` é ponto de extensão para consumidores futuros que precisem de
 * outro recorte — auditoria, relatório, migração de dado legado. O default é o
 * único valor usado no cálculo hoje, e é o correto: só "Pendente" é alocável,
 * porque cada etapa nova gera uma linha Pendente por UM. "Histórico" e os
 * status de ponto já em campo não entram no caminho do cálculo.
 *
 * DESEMPATE: (ciclo, etapa) pode empatar — duas linhas da planilha no mesmo
 * ciclo/etapa. Antes o comparador devolvia 0 nesse caso e o vencedor saía da
 * ordem do array, que vem de `findMany()` e o Postgres não garante: o mesmo
 * cálculo, com os mesmos dados, podia escolher pontos diferentes entre
 * execuções. `criadoEm` e, por último, `id` fecham a ordenação — sempre total,
 * sempre o mesmo resultado.
 *
 * @param pontos         Lista completa de pontos
 * @param projetoId      ID do projeto-alvo
 * @param umNome         Nome da UM (ex: "BSBIA01")
 * @param statusAceitos  Status elegíveis; default: só "Pendente"
 */
export function obterDestinoDaUM(
  pontos: Ponto[],
  projetoId: string,
  umNome: string,
  statusAceitos: readonly string[] = STATUS_DESTINO_PADRAO
): Ponto | null {
  const aceitos = new Set(statusAceitos)
  const candidatos = pontos.filter(
    (p) =>
      p.projetoId === projetoId &&
      p.umNome === umNome &&
      aceitos.has(p.status)
  )

  if (candidatos.length === 0) return null

  // Ordena (ciclo desc, etapa desc, criadoEm desc, id asc) e pega o primeiro
  candidatos.sort(compararCandidatosDestino)

  return candidatos[0]
}

/**
 * Comparador total de pontos candidatos a destino: (ciclo, etapa) decrescente,
 * `criadoEm` decrescente como terceiro critério e `id` como desempate final.
 *
 * `id` é o que garante determinismo de verdade — `criadoEm` também empata
 * quando dois pontos entram na mesma sincronização, e é nulo em rotas antigas.
 */
function compararCandidatosDestino(a: Ponto, b: Ponto): number {
  if (b.ciclo !== a.ciclo) return b.ciclo - a.ciclo
  if (b.etapa !== a.etapa) return b.etapa - a.etapa

  const tempoA = a.criadoEm?.getTime() ?? 0
  const tempoB = b.criadoEm?.getTime() ?? 0
  if (tempoB !== tempoA) return tempoB - tempoA

  return a.id.localeCompare(b.id)
}

/**
 * Retorna {umNome → ponto destino} para todas as UMs de um projeto que estão
 * aptas ao cálculo, segundo `statusAceitos` (default: têm ao menos um Pendente).
 *
 * Útil pra montar a UI de seleção: lista de UMs com seu destino atual visível.
 */
export function obterDestinosPorUM(
  pontos: Ponto[],
  projetoId: string,
  statusAceitos: readonly string[] = STATUS_DESTINO_PADRAO
): Map<string, Ponto> {
  const umsDoProjeto = new Set(
    pontos.filter((p) => p.projetoId === projetoId).map((p) => p.umNome)
  )

  const resultado = new Map<string, Ponto>()
  for (const um of umsDoProjeto) {
    const destino = obterDestinoDaUM(pontos, projetoId, um, statusAceitos)
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
  // Mesmo comparador total do fluxo principal: empate de (ciclo, etapa) não
  // pode cair na ordem que o Postgres devolveu.
  candidatos.sort(compararCandidatosDestino)
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
