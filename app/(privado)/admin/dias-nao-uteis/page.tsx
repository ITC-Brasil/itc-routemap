"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, CalendarOff, Plus, Trash2 } from "lucide-react"

import {
  criarDiaNaoUtil,
  deletarDiaNaoUtil,
  listarDiasNaoUteis,
} from "@/lib/actions/dias-nao-uteis"
import type { DiaNaoUtil } from "@/lib/db/dias-nao-uteis"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

/**
 * Feriados e pontos facultativos.
 *
 * Alimenta a âncora de chegada do transporte público: a rota é calculada para
 * chegar às 08:00 do próximo DIA ÚTIL, e o que é útil depende desta tabela.
 *
 * O calendário do DF sai por decreto anual do governador e muda de ano para
 * ano, inclusive na classificação de algumas datas — por isso é cadastro, não
 * constante no código. É uma tela que alguém usa uma vez por ano.
 */
export default function DiasNaoUteisPage() {
  const [dias, setDias] = useState<DiaNaoUtil[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)

  const [novaData, setNovaData] = useState("")
  const [novaDescricao, setNovaDescricao] = useState("")

  const [anoSelecionado, setAnoSelecionado] = useState<number>(
    new Date().getFullYear()
  )

  const [deleteAberto, setDeleteAberto] = useState(false)
  const [diaDeletando, setDiaDeletando] = useState<DiaNaoUtil | null>(null)

  const recarregar = async () => {
    setCarregando(true)
    try {
      setDias(await listarDiasNaoUteis())
    } catch (err) {
      console.error("Erro ao carregar dias não úteis:", err)
      toast.error("Erro ao carregar a lista de dias não úteis.")
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    // Carga inicial via server action: o setState ocorre dentro do async.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    recarregar()
  }, [])

  // Filtro por ano é feito em memória: são poucas dezenas de linhas por ano, e
  // uma ida ao banco a cada troca de ano não pagaria a latência.
  const anosDisponiveis = useMemo(() => {
    const anos = new Set(dias.map((d) => Number(d.data.slice(0, 4))))
    anos.add(new Date().getFullYear())
    return Array.from(anos).sort((a, b) => b - a)
  }, [dias])

  // Ano sem nenhuma data cadastrada é a falha mais silenciosa desta tela: o
  // cálculo trata toda segunda a sexta como útil e ancora a chegada num
  // feriado, sem erro nenhum. Cobre o ano corrente e o seguinte porque a
  // âncora aponta para o futuro — em dezembro ela já cai no ano que vem.
  const anosSemCadastro = useMemo(() => {
    const atual = new Date().getFullYear()
    return [atual, atual + 1].filter(
      (ano) => !dias.some((d) => d.data.startsWith(String(ano)))
    )
  }, [dias])

  const diasDoAno = useMemo(
    () => dias.filter((d) => d.data.startsWith(String(anoSelecionado))),
    [dias, anoSelecionado]
  )

  const handleAdicionar = async () => {
    const data = novaData.trim()
    const descricao = novaDescricao.trim()

    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      toast.error("Informe uma data válida.")
      return
    }
    if (!descricao) {
      toast.error("Descreva o feriado ou ponto facultativo.")
      return
    }
    if (dias.some((d) => d.data === data)) {
      toast.error("Essa data já está cadastrada.")
      return
    }

    setSalvando(true)
    try {
      await criarDiaNaoUtil({ data, descricao })
      toast.success("Dia não útil adicionado.")
      setNovaData("")
      setNovaDescricao("")
      await recarregar()
    } catch (err) {
      console.error("Erro ao criar dia não útil:", err)
      toast.error("Erro ao adicionar", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      })
    } finally {
      setSalvando(false)
    }
  }

  const handleConfirmarDelecao = async () => {
    if (!diaDeletando) return
    try {
      await deletarDiaNaoUtil(diaDeletando.id)
      toast.success("Dia não útil removido.")
      await recarregar()
    } catch (err) {
      console.error("Erro ao deletar dia não útil:", err)
      toast.error("Erro ao remover", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      })
    } finally {
      setDeleteAberto(false)
      setDiaDeletando(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-4xl">Dias não úteis</h1>
        <p className="mt-2 max-w-[720px] text-pretty text-sm text-muted-foreground">
          Cadastre aqui os dias em que nenhum técnico é escalado. O cálculo de
          transporte público agenda a chegada do técnico para as 08:00 do
          próximo dia útil — as datas aqui são puladas. Feriados e pontos
          facultativos entram igual: a operação não escala técnico em nenhum
          dos dois. Facultativos que só começam às 14h — véspera de Natal e de
          Ano Novo — não entram, porque às 08:00 o expediente é normal. A fonte
          é o decreto anual do GDF, publicado no DODF em dezembro.
        </p>
      </div>

      {/* ALERTA DE ANO SEM CADASTRO */}
      {!carregando && anosSemCadastro.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-warn bg-warn-tint p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warn" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-warn">
              {anosSemCadastro.length === 1
                ? `Nenhum dia cadastrado para ${anosSemCadastro[0]}`
                : `Nenhum dia cadastrado para ${anosSemCadastro.join(" nem ")}`}
            </p>
            <p className="max-w-[640px] text-pretty text-[13px] leading-relaxed text-warn/80">
              Sem essas datas o cálculo trata qualquer segunda a sexta como dia
              útil e pode ancorar a chegada num feriado, sem apresentar erro.
              Cadastre a partir do decreto do GDF publicado no DODF em
              dezembro.
            </p>
          </div>
        </div>
      )}

      {/* FORMULÁRIO */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="nova-data">Data</Label>
            <Input
              id="nova-data"
              type="date"
              value={novaData}
              onChange={(e) => setNovaData(e.target.value)}
              className="w-[180px]"
            />
          </div>
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="nova-descricao">Descrição</Label>
            <Input
              id="nova-descricao"
              placeholder="Ex.: Dia do Evangélico (distrital)"
              value={novaDescricao}
              onChange={(e) => setNovaDescricao(e.target.value)}
            />
          </div>
          <Button
            onClick={() => void handleAdicionar()}
            disabled={salvando}
            className="gap-2"
          >
            <Plus className="size-4" />
            {salvando ? "Adicionando..." : "Adicionar"}
          </Button>
        </CardContent>
      </Card>

      {/* FILTRO POR ANO */}
      <div className="flex flex-wrap items-center gap-2">
        {anosDisponiveis.map((ano) => (
          <Button
            key={ano}
            variant={ano === anoSelecionado ? "default" : "outline"}
            size="sm"
            onClick={() => setAnoSelecionado(ano)}
            className="tabular-nums"
          >
            {ano}
          </Button>
        ))}
      </div>

      {/* TABELA */}
      {carregando ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : diasDoAno.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="rounded-full bg-muted p-4">
              <CalendarOff className="size-8 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <h2 className="font-heading text-2xl">
                Nenhum dia cadastrado em {anoSelecionado}
              </h2>
              <p className="max-w-md text-sm text-muted-foreground">
                Sem feriados cadastrados, o cálculo trata qualquer segunda a
                sexta como dia útil — e pode agendar chegada para um feriado.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px]">Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {diasDoAno.map((dia) => (
                <TableRow key={dia.id}>
                  <TableCell rotulo="Data" className="font-mono tabular-nums">
                    {formatarDataBR(dia.data)}
                  </TableCell>
                  <TableCell rotulo="Descrição">{dia.descricao}</TableCell>
                  <TableCell prioridade="acao">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setDiaDeletando(dia)
                        setDeleteAberto(true)
                      }}
                      aria-label={`Remover ${dia.descricao}`}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ConfirmDeleteDialog
        open={deleteAberto}
        onOpenChange={setDeleteAberto}
        onConfirm={handleConfirmarDelecao}
        titulo="Remover dia não útil"
        nomeItem={
          diaDeletando
            ? `${formatarDataBR(diaDeletando.data)} — ${diaDeletando.descricao}`
            : ""
        }
        descricao="O cálculo voltará a tratar essa data como dia útil e poderá agendar chegada nela."
        mensagemSucesso="Dia não útil removido."
      />
    </div>
  )
}

/**
 * "2026-11-30" → "30/11/2026", sem passar por `Date`.
 *
 * `new Date("2026-11-30")` é interpretado como UTC e, exibido em São Paulo,
 * volta um dia. Como a data já chega como string de calendário, o corte
 * direto é correto e imune a fuso.
 */
function formatarDataBR(ymd: string): string {
  const [ano, mes, dia] = ymd.split("-")
  return `${dia}/${mes}/${ano}`
}
