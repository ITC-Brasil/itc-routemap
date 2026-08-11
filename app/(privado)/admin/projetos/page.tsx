"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { listarProjetos, deletarProjeto } from "@/lib/actions/projetos"
import type { Projeto } from "@/lib/db/projetos"
import { ProjetoFormDialog } from "@/components/projetos/projeto-form-dialog"
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

export default function ProjetosPage() {
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [carregando, setCarregando] = useState(true)

  // Estados do modal de criar/editar
  const [formAberto, setFormAberto] = useState(false)
  const [projetoEditando, setProjetoEditando] = useState<Projeto | null>(null)

  // Estados do dialog de confirmação de deleção
  const [deleteAberto, setDeleteAberto] = useState(false)
  const [projetoDeletando, setProjetoDeletando] = useState<Projeto | null>(null)

  // Função reutilizável para buscar projetos do Firestore
  const recarregar = async () => {
    setCarregando(true)
    try {
      const lista = await listarProjetos()
      setProjetos(lista)
    } catch (err) {
      console.error("Erro ao carregar projetos:", err)
      toast.error("Erro ao carregar a lista de projetos.")
    } finally {
      setCarregando(false)
    }
  }

  // Carrega projetos ao montar a página
  useEffect(() => {
    // Carga inicial via server action: o setState ocorre dentro do async.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    recarregar()
  }, [])

  // Abre o modal em modo "criar"
  const handleNovoProjeto = () => {
    setProjetoEditando(null)
    setFormAberto(true)
  }

  // Abre o modal em modo "editar"
  const handleEditar = (projeto: Projeto) => {
    setProjetoEditando(projeto)
    setFormAberto(true)
  }

  // Abre o dialog de confirmação de deleção
  const handleDeletar = (projeto: Projeto) => {
    setProjetoDeletando(projeto)
    setDeleteAberto(true)
  }

  // Tabela curta: 960px em vez da largura cheia (system.md §3). Era um
  // <main> aqui dentro, aninhado no <main> do layout — dois landmarks.
  return (
    <div className="max-w-[960px]">
      {/* Cabeçalho da página */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6 border-b pb-[22px]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">
Administração
          </p>
          <h1 className="mt-2 font-heading text-[38px] font-bold leading-[1.1] tracking-[-0.02em] text-foreground">
            Projetos
          </h1>
          <p className="mt-2.5 max-w-[620px] text-pretty text-muted-foreground">
            Gestão de projetos do Grupo ITC Brasil. Cada projeto possui nome,
            sigla e cor para identificação visual.
          </p>
        </div>

        <Button onClick={handleNovoProjeto} className="gap-2">
          <Plus className="h-4 w-4" />
          Cadastrar Projeto
        </Button>
      </div>

      {/* Estados de carregamento, vazio ou tabela */}
      {carregando ? (
        <div className="flex min-h-[300px] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Carregando projetos
            </p>
          </div>
        </div>
      ) : projetos.length === 0 ? (
        <EmptyState onCadastrar={handleNovoProjeto} />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">Sigla</TableHead>
                <TableHead>Nome do Projeto</TableHead>
                <TableHead className="w-[120px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projetos.map((projeto) => (
                <TableRow key={projeto.id} className="transition-colors hover:bg-muted/50">
                  <TableCell>
                    <span
                      className="badge-cor-dado inline-flex items-center rounded-full border px-3 py-1 font-mono text-xs font-semibold"
                      style={{ "--cor-dado": projeto.cor } as React.CSSProperties}
                    >
                      {projeto.sigla}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">{projeto.nome}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditar(projeto)}
                        aria-label={`Editar ${projeto.nome}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeletar(projeto)}
                        aria-label={`Deletar ${projeto.nome}`}
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
      )}

      {/* Modal de cadastro/edição */}
      <ProjetoFormDialog
        open={formAberto}
        onOpenChange={setFormAberto}
        projeto={projetoEditando}
        onSaved={recarregar}
      />

      {/* Dialog de confirmação de deleção */}
      {projetoDeletando && (
        <ConfirmDeleteDialog
          open={deleteAberto}
          onOpenChange={setDeleteAberto}
          titulo="Deletar projeto"
          nomeItem={`${projetoDeletando.nome} (${projetoDeletando.sigla})`}
          descricao="Esta ação não pode ser desfeita. UMs vinculadas a este projeto ficarão sem associação."
          onConfirm={() => deletarProjeto(projetoDeletando.id)}
          onDeleted={recarregar}
          mensagemSucesso="Projeto deletado com sucesso!"
        />
      )}
    </div>
  )
}

/**
 * Estado vazio: exibido quando ainda não há projetos cadastrados.
 */
function EmptyState({ onCadastrar }: { onCadastrar: () => void }) {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 rounded-lg border border-dashed bg-card p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <Plus className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h3 className="font-heading text-xl text-foreground">
          Nenhum projeto cadastrado
        </h3>
        <p className="max-w-sm text-sm text-muted-foreground">
          Comece cadastrando o primeiro projeto do Grupo ITC Brasil. Você
          poderá vincular Unidades Móveis a ele depois.
        </p>
      </div>
      <Button onClick={onCadastrar} className="gap-2">
        <Plus className="h-4 w-4" />
        Cadastrar Projeto
      </Button>
    </div>
  )
}