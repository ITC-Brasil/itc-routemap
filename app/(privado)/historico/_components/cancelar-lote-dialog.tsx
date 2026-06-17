"use client"

import { useState } from "react"
import { toast } from "sonner"
import { AlertTriangle } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cancelarLote, type LoteSumario } from "@/lib/firestore/lotes"

type Props = {
  lote: LoteSumario | null
  onClose: () => void
  onCancelado: () => Promise<void>
}

export function CancelarLoteDialog({ lote, onClose, onCancelado }: Props) {
  const [confirmando, setConfirmando] = useState(false)

  // Se não houver lote selecionado, modal fica fechado.
  const aberto = lote !== null

  // Como cada Rota = 1 ponto, qtdRotasConfirmadas = qtd estimada de pontos a liberar
  const rotasAtivas = lote?.qtdRotasConfirmadas ?? 0
  const pontosAfetados = rotasAtivas

  const handleConfirmar = async () => {
    if (!lote) return
    setConfirmando(true)
    try {
      const resultado = await cancelarLote(lote.loteId)
      toast.success("Lote cancelado", {
        description: `${resultado.rotasCanceladas} rota${resultado.rotasCanceladas === 1 ? "" : "s"} cancelada${resultado.rotasCanceladas === 1 ? "" : "s"} · ${resultado.pontosLiberados} ponto${resultado.pontosLiberados === 1 ? "" : "s"} liberado${resultado.pontosLiberados === 1 ? "" : "s"}`,
      })
      await onCancelado()
      onClose()
    } catch (err) {
      console.error("Erro ao cancelar lote:", err)
      toast.error("Erro ao cancelar lote", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      })
    } finally {
      setConfirmando(false)
    }
  }

  return (
    <AlertDialog open={aberto} onOpenChange={(o) => !o && !confirmando && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Cancelar lote de alocação
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 pt-2">
              <p>Esta ação vai:</p>
              <ul className="list-inside list-disc space-y-1 text-sm">
                <li>
                  Marcar{" "}
                  <strong className="text-foreground">
                    {rotasAtivas} rota{rotasAtivas === 1 ? "" : "s"} ativa{rotasAtivas === 1 ? "" : "s"}
                  </strong>{" "}
                  como{" "}
                  <span className="font-mono text-destructive">Cancelada</span>
                </li>
                <li>
                  Liberar até{" "}
                  <strong className="text-foreground">
                    {pontosAfetados} ponto{pontosAfetados === 1 ? "" : "s"}
                  </strong>
                  , voltando o status de{" "}
                  <span className="font-mono">Agendado</span> →{" "}
                  <span className="font-mono">Pendente</span>
                </li>
              </ul>
              <p className="text-sm text-muted-foreground">
                Pontos que já foram marcados como{" "}
                <span className="font-mono">Atual</span> ou{" "}
                <span className="font-mono">Histórico</span> não serão afetados.
                A operação é atômica — ou tudo, ou nada.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={confirmando}>Voltar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirmar}
            disabled={confirmando}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {confirmando ? "Cancelando..." : "Cancelar lote"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}