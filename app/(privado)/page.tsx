"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowRight,
  Clock,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useAuth } from "@/contexts/auth-context"
import { listarTodosPontos } from "@/lib/actions/pontos"
import { listarTecnicos } from "@/lib/actions/tecnicos"
import { listarRotasPorStatus } from "@/lib/actions/rotas"
import type { Rota } from "@/lib/db/rotas"
import { IconeModo } from "@/lib/modos-transporte"
import { formatarDuracao, nomeAmigavelModo } from "@/app/(privado)/historico/_components/historico-formatters"

// ============================================================
// HELPERS DE DATA
// ============================================================

function isHoje(ts: Rota["criadoEm"]): boolean {
  if (!ts) return false
  const d = ts
  const hoje = new Date()
  return (
    d.getFullYear() === hoje.getFullYear() &&
    d.getMonth() === hoje.getMonth() &&
    d.getDate() === hoje.getDate()
  )
}

function isNestesMes(ts: Rota["criadoEm"]): boolean {
  if (!ts) return false
  const d = ts
  const hoje = new Date()
  return (
    d.getFullYear() === hoje.getFullYear() && d.getMonth() === hoje.getMonth()
  )
}

// ============================================================
// PÁGINA
// ============================================================

export default function InicioPage() {
  const { user } = useAuth()

  const [pontosPendentes, setPontosPendentes] = useState(0)
  const [pontosAgendados, setPontosAgendados] = useState(0)
  const [tecnicosDisponiveis, setTecnicosDisponiveis] = useState(0)
  const [rotasConfirmadas, setRotasConfirmadas] = useState<Rota[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let cancelado = false

    async function carregar() {
      try {
        const [pontos, tecnicos, rotas] = await Promise.all([
          listarTodosPontos(),
          listarTecnicos(),
          listarRotasPorStatus("Confirmada"),
        ])
        if (cancelado) return

        setPontosPendentes(pontos.filter((p) => p.status === "Pendente").length)
        setPontosAgendados(pontos.filter((p) => p.status === "Agendado").length)
        setTecnicosDisponiveis(
          tecnicos.filter((t) => t.latitude !== null && t.longitude !== null && t.ativo !== false)
            .length
        )
        setRotasConfirmadas(rotas)
      } catch (err) {
        // Navegar antes do fetch terminar aborta a server action ("Failed to
        // fetch"). Após o unmount é ruído benigno — ignora sem logar.
        if (cancelado) return
        console.error("Erro ao carregar dashboard:", err)
      } finally {
        if (!cancelado) setCarregando(false)
      }
    }

    carregar()
    return () => {
      cancelado = true
    }
  }, [])

  const rotasHoje = useMemo(
    () => rotasConfirmadas.filter((r) => isHoje(r.criadoEm)),
    [rotasConfirmadas]
  )

  const rotasNoMes = useMemo(
    () => rotasConfirmadas.filter((r) => isNestesMes(r.criadoEm)),
    [rotasConfirmadas]
  )

  const tempoMedioSeg = useMemo(() => {
    const comMetrica = rotasNoMes.filter(
      (r) => (r.metricas[r.modoPrincipal]?.duracaoSegundos ?? 0) > 0
    )
    if (comMetrica.length === 0) return 0
    const soma = comMetrica.reduce(
      (acc, r) => acc + (r.metricas[r.modoPrincipal]?.duracaoSegundos ?? 0),
      0
    )
    return Math.round(soma / comMetrica.length)
  }, [rotasNoMes])

  const saudacao = useMemo(() => {
    const h = new Date().getHours()
    if (h < 12) return "Bom dia"
    if (h < 18) return "Boa tarde"
    return "Boa noite"
  }, [])

  return (
    <div className="space-y-8">
      {/* HEADER — saudação em accent, nome em Archivo, régua inferior e a ação
          primária do dia à direita (protótipo v2). */}
      <header className="flex flex-wrap items-end justify-between gap-6 border-b pb-[22px]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">
            {saudacao}
          </p>
          <h1 className="mt-2 font-heading text-[38px] font-bold leading-[1.1] tracking-[-0.02em]">
            {user?.name ?? "Administrador"}
          </h1>
          <p className="mt-1.5 text-sm tabular-nums text-muted-foreground">
            {new Date().toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        <Button asChild className="h-11 gap-2 px-6 text-[15px]">
          <Link href="/calcular-rotas">
            Calcular rotas
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </header>

      {/* HERO — "Rodando agora" ocupa a largura e os indicadores do momento viram
          uma coluna de tiles de 300px ao lado (protótipo v2).

          A grade de seis cards de métrica saiu da posição de destaque: o que
          importa ao abrir o sistema é o que está rodando, não seis números. Nenhum
          dos seis se perdeu — quatro são os tiles desta coluna (os do "agora", com
          link de ação) e dois vão para "Mês atual", que é o recorte deles. */}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="overflow-hidden rounded-xl border border-t-2 border-t-primary bg-card shadow-[var(--shadow-1)]">
          <div className="flex items-center justify-between gap-4 border-b px-[22px] py-4">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className={`size-2 shrink-0 rounded-full ${
                  rotasHoje.length > 0 ? "bg-ok" : "bg-muted-foreground/40"
                }`}
              />
              <h2 className="text-[17px] font-semibold">Rodando agora</h2>
              <span className="text-[13px] tabular-nums text-muted-foreground">
                {rotasHoje.length}{" "}
                {rotasHoje.length === 1 ? "rota em campo" : "rotas em campo"}
              </span>
            </div>
            <Button asChild variant="ghost" size="sm" className="gap-1.5 text-[13px]">
              <Link href="/historico">
                Histórico completo
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>

          {carregando ? (
            <SkeletonCronograma />
          ) : rotasHoje.length === 0 ? (
            <div className="px-[22px] py-12 text-center">
              {/* Empty state diz o que fazer, não que está vazio. */}
              <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-accent">
                <Clock className="size-5 text-primary" />
              </div>
              <p className="font-heading text-lg">Nenhuma rota confirmada hoje</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Calcule e confirme alocações para vê-las aqui.
              </p>
              <Button asChild className="mt-4 gap-2" size="sm">
                <Link href="/calcular-rotas">
                  Calcular rotas
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-[22px]">Técnico</TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead>Modo</TableHead>
                  <TableHead className="pr-[22px] text-right">Tempo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rotasHoje.map((rota) => (
                  <LinhaRota key={rota.id} rota={rota} />
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        {/* Indicadores do AGORA — os que têm ação, em tiles compactos. */}
        <div className="flex flex-col gap-3">
          <TileKpi
            valor={carregando ? "—" : String(pontosPendentes)}
            label="Pontos pendentes"
            acao="Calcular rotas"
            href="/calcular-rotas"
            zero={!carregando && pontosPendentes === 0}
          />
          <TileKpi
            valor={carregando ? "—" : String(pontosAgendados)}
            label="Pontos agendados"
            acao="Ver histórico"
            href="/historico"
            zero={!carregando && pontosAgendados === 0}
          />
          <TileKpi
            valor={carregando ? "—" : String(tecnicosDisponiveis)}
            label="Técnicos disponíveis"
            acao="Gerenciar técnicos"
            href="/admin/tecnicos"
            zero={!carregando && tecnicosDisponiveis === 0}
          />
          <TileKpi
            valor={carregando ? "—" : String(rotasHoje.length)}
            label="Rotas confirmadas hoje"
            descricao="cronograma do dia"
            zero={!carregando && rotasHoje.length === 0}
          />
        </div>
      </div>

      {/* MÊS ATUAL — os dois indicadores que são recorte do mês. */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="text-[17px] font-semibold">Mês atual</h2>
          <span className="text-[13px] text-muted-foreground">
            {new Date().toLocaleString("pt-BR", { month: "long" })} começou há{" "}
            <span className="tabular-nums">{new Date().getDate() - 1}</span>{" "}
            {new Date().getDate() - 1 === 1 ? "dia" : "dias"}
          </span>
        </div>
        <div className="grid max-w-[620px] gap-3.5 sm:grid-cols-2">
          <CardMes
            valor={carregando ? "—" : String(rotasNoMes.length)}
            label="Alocações no mês"
            descricao="rotas confirmadas desde o dia 1º"
            zero={!carregando && rotasNoMes.length === 0}
          />
          <CardMes
            valor={
              carregando || tempoMedioSeg === 0
                ? "—"
                : formatarDuracao(tempoMedioSeg)
            }
            label="Tempo médio de deslocamento"
            descricao="por rota confirmada no mês"
            zero={!carregando && tempoMedioSeg === 0}
          />
        </div>
      </section>

      {/* ACESSO RÁPIDO */}
      <section className="space-y-3">
        <h2 className="text-[17px] font-semibold">Acesso rápido</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <BotaoAtalho href="/calcular-rotas" label="Calcular Rotas" />
          <BotaoAtalho href="/historico" label="Histórico" />
          <BotaoAtalho href="/admin/localidades" label="Localidades" />
          <BotaoAtalho href="/admin/tecnicos" label="Técnicos" />
        </div>
      </section>
    </div>
  )
}

// ============================================================
// SUBCOMPONENTES
// ============================================================

/**
 * Tile de indicador do "agora" — coluna de 300px ao lado do que está rodando.
 *
 * Zerado recolhe: número e rótulo em `text-muted` e o link de ação sai, porque
 * não há o que acionar sobre nada (system.md §5.5). O tile não desaparece — a
 * ausência é informação.
 */
function TileKpi({
  valor,
  label,
  acao,
  href,
  descricao,
  zero,
}: {
  valor: string
  label: string
  acao?: string
  href?: string
  descricao?: string
  zero?: boolean
}) {
  const mostrarAcao = acao && href && !zero
  return (
    <div className="flex items-center gap-4 rounded-xl border border-t-2 border-t-primary bg-card px-[18px] py-4 shadow-[var(--shadow-1)]">
      <span
        className={`min-w-[44px] font-heading text-[34px] font-bold leading-none tabular-nums ${
          zero ? "text-muted-foreground" : ""
        }`}
      >
        {valor}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-semibold leading-tight ${
            zero ? "text-muted-foreground" : ""
          }`}
        >
          {label}
        </p>
        {mostrarAcao ? (
          <Link
            href={href}
            className="mt-0.5 inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary hover:text-brand-hover"
          >
            {acao}
            <ArrowRight className="size-3" />
          </Link>
        ) : (
          descricao && (
            <p className="mt-px text-[12.5px] text-muted-foreground">
              {descricao}
            </p>
          )
        )}
      </div>
    </div>
  )
}

/** Card de indicador do mês — mesma regra do zero. */
function CardMes({
  valor,
  label,
  descricao,
  zero,
}: {
  valor: string
  label: string
  descricao: string
  zero?: boolean
}) {
  return (
    <div className="rounded-xl border border-t-2 border-t-primary bg-card px-[18px] py-4 shadow-[var(--shadow-1)]">
      <p
        className={`font-heading text-[26px] font-bold leading-none tabular-nums ${
          zero ? "text-muted-foreground" : ""
        }`}
      >
        {valor}
      </p>
      <p
        className={`mt-1.5 text-[13px] font-semibold leading-tight ${
          zero ? "text-muted-foreground" : ""
        }`}
      >
        {label}
      </p>
      <p className="mt-px text-[12.5px] text-muted-foreground">{descricao}</p>
    </div>
  )
}

function LinhaRota({ rota }: { rota: Rota }) {
  const duracaoSeg = rota.metricas[rota.modoPrincipal]?.duracaoSegundos ?? null

  return (
    <TableRow>
      <TableCell className="pl-5">
        <p className="font-medium" title={rota.tecnicoNome}>{rota.tecnicoNome || "—"}</p>
        <p className="text-xs text-muted-foreground truncate max-w-[180px]" title={rota.origem.endereco}>
          {rota.origem.endereco}
        </p>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="font-mono text-xs">{rota.umNome}</Badge>
        <p className="mt-1 text-xs text-muted-foreground truncate max-w-[200px]" title={rota.destino.endereco}>
          {rota.destino.endereco}
        </p>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5 text-sm">
          <IconeModo modo={rota.modoPrincipal} className="h-4 w-4 text-muted-foreground" />
          <span>{nomeAmigavelModo(rota.modoPrincipal)}</span>
        </div>
      </TableCell>
      <TableCell className="pr-5 text-right">
        {duracaoSeg != null ? (
          <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold tabular-nums text-primary">
            {formatarDuracao(duracaoSeg)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  )
}

function BotaoAtalho({ href, label }: { href: string; label: string }) {
  return (
    <Button asChild variant="outline" className="h-12 w-full justify-between gap-2">
      <Link href={href}>
        {label}
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </Link>
    </Button>
  )
}

function SkeletonCronograma() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-lg bg-muted/50" />
      ))}
    </div>
  )
}
