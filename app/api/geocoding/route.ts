import { NextResponse } from "next/server"

/**
 * API Route — Geocoding via Google Maps Geocoding API.
 *
 * Endpoint: GET /api/geocoding?plusCode=XXXX+XX
 *
 * Recebe um Plus Code (ou endereço) e retorna as coordenadas geográficas
 * usando a chave de servidor (que NÃO pode vazar pro cliente).
 *
 * PRD seção 9.1 — Função "Obter Coordenadas".
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const plusCode = searchParams.get("plusCode")

  // Validação básica de entrada
  if (!plusCode || plusCode.trim().length === 0) {
    return NextResponse.json(
      { erro: "Parâmetro 'plusCode' é obrigatório." },
      { status: 400 }
    )
  }

  // Verifica se a chave do servidor está configurada
  const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY
  if (!apiKey) {
    console.error("GOOGLE_MAPS_SERVER_API_KEY não configurada no ambiente")
    return NextResponse.json(
      { erro: "Servidor não configurado corretamente." },
      { status: 500 }
    )
  }

  try {
    // Chamada à Google Maps Geocoding API
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json")
    url.searchParams.set("address", plusCode.trim())
    url.searchParams.set("key", apiKey)
    url.searchParams.set("language", "pt-BR")
    url.searchParams.set("region", "br")

    const response = await fetch(url.toString())
    const data = await response.json()

    // Verifica status da resposta do Google
    if (data.status !== "OK") {
      return NextResponse.json(
        {
          erro: `Não foi possível geocodificar: ${data.status}`,
          mensagem: data.error_message ?? "Verifique o Plus Code informado.",
        },
        { status: 400 }
      )
    }

    if (!data.results || data.results.length === 0) {
      return NextResponse.json(
        { erro: "Nenhum resultado encontrado para esse Plus Code." },
        { status: 404 }
      )
    }

    // Extrai coordenadas e endereço formatado do primeiro resultado
    const resultado = data.results[0]
    const { lat, lng } = resultado.geometry.location

    return NextResponse.json({
      latitude: lat,
      longitude: lng,
      enderecoFormatado: resultado.formatted_address,
    })
  } catch (err) {
    console.error("Erro ao chamar Google Maps Geocoding:", err)
    return NextResponse.json(
      { erro: "Erro interno ao buscar coordenadas." },
      { status: 500 }
    )
  }
}