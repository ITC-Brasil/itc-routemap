"use client"

import type { UnidadePainel } from "@/lib/hermes/painel-campo"

/**
 * Cartão de uma unidade móvel.
 *
 * Quanto mostra depende da densidade — que vem da contagem de unidades, não de
 * uma escolha manual. A regra é sempre a mesma: o que sobrevive ao aperto é o
 * que se lê de relance a dois metros.
 */

export type Densidade = "baixa" | "media" | "alta"

const CORES = {
  coberta: {
    borda: "#2ea043",
    fundo: "transparent",
  },
  sem_tecnico: {
    borda: "#d29922",
    // Fundo âmbar também, não só borda: é a única exceção na tela e precisa
    // ser vista do corredor, sem leitura. Borda sozinha some a três metros.
    fundo: "rgba(210, 153, 34, 0.16)",
  },
} as const

export function CartaoUnidade({
  unidade,
  densidade,
}: {
  unidade: UnidadePainel
  densidade: Densidade
}) {
  const cor = CORES[unidade.estado]
  const semTecnico = unidade.estado === "sem_tecnico"

  return (
    <article
      className="flex flex-col gap-[0.5vh] rounded-[0.6vw] px-[0.8vw] py-[1vh]"
      style={{
        borderLeft: `0.35vw solid ${cor.borda}`,
        background: cor.fundo,
        boxShadow: "inset 0 0 0 1px #21262d",
      }}
    >
      {/* Sigla — sempre, em qualquer densidade. É o identificador. */}
      <div className="flex items-baseline justify-between gap-[0.4vw]">
        <span className="truncate font-mono text-[1.25vw] font-bold tracking-wide text-[#e6edf3]">
          {unidade.sigla}
        </span>
        <span className="shrink-0 font-mono text-[0.75vw] text-[#6e7681]">
          {unidade.projeto}
        </span>
      </div>

      {/* RA (+ ciclo/etapa só na densidade baixa) */}
      {densidade !== "alta" && (
        <p className="truncate text-[0.9vw] text-[#8b949e]">
          {unidade.ra}
          {densidade === "baixa" && (
            <span className="text-[#6e7681]">
              {" · "}C{unidade.ciclo}/E{unidade.etapa}
            </span>
          )}
        </p>
      )}

      {/* Técnico ou o alerta de descoberta */}
      {semTecnico ? (
        <p className="font-mono text-[0.95vw] font-semibold uppercase tracking-[0.12em] text-[#d29922]">
          sem técnico
        </p>
      ) : (
        <div className="flex items-center gap-[0.5vw]">
          {densidade === "baixa" && unidade.tecnico && (
            <span
              className="flex size-[1.9vw] shrink-0 items-center justify-center rounded-full font-mono text-[0.8vw] font-semibold text-white"
              style={{ background: unidade.tecnico.cor }}
            >
              {unidade.tecnico.iniciais}
            </span>
          )}
          <span className="truncate text-[1vw] text-[#e6edf3]">
            {unidade.tecnico?.nome}
          </span>
        </div>
      )}

      {/* Deslocamento — some na densidade alta, onde só cabe o essencial */}
      {densidade !== "alta" && unidade.deslocamento && (
        <p className="font-mono text-[0.85vw] text-[#8b949e]">
          {rotuloModo(unidade.deslocamento.modo)} ·{" "}
          <span className="text-[#c9d1d9]">
            {formatarDuracao(unidade.deslocamento.duracaoSeg)}
          </span>
          {densidade === "baixa" && (
            <> · {formatarDistancia(unidade.deslocamento.distanciaMetros)}</>
          )}
        </p>
      )}
    </article>
  )
}

// ============================================================
// FORMATAÇÃO
// ============================================================

/**
 * Rótulo curto do modo. Ícone seria melhor a dois metros, mas exige biblioteca
 * no bundle da TV; o texto curto em versalete resolve e não depende de fonte
 * de ícones carregar.
 */
function rotuloModo(modo: string): string {
  switch (modo) {
    case "DRIVE":
      return "CARRO"
    case "TWO_WHEELER":
      return "MOTO"
    case "WALK":
      return "A PÉ"
    case "TRANSIT":
      return "ÔNIBUS"
    case "BICYCLE":
      return "BIKE"
    default:
      return modo
  }
}

function formatarDuracao(segundos: number): string {
  if (!segundos || segundos < 0) return "—"
  const h = Math.floor(segundos / 3600)
  const m = Math.round((segundos % 3600) / 60)
  if (h === 0) return `${m}min`
  return m === 0 ? `${h}h` : `${h}h${m.toString().padStart(2, "0")}`
}

function formatarDistancia(metros: number): string {
  if (!metros || metros < 0) return "—"
  const km = metros / 1000
  return km < 10
    ? `${km.toFixed(1).replace(".", ",")}km`
    : `${Math.round(km)}km`
}
