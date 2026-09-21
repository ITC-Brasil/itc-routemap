"use client"

import type { TotaisPainel } from "@/lib/hermes/painel-campo"

/**
 * Faixa de quatro totais — números grandes com rótulo pequeno, o padrão das
 * outras TVs do mural.
 *
 * "Sem técnico" fica âmbar quando é maior que zero e neutro quando é zero: um
 * zero pintado de alerta ensina a sala a ignorar a cor, e aí o alerta de
 * verdade também passa despercebido.
 */
export function FaixaTotais({ totais }: { totais: TotaisPainel }) {
  const temDescoberta = totais.semTecnico > 0

  return (
    <section className="grid grid-cols-4 gap-[1vw] border-b border-[#21262d] pb-[1.4vh]">
      <Total rotulo="Unidades" valor={String(totais.unidades)} />
      <Total
        rotulo="Cobertas"
        valor={`${totais.cobertas}/${totais.unidades}`}
      />
      <Total
        rotulo="Sem técnico"
        valor={String(totais.semTecnico)}
        cor={temDescoberta ? "#d29922" : undefined}
      />
      <Total
        rotulo="Deslocamento médio"
        valor={formatarDuracao(totais.deslocamentoMedioSeg)}
        // O total agregado é informação de apoio: numa parede, a soma de
        // deslocamento diz menos que a média por técnico, que é comparável
        // entre dias com equipes de tamanhos diferentes.
        apoio={`total ${formatarDuracao(totais.deslocamentoTotalSeg)}`}
      />
    </section>
  )
}

function Total({
  rotulo,
  valor,
  apoio,
  cor,
}: {
  rotulo: string
  valor: string
  apoio?: string
  cor?: string
}) {
  return (
    <div className="flex flex-col gap-[0.2vh]">
      <span className="font-mono text-[0.8vw] uppercase tracking-[0.2em] text-[#6e7681]">
        {rotulo}
      </span>
      <span
        className="font-bold leading-none tabular-nums"
        style={{ fontSize: "2.6vw", color: cor ?? "#e6edf3" }}
      >
        {valor}
      </span>
      {apoio && (
        <span className="font-mono text-[0.75vw] text-[#6e7681]">{apoio}</span>
      )}
    </div>
  )
}

function formatarDuracao(segundos: number): string {
  if (!segundos || segundos < 0) return "—"
  const h = Math.floor(segundos / 3600)
  const m = Math.round((segundos % 3600) / 60)
  if (h === 0) return `${m}min`
  return m === 0 ? `${h}h` : `${h}h${m.toString().padStart(2, "0")}`
}
