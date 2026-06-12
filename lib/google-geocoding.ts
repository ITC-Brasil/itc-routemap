// lib/google-geocoding.ts
//
// Funções puras pra geocodificar endereços via Google Maps Geocoding API.
// Usado em 2 lugares:
//   1. app/api/geocoding/route.ts → endpoint chamado pelo modal de Técnico (1 endereço)
//      [futura refatoração — hoje provavelmente está inline lá]
//   2. app/api/geocode-pontos/route.ts → batch que processa pontos sem lat/lng

export type Coordenadas = {
  latitude: number
  longitude: number
}

export type ResultadoGeocoding =
  | {
      sucesso: true
      coordenadas: Coordenadas
      enderecoFormatado: string
    }
  | {
      sucesso: false
      erro: string
    }

/**
 * Geocodifica um endereço usando a Google Maps Geocoding API.
 * Retorna discriminated union pra facilitar narrowing no caller.
 */
export async function geocodificarEndereco(
  endereco: string,
): Promise<ResultadoGeocoding> {
  const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY
  if (!apiKey) {
    return {
      sucesso: false,
      erro: "GOOGLE_MAPS_SERVER_API_KEY não configurada no servidor",
    }
  }

  if (!endereco || endereco.trim().length === 0) {
    return { sucesso: false, erro: "Endereço vazio" }
  }

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json")
  url.searchParams.set("address", endereco)
  url.searchParams.set("key", apiKey)
  url.searchParams.set("region", "br") // prioriza resultados brasileiros

  try {
    const response = await fetch(url.toString())
    if (!response.ok) {
      return {
        sucesso: false,
        erro: `HTTP ${response.status}: ${response.statusText}`,
      }
    }

    const data = (await response.json()) as {
      status: string
      results?: Array<{
        geometry: { location: { lat: number; lng: number } }
        formatted_address: string
      }>
      error_message?: string
    }

    if (data.status !== "OK" || !data.results || data.results.length === 0) {
      return {
        sucesso: false,
        erro: data.error_message ?? `Status: ${data.status}`,
      }
    }

    const top = data.results[0]
    return {
      sucesso: true,
      coordenadas: {
        latitude: top.geometry.location.lat,
        longitude: top.geometry.location.lng,
      },
      enderecoFormatado: top.formatted_address,
    }
  } catch (err) {
    return {
      sucesso: false,
      erro: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Geocodifica vários endereços em paralelo com concorrência limitada.
 * Deduplica endereços iguais (uma chamada à API para cada endereço único).
 *
 * @param enderecos Array de endereços (duplicatas serão removidas internamente)
 * @param concorrenciaMax Quantos requests simultâneos (default 5)
 * @returns Map endereco → ResultadoGeocoding
 */
export async function geocodificarLote(
  enderecos: string[],
  concorrenciaMax = 5,
): Promise<Map<string, ResultadoGeocoding>> {
  const resultado = new Map<string, ResultadoGeocoding>()

  // Dedup + filtra vazios
  const enderecosUnicos = Array.from(
    new Set(enderecos.map((e) => e.trim()).filter((e) => e.length > 0)),
  )

  // Processa em chunks pra evitar burst de requests
  for (let i = 0; i < enderecosUnicos.length; i += concorrenciaMax) {
    const chunk = enderecosUnicos.slice(i, i + concorrenciaMax)
    const resultados = await Promise.all(
      chunk.map(async (end) => ({
        endereco: end,
        resultado: await geocodificarEndereco(end),
      })),
    )
    for (const { endereco, resultado: r } of resultados) {
      resultado.set(endereco, r)
    }
  }

  return resultado
}