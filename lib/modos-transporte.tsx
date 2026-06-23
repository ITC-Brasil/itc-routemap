/**
 * Helpers compartilhados sobre modos de transporte.
 *
 * Centraliza IconeModo, MODOS_SELECIONAVEIS e gerarExplicacaoAlgoritmica
 * que viviam duplicados em resultado-alocacao.tsx e historico/[loteId]/page.tsx.
 *
 * nomeAmigavelModo (display, capitalizado) vive em historico-formatters.ts.
 */

import { Bike, Bus, Car, PersonStanding } from "lucide-react"
import type { ModoTransporte } from "@/lib/firestore/rotas"

/** Modos exibidos no seletor de modo (TRANSIT incluso, calculado sob demanda). */
export const MODOS_SELECIONAVEIS: ModoTransporte[] = [
  "DRIVE",
  "TWO_WHEELER",
  "WALK",
  "TRANSIT",
]

/** Ícone do modo de transporte, reutilizável em qualquer contexto. */
export function IconeModo({
  modo,
  className,
}: {
  modo: ModoTransporte
  className?: string
}) {
  switch (modo) {
    case "DRIVE":
      return <Car className={className} />
    case "TWO_WHEELER":
      return <Bike className={className} />
    case "WALK":
      return <PersonStanding className={className} />
    case "BICYCLE":
      return <Bike className={className} />
    case "TRANSIT":
      return <Bus className={className} />
    default:
      return <Car className={className} />
  }
}

/**
 * Gera explicação algorítmica de UMA rota no contexto de TODAS as rotas
 * do mesmo lote. Sem IA — só código, baseado em rank + média.
 *
 * @param manual true quando o par foi ajustado manualmente (13.11)
 */
export function gerarExplicacaoAlgoritmica(input: {
  tecnicoNome: string
  umNome: string
  meuCustoSegundos: number
  todosCustosSegundos: number[]
  modoLabel: string
  manual?: boolean
}): string {
  const {
    tecnicoNome,
    umNome,
    meuCustoSegundos,
    todosCustosSegundos,
    modoLabel,
    manual,
  } = input
  const total = todosCustosSegundos.length
  if (total === 0) return ""

  const meuMin = Math.round(meuCustoSegundos / 60)

  const linhaDecisao = manual
    ? `Esta combinação ${tecnicoNome} → ${umNome} foi escolhida manualmente, fora da sugestão do algoritmo.`
    : `O algoritmo escolheu ${tecnicoNome} → ${umNome} porque essa combinação tinha o menor custo de tempo dentre as opções possíveis para esta UM.`

  if (total === 1) {
    return `Esta é a única rota da rodada (${meuMin} min via ${modoLabel}). ${linhaDecisao}`
  }

  const ordenados = [...todosCustosSegundos].sort((a, b) => a - b)
  const rank = ordenados.indexOf(meuCustoSegundos) + 1
  const media = todosCustosSegundos.reduce((s, c) => s + c, 0) / total
  const mediaMin = Math.round(media / 60)
  const diff = meuMin - mediaMin

  let rankLabel: string
  if (rank === 1) rankLabel = "rota mais curta"
  else if (rank === total) rankLabel = "rota mais longa"
  else rankLabel = `${rank}ª rota mais curta`

  const diffLabel =
    diff === 0
      ? "exatamente na média da rodada"
      : diff < 0
        ? `${Math.abs(diff)} min abaixo da média (${mediaMin} min)`
        : `${diff} min acima da média (${mediaMin} min)`

  return `Esta é a ${rankLabel} do lote (${total} rotas no total) — ${meuMin} min de deslocamento via ${modoLabel}, ${diffLabel}. ${linhaDecisao}`
}
