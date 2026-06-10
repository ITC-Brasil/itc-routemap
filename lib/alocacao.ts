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
    custo: number // duração em segundos no modo principal
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
 * @param matriz         Saída de /api/routes/matrix (todos pares calculados)
 * @param tecnicoIds     IDs dos técnicos a alocar
 * @param destinoIds     IDs dos destinos (pontos)
 * @param modoPrincipal  Modo de transporte usado pra otimizar (default "DRIVE")
 */
export function resolverAlocacao(
  matriz: LinhaMatrizDeslocamento[],
  tecnicoIds: string[],
  destinoIds: string[],
  modoPrincipal: ModoTransporte = "DRIVE"
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

  // 1. Lookup rápido (tecnicoId, destinoId) → custo (segundos no modo principal)
  const custoLookup = new Map<string, number>()
  for (const linha of matriz) {
    const metrica = linha.metricas[modoPrincipal]
    if (metrica) {
      custoLookup.set(
        chaveCusto(linha.origemId, linha.destinoId),
        metrica.duracaoSegundos
      )
    }
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
        const custo = custoLookup.get(chaveCusto(tecnicoIds[i], destinoIds[j]))
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

    const custo = custoMatriz[rowIdx][colIdx]
    // Pula rotas inviáveis (sem dados na matriz original)
    if (custo >= CUSTO_INFINITO) continue

    alocacoes.push({
      tecnicoId: tecnicoIds[rowIdx],
      destinoId: destinoIds[colIdx],
      custo,
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