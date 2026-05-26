"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react"
import {
  listarRAs,
  deletarRA,
  corTextoIdeal,
  type RA,
} from "@/lib/firestore/ras"
import { RAFormDialog } from "@/components/ras/ra-form-dialog"
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

export default function LocalidadesPage() {
  const [ras, setRas] = useState<RA[]>([])
  const [carregando, setCarregando] = useState(true)

  // Estados do modal de criar/editar
  const [formAberto, setFormAberto] = useState(false)
  const [raEditando, setRaEditando] = useState<RA | null>(null)

  // Estados do dialog de deleção
  const [deleteAberto, setDeleteAberto] = useState(false)
  const [raDeletando, setRaDeletando] = useState<RA | null>(null)

  const recarregar = async () => {
    setCarregando(true)
    try {
      const lista = await listarRAs()
      setRas(lista)
    } catch (err) {
      console.error("Erro ao carregar RAs:", err)
      toast.error("Erro ao carregar a lista de RAs.")
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    recarregar()
  }, [])

  const handleNovaRA = () => {
    setRaEditando(null)
    setFormAberto(true)
  }

  const handleEditar = (ra: RA) => {
    setRaEditando(ra)
    setFormAberto(true)
  }

  const handleDeletar = (ra: RA) => {
    setRaDeletando(ra)
    setDeleteAberto(true)
  }

  return (
    <main className="container mx-auto px-4 py-8">
      {/* Cabeçalho */}
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Administração
          </p>
          <h1 className="mt-1 font-heading text-4xl text-foreground">
            Localidades
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Gestão de Regiões Administrativas (RAs). Os pontos de operação
            dentro de cada RA serão sincronizados via Google Sheets na Fase 3.
          </p>
        </div>

        <Button onClick={handleNovaRA} className="gap-2">
          <Plus className="h-4 w-4" />
          Cadastrar RA
        </Button>
      </div>

      {/* Estados visuais */}
      {carregando ? (
        <div className="flex min-h-[300px] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Carregando RAs
            </p>
          </div>
        </div>
      ) : ras.length === 0 ? (
        <EmptyState onCadastrar={handleNovaRA} />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Região Administrativa</TableHead>
                <TableHead className="w-[120px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ras.map((ra) => (
                <TableRow key={ra.id}>
                  <TableCell>
                    <span
                      className="inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium"
                      style={{
                        backgroundColor: ra.cor,
                        color: corTextoIdeal(ra.cor),
                      }}
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      {ra.nomeCidade}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditar(ra)}
                        aria-label={`Editar ${ra.nomeCidade}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeletar(ra)}
                        aria-label={`Deletar ${ra.nomeCidade}`}
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

      {/* Rodapé com contagem (útil pra 35+ RAs) */}
      {!carregando && ras.length > 0 && (
        <p className="mt-4 text-center font-mono text-xs uppercase tracking-widest text-muted-foreground">
          {ras.length} {ras.length === 1 ? "RA cadastrada" : "RAs cadastradas"}
        </p>
      )}

      {/* Modal de cadastro/edição */}
      <RAFormDialog
        open={formAberto}
        onOpenChange={setFormAberto}
        ra={raEditando}
        onSaved={recarregar}
      />

      {/* Dialog de confirmação de deleção */}
      {raDeletando && (
        <ConfirmDeleteDialog
          open={deleteAberto}
          onOpenChange={setDeleteAberto}
          titulo="Deletar RA"
          nomeItem={raDeletando.nomeCidade}
          descricao="Esta ação não pode ser desfeita. Pontos de operação vinculados a esta RA ficarão sem associação até a próxima sincronização."
          onConfirm={() => deletarRA(raDeletando.id)}
          onDeleted={recarregar}
          mensagemSucesso="RA deletada com sucesso!"
        />
      )}
    </main>
  )
}

/**
 * Estado vazio: exibido quando ainda não há RAs cadastradas.
 */
function EmptyState({ onCadastrar }: { onCadastrar: () => void }) {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 rounded-lg border border-dashed bg-card p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <MapPin className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h3 className="font-heading text-xl text-foreground">
          Nenhuma RA cadastrada
        </h3>
        <p className="max-w-sm text-sm text-muted-foreground">
          Cadastre as Regiões Administrativas onde o Grupo ITC opera. Em breve,
          os pontos de operação serão importados via planilha Google.
        </p>
      </div>
      <Button onClick={onCadastrar} className="gap-2">
        <Plus className="h-4 w-4" />
        Cadastrar RA
      </Button>
    </div>
  )
}