"use client"

import { useState } from "react"
import { toast } from "sonner"
import { ExternalLink, FileSpreadsheet, Info } from "lucide-react"
import {
  criarProjeto,
  atualizarProjeto,
  isUrlSheetsValida,
  ABA_PADRAO_SUGERIDA,
  type Projeto,
} from "@/lib/firestore/projetos"
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
import { Alert, AlertDescription } from "@/components/ui/alert"
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
  const [sheetUrl, setSheetUrl] = useState(projeto?.sheetUrl ?? "")
  const [abasTexto, setAbasTexto] = useState(
    formatarAbasParaTexto(projeto?.sheetAbas)
  )
  const [salvando, setSalvando] = useState(false)

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
    if (!sheetUrl.trim()) {
      toast.error("Informe a URL da planilha Google Sheets.")
      return
    }
    if (!isUrlSheetsValida(sheetUrl)) {
      toast.error(
        "URL inválida. Use o formato: docs.google.com/spreadsheets/d/..."
      )
      return
    }

    const sheetAbas = parsearAbasDoTexto(abasTexto)
    if (sheetAbas.length === 0) {
      toast.error("Informe ao menos uma aba para sincronizar.")
      return
    }

    setSalvando(true)

    try {
      const input = { nome, sigla, cor, sheetUrl, sheetAbas }

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

  const urlValida = sheetUrl ? isUrlSheetsValida(sheetUrl) : true
  const serviceAccountEmail =
    process.env.NEXT_PUBLIC_SERVICE_ACCOUNT_EMAIL ?? "(verificar no .env)"
  const abasPreview = parsearAbasDoTexto(abasTexto)

  return (
    <>
      <DialogHeader>
        <DialogTitle className="font-heading text-2xl">
          {modoEdicao ? "Editar Projeto" : "Cadastrar Projeto"}
        </DialogTitle>
        <DialogDescription>
          {modoEdicao
            ? "Atualize as informações do projeto."
            : "Cadastre um novo projeto com sua planilha de pontos vinculada."}
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
            onChange={(e) => setSigla(e.target.value.toUpperCase())}
            placeholder="Ex: ITC"
            maxLength={10}
            disabled={salvando}
            className="font-mono uppercase"
          />
          <p className="text-xs text-muted-foreground">
            Até 10 caracteres. Será exibida em badge colorida.
          </p>
        </div>

        {/* Color Picker */}
        <ColorPicker
          value={cor}
          onChange={setCor}
          label="Cor de identificação"
          disabled={salvando}
        />

        {/* Separador visual */}
        <div className="relative pt-2">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-background px-2 font-mono uppercase tracking-widest text-muted-foreground">
              Integração Google Sheets
            </span>
          </div>
        </div>

        {/* URL */}
        <div className="space-y-2">
          <Label htmlFor="sheetUrl" className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            URL da planilha
          </Label>
          <Input
            id="sheetUrl"
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/..."
            disabled={salvando}
            className="font-mono text-xs"
          />
          {!urlValida && (
            <p className="text-xs text-destructive">
              URL inválida. Use o link completo da planilha do Google Sheets.
            </p>
          )}
        </div>

        {/* Abas */}
        <div className="space-y-2">
          <Label htmlFor="sheetAbas">Abas a sincronizar</Label>
          <textarea
            id="sheetAbas"
            value={abasTexto}
            onChange={(e) => setAbasTexto(e.target.value)}
            disabled={salvando}
            rows={4}
            placeholder={"BSBIA01\nBSBIA02\nBSBIA03"}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
          <p className="text-xs text-muted-foreground">
            Uma aba por linha. Pode ser uma por UM do projeto (ex: BSBIA01,
            BSBIA02). Sensível a maiúsculas/minúsculas.
          </p>
          {abasPreview.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {abasPreview.map((aba) => (
                <span
                  key={aba}
                  className="inline-flex items-center rounded-md border bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground"
                >
                  {aba}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Service Account */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="space-y-2">
            <p>
              <strong>Importante:</strong> compartilhe a planilha com o
              Service Account abaixo (como Leitor):
            </p>
            <code className="block break-all rounded bg-muted px-2 py-1 font-mono text-xs">
              {serviceAccountEmail}
            </code>
            <p className="text-xs text-muted-foreground">
              Sem isso, o sistema não conseguirá ler os pontos.
            </p>
          </AlertDescription>
        </Alert>

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
            {sheetUrl && urlValida && <LinkAbrirPlanilha url={sheetUrl} />}
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
            : modoEdicao
              ? "Salvar alterações"
              : "Cadastrar"}
        </Button>
      </DialogFooter>
    </>
  )
}

// ============================================================
// HELPERS
// ============================================================

function LinkAbrirPlanilha({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">
      <ExternalLink className="h-3 w-3" />
      Abrir planilha
    </a>
  )
}

function formatarAbasParaTexto(abas: string[] | undefined): string {
  if (!abas || abas.length === 0) return ABA_PADRAO_SUGERIDA
  return abas.join("\n")
}

function parsearAbasDoTexto(texto: string): string[] {
  const linhas = texto
    .split("\n")
    .map((linha) => linha.trim())
    .filter((linha) => linha.length > 0)

  return Array.from(new Set(linhas))
}