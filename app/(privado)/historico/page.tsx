"use client"

import { useEffect, useMemo, useState } from "react"
import { History, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  listarLotes,
  type LoteSumario,
} from "@/lib/firestore/lotes"
import { CardLote } from "./_components/card-lote"
import { CancelarLoteDialog } from "./_components/cancelar-lote-dialog"
import {
  FiltrosHistoricoComp,
  type FiltrosHistorico,
} from "./_components/filtros-historico"

const FILTROS_INICIAIS: FiltrosHistorico = {
  periodo: undefined,
  tecnico: "todos",
  status: "todos",
}

export default function HistoricoPage() {
  const [lotes, setLotes] = useState<LoteSumario[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtros, setFiltros] = useState<FiltrosHistorico>(FILTROS_INICIAIS)
  const [loteParaCancelar, setLoteParaCancelar] = useState<LoteSumario | null>(
    null
  )

  // ====== CARREGAMENTO ======
  useEffect(() => {
    let cancelado = false

    async function carregar() {
      try {
        const lista = await listarLotes()
        if (cancelado) return
        setLotes(lista)
      } catch (err) {
        if (cancelado) return
        console.error("Erro ao carregar histórico:", err)
        toast.error("Erro ao carregar histórico", {
          description: err instanceof Error ? err.message : "Tente recarregar.",
        })
      } finally {
        if (!cancelado) setCarregando(false)
      }
    }

    carregar()
    return () => {
      cancelado = true
    }
  }, [])

  const recarregar = async () => {
    try {
      const lista = await listarLotes()
      setLotes(lista)
    } catch (err) {
      console.error("Erro ao recarregar histórico:", err)
      toast.error("Erro ao recarregar histórico")
    }
  }

  // ====== DADOS DERIVADOS ======
  const tecnicosDisponiveis = useMemo(() => {
    const set = new Set<string>()
    for (const lote of lotes) {
      for (const nome of lote.tecnicosNomes) set.add(nome)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"))
  }, [lotes])

  const lotesFiltrados = useMemo(
    () => aplicarFiltros(lotes, filtros),
    [lotes, filtros]
  )

  // Stats agregadas (das rotas dentro dos lotes FILTRADOS)
  const stats = useMemo(() => {
    return lotesFiltrados.reduce(
      (acc, l) => ({
        totalLotes: acc.totalLotes + 1,
        rotasConfirmadas: acc.rotasConfirmadas + l.qtdRotasConfirmadas,
        rotasCanceladas: acc.rotasCanceladas + l.qtdRotasCanceladas,
      }),
      { totalLotes: 0, rotasConfirmadas: 0, rotasCanceladas: 0 }
    )
  }, [lotesFiltrados])

  // ====== RENDER ======
  return (
    <div className="container mx-auto space-y-8 px-4 py-8">
      {/* HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Administração
          </p>
          <h1 className="mt-1 font-heading text-4xl">Histórico de Alocações</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Todos os lotes de alocação confirmados, agrupados por rodada.
            Expanda um lote pra ver as rotas individuais ou cancele lotes inteiros.
          </p>
        </div>
        <Button
          onClick={recarregar}
          disabled={carregando}
          size="lg"
          variant="outline"
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Recarregar
        </Button>
      </div>

      {/* CONTEÚDO */}
      {carregando ? (
        <SkeletonLoading />
      ) : lotes.length === 0 ? (
        <EstadoVazio />
      ) : (
        <>
          {/* STATS */}
          <div className="grid gap-4 sm:grid-cols-3">
            <CardStat
              label="Lotes"
              valor={stats.totalLotes}
              corValor="text-foreground"
            />
            <CardStat
              label="Rotas confirmadas"
              valor={stats.rotasConfirmadas}
              corValor="text-itc-sucesso"
            />
            <CardStat
              label="Rotas canceladas"
              valor={stats.rotasCanceladas}
              corValor="text-destructive"
            />
          </div>

          {/* FILTROS */}
          <FiltrosHistoricoComp
            filtros={filtros}
            tecnicosDisponiveis={tecnicosDisponiveis}
            onChange={setFiltros}
          />

          {/* LISTA DE LOTES */}
          <section className="space-y-3">
            <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              {lotesFiltrados.length}{" "}
              {lotesFiltrados.length === 1
                ? "lote encontrado"
                : "lotes encontrados"}
            </h2>

            {lotesFiltrados.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  Nenhum lote bate com os filtros aplicados.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {lotesFiltrados.map((lote) => (
                  <CardLote
                    key={lote.loteId}
                    lote={lote}
                    onCancelar={setLoteParaCancelar}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* MODAL DE CANCELAMENTO */}
      <CancelarLoteDialog
        lote={loteParaCancelar}
        onClose={() => setLoteParaCancelar(null)}
        onCancelado={recarregar}
      />
    </div>
  )
}

// ============================================================
// SUBCOMPONENTES
// ============================================================

function CardStat({
  label,
  valor,
  corValor,
}: {
  label: string
  valor: number
  corValor: string
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-5">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        <p className={`font-heading text-4xl leading-none ${corValor}`}>
          {valor}
        </p>
      </CardContent>
    </Card>
  )
}

function SkeletonLoading() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="space-y-2 p-5">
              <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              <div className="h-10 w-16 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="space-y-3 p-6">
          <div className="h-4 w-20 animate-pulse rounded bg-muted" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="h-10 animate-pulse rounded bg-muted" />
            <div className="h-10 animate-pulse rounded bg-muted" />
          </div>
        </CardContent>
      </Card>
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-5">
              <div className="space-y-3">
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                <div className="h-6 w-48 animate-pulse rounded bg-muted" />
                <div className="grid grid-cols-4 gap-4 border-t pt-4">
                  {[1, 2, 3, 4].map((j) => (
                    <div key={j} className="space-y-1">
                      <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                      <div className="h-7 w-10 animate-pulse rounded bg-muted" />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function EstadoVazio() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="rounded-full bg-muted p-4">
          <History className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h2 className="font-heading text-2xl">Nenhuma alocação confirmada</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Quando você confirmar a primeira alocação em{" "}
            <strong>Calcular Rotas</strong>, o histórico vai aparecer aqui.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================
// FILTROS
// ============================================================

function aplicarFiltros(
  lotes: LoteSumario[],
  filtros: FiltrosHistorico
): LoteSumario[] {
  return lotes.filter((lote) => {
    // Status do lote
    if (filtros.status !== "todos" && lote.statusLote !== filtros.status) {
      return false
    }

    // Técnico
    if (
      filtros.tecnico !== "todos" &&
      !lote.tecnicosNomes.includes(filtros.tecnico)
    ) {
      return false
    }

    // Período
    if (filtros.periodo?.from) {
      const inicio = new Date(filtros.periodo.from)
      inicio.setHours(0, 0, 0, 0)
      if (lote.dataConfirmacao < inicio) return false
    }
    if (filtros.periodo?.to) {
      const fim = new Date(filtros.periodo.to)
      fim.setHours(23, 59, 59, 999)
      if (lote.dataConfirmacao > fim) return false
    }

    return true
  })
}