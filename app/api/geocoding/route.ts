import { NextResponse } from "next/server"

type AddressComponent = {
  long_name: string
  short_name: string
  types: string[]
}

const PLUS_CODE_REGEX = /^[A-Z0-9]{4,}\+[A-Z0-9]{2,}/i

function extrairEnderecoLegivel(
  components: AddressComponent[],
  formattedAddress: string
): string | null {
  if (!PLUS_CODE_REGEX.test(formattedAddress)) {
    const limpo = formattedAddress.replace(/,\s*(Brazil|Brasil)\s*$/i, "").trim()
    return limpo || null
  }

  const get = (...tipos: string[]) =>
    components.find((c) => tipos.some((t) => c.types.includes(t)))

  // Hierarquia do mais específico ao menos específico
  // administrative_area_level_4 cobre Regiões Administrativas do DF (ex: Planaltina)
  const bairro =
    get("neighborhood") ??
    get("sublocality_level_1") ??
    get("sublocality_level_2") ??
    get("administrative_area_level_3") ??
    get("administrative_area_level_4") ??
    get("sublocality")

  const cidade = get("administrative_area_level_2") ?? get("locality")
  const estado = get("administrative_area_level_1")

  const sufixoEstado = estado ? ` - ${estado.short_name}` : ""

  if (bairro || cidade) {
    const partes: string[] = []
    if (bairro) partes.push(bairro.long_name)
    if (cidade && cidade.long_name !== bairro?.long_name) {
      partes.push(cidade.long_name)
    }
    return partes.join(", ") + sufixoEstado
  }

  // Último recurso: formatted_address sem Plus Code e país
  const fallback = formattedAddress
    .replace(/^[A-Z0-9]+\+[A-Z0-9]+\s*/i, "")
    .replace(/,\s*(Brazil|Brasil)\s*$/i, "")
    .trim()

  // Considera inútil se for vazio ou tiver só a sigla do estado ("- DF")
  return fallback.length > 4 ? fallback : null
}

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

    // Extrai coordenadas e endereço legível do primeiro resultado
    const resultado = data.results[0]
    const { lat, lng } = resultado.geometry.location

    return NextResponse.json({
      latitude: lat,
      longitude: lng,
      enderecoFormatado: extrairEnderecoLegivel(
        resultado.address_components ?? [],
        resultado.formatted_address
      ),
    })
  } catch (err) {
    console.error("Erro ao chamar Google Maps Geocoding:", err)
    return NextResponse.json(
      { erro: "Erro interno ao buscar coordenadas." },
      { status: 500 }
    )
  }
}