"use client"

import Link from "next/link"
import {
  ArrowRight,
  Clock,
  Hand,
  MoreVertical,
  RefreshCw,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { LoteSumario } from "@/lib/db/lotes"
import type { Projeto } from "@/lib/db/projetos"
import {
  formatarDataHora,
  formatarDistancia,
  formatarDuracao,
  nomeAmigavelModo,
} from "./historico-formatters"

type Props = {
  lote: LoteSumario
  projetos: Projeto[]
  onCancelar: (lote: LoteSumario) => void
}

export function CardLote({ lote, projetos, onCancelar }: Props) {
  const projetosDoLote = projetos.filter((p) => lote.projetoIds.includes(p.id))
  const podeCancelar = lote.qtdRotasConfirmadas > 0

  // Pega o id curto (primeiros 8 chars do uuid) pra exibição
  const loteIdCurto = lote.loteId.slice(0, 8)

  // 13.11: lote teve ajuste manual antes da confirmação?
  const teveAjusteManual = lote.origemDecisao !== "auto"
  // 13.12: lote contém ao menos uma rota de re-otimização?
  const teveReotimizacao = lote.temRealocacoes

  return (
    <Card className="card-interactive">
      <CardContent className="p-5">
        {/* HEADER do card */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          {/* Lado esquerdo: identificação */}
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs uppercase tracking-widest tabular-nums text-muted-foreground">
                Lote {loteIdCurto}
              </span>
              <StatusBadge lote={lote} />
              {teveAjusteManual && <BadgeAjusteManual />}
              {teveReotimizacao && <BadgeReotimizacao />}
            </div>
            <p className="font-heading text-lg leading-tight">
              {formatarDataHora(lote.dataConfirmacao)}
            </p>
            {projetosDoLote.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {projetosDoLote.map((projeto) => (
                  <span
                    key={projeto.id}
                    className="badge-cor-dado inline-flex h-5 items-center rounded-full border px-2 font-mono text-xs font-semibold"
                    style={{ "--cor-dado": projeto.cor } as React.CSSProperties}
                  >
                    {projeto.sigla}
                  </span>
                ))}
              </div>
            ) : lote.umsNomes.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {lote.umsNomes.join(" · ")}
              </p>
            ) : null}
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
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="cursor-default">
                  <Metrica
                    icone={<Users className="h-3.5 w-3.5" />}
                    label="Técnicos"
                    valor={`${lote.tecnicosNomes.length}`}
                    sublabel={nomeAmigavelModo(lote.modoPredominante)}
                  />
                </div>
              </TooltipTrigger>
              {lote.tecnicosNomes.length > 0 && (
                <TooltipContent side="bottom">
                  {lote.tecnicosNomes.join(", ")}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>

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

/**
 * Status do lote (system.md §5.2).
 *
 * Confirmada é sólida sobre tint; Cancelada é OUTLINE, sem preenchimento. A
 * assimetria é deliberada: cancelado não deve competir com confirmado na
 * varredura visual da lista. Antes as três variantes tinham o mesmo peso —
 * fundo em 10% e borda em 30% —, e um lote cancelado chamava tanta atenção
 * quanto um ativo.
 */
function StatusBadge({ lote }: { lote: LoteSumario }) {
  if (lote.statusLote === "Confirmada") {
    return (
      <Badge variant="outline" className="border-ok bg-ok-tint text-ok">
        Confirmada
      </Badge>
    )
  }
  if (lote.statusLote === "Cancelada") {
    return (
      <Badge variant="outline" className="border-err/40 bg-transparent text-err">
        Cancelada
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="border-warn bg-warn-tint text-warn">
      Mista
    </Badge>
  )
}

// ============================================================
// 13.11: BADGE DE AJUSTE MANUAL
// ============================================================
// Aparece SEMPRE em conjunto com o StatusBadge quando o lote teve
// ao menos 1 swap manual antes da confirmação (origemDecisao !== "auto").
// Cor --info em outline (system.md §5.2): distinguível dos demais sem ser
// alarmante — não é erro, é informação extra.

function BadgeAjusteManual() {
  return (
    <Badge
      variant="outline"
      className="gap-1 border-info/40 bg-transparent text-info"
    >
      <Hand className="size-3" />
      Ajuste manual
    </Badge>
  )
}

// 13.12: badge de re-otimização — lote teve ao menos uma rota substituída
// pelo algoritmo de re-otimização inteligente.
function BadgeReotimizacao() {
  return (
    <Badge
      variant="outline"
      className="gap-1 border-info/40 bg-info-tint text-info"
    >
      <RefreshCw className="size-3" />
      Re-otimização
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
      <p className="font-heading text-2xl leading-none tabular-nums">{valor}</p>
      {sublabel && (
        <p className="text-xs tabular-nums text-muted-foreground">{sublabel}</p>
      )}
    </div>
  )
}