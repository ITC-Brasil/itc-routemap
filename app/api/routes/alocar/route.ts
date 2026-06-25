import { NextResponse } from "next/server"
import {
  calcularMatrizDeslocamento,
  MAX_PARES,
  MODOS_DEFAULT,
  validarCoordenadas,
  type ModoMatrix,
} from "@/lib/google-routes"
import { resolverAlocacao } from "@/lib/alocacao"
import type { ModoTransporte } from "@/lib/firestore/rotas"
import {
  gerarJustificativaAlocacao,
  type ContextoAlocacao,
} from "@/lib/gemini"
import { gerarLoteId } from "@/lib/firestore/rotas"

// ============================================================
// TIPOS DO BODY
// ============================================================

type TecnicoInput = {
  id: string
  nome: string
  endereco: string
  latitude: number
  longitude: number
  modoPrincipal?: string
}

type DestinoInput = {
  id: string // pontoId
  umNome: string
  projetoId: string
  projetoSigla: string
  raNome: string
  endereco: string
  latitude: number
  longitude: number
  ciclo: number
  etapa: number
}

type RequestBody = {
  tecnicos: TecnicoInput[]
  destinos: DestinoInput[]
  modoPrincipal?: ModoMatrix
  modos?: ModoMatrix[]
}

// ============================================================
// API ROUTE
// ============================================================

/**
 * POST /api/routes/alocar
 *
 * Orquestrador da alocação inteligente. Cinco etapas:
 *   1. Valida o input (técnicos + destinos com coords)
 *   2. Chama Google Routes Compute Matrix em paralelo por modo
 *   3. Resolve a alocação ótima via algoritmo Húngaro (em alocacao.ts)
 *   4. Pede ao Gemini uma justificativa em linguagem natural
 *   5. Devolve resposta rica pronta pra UI / persistência
 */
export async function POST(request: Request) {
  const inicio = Date.now()

  try {
    // ====== 1. PARSE E VALIDAÇÃO ======
    const body: RequestBody = await request.json()
    const tecnicos = body.tecnicos ?? []
    const destinos = body.destinos ?? []
    const modoPrincipal: ModoMatrix = body.modoPrincipal ?? "DRIVE"
    const modos: ModoMatrix[] = body.modos ?? MODOS_DEFAULT

    if (tecnicos.length === 0) return erro("Nenhum técnico fornecido.", 400)
    if (destinos.length === 0) return erro("Nenhum destino fornecido.", 400)

    if (tecnicos.length * destinos.length > MAX_PARES) {
      return erro(
        `Limite excedido: máximo ${MAX_PARES} pares. Solicitação: ${tecnicos.length}×${destinos.length}.`,
        400
      )
    }

    if (!modos.includes(modoPrincipal)) {
      return erro(
        `Modo principal "${modoPrincipal}" não está incluído nos modos a calcular (${modos.join(", ")}).`,
        400
      )
    }

    for (const t of tecnicos) {
      if (!validarCoordenadas(t)) {
        return erro(
          `Técnico "${t.nome}" (${t.id}) tem coordenadas inválidas.`,
          400
        )
      }
    }
    for (const d of destinos) {
      if (!validarCoordenadas(d)) {
        return erro(
          `Destino "${d.umNome}" (${d.id}) tem coordenadas inválidas.`,
          400
        )
      }
    }

    // ====== 2. MATRIZ NO GOOGLE ROUTES ======

    // Modos por técnico — usa o modo individual se válido, senão cai no global
    const MODOS_MATRIX_VALIDOS = new Set(["DRIVE", "TWO_WHEELER", "WALK", "BICYCLE"])
    const modosPorTecnico = new Map<string, ModoTransporte>()
    for (const t of tecnicos) {
      const modo = t.modoPrincipal && MODOS_MATRIX_VALIDOS.has(t.modoPrincipal)
        ? (t.modoPrincipal as ModoTransporte)
        : modoPrincipal
      modosPorTecnico.set(t.id, modo)
    }

    // Garante que todos os modos individuais entram na matriz
    const modosExtendidos: ModoMatrix[] = Array.from(
      new Set([...modos, ...(Array.from(modosPorTecnico.values()) as ModoMatrix[])])
    )

    const resultadoMatriz = await calcularMatrizDeslocamento(
      tecnicos.map((t) => ({
        id: t.id,
        latitude: t.latitude,
        longitude: t.longitude,
      })),
      destinos.map((d) => ({
        id: d.id,
        latitude: d.latitude,
        longitude: d.longitude,
      })),
      modosExtendidos
    )

    if (resultadoMatriz.modosCalculados.length === 0) {
      return erro(
        "Falha ao calcular matriz de deslocamento.",
        502,
        resultadoMatriz.erros.join(" | ")
      )
    }

    if (!resultadoMatriz.modosCalculados.includes(modoPrincipal)) {
      return erro(
        `Modo principal "${modoPrincipal}" falhou no cálculo. Modos disponíveis: ${resultadoMatriz.modosCalculados.join(", ")}`,
        502,
        resultadoMatriz.erros.join(" | ")
      )
    }

    // ====== 3. ALGORITMO HÚNGARO ======
    const resultadoAlocacao = resolverAlocacao(
      resultadoMatriz.matriz,
      tecnicos.map((t) => t.id),
      destinos.map((d) => d.id),
      modosPorTecnico
    )

    if (resultadoAlocacao.alocacoes.length === 0) {
      return erro(
        "Não foi possível encontrar uma alocação viável.",
        422,
        "Todos os pares ficaram sem rota calculável."
      )
    }

    // ====== 4. JUSTIFICATIVA GEMINI ======
    const tecnicosLookup = new Map(tecnicos.map((t) => [t.id, t.nome]))
    const umsLookup = new Map(
      destinos.map((d) => [
        d.id,
        {
          umNome: d.umNome,
          raNome: d.raNome,
          projetoSigla: d.projetoSigla,
        },
      ])
    )

    const contexto: ContextoAlocacao = {
  totalTecnicos: tecnicos.length,
  totalUMs: destinos.length,
  modoPrincipal: modoPrincipal,                      // ← sem a conversão
  tecnicos: tecnicosLookup,
  umsLookup,
}

    const justificativa = await gerarJustificativaAlocacao(
      resultadoAlocacao,
      contexto
    )

    // ====== 5. RESPOSTA RICA ======
    const tecnicoById = new Map(tecnicos.map((t) => [t.id, t]))
    const destinoById = new Map(destinos.map((d) => [d.id, d]))
    const metricasPorPar = new Map(
      resultadoMatriz.matriz.map((l) => [
        `${l.origemId}|${l.destinoId}`,
        l.metricas,
      ])
    )

    const alocacoesRicas = resultadoAlocacao.alocacoes.map((a) => {
      const tec = tecnicoById.get(a.tecnicoId)
      const dest = destinoById.get(a.destinoId)
      if (!tec || !dest) {
        // não deveria acontecer — defensive code
        throw new Error(
          `Inconsistência interna: par ${a.tecnicoId}→${a.destinoId} sem dados.`
        )
      }
      const metricas =
        metricasPorPar.get(`${a.tecnicoId}|${a.destinoId}`) ?? {}
      return {
        origem: {
          id: tec.id,
          nome: tec.nome,
          endereco: tec.endereco,
          latitude: tec.latitude,
          longitude: tec.longitude,
        },
        destino: {
          id: dest.id,
          umNome: dest.umNome,
          projetoId: dest.projetoId,
          projetoSigla: dest.projetoSigla,
          raNome: dest.raNome,
          endereco: dest.endereco,
          ciclo: dest.ciclo,
          etapa: dest.etapa,
          latitude: dest.latitude,
          longitude: dest.longitude,
        },
        metricas,
        custoSegundosPrincipal: a.custo,
        modoEfetivo: a.modoEfetivo,
      }
    })

    return NextResponse.json({
      sucesso: true,
      loteId: gerarLoteId(),
      modoPrincipal,
      modosCalculados: resultadoMatriz.modosCalculados,
      alocacoes: alocacoesRicas,
      tecnicosNaoAlocados: resultadoAlocacao.tecnicosNaoAlocados.map((id) => ({
        id,
        nome: tecnicoById.get(id)?.nome ?? id,
      })),
      destinosNaoAlocados: resultadoAlocacao.destinosNaoAlocados.map((id) => ({
        id,
        umNome: destinoById.get(id)?.umNome ?? id,
      })),
      custoTotalSegundos: resultadoAlocacao.custoTotal,
      custoMedioSegundos: resultadoAlocacao.custoMedio,
      justificativaGemini: justificativa,
      duracaoMs: Date.now() - inicio,
      avisos: resultadoMatriz.erros,
    })
  } catch (err) {
    console.error("Erro em /api/routes/alocar:", err)
    const mensagem = err instanceof Error ? err.message : String(err)
    return erro("Erro interno na alocação.", 500, mensagem)
  }
}

// ============================================================
// HELPERS
// ============================================================

function erro(mensagem: string, status: number, detalhe?: string) {
  return NextResponse.json(
    { sucesso: false, erro: mensagem, detalhe },
    { status }
  )
}