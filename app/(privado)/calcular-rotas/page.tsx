"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  Info,
  MapPin,
  RefreshCw,
  Sparkles,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { listarProjetos, type Projeto } from "@/lib/firestore/projetos"
import { listarTodosPontos, type Ponto } from "@/lib/firestore/pontos"
import { listarTecnicos, type Tecnico } from "@/lib/firestore/tecnicos"
import {
  aplicarReotimizacao,
  confirmarAlocacao,
  listarRotasPorStatus,
  obterDestinosPorUM,
  obterDestinosRealocaveisPorUM,
  type Rota,
} from "@/lib/firestore/rotas"
import { corTextoIdeal } from "@/lib/firestore/ras"
import { useRouter } from "next/navigation"
import {
  ResultadoAlocacao,
  type AlocacaoRica,
  type RespostaAlocacao,
  type PayloadConfirmacao,
} from "./_components/resultado-alocacao"


export default function CalcularRotasPage() {
  // ====== ESTADO ======
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [pontos, setPontos] = useState<Ponto[]>([])
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([])
  const [rotasConfirmadas, setRotasConfirmadas] = useState<Rota[]>([])
  const [carregando, setCarregando] = useState(true)

  // ====== CARREGAMENTO INICIAL ======
  useEffect(() => {
    let cancelado = false

    async function carregar() {
      try {
        const [listaProjetos, listaPontos, listaTecnicos, listaRotasConfirmadas] =
          await Promise.all([
            listarProjetos(),
            listarTodosPontos(),
            listarTecnicos(),
            listarRotasPorStatus("Confirmada"),
          ])
        if (cancelado) return
        setProjetos(listaProjetos)
        setPontos(listaPontos)
        setTecnicos(listaTecnicos)
        setRotasConfirmadas(listaRotasConfirmadas)
      } catch (err) {
        if (cancelado) return
        console.error("Erro ao carregar dados:", err)
        toast.error("Erro ao carregar dados para alocação.")
      } finally {
        if (!cancelado) setCarregando(false)
      }
    }

    carregar()
    return () => {
      cancelado = true
    }
  }, [])

  // ====== RENDER ======
  return (
    <div className="space-y-8">
      {/* HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Operação
          </p>
          <h1 className="mt-1 font-heading text-4xl">Calcular Rotas</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Alocação inteligente: o sistema sugere qual técnico vai para qual
            UM com base na distância da casa de cada um, usando Google Routes
            API e IA Gemini.
          </p>
        </div>
      </div>

      {/* CONTEÚDO */}
      {carregando ? (
        <SkeletonLoading />
      ) : (
        <ConteudoCondicional
          projetos={projetos}
          pontos={pontos}
          tecnicos={tecnicos}
          rotasConfirmadas={rotasConfirmadas}
        />
      )}
    </div>
  )
}

// ============================================================
// CONTEÚDO CONDICIONAL — empty states ou seleção
// ============================================================

function ConteudoCondicional({
  projetos,
  pontos,
  tecnicos,
  rotasConfirmadas,
}: {
  projetos: Projeto[]
  pontos: Ponto[]
  tecnicos: Tecnico[]
  rotasConfirmadas: Rota[]
}) {
  const umsAptasPorProjeto = projetos
    .map((p) => ({
      projeto: p,
      destinos: obterDestinosPorUM(pontos, p.id),
    }))
    .filter((p) => p.destinos.size > 0)

  const totalUmsAptas = umsAptasPorProjeto.reduce(
    (acc, p) => acc + p.destinos.size,
    0
  )

  const tecnicosComLocalizacao = tecnicos.filter(
    (t) => t.latitude !== null && t.longitude !== null
  )

  // 13.12: UMs com pontos realocáveis (Pendente + Agendado + Atual)
  const umsRealocaveisPorProjeto = projetos
    .map((p) => ({
      projeto: p,
      destinos: obterDestinosRealocaveisPorUM(pontos, p.id),
    }))
    .filter((p) => p.destinos.size > 0)

  const tecnicosComRotaAtiva = new Set(rotasConfirmadas.map((r) => r.tecnicoId))
  const temRotasAtivas = tecnicosComRotaAtiva.size > 0

  if (tecnicos.length === 0) {
    return (
      <EstadoVazio
        titulo="Nenhum técnico cadastrado"
        descricao="Antes de calcular rotas, cadastre pelo menos um técnico com endereço completo."
        linkLabel="Cadastrar técnicos"
        linkHref="/admin/tecnicos"
      />
    )
  }

  if (tecnicosComLocalizacao.length === 0) {
    return (
      <EstadoVazio
        titulo="Técnicos sem geocodificação"
        descricao="Os técnicos cadastrados não têm coordenadas (lat/lng) salvas. Edite cada um e use o botão de geocodificar o endereço."
        linkLabel="Ir para Técnicos"
        linkHref="/admin/tecnicos"
      />
    )
  }

  // Com re-otimização: se há pontos realocáveis (mesmo sem Pendentes), prossegue
  if (totalUmsAptas === 0 && !temRotasAtivas) {
    return (
      <EstadoVazio
        titulo="Todos os pontos pendentes foram alocados"
        descricao="Não há UMs com pontos Pendentes no momento. Confira o histórico para ver as rotas ativas ou sincronize a planilha para importar novos destinos."
        linkLabel="Ver histórico de alocações"
        linkHref="/historico"
      />
    )
  }

  return (
    <FluxoAlocacao
      tecnicos={tecnicosComLocalizacao}
      umsAptasPorProjeto={totalUmsAptas > 0 ? umsAptasPorProjeto : []}
      umsRealocaveisPorProjeto={umsRealocaveisPorProjeto}
      rotasConfirmadas={rotasConfirmadas}
    />
  )
}

// ============================================================
// FLUXO DE ALOCAÇÃO — máquina de estados
// ============================================================

type EtapaCalculo =
  | "selecao"
  | "calculando"
  | "resultado"
  | "reotimizacao"
  | "erro"
  | "confirmando"
  | "confirmado"
  | "erroConfirmar"

type ItemUM = {
  key: string
  projeto: Projeto
  umNome: string
  destino: Ponto
}

/** Oportunidade de re-otimização detectada após cálculo (13.12). */
type OportunidadeReotimizacao = {
  tecnicoId: string
  tecnicoNome: string
  rotaAtualId: string
  pontoAtualId: string
  umAtual: string
  tempoAtualSeg: number
  umNova: string
  pontoNovoId: string
  tempoNovoSeg: number
  economiaSeg: number
  novaAloc: AlocacaoRica
}

function FluxoAlocacao({
  tecnicos,
  umsAptasPorProjeto,
  umsRealocaveisPorProjeto,
  rotasConfirmadas,
}: {
  tecnicos: Tecnico[]
  umsAptasPorProjeto: Array<{ projeto: Projeto; destinos: Map<string, Ponto> }>
  umsRealocaveisPorProjeto: Array<{ projeto: Projeto; destinos: Map<string, Ponto> }>
  rotasConfirmadas: Rota[]
}) {
  // Achata as UMs Pendentes em lista plana (seleção visível na UI)
  const itensUM = useMemo<ItemUM[]>(() => {
    const lista: ItemUM[] = []
    for (const { projeto, destinos } of umsAptasPorProjeto) {
      for (const [umNome, destino] of destinos) {
        lista.push({ key: `${projeto.id}|${umNome}`, projeto, umNome, destino })
      }
    }
    return lista
  }, [umsAptasPorProjeto])

  // Pré-seleção: tudo marcado
  const [selectedTecnicoIds, setSelectedTecnicoIds] = useState<Set<string>>(
    () => new Set(tecnicos.map((t) => t.id))
  )
  const [selectedUmKeys, setSelectedUmKeys] = useState<Set<string>>(
    () => new Set(itensUM.map((i) => i.key))
  )

  // Estado da máquina de fluxo
  const [etapa, setEtapa] = useState<EtapaCalculo>("selecao")
  const [resultado, setResultado] = useState<RespostaAlocacao | null>(null)
  const [erroCalculo, setErroCalculo] = useState<string | null>(null)
  const [oportunidades, setOportunidades] = useState<OportunidadeReotimizacao[]>([])
  const [rotasConfirmadasIds, setRotasConfirmadasIds] = useState<string[]>([])
  const [erroConfirmar, setErroConfirmar] = useState<string | null>(null)
  const router = useRouter()

  // 13.12: map tecnicoId → rotaAtiva (Confirmada)
  const rotaAtivaPorTecnico = useMemo<Map<string, Rota>>(() => {
    const m = new Map<string, Rota>()
    for (const r of rotasConfirmadas) {
      const existente = m.get(r.tecnicoId)
      if (!existente || (r.criadoEm && existente.criadoEm && r.criadoEm > existente.criadoEm)) {
        m.set(r.tecnicoId, r)
      }
    }
    return m
  }, [rotasConfirmadas])

  // 13.12: rotas ativas dos técnicos atualmente selecionados
  const tecnicosAtivosSelected = useMemo<Rota[]>(() => {
    return Array.from(rotaAtivaPorTecnico.values()).filter((r) =>
      selectedTecnicoIds.has(r.tecnicoId)
    )
  }, [rotaAtivaPorTecnico, selectedTecnicoIds])

  const totalSelTecnicos = selectedTecnicoIds.size
  const totalSelUms = selectedUmKeys.size

  // === TOGGLES ===
  const toggleTecnico = (id: string) => {
    setSelectedTecnicoIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleUm = (key: string) => {
    setSelectedUmKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selecionarTodosTecnicos = () =>
    setSelectedTecnicoIds(new Set(tecnicos.map((t) => t.id)))
  const limparTecnicos = () => setSelectedTecnicoIds(new Set())
  const selecionarTodasUms = () =>
    setSelectedUmKeys(new Set(itensUM.map((i) => i.key)))
  const limparUms = () => setSelectedUmKeys(new Set())

  const podeCalcular = totalSelTecnicos > 0 && totalSelUms > 0
  const contagensDiferem = totalSelTecnicos !== totalSelUms

  // === CHAMADA À API ===
  const handleCalcular = async () => {
    setEtapa("calculando")
    setErroCalculo(null)
    setResultado(null)
    setOportunidades([])

    try {
      const tecsSemCoord = tecnicos
        .filter((t) => selectedTecnicoIds.has(t.id))
        .filter((t) => t.latitude === null || t.longitude === null)
      if (tecsSemCoord.length > 0) {
        throw new Error(
          `Técnico(s) sem coordenadas: ${tecsSemCoord.map((t) => t.nome).join(", ")}. Geocodifique antes de alocar.`
        )
      }

      const destsSemCoord = itensUM
        .filter((i) => selectedUmKeys.has(i.key))
        .filter((i) => i.destino.latitude === null || i.destino.longitude === null)
      if (destsSemCoord.length > 0) {
        throw new Error(
          `UM(s) sem coordenadas no destino: ${destsSemCoord.map((i) => i.umNome).join(", ")}.`
        )
      }

      const tecnicosPayload = tecnicos
        .filter((t) => selectedTecnicoIds.has(t.id))
        .map((t) => ({
          id: t.id,
          nome: t.nome,
          endereco: t.endereco,
          latitude: t.latitude!,
          longitude: t.longitude!,
        }))

      // 13.12: destinos selecionados (Pendentes) + pontos ativos de técnicos com rota ativa
      // A união garante que técnicos ativos também entram na comparação do Húngaro
      const destinosPendentesSelecionados = itensUM
        .filter((i) => selectedUmKeys.has(i.key))
        .map((item) => ({
          id: item.destino.id,
          umNome: item.umNome,
          projetoId: item.projeto.id,
          projetoSigla: item.projeto.sigla,
          raNome: item.destino.raNome,
          endereco: item.destino.endereco,
          latitude: item.destino.latitude!,
          longitude: item.destino.longitude!,
          ciclo: item.destino.ciclo,
          etapa: item.destino.etapa,
        }))

      // Pontos ativos (Agendado/Atual) de técnicos selecionados com rota ativa
      const pontosAtivosIds = new Set(destinosPendentesSelecionados.map((d) => d.id))
      const destinosAtivos = tecnicosAtivosSelected
        .map((rotaAtiva) => {
          // Busca o ponto correspondente na lista completa de pontos realocáveis
          for (const { projeto, destinos } of umsRealocaveisPorProjeto) {
            const ponto = destinos.get(rotaAtiva.umNome)
            if (ponto && ponto.id === rotaAtiva.pontoId && !pontosAtivosIds.has(ponto.id)) {
              pontosAtivosIds.add(ponto.id)
              return {
                id: ponto.id,
                umNome: rotaAtiva.umNome,
                projetoId: rotaAtiva.projetoId,
                projetoSigla: projeto.sigla,
                raNome: ponto.raNome,
                endereco: ponto.endereco,
                latitude: ponto.latitude!,
                longitude: ponto.longitude!,
                ciclo: ponto.ciclo,
                etapa: ponto.etapa,
              }
            }
          }
          return null
        })
        .filter((d): d is NonNullable<typeof d> => d !== null && d.latitude !== null && d.longitude !== null)

      const destinosPayload = [...destinosPendentesSelecionados, ...destinosAtivos]

      const response = await fetch("/api/routes/alocar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tecnicos: tecnicosPayload,
          destinos: destinosPayload,
          modoPrincipal: "DRIVE",
        }),
      })

      const data = await response.json()

      if (!response.ok || !data.sucesso) {
        const msg =
          data.erro ?? data.detalhe ?? `HTTP ${response.status}: falha ao calcular alocação.`
        throw new Error(msg)
      }

      const resposta = data as RespostaAlocacao
      setResultado(resposta)

      // 13.12: detecta oportunidades de re-otimização (threshold: 5 min = 300s)
      const THRESHOLD_SEG = 300
      const ops: OportunidadeReotimizacao[] = []
      for (const aloc of resposta.alocacoes) {
        const rotaAtiva = rotaAtivaPorTecnico.get(aloc.origem.id)
        if (!rotaAtiva) continue
        if (aloc.destino.id === rotaAtiva.pontoId) continue // mesmo ponto, sem mudança

        const tempoAtual =
          rotaAtiva.metricas[rotaAtiva.modoPrincipal]?.duracaoSegundos ?? 0
        const tempoNovo = aloc.custoSegundosPrincipal
        const economia = tempoAtual - tempoNovo

        if (economia >= THRESHOLD_SEG) {
          ops.push({
            tecnicoId: aloc.origem.id,
            tecnicoNome: aloc.origem.nome,
            rotaAtualId: rotaAtiva.id,
            pontoAtualId: rotaAtiva.pontoId,
            umAtual: rotaAtiva.umNome,
            tempoAtualSeg: tempoAtual,
            umNova: aloc.destino.umNome,
            pontoNovoId: aloc.destino.id,
            tempoNovoSeg: tempoNovo,
            economiaSeg: economia,
            novaAloc: aloc,
          })
        }
      }

      if (ops.length > 0) {
        setOportunidades(ops)
        setEtapa("reotimizacao")
      } else {
        setEtapa("resultado")
      }
    } catch (err) {
      console.error("Erro ao calcular alocação:", err)
      setErroCalculo(
        err instanceof Error ? err.message : "Erro desconhecido no cálculo."
      )
      setEtapa("erro")
    }
  }

  const handleVoltar = () => {
    setEtapa("selecao")
    setResultado(null)
    setErroCalculo(null)
    setOportunidades([])
  }

  // 13.12: aplica re-otimização atomicamente
  const handleAplicarReotimizacao = async () => {
    if (!resultado) return
    setEtapa("confirmando")
    setErroConfirmar(null)
    try {
      const alocacoesInput = resultado.alocacoes.map((aloc) => {
        const rotaAtiva = rotaAtivaPorTecnico.get(aloc.origem.id)
        const isReotimizacao = rotaAtiva && aloc.destino.id !== rotaAtiva.pontoId
        return {
          rotaAntigaId: isReotimizacao ? rotaAtiva.id : undefined,
          pontoAntigoId: isReotimizacao ? rotaAtiva.pontoId : undefined,
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
          metricas: aloc.metricas,
          modoEscolhido: resultado.modoPrincipal,
        }
      })

      const { rotasIds } = await aplicarReotimizacao({
        loteId: resultado.loteId,
        loteJustificativa: resultado.justificativaGemini,
        origemDecisao: "auto",
        alocacoes: alocacoesInput,
      })
      setRotasConfirmadasIds(rotasIds)
      setEtapa("confirmado")
    } catch (err) {
      console.error("Erro ao aplicar re-otimização:", err)
      setErroConfirmar(
        err instanceof Error ? err.message : "Erro desconhecido ao salvar."
      )
      setEtapa("erroConfirmar")
    }
  }

const handleConfirmar = async (payload: PayloadConfirmacao) => {
    setEtapa("confirmando")
    setErroConfirmar(null)
    try {
      const { rotasIds } = await confirmarAlocacao(payload)
      setRotasConfirmadasIds(rotasIds)
      setEtapa("confirmado")
    } catch (err) {
      console.error("Erro ao confirmar alocação:", err)
      setErroConfirmar(
        err instanceof Error ? err.message : "Erro desconhecido ao salvar."
      )
      setEtapa("erroConfirmar")
    }
  }

  // === RENDER CONDICIONAL ===

  if (etapa === "calculando") {
    return <LoadingCalculo totalPares={totalSelTecnicos * totalSelUms} />
  }

  if (etapa === "resultado" && resultado) {
    return (
      <ResultadoAlocacao
        resultado={resultado}
        onVoltar={handleVoltar}
        onConfirmar={handleConfirmar}
      />
    )
  }

  if (etapa === "reotimizacao" && resultado) {
    return (
      <BannerReotimizacao
        oportunidades={oportunidades}
        resultado={resultado}
        onAplicar={handleAplicarReotimizacao}
        onIgnorar={() => setEtapa("resultado")}
      />
    )
  }

  if (etapa === "erro") {
    return (
      <ErroCalculo
        mensagem={erroCalculo ?? "Erro desconhecido."}
        onVoltar={handleVoltar}
      />
    )
  }

  if (etapa === "confirmando") {
    return <ConfirmandoLoading totalAlocacoes={resultado?.alocacoes.length ?? 0} />
  }

  if (etapa === "confirmado") {
    return (
      <ConfirmadoCard
        totalRotas={rotasConfirmadasIds.length}
        onIrAgora={() => router.push("/admin/localidades")}
        onCancelarRedirect={() => setEtapa("selecao")}
      />
    )
  }

  if (etapa === "erroConfirmar") {
    return (
      <ErroConfirmacao
        mensagem={erroConfirmar ?? "Erro desconhecido."}
        onVoltarParaResultado={() => setEtapa("resultado")}
      />
    )
  }

  
  // etapa === "selecao"
  return (
    <div className="space-y-6">
      {/* PRONTIDÃO */}
      <section className="space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Prontidão para alocação
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <CardPrincipal
            valor={tecnicos.length}
            icone={<Users className="h-6 w-6 text-primary" />}
            legenda={
              tecnicos.length === 1
                ? "técnico disponível"
                : "técnicos disponíveis"
            }
          />
          <CardPrincipal
            valor={itensUM.length}
            icone={<MapPin className="h-6 w-6 text-primary" />}
            legenda={
              itensUM.length === 1
                ? "UM aguardando alocação"
                : "UMs aguardando alocação"
            }
          />
        </div>
      </section>

      {/* SELEÇÃO — 2 COLUNAS */}
      <section className="space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Selecione técnicos e UMs
        </h2>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* COLUNA TÉCNICOS */}
          <Card>
            <CardContent className="space-y-4 p-6">
              <CabecalhoColuna
                titulo="Técnicos"
                selecionados={totalSelTecnicos}
                total={tecnicos.length}
                onSelecionarTodos={selecionarTodosTecnicos}
                onLimpar={limparTecnicos}
              />
              <ul className="space-y-2">
                {tecnicos.map((t) => {
                  const id = `tec-${t.id}`
                  const checked = selectedTecnicoIds.has(t.id)
                  return (
                    <li
                      key={t.id}
                      className="flex items-center gap-3 rounded-md border p-3 transition-colors hover:bg-accent/30"
                    >
                      <Checkbox
                        id={id}
                        checked={checked}
                        onCheckedChange={() => toggleTecnico(t.id)}
                      />
                      <Label
                        htmlFor={id}
                        className="flex flex-1 cursor-pointer items-center gap-3"
                      >
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-mono text-sm font-semibold"
                          style={{
                            backgroundColor: t.cor,
                            color: corTextoIdeal(t.cor),
                          }}
                        >
                          {obterIniciais(t.nome)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{t.nome}</p>
                          <p
                            className="truncate text-xs text-muted-foreground"
                            title={t.endereco}
                          >
                            {t.endereco}
                          </p>
                        </div>
                      </Label>
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>

          {/* COLUNA UMs */}
          <Card>
            <CardContent className="space-y-4 p-6">
              <CabecalhoColuna
                titulo="UMs"
                selecionados={totalSelUms}
                total={itensUM.length}
                onSelecionarTodos={selecionarTodasUms}
                onLimpar={limparUms}
              />
              <ul className="space-y-2">
                {itensUM.map((item) => {
                  const id = `um-${item.key}`
                  const checked = selectedUmKeys.has(item.key)
                  return (
                    <li
                      key={item.key}
                      className="flex items-start gap-3 rounded-md border p-3 transition-colors hover:bg-accent/30"
                    >
                      <Checkbox
                        id={id}
                        checked={checked}
                        onCheckedChange={() => toggleUm(item.key)}
                        className="mt-1"
                      />
                      <Label
                        htmlFor={id}
                        className="flex flex-1 cursor-pointer flex-col gap-1"
                      >
                        <div className="flex items-center gap-2">
                          <Badge
                            className="font-mono"
                            style={{
                              backgroundColor: item.projeto.cor,
                              color: corTextoIdeal(item.projeto.cor),
                            }}
                          >
                            {item.projeto.sigla}
                          </Badge>
                          <span className="font-medium">{item.umNome}</span>
                        </div>
                        <p className="text-sm">{item.destino.raNome}</p>
                        <p
                          className="truncate text-xs text-muted-foreground"
                          title={item.destino.endereco}
                        >
                          {item.destino.endereco} · Ciclo {item.destino.ciclo}{" "}
                          / Etapa {item.destino.etapa}
                        </p>
                      </Label>
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 13.12: AVISO DE RE-OTIMIZAÇÃO quando técnicos têm rotas ativas */}
      {tecnicosAtivosSelected.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-blue-300 bg-blue-50/60 p-4 dark:border-blue-800/60 dark:bg-blue-950/30">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
          <div className="space-y-1 text-sm">
            <p className="font-medium text-blue-900 dark:text-blue-100">
              Re-otimização inteligente ativa
            </p>
            <p className="text-blue-800/80 dark:text-blue-200/80">
              {tecnicosAtivosSelected.length}{" "}
              {tecnicosAtivosSelected.length === 1
                ? "técnico selecionado tem"
                : "técnicos selecionados têm"}{" "}
              rota ativa. O algoritmo considerará re-otimização automática —
              se houver melhora de 5+ minutos, você verá as oportunidades antes
              de confirmar.
            </p>
            <p className="flex items-center gap-1 text-xs text-blue-700/70 dark:text-blue-300/70">
              <RefreshCw className="h-3 w-3" />
              Sincronize as planilhas antes de calcular para garantir dados
              atualizados.
            </p>
          </div>
        </div>
      )}

      {/* RESUMO + AÇÃO */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="font-heading text-lg">
              {totalSelTecnicos}{" "}
              {totalSelTecnicos === 1 ? "técnico" : "técnicos"} → {totalSelUms}{" "}
              {totalSelUms === 1 ? "UM" : "UMs"}
            </p>
            {contagensDiferem && podeCalcular && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                ⚠ Contagens diferentes —{" "}
                {Math.min(totalSelTecnicos, totalSelUms)}{" "}
                {Math.min(totalSelTecnicos, totalSelUms) === 1
                  ? "alocação será feita"
                  : "alocações serão feitas"}
                .{" "}
                {totalSelTecnicos > totalSelUms
                  ? `${
                      totalSelTecnicos - totalSelUms
                    } técnico(s) ficarão sem alocação.`
                  : `${
                      totalSelUms - totalSelTecnicos
                    } UM(s) ficarão sem técnico.`}
              </p>
            )}
            {!contagensDiferem && podeCalcular && (
              <p className="text-xs text-muted-foreground">
                Cada técnico será alocado a uma UM, minimizando o deslocamento
                total do time.
              </p>
            )}
            {!podeCalcular && (
              <p className="text-xs text-muted-foreground">
                Selecione pelo menos 1 técnico e 1 UM.
              </p>
            )}
          </div>
          <Button
            onClick={handleCalcular}
            disabled={!podeCalcular}
            size="lg"
            className="gap-2"
          >
            <Sparkles className="h-4 w-4" />
            Calcular Alocação Ótima
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================
// LOADING / ERRO
// ============================================================

function LoadingCalculo({ totalPares }: { totalPares: number }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-5 py-16 text-center">
        <div className="relative h-16 w-16">
          <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-8 w-8 animate-pulse text-primary" />
          </div>
        </div>
        <div className="max-w-md space-y-2">
          <h3 className="font-heading text-2xl">Calculando alocação ótima</h3>
          <p className="text-sm text-muted-foreground">
            Consultando Google Routes para {totalPares}{" "}
            {totalPares === 1 ? "par" : "pares"} (carro, moto e a pé), depois
            executando o algoritmo Húngaro. Isso leva alguns segundos.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function ErroCalculo({
  mensagem,
  onVoltar,
}: {
  mensagem: string
  onVoltar: () => void
}) {
  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
        <div className="rounded-full bg-destructive/15 p-4">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>
        <div className="max-w-md space-y-2">
          <h3 className="font-heading text-2xl text-destructive">
            Erro no cálculo
          </h3>
          <p className="text-sm text-muted-foreground">{mensagem}</p>
        </div>
        <Button onClick={onVoltar} variant="outline" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Voltar e tentar novamente
        </Button>
      </CardContent>
    </Card>
  )
}

// ============================================================
// COMPONENTES DE CONFIRMAÇÃO (13.8)
// ============================================================

function ConfirmandoLoading({ totalAlocacoes }: { totalAlocacoes: number }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-5 py-16 text-center">
        <div className="relative h-16 w-16">
          <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle className="h-8 w-8 animate-pulse text-primary" />
          </div>
        </div>
        <div className="max-w-md space-y-2">
          <h3 className="font-heading text-2xl">Salvando alocação</h3>
          <p className="text-sm text-muted-foreground">
            Persistindo {totalAlocacoes}{" "}
            {totalAlocacoes === 1 ? "rota" : "rotas"} no Firestore e atualizando
            o status dos pontos. Não feche a página.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function ConfirmadoCard({
  totalRotas,
  onIrAgora,
  onCancelarRedirect,
}: {
  totalRotas: number
  onIrAgora: () => void
  onCancelarRedirect: () => void
}) {
  const [contagem, setContagem] = useState(3)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    if (contagem <= 0) {
      onIrAgora()
      return
    }
    const t = setTimeout(() => setContagem((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [contagem, paused, onIrAgora])

  return (
    <Card className="border-emerald-300 bg-emerald-50/60 dark:border-emerald-800/60 dark:bg-emerald-950/30">
      <CardContent className="flex flex-col items-center gap-5 py-16 text-center">
        <div className="rounded-full bg-emerald-500/20 p-4">
          <CheckCircle className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="max-w-md space-y-2">
          <h3 className="font-heading text-3xl text-emerald-900 dark:text-emerald-100">
            Alocação confirmada!
          </h3>
          <p className="text-sm text-emerald-900/80 dark:text-emerald-200/80">
            {totalRotas} {totalRotas === 1 ? "rota foi salva" : "rotas foram salvas"} no
            Firestore com status <strong>Confirmada</strong>. Os pontos
            correspondentes agora estão como <strong>Agendado</strong>.
          </p>
          {!paused && (
            <p className="pt-2 font-mono text-xs uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
              Redirecionando em {contagem}s...
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={onIrAgora} size="lg" className="gap-2">
            Ir para localidades agora
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setPaused(true)
              onCancelarRedirect()
            }}
          >
            Ficar aqui
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function ErroConfirmacao({
  mensagem,
  onVoltarParaResultado,
}: {
  mensagem: string
  onVoltarParaResultado: () => void
}) {
  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
        <div className="rounded-full bg-destructive/15 p-4">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>
        <div className="max-w-md space-y-2">
          <h3 className="font-heading text-2xl text-destructive">
            Erro ao salvar a alocação
          </h3>
          <p className="text-sm text-muted-foreground">{mensagem}</p>
          <p className="text-xs text-muted-foreground">
            Nada foi persistido — a operação é atômica. Você pode tentar
            confirmar de novo.
          </p>
        </div>
        <Button onClick={onVoltarParaResultado} variant="outline" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Voltar para o resultado
        </Button>
      </CardContent>
    </Card>
  )
}

// ============================================================
// BANNER DE RE-OTIMIZAÇÃO (13.12)
// ============================================================

function BannerReotimizacao({
  oportunidades,
  resultado,
  onAplicar,
  onIgnorar,
}: {
  oportunidades: OportunidadeReotimizacao[]
  resultado: RespostaAlocacao
  onAplicar: () => void
  onIgnorar: () => void
}) {
  const economiaTotalSeg = oportunidades.reduce((acc, o) => acc + o.economiaSeg, 0)
  const economiaTotalMin = Math.round(economiaTotalSeg / 60)

  function formatarMin(seg: number) {
    return `${Math.round(seg / 60)} min`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Re-otimização inteligente
        </p>
        <h2 className="mt-1 font-heading text-3xl">
          {oportunidades.length}{" "}
          {oportunidades.length === 1 ? "oportunidade detectada" : "oportunidades detectadas"}
        </h2>
        <p className="mt-2 text-muted-foreground">
          O algoritmo encontrou uma alocação melhor para{" "}
          {oportunidades.length}{" "}
          {oportunidades.length === 1 ? "técnico" : "técnicos"} já alocados.
          Economia potencial: <strong>{economiaTotalMin} min/dia</strong> no
          total.
        </p>
      </div>

      {/* Lista de oportunidades */}
      <Card className="border-amber-300 bg-amber-50/40 dark:border-amber-800/60 dark:bg-amber-950/20">
        <CardContent className="space-y-4 p-6">
          <p className="font-mono text-xs uppercase tracking-widest text-amber-800 dark:text-amber-300">
            Detalhes das oportunidades
          </p>
          <ul className="space-y-3">
            {oportunidades.map((op) => (
              <li
                key={op.tecnicoId}
                className="flex flex-col gap-1 rounded-md border border-amber-200 bg-white/60 p-3 dark:border-amber-800/40 dark:bg-amber-950/30 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-0.5">
                  <p className="font-medium">{op.tecnicoNome}</p>
                  <p className="text-sm text-muted-foreground">
                    <span className="line-through">{op.umAtual}</span>
                    <span className="mx-2">→</span>
                    <span className="font-medium text-foreground">{op.umNova}</span>
                  </p>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground line-through">
                    {formatarMin(op.tempoAtualSeg)}
                  </span>
                  <span className="font-medium">{formatarMin(op.tempoNovoSeg)}</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-mono text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                    −{formatarMin(op.economiaSeg)}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          {resultado.alocacoes.length > oportunidades.length && (
            <p className="text-xs text-muted-foreground">
              + {resultado.alocacoes.length - oportunidades.length} alocação(ões)
              nova(s) para pontos pendentes serão aplicadas junto.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Ações */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="font-heading text-lg">Aplicar re-otimização?</p>
            <p className="text-xs text-muted-foreground">
              Rotas ativas substituídas serão canceladas automaticamente.
              Operação atômica.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={onIgnorar} className="gap-2">
              Ignorar e ver resultado
            </Button>
            <Button onClick={onAplicar} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Aplicar re-otimização
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================
// SUBCOMPONENTES REUTILIZÁVEIS
// ============================================================

function CardPrincipal({
  valor,
  icone,
  legenda,
}: {
  valor: number
  icone: React.ReactNode
  legenda: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-6">
        <div className="rounded-full bg-primary/10 p-3">{icone}</div>
        <div>
          <p className="font-heading text-3xl">{valor}</p>
          <p className="text-sm text-muted-foreground">{legenda}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function CabecalhoColuna({
  titulo,
  selecionados,
  total,
  onSelecionarTodos,
  onLimpar,
}: {
  titulo: string
  selecionados: number
  total: number
  onSelecionarTodos: () => void
  onLimpar: () => void
}) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="font-heading text-lg">
        {titulo}{" "}
        <span className="font-mono text-sm text-muted-foreground">
          ({selecionados}/{total})
        </span>
      </h3>
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onSelecionarTodos}
          disabled={selecionados === total}
        >
          Todos
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onLimpar}
          disabled={selecionados === 0}
        >
          Limpar
        </Button>
      </div>
    </div>
  )
}

function SkeletonLoading() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="h-12 w-12 animate-pulse rounded-full bg-muted" />
              <div className="space-y-2">
                <div className="h-8 w-12 animate-pulse rounded bg-muted" />
                <div className="h-3 w-32 animate-pulse rounded bg-muted" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="space-y-3 p-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-muted" />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function EstadoVazio({
  titulo,
  descricao,
  linkLabel,
  linkHref,
}: {
  titulo: string
  descricao: string
  linkLabel: string
  linkHref: string
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="rounded-full bg-muted p-4">
          <AlertCircle className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h2 className="font-heading text-2xl">{titulo}</h2>
          <p className="max-w-md text-sm text-muted-foreground">{descricao}</p>
        </div>
        <Button asChild className="mt-2">
          <Link href={linkHref}>{linkLabel}</Link>
        </Button>
      </CardContent>
    </Card>
  )
}

// ============================================================
// HELPERS
// ============================================================

function obterIniciais(nome: string): string {
  const preposicoes = new Set(["de", "do", "da", "dos", "das", "e"])
  const palavras = nome
    .split(/\s+/)
    .filter((p) => p.length > 0 && !preposicoes.has(p.toLowerCase()))

  if (palavras.length === 0) return "?"
  if (palavras.length === 1) return palavras[0][0]?.toUpperCase() ?? "?"

  return (
    (palavras[0][0]?.toUpperCase() ?? "") +
    (palavras[palavras.length - 1][0]?.toUpperCase() ?? "")
  )
}