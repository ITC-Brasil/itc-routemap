"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  MapPin,
  Timer,
  TrendingUp,
  Users,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
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
import { useAuth } from "@/contexts/auth-context"
import { listarTodosPontos } from "@/lib/firestore/pontos"
import { listarTecnicos } from "@/lib/firestore/tecnicos"
import { listarRotasPorStatus, type Rota } from "@/lib/firestore/rotas"
import { IconeModo } from "@/lib/modos-transporte"
import { formatarDuracao, nomeAmigavelModo } from "@/app/(privado)/historico/_components/historico-formatters"

// ============================================================
// HELPERS DE DATA
// ============================================================

function isHoje(ts: Rota["criadoEm"]): boolean {
  if (!ts) return false
  const d = ts.toDate()
  const hoje = new Date()
  return (
    d.getFullYear() === hoje.getFullYear() &&
    d.getMonth() === hoje.getMonth() &&
    d.getDate() === hoje.getDate()
  )
}

function isNestesMes(ts: Rota["criadoEm"]): boolean {
  if (!ts) return false
  const d = ts.toDate()
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
          tecnicos.filter((t) => t.latitude !== null && t.longitude !== null)
            .length
        )
        setRotasConfirmadas(rotas)
      } catch (err) {
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
      {/* HEADER */}
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          {saudacao}
        </p>
        <h1 className="mt-1 font-heading text-4xl">
          {user?.displayName ?? "Administrador"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {new Date().toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      {/* KPIs */}
      <section className="space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Visão geral
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <CardKpi
            icone={<MapPin className="h-5 w-5 text-primary" />}
            valor={carregando ? "—" : String(pontosPendentes)}
            label="Pontos pendentes"
            descricao="aguardando alocação"
            href="/calcular-rotas"
            linkLabel="Calcular rotas"
            destaque={pontosPendentes > 0}
          />
          <CardKpi
            icone={<CheckCircle2 className="h-5 w-5 text-itc-sucesso" />}
            valor={carregando ? "—" : String(pontosAgendados)}
            label="Pontos agendados"
            descricao="rotas confirmadas ativas"
            href="/historico"
            linkLabel="Ver histórico"
          />
          <CardKpi
            icone={<Users className="h-5 w-5 text-primary" />}
            valor={carregando ? "—" : String(tecnicosDisponiveis)}
            label="Técnicos disponíveis"
            descricao="com localização cadastrada"
            href="/admin/tecnicos"
            linkLabel="Gerenciar técnicos"
          />
          <CardKpi
            icone={<CalendarDays className="h-5 w-5 text-primary" />}
            valor={carregando ? "—" : String(rotasHoje.length)}
            label="Rotas confirmadas hoje"
            descricao="cronograma do dia"
          />
          <CardKpi
            icone={<TrendingUp className="h-5 w-5 text-primary" />}
            valor={carregando ? "—" : String(rotasNoMes.length)}
            label="Alocações no mês"
            descricao={`${new Date().toLocaleString("pt-BR", { month: "long" })} atual`}
          />
          <CardKpi
            icone={<Timer className="h-5 w-5 text-primary" />}
            valor={
              carregando
                ? "—"
                : tempoMedioSeg > 0
                  ? formatarDuracao(tempoMedioSeg)
                  : "—"
            }
            label="Tempo médio"
            descricao="de deslocamento no mês"
          />
        </div>
      </section>

      {/* CRONOGRAMA DO DIA */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Cronograma de hoje
          </h2>
          {rotasHoje.length > 0 && (
            <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs">
              <Link href="/historico">
                Ver histórico completo
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          )}
        </div>

        {carregando ? (
          <SkeletonCronograma />
        ) : rotasHoje.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Clock className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="font-medium text-muted-foreground">
                Nenhuma rota confirmada hoje
              </p>
              <p className="mt-1 text-sm text-muted-foreground/70">
                Calcule e confirme alocações para elas aparecerem aqui.
              </p>
              <Button asChild className="mt-4 gap-2" size="sm">
                <Link href="/calcular-rotas">
                  Calcular rotas
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Técnico</TableHead>
                    <TableHead>Destino</TableHead>
                    <TableHead>Modo</TableHead>
                    <TableHead className="pr-5 text-right">Tempo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rotasHoje.map((rota) => (
                    <LinhaRota key={rota.id} rota={rota} />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </section>

      {/* ACESSO RÁPIDO */}
      <section className="space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Acesso rápido
        </h2>
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

function CardKpi({
  icone,
  valor,
  label,
  descricao,
  href,
  linkLabel,
  destaque,
}: {
  icone: React.ReactNode
  valor: string
  label: string
  descricao: string
  href?: string
  linkLabel?: string
  destaque?: boolean
}) {
  const classes = [
    href ? "card-interactive" : "",
    destaque ? "border-primary/40 bg-primary/5" : "",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <Card className={classes || undefined}>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-primary/10 p-2.5">{icone}</div>
          <div className="min-w-0 flex-1">
            <p className="font-heading text-3xl leading-tight">{valor}</p>
            <p className="text-xs font-medium text-foreground">{label}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{descricao}</p>
        {href && linkLabel && (
          <Button asChild variant="ghost" size="sm" className="h-7 justify-start gap-1 px-0 text-xs text-primary">
            <Link href={href}>
              {linkLabel}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
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
          <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
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
