"use client"

/**
 * Helpers compartilhados entre calcular-rotas e historico/[loteId].
 * Centraliza: TransitStep, nomeAmigavelModo, iconeDoVeiculoTransit,
 * formatarHoraISO e DetalhesTransit — que viviam duplicados.
 */

import { Bus, PersonStanding, Train, TramFront } from "lucide-react"
import type { ModoTransporte } from "@/lib/firestore/rotas"

// ============================================================
// TIPOS
// ============================================================

export type TransitStep = {
  tipo: "transit" | "walking"
  duracaoSegundos: number
  distanciaMetros?: number
  linha?: string
  agencia?: string
  veiculo?: "BUS" | "SUBWAY" | "TRAIN" | "TRAM" | "OTHER"
  saida?: string
  chegada?: string
  paradaSaida?: string
  paradaChegada?: string
  numParadas?: number
  rumo?: string
}

// ============================================================
// HELPERS
// ============================================================

export function nomeAmigavelModo(modo: ModoTransporte | string): string {
  switch (modo) {
    case "DRIVE":
      return "Carro"
    case "WALK":
      return "A pé"
    case "TRANSIT":
      return "Transporte público"
    case "BICYCLE":
      return "Bicicleta"
    case "TWO_WHEELER":
      return "Moto"
    default:
      return String(modo)
  }
}

export function iconeDoVeiculoTransit(veiculo?: string) {
  switch (veiculo) {
    case "SUBWAY":
    case "TRAIN":
      return Train
    case "TRAM":
      return TramFront
    case "BUS":
    default:
      return Bus
  }
}

export function formatarHoraISO(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

// ============================================================
// COMPONENTE
// ============================================================

export function DetalhesTransit({
  steps,
  partidaIso,
  chegadaIso,
}: {
  steps: TransitStep[]
  partidaIso: string | null
  chegadaIso: string | null
}) {
  const transitSteps = steps.filter((s) => s.tipo === "transit")

  if (transitSteps.length === 0) {
    return (
      <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
        Nenhum trecho de transporte público nesta rota.
      </div>
    )
  }

  // Agrupa caminhadas CONSECUTIVAS num único item com totais somados.
  // Evita poluir a lista quando o Google retorna 5+ walking steps seguidos
  // de poucos segundos cada (típico em conexões entre paradas).
  type ItemAgrupado =
    | {
        tipo: "walking-grouped"
        duracaoSegundos: number
        distanciaMetros: number
      }
    | { tipo: "transit"; step: TransitStep }

  const itensAgrupados: ItemAgrupado[] = []
  let acumuladoSegs = 0
  let acumuladoMetros = 0

  const fecharGrupoWalking = () => {
    if (acumuladoSegs > 0 || acumuladoMetros > 0) {
      itensAgrupados.push({
        tipo: "walking-grouped",
        duracaoSegundos: acumuladoSegs,
        distanciaMetros: acumuladoMetros,
      })
    }
    acumuladoSegs = 0
    acumuladoMetros = 0
  }

  for (const step of steps) {
    if (step.tipo === "walking") {
      acumuladoSegs += step.duracaoSegundos
      acumuladoMetros += step.distanciaMetros ?? 0
    } else {
      fecharGrupoWalking()
      itensAgrupados.push({ tipo: "transit", step })
    }
  }
  fecharGrupoWalking()

  return (
    <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50/40 p-4 dark:border-amber-800/60 dark:bg-amber-950/20">
      <div className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-widest text-amber-800 dark:text-amber-300">
        <span>🚌 Trajeto de transporte público</span>
        {partidaIso && chegadaIso && (
          <span>
            {formatarHoraISO(partidaIso)} → {formatarHoraISO(chegadaIso)}
          </span>
        )}
      </div>
      <ol className="space-y-2">
        {itensAgrupados.map((item, i) => {
          if (item.tipo === "walking-grouped") {
            const min = Math.round(item.duracaoSegundos / 60)
            const km = item.distanciaMetros
              ? (item.distanciaMetros / 1000).toFixed(1)
              : null
            if (min === 0 && (!km || km === "0.0")) return null
            return (
              <li
                key={`walk-${i}`}
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <PersonStanding className="h-3.5 w-3.5" />
                Caminhada de {min} min{km ? ` (${km} km)` : ""}
              </li>
            )
          }
          const step = item.step
          const VeiculoIcon = iconeDoVeiculoTransit(step.veiculo)
          return (
            <li
              key={`transit-${i}`}
              className="flex items-start gap-2 text-sm"
            >
              <VeiculoIcon className="mt-0.5 h-4 w-4 text-amber-700 dark:text-amber-400" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold">
                    {step.linha ?? "Linha desconhecida"}
                  </span>
                  {step.rumo && (
                    <span className="text-xs text-muted-foreground">
                      → {step.rumo}
                    </span>
                  )}
                </div>
                {(step.paradaSaida || step.paradaChegada) && (
                  <p className="text-xs text-muted-foreground">
                    {step.paradaSaida && (
                      <>
                        Embarque: {step.paradaSaida}
                        {step.saida && ` (${step.saida})`}
                      </>
                    )}
                    {step.paradaSaida && step.paradaChegada && " · "}
                    {step.paradaChegada && (
                      <>
                        Desembarque: {step.paradaChegada}
                        {step.chegada && ` (${step.chegada})`}
                      </>
                    )}
                  </p>
                )}
                {step.agencia && (
                  <p className="text-[11px] text-muted-foreground">
                    {step.agencia}
                    {step.numParadas
                      ? ` · ${step.numParadas} ${
                          step.numParadas === 1 ? "parada" : "paradas"
                        }`
                      : ""}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
