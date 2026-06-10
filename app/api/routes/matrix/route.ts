import { NextResponse } from "next/server"
import {
  calcularMatrizDeslocamento,
  MAX_PARES,
  MODOS_DEFAULT,
  validarCoordenadas,
  type PontoGeo,
  type ModoMatrix,
} from "@/lib/google-routes"

/**
 * POST /api/routes/matrix
 *
 * Thin wrapper HTTP em torno de `calcularMatrizDeslocamento`.
 * Faz validação de entrada e formatação de resposta.
 *
 * Body esperado:
 *   {
 *     origens:  [{ id, latitude, longitude }, ...],
 *     destinos: [{ id, latitude, longitude }, ...],
 *     modos?:   ModoMatrix[]  // default: DRIVE, TWO_WHEELER, WALK
 *   }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const origens: PontoGeo[] = body.origens ?? []
    const destinos: PontoGeo[] = body.destinos ?? []
    const modos: ModoMatrix[] = body.modos ?? MODOS_DEFAULT

    if (origens.length === 0) return erro("Origens vazias.", 400)
    if (destinos.length === 0) return erro("Destinos vazios.", 400)
    if (origens.length * destinos.length > MAX_PARES) {
      return erro(
        `Limite excedido: máximo ${MAX_PARES} pares. Solicitação: ${origens.length}×${destinos.length}.`,
        400
      )
    }

    for (const o of origens) {
      if (!validarCoordenadas(o)) {
        return erro(`Origem ${o.id} tem coordenadas inválidas.`, 400)
      }
    }
    for (const d of destinos) {
      if (!validarCoordenadas(d)) {
        return erro(`Destino ${d.id} tem coordenadas inválidas.`, 400)
      }
    }

    const resultado = await calcularMatrizDeslocamento(
      origens,
      destinos,
      modos
    )

    if (resultado.modosCalculados.length === 0) {
      return erro(
        "Nenhum modo de transporte pôde ser calculado.",
        502,
        resultado.erros.join(" | ")
      )
    }

    return NextResponse.json({ sucesso: true, ...resultado })
  } catch (err) {
    console.error("Erro em /api/routes/matrix:", err)
    const mensagem = err instanceof Error ? err.message : String(err)
    return erro("Erro interno no cálculo de matriz.", 500, mensagem)
  }
}

function erro(mensagem: string, status: number, detalhe?: string) {
  return NextResponse.json(
    { sucesso: false, erro: mensagem, detalhe },
    { status }
  )
}