"use client"

// app/(privado)/historico/[loteId]/page.tsx
//
// VERSÃO 2 (Q1 do Gemini): adiciona contexto no bloco expandido de cada
// rota — justificativa global do lote replicada + explicação algorítmica
// inline (rank, comparação com média, decisão por par).
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
// Helpers centralizados em calcular-rotas/_components/alocacao-helpers.tsx

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  ArrowLeft,
  Clock,
  Hand,
  Loader2,
  RefreshCw,
  Share2,
  Sparkles,
  Timer,
  Users,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { MapaLote } from "@/app/(privado)/calcular-rotas/_components/mapa-lote"
import {
} from "../../calcular-rotas/_components/mapa-alocacao"
import {
  type TransitStep,
} from "../../calcular-rotas/_components/alocacao-helpers"
import { listarRotasPorLote } from "@/lib/actions/rotas"
import type { ModoTransporte } from "@/lib/rotas-utils"
import type { Rota } from "@/lib/db/rotas"
import { listarProjetos } from "@/lib/actions/projetos"
import { listarTecnicos } from "@/lib/actions/tecnicos"
import { corTextoIdeal } from "@/lib/cores"
import { buscarPonto } from "@/lib/actions/pontos"
import {
  IconeModo,
  gerarExplicacaoAlgoritmica,
} from "@/lib/modos-transporte"
import type { LoteSumario, StatusLote } from "@/lib/db/lotes"
import { CancelarLoteDialog } from "../_components/cancelar-lote-dialog"
import {
  formatarDataHora,
  formatarDistancia,
  formatarDuracao,
  nomeAmigavelModo,
} from "../_components/historico-formatters"

// ============================================================
// TIPOS LOCAIS (cache de rota detalhada)
// ============================================================

// TransitStep importado de ../../calcular-rotas/_components/alocacao-helpers

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

// MODOS_SELECIONAVEIS importado de @/lib/modos-transporte

// ============================================================
// HELPERS DE COMPARTILHAMENTO
// ============================================================

async function buscarReferenciaPontos(
  rotas: Rota[]
): Promise<Map<string, string>> {
  // ATENÇÃO: `Ponto` só é lido aqui, e só pela `referencia`. Todo o resto do
  // destino sai do SNAPSHOT da própria rota (destinoEndereco/Latitude/Longitude),
  // nunca do ponto — 12 dos 13 vínculos `Rota.pontoId` do dado legado apontam
  // para o ponto errado, porque a sincronização antiga sobrescrevia o conteúdo
  // mantendo o id (ver §10.10 do handoff). A referência é a dívida conhecida:
  // enquanto não existir `destinoReferencia` no snapshot, ela pode vir de outro
  // ponto no texto de compartilhamento.
  const resultados = await Promise.all(
    rotas.map((r) => buscarPonto(r.pontoId).catch(() => null))
  )
  const mapa = new Map<string, string>()
  for (let i = 0; i < rotas.length; i++) {
    mapa.set(rotas[i].pontoId, resultados[i]?.referencia ?? "")
  }
  return mapa
}

const EMOJI_MODO: Record<ModoTransporte, string> = {
  DRIVE: "🚗",
  TWO_WHEELER: "🏍️",
  WALK: "🚶",
  BICYCLE: "🚲",
  TRANSIT: "🚌",
}

function gerarTextoRota(
  rota: Rota,
  projetoSigla: string,
  referencia?: string,
  transitSteps?: TransitStep[]
): string {
  const metrica = rota.metricas[rota.modoPrincipal]
  const tempo = metrica ? formatarDuracao(metrica.duracaoSegundos) : "Não calculado"
  const distancia = metrica ? formatarDistancia(metrica.distanciaMetros) : "Não calculada"
  const emoji = EMOJI_MODO[rota.modoPrincipal] ?? "🚗"
  const linhaReferencia = referencia?.trim() ? `\n🏷️ *Referência:* ${referencia.trim()}` : ""

  let texto = `👤 *Técnico:* ${rota.tecnicoNome}
🏢 *Projeto:* ${projetoSigla} — ${rota.umNome}
📍 *Localização:* ${rota.destino.endereco}${linhaReferencia}
🗺️ *Maps:* https://www.google.com/maps?q=${rota.destino.latitude},${rota.destino.longitude}
${emoji} *Transporte:* ${nomeAmigavelModo(rota.modoPrincipal)}
⏱️ *Tempo:* ${tempo}
📏 *Distância:* ${distancia}`

  if (rota.modoPrincipal === "TRANSIT") {
    const stepsTransit = (transitSteps ?? []).filter((s) => s.tipo === "transit")
    if (stepsTransit.length > 0) {
      texto += `\n\n🚏 *Trajeto de transporte público:*`
      for (const step of stepsTransit) {
        texto += `\n🚌 Linha ${step.linha ?? "?"} → ${step.rumo ?? "?"}\n   📍 Embarque: ${step.paradaSaida ?? "?"} (${step.saida ?? "?"})\n   📍 Desembarque: ${step.paradaChegada ?? "?"} (${step.chegada ?? "?"})\n   🔢 ${step.numParadas ?? "?"} paradas`
      }
    }
  }

  return texto
}

async function copiarParaClipboard(texto: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(texto)
  } catch {
    const el = document.createElement("textarea")
    el.value = texto
    el.style.cssText = "position:fixed;opacity:0"
    document.body.appendChild(el)
    el.select()
    document.execCommand("copy")
    document.body.removeChild(el)
  }
}

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

  // projetoId → sigla (carregado uma vez para uso no compartilhamento)
  const [projetosSiglas, setProjetosSiglas] = useState<Map<string, string>>(new Map())
  // Cores do cadastro para o avatar da tabela e os marcadores do mapa
  // (system.md §5.4). São dados do banco, lidos pelas actions que já existem.
  const [coresPorProjeto, setCoresPorProjeto] = useState<Map<string, string>>(
    new Map()
  )
  const [coresPorTecnico, setCoresPorTecnico] = useState<Map<string, string>>(
    new Map()
  )

  // loading do botão "Compartilhar lote inteiro"
  const [compartilhandoLote, setCompartilhandoLote] = useState(false)

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
    listarProjetos()
      .then((lista) => {
        setProjetosSiglas(new Map(lista.map((p) => [p.id, p.sigla])))
        setCoresPorProjeto(new Map(lista.map((p) => [p.id, p.cor])))
      })
      .catch(() => {/* sigla fica vazia, exibe projetoId como fallback */})
    listarTecnicos()
      .then((lista) =>
        setCoresPorTecnico(new Map(lista.map((t) => [t.id, t.cor])))
      )
      .catch(() => {/* avatar cai no cinza neutro */})
    return () => {
      cancelado = true
    }
  }, [loteId])

  // Copia UMA rota para o WhatsApp. A `referencia` é a única leitura do Ponto que
  // sobrou (ver o aviso em carregarReferencias) — todo o resto sai do snapshot.
  const copiarUmaRota = useCallback(
    async (rota: Rota) => {
      try {
        const ponto = await buscarPonto(rota.pontoId).catch(() => null)
        const modo = modosPorRota.get(rota.id) ?? rota.modoPrincipal
        const entrada = rotaCache.get(`${rota.id}|${modo}`)
        const steps = entrada?.estado === "ok" ? entrada.transitSteps : undefined
        await copiarParaClipboard(
          gerarTextoRota(
            rota,
            projetosSiglas.get(rota.projetoId) ?? rota.projetoId,
            ponto?.referencia,
            steps
          )
        )
        toast.success("Copiado! Cole no WhatsApp. 📋")
      } catch {
        toast.error("Erro ao copiar.")
      }
    },
    [modosPorRota, rotaCache, projetosSiglas]
  )

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
  //
  // A rota detalhada tem precedência quando já foi buscada; sem ela vale a
  // métrica do snapshot da rota — para TRANSIT também. Antes este helper
  // devolvia null para TRANSIT e descartava `rota.metricas.TRANSIT`, que está
  // gravada no snapshot desde a confirmação: as rotas de transporte público
  // ficavam em "calculando…" para sempre, porque a busca detalhada só acontece
  // quando o usuário expande o card.
  const obterDuracaoSeg = useCallback(
    (rota: Rota, modo: ModoTransporte): number | null => {
      const entry = rotaCache.get(`${rota.id}|${modo}`)
      if (entry?.estado === "ok") return entry.duracaoSegundos
      return rota.metricas[modo]?.duracaoSegundos ?? null
    },
    [rotaCache]
  )

  // ====== Helper: distância no modo selecionado ======
  const obterDistanciaMetros = useCallback(
    (rota: Rota, modo: ModoTransporte): number | null => {
      const entry = rotaCache.get(`${rota.id}|${modo}`)
      if (entry?.estado === "ok") return entry.distanciaMetros
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

  const rotasCanceladas = useMemo(
    () => rotas.filter((r) => r.status === "Cancelada"),
    [rotas]
  )

  // Pares do mapa do lote. SÓ rotas confirmadas: o mapa mostra o que está valendo
  // em campo, e uma linha cancelada ali seria lida como rota ativa.
  //
  // Origem e destino saem do SNAPSHOT da rota, nunca do Ponto via `pontoId` — 12
  // dos 13 vínculos do dado legado apontam para o ponto errado (§10.10 do
  // handoff). A polyline vem do cache: onde a rota já foi buscada, caminho real;
  // onde não, reta tracejada. Nenhuma chamada nova.
  const paresNoMapa = useMemo(
    () =>
      rotasAtivas.map((r) => {
        const modo = modosPorRota.get(r.id) ?? r.modoPrincipal
        const entrada = rotaCache.get(`${r.id}|${modo}`)
        return {
          chave: r.id,
          tecnicoNome: r.tecnicoNome,
          umNome: r.umNome,
          origem: {
            latitude: r.origem.latitude,
            longitude: r.origem.longitude,
          },
          destino: {
            latitude: r.destino.latitude,
            longitude: r.destino.longitude,
          },
          corTecnico: coresPorTecnico.get(r.tecnicoId) ?? "#008F95",
          corProjeto: coresPorProjeto.get(r.projetoId) ?? "#491027",
          polyline: entrada?.estado === "ok" ? entrada.polyline : null,
        }
      }),
    [rotasAtivas, modosPorRota, rotaCache, coresPorTecnico, coresPorProjeto]
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
      .map((r) => r.criadoEm)
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
      origemDecisao: relevantes[0]?.origemDecisao ?? "auto",
      temRealocacoes: relevantes.some((r) => r.realocadaDe !== null),
      justificativaGemini:
        relevantes[0]?.loteJustificativa?.trim()
          ? relevantes[0].loteJustificativa
          : undefined,
      projetoIds: Array.from(
        new Set(relevantes.map((r) => r.projetoId).filter((id): id is string => !!id))
      ),
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

  const handleCompartilharLote = async () => {
    setCompartilhandoLote(true)
    try {
      const referencias = await buscarReferenciaPontos(rotas)
      const textos = rotas.map((r) =>
        gerarTextoRota(
          r,
          projetosSiglas.get(r.projetoId) ?? r.projetoId,
          referencias.get(r.pontoId)
        )
      )
      await copiarParaClipboard(textos.join("\n──────────────────\n"))
      toast.success("Copiado! Cole no WhatsApp. 📋")
    } finally {
      setCompartilhandoLote(false)
    }
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

  const dataLote = primeiraRota.criadoEm ?? new Date()
  const loteIdCurto = loteId.slice(0, 8)
  const podeCancelar = confirmadas.length > 0
  const totalTecnicosUnicos = new Set(rotas.map((r) => r.tecnicoNome)).size
  const totalUmsUnicas = new Set(rotas.map((r) => r.umNome)).size

  // Q1: justificativa global do lote, pra replicar no expand de cada rota
  const justificativaLote = primeiraRota.loteJustificativa ?? ""

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
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-xs uppercase tracking-widest tabular-nums text-muted-foreground">
                Lote {loteIdCurto}
              </p>
              <StatusBadge statusLote={statusLote} />
              {primeiraRota.origemDecisao !== "auto" && <BadgeAjusteManual />}
              {rotas.some((r) => r.realocadaDe !== null) && <BadgeReotimizacao />}
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

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => void handleCompartilharLote()}
              disabled={compartilhandoLote}
              className="gap-2"
            >
              {compartilhandoLote ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Share2 className="h-4 w-4" />
              )}
              Compartilhar
            </Button>
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
      </div>

      {/* JUSTIFICATIVA */}
      {justificativaLote.trim().length > 0 && (
        <JustificativaBanner texto={justificativaLote} />
      )}

      {/* MÉTRICAS AGREGADAS */}
      {rotasAtivas.length > 0 && (
        <MetricasCards
          derivadas={metricasAgregadas}
          modoPredominante={modoPredominante}
        />
      )}

      {/* ROTAS CONFIRMADAS NO MAPA — as canceladas não são plotadas: o mapa
          mostra o que está valendo em campo, e uma linha cancelada ali seria lida
          como rota ativa. */}
      {paresNoMapa.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-t-2 border-t-primary bg-card shadow-[var(--shadow-1)]">
          <div className="flex items-center justify-between gap-4 border-b px-[22px] py-3.5">
            <h2 className="text-[17px] font-semibold">
              Rotas confirmadas no mapa
            </h2>
            <span className="text-[13px] text-muted-foreground">
              {expandida
                ? "Trajeto real desenhado — clique de novo para ver o lote"
                : rotasCanceladas.length > 0
                  ? "Rotas canceladas não são plotadas"
                  : "Todas as rotas do lote"}
            </span>
          </div>
          <MapaLote
            pares={paresNoMapa}
            chaveSelecionada={expandida}
            altura={420}
          />
        </section>
      )}

      {/* TABELA DE ROTAS */}
      <section className="space-y-3">
        <h2 className="text-[17px] font-semibold">Rotas do lote</h2>
        <div className="overflow-x-auto rounded-xl border border-t-2 border-t-primary bg-card shadow-[var(--shadow-1)]">
          <div className="grid min-w-[900px] gap-4 bg-muted px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground [grid-template-columns:36px_minmax(0,1.2fr)_minmax(0,1fr)_120px_110px_120px]">
            <span>#</span>
            <span>Técnico</span>
            <span>Destino</span>
            <span>Duração</span>
            <span>Distância</span>
            <span>Status</span>
          </div>
          {rotas.map((rota, i) => (
            <LinhaTabelaRota
              key={rota.id}
              rota={rota}
              ordem={i + 1}
              modo={modosPorRota.get(rota.id) ?? rota.modoPrincipal}
              duracaoSeg={obterDuracaoSeg(
                rota,
                modosPorRota.get(rota.id) ?? rota.modoPrincipal
              )}
              distanciaMetros={obterDistanciaMetros(
                rota,
                modosPorRota.get(rota.id) ?? rota.modoPrincipal
              )}
              corTecnico={coresPorTecnico.get(rota.tecnicoId)}
              projetoSigla={projetosSiglas.get(rota.projetoId) ?? rota.projetoId}
              corProjeto={coresPorProjeto.get(rota.projetoId)}
              todasRotasLote={rotas}
              onCopiar={() => copiarUmaRota(rota)}
              destacada={expandida === rota.id}
              onVerTrajeto={() => handleExpandir(rota.id)}
            />
          ))}
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

/**
 * Uma linha da tabela de rotas — o formato do protótipo v2 para o Detalhe.
 *
 * Substituiu os cards expansíveis: num lote já confirmado o trabalho é conferir
 * um conjunto, e tabela compara melhor que card. Seis colunas (#, Técnico,
 * Destino, Duração, Distância, Status) mais uma segunda linha com a explicação
 * algorítmica e o botão de copiar.
 *
 * Rota cancelada entra com opacidade reduzida: continua auditável, sem competir
 * com as ativas na varredura.
 */
function LinhaTabelaRota({
  rota,
  ordem,
  modo,
  duracaoSeg,
  distanciaMetros,
  corTecnico,
  projetoSigla,
  corProjeto,
  todasRotasLote,
  onCopiar,
  destacada,
  onVerTrajeto,
}: {
  rota: Rota
  ordem: number
  modo: ModoTransporte
  duracaoSeg: number | null
  distanciaMetros: number | null
  corTecnico: string | undefined
  projetoSigla: string
  corProjeto: string | undefined
  todasRotasLote: Rota[]
  onCopiar: () => void
  destacada: boolean
  onVerTrajeto: () => void
}) {
  const cancelada = rota.status === "Cancelada"
  const custos = todasRotasLote
    .map((r) => r.metricas[r.modoPrincipal]?.duracaoSegundos ?? 0)
    .filter((n) => n > 0)
  const explicacao =
    duracaoSeg && duracaoSeg > 0
      ? gerarExplicacaoAlgoritmica({
          tecnicoNome: rota.tecnicoNome,
          umNome: rota.umNome,
          meuCustoSegundos: duracaoSeg,
          todosCustosSegundos: custos,
          modoLabel: nomeAmigavelModo(modo),
          manual: rota.origemDecisao !== "auto",
        })
      : ""

  return (
    <div
      className={`min-w-[900px] border-t ${cancelada ? "opacity-60" : ""} ${
        destacada ? "bg-accent/40" : ""
      }`}
    >
      <div className="grid items-center gap-4 px-5 pb-1.5 pt-3.5 [grid-template-columns:36px_minmax(0,1.2fr)_minmax(0,1fr)_120px_110px_120px]">
        <span className="text-xs tabular-nums text-muted-foreground">
          {ordem}
        </span>

        <span className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
            style={{
              backgroundColor: corTecnico ?? "var(--muted)",
              color: corTecnico
                ? corTextoIdeal(corTecnico)
                : "var(--muted-foreground)",
            }}
          >
            {iniciaisDe(rota.tecnicoNome)}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-semibold" title={rota.tecnicoNome}>
              {rota.tecnicoNome}
            </span>
            <span
              className="truncate text-[12.5px] text-muted-foreground"
              title={rota.origem.endereco}
            >
              {rota.origem.endereco}
            </span>
          </span>
        </span>

        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-1.5">
            <span
              className="badge-cor-dado shrink-0 rounded-full border px-[7px] py-px font-mono text-[10.5px] font-semibold"
              style={
                { "--cor-dado": corProjeto ?? "#697272" } as React.CSSProperties
              }
            >
              {projetoSigla}
            </span>
            <span className="truncate text-sm font-semibold">{rota.umNome}</span>
          </span>
          {/* O endereço é o do SNAPSHOT da rota. */}
          <span
            className="truncate text-[12.5px] text-muted-foreground"
            title={rota.destino.endereco}
          >
            {rota.destino.endereco}
          </span>
        </span>

        <span className="flex flex-col gap-0.5">
          {duracaoSeg != null ? (
            <span className="text-sm font-semibold tabular-nums">
              {formatarDuracao(duracaoSeg)}
            </span>
          ) : (
            <span className="h-4 w-14 animate-pulse rounded bg-skeleton" />
          )}
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <IconeModo modo={modo} className="size-3.5" />
            {nomeAmigavelModo(modo)}
          </span>
        </span>

        <span className="text-sm tabular-nums text-muted-foreground">
          {distanciaMetros != null ? formatarDistancia(distanciaMetros) : "—"}
        </span>

        <span className="justify-self-start">
          {cancelada ? (
            <Badge
              variant="outline"
              className="border-err/40 bg-transparent text-err"
            >
              Cancelada
            </Badge>
          ) : (
            <Badge variant="outline" className="border-ok bg-ok-tint text-ok">
              Confirmada
            </Badge>
          )}
        </span>
      </div>

      <div className="flex items-start justify-between gap-5 pb-3.5 pl-[72px] pr-5">
        <span className="max-w-[760px] text-pretty text-[13px] leading-relaxed text-muted-foreground">
          {explicacao}
        </span>
        <span className="flex shrink-0 gap-2">
          {/* Uma chamada sob demanda, a mesma economia do par expandido: sem
              isto nada carregaria a polyline no Detalhe e o mapa ficaria
              tracejado para sempre. */}
          {!cancelada && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onVerTrajeto}
              className="h-[30px] px-3 text-[12.5px]"
            >
              {destacada ? "Ocultar trajeto" : "Ver trajeto"}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onCopiar}
            className="h-[30px] px-3 text-[12.5px]"
          >
            Copiar rota
          </Button>
        </span>
      </div>
    </div>
  )
}

/** "José Frederico" -> "JF". */
function iniciaisDe(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? "")
    .join("")
    .toUpperCase()
}

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



/** Mesma regra do card de lote: ver system.md §5.2. */
function StatusBadge({ statusLote }: { statusLote: StatusLote }) {
  if (statusLote === "Confirmada") {
    return (
      <Badge variant="outline" className="border-ok bg-ok-tint text-ok">
        Confirmada
      </Badge>
    )
  }
  if (statusLote === "Cancelada") {
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

function BadgeAjusteManual() {
  return (
    <Badge
      variant="outline"
      className="gap-1 border-info/40 bg-transparent text-info"
    >
      <Hand className="h-3 w-3" />
      Ajuste manual
    </Badge>
  )
}

function BadgeReotimizacao() {
  return (
    <Badge
      variant="outline"
      className="gap-1 border-info/40 bg-info-tint text-info"
    >
      <RefreshCw className="h-3 w-3" />
      Re-otimização
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

// iconeDoVeiculoTransit, formatarHoraISO, DetalhesTransit
// importados de ../../calcular-rotas/_components/alocacao-helpers
// IconeModo, gerarExplicacaoAlgoritmica importados de @/lib/modos-transporte
