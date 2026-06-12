"use client"

// app/(privado)/calcular-rotas/_components/resultado-alocacao.tsx
//
// VERSÃO 2 (13.7.3): UI com seletor de modo por alocação + mapa por par
// + detalhes de TRANSIT (linhas de ônibus/metrô) + recálculo de totais.
//
// Arquitetura:
//   - Estado central: modosPorAloc (Map<key, modo>) e rotaCache (Map<key|modo, RotaData>)
//   - rotaCache é alimentada lazy via /api/routes/single quando o usuário
//     expande uma alocação ou troca o modo dela
//   - Totais derivados via useMemo (recalculam a cada troca)
//   - TRANSIT só faz fetch sob demanda — não tá na matriz inicial

import { useCallback, useMemo, useState } from "react"
import {
  ArrowLeft,
  Bike,
  Bus,
  Car,
  Check,
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
import type { ModoTransporte } from "@/lib/firestore/rotas"
import { MapaAlocacao, type RotaData } from "./mapa-alocacao"

// ============================================================
// TIPOS DA RESPOSTA DA API /api/routes/alocar
// ============================================================

type MetricaModo = {
  distanciaMetros: number
  duracaoSegundos: number
}

export type AlocacaoRica = {
  origem: {
    id: string
    nome: string
    endereco: string
    latitude: number
    longitude: number
  }
  destino: {
    id: string
    umNome: string
    projetoId: string
    projetoSigla: string
    raNome: string
    endereco: string
    ciclo: number
    etapa: number
    latitude: number
    longitude: number
  }
  metricas: Partial<Record<ModoTransporte, MetricaModo>>
  custoSegundosPrincipal: number
}

export type RespostaAlocacao = {
  sucesso: true
  loteId: string
  modoPrincipal: ModoTransporte
  modosCalculados: ModoTransporte[]
  alocacoes: AlocacaoRica[]
  tecnicosNaoAlocados: { id: string; nome: string }[]
  destinosNaoAlocados: { id: string; umNome: string }[]
  custoTotalSegundos: number
  custoMedioSegundos: number
  justificativaGemini: string
  duracaoMs: number
  avisos: string[]
}

// ============================================================
// TIPOS LOCAIS PARA CACHE DA ROTA DETALHADA
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
  | {
      estado: "carregando"
    }
  | {
      estado: "ok"
      polyline: string | null
      distanciaMetros: number
      duracaoSegundos: number
      transitSteps: TransitStep[]
      partidaIso: string | null
      chegadaIso: string | null
    }
  | {
      estado: "erro"
      mensagem: string
    }

// Modos disponíveis pro seletor (TRANSIT incluso, lazy)
const MODOS_SELECIONAVEIS: ModoTransporte[] = [
  "DRIVE",
  "TWO_WHEELER",
  "WALK",
  "TRANSIT",
]

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

interface Props {
  resultado: RespostaAlocacao
  onVoltar: () => void
  onConfirmar: () => void
}

function chaveAlocacao(a: AlocacaoRica): string {
  return `${a.origem.id}|${a.destino.id}`
}

export function ResultadoAlocacao({
  resultado,
  onVoltar,
  onConfirmar,
}: Props) {
  // Modo escolhido por alocação (começa com o modo principal global)
  const [modosPorAloc, setModosPorAloc] = useState<
    Map<string, ModoTransporte>
  >(() => {
    const m = new Map<string, ModoTransporte>()
    for (const a of resultado.alocacoes) {
      m.set(chaveAlocacao(a), resultado.modoPrincipal)
    }
    return m
  })

  // Cache de rota detalhada: chave = "alocId|modo"
  const [rotaCache, setRotaCache] = useState<Map<string, RotaCacheEntry>>(
    new Map(),
  )

  // ID da alocação atualmente expandida (só uma por vez pra economizar mapas)
  const [expandida, setExpandida] = useState<string | null>(null)

  // ====== Fetcher da rota detalhada ======
  const carregarRota = useCallback(
    async (aloc: AlocacaoRica, modo: ModoTransporte) => {
      const chaveRota = `${chaveAlocacao(aloc)}|${modo}`

      // Já tem? Não refetch
      const existente = rotaCache.get(chaveRota)
      if (existente && existente.estado !== "erro") return

      setRotaCache((prev) =>
        new Map(prev).set(chaveRota, { estado: "carregando" }),
      )

      try {
        const res = await fetch("/api/routes/single", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            origem: {
              latitude: aloc.origem.latitude,
              longitude: aloc.origem.longitude,
            },
            destino: {
              latitude: aloc.destino.latitude,
              longitude: aloc.destino.longitude,
            },
            modo,
          }),
        })
        const data = await res.json()

        if (!data.sucesso) {
          setRotaCache((prev) =>
            new Map(prev).set(chaveRota, {
              estado: "erro",
              mensagem: data.erro ?? "Erro desconhecido",
            }),
          )
          return
        }

        setRotaCache((prev) =>
          new Map(prev).set(chaveRota, {
            estado: "ok",
            polyline: data.polyline,
            distanciaMetros: data.distanciaMetros,
            duracaoSegundos: data.duracaoSegundos,
            transitSteps: data.transitSteps ?? [],
            partidaIso: data.partidaIso ?? null,
            chegadaIso: data.chegadaIso ?? null,
          }),
        )
      } catch (err) {
        setRotaCache((prev) =>
          new Map(prev).set(chaveRota, {
            estado: "erro",
            mensagem:
              err instanceof Error ? err.message : "Erro de rede",
          }),
        )
      }
    },
    [rotaCache],
  )

  // ====== Helper pra obter duração efetiva de uma alocação ======
  // Pra modos da matriz inicial (DRIVE/TWO_WHEELER/WALK), usa o cache do JSON.
  // Pra TRANSIT, depende do fetch — pode retornar null enquanto carrega.
  const obterDuracaoSeg = useCallback(
    (aloc: AlocacaoRica, modo: ModoTransporte): number | null => {
      if (modo === "TRANSIT") {
        const entry = rotaCache.get(`${chaveAlocacao(aloc)}|TRANSIT`)
        if (entry?.estado === "ok") return entry.duracaoSegundos
        return null
      }
      return aloc.metricas[modo]?.duracaoSegundos ?? null
    },
    [rotaCache],
  )

  // ====== Métricas DERIVADAS — recalculam a cada troca de modo ======
  const metricasDerivadas = useMemo(() => {
    let totalSeg = 0
    let contados = 0
    let comTransitCarregando = false

    for (const a of resultado.alocacoes) {
      const modo = modosPorAloc.get(chaveAlocacao(a)) ?? resultado.modoPrincipal
      const seg = obterDuracaoSeg(a, modo)
      if (seg != null) {
        totalSeg += seg
        contados++
      } else if (modo === "TRANSIT") {
        comTransitCarregando = true
      }
    }

    return {
      totalSeg,
      medioSeg: contados > 0 ? totalSeg / contados : 0,
      contados,
      total: resultado.alocacoes.length,
      comTransitCarregando,
    }
  }, [resultado, modosPorAloc, obterDuracaoSeg])

  // ====== Handlers ======
  const handleExpandir = (aloc: AlocacaoRica) => {
    const key = chaveAlocacao(aloc)
    if (expandida === key) {
      setExpandida(null)
      return
    }
    setExpandida(key)
    const modoAtual = modosPorAloc.get(key) ?? resultado.modoPrincipal
    void carregarRota(aloc, modoAtual)
  }

  const handleTrocarModo = (aloc: AlocacaoRica, novoModo: ModoTransporte) => {
    const key = chaveAlocacao(aloc)
    setModosPorAloc((prev) => new Map(prev).set(key, novoModo))
    void carregarRota(aloc, novoModo)
  }

  // ====== Render ======
  return (
    <div className="space-y-6">
      <JustificativaBanner texto={resultado.justificativaGemini} />

      <MetricasCards
        derivadas={metricasDerivadas}
        modoMaisUsado={modoMaisFrequente(modosPorAloc, resultado.modoPrincipal)}
        totalTecnicos={
          resultado.alocacoes.length + resultado.tecnicosNaoAlocados.length
        }
      />

      {(resultado.tecnicosNaoAlocados.length > 0 ||
        resultado.destinosNaoAlocados.length > 0) && (
        <BannerSobras
          tecnicos={resultado.tecnicosNaoAlocados}
          destinos={resultado.destinosNaoAlocados}
        />
      )}

      <section className="space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Alocações ({resultado.alocacoes.length})
        </h2>
        <div className="space-y-3">
          {resultado.alocacoes.map((aloc, i) => {
            const key = chaveAlocacao(aloc)
            const modo = modosPorAloc.get(key) ?? resultado.modoPrincipal
            const expandido = expandida === key
            const rotaEntry = rotaCache.get(`${key}|${modo}`)
            return (
              <LinhaAlocacao
                key={key}
                alocacao={aloc}
                ordem={i + 1}
                modo={modo}
                expandido={expandido}
                rotaEntry={rotaEntry}
                duracaoSeg={obterDuracaoSeg(aloc, modo)}
                onExpandir={() => handleExpandir(aloc)}
                onTrocarModo={(m) => handleTrocarModo(aloc, m)}
              />
            )
          })}
        </div>
      </section>

      <BotoesAcao
        onVoltar={onVoltar}
        onConfirmar={onConfirmar}
        totalAlocados={resultado.alocacoes.length}
      />
    </div>
  )
}

// ============================================================
// JUSTIFICATIVA BANNER
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
            Análise da alocação
          </p>
          <p className="text-sm leading-relaxed">{texto}</p>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================
// MÉTRICAS CARDS
// ============================================================

function MetricasCards({
  derivadas,
  modoMaisUsado,
  totalTecnicos,
}: {
  derivadas: {
    totalSeg: number
    medioSeg: number
    contados: number
    total: number
    comTransitCarregando: boolean
  }
  modoMaisUsado: ModoTransporte
  totalTecnicos: number
}) {
  const tempoTotalMin = Math.round(derivadas.totalSeg / 60)
  const tempoMedioMin = Math.round(derivadas.medioSeg / 60)
  const indicadorParcial =
    derivadas.comTransitCarregando || derivadas.contados < derivadas.total
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <CardMetrica
        icon={<Clock className="h-5 w-5 text-primary" />}
        valor={`${tempoTotalMin} min`}
        sufixo={indicadorParcial ? "*" : undefined}
        label={
          indicadorParcial
            ? "Tempo total (parcial)"
            : "Tempo total agregado"
        }
      />
      <CardMetrica
        icon={<Timer className="h-5 w-5 text-primary" />}
        valor={`${tempoMedioMin} min`}
        sufixo={indicadorParcial ? "*" : undefined}
        label="Tempo médio por técnico"
      />
      <CardMetrica
        icon={<Users className="h-5 w-5 text-primary" />}
        valor={`${derivadas.total}/${totalTecnicos}`}
        label={totalTecnicos === 1 ? "técnico alocado" : "técnicos alocados"}
      />
      <CardMetrica
        icon={<IconeModo modo={modoMaisUsado} className="h-5 w-5 text-primary" />}
        valor={nomeAmigavelModo(modoMaisUsado)}
        label="Modo predominante"
        capitalize
      />
    </div>
  )
}

function CardMetrica({
  icon,
  valor,
  sufixo,
  label,
  capitalize,
}: {
  icon: React.ReactNode
  valor: string
  sufixo?: string
  label: string
  capitalize?: boolean
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-5">
        <div className="rounded-full bg-primary/10 p-2.5">{icon}</div>
        <div className="min-w-0">
          <p
            className={`font-heading text-2xl leading-tight ${
              capitalize ? "capitalize" : ""
            }`}
          >
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

// ============================================================
// BANNER DE SOBRAS
// ============================================================

function BannerSobras({
  tecnicos,
  destinos,
}: {
  tecnicos: { id: string; nome: string }[]
  destinos: { id: string; umNome: string }[]
}) {
  return (
    <Card className="border-amber-300 bg-amber-50/60 dark:border-amber-800/60 dark:bg-amber-950/30">
      <CardContent className="space-y-2 p-5">
        <p className="font-mono text-xs uppercase tracking-widest text-amber-800 dark:text-amber-300">
          ⚠ Sobras na alocação
        </p>
        {tecnicos.length > 0 && (
          <p className="text-sm text-amber-900/90 dark:text-amber-200/90">
            <span className="font-medium">
              {tecnicos.length}{" "}
              {tecnicos.length === 1 ? "técnico ficou" : "técnicos ficaram"} sem
              destino:
            </span>{" "}
            {tecnicos.map((t) => t.nome).join(", ")}
          </p>
        )}
        {destinos.length > 0 && (
          <p className="text-sm text-amber-900/90 dark:text-amber-200/90">
            <span className="font-medium">
              {destinos.length}{" "}
              {destinos.length === 1
                ? "UM ficou sem técnico:"
                : "UMs ficaram sem técnico:"}
            </span>{" "}
            {destinos.map((d) => d.umNome).join(", ")}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================
// LINHA DE ALOCAÇÃO (cada par técnico → UM)
// ============================================================

function LinhaAlocacao({
  alocacao,
  ordem,
  modo,
  expandido,
  rotaEntry,
  duracaoSeg,
  onExpandir,
  onTrocarModo,
}: {
  alocacao: AlocacaoRica
  ordem: number
  modo: ModoTransporte
  expandido: boolean
  rotaEntry: RotaCacheEntry | undefined
  duracaoSeg: number | null
  onExpandir: () => void
  onTrocarModo: (m: ModoTransporte) => void
}) {
  const duracaoMin = duracaoSeg != null ? Math.round(duracaoSeg / 60) : null
  const distanciaKm =
    rotaEntry?.estado === "ok"
      ? (rotaEntry.distanciaMetros / 1000).toFixed(1)
      : modo !== "TRANSIT"
        ? ((alocacao.metricas[modo]?.distanciaMetros ?? 0) / 1000).toFixed(1)
        : null

  return (
    <Card>
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
            <p className="truncate font-medium" title={alocacao.origem.nome}>
              {alocacao.origem.nome}
            </p>
            <p
              className="truncate text-xs text-muted-foreground"
              title={alocacao.origem.endereco}
            >
              {alocacao.origem.endereco}
            </p>
          </div>

          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Destino
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono">
                {alocacao.destino.projetoSigla}
              </Badge>
              <span className="font-medium">{alocacao.destino.umNome}</span>
              <span className="text-sm text-muted-foreground">
                · {alocacao.destino.raNome}
              </span>
            </div>
            <p
              className="truncate text-xs text-muted-foreground"
              title={alocacao.destino.endereco}
            >
              {alocacao.destino.endereco}
            </p>
          </div>

          {/* Tempo atual no modo selecionado */}
          <div className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary">
            <IconeModo modo={modo} className="h-4 w-4" />
            {duracaoMin != null ? (
              <span>{duracaoMin} min</span>
            ) : (
              <span className="text-xs">calculando…</span>
            )}
          </div>

          {/* Botão expandir/colapsar */}
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
                <ChevronDown className="h-4 w-4" /> Detalhar
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
              metricasMatrizDisponivel={alocacao.metricas}
            />

            <MapaAlocacao
              origem={{
                latitude: alocacao.origem.latitude,
                longitude: alocacao.origem.longitude,
              }}
              destino={{
                latitude: alocacao.destino.latitude,
                longitude: alocacao.destino.longitude,
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

            {/* Métricas do modo + distância */}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {duracaoMin != null && (
                <div className="rounded-md bg-muted px-3 py-1.5">
                  <span className="text-muted-foreground">Tempo:</span>{" "}
                  <span className="font-semibold">{duracaoMin} min</span>
                </div>
              )}
              {distanciaKm != null && (
                <div className="rounded-md bg-muted px-3 py-1.5">
                  <span className="text-muted-foreground">Distância:</span>{" "}
                  <span className="font-semibold">{distanciaKm} km</span>
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

// ============================================================
// SELETOR DE MODO (4 botões)
// ============================================================

function SeletorModo({
  modoAtual,
  onTrocar,
  metricasMatrizDisponivel,
}: {
  modoAtual: ModoTransporte
  onTrocar: (m: ModoTransporte) => void
  metricasMatrizDisponivel: Partial<Record<ModoTransporte, MetricaModo>>
}) {
  return (
    <div className="space-y-2">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Modo de transporte
      </p>
      <div className="flex flex-wrap gap-2">
        {MODOS_SELECIONAVEIS.map((m) => {
          const ativo = m === modoAtual
          const temMatriz = m !== "TRANSIT" && !!metricasMatrizDisponivel[m]
          const minMatriz = temMatriz
            ? Math.round(metricasMatrizDisponivel[m]!.duracaoSegundos / 60)
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

// ============================================================
// DETALHES DE TRANSIT (linhas, horários, baldeações)
// ============================================================

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
          // step.tipo === "transit"
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

// ============================================================
// BOTÕES DE AÇÃO
// ============================================================

function BotoesAcao({
  onVoltar,
  onConfirmar,
  totalAlocados,
}: {
  onVoltar: () => void
  onConfirmar: () => void
  totalAlocados: number
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
      <Button variant="outline" onClick={onVoltar} className="gap-2">
        <ArrowLeft className="h-4 w-4" />
        Voltar para seleção
      </Button>
      <Button
        onClick={onConfirmar}
        disabled={totalAlocados === 0}
        size="lg"
        className="gap-2"
      >
        <Check className="h-4 w-4" />
        Confirmar alocação
      </Button>
    </div>
  )
}

// ============================================================
// HELPERS
// ============================================================

function nomeAmigavelModo(modo: ModoTransporte): string {
  const nomes: Record<ModoTransporte, string> = {
    DRIVE: "carro",
    TWO_WHEELER: "moto",
    WALK: "a pé",
    BICYCLE: "bicicleta",
    TRANSIT: "transporte público",
  }
  return nomes[modo] || modo.toLowerCase()
}

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

function modoMaisFrequente(
  modos: Map<string, ModoTransporte>,
  fallback: ModoTransporte,
): ModoTransporte {
  if (modos.size === 0) return fallback
  const contagem = new Map<ModoTransporte, number>()
  for (const m of modos.values()) {
    contagem.set(m, (contagem.get(m) ?? 0) + 1)
  }
  let topModo: ModoTransporte = fallback
  let topCount = 0
  for (const [m, c] of contagem) {
    if (c > topCount) {
      topModo = m
      topCount = c
    }
  }
  return topModo
}