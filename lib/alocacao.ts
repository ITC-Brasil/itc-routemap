import munkres from "munkres-js"
import type { ModoTransporte } from "@/lib/firestore/rotas"

// ============================================================
// TIPOS
// ============================================================

/**
 * Linha de uma matriz de deslocamento (formato retornado pela
 * API /api/routes/matrix).
 */
export type LinhaMatrizDeslocamento = {
  origemId: string
  destinoId: string
  metricas: Partial<Record<ModoTransporte, MetricaDeslocamento>>
}

type MetricaDeslocamento = {
  distanciaMetros: number
  duracaoSegundos: number
}

/** Resultado da alocação ótima. */
export type ResultadoAlocacao = {
  /** Pares técnico → destino, em ordem do menor custo pro maior. */
  alocacoes: Array<{
    tecnicoId: string
    destinoId: string
    custo: number // duração em segundos no modo do técnico
    modoEfetivo: ModoTransporte
  }>
  /** Técnicos que não receberam destino (sobra de N > M ou rotas inviáveis). */
  tecnicosNaoAlocados: string[]
  /** Destinos que não receberam técnico (sobra de M > N ou rotas inviáveis). */
  destinosNaoAlocados: string[]
  /** Soma dos custos de todas as alocações reais. */
  custoTotal: number
  /** Média do custo entre as alocações reais. */
  custoMedio: number
}

// ============================================================
// CONSTANTES
// ============================================================

/**
 * Valor de "infinito prático" pra pares sem rota viável.
 * Suficientemente grande pra nunca ser preferido sobre uma alocação real,
 * mas finito pra não quebrar implementações do algoritmo que esperam números.
 */
const CUSTO_INFINITO = 1e9

/**
 * Fator de penalidade por distância residencial — regra de negócio ITC:
 * "o técnico deve preferencialmente ir para a UM mais próxima da sua casa".
 *
 * Para cada técnico, suas UMs candidatas são ordenadas por custo crescente
 * (rank 0 = mais próxima, rank 1 normalizado = mais distante). O custo
 * ajustado na matriz é:
 *   custo_original * (1 + PESO_PROXIMIDADE * rank_normalizado)
 *
 * Com 0.3: a UM mais distante de um técnico fica até 30% mais cara, fazendo
 * o Húngaro preferir fortemente pares residência-próximos sem eliminar a
 * otimização global quando necessária.
 *
 * Aumente se a operação quiser prioridade ainda mais rígida por proximidade;
 * diminua se houver muitos casos em que a distância residencial é irrelevante.
 */
export const PESO_PROXIMIDADE = 0.3

// ============================================================
// FUNÇÃO PRINCIPAL
// ============================================================

/**
 * Resolve a alocação ótima de técnicos para destinos minimizando o
 * tempo total de deslocamento do time.
 *
 * Usa o algoritmo Húngaro (Kuhn-Munkres) que, em O(n³), encontra a
 * solução matematicamente ótima — não é heurística.
 *
 * Suporta matrizes não-quadradas:
 *   - Mais técnicos que destinos → alguns técnicos ficam sem alocação
 *   - Mais destinos que técnicos → alguns destinos ficam sem técnico
 *
 * @param matriz           Saída de /api/routes/matrix (todos pares calculados)
 * @param tecnicoIds       IDs dos técnicos a alocar
 * @param destinoIds       IDs dos destinos (pontos)
 * @param modosPorTecnico  Modo de transporte de cada técnico (default "DRIVE")
 */
export function resolverAlocacao(
  matriz: LinhaMatrizDeslocamento[],
  tecnicoIds: string[],
  destinoIds: string[],
  modosPorTecnico: Map<string, ModoTransporte>
): ResultadoAlocacao {
  const N = tecnicoIds.length
  const M = destinoIds.length

  // Edge case: lista vazia
  if (N === 0 || M === 0) {
    return {
      alocacoes: [],
      tecnicosNaoAlocados: [...tecnicoIds],
      destinosNaoAlocados: [...destinoIds],
      custoTotal: 0,
      custoMedio: 0,
    }
  }

  // 1. Lookup rápido (tecnicoId, destinoId) → custo (segundos no modo do técnico)
  const custoLookup = new Map<string, number>()
  for (const linha of matriz) {
    const modo = modosPorTecnico.get(linha.origemId) ?? "DRIVE"
    const metrica = linha.metricas[modo]
    if (metrica) {
      custoLookup.set(
        chaveCusto(linha.origemId, linha.destinoId),
        metrica.duracaoSegundos
      )
    }
  }

  // 1b. Aplica fator de proximidade residencial (regra de negócio ITC).
  //     Para cada técnico, rankeia os destinos por custo crescente e penaliza
  //     os mais distantes: custo_ajustado = custo * (1 + PESO * rank_norm).
  //     Pares sem rota viável (CUSTO_INFINITO) não recebem penalidade extra.
  const custoAjustado = new Map<string, number>(custoLookup)
  for (let i = 0; i < N; i++) {
    const viáveis: Array<{ j: number; custo: number }> = []
    for (let j = 0; j < M; j++) {
      const custo = custoLookup.get(chaveCusto(tecnicoIds[i], destinoIds[j]))
      if (custo !== undefined && custo < CUSTO_INFINITO) {
        viáveis.push({ j, custo })
      }
    }
    viáveis.sort((a, b) => a.custo - b.custo)
    const n = viáveis.length
    if (n <= 1) continue // rank único → nenhuma penalidade
    viáveis.forEach(({ j, custo }, rank) => {
      const rankNorm = rank / (n - 1)
      const ajustado = custo * (1 + PESO_PROXIMIDADE * rankNorm)
      custoAjustado.set(chaveCusto(tecnicoIds[i], destinoIds[j]), ajustado)
    })
  }

  // 2. Constrói matriz quadrada de custo (padding com zero quando não-square)
  //    - Posições reais: custo da matriz, ou CUSTO_INFINITO se par sem rota
  //    - Posições dummy: zero (algoritmo prefere zerar nelas, liberando reais)
  const dim = Math.max(N, M)
  const custoMatriz: number[][] = []

  for (let i = 0; i < dim; i++) {
    const linha: number[] = []
    for (let j = 0; j < dim; j++) {
      if (i < N && j < M) {
        const custo = custoAjustado.get(chaveCusto(tecnicoIds[i], destinoIds[j]))
        linha.push(custo ?? CUSTO_INFINITO)
      } else {
        // Padding: dummy row ou dummy column
        linha.push(0)
      }
    }
    custoMatriz.push(linha)
  }

  // 3. Roda Munkres: retorna pares [linha, coluna] da alocação ótima
  const pares = munkres(custoMatriz)

  // 4. Filtra dummies e rotas inviáveis, monta o resultado
  const alocacoes: ResultadoAlocacao["alocacoes"] = []
  const tecnicosAlocados = new Set<string>()
  const destinosAlocados = new Set<string>()

  for (const [rowIdx, colIdx] of pares) {
    // Pula dummies (índices além das dimensões reais)
    if (rowIdx >= N || colIdx >= M) continue

    const custoAjust = custoMatriz[rowIdx][colIdx]
    // Pula rotas inviáveis (sem dados na matriz original)
    if (custoAjust >= CUSTO_INFINITO) continue

    // Reporta o custo ORIGINAL (sem fator de proximidade) para métricas corretas
    const custo =
      custoLookup.get(chaveCusto(tecnicoIds[rowIdx], destinoIds[colIdx])) ??
      custoAjust

    alocacoes.push({
      tecnicoId: tecnicoIds[rowIdx],
      destinoId: destinoIds[colIdx],
      custo,
      modoEfetivo: modosPorTecnico.get(tecnicoIds[rowIdx]) ?? "DRIVE",
    })
    tecnicosAlocados.add(tecnicoIds[rowIdx])
    destinosAlocados.add(destinoIds[colIdx])
  }

  // 5. Ordena alocações por custo crescente (melhor primeiro)
  alocacoes.sort((a, b) => a.custo - b.custo)

  // 6. Identifica sobras
  const tecnicosNaoAlocados = tecnicoIds.filter((id) => !tecnicosAlocados.has(id))
  const destinosNaoAlocados = destinoIds.filter((id) => !destinosAlocados.has(id))

  // 7. Métricas agregadas
  const custoTotal = alocacoes.reduce((s, a) => s + a.custo, 0)
  const custoMedio = alocacoes.length > 0 ? custoTotal / alocacoes.length : 0

  return {
    alocacoes,
    tecnicosNaoAlocados,
    destinosNaoAlocados,
    custoTotal,
    custoMedio,
  }
}

// ============================================================
// HELPERS PRIVADOS
// ============================================================

function chaveCusto(tecnicoId: string, destinoId: string): string {
  return `${tecnicoId}|${destinoId}`
}