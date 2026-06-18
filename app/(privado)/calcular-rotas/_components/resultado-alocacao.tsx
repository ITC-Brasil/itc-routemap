"use client"

// app/(privado)/calcular-rotas/_components/resultado-alocacao.tsx
//
// VERSÃO 5 (13.11 Bloco 3 — Dropdowns reais por linha): substitui o botão
// DEV de teste pela UI real de troca dentro do bloco expandido de cada
// alocação. Dois dropdowns:
//   - Trocar técnico por: lista os técnicos das outras alocações
//   - Trocar UM por:      lista as UMs das outras alocações
//
// Funcionalmente os dois disparam o MESMO `aplicarSwap(keyA, keyB)` — a
// diferença é só de mentalidade do usuário (qual ponta ele tá pensando
// em trocar).
//
// Mantido do Bloco 2:
//   - alocacoesEditadas + aplicarSwap + voltarParaOtima
//   - Banner amarelo de "alocação ajustada manualmente"
//   - PayloadConfirmacao.origemDecisao = "ajuste-pos-auto" quando editado
//   - Explicação algorítmica adapta texto pra alocação manual
//
// Mantido do Q1:
//   - JustificativaGlobalMini no expand (só quando NÃO editado)
//   - ExplicacaoAlgoritmica inline
//
// Arquitetura: modosPorAloc + rotaCache lazy via /api/routes/single

import { useCallback, useMemo, useState } from "react"
import {
  AlertCircle,
  ArrowLeft,
  Bike,
  Bus,
  Car,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  PersonStanding,
  RotateCcw,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type {
  ModoTransporte,
  OrigemDecisao,
} from "@/lib/firestore/rotas"
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
// PAYLOAD ENVIADO PRO PAI AO CONFIRMAR
// ============================================================

export type PayloadConfirmacao = {
  loteId: string
  loteJustificativa: string
  /** 13.11: rastreia se houve ajuste manual antes de confirmar */
  origemDecisao: OrigemDecisao
  alocacoes: Array<{
    tecnicoId: string
    tecnicoNome: string
    pontoId: string
    umNome: string
    projetoId: string
    origem: { endereco: string; latitude: number; longitude: number }
    destino: { endereco: string; latitude: number; longitude: number }
    metricas: Partial<Record<ModoTransporte, MetricaModo>>
    modoEscolhido: ModoTransporte
  }>
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
  onConfirmar: (payload: PayloadConfirmacao) => void
}

function chaveAlocacao(a: AlocacaoRica): string {
  return `${a.origem.id}|${a.destino.id}`
}

export function ResultadoAlocacao({
  resultado,
  onVoltar,
  onConfirmar,
}: Props) {
  // ====== 13.11 BLOCO 2: Estado de edição manual ======
  // null = sem edição (usa resultado.alocacoes original do algoritmo)
  // array = lista editada com swaps aplicados
  const [alocacoesEditadas, setAlocacoesEditadas] = useState<
    AlocacaoRica[] | null
  >(null)
  const foiEditada = alocacoesEditadas !== null

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
  // Agora também é usado pra alocações editadas (pares novos pós-swap).
  const [rotaCache, setRotaCache] = useState<Map<string, RotaCacheEntry>>(
    new Map(),
  )

  // ID da alocação atualmente expandida (só uma por vez pra economizar mapas)
  const [expandida, setExpandida] = useState<string | null>(null)

  // ====== 13.11 BLOCO 2: helper de acesso unificado ======
  const obterAlocacoesAtuais = useCallback(
    (): AlocacaoRica[] => alocacoesEditadas ?? resultado.alocacoes,
    [alocacoesEditadas, resultado.alocacoes],
  )

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
  const obterDuracaoSeg = useCallback(
    (aloc: AlocacaoRica, modo: ModoTransporte): number | null => {
      const cacheEntry = rotaCache.get(`${chaveAlocacao(aloc)}|${modo}`)
      if (cacheEntry?.estado === "ok") return cacheEntry.duracaoSegundos
      if (modo === "TRANSIT") return null
      return aloc.metricas[modo]?.duracaoSegundos ?? null
    },
    [rotaCache],
  )

  // ====== Métricas DERIVADAS — recalculam a cada troca / edição ======
  const metricasDerivadas = useMemo(() => {
    const atuais = obterAlocacoesAtuais()
    let totalSeg = 0
    let contados = 0
    let comTransitCarregando = false

    for (const a of atuais) {
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
      total: atuais.length,
      comTransitCarregando,
    }
  }, [obterAlocacoesAtuais, modosPorAloc, resultado.modoPrincipal, obterDuracaoSeg])

  // ====== Contexto algorítmico (Q1) — reflete edições do bloco 2 ======
  const todosCustosLote = useMemo(
    () => obterAlocacoesAtuais().map((a) => a.custoSegundosPrincipal),
    [obterAlocacoesAtuais],
  )
  const modoLabelLote = nomeAmigavelModo(resultado.modoPrincipal)

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

  // ====== 13.11 BLOCO 2: SWAP entre 2 alocações ======
  const aplicarSwap = useCallback(
    async (keyA: string, keyB: string) => {
      if (keyA === keyB) return
      const atuais = obterAlocacoesAtuais()
      const linhaA = atuais.find((a) => chaveAlocacao(a) === keyA)
      const linhaB = atuais.find((a) => chaveAlocacao(a) === keyB)
      if (!linhaA || !linhaB) {
        console.warn("[swap] linha não encontrada", { keyA, keyB })
        return
      }

      // 1) Cria as 2 novas alocações trocando destinos
      const novaA: AlocacaoRica = {
        origem: linhaA.origem,
        destino: linhaB.destino,
        metricas: {},
        custoSegundosPrincipal: 0,
      }
      const novaB: AlocacaoRica = {
        origem: linhaB.origem,
        destino: linhaA.destino,
        metricas: {},
        custoSegundosPrincipal: 0,
      }
      const keyNovaA = chaveAlocacao(novaA)
      const keyNovaB = chaveAlocacao(novaB)

      // 2) Substitui as 2 linhas no array — mantém ordem original
      const novoArray = atuais.map((a) => {
        const k = chaveAlocacao(a)
        if (k === keyA) return novaA
        if (k === keyB) return novaB
        return a
      })
      setAlocacoesEditadas(novoArray)

      // 3) Reset estados que ficaram referenciando keys antigas
      setExpandida(null)
      setModosPorAloc((prev) => {
        const next = new Map(prev)
        next.delete(keyA)
        next.delete(keyB)
        next.set(keyNovaA, resultado.modoPrincipal)
        next.set(keyNovaB, resultado.modoPrincipal)
        return next
      })

      // 4) Marca como "carregando" no rotaCache pros 2 novos pares
      setRotaCache((prev) => {
        const next = new Map(prev)
        next.set(`${keyNovaA}|${resultado.modoPrincipal}`, {
          estado: "carregando",
        })
        next.set(`${keyNovaB}|${resultado.modoPrincipal}`, {
          estado: "carregando",
        })
        return next
      })

      // 5) Fetch paralelo das métricas pros 2 novos pares (modoPrincipal)
      const buscarMetrica = async (
        aloc: AlocacaoRica,
        keyNova: string,
      ): Promise<
        | { ok: true; key: string; data: RotaCacheEntry & { estado: "ok" } }
        | { ok: false; key: string; mensagem: string }
      > => {
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
              modo: resultado.modoPrincipal,
            }),
          })
          const data = await res.json()
          if (!data.sucesso) {
            return {
              ok: false,
              key: keyNova,
              mensagem: data.erro ?? "Erro desconhecido",
            }
          }
          return {
            ok: true,
            key: keyNova,
            data: {
              estado: "ok",
              polyline: data.polyline ?? null,
              distanciaMetros: data.distanciaMetros,
              duracaoSegundos: data.duracaoSegundos,
              transitSteps: data.transitSteps ?? [],
              partidaIso: data.partidaIso ?? null,
              chegadaIso: data.chegadaIso ?? null,
            },
          }
        } catch (err) {
          return {
            ok: false,
            key: keyNova,
            mensagem: err instanceof Error ? err.message : "Erro de rede",
          }
        }
      }

      const [resA, resB] = await Promise.all([
        buscarMetrica(novaA, keyNovaA),
        buscarMetrica(novaB, keyNovaB),
      ])

      // 6) Atualiza rotaCache com resultados
      setRotaCache((prev) => {
        const next = new Map(prev)
        for (const r of [resA, resB]) {
          const cacheKey = `${r.key}|${resultado.modoPrincipal}`
          if (r.ok) next.set(cacheKey, r.data)
          else next.set(cacheKey, { estado: "erro", mensagem: r.mensagem })
        }
        return next
      })

      // 7) Atualiza alocacoesEditadas com métricas + custoSegundosPrincipal
      setAlocacoesEditadas((prev) => {
        if (!prev) return prev
        return prev.map((aloc) => {
          const k = chaveAlocacao(aloc)
          if (k === keyNovaA && resA.ok) {
            return {
              ...aloc,
              metricas: {
                [resultado.modoPrincipal]: {
                  distanciaMetros: resA.data.distanciaMetros,
                  duracaoSegundos: resA.data.duracaoSegundos,
                },
              },
              custoSegundosPrincipal: resA.data.duracaoSegundos,
            }
          }
          if (k === keyNovaB && resB.ok) {
            return {
              ...aloc,
              metricas: {
                [resultado.modoPrincipal]: {
                  distanciaMetros: resB.data.distanciaMetros,
                  duracaoSegundos: resB.data.duracaoSegundos,
                },
              },
              custoSegundosPrincipal: resB.data.duracaoSegundos,
            }
          }
          return aloc
        })
      })
    },
    [obterAlocacoesAtuais, resultado.modoPrincipal],
  )

  // ====== 13.11 BLOCO 2: Voltar pra sugestão original ======
  const voltarParaOtima = useCallback(() => {
    setAlocacoesEditadas(null)
    setExpandida(null)
    const m = new Map<string, ModoTransporte>()
    for (const a of resultado.alocacoes) {
      m.set(chaveAlocacao(a), resultado.modoPrincipal)
    }
    setModosPorAloc(m)
  }, [resultado.alocacoes, resultado.modoPrincipal])

  // ====== Confirma alocação: monta payload com tudo + dispara callback ======
  const handleConfirmar = () => {
    const atuais = obterAlocacoesAtuais()
    const payload: PayloadConfirmacao = {
      loteId: resultado.loteId,
      loteJustificativa: foiEditada
        ? "" // Sem texto da IA — alocação foi ajustada manualmente
        : resultado.justificativaGemini,
      origemDecisao: foiEditada ? "ajuste-pos-auto" : "auto",
      alocacoes: atuais.map((aloc) => {
        const key = chaveAlocacao(aloc)
        const modoEscolhido =
          modosPorAloc.get(key) ?? resultado.modoPrincipal

        const metricas: Partial<Record<ModoTransporte, MetricaModo>> = {
          ...aloc.metricas,
        }
        const transitEntry = rotaCache.get(`${key}|TRANSIT`)
        if (transitEntry?.estado === "ok") {
          metricas.TRANSIT = {
            distanciaMetros: transitEntry.distanciaMetros,
            duracaoSegundos: transitEntry.duracaoSegundos,
          }
        }

        return {
          tecnicoId: aloc.origem.id,
          tecnicoNome: aloc.origem.nome,
          pontoId: aloc.destino.id,
          umNome: aloc.destino.umNome,
          projetoId: aloc.destino.projetoId,
          origem: {
            endereco: aloc.origem.endereco,
            latitude: aloc.origem.latitude,
            longitude: aloc.origem.longitude,
          },
          destino: {
            endereco: aloc.destino.endereco,
            latitude: aloc.destino.latitude,
            longitude: aloc.destino.longitude,
          },
          metricas,
          modoEscolhido,
        }
      }),
    }
    onConfirmar(payload)
  }

  // ====== Render ======
  const alocacoesAtuais = obterAlocacoesAtuais()

  return (
    <div className="space-y-6">
      {/* 13.11: banner muda se foi editado */}
      {foiEditada ? (
        <AvisoAlocacaoEditada onVoltarParaOtima={voltarParaOtima} />
      ) : (
        <JustificativaBanner texto={resultado.justificativaGemini} />
      )}

      <MetricasCards
        derivadas={metricasDerivadas}
        modoMaisUsado={modoMaisFrequente(modosPorAloc, resultado.modoPrincipal)}
        totalTecnicos={
          alocacoesAtuais.length + resultado.tecnicosNaoAlocados.length
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
          Alocações ({alocacoesAtuais.length})
        </h2>
        <div className="space-y-3">
          {alocacoesAtuais.map((aloc, i) => {
            const key = chaveAlocacao(aloc)
            const modo = modosPorAloc.get(key) ?? resultado.modoPrincipal
            const expandido = expandida === key
            const rotaEntry = rotaCache.get(`${key}|${modo}`)
            // 13.11 BLOCO 3: outras alocações pra alimentar os dropdowns
            const outrasAlocacoes = alocacoesAtuais.filter(
              (o) => chaveAlocacao(o) !== key,
            )
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
                // Q1: contexto pra explicação algorítmica + justificativa global
                todosCustosLote={todosCustosLote}
                modoLabelLote={modoLabelLote}
                justificativaLote={resultado.justificativaGemini}
                // 13.11: edição manual
                foiEditada={foiEditada}
                outrasAlocacoes={outrasAlocacoes}
                onSwap={(keyOutra) => void aplicarSwap(key, keyOutra)}
              />
            )
          })}
        </div>
      </section>

      <BotoesAcao
        onVoltar={onVoltar}
        onConfirmar={handleConfirmar}
        totalAlocados={alocacoesAtuais.length}
        foiEditada={foiEditada}
        onVoltarParaOtima={voltarParaOtima}
      />
    </div>
  )
}

// ============================================================
// 13.11 BLOCO 2: Aviso quando alocação foi editada manualmente
// ============================================================

function AvisoAlocacaoEditada({
  onVoltarParaOtima,
}: {
  onVoltarParaOtima: () => void
}) {
  return (
    <Card className="border-amber-300 bg-amber-50/60 dark:border-amber-800/60 dark:bg-amber-950/30">
      <CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
            <AlertCircle className="h-5 w-5 text-amber-700 dark:text-amber-300" />
          </div>
          <div className="flex-1 space-y-1">
            <p className="font-mono text-xs uppercase tracking-widest text-amber-800 dark:text-amber-300">
              Alocação ajustada manualmente
            </p>
            <p className="text-sm leading-relaxed">
              A análise da IA não reflete os ajustes feitos. As métricas
              (tempo total, médio, etc) são recalculadas em tempo real
              com base na configuração atual.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onVoltarParaOtima}
          className="gap-2 self-start sm:self-center"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Voltar pra ótima
        </Button>
      </CardContent>
    </Card>
  )
}

// ============================================================
// JUSTIFICATIVA BANNER (estado normal, sem edição)
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
// Q1 — JUSTIFICATIVA GLOBAL MINI (replicada no expand de cada rota)
// ============================================================

function JustificativaGlobalMini({ texto }: { texto: string }) {
  return (
    <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
      <div className="mb-1.5 flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-primary">
          Análise da rodada
        </span>
      </div>
      <p className="text-sm leading-relaxed">{texto}</p>
    </div>
  )
}

// ============================================================
// Q1 — EXPLICAÇÃO ALGORÍTMICA (gerada por código, sem IA)
// ============================================================

function ExplicacaoAlgoritmica({ texto }: { texto: string }) {
  return (
    <div className="rounded-md border bg-muted/50 p-3">
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          ⚙ Decisão do algoritmo
        </span>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{texto}</p>
    </div>
  )
}

// ============================================================
// 13.11 BLOCO 3: EDITAR PAR (dropdowns reais)
// ============================================================
// Aparece dentro do bloco expandido de cada alocação.
// Os 2 dropdowns disparam o mesmo aplicarSwap — diferença é só de
// mentalidade (qual ponta o usuário está pensando em trocar).
//
// Ficam desabilitados enquanto o swap ainda está em andamento
// (custoSegundosPrincipal === 0 indica estado placeholder pós-swap).

function EditarPar({
  alocacaoAtual,
  outrasAlocacoes,
  onSwap,
}: {
  alocacaoAtual: AlocacaoRica
  outrasAlocacoes: AlocacaoRica[]
  onSwap: (keyOutra: string) => void
}) {
  if (outrasAlocacoes.length === 0) return null

  // Se a alocação ainda está com custo placeholder, está em meio de swap
  const desabilitado = alocacaoAtual.custoSegundosPrincipal === 0

  return (
    <div className="space-y-3 rounded-md border border-dashed border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-primary">
          ⇄ Editar este par
        </p>
        {desabilitado && (
          <span className="font-mono text-[10px] text-muted-foreground">
            calculando…
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Trocar técnico por... */}
        <div className="space-y-1.5">
          <label className="text-[11px] text-muted-foreground">
            Trocar técnico por:
          </label>
          <Select
            disabled={desabilitado}
            onValueChange={(keyOutra) => onSwap(keyOutra)}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Escolher técnico..." />
            </SelectTrigger>
            <SelectContent>
              {outrasAlocacoes.map((o) => (
                <SelectItem key={chaveAlocacao(o)} value={chaveAlocacao(o)}>
                  {o.origem.nome}{" "}
                  <span className="text-muted-foreground">
                    (atual em {o.destino.umNome})
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Trocar UM por... */}
        <div className="space-y-1.5">
          <label className="text-[11px] text-muted-foreground">
            Trocar UM por:
          </label>
          <Select
            disabled={desabilitado}
            onValueChange={(keyOutra) => onSwap(keyOutra)}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Escolher UM..." />
            </SelectTrigger>
            <SelectContent>
              {outrasAlocacoes.map((o) => (
                <SelectItem key={chaveAlocacao(o)} value={chaveAlocacao(o)}>
                  {o.destino.umNome}{" "}
                  <span className="text-muted-foreground">
                    (atual com {o.origem.nome})
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Ao escolher, este par troca com o selecionado (swap automático —
        ambos os técnicos mudam de destino).
      </p>
    </div>
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
  todosCustosLote,
  modoLabelLote,
  justificativaLote,
  foiEditada,
  outrasAlocacoes,
  onSwap,
}: {
  alocacao: AlocacaoRica
  ordem: number
  modo: ModoTransporte
  expandido: boolean
  rotaEntry: RotaCacheEntry | undefined
  duracaoSeg: number | null
  onExpandir: () => void
  onTrocarModo: (m: ModoTransporte) => void
  todosCustosLote: number[]
  modoLabelLote: string
  justificativaLote: string
  foiEditada: boolean
  outrasAlocacoes: AlocacaoRica[]
  onSwap: (keyOutra: string) => void
}) {
  const duracaoMin = duracaoSeg != null ? Math.round(duracaoSeg / 60) : null
  const distanciaKm =
    rotaEntry?.estado === "ok"
      ? (rotaEntry.distanciaMetros / 1000).toFixed(1)
      : modo !== "TRANSIT"
        ? ((alocacao.metricas[modo]?.distanciaMetros ?? 0) / 1000).toFixed(1)
        : null

  const explicacao = gerarExplicacaoAlgoritmica({
    tecnicoNome: alocacao.origem.nome,
    umNome: alocacao.destino.umNome,
    meuCustoSegundos: alocacao.custoSegundosPrincipal,
    todosCustosSegundos: todosCustosLote,
    modoLabel: modoLabelLote,
    manual: foiEditada,
  })

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
            {/* Q1-A: justificativa global do lote — SÓ se não foi editada. */}
            {!foiEditada &&
              justificativaLote &&
              justificativaLote.trim().length > 0 && (
                <JustificativaGlobalMini texto={justificativaLote} />
              )}

            {/* Q1-C: explicação algorítmica deste par específico */}
            {explicacao && <ExplicacaoAlgoritmica texto={explicacao} />}

            {/* 13.11 BLOCO 3: dropdowns reais de troca */}
            <EditarPar
              alocacaoAtual={alocacao}
              outrasAlocacoes={outrasAlocacoes}
              onSwap={onSwap}
            />

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
// BOTÕES DE AÇÃO (rodapé)
// ============================================================

function BotoesAcao({
  onVoltar,
  onConfirmar,
  totalAlocados,
  foiEditada,
  onVoltarParaOtima,
}: {
  onVoltar: () => void
  onConfirmar: () => void
  totalAlocados: number
  foiEditada: boolean
  onVoltarParaOtima: () => void
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
      <Button variant="outline" onClick={onVoltar} className="gap-2">
        <ArrowLeft className="h-4 w-4" />
        Voltar para seleção
      </Button>
      {foiEditada && (
        <Button
          variant="outline"
          onClick={onVoltarParaOtima}
          className="gap-2"
        >
          <RotateCcw className="h-4 w-4" />
          Voltar pra ótima
        </Button>
      )}
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

// ============================================================
// Q1 — HELPER PURO PRA EXPLICAÇÃO ALGORÍTMICA
// ============================================================
// TODO P4: centralizar com historico/[loteId]/page.tsx (duplicado lá).

function gerarExplicacaoAlgoritmica(input: {
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