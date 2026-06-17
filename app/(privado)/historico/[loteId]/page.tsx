"use client"

// app/(privado)/historico/[loteId]/page.tsx
//
// Página de detalhe de um lote do histórico. Mostra:
//   - Header com data, status do lote, qtd de rotas e botão voltar/cancelar
//   - Banner com justificativa da IA
//   - 4 cards de métricas agregadas (tempo total, tempo médio, técnicos, modo predominante)
//   - Lista de rotas, cada uma expansível com seletor de modo + mapa + métricas
//
// Reaproveita o componente <MapaAlocacao /> da feature calcular-rotas, e
// chama o endpoint /api/routes/single (mesmo fluxo do ResultadoAlocacao).
//
// TODO P4: SeletorModo e helpers IconeModo/MODOS_SELECIONAVEIS estão duplicados
// aqui e em resultado-alocacao.tsx. Centralizar quando estabilizar.

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  ArrowLeft,
  Bike,
  Bus,
  Car,
  ChevronDown,
  ChevronUp,
  Clock,
  PersonStanding,
  Sparkles,
  Timer,
  Train,
  TramFront,
  Users,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  MapaAlocacao,
  type RotaData,
} from "../../calcular-rotas/_components/mapa-alocacao"
import {
  listarRotasPorLote,
  type ModoTransporte,
  type Rota,
} from "@/lib/firestore/rotas"
import type { LoteSumario, StatusLote } from "@/lib/firestore/lotes"
import { CancelarLoteDialog } from "../_components/cancelar-lote-dialog"
import {
  formatarDataHora,
  formatarDistancia,
  formatarDuracao,
  nomeAmigavelModo,
} from "../_components/historico-formatters"

// ============================================================
// TIPOS LOCAIS (cache de rota detalhada, idênticos ao resultado-alocacao)
// ============================================================

type TransitStep = {
  tipo: "transit" | "walking"
  duracaoSegundos: number
  distanciaMetros?: number
  linha?: string
  agencia?: string
  veiculo?: "BUS" | "SUBWAY" | "TRAIN" | "TRAM" | "OTHER"
  saida?: string
  chegada?: string
  paradaSaida?: string
  paradaChegada?: string
  numParadas?: number
  rumo?: string
}

type RotaCacheEntry =
  | { estado: "carregando" }
  | {
      estado: "ok"
      polyline: string | null
      distanciaMetros: number
      duracaoSegundos: number
      transitSteps: TransitStep[]
      partidaIso: string | null
      chegadaIso: string | null
    }
  | { estado: "erro"; mensagem: string }

// Modos disponíveis no seletor (TRANSIT incluso, fetch sob demanda)
const MODOS_SELECIONAVEIS: ModoTransporte[] = [
  "DRIVE",
  "TWO_WHEELER",
  "WALK",
  "TRANSIT",
]

// ============================================================
// PÁGINA
// ============================================================

export default function DetalheLotePage() {
  const params = useParams<{ loteId: string }>()
  const router = useRouter()
  const loteId = params.loteId

  // ====== Estado ======
  const [rotas, setRotas] = useState<Rota[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  // Modo escolhido por rota (começa com modoPrincipal de cada uma)
  const [modosPorRota, setModosPorRota] = useState<
    Map<string, ModoTransporte>
  >(new Map())

  // Cache de rota detalhada: chave = "rotaId|modo"
  const [rotaCache, setRotaCache] = useState<Map<string, RotaCacheEntry>>(
    new Map()
  )

  // Qual rota está expandida (só uma por vez pra economizar mapas)
  const [expandida, setExpandida] = useState<string | null>(null)

  // Modal de cancelamento
  const [mostrarCancelar, setMostrarCancelar] = useState(false)

  // ====== Carregamento inicial ======
  useEffect(() => {
    let cancelado = false

    async function carregar() {
      try {
        const lista = await listarRotasPorLote(loteId)
        if (cancelado) return

        if (lista.length === 0) {
          setErro("Lote não encontrado.")
          return
        }

        // Ordena: Confirmadas primeiro, depois Canceladas, depois Sugeridas,
        // mantendo loteOrdem dentro de cada grupo
        const rank: Record<string, number> = {
          Confirmada: 0,
          Cancelada: 1,
          Sugerida: 2,
        }
        lista.sort((a, b) => {
          const ra = rank[a.status] ?? 3
          const rb = rank[b.status] ?? 3
          if (ra !== rb) return ra - rb
          return a.loteOrdem - b.loteOrdem
        })
        setRotas(lista)

        // Inicializa modosPorRota com modoPrincipal de cada rota
        const m = new Map<string, ModoTransporte>()
        for (const r of lista) m.set(r.id, r.modoPrincipal)
        setModosPorRota(m)
      } catch (err) {
        if (cancelado) return
        console.error("Erro ao carregar lote:", err)
        setErro(
          err instanceof Error ? err.message : "Erro ao carregar este lote."
        )
      } finally {
        if (!cancelado) setCarregando(false)
      }
    }

    carregar()
    return () => {
      cancelado = true
    }
  }, [loteId])

  // ====== Fetcher de rota detalhada ======
  const carregarRotaDetalhada = useCallback(
    async (rota: Rota, modo: ModoTransporte) => {
      const chave = `${rota.id}|${modo}`
      const existente = rotaCache.get(chave)
      if (existente && existente.estado !== "erro") return

      setRotaCache((prev) =>
        new Map(prev).set(chave, { estado: "carregando" })
      )

      try {
        const res = await fetch("/api/routes/single", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            origem: {
              latitude: rota.origem.latitude,
              longitude: rota.origem.longitude,
            },
            destino: {
              latitude: rota.destino.latitude,
              longitude: rota.destino.longitude,
            },
            modo,
          }),
        })
        const data = await res.json()

        if (!data.sucesso) {
          setRotaCache((prev) =>
            new Map(prev).set(chave, {
              estado: "erro",
              mensagem: data.erro ?? "Erro desconhecido",
            })
          )
          return
        }

        setRotaCache((prev) =>
          new Map(prev).set(chave, {
            estado: "ok",
            polyline: data.polyline,
            distanciaMetros: data.distanciaMetros,
            duracaoSegundos: data.duracaoSegundos,
            transitSteps: data.transitSteps ?? [],
            partidaIso: data.partidaIso ?? null,
            chegadaIso: data.chegadaIso ?? null,
          })
        )
      } catch (err) {
        setRotaCache((prev) =>
          new Map(prev).set(chave, {
            estado: "erro",
            mensagem: err instanceof Error ? err.message : "Erro de rede",
          })
        )
      }
    },
    [rotaCache]
  )

  // ====== Helper: duração efetiva no modo selecionado ======
  const obterDuracaoSeg = useCallback(
    (rota: Rota, modo: ModoTransporte): number | null => {
      if (modo === "TRANSIT") {
        const entry = rotaCache.get(`${rota.id}|TRANSIT`)
        if (entry?.estado === "ok") return entry.duracaoSegundos
        return null
      }
      return rota.metricas[modo]?.duracaoSegundos ?? null
    },
    [rotaCache]
  )

  // ====== Helper: distância no modo selecionado ======
  const obterDistanciaMetros = useCallback(
    (rota: Rota, modo: ModoTransporte): number | null => {
      if (modo === "TRANSIT") {
        const entry = rotaCache.get(`${rota.id}|TRANSIT`)
        if (entry?.estado === "ok") return entry.distanciaMetros
        return null
      }
      return rota.metricas[modo]?.distanciaMetros ?? null
    },
    [rotaCache]
  )

  // ====== Métricas agregadas (recalculam ao trocar modo) ======
  // Só consideramos rotas Confirmadas pra agregação — Canceladas não compõem
  // tempo "executado".
  const rotasAtivas = useMemo(
    () => rotas.filter((r) => r.status === "Confirmada"),
    [rotas]
  )

  const metricasAgregadas = useMemo(() => {
    let totalSeg = 0
    let totalMetros = 0
    let contados = 0
    let comTransitCarregando = false

    for (const rota of rotasAtivas) {
      const modo = modosPorRota.get(rota.id) ?? rota.modoPrincipal
      const seg = obterDuracaoSeg(rota, modo)
      const m = obterDistanciaMetros(rota, modo)

      if (seg != null) {
        totalSeg += seg
        contados++
      } else if (modo === "TRANSIT") {
        comTransitCarregando = true
      }
      if (m != null) totalMetros += m
    }

    return {
      totalSeg,
      totalMetros,
      medioSeg: contados > 0 ? totalSeg / contados : 0,
      contados,
      total: rotasAtivas.length,
      comTransitCarregando,
    }
  }, [rotasAtivas, modosPorRota, obterDuracaoSeg, obterDistanciaMetros])

  // ====== Modo predominante (entre rotas ativas, no estado atual) ======
  const modoPredominante = useMemo<ModoTransporte>(() => {
    if (rotasAtivas.length === 0) return "DRIVE"
    const cont = new Map<ModoTransporte, number>()
    for (const r of rotasAtivas) {
      const m = modosPorRota.get(r.id) ?? r.modoPrincipal
      cont.set(m, (cont.get(m) ?? 0) + 1)
    }
    let top: ModoTransporte = "DRIVE"
    let topC = 0
    for (const [m, c] of cont) {
      if (c > topC) {
        top = m
        topC = c
      }
    }
    return top
  }, [rotasAtivas, modosPorRota])

  // ====== Sumário do lote (pra alimentar o CancelarLoteDialog) ======
  const loteSumario = useMemo<LoteSumario | null>(() => {
    if (rotas.length === 0) return null

    const confirmadas = rotas.filter((r) => r.status === "Confirmada")
    const canceladas = rotas.filter((r) => r.status === "Cancelada")
    const relevantes = [...confirmadas, ...canceladas]
    if (relevantes.length === 0) return null

    let statusLote: StatusLote
    if (canceladas.length === 0) statusLote = "Confirmada"
    else if (confirmadas.length === 0) statusLote = "Cancelada"
    else statusLote = "Mista"

    const datas = relevantes
      .map((r) => (r.criadoEm ? r.criadoEm.toDate() : null))
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime())

    const tecnicosNomes = Array.from(
      new Set(relevantes.map((r) => r.tecnicoNome).filter(Boolean))
    ).sort()
    const umsNomes = Array.from(
      new Set(relevantes.map((r) => r.umNome).filter(Boolean))
    ).sort()

    return {
      loteId,
      dataConfirmacao: datas[0] ?? new Date(),
      qtdRotas: relevantes.length,
      qtdRotasConfirmadas: confirmadas.length,
      qtdRotasCanceladas: canceladas.length,
      qtdPontos: relevantes.length,
      tecnicosNomes,
      umsNomes,
      modoPredominante,
      tempoTotalSegundos: metricasAgregadas.totalSeg,
      distanciaTotalMetros: metricasAgregadas.totalMetros,
      statusLote,
      justificativaGemini:
        relevantes[0]?.loteJustificativa?.trim()
          ? relevantes[0].loteJustificativa
          : undefined,
    }
  }, [
    rotas,
    loteId,
    modoPredominante,
    metricasAgregadas.totalSeg,
    metricasAgregadas.totalMetros,
  ])

  // ====== Handlers ======
  const handleExpandir = (rotaId: string) => {
    if (expandida === rotaId) {
      setExpandida(null)
      return
    }
    setExpandida(rotaId)
    const rota = rotas.find((r) => r.id === rotaId)
    if (rota) {
      const modo = modosPorRota.get(rotaId) ?? rota.modoPrincipal
      void carregarRotaDetalhada(rota, modo)
    }
  }

  const handleTrocarModo = (rotaId: string, novoModo: ModoTransporte) => {
    setModosPorRota((prev) => new Map(prev).set(rotaId, novoModo))
    const rota = rotas.find((r) => r.id === rotaId)
    if (rota) void carregarRotaDetalhada(rota, novoModo)
  }

  const recarregarAposCancelamento = async () => {
    try {
      const lista = await listarRotasPorLote(loteId)
      const rank: Record<string, number> = {
        Confirmada: 0,
        Cancelada: 1,
        Sugerida: 2,
      }
      lista.sort((a, b) => {
        const ra = rank[a.status] ?? 3
        const rb = rank[b.status] ?? 3
        if (ra !== rb) return ra - rb
        return a.loteOrdem - b.loteOrdem
      })
      setRotas(lista)
    } catch (err) {
      console.error("Erro ao recarregar rotas:", err)
    }
  }

  // ====== Render ======
  if (carregando) {
    return <SkeletonLoading />
  }

  if (erro || rotas.length === 0) {
    return (
      <div>
        <Button
          variant="ghost"
          onClick={() => router.push("/historico")}
          className="mb-4 gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar pro histórico
        </Button>
        <Card>
          <CardContent className="py-16 text-center">
            <h2 className="mb-2 font-heading text-2xl">Lote não encontrado</h2>
            <p className="text-muted-foreground">
              {erro ??
                "Esse lote pode ter sido removido ou o link está incorreto."}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Header dinâmico
  const primeiraRota = rotas[0]
  const confirmadas = rotas.filter((r) => r.status === "Confirmada")
  const canceladas = rotas.filter((r) => r.status === "Cancelada")
  let statusLote: StatusLote = "Confirmada"
  if (canceladas.length > 0 && confirmadas.length === 0) statusLote = "Cancelada"
  else if (canceladas.length > 0) statusLote = "Mista"

  const dataLote = primeiraRota.criadoEm
    ? primeiraRota.criadoEm.toDate()
    : new Date()
  const loteIdCurto = loteId.slice(0, 8)
  const podeCancelar = confirmadas.length > 0
  const totalTecnicosUnicos = new Set(rotas.map((r) => r.tecnicoNome)).size
  const totalUmsUnicas = new Set(rotas.map((r) => r.umNome)).size

  return (
    <div className="space-y-8">
      {/* HEADER */}
      <div>
        <Button
          variant="ghost"
          onClick={() => router.push("/historico")}
          className="-ml-2 gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar pro histórico
        </Button>

        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Lote {loteIdCurto}
              </p>
              <StatusBadge statusLote={statusLote} />
            </div>
            <h1 className="mt-1 font-heading text-4xl">
              {formatarDataHora(dataLote)}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {rotas.length} rota{rotas.length === 1 ? "" : "s"} ·{" "}
              {totalTecnicosUnicos} técnico
              {totalTecnicosUnicos === 1 ? "" : "s"} · {totalUmsUnicas} UM
              {totalUmsUnicas === 1 ? "" : "s"}
            </p>
          </div>

          {podeCancelar && (
            <Button
              variant="outline"
              onClick={() => setMostrarCancelar(true)}
              className="gap-2 text-destructive hover:text-destructive"
            >
              Cancelar lote
            </Button>
          )}
        </div>
      </div>

      {/* JUSTIFICATIVA */}
      {primeiraRota.loteJustificativa &&
        primeiraRota.loteJustificativa.trim().length > 0 && (
          <JustificativaBanner texto={primeiraRota.loteJustificativa} />
        )}

      {/* MÉTRICAS AGREGADAS */}
      {rotasAtivas.length > 0 && (
        <MetricasCards
          derivadas={metricasAgregadas}
          modoPredominante={modoPredominante}
        />
      )}

      {/* LISTA DE ROTAS */}
      <section className="space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Rotas ({rotas.length})
        </h2>
        <div className="space-y-3">
          {rotas.map((rota, i) => {
            const modo = modosPorRota.get(rota.id) ?? rota.modoPrincipal
            const expandido = expandida === rota.id
            const rotaEntry = rotaCache.get(`${rota.id}|${modo}`)
            return (
              <LinhaRotaHistorico
                key={rota.id}
                rota={rota}
                ordem={i + 1}
                modo={modo}
                expandido={expandido}
                rotaEntry={rotaEntry}
                duracaoSeg={obterDuracaoSeg(rota, modo)}
                distanciaMetros={obterDistanciaMetros(rota, modo)}
                onExpandir={() => handleExpandir(rota.id)}
                onTrocarModo={(m) => handleTrocarModo(rota.id, m)}
              />
            )
          })}
        </div>
      </section>

      {/* MODAL DE CANCELAMENTO */}
      <CancelarLoteDialog
        lote={mostrarCancelar ? loteSumario : null}
        onClose={() => setMostrarCancelar(false)}
        onCancelado={recarregarAposCancelamento}
      />
    </div>
  )
}

// ============================================================
// SUBCOMPONENTES
// ============================================================

function JustificativaBanner({ texto }: { texto: string }) {
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex gap-4 p-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 space-y-1">
          <p className="font-mono text-xs uppercase tracking-widest text-primary">
            Justificativa da IA
          </p>
          <p className="text-sm leading-relaxed">{texto}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function MetricasCards({
  derivadas,
  modoPredominante,
}: {
  derivadas: {
    totalSeg: number
    totalMetros: number
    medioSeg: number
    contados: number
    total: number
    comTransitCarregando: boolean
  }
  modoPredominante: ModoTransporte
}) {
  const parcial =
    derivadas.comTransitCarregando || derivadas.contados < derivadas.total

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <CardMetrica
        icon={<Clock className="h-5 w-5 text-primary" />}
        valor={formatarDuracao(derivadas.totalSeg)}
        sufixo={parcial ? "*" : undefined}
        label={parcial ? "Tempo total (parcial)" : "Tempo total agregado"}
      />
      <CardMetrica
        icon={<Timer className="h-5 w-5 text-primary" />}
        valor={formatarDuracao(derivadas.medioSeg)}
        sufixo={parcial ? "*" : undefined}
        label="Tempo médio por técnico"
      />
      <CardMetrica
        icon={<Users className="h-5 w-5 text-primary" />}
        valor={`${derivadas.total}`}
        label={
          derivadas.total === 1
            ? "rota confirmada"
            : "rotas confirmadas"
        }
      />
      <CardMetrica
        icon={
          <IconeModo modo={modoPredominante} className="h-5 w-5 text-primary" />
        }
        valor={nomeAmigavelModo(modoPredominante)}
        label="Modo predominante"
      />
    </div>
  )
}

function CardMetrica({
  icon,
  valor,
  sufixo,
  label,
}: {
  icon: React.ReactNode
  valor: string
  sufixo?: string
  label: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-5">
        <div className="rounded-full bg-primary/10 p-2.5">{icon}</div>
        <div className="min-w-0">
          <p className="font-heading text-2xl leading-tight">
            {valor}
            {sufixo && (
              <span className="text-base text-muted-foreground"> {sufixo}</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function LinhaRotaHistorico({
  rota,
  ordem,
  modo,
  expandido,
  rotaEntry,
  duracaoSeg,
  distanciaMetros,
  onExpandir,
  onTrocarModo,
}: {
  rota: Rota
  ordem: number
  modo: ModoTransporte
  expandido: boolean
  rotaEntry: RotaCacheEntry | undefined
  duracaoSeg: number | null
  distanciaMetros: number | null
  onExpandir: () => void
  onTrocarModo: (m: ModoTransporte) => void
}) {
  return (
    <Card
      className={
        rota.status === "Cancelada" ? "opacity-70" : undefined
      }
    >
      <CardContent className="space-y-4 p-5">
        {/* Header — sempre visível */}
        <div className="grid gap-4 md:grid-cols-[auto_1fr_1fr_auto_auto] md:items-center">
          <div className="hidden h-10 w-10 items-center justify-center rounded-full bg-muted font-mono text-sm font-semibold text-muted-foreground md:flex">
            {ordem}
          </div>

          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Técnico
            </p>
            <p className="truncate font-medium" title={rota.tecnicoNome}>
              {rota.tecnicoNome || "—"}
            </p>
            <p
              className="truncate text-xs text-muted-foreground"
              title={rota.origem.endereco}
            >
              {rota.origem.endereco}
            </p>
          </div>

          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Destino
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono">
                {rota.umNome}
              </Badge>
              {rota.status === "Cancelada" && (
                <Badge variant="destructive">Cancelada</Badge>
              )}
            </div>
            <p
              className="truncate text-xs text-muted-foreground"
              title={rota.destino.endereco}
            >
              {rota.destino.endereco}
            </p>
          </div>

          {/* Tempo atual no modo selecionado */}
          <div className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary">
            <IconeModo modo={modo} className="h-4 w-4" />
            {duracaoSeg != null ? (
              <span>{formatarDuracao(duracaoSeg)}</span>
            ) : (
              <span className="text-xs">calculando…</span>
            )}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={onExpandir}
            className="gap-1.5"
          >
            {expandido ? (
              <>
                <ChevronUp className="h-4 w-4" /> Fechar
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" /> Ver mapa
              </>
            )}
          </Button>
        </div>

        {/* Detalhes — só visíveis quando expandido */}
        {expandido && (
          <div className="space-y-4 border-t pt-4">
            <SeletorModo
              modoAtual={modo}
              onTrocar={onTrocarModo}
              metricasDisponiveis={rota.metricas}
            />

            <MapaAlocacao
              origem={{
                latitude: rota.origem.latitude,
                longitude: rota.origem.longitude,
              }}
              destino={{
                latitude: rota.destino.latitude,
                longitude: rota.destino.longitude,
              }}
              modo={modo}
              rotaData={
                rotaEntry?.estado === "ok"
                  ? ({
                      polyline: rotaEntry.polyline,
                      distanciaMetros: rotaEntry.distanciaMetros,
                      duracaoSegundos: rotaEntry.duracaoSegundos,
                    } satisfies RotaData)
                  : null
              }
              carregando={rotaEntry?.estado === "carregando"}
              erro={
                rotaEntry?.estado === "erro" ? rotaEntry.mensagem : null
              }
            />

            <div className="flex flex-wrap items-center gap-3 text-sm">
              {duracaoSeg != null && (
                <div className="rounded-md bg-muted px-3 py-1.5">
                  <span className="text-muted-foreground">Tempo:</span>{" "}
                  <span className="font-semibold">
                    {formatarDuracao(duracaoSeg)}
                  </span>
                </div>
              )}
              {distanciaMetros != null && (
                <div className="rounded-md bg-muted px-3 py-1.5">
                  <span className="text-muted-foreground">Distância:</span>{" "}
                  <span className="font-semibold">
                    {formatarDistancia(distanciaMetros)}
                  </span>
                </div>
              )}
            </div>

            {/* Detalhes de TRANSIT */}
            {modo === "TRANSIT" && rotaEntry?.estado === "ok" && (
              <DetalhesTransit
                steps={rotaEntry.transitSteps}
                partidaIso={rotaEntry.partidaIso}
                chegadaIso={rotaEntry.chegadaIso}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function SeletorModo({
  modoAtual,
  onTrocar,
  metricasDisponiveis,
}: {
  modoAtual: ModoTransporte
  onTrocar: (m: ModoTransporte) => void
  metricasDisponiveis: Rota["metricas"]
}) {
  return (
    <div className="space-y-2">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Modo de transporte
      </p>
      <div className="flex flex-wrap gap-2">
        {MODOS_SELECIONAVEIS.map((m) => {
          const ativo = m === modoAtual
          const temMatriz = m !== "TRANSIT" && !!metricasDisponiveis[m]
          const minMatriz = temMatriz
            ? Math.round(metricasDisponiveis[m]!.duracaoSegundos / 60)
            : null
          return (
            <button
              key={m}
              type="button"
              onClick={() => onTrocar(m)}
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                ativo
                  ? "border-primary bg-primary/10 font-semibold text-primary"
                  : "border-border hover:bg-accent"
              }`}
            >
              <IconeModo modo={m} className="h-4 w-4" />
              <span>{nomeAmigavelModo(m)}</span>
              {minMatriz != null && (
                <span className="text-xs text-muted-foreground">
                  · {minMatriz}min
                </span>
              )}
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        🚌 Transporte público é calculado sob demanda (pode levar 1-2s).
      </p>
    </div>
  )
}

function DetalhesTransit({
  steps,
  partidaIso,
  chegadaIso,
}: {
  steps: TransitStep[]
  partidaIso: string | null
  chegadaIso: string | null
}) {
  const transitSteps = steps.filter((s) => s.tipo === "transit")

  if (transitSteps.length === 0) {
    return (
      <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
        Nenhum trecho de transporte público nesta rota.
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50/40 p-4 dark:border-amber-800/60 dark:bg-amber-950/20">
      <div className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-widest text-amber-800 dark:text-amber-300">
        <span>🚌 Trajeto de transporte público</span>
        {partidaIso && chegadaIso && (
          <span>
            {formatarHoraISO(partidaIso)} → {formatarHoraISO(chegadaIso)}
          </span>
        )}
      </div>
      <ol className="space-y-2">
        {steps.map((step, i) => {
          if (step.tipo === "walking") {
            const min = Math.round(step.duracaoSegundos / 60)
            const km = step.distanciaMetros
              ? (step.distanciaMetros / 1000).toFixed(1)
              : null
            if (min === 0 && !km) return null
            return (
              <li
                key={i}
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <PersonStanding className="h-3.5 w-3.5" />
                Caminhada de {min} min{km ? ` (${km} km)` : ""}
              </li>
            )
          }
          const VeiculoIcon = iconeDoVeiculoTransit(step.veiculo)
          return (
            <li key={i} className="flex items-start gap-2 text-sm">
              <VeiculoIcon className="mt-0.5 h-4 w-4 text-amber-700 dark:text-amber-400" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold">
                    {step.linha ?? "Linha desconhecida"}
                  </span>
                  {step.rumo && (
                    <span className="text-xs text-muted-foreground">
                      → {step.rumo}
                    </span>
                  )}
                </div>
                {(step.paradaSaida || step.paradaChegada) && (
                  <p className="text-xs text-muted-foreground">
                    {step.paradaSaida && (
                      <>
                        Embarque: {step.paradaSaida}
                        {step.saida && ` (${step.saida})`}
                      </>
                    )}
                    {step.paradaSaida && step.paradaChegada && " · "}
                    {step.paradaChegada && (
                      <>
                        Desembarque: {step.paradaChegada}
                        {step.chegada && ` (${step.chegada})`}
                      </>
                    )}
                  </p>
                )}
                {step.agencia && (
                  <p className="text-[11px] text-muted-foreground">
                    {step.agencia}
                    {step.numParadas
                      ? ` · ${step.numParadas} ${
                          step.numParadas === 1 ? "parada" : "paradas"
                        }`
                      : ""}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function StatusBadge({ statusLote }: { statusLote: StatusLote }) {
  if (statusLote === "Confirmada") {
    return (
      <Badge
        variant="outline"
        className="border-itc-sucesso/30 bg-itc-sucesso/10 text-itc-sucesso"
      >
        Confirmada
      </Badge>
    )
  }
  if (statusLote === "Cancelada") {
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

function SkeletonLoading() {
  return (
    <div className="space-y-8">
      <div className="h-9 w-44 animate-pulse rounded bg-muted" />
      <div className="space-y-3">
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        <div className="h-10 w-72 animate-pulse rounded bg-muted" />
        <div className="h-4 w-48 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-24 animate-pulse rounded-lg bg-muted/50" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-muted/50" />
        ))}
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-muted/50" />
        ))}
      </div>
    </div>
  )
}

// ============================================================
// HELPERS (TODO P4: centralizar com resultado-alocacao.tsx)
// ============================================================

function IconeModo({
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

function iconeDoVeiculoTransit(veiculo?: string) {
  switch (veiculo) {
    case "SUBWAY":
    case "TRAIN":
      return Train
    case "TRAM":
      return TramFront
    case "BUS":
    default:
      return Bus
  }
}

function formatarHoraISO(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}