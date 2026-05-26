"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  criarProjeto,
  atualizarProjeto,
  type Projeto,
} from "@/lib/firestore/projetos"
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

/**
 * Paleta de cores pré-definidas para os projetos.
 * Combina cores institucionais ITC + algumas variações úteis
 * para diferenciar visualmente múltiplos projetos.
 */
const CORES_DISPONIVEIS = [
  { hex: "#008F95", nome: "Ciano ITC" },
  { hex: "#491027", nome: "Bordô ITC" },
  { hex: "#1565C0", nome: "Azul" },
  { hex: "#1A7F3C", nome: "Verde" },
  { hex: "#CC7A00", nome: "Laranja" },
  { hex: "#7B1FA2", nome: "Roxo" },
  { hex: "#C0392B", nome: "Vermelho" },
  { hex: "#3A4040", nome: "Cinza Escuro" },
]

type ProjetoFormDialogProps = {
  /** Controla se o modal está aberto */
  open: boolean
  /** Callback ao tentar fechar o modal */
  onOpenChange: (open: boolean) => void
  /** Projeto sendo editado. Se null/undefined, modo "criar". */
  projeto?: Projeto | null
  /** Callback após salvar com sucesso (criar ou editar) */
  onSaved?: () => void
}

export function ProjetoFormDialog({
  open,
  onOpenChange,
  projeto,
  onSaved,
}: ProjetoFormDialogProps) {
  const modoEdicao = !!projeto

  // Estados do formulário
  const [nome, setNome] = useState("")
  const [sigla, setSigla] = useState("")
  const [cor, setCor] = useState(CORES_DISPONIVEIS[0].hex)
  const [salvando, setSalvando] = useState(false)

  // Quando o modal abre (ou muda o projeto editado), reseta o formulário
  useEffect(() => {
    if (open) {
      setNome(projeto?.nome ?? "")
      setSigla(projeto?.sigla ?? "")
      setCor(projeto?.cor ?? CORES_DISPONIVEIS[0].hex)
    }
  }, [open, projeto])

  const handleSalvar = async () => {
    // Validações simples
    if (!nome.trim()) {
      toast.error("Informe o nome do projeto.")
      return
    }
    if (!sigla.trim()) {
      toast.error("Informe a sigla do projeto.")
      return
    }
    if (sigla.trim().length > 6) {
      toast.error("Sigla deve ter no máximo 6 caracteres.")
      return
    }

    setSalvando(true)

    try {
      if (modoEdicao && projeto) {
        await atualizarProjeto(projeto.id, { nome, sigla, cor })
        toast.success("Projeto atualizado com sucesso!")
      } else {
        await criarProjeto({ nome, sigla, cor })
        toast.success("Projeto criado com sucesso!")
      }

      onSaved?.()
      onOpenChange(false)
    } catch (err) {
      console.error("Erro ao salvar projeto:", err)
      toast.error("Erro ao salvar o projeto. Tente novamente.")
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl">
            {modoEdicao ? "Editar Projeto" : "Cadastrar Projeto"}
          </DialogTitle>
          <DialogDescription>
            {modoEdicao
              ? "Atualize as informações do projeto abaixo."
              : "Preencha os dados para cadastrar um novo projeto."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Nome */}
          <div className="space-y-2">
            <Label htmlFor="nome">Nome do projeto</Label>
            <Input
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Tecnologia Itinerante Cidadã"
              maxLength={80}
              disabled={salvando}
            />
          </div>

          {/* Sigla */}
          <div className="space-y-2">
            <Label htmlFor="sigla">Sigla</Label>
            <Input
              id="sigla"
              value={sigla}
              onChange={(e) => setSigla(e.target.value.toUpperCase())}
              placeholder="Ex: TIC"
              maxLength={6}
              disabled={salvando}
              className="font-mono uppercase"
            />
            <p className="text-xs text-muted-foreground">
              Até 6 caracteres. Será exibida em badge colorida.
            </p>
          </div>

          {/* Seletor de cor */}
          <div className="space-y-2">
            <Label>Cor de identificação</Label>
            <div className="flex flex-wrap gap-2">
              {CORES_DISPONIVEIS.map((opcao) => (
                <button
                  key={opcao.hex}
                  type="button"
                  onClick={() => setCor(opcao.hex)}
                  disabled={salvando}
                  className={`h-9 w-9 rounded-md transition-all ${
                    cor === opcao.hex
                      ? "ring-2 ring-foreground ring-offset-2 ring-offset-background scale-110"
                      : "hover:scale-105"
                  }`}
                  style={{ backgroundColor: opcao.hex }}
                  aria-label={opcao.nome}
                  title={opcao.nome}
                />
              ))}
            </div>
            <p className="font-mono text-xs text-muted-foreground">
              Selecionado: {cor.toUpperCase()}
            </p>
          </div>

          {/* Preview do badge */}
          <div className="space-y-2">
            <Label>Pré-visualização</Label>
            <div className="rounded-md border bg-muted px-4 py-3">
              <div
                className="inline-flex items-center gap-2 rounded-md px-3 py-1 text-sm font-semibold text-white"
                style={{ backgroundColor: cor }}
              >
                <span className="font-mono">{sigla || "SIGLA"}</span>
              </div>
              <p className="mt-2 text-sm text-foreground">
                {nome || "Nome do projeto"}
              </p>
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