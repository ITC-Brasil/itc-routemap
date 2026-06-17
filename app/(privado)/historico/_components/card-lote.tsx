"use client"

import Link from "next/link"
import {
  ArrowRight,
  Clock,
  MoreVertical,
  Route as RouteIcon,
  Users,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { LoteSumario } from "@/lib/firestore/lotes"
import {
  formatarDataHora,
  formatarDistancia,
  formatarDuracao,
  nomeAmigavelModo,
} from "./historico-formatters"

type Props = {
  lote: LoteSumario
  onCancelar: (lote: LoteSumario) => void
}

export function CardLote({ lote, onCancelar }: Props) {
  const podeCancelar = lote.qtdRotasConfirmadas > 0

  // Pega o id curto (primeiros 8 chars do uuid) pra exibição
  const loteIdCurto = lote.loteId.slice(0, 8)

  return (
    <Card className="card-interactive">
      <CardContent className="p-5">
        {/* HEADER do card */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          {/* Lado esquerdo: identificação */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Lote {loteIdCurto}
              </span>
              <StatusBadge lote={lote} />
            </div>
            <p className="font-heading text-lg leading-tight">
              {formatarDataHora(lote.dataConfirmacao)}
            </p>
            {lote.umsNomes.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {lote.umsNomes.join(" · ")}
              </p>
            )}
          </div>

          {/* Lado direito: menu de ações */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">Mais opções</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => onCancelar(lote)}
                disabled={!podeCancelar}
                className="text-destructive focus:text-destructive"
              >
                Cancelar lote
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* MÉTRICAS — grid de 3 colunas */}
        <div className="mt-4 grid grid-cols-1 gap-4 border-t pt-4 sm:grid-cols-3">
          <Metrica
            icone={<RouteIcon className="h-3.5 w-3.5" />}
            label="Rotas"
            valor={`${lote.qtdRotas}`}
            sublabel={
              lote.statusLote === "Mista"
                ? `${lote.qtdRotasConfirmadas} ok · ${lote.qtdRotasCanceladas} canc.`
                : `${lote.qtdPontos} ponto${lote.qtdPontos === 1 ? "" : "s"}`
            }
          />
          <Metrica
            icone={<Clock className="h-3.5 w-3.5" />}
            label="Tempo total"
            valor={formatarDuracao(lote.tempoTotalSegundos)}
            sublabel={formatarDistancia(lote.distanciaTotalMetros)}
          />
          <Metrica
            icone={<Users className="h-3.5 w-3.5" />}
            label="Técnicos"
            valor={`${lote.tecnicosNomes.length}`}
            sublabel={nomeAmigavelModo(lote.modoPredominante)}
          />
        </div>

        {/* TÉCNICOS — chips */}
        {lote.tecnicosNomes.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {lote.tecnicosNomes.map((nome) => (
              <span
                key={nome}
                className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              >
                {nome}
              </span>
            ))}
          </div>
        )}

        {/* BOTÃO ABRIR DETALHES — navega pra página dedicada */}
        <Button
          asChild
          variant="outline"
          size="sm"
          className="mt-4 w-full gap-1.5"
        >
          <Link href={`/historico/${lote.loteId}`}>
            Abrir detalhes
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

// ============================================================
// SUBCOMPONENTES
// ============================================================

function StatusBadge({ lote }: { lote: LoteSumario }) {
  if (lote.statusLote === "Confirmada") {
    return (
      <Badge
        variant="outline"
        className="border-itc-sucesso/30 bg-itc-sucesso/10 text-itc-sucesso"
      >
        Confirmada
      </Badge>
    )
  }
  if (lote.statusLote === "Cancelada") {
    return (
      <Badge
        variant="outline"
        className="border-destructive/30 bg-destructive/10 text-destructive"
      >
        Cancelada
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      className="border-itc-atencao/30 bg-itc-atencao/10 text-itc-atencao"
    >
      Mista
    </Badge>
  )
}

function Metrica({
  icone,
  label,
  valor,
  sublabel,
}: {
  icone: React.ReactNode
  label: string
  valor: string
  sublabel?: string
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icone}
        <span className="font-mono text-[10px] uppercase tracking-widest">
          {label}
        </span>
      </div>
      <p className="font-heading text-2xl leading-none">{valor}</p>
      {sublabel && (
        <p className="text-xs text-muted-foreground">{sublabel}</p>
      )}
    </div>
  )
}