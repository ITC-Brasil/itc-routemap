"use client"

import { useState } from "react"
import { Calendar as CalendarIcon, ChevronDown, ChevronUp, Filter, X } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import type { DateRange } from "react-day-picker"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { StatusLote } from "@/lib/firestore/lotes"

export type FiltroStatus = "todos" | StatusLote

export type FiltrosHistorico = {
  periodo: DateRange | undefined
  tecnico: string // "todos" ou nome do técnico
  status: FiltroStatus
}

type Props = {
  filtros: FiltrosHistorico
  tecnicosDisponiveis: string[]
  onChange: (filtros: FiltrosHistorico) => void
}

export function FiltrosHistoricoComp({
  filtros,
  tecnicosDisponiveis,
  onChange,
}: Props) {
  const [aberto, setAberto] = useState(false)

  const algumFiltroAtivo =
    filtros.periodo !== undefined ||
    filtros.tecnico !== "todos" ||
    filtros.status !== "todos"

  const limparTudo = () => {
    onChange({
      periodo: undefined,
      tecnico: "todos",
      status: "todos",
    })
  }

  return (
    <Card>
      <CardContent className="p-0">
        {/* Cabeçalho sempre visível — clique abre/fecha */}
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="flex w-full items-center justify-between px-6 py-4 transition-colors hover:bg-muted/40"
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="relative">
              <Filter className="h-4 w-4" />
              {algumFiltroAtivo && (
                <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-primary" />
              )}
            </div>
            <span className="font-mono text-xs uppercase tracking-widest">
              Filtros
            </span>
            {algumFiltroAtivo && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">
                ativos
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {algumFiltroAtivo && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); limparTudo() }}
                className="h-auto gap-1 px-2 py-1 text-xs"
              >
                <X className="h-3 w-3" />
                Limpar
              </Button>
            )}
            {aberto ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </button>

        {/* Conteúdo colapsável */}
        {aberto && (
          <div className="space-y-4 border-t px-6 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Período (date range picker) */}
              <div className="space-y-2">
                <Label>Período</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {filtros.periodo?.from ? (
                        filtros.periodo.to ? (
                          <>
                            {format(filtros.periodo.from, "d MMM", { locale: ptBR })}{" "}
                            — {format(filtros.periodo.to, "d MMM yyyy", { locale: ptBR })}
                          </>
                        ) : (
                          format(filtros.periodo.from, "d MMM yyyy", { locale: ptBR })
                        )
                      ) : (
                        <span className="text-muted-foreground">
                          Selecione um período
                        </span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="range"
                      selected={filtros.periodo}
                      onSelect={(range) =>
                        onChange({ ...filtros, periodo: range })
                      }
                      locale={ptBR}
                      numberOfMonths={2}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Técnico */}
              <div className="space-y-2">
                <Label htmlFor="filtro-tecnico">Técnico</Label>
                <Select
                  value={filtros.tecnico}
                  onValueChange={(v) => onChange({ ...filtros, tecnico: v })}
                  disabled={tecnicosDisponiveis.length === 0}
                >
                  <SelectTrigger id="filtro-tecnico">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os técnicos</SelectItem>
                    {tecnicosDisponiveis.map((nome) => (
                      <SelectItem key={nome} value={nome}>
                        {nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Status */}
            <div className="space-y-2 border-t pt-4">
              <Label>Status do lote</Label>
              <RadioGroup
                value={filtros.status}
                onValueChange={(v) =>
                  onChange({ ...filtros, status: v as FiltroStatus })
                }
                className="flex flex-wrap gap-4"
              >
                {(
                  [
                    ["todos", "Todos"],
                    ["Confirmada", "Confirmadas"],
                    ["Cancelada", "Canceladas"],
                    ["Mista", "Mistas"],
                  ] as Array<[FiltroStatus, string]>
                ).map(([valor, label]) => (
                  <div key={valor} className="flex items-center gap-2">
                    <RadioGroupItem value={valor} id={`status-${valor}`} />
                    <Label
                      htmlFor={`status-${valor}`}
                      className="cursor-pointer font-normal"
                    >
                      {label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}