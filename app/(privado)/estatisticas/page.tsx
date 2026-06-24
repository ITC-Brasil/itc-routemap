"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight, BarChart3, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { listarRotas, type Rota, type ModoTransporte } from "@/lib/firestore/rotas"
import { IconeModo } from "@/lib/modos-transporte"
import { formatarDuracao, nomeAmigavelModo } from "@/app/(privado)/historico/_components/historico-formatters"

// ============================================================
// TIPOS DERIVADOS
// ============================================================

type EstatisticaTecnico = {
  tecnicoId: string
  tecnicoNome: string
  umsAtendidas: number
  tempoTotalSeg: number
  tempoMedioSeg: number
  modoPrincipal: ModoTransporte
}

type EstatisticaUM = {
  umNome: string
  raNome: string
  visitas: number
  ultimaVisita: Date | null
}

type EstatisticaModo = {
  modo: ModoTransporte
  qtd: number
  percentual: number
}

// ============================================================
// PÁGINA
// ============================================================

export default function EstatisticasPage() {
  const [rotas, setRotas] = useState<Rota[]>([])
  const [carregando, setCarregando] = useState(true)

  const carregar = async () => {
    setCarregando(true)
    try {
      const todas = await listarRotas()
      setRotas(todas.filter((r) => r.status === "Confirmada"))
    } catch (err) {
      console.error("Erro ao carregar estatísticas:", err)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  // ── INDICADOR 1: ranking de técnicos ─────────────────────
  const rankingTecnicos = useMemo<EstatisticaTecnico[]>(() => {
    const mapa = new Map<
      string,
      {
        nome: string
        ums: Set<string>
        tempoTotal: number
        modoCont: Map<ModoTransporte, number>
      }
    >()

    for (const r of rotas) {
      if (!r.tecnicoId) continue
      if (!mapa.has(r.tecnicoId)) {
        mapa.set(r.tecnicoId, {
          nome: r.tecnicoNome,
          ums: new Set(),
          tempoTotal: 0,
          modoCont: new Map(),
        })
      }
      const entry = mapa.get(r.tecnicoId)!
      entry.ums.add(r.umNome)
      const tempo = r.metricas[r.modoPrincipal]?.duracaoSegundos ?? 0
      entry.tempoTotal += tempo
      entry.modoCont.set(
        r.modoPrincipal,
        (entry.modoCont.get(r.modoPrincipal) ?? 0) + 1
      )
    }

    return Array.from(mapa.entries())
      .map(([id, e]) => {
        const ums = e.ums.size
        let topModo: ModoTransporte = "DRIVE"
        let topCont = 0
        for (const [m, c] of e.modoCont) {
          if (c > topCont) {
            topModo = m
            topCont = c
          }
        }
        return {
          tecnicoId: id,
          tecnicoNome: e.nome,
          umsAtendidas: ums,
          tempoTotalSeg: e.tempoTotal,
          tempoMedioSeg: ums > 0 ? Math.round(e.tempoTotal / ums) : 0,
          modoPrincipal: topModo,
        }
      })
      .sort((a, b) => b.umsAtendidas - a.umsAtendidas)
  }, [rotas])

  // ── INDICADOR 2: UMs por frequência ──────────────────────
  const rankingUMs = useMemo<EstatisticaUM[]>(() => {
    const mapa = new Map<
      string,
      { raNome: string; visitas: number; ultima: Date | null }
    >()

    for (const r of rotas) {
      if (!r.umNome) continue
      const data = r.criadoEm?.toDate() ?? null
      const existing = mapa.get(r.umNome)
      if (!existing) {
        mapa.set(r.umNome, { raNome: r.destino?.endereco?.split(",")[0] ?? "", visitas: 1, ultima: data })
      } else {
        existing.visitas++
        if (data && (!existing.ultima || data > existing.ultima)) {
          existing.ultima = data
        }
      }
    }

    return Array.from(mapa.entries())
      .map(([um, e]) => ({ umNome: um, raNome: e.raNome, visitas: e.visitas, ultimaVisita: e.ultima }))
      .sort((a, b) => b.visitas - a.visitas)
  }, [rotas])

  // ── INDICADOR 3: distribuição por modo ───────────────────
  const distribuicaoModos = useMemo<EstatisticaModo[]>(() => {
    const cont = new Map<ModoTransporte, number>()
    for (const r of rotas) {
      cont.set(r.modoPrincipal, (cont.get(r.modoPrincipal) ?? 0) + 1)
    }
    const total = rotas.length
    return Array.from(cont.entries())
      .map(([modo, qtd]) => ({ modo, qtd, percentual: total > 0 ? Math.round((qtd / total) * 100) : 0 }))
      .sort((a, b) => b.qtd - a.qtd)
  }, [rotas])

  return (
    <div className="space-y-8">
      {/* HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Fase 5
          </p>
          <h1 className="mt-1 font-heading text-4xl">Estatísticas</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Indicadores gerenciais derivados das rotas confirmadas: desempenho
            por técnico, frequência de UMs e distribuição por modo de transporte.
          </p>
        </div>
        <Button
          onClick={carregar}
          disabled={carregando}
          variant="outline"
          size="lg"
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
          Recarregar
        </Button>
      </div>

      {carregando ? (
        <SkeletonEstatisticas />
      ) : rotas.length === 0 ? (
        <EstadoVazio />
      ) : (
        <>
          {/* INDICADOR 1 — Ranking de técnicos */}
          <section className="space-y-3">
            <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Ranking de técnicos por desempenho
            </h2>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-5 w-10">#</TableHead>
                      <TableHead>Técnico</TableHead>
                      <TableHead className="text-right">UMs atendidas</TableHead>
                      <TableHead className="text-right">Tempo total</TableHead>
                      <TableHead className="text-right">Tempo médio</TableHead>
                      <TableHead>Modo principal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rankingTecnicos.map((t, i) => (
                      <TableRow key={t.tecnicoId}>
                        <TableCell className="pl-5 font-mono text-xs text-muted-foreground">
                          {i + 1}
                        </TableCell>
                        <TableCell className="font-medium">{t.tecnicoNome}</TableCell>
                        <TableCell className="text-right font-heading text-lg">
                          {t.umsAtendidas}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {formatarDuracao(t.tempoTotalSeg)}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {formatarDuracao(t.tempoMedioSeg)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm">
                            <IconeModo modo={t.modoPrincipal} className="h-4 w-4 text-muted-foreground" />
                            {nomeAmigavelModo(t.modoPrincipal)}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>

          {/* INDICADOR 2 — UMs por frequência */}
          <section className="space-y-3">
            <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              UMs por frequência de atendimento
            </h2>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-5">UM</TableHead>
                      <TableHead>Referência</TableHead>
                      <TableHead className="text-right">Visitas confirmadas</TableHead>
                      <TableHead>Última visita</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rankingUMs.slice(0, 20).map((u) => (
                      <TableRow key={u.umNome}>
                        <TableCell className="pl-5 font-mono font-semibold text-sm">
                          {u.umNome}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {u.raNome || "—"}
                        </TableCell>
                        <TableCell className="text-right font-heading text-lg">
                          {u.visitas}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {u.ultimaVisita
                            ? u.ultimaVisita.toLocaleDateString("pt-BR", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {rankingUMs.length > 20 && (
                  <p className="px-5 py-3 text-xs text-muted-foreground border-t">
                    Exibindo top 20 de {rankingUMs.length} UMs.
                  </p>
                )}
              </CardContent>
            </Card>
          </section>

          {/* INDICADOR 3 — Distribuição por modo */}
          <section className="space-y-3">
            <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Distribuição por modo de transporte
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {distribuicaoModos.map((m) => (
                <CardModo key={m.modo} stat={m} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

// ============================================================
// CARD DE MODO (barra proporcional sem biblioteca externa)
// ============================================================

function CardModo({ stat }: { stat: EstatisticaModo }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <IconeModo modo={stat.modo} className="h-5 w-5 text-primary" />
          <span className="font-medium">{nomeAmigavelModo(stat.modo)}</span>
        </div>
        <div>
          <p className="font-heading text-3xl leading-none">{stat.qtd}</p>
          <p className="text-xs text-muted-foreground">
            {stat.qtd === 1 ? "rota" : "rotas"} · {stat.percentual}%
          </p>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${stat.percentual}%` }}
          />
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================
// ESTADOS
// ============================================================

function SkeletonEstatisticas() {
  return (
    <div className="space-y-8">
      {[1, 2].map((i) => (
        <div key={i} className="space-y-3">
          <div className="h-3 w-48 animate-pulse rounded bg-muted" />
          <Card>
            <CardContent className="space-y-3 p-5">
              {[1, 2, 3, 4].map((j) => (
                <div key={j} className="h-10 animate-pulse rounded bg-muted" />
              ))}
            </CardContent>
          </Card>
        </div>
      ))}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="space-y-3 p-5">
              <div className="h-5 w-24 animate-pulse rounded bg-muted" />
              <div className="h-9 w-12 animate-pulse rounded bg-muted" />
              <div className="h-2 w-full animate-pulse rounded-full bg-muted" />
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
          <BarChart3 className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h2 className="font-heading text-2xl">Nenhuma rota confirmada</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            As estatísticas são calculadas a partir de rotas com status{" "}
            <strong>Confirmada</strong>. Calcule e confirme alocações para
            os indicadores aparecerem aqui.
          </p>
        </div>
        <Button asChild className="mt-2 gap-2">
          <Link href="/calcular-rotas">
            Calcular rotas
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
