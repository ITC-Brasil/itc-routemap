"use client"

import { useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, Database } from "lucide-react"
import {
  criarProjeto,
  atualizarProjeto,
  contarPontosDoProjeto,
} from "@/lib/actions/projetos"
import type { Projeto } from "@/lib/db/projetos"
import { corTextoIdeal } from "@/lib/cores"
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

type ProjetoFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  projeto?: Projeto | null
  onSaved?: () => void
}

/**
 * Componente público — usado pela página.
 * Funciona como um "wrapper" do conteúdo do modal, gerenciando montagem.
 *
 * O conteúdo só renderiza quando o Dialog está aberto. Usamos `key`
 * baseada no ID do projeto para forçar remontagem ao trocar de projeto.
 * Isso elimina a necessidade de useEffect para resetar campos do formulário.
 */
export function ProjetoFormDialog({
  open,
  onOpenChange,
  projeto,
  onSaved,
}: ProjetoFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {open && (
          <FormularioConteudo
            key={projeto?.id ?? "novo"}
            projeto={projeto}
            onSaved={onSaved}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// COMPONENTE INTERNO — FORMULÁRIO
// ============================================================

/**
 * Conteúdo do formulário em si.
 * Vive só enquanto o Dialog está aberto e é remontado ao trocar de projeto
 * (via prop `key` no componente pai). Por isso os estados nascem com os
 * valores corretos do projeto — sem useEffect.
 */
function FormularioConteudo({
  projeto,
  onSaved,
  onClose,
}: {
  projeto?: Projeto | null
  onSaved?: () => void
  onClose: () => void
}) {
  const modoEdicao = !!projeto

  // Estados inicializados diretamente dos props — padrão "lazy initial state".
  // O componente é remontado quando muda o projeto (via key no pai), então
  // não precisamos de useEffect para resetar.
  const [nome, setNome] = useState(projeto?.nome ?? "")
  const [sigla, setSigla] = useState(projeto?.sigla ?? "")
  const [cor, setCor] = useState(projeto?.cor ?? COR_INICIAL)
  const [salvando, setSalvando] = useState(false)
  // Troca de sigla num projeto com pontos: quantos pontos, enquanto aguarda a
  // confirmação. Null = nada a confirmar.
  const [pontosAfetados, setPontosAfetados] = useState<number | null>(null)

  const siglaNormalizada = sigla.trim().toUpperCase()
  const siglaMudou = modoEdicao && siglaNormalizada !== projeto?.sigla

  const handleSalvar = async () => {
    if (!nome.trim()) {
      toast.error("Informe o nome do projeto.")
      return
    }
    if (!sigla.trim()) {
      toast.error("Informe a sigla do projeto.")
      return
    }
    if (sigla.trim().length > 10) {
      toast.error("Sigla deve ter no máximo 10 caracteres.")
      return
    }

    setSalvando(true)

    try {
      // A sigla é o vínculo com o NocoDB. Trocá-la num projeto que já tem
      // pontos muda o que a próxima sync busca — pede confirmação uma vez.
      if (siglaMudou && projeto && pontosAfetados === null) {
        const qtd = await contarPontosDoProjeto(projeto.id)
        if (qtd > 0) {
          setPontosAfetados(qtd)
          return
        }
      }

      const input = { nome, sigla, cor }

      if (modoEdicao && projeto) {
        await atualizarProjeto(projeto.id, input)
        toast.success("Projeto atualizado com sucesso!")
      } else {
        await criarProjeto(input)
        toast.success("Projeto criado com sucesso!")
      }

      onSaved?.()
      onClose()
    } catch (err) {
      console.error("Erro ao salvar projeto:", err)
      const mensagem = err instanceof Error ? err.message : "Erro ao salvar."
      toast.error(mensagem)
    } finally {
      setSalvando(false)
    }
  }

  const aguardandoConfirmacao = pontosAfetados !== null && siglaMudou

  return (
    <>
      <DialogHeader>
        <DialogTitle className="font-heading text-2xl">
          {modoEdicao ? "Editar Projeto" : "Cadastrar Projeto"}
        </DialogTitle>
        <DialogDescription>
          {modoEdicao
            ? "Atualize as informações do projeto."
            : "Cadastre um novo projeto. Os pontos vêm do NocoDB pela sigla."}
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
            placeholder="Ex: QDFM"
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
            onChange={(e) => {
              setSigla(e.target.value.toUpperCase())
              setPontosAfetados(null)
            }}
            placeholder="Ex: ITC"
            maxLength={10}
            disabled={salvando}
            className="font-mono uppercase"
          />
          <p className="text-xs text-muted-foreground">
            Até 10 caracteres. Precisa ser idêntica à opção Projeto no NocoDB.
          </p>
        </div>

        {aguardandoConfirmacao && (
          <div className="flex items-start gap-3 rounded-lg border border-warn bg-warn-tint p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
            <div className="space-y-1 text-[13px] text-warn">
              <p className="font-medium">
                Trocar a sigla de {projeto?.sigla} para {siglaNormalizada}?
              </p>
              <p className="text-warn/80">
                O projeto tem {pontosAfetados} ponto
                {pontosAfetados === 1 ? "" : "s"}. A partir da próxima
                sincronização, os pontos são buscados no NocoDB pela opção
                Projeto <span className="font-mono">{siglaNormalizada}</span>,
                que precisa existir lá exatamente igual. Se não existir, a
                sincronização deste projeto falha sem alterar nada.
              </p>
            </div>
          </div>
        )}

        {/* Color Picker */}
        <ColorPicker
          value={cor}
          onChange={setCor}
          label="Cor de identificação"
          disabled={salvando}
        />

        {/* Integração NocoDB — informativo, sem campos */}
        <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3">
          <Database className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="space-y-1 text-[13px]">
            <p className="font-medium">Integração NocoDB</p>
            <p className="text-muted-foreground">
              Os pontos vêm da tabela <strong>Localidades</strong>, filtrando
              as linhas cuja opção <strong>Projeto</strong> é igual à sigla
              acima. A sigla precisa ser idêntica à do NocoDB (ex.:{" "}
              <span className="font-mono">BSBIA</span>, não{" "}
              <span className="font-mono">BSB.IA</span>).
            </p>
          </div>
        </div>

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
              <span className="font-mono">{sigla || "SIGLA"}</span>
            </div>
            <p className="mt-2 text-sm text-foreground">
              {nome || "Nome do projeto"}
            </p>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={salvando}>
          Cancelar
        </Button>
        <Button onClick={handleSalvar} disabled={salvando}>
          {salvando
            ? "Salvando..."
            : aguardandoConfirmacao
              ? "Confirmar mudança de sigla"
              : modoEdicao
                ? "Salvar alterações"
                : "Cadastrar"}
        </Button>
      </DialogFooter>
    </>
  )
}
