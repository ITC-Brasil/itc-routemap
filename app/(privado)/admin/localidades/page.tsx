"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Filter, MapPin, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  listarProjetos,
  type Projeto,
} from "@/lib/firestore/projetos"
import {
  listarTodosPontos,
  type Ponto,
} from "@/lib/firestore/pontos"
import { corTextoIdeal } from "@/lib/firestore/ras"
import { TabelaPontos } from "./_components/tabela-pontos"
import { EditarPontoDialog } from "./_components/editar-ponto-dialog"

// ============================================================
// TIPOS DA API DE SINCRONIZAÇÃO
// TODO P2: mover pra lib/firestore/types.ts junto com Ponto/Projeto
// ============================================================

type ResumoAbaSync = {
  nomeAba: string
  totalLinhas: number
  erro: string | null
}

type RelatorioSync = {
  sucesso: true
  totalLinhasPlanilha: number
  novos: number
  atualizados: number
  deletados: number
  ignorados: number
  abas: ResumoAbaSync[]
  duracao: number
}

type RespostaSyncErro = {
  sucesso: false
  erro: string
  detalhe?: string
}

type RespostaSync = RelatorioSync | RespostaSyncErro
export default function LocalidadesPage() {
  // ====== ESTADO ======
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [pontos, setPontos] = useState<Ponto[]>([])
  const [carregando, setCarregando] = useState(true)
  const [sincronizando, setSincronizando] = useState(false)

  // ====== EFFECTS ======
  useEffect(() => {
    let cancelado = false

    async function carregarInicial() {
      try {
        const [listaProjetos, listaPontos] = await Promise.all([
          listarProjetos(),
          listarTodosPontos(),
        ])
        if (cancelado) return
        setProjetos(listaProjetos)
        setPontos(listaPontos)
      } catch (err) {
        if (cancelado) return
        console.error("Erro ao carregar dados:", err)
        toast.error("Erro ao carregar localidades. Tente recarregar a página.")
      } finally {
        if (!cancelado) setCarregando(false)
      }
    }

    carregarInicial()

    return () => {
      cancelado = true
    }
  }, [])

  // ====== AÇÕES ======
 /**
   * Recarrega projetos e pontos do Firestore SEM exibir skeleton.
   * O skeleton é reservado pro mount inicial (no useEffect); aqui usamos
   * pra refrescar dados após sync ou edição mantendo a UI estável
   * (filtros, paginação, etc).
   */
  const recarregarDados = async () => {
    try {
      const [listaProjetos, listaPontos] = await Promise.all([
        listarProjetos(),
        listarTodosPontos(),
      ])
      setProjetos(listaProjetos)
      setPontos(listaPontos)
    } catch (err) {
      console.error("Erro ao recarregar dados:", err)
      toast.error("Erro ao recarregar localidades.")
    }
  }

  const handleAtualizarPontos = async () => {
    // 1. Filtra só projetos prontos pra sincronizar
    const projetosComPlanilha = projetos.filter(
      (p) => p.sheetId && p.sheetAbas && p.sheetAbas.length > 0
    )

    if (projetosComPlanilha.length === 0) {
      toast.error("Nenhum projeto com planilha configurada.", {
        description:
          "Edite seus projetos e informe a URL da planilha + abas.",
      })
      return
    }

    setSincronizando(true)
    const toastId = toast.loading(
      `Sincronizando ${projetosComPlanilha.length} ${
        projetosComPlanilha.length === 1 ? "projeto" : "projetos"
      }...`
    )

    // 2. Dispara em paralelo, tolerando falhas individuais via allSettled
    const resultados = await Promise.allSettled(
      projetosComPlanilha.map(async (projeto) => {
        const res = await fetch("/api/sincronizar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projetoId: projeto.id }),
        })
        const json = (await res.json()) as RespostaSync
        if (!res.ok || !json.sucesso) {
          const erroJson = json as RespostaSyncErro
          const mensagem = erroJson.erro ?? "Erro desconhecido"
          const detalhe = erroJson.detalhe ? ` — ${erroJson.detalhe}` : ""
          throw new Error(`${projeto.sigla}: ${mensagem}${detalhe}`)
        }
        return { projeto, relatorio: json }
      })
    )

    // 3. Separa sucessos e falhas
    const sucessos = resultados.flatMap((r) =>
      r.status === "fulfilled" ? [r.value] : []
    )
    const falhas = resultados.flatMap((r) =>
      r.status === "rejected"
        ? [r.reason instanceof Error ? r.reason.message : String(r.reason)]
        : []
    )

    // 4. Agrega contadores dos sucessos
    const totalNovos = sucessos.reduce((s, x) => s + x.relatorio.novos, 0)
    const totalAtualizados = sucessos.reduce(
      (s, x) => s + x.relatorio.atualizados,
      0
    )
    const totalDeletados = sucessos.reduce(
      (s, x) => s + x.relatorio.deletados,
      0
    )

    // 5. Coleta erros granulares por aba (mesmo dentro de projetos OK)
    const abasComErro: string[] = []
    for (const { projeto, relatorio } of sucessos) {
      for (const aba of relatorio.abas) {
        if (aba.erro) {
          abasComErro.push(`${projeto.sigla}/${aba.nomeAba}: ${aba.erro}`)
        }
      }
    }

    // 6. Feedback final (1 toast só, com hierarquia clara)
    toast.dismiss(toastId)

    const resumoCounts = `${totalNovos} novo${
      totalNovos === 1 ? "" : "s"
    } · ${totalAtualizados} atualizado${
      totalAtualizados === 1 ? "" : "s"
    } · ${totalDeletados} removido${totalDeletados === 1 ? "" : "s"}`

    if (falhas.length === 0 && abasComErro.length === 0) {
      toast.success("Sincronização concluída", { description: resumoCounts })
    } else if (sucessos.length === 0) {
      toast.error("Falha na sincronização", {
        description: falhas[0] ?? "Verifique o console.",
      })
    } else {
      const detalhes: string[] = []
      if (falhas.length > 0) {
        detalhes.push(
          `${falhas.length} projeto${falhas.length === 1 ? "" : "s"} falhou.`
        )
      }
      if (abasComErro.length > 0) {
        detalhes.push(
          `${abasComErro.length} aba${
            abasComErro.length === 1 ? "" : "s"
          } com erro.`
        )
      }
      toast.warning("Sincronização parcial", {
        description: `${resumoCounts}. ${detalhes.join(" ")}`,
      })
    }

    // Loga detalhes granulares no console pra debug
    if (falhas.length > 0) console.error("Projetos com falha:", falhas)
    if (abasComErro.length > 0) console.error("Abas com erro:", abasComErro)

    // 7. Atualiza a UI com os dados frescos
    await recarregarDados()
    setSincronizando(false)
  }

  // ====== RENDER ======
  return (
    <div className="space-y-8">
      {/* HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Administração
          </p>
          <h1 className="mt-1 font-heading text-4xl">Localidades</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Pontos de operação importados das planilhas Google Sheets de cada
            projeto. Use o botão Atualizar Pontos para sincronizar.
          </p>
        </div>
        <Button
          onClick={handleAtualizarPontos}
          disabled={sincronizando || carregando}
          size="lg"
          className="gap-2"
        >
          <RefreshCw
            className={`h-4 w-4 ${sincronizando ? "animate-spin" : ""}`}
          />
          {sincronizando ? "Sincronizando..." : "Atualizar Pontos"}
        </Button>
      </div>

      {/* CONTEÚDO PRINCIPAL */}
      {carregando ? (
        <SkeletonLoading />
      ) : pontos.length === 0 ? (
        <EstadoVazio projetos={projetos} />
      ) : (
        <ConteudoPrincipal
          projetos={projetos}
          pontos={pontos}
          onRecarregar={recarregarDados}
        />
      )}
    </div>
  )
}

// ============================================================
// SUBCOMPONENTES
// ============================================================

function SkeletonLoading() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="space-y-3 p-6">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="h-8 w-16 animate-pulse rounded bg-muted" />
              <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-muted" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function EstadoVazio({ projetos }: { projetos: Projeto[] }) {
  const semProjetos = projetos.length === 0
  const semPlanilhas = projetos.every((p) => !p.sheetId)

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="rounded-full bg-muted p-4">
          <MapPin className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h2 className="font-heading text-2xl">Nenhum ponto sincronizado</h2>
          {semProjetos ? (
            <p className="max-w-md text-sm text-muted-foreground">
              Antes de sincronizar pontos, cadastre pelo menos um projeto com
              sua planilha Google Sheets vinculada.
            </p>
          ) : semPlanilhas ? (
            <p className="max-w-md text-sm text-muted-foreground">
              Seus projetos ainda não têm planilhas configuradas. Edite cada
              projeto e informe a URL da planilha Google Sheets.
            </p>
          ) : (
            <p className="max-w-md text-sm text-muted-foreground">
              Clique em <strong>Atualizar Pontos</strong> para importar os
              pontos das planilhas vinculadas aos seus projetos.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function ConteudoPrincipal({
  projetos,
  pontos,
  onRecarregar
}: {
  projetos: Projeto[]
  pontos: Ponto[]
  onRecarregar: () => Promise<void>
}) {

  // ====== FILTROS ======
  const [filtroProjeto, setFiltroProjeto] = useState<string>("todos")
  const [filtroUm, setFiltroUm] = useState<string>("todas")
  const [filtroRa, setFiltroRa] = useState<string>("todas")
  const [filtroStatus, setFiltroStatus] = useState<string>("todos")

  // ====== EDIÇÃO (modal virá na 12.8g) ======
  const [pontoEditando, setPontoEditando] = useState<Ponto | null>(null)

  const handleEditarPonto = (ponto: Ponto) => {
    setPontoEditando(ponto)
  }

  // ====== DADOS DERIVADOS ======
  const projetosMap = useMemo(
    () => new Map(projetos.map((p) => [p.id, p])),
    [projetos]
  )

  const estatisticas = calcularEstatisticasPorProjeto(projetos, pontos)
  const umsDisponiveis = obterUmsDisponiveis(pontos, filtroProjeto)
  const rasDisponiveis = obterRasDisponiveis(pontos, filtroProjeto, filtroUm)
  const statusesDisponiveis = obterStatusesDisponiveis(
    pontos,
    filtroProjeto,
    filtroUm,
    filtroRa
  )

  // Se o status selecionado sumiu dos dados (ex: usuário mudou de projeto e o
  // status que ele tinha não existe lá), cai pra "todos" silenciosamente.
  // Estado original preservado: se voltar pro projeto antigo, refiltra sozinho.
  const statusEfetivo =
    filtroStatus === "todos" ||
    statusesDisponiveis.some(([s]) => s === filtroStatus)
      ? filtroStatus
      : "todos"

  const pontosFiltrados = aplicarFiltros(pontos, {
    projeto: filtroProjeto,
    um: filtroUm,
    ra: filtroRa,
    status: statusEfetivo,
  })

  // ====== HANDLERS ======
  const handleProjetoChange = (valor: string) => {
    setFiltroProjeto(valor)
    setFiltroUm("todas")
    setFiltroRa("todas")
  }

  const handleUmChange = (valor: string) => {
    setFiltroUm(valor)
    setFiltroRa("todas")
  }

  return (
    <div className="space-y-8">
      {/* CARDS DE RESUMO */}
      <section className="space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Resumo por projeto
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {estatisticas.map((est) => (
            <CardResumoProjeto key={est.projetoId} estatistica={est} />
          ))}
        </div>
      </section>

      {/* FILTROS */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Filter className="h-4 w-4" />
            <h2 className="font-mono text-xs uppercase tracking-widest">
              Filtros
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="filtro-projeto">Projeto</Label>
              <Select value={filtroProjeto} onValueChange={handleProjetoChange}>
                <SelectTrigger id="filtro-projeto">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os projetos</SelectItem>
                  {projetos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.sigla} — {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="filtro-um">UM</Label>
              <Select
                value={filtroUm}
                onValueChange={handleUmChange}
                disabled={umsDisponiveis.length === 0}
              >
                <SelectTrigger id="filtro-um">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as UMs</SelectItem>
                  {umsDisponiveis.map((um) => (
                    <SelectItem key={um} value={um}>
                      {um}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="filtro-ra">Região Administrativa</Label>
              <Select
                value={filtroRa}
                onValueChange={setFiltroRa}
                disabled={rasDisponiveis.length === 0}
              >
                <SelectTrigger id="filtro-ra">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as RAs</SelectItem>
                  {rasDisponiveis.map((ra) => (
                    <SelectItem key={ra} value={ra}>
                      {ra}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Status (RadioGroup) */}
          <div className="space-y-2 border-t pt-4">
            <Label>Status</Label>
            <RadioGroup
              value={statusEfetivo}
              onValueChange={setFiltroStatus}
              className="flex flex-wrap gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="todos" id="status-todos" />
                <Label
                  htmlFor="status-todos"
                  className="cursor-pointer font-normal"
                >
                  Todos
                </Label>
              </div>
              {statusesDisponiveis.map(([status, count]) => {
                const id = `status-${paraIdHtml(status)}`
                return (
                  <div key={status} className="flex items-center gap-2">
                    <RadioGroupItem value={status} id={id} />
                    <Label
                      htmlFor={id}
                      className="cursor-pointer font-normal"
                    >
                      {status}
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({count})
                      </span>
                    </Label>
                  </div>
                )
              })}
            </RadioGroup>
          </div>
        </CardContent>
      </Card>

      {/* TABELA DE PONTOS */}
      <section className="space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          {pontosFiltrados.length}{" "}
          {pontosFiltrados.length === 1
            ? "ponto encontrado"
            : "pontos encontrados"}
        </h2>
        <TabelaPontos
          key={`${filtroProjeto}|${filtroUm}|${filtroRa}|${statusEfetivo}`}
          pontos={pontosFiltrados}
          projetosMap={projetosMap}
          onEditar={handleEditarPonto}
        />
      </section>
      {/* MODAL DE EDIÇÃO */}
      <EditarPontoDialog
        ponto={pontoEditando}
        projeto={
          pontoEditando ? projetosMap.get(pontoEditando.projetoId) : undefined
        }
        onClose={() => setPontoEditando(null)}
        onSalvo={onRecarregar}
      />
    </div>
  )
}

// ============================================================
// CARD DE RESUMO POR PROJETO
// ============================================================

function CardResumoProjeto({
  estatistica: est,
}: {
  estatistica: EstatisticaProjeto
}) {
  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="space-y-2">
          <span
            className="inline-flex items-center rounded-md px-2.5 py-0.5 font-mono text-xs font-semibold"
            style={{
              backgroundColor: est.cor,
              color: corTextoIdeal(est.cor),
            }}
          >
            {est.sigla}
          </span>
          <p className="font-heading text-lg leading-tight">{est.nome}</p>
        </div>

        <div className="space-y-1">
          <p className="font-heading text-3xl">{est.totalPontos}</p>
          <p className="text-xs text-muted-foreground">
            {est.totalPontos === 1 ? "ponto" : "pontos"} sincronizado
            {est.totalPontos === 1 ? "" : "s"}
          </p>
        </div>

        <div className="space-y-3 border-t pt-3 text-xs">
          <div className="flex items-baseline gap-2">
            <span className="font-mono uppercase tracking-widest text-muted-foreground">
              UMs
            </span>
            <span className="font-heading text-lg">{est.totalUms}</span>
          </div>

          {est.contagemPorStatus.length > 0 && (
            <div className="space-y-1">
              <p className="font-mono uppercase tracking-widest text-muted-foreground">
                Por status
              </p>
              <ul className="space-y-0.5">
                {est.contagemPorStatus.map(([status, count]) => (
                  <li
                    key={status}
                    className="flex items-baseline justify-between"
                  >
                    <span>{status}</span>
                    <span className="font-medium">{count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================
// ESTATÍSTICAS
// ============================================================

type EstatisticaProjeto = {
  projetoId: string
  sigla: string
  nome: string
  cor: string
  totalPontos: number
  totalUms: number
  /** Array [status, contagem] ordenado por contagem desc, depois alfabético. */
  contagemPorStatus: Array<[string, number]>
}

function calcularEstatisticasPorProjeto(
  projetos: Projeto[],
  pontos: Ponto[]
): EstatisticaProjeto[] {
  return projetos
    .map((projeto) => {
      const pontosDoProjeto = pontos.filter((p) => p.projetoId === projeto.id)

      const umsDistintas = new Set(
        pontosDoProjeto.map((p) => p.umNome).filter((nome) => nome.length > 0)
      )

      return {
        projetoId: projeto.id,
        sigla: projeto.sigla,
        nome: projeto.nome,
        cor: projeto.cor,
        totalPontos: pontosDoProjeto.length,
        totalUms: umsDistintas.size,
        contagemPorStatus: contarStatuses(pontosDoProjeto),
      }
    })
    .sort((a, b) => {
      if (b.totalPontos !== a.totalPontos) {
        return b.totalPontos - a.totalPontos
      }
      return a.nome.localeCompare(b.nome, "pt-BR")
    })
}

/**
 * Conta quantos pontos têm cada status. Retorna ordenado por contagem desc,
 * com empate desempatado alfabeticamente em PT-BR.
 */
function contarStatuses(pontos: Ponto[]): Array<[string, number]> {
  const mapa = new Map<string, number>()
  for (const p of pontos) {
    const chave = p.status || "Sem status"
    mapa.set(chave, (mapa.get(chave) ?? 0) + 1)
  }
  return Array.from(mapa.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1]
    return a[0].localeCompare(b[0], "pt-BR")
  })
}
// ============================================================
// FILTROS
// ============================================================

function obterUmsDisponiveis(pontos: Ponto[], filtroProjeto: string): string[] {
  const pontosFiltrados =
    filtroProjeto === "todos"
      ? pontos
      : pontos.filter((p) => p.projetoId === filtroProjeto)

  const ums = new Set(
    pontosFiltrados.map((p) => p.umNome).filter((nome) => nome.length > 0)
  )

  return Array.from(ums).sort((a, b) =>
    a.localeCompare(b, "pt-BR", { sensitivity: "base" })
  )
}

function obterRasDisponiveis(
  pontos: Ponto[],
  filtroProjeto: string,
  filtroUm: string
): string[] {
  let pontosFiltrados = pontos

  if (filtroProjeto !== "todos") {
    pontosFiltrados = pontosFiltrados.filter(
      (p) => p.projetoId === filtroProjeto
    )
  }

  if (filtroUm !== "todas") {
    pontosFiltrados = pontosFiltrados.filter((p) => p.umNome === filtroUm)
  }

  const ras = new Set(
    pontosFiltrados.map((p) => p.raNome).filter((nome) => nome.length > 0)
  )

  return Array.from(ras).sort((a, b) =>
    a.localeCompare(b, "pt-BR", { sensitivity: "base" })
  )
}

/**
 * Conta quantos pontos têm cada status, considerando os filtros de projeto/UM/RA.
 * Retorna array ordenado alfabeticamente: [["Atual", 3], ["Histórico", 14], ...]
 */
function obterStatusesDisponiveis(
  pontos: Ponto[],
  filtroProjeto: string,
  filtroUm: string,
  filtroRa: string
): Array<[string, number]> {
  let filtrados = pontos

  if (filtroProjeto !== "todos") {
    filtrados = filtrados.filter((p) => p.projetoId === filtroProjeto)
  }
  if (filtroUm !== "todas") {
    filtrados = filtrados.filter((p) => p.umNome === filtroUm)
  }
  if (filtroRa !== "todas") {
    filtrados = filtrados.filter((p) => p.raNome === filtroRa)
  }

  const contagem = new Map<string, number>()
  for (const p of filtrados) {
    const chave = p.status || "Sem status"
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1)
  }

  return Array.from(contagem.entries()).sort((a, b) =>
    a[0].localeCompare(b[0], "pt-BR", { sensitivity: "base" })
  )
}

/**
 * Converte um status livre num id HTML válido pro Label htmlFor.
 */
function paraIdHtml(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
}

type Filtros = {
  projeto: string
  um: string
  ra: string
  status: string // "todos" ou qualquer valor de status presente nos dados
}

function aplicarFiltros(pontos: Ponto[], filtros: Filtros): Ponto[] {
  return pontos.filter((p) => {
    if (filtros.projeto !== "todos" && p.projetoId !== filtros.projeto) {
      return false
    }
    if (filtros.um !== "todas" && p.umNome !== filtros.um) {
      return false
    }
    if (filtros.ra !== "todas" && p.raNome !== filtros.ra) {
      return false
    }
    if (
      filtros.status !== "todos" &&
      (p.status || "Sem status") !== filtros.status
    ) {
      return false
    }
    return true
  })
}