// app/api/routes/single/route.ts
//
// Busca UMA rota detalhada entre origem e destino com:
//   - Polyline (geometria pra desenhar no mapa)
//   - Distância + duração
//   - Para TRANSIT: linhas de ônibus/metrô, horários, baldeações
//
// Usado lazy pela UI: só dispara quando o usuário expande uma alocação
// ou troca o modo de transporte.

import { NextResponse } from "next/server"

const ROUTES_URL =
  "https://routes.googleapis.com/directions/v2:computeRoutes"

type ModoTransporte =
  | "DRIVE"
  | "TWO_WHEELER"
  | "WALK"
  | "BICYCLE"
  | "TRANSIT"

type LatLng = { latitude: number; longitude: number }

type RequestBody = {
  origem: LatLng
  destino: LatLng
  modo: ModoTransporte
  /** ISO string; obrigatório para TRANSIT. Default: agora + 5 min */
  departureTime?: string
}

// ============================================================
// TIPOS DE RESPOSTA
// ============================================================

export type TransitStep = {
  tipo: "transit" | "walking"
  duracaoSegundos: number
  distanciaMetros?: number
  // Campos abaixo só para tipo="transit"
  linha?: string
  agencia?: string
  veiculo?: "BUS" | "SUBWAY" | "TRAIN" | "TRAM" | "OTHER"
  cor?: string
  saida?: string // HH:MM (texto formatado pela API)
  chegada?: string
  paradaSaida?: string
  paradaChegada?: string
  numParadas?: number
  rumo?: string // headsign — destino final do veículo
}

export type RespostaSingleRoute =
  | {
      sucesso: true
      modo: ModoTransporte
      polyline: string | null
      distanciaMetros: number
      duracaoSegundos: number
      transitSteps: TransitStep[]
      partidaIso: string | null
      chegadaIso: string | null
    }
  | {
      sucesso: false
      erro: string
      detalhe?: string
    }

// ============================================================
// HANDLER
// ============================================================

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody

    if (!body?.origem || !body?.destino || !body?.modo) {
      return NextResponse.json(
        { sucesso: false, erro: "origem, destino e modo são obrigatórios" },
        { status: 400 },
      )
    }

    if (!validarLatLng(body.origem) || !validarLatLng(body.destino)) {
      return NextResponse.json(
        { sucesso: false, erro: "Coordenadas inválidas" },
        { status: 400 },
      )
    }

    const MODOS_VALIDOS: ModoTransporte[] = ["DRIVE", "TWO_WHEELER", "WALK", "BICYCLE", "TRANSIT"]
    if (!MODOS_VALIDOS.includes(body.modo)) {
      return NextResponse.json(
        { sucesso: false, erro: `Modo inválido: "${body.modo}". Use DRIVE, TWO_WHEELER, WALK, BICYCLE ou TRANSIT.` },
        { status: 400 },
      )
    }

    const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "GOOGLE_MAPS_SERVER_API_KEY não configurada",
        },
        { status: 500 },
      )
    }

    // ===== Field mask =====
    // Para TRANSIT precisamos dos steps com transitDetails.
    // Para outros modos, só polyline + metrics bastam.
    const baseMask = [
      "routes.duration",
      "routes.distanceMeters",
      "routes.polyline.encodedPolyline",
    ]
    const transitMask = [
      "routes.legs.steps.distanceMeters",
      "routes.legs.steps.staticDuration",
      "routes.legs.steps.travelMode",
      "routes.legs.steps.transitDetails",
    ]
    const fieldMask = [
      ...baseMask,
      ...(body.modo === "TRANSIT" ? transitMask : []),
    ].join(",")

    // ===== Request body para Google Routes =====
    const requestBody: Record<string, unknown> = {
      origin: { location: { latLng: body.origem } },
      destination: { location: { latLng: body.destino } },
      travelMode: body.modo,
      languageCode: "pt-BR",
      regionCode: "BR",
      units: "METRIC",
    }

    if (body.modo === "DRIVE" || body.modo === "TWO_WHEELER") {
      requestBody.routingPreference = "TRAFFIC_AWARE"
    }

    // TRANSIT precisa de departureTime no futuro
    if (body.modo === "TRANSIT") {
      const departure =
        body.departureTime ??
        new Date(Date.now() + 5 * 60 * 1000).toISOString()
      requestBody.departureTime = departure
      requestBody.transitPreferences = {
        routingPreference: "LESS_WALKING",
      }
    }

    // ===== Chamada ao Google =====
    const response = await fetch(ROUTES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask,
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        {
          sucesso: false,
          erro: `Google Routes ${response.status}`,
          detalhe: errorText,
        },
        { status: 502 },
      )
    }

    const data = await response.json()
    const route = data?.routes?.[0]

    if (!route) {
      const motivo =
        body.modo === "TRANSIT"
          ? "Não há transporte público disponível entre esses pontos no horário solicitado."
          : "Nenhuma rota encontrada entre esses pontos."
      return NextResponse.json({ sucesso: false, erro: motivo }, { status: 200 })
    }

    // ===== Parse de TRANSIT details =====
    let transitSteps: TransitStep[] = []
    let partidaIso: string | null = null
    let chegadaIso: string | null = null

    if (body.modo === "TRANSIT" && Array.isArray(route.legs)) {
      const parsed = parseTransitLegs(route.legs)
      transitSteps = parsed.steps
      partidaIso = parsed.partidaIso
      chegadaIso = parsed.chegadaIso
    }

    return NextResponse.json({
      sucesso: true,
      modo: body.modo,
      polyline: route.polyline?.encodedPolyline ?? null,
      distanciaMetros: route.distanceMeters ?? 0,
      duracaoSegundos: parseDuracaoSeg(route.duration),
      transitSteps,
      partidaIso,
      chegadaIso,
    })
  } catch (err) {
    console.error("Erro em /api/routes/single:", err)
    const mensagem = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { sucesso: false, erro: "Erro interno", detalhe: mensagem },
      { status: 500 },
    )
  }
}

// ============================================================
// HELPERS
// ============================================================

function validarLatLng(coord: LatLng): boolean {
  return (
    coord != null &&
    typeof coord.latitude === "number" &&
    typeof coord.longitude === "number" &&
    !Number.isNaN(coord.latitude) &&
    !Number.isNaN(coord.longitude) &&
    coord.latitude >= -90 &&
    coord.latitude <= 90 &&
    coord.longitude >= -180 &&
    coord.longitude <= 180
  )
}

function parseDuracaoSeg(duration: string | undefined): number {
  if (!duration) return 0
  // Formato Google: "1234s"
  return parseInt(duration.replace("s", ""), 10) || 0
}

type LegStep = {
  distanceMeters?: number
  staticDuration?: string
  travelMode?: string
  transitDetails?: {
    stopDetails?: {
      arrivalStop?: { name?: string }
      arrivalTime?: string
      departureStop?: { name?: string }
      departureTime?: string
    }
    localizedValues?: {
      arrivalTime?: { time?: { text?: string } }
      departureTime?: { time?: { text?: string } }
    }
    headsign?: string
    transitLine?: {
      agencies?: Array<{ name?: string }>
      name?: string
      nameShort?: string
      color?: string
      vehicle?: { type?: string; name?: { text?: string } }
    }
    stopCount?: number
  }
}

type Leg = { steps?: LegStep[] }

function parseTransitLegs(legs: Leg[]): {
  steps: TransitStep[]
  partidaIso: string | null
  chegadaIso: string | null
} {
  const out: TransitStep[] = []
  let partidaIso: string | null = null
  let chegadaIso: string | null = null

  for (const leg of legs) {
    if (!leg.steps) continue
    for (const step of leg.steps) {
      if (step.transitDetails) {
        const td = step.transitDetails
        const linha = td.transitLine
        const veiculoTipo = (linha?.vehicle?.type ?? "BUS") as
          | "BUS"
          | "SUBWAY"
          | "TRAIN"
          | "TRAM"
          | "OTHER"

        // Captura partida do PRIMEIRO step de transit
        if (!partidaIso && td.stopDetails?.departureTime) {
          partidaIso = td.stopDetails.departureTime
        }
        // Sempre atualiza a chegada com o ÚLTIMO step
        if (td.stopDetails?.arrivalTime) {
          chegadaIso = td.stopDetails.arrivalTime
        }

        out.push({
          tipo: "transit",
          duracaoSegundos: parseDuracaoSeg(step.staticDuration),
          distanciaMetros: step.distanceMeters,
          linha: linha?.nameShort ?? linha?.name ?? "—",
          agencia: linha?.agencies?.[0]?.name,
          veiculo: veiculoTipo,
          cor: linha?.color,
          saida: td.localizedValues?.departureTime?.time?.text,
          chegada: td.localizedValues?.arrivalTime?.time?.text,
          paradaSaida: td.stopDetails?.departureStop?.name,
          paradaChegada: td.stopDetails?.arrivalStop?.name,
          numParadas: td.stopCount,
          rumo: td.headsign,
        })
      } else if (step.travelMode === "WALK") {
        out.push({
          tipo: "walking",
          duracaoSegundos: parseDuracaoSeg(step.staticDuration),
          distanciaMetros: step.distanceMeters,
        })
      }
    }
  }

  return { steps: out, partidaIso, chegadaIso }
}