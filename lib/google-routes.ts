// ============================================================
// TIPOS
// ============================================================

export type PontoGeo = {
  id: string
  latitude: number
  longitude: number
}

export type ModoMatrix = "DRIVE" | "TWO_WHEELER" | "WALK" | "BICYCLE" | "TRANSIT"

export type MetricaModo = {
  distanciaMetros: number
  duracaoSegundos: number
}

export type LinhaMatriz = {
  origemId: string
  destinoId: string
  metricas: Partial<Record<ModoMatrix, MetricaModo>>
}

export type ResultadoMatriz = {
  matriz: LinhaMatriz[]
  modosCalculados: ModoMatrix[]
  erros: string[]
  duracaoMs: number
}

// Resposta crua do Google
type RouteMatrixElement = {
  originIndex: number
  destinationIndex: number
  status?: { code?: number; message?: string }
  distanceMeters?: number
  duration?: string
  condition?: "ROUTE_EXISTS" | "ROUTE_NOT_FOUND"
}

// ============================================================
// CONSTANTES
// ============================================================

export const MODOS_DEFAULT: ModoMatrix[] = ["DRIVE", "TWO_WHEELER", "WALK"]

/** Limite oficial da Google: máximo 625 pares (25 origens × 25 destinos). */
export const MAX_PARES = 625

/** Limite da Google para TRANSIT na Routes Matrix: máximo 100 pares (10×10). */
export const MAX_PARES_TRANSIT = 100

const URL_GOOGLE =
  "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix"

// ============================================================
// FUNÇÃO PÚBLICA
// ============================================================

/**
 * Calcula a matriz de deslocamento entre origens e destinos usando o
 * Compute Route Matrix da Google Routes API, em paralelo por modo.
 *
 * Função pura: faz só o I/O externo, sem HTTP wrapping nem validação
 * de entrada (esses ficam por conta dos route handlers).
 *
 * Lança Error se a API key não estiver configurada.
 */
export async function calcularMatrizDeslocamento(
  origens: PontoGeo[],
  destinos: PontoGeo[],
  modos: ModoMatrix[] = MODOS_DEFAULT
): Promise<ResultadoMatriz> {
  const inicio = Date.now()

  const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_SERVER_API_KEY não configurada.")
  }

  // Chamadas paralelas (1 por modo, fail isolado)
  const resultadosPorModo = await Promise.allSettled(
    modos.map((modo) => chamarMatrix(apiKey, origens, destinos, modo))
  )

  // Inicializa todas combinações
  const matrizMap = new Map<string, LinhaMatriz>()
  for (const o of origens) {
    for (const d of destinos) {
      matrizMap.set(`${o.id}|${d.id}`, {
        origemId: o.id,
        destinoId: d.id,
        metricas: {},
      })
    }
  }

  const modosCalculados: ModoMatrix[] = []
  const erros: string[] = []

  for (let i = 0; i < modos.length; i++) {
    const modo = modos[i]
    const resultado = resultadosPorModo[i]

    if (resultado.status === "rejected") {
      const motivo =
        resultado.reason instanceof Error
          ? resultado.reason.message
          : String(resultado.reason)
      erros.push(`${modo}: ${motivo}`)
      continue
    }

    modosCalculados.push(modo)

    for (const elem of resultado.value) {
      // Pula explicitamente rotas inviáveis
      if (elem.condition === "ROUTE_NOT_FOUND") continue
      // Defesa: se nem distância nem duração vieram, ignora
      if (elem.distanceMeters === undefined && elem.duration === undefined) {
        continue
      }

      const origem = origens[elem.originIndex]
      const destino = destinos[elem.destinationIndex]
      if (!origem || !destino) continue

      const entrada = matrizMap.get(`${origem.id}|${destino.id}`)
      if (!entrada) continue

      entrada.metricas[modo] = {
        distanciaMetros: elem.distanceMeters ?? 0,
        duracaoSegundos: parseDuracaoGoogle(elem.duration),
      }
    }
  }

  return {
    matriz: Array.from(matrizMap.values()),
    modosCalculados,
    erros,
    duracaoMs: Date.now() - inicio,
  }
}

/**
 * Valida que um ponto tem latitude/longitude válidas.
 * Reusável pelos route handlers que chamam essa lib.
 */
export function validarCoordenadas(p: PontoGeo): boolean {
  if (typeof p.latitude !== "number" || typeof p.longitude !== "number") {
    return false
  }
  if (p.latitude < -90 || p.latitude > 90) return false
  if (p.longitude < -180 || p.longitude > 180) return false
  return true
}

// ============================================================
// HELPERS PRIVADOS
// ============================================================

async function chamarMatrix(
  apiKey: string,
  origens: PontoGeo[],
  destinos: PontoGeo[],
  modo: ModoMatrix
): Promise<RouteMatrixElement[]> {
  const body = {
    origins: origens.map((o) => ({
      waypoint: {
        location: {
          latLng: { latitude: o.latitude, longitude: o.longitude },
        },
      },
    })),
    destinations: destinos.map((d) => ({
      waypoint: {
        location: {
          latLng: { latitude: d.latitude, longitude: d.longitude },
        },
      },
    })),
    travelMode: modo,
    ...(modo === "DRIVE" || modo === "TWO_WHEELER"
      ? { routingPreference: "TRAFFIC_AWARE" }
      : {}),
  }

  const res = await fetch(URL_GOOGLE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "originIndex,destinationIndex,status,distanceMeters,duration,condition",
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`)
  }

  return (await res.json()) as RouteMatrixElement[]
}

function parseDuracaoGoogle(duracao: string | undefined): number {
  if (!duracao) return 0
  const num = parseInt(duracao.replace("s", ""), 10)
  return Number.isFinite(num) ? num : 0
}