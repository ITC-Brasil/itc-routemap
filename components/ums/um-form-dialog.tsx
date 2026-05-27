"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Truck, AlertCircle } from "lucide-react"
import {
  criarUM,
  atualizarUM,
  type UM,
} from "@/lib/firestore/ums"
import { type Projeto } from "@/lib/firestore/projetos"
import { corTextoIdeal } from "@/lib/firestore/ras"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ColorPicker } from "@/components/color-picker"

const COR_INICIAL = "#008F95"

type UMFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  um?: UM | null
  /** Lista de projetos disponíveis para vincular */
  projetos: Projeto[]
  onSaved?: () => void
}

export function UMFormDialog({
  open,
  onOpenChange,
  um,
  projetos,
  onSaved,
}: UMFormDialogProps) {
  const modoEdicao = !!um

  const [nome, setNome] = useState("")
  const [cor, setCor] = useState(COR_INICIAL)
  const [projetoId, setProjetoId] = useState("")
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (open) {
      setNome(um?.nome ?? "")
      setCor(um?.cor ?? COR_INICIAL)
      setProjetoId(um?.projetoId ?? "")
    }
  }, [open, um])

  const handleSalvar = async () => {
    // Validações
    if (!nome.trim()) {
      toast.error("Informe o nome da UM.")
      return
    }
    if (nome.trim().length < 2) {
      toast.error("Nome muito curto. Informe ao menos 2 caracteres.")
      return
    }
    if (!projetoId) {
      toast.error("Selecione um projeto.")
      return
    }

    setSalvando(true)

    try {
      if (modoEdicao && um) {
        await atualizarUM(um.id, { nome, cor, projetoId })
        toast.success("UM atualizada com sucesso!")
      } else {
        await criarUM({ nome, cor, projetoId })
        toast.success("UM cadastrada com sucesso!")
      }

      onSaved?.()
      onOpenChange(false)
    } catch (err) {
      console.error("Erro ao salvar UM:", err)
      toast.error("Erro ao salvar a UM. Tente novamente.")
    } finally {
      setSalvando(false)
    }
  }

  // Caso especial: não há projetos cadastrados
  const semProjetos = projetos.length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl">
            {modoEdicao ? "Editar UM" : "Cadastrar UM"}
          </DialogTitle>
          <DialogDescription>
            {modoEdicao
              ? "Atualize as informações da Unidade Móvel."
              : "Cadastre uma nova Unidade Móvel vinculada a um projeto."}
          </DialogDescription>
        </DialogHeader>

        {semProjetos ? (
          // Estado: não há projetos cadastrados
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Você precisa cadastrar ao menos um <strong>Projeto</strong> antes
              de criar uma UM. Acesse Administração → Projetos.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4 py-2">
            {/* Nome da UM */}
            <div className="space-y-2">
              <Label htmlFor="nome">Nome da UM</Label>
              <Input
                id="nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Ônibus 1, Carreta Alpha"
                maxLength={40}
                disabled={salvando}
              />
              <p className="text-xs text-muted-foreground">
                Nome único pra identificar a unidade.
              </p>
            </div>

            {/* Select de projeto */}
            <div className="space-y-2">
              <Label htmlFor="projeto">Projeto vinculado</Label>
              <Select
                value={projetoId}
                onValueChange={setProjetoId}
                disabled={salvando}
              >
                <SelectTrigger id="projeto">
                  <SelectValue placeholder="Selecione um projeto" />
                </SelectTrigger>
                <SelectContent>
                  {projetos.map((projeto) => (
                    <SelectItem key={projeto.id} value={projeto.id}>
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-flex h-5 items-center rounded px-2 font-mono text-xs font-semibold"
                          style={{
                            backgroundColor: projeto.cor,
                            color: corTextoIdeal(projeto.cor),
                          }}
                        >
                          {projeto.sigla}
                        </span>
                        <span>{projeto.nome}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium"
                  style={{
                    backgroundColor: cor,
                    color: corTextoIdeal(cor),
                  }}
                >
                  <Truck className="h-3.5 w-3.5" />
                  <span>{nome || "Nome da UM"}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={salvando}
          >
            Cancelar
          </Button>
          {!semProjetos && (
            <Button onClick={handleSalvar} disabled={salvando}>
              {salvando
                ? "Salvando..."
                : modoEdicao
                  ? "Salvar alterações"
                  : "Cadastrar"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}