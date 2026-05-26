"use client"

import { useState } from "react"
import { toast } from "sonner"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type ConfirmDeleteDialogProps = {
  /** Controla se o modal está aberto */
  open: boolean
  /** Callback ao tentar fechar o modal */
  onOpenChange: (open: boolean) => void
  /** Título do diálogo. Ex: "Deletar projeto" */
  titulo: string
  /** Nome do item sendo deletado, exibido em destaque */
  nomeItem: string
  /** Descrição adicional opcional (ex: "Esta ação não pode ser desfeita") */
  descricao?: string
  /** Função async que executa a deleção */
  onConfirm: () => Promise<void>
  /** Callback após deleção bem-sucedida */
  onDeleted?: () => void
  /** Mensagem de sucesso exibida no toast */
  mensagemSucesso?: string
}

/**
 * Dialog genérico de confirmação de deleção.
 * Usado para deletar projetos, UMs, técnicos, RAs — qualquer entidade.
 *
 * O PRD exige confirmação explícita para toda ação destrutiva (seção 11.2).
 */
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  titulo,
  nomeItem,
  descricao,
  onConfirm,
  onDeleted,
  mensagemSucesso = "Item deletado com sucesso!",
}: ConfirmDeleteDialogProps) {
  const [deletando, setDeletando] = useState(false)

  const handleConfirm = async () => {
    setDeletando(true)
    try {
      await onConfirm()
      toast.success(mensagemSucesso)
      onDeleted?.()
      onOpenChange(false)
    } catch (err) {
      console.error("Erro ao deletar:", err)
      toast.error("Erro ao deletar. Tente novamente.")
    } finally {
      setDeletando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div className="flex-1 space-y-1">
              <DialogTitle className="font-heading text-xl">{titulo}</DialogTitle>
              <DialogDescription>
                {descricao ?? "Esta ação não pode ser desfeita."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="rounded-md border bg-muted px-4 py-3">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            Item a deletar
          </p>
          <p className="mt-1 font-semibold text-foreground">{nomeItem}</p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deletando}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={deletando}
          >
            {deletando ? "Deletando..." : "Confirmar deleção"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}