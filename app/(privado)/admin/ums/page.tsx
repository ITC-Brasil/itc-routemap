"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Pencil, Plus, Trash2, Truck } from "lucide-react"
import {
  listarUMsComProjeto,
  deletarUM,
  type UM,
  type UMComProjeto,
} from "@/lib/firestore/ums"
import {
  listarProjetos,
  type Projeto,
} from "@/lib/firestore/projetos"
import { corTextoIdeal } from "@/lib/firestore/ras"
import { UMFormDialog } from "@/components/ums/um-form-dialog"
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default function UMsPage() {
  const [ums, setUms] = useState<UMComProjeto[]>([])
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [carregando, setCarregando] = useState(true)

  // Estados do modal de criar/editar
  const [formAberto, setFormAberto] = useState(false)
  const [umEditando, setUmEditando] = useState<UM | null>(null)

  // Estados do dialog de deleção
  const [deleteAberto, setDeleteAberto] = useState(false)
  const [umDeletando, setUmDeletando] = useState<UMComProjeto | null>(null)

  const recarregar = async () => {
    setCarregando(true)
    try {
      // Busca UMs (já com dados do projeto) e lista de projetos em paralelo
      const [umsLista, projetosLista] = await Promise.all([
        listarUMsComProjeto(),
        listarProjetos(),
      ])
      setUms(umsLista)
      setProjetos(projetosLista)
    } catch (err) {
      console.error("Erro ao carregar UMs:", err)
      toast.error("Erro ao carregar a lista de UMs.")
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    recarregar()
  }, [])

  const handleNovaUM = () => {
    setUmEditando(null)
    setFormAberto(true)
  }

  const handleEditar = (um: UM) => {
    setUmEditando(um)
    setFormAberto(true)
  }

  const handleDeletar = (um: UMComProjeto) => {
    setUmDeletando(um)
    setDeleteAberto(true)
  }

  // Agrupa UMs por projetoId para renderização agrupada
  const umsAgrupadas = agruparUMsPorProjeto(ums)

  return (
    <main className="container mx-auto px-4 py-8">
      {/* Cabeçalho */}
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Administração
          </p>
          <h1 className="mt-1 font-heading text-4xl text-foreground">
            Unidades Móveis
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Gestão das UMs vinculadas aos projetos do Grupo ITC Brasil. Cada
            UM é uma unidade operacional itinerante.
          </p>
        </div>

        <Button onClick={handleNovaUM} className="gap-2">
          <Plus className="h-4 w-4" />
          Cadastrar UM
        </Button>
      </div>

      {/* Estados visuais */}
      {carregando ? (
        <div className="flex min-h-[300px] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Carregando UMs
            </p>
          </div>
        </div>
      ) : ums.length === 0 ? (
        <EmptyState
          onCadastrar={handleNovaUM}
          temProjetos={projetos.length > 0}
        />
      ) : (
        <div className="space-y-6">
          {umsAgrupadas.map((grupo) => (
            <GrupoProjeto
              key={grupo.projetoId}
              grupo={grupo}
              onEditar={handleEditar}
              onDeletar={handleDeletar}
            />
          ))}
        </div>
      )}

      {/* Rodapé com contagem total */}
      {!carregando && ums.length > 0 && (
        <p className="mt-6 text-center font-mono text-xs uppercase tracking-widest text-muted-foreground">
          {ums.length} {ums.length === 1 ? "UM cadastrada" : "UMs cadastradas"} em{" "}
          {umsAgrupadas.length}{" "}
          {umsAgrupadas.length === 1 ? "projeto" : "projetos"}
        </p>
      )}

      {/* Modal de cadastro/edição */}
      <UMFormDialog
        open={formAberto}
        onOpenChange={setFormAberto}
        um={umEditando}
        projetos={projetos}
        onSaved={recarregar}
      />

      {/* Dialog de confirmação de deleção */}
      {umDeletando && (
        <ConfirmDeleteDialog
          open={deleteAberto}
          onOpenChange={setDeleteAberto}
          titulo="Deletar UM"
          nomeItem={`${umDeletando.nome} (${umDeletando.projeto?.sigla ?? "sem projeto"})`}
          descricao="Esta ação não pode ser desfeita. Histórico de alocações vinculados a esta UM permanecerão registrados."
          onConfirm={() => deletarUM(umDeletando.id)}
          onDeleted={recarregar}
          mensagemSucesso="UM deletada com sucesso!"
        />
      )}
    </main>
  )
}

// ============================================================
// COMPONENTES AUXILIARES
// ============================================================

type GrupoUMs = {
  projetoId: string
  projeto: Projeto | null
  ums: UMComProjeto[]
}

/**
 * Agrupa UMs por projeto, retornando uma estrutura ordenada.
 * UMs sem projeto vinculado vão para um grupo "sem projeto" no final.
 */
function agruparUMsPorProjeto(ums: UMComProjeto[]): GrupoUMs[] {
  const mapa = new Map<string, GrupoUMs>()

  for (const um of ums) {
    const id = um.projetoId || "__sem_projeto__"
    if (!mapa.has(id)) {
      mapa.set(id, {
        projetoId: id,
        projeto: um.projeto,
        ums: [],
      })
    }
    mapa.get(id)!.ums.push(um)
  }

  // Ordena: projetos primeiro (alfabético), grupo "sem projeto" no fim
  return Array.from(mapa.values()).sort((a, b) => {
    if (a.projetoId === "__sem_projeto__") return 1
    if (b.projetoId === "__sem_projeto__") return -1
    return (a.projeto?.nome ?? "").localeCompare(
      b.projeto?.nome ?? "",
      "pt-BR",
      { sensitivity: "base" }
    )
  })
}

/**
 * Componente de grupo: cabeçalho colorido do projeto + tabela das UMs daquele projeto.
 */
function GrupoProjeto({
  grupo,
  onEditar,
  onDeletar,
}: {
  grupo: GrupoUMs
  onEditar: (um: UM) => void
  onDeletar: (um: UMComProjeto) => void
}) {
  const semProjeto = grupo.projeto === null

  return (
    <div className="rounded-lg border bg-card">
      {/* Cabeçalho do grupo */}
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-3">
          {semProjeto ? (
            <span className="inline-flex items-center rounded-md bg-muted px-3 py-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Sem projeto
            </span>
          ) : (
            <span
              className="inline-flex items-center rounded-md px-3 py-1 font-mono text-xs font-semibold"
              style={{
                backgroundColor: grupo.projeto!.cor,
                color: corTextoIdeal(grupo.projeto!.cor),
              }}
            >
              {grupo.projeto!.sigla}
            </span>
          )}
          <h3 className="font-medium text-foreground">
            {grupo.projeto?.nome ?? "UMs sem projeto vinculado"}
          </h3>
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          {grupo.ums.length} {grupo.ums.length === 1 ? "UM" : "UMs"}
        </p>
      </div>

      {/* Tabela do grupo */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>UM</TableHead>
            <TableHead className="w-[120px] text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {grupo.ums.map((um) => (
            <TableRow key={um.id}>
              <TableCell>
                <span
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium"
                  style={{
                    backgroundColor: um.cor,
                    color: corTextoIdeal(um.cor),
                  }}
                >
                  <Truck className="h-3.5 w-3.5" />
                  {um.nome}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEditar(um)}
                    aria-label={`Editar ${um.nome}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDeletar(um)}
                    aria-label={`Deletar ${um.nome}`}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/**
 * Estado vazio: sem UMs cadastradas.
 * Difere se há projetos disponíveis ou não.
 */
function EmptyState({
  onCadastrar,
  temProjetos,
}: {
  onCadastrar: () => void
  temProjetos: boolean
}) {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 rounded-lg border border-dashed bg-card p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <Truck className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h3 className="font-heading text-xl text-foreground">
          Nenhuma UM cadastrada
        </h3>
        <p className="max-w-sm text-sm text-muted-foreground">
          {temProjetos
            ? "Cadastre a primeira Unidade Móvel vinculando-a a um projeto existente."
            : "Antes de cadastrar UMs, você precisa criar ao menos um Projeto na seção Administração → Projetos."}
        </p>
      </div>
      {temProjetos && (
        <Button onClick={onCadastrar} className="gap-2">
          <Plus className="h-4 w-4" />
          Cadastrar UM
        </Button>
      )}
    </div>
  )
}