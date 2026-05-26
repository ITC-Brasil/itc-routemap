"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { MapPin } from "lucide-react"
import {
  criarRA,
  atualizarRA,
  corTextoIdeal,
  type RA,
} from "@/lib/firestore/ras"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ColorPicker } from "@/components/color-picker"

const COR_INICIAL = "#008F95"

type RAFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  ra?: RA | null
  onSaved?: () => void
}

export function RAFormDialog({
  open,
  onOpenChange,
  ra,
  onSaved,
}: RAFormDialogProps) {
  const modoEdicao = !!ra

  const [nomeCidade, setNomeCidade] = useState("")
  const [cor, setCor] = useState(COR_INICIAL)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (open) {
      setNomeCidade(ra?.nomeCidade ?? "")
      setCor(ra?.cor ?? COR_INICIAL)
    }
  }, [open, ra])

  const handleSalvar = async () => {
    if (!nomeCidade.trim()) {
      toast.error("Informe o nome da cidade.")
      return
    }
    if (nomeCidade.trim().length < 2) {
      toast.error("Nome muito curto. Informe ao menos 2 caracteres.")
      return
    }

    setSalvando(true)

    try {
      if (modoEdicao && ra) {
        await atualizarRA(ra.id, { nomeCidade, cor })
        toast.success("RA atualizada com sucesso!")
      } else {
        await criarRA({ nomeCidade, cor })
        toast.success("RA cadastrada com sucesso!")
      }

      onSaved?.()
      onOpenChange(false)
    } catch (err) {
      console.error("Erro ao salvar RA:", err)
      toast.error("Erro ao salvar a RA. Tente novamente.")
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl">
            {modoEdicao ? "Editar RA" : "Cadastrar RA"}
          </DialogTitle>
          <DialogDescription>
            {modoEdicao
              ? "Atualize as informações da Região Administrativa."
              : "Cadastre uma nova Região Administrativa."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Nome da cidade */}
          <div className="space-y-2">
            <Label htmlFor="nomeCidade">Nome da cidade / RA</Label>
            <Input
              id="nomeCidade"
              value={nomeCidade}
              onChange={(e) => setNomeCidade(e.target.value)}
              placeholder="Ex: Brasília, Ceilândia, Taguatinga"
              maxLength={60}
              disabled={salvando}
            />
            <p className="text-xs text-muted-foreground">
              Nome usado para identificar a Região Administrativa.
            </p>
          </div>

          {/* Color Picker */}
          <ColorPicker
            value={cor}
            onChange={setCor}
            label="Cor de identificação"
            disabled={salvando}
          />

          {/* Preview */}
          <div className="space-y-2">
            <Label>Pré-visualização</Label>
            <div className="rounded-md border bg-muted px-4 py-3">
              <div
                className="inline-flex items-center gap-2 rounded-md px-3 py-1 text-sm font-semibold"
                style={{
                  backgroundColor: cor,
                  color: corTextoIdeal(cor),
                }}
              >
                <MapPin className="h-3.5 w-3.5" />
                <span>{nomeCidade || "Nome da Cidade"}</span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={salvando}
          >
            Cancelar
          </Button>
          <Button onClick={handleSalvar} disabled={salvando}>
            {salvando ? "Salvando..." : modoEdicao ? "Salvar alterações" : "Cadastrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}