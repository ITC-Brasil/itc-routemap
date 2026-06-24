"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Combobox } from "@/components/ui/combobox"
import { Badge } from "@/components/ui/badge"
import { atualizarPonto, type Ponto } from "@/lib/firestore/pontos"
import type { Projeto } from "@/lib/firestore/projetos"
import { corTextoIdeal } from "@/lib/firestore/ras"

const STATUSES_PADRAO = ["Pendente", "Atual", "Histórico"]

interface EditarPontoDialogProps {
  ponto: Ponto | null
  projeto: Projeto | undefined
  onClose: () => void
  onSalvo: () => Promise<void> | void
}

/**
 * Modal de edição de ponto.
 *
 * Padrão "remount via key" (igual modais de Projetos):
 * o ConteudoFormulario é montado/desmontado conforme o ponto muda,
 * eliminando warnings de set-state-in-effect do React 19.
 */
export function EditarPontoDialog({
  ponto,
  projeto,
  onClose,
  onSalvo,
}: EditarPontoDialogProps) {
  return (
    <Dialog
      open={ponto !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-w-2xl">
        {ponto && (
          <ConteudoFormulario
            key={ponto.id}
            ponto={ponto}
            projeto={projeto}
            onClose={onClose}
            onSalvo={onSalvo}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// FORMULÁRIO (componente interno remontado por key)
// ============================================================

function ConteudoFormulario({
  ponto,
  projeto,
  onClose,
  onSalvo,
}: {
  ponto: Ponto
  projeto: Projeto | undefined
  onClose: () => void
  onSalvo: () => Promise<void> | void
}) {
  // ====== ESTADO DOS CAMPOS ======
  const [status, setStatus] = useState(ponto.status || "Pendente")
  const [raNome, setRaNome] = useState(ponto.raNome)
  const [uf, setUf] = useState(ponto.uf)
  const [endereco, setEndereco] = useState(ponto.endereco)
  const [referencia, setReferencia] = useState(ponto.referencia)
  const [linkMaps, setLinkMaps] = useState(ponto.linkMaps)
  const [latitude, setLatitude] = useState<string>(
    ponto.latitude !== null ? String(ponto.latitude) : ""
  )
  const [longitude, setLongitude] = useState<string>(
    ponto.longitude !== null ? String(ponto.longitude) : ""
  )
  const [salvando, setSalvando] = useState(false)

   // Detecta mudança de status pra exigir confirmação visual antes do submit.
  // (Evita troca acidental num campo crítico de workflow.)
  const statusOriginal = ponto.status || "Pendente"
  const statusMudou = status !== statusOriginal
  
  // Se o status atual não está na lista padrão, inclui ele como opção
  // pra não sumir do dropdown (acontece quando a planilha usa rótulos exóticos).
  const opcoesStatus = STATUSES_PADRAO.includes(status)
    ? STATUSES_PADRAO
    : [...STATUSES_PADRAO, status]

  // ====== HANDLER DE SUBMIT ======
  const handleSubmit = async () => {
    // Validação de coordenadas (campos opcionais — string vazia = null)
    const latParsed = latitude.trim() === "" ? null : parseFloat(latitude)
    const lngParsed = longitude.trim() === "" ? null : parseFloat(longitude)

    if (latParsed !== null && Number.isNaN(latParsed)) {
      toast.error("Latitude deve ser um número válido.")
      return
    }
    if (lngParsed !== null && Number.isNaN(lngParsed)) {
      toast.error("Longitude deve ser um número válido.")
      return
    }

    setSalvando(true)
    try {
      await atualizarPonto(ponto.id, {
        status,
        raNome: raNome.trim(),
        uf: uf.trim().toUpperCase(),
        endereco: endereco.trim(),
        referencia: referencia.trim(),
        linkMaps: linkMaps.trim(),
        latitude: latParsed,
        longitude: lngParsed,
      })
      toast.success("Ponto atualizado.")
      await onSalvo()
      onClose()
    } catch (err) {
      console.error("Erro ao atualizar ponto:", err)
      toast.error("Não foi possível salvar. Tente novamente.")
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 font-heading">
          Editar ponto
          {projeto && (
            <Badge
              className="font-mono"
              style={{
                backgroundColor: projeto.cor,
                color: corTextoIdeal(projeto.cor),
              }}
            >
              {projeto.sigla}
            </Badge>
          )}
        </DialogTitle>
        <DialogDescription>
          Linha {ponto.linhaOrigem} da aba{" "}
          <span className="font-mono">{ponto.umNome}</span> · Ciclo {ponto.ciclo}{" "}
          / Etapa {ponto.etapa}
          {ponto.tecnicoNomeHistorico && (
            <> · Técnico histórico: {ponto.tecnicoNomeHistorico}</>
          )}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-2">
        {/* Status */}
        <div className="space-y-2">
          <Label htmlFor="edit-status">Status</Label>
          <Combobox
            id="edit-status"
            value={status}
            onValueChange={setStatus}
            options={opcoesStatus.map((s) => ({ value: s, label: s }))}
            placeholder="Selecione o status..."
          />
        </div>

        {/* RA + UF */}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 space-y-2">
            <Label htmlFor="edit-ra">Região Administrativa</Label>
            <Input
              id="edit-ra"
              value={raNome}
              onChange={(e) => setRaNome(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-uf">UF</Label>
            <Input
              id="edit-uf"
              value={uf}
              onChange={(e) => setUf(e.target.value)}
              maxLength={2}
              className="uppercase"
            />
          </div>
        </div>

        {/* Endereço */}
        <div className="space-y-2">
          <Label htmlFor="edit-endereco">Endereço</Label>
          <Input
            id="edit-endereco"
            value={endereco}
            onChange={(e) => setEndereco(e.target.value)}
          />
        </div>

        {/* Referência */}
        <div className="space-y-2">
          <Label htmlFor="edit-referencia">Referência</Label>
          <Input
            id="edit-referencia"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            placeholder="Ex: Ao lado do CEF 02"
          />
        </div>

        {/* Plus Code (readonly) */}
        <div className="space-y-2">
          <Label htmlFor="edit-pluscode" className="text-muted-foreground">
            Plus Code (não editável)
          </Label>
          <Input
            id="edit-pluscode"
            value={ponto.plusCode || "—"}
            readOnly
            className="bg-muted font-mono"
          />
        </div>

        {/* Link Maps */}
        <div className="space-y-2">
          <Label htmlFor="edit-link">Link do Google Maps</Label>
          <Input
            id="edit-link"
            value={linkMaps}
            onChange={(e) => setLinkMaps(e.target.value)}
            placeholder="https://maps.app.goo.gl/..."
            type="url"
          />
        </div>

        {/* Coordenadas */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="edit-lat">Latitude</Label>
            <Input
              id="edit-lat"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              placeholder="-15.7942"
              inputMode="decimal"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-lng">Longitude</Label>
            <Input
              id="edit-lng"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              placeholder="-47.8825"
              inputMode="decimal"
            />
          </div>
        </div>

        {/* Aviso de mudança de status */}
        {statusMudou && (
          <div className="rounded-md border border-orange-400 bg-orange-50 p-3 text-xs text-orange-900 dark:border-orange-900/60 dark:bg-orange-950/40 dark:text-orange-200">
            Você está mudando o status de{" "}
            <strong className="font-semibold">{statusOriginal}</strong> para{" "}
            <strong className="font-semibold">{status}</strong>. Confirme no
            botão abaixo.
          </div>
        )}

        {/* Aviso sobre sobrescrita na sync */}
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          ⚠ Edições manuais são sobrescritas na próxima sincronização se a
          mesma linha for alterada na planilha de origem.
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={salvando}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} disabled={salvando}>
          {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {salvando
            ? "Salvando..."
            : statusMudou
              ? `Confirmar mudança para ${status}`
              : "Salvar alterações"}
        </Button>
      </DialogFooter>
    </>
  )
}
