"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { MapPin, Loader2 } from "lucide-react"
import {
  criarTecnico,
  atualizarTecnico,
  COR_PADRAO_TECNICO,
  type Tecnico,
} from "@/lib/firestore/tecnicos"
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
import { Combobox } from "@/components/ui/combobox"
import { ColorPicker } from "@/components/color-picker"
import { TecnicoAvatar } from "@/components/tecnico-avatar"
import { MODOS_SELECIONAVEIS, IconeModo } from "@/lib/modos-transporte"
import { nomeAmigavelModo } from "@/app/(privado)/historico/_components/historico-formatters"

type TecnicoFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  tecnico?: Tecnico | null
  onSaved?: () => void
}

export function TecnicoFormDialog({
  open,
  onOpenChange,
  tecnico,
  onSaved,
}: TecnicoFormDialogProps) {
  const modoEdicao = !!tecnico

  // Estados do formulário
  const [nome, setNome] = useState("")
  const [cor, setCor] = useState(COR_PADRAO_TECNICO)
  const [endereco, setEndereco] = useState("")
  const [pontoReferencia, setPontoReferencia] = useState("")
  const [plusCode, setPlusCode] = useState("")
  const [latitude, setLatitude] = useState<number | null>(null)
  const [longitude, setLongitude] = useState<number | null>(null)
  const [modoPrincipal, setModoPrincipal] = useState<string>("")

  // Estados de UI
  const [salvando, setSalvando] = useState(false)
  const [obtendoCoordenadas, setObtendoCoordenadas] = useState(false)

  // Reseta formulário quando o modal abre
  useEffect(() => {
    if (open) {
      setNome(tecnico?.nome ?? "")
      setCor(tecnico?.cor ?? COR_PADRAO_TECNICO)
      setEndereco(tecnico?.endereco ?? "")
      setPontoReferencia(tecnico?.pontoReferencia ?? "")
      setPlusCode(tecnico?.plusCode ?? "")
      setLatitude(tecnico?.latitude ?? null)
      setLongitude(tecnico?.longitude ?? null)
      setModoPrincipal(tecnico?.modoPrincipal ?? "")
    }
  }, [open, tecnico])

  /**
   * Chama nossa API Route de Geocoding (criada em 11.2).
   * Preenche latitude/longitude automaticamente a partir do Plus Code.
   */
  const handleObterCoordenadas = async () => {
    if (!plusCode.trim()) {
      toast.error("Informe o Plus Code primeiro.")
      return
    }

    setObtendoCoordenadas(true)

    try {
      const url = `/api/geocoding?plusCode=${encodeURIComponent(plusCode.trim())}`
      const response = await fetch(url)
      const data = await response.json()

      if (!response.ok) {
        toast.error(data.erro ?? "Não foi possível obter coordenadas.")
        return
      }

      setLatitude(data.latitude)
      setLongitude(data.longitude)
      if (data.enderecoFormatado) {
        setEndereco(data.enderecoFormatado)
      }
      toast.success("Coordenadas obtidas com sucesso!")
    } catch (err) {
      console.error("Erro ao obter coordenadas:", err)
      toast.error("Erro ao conectar com o servidor.")
    } finally {
      setObtendoCoordenadas(false)
    }
  }

  const handleSalvar = async () => {
    // Validações
    if (!nome.trim()) {
      toast.error("Informe o nome do técnico.")
      return
    }
    if (nome.trim().length < 3) {
      toast.error("Nome muito curto. Informe ao menos 3 caracteres.")
      return
    }
    if (!endereco.trim()) {
      toast.error("Informe o endereço residencial.")
      return
    }
    if (!plusCode.trim()) {
      toast.error("Informe o Plus Code da residência.")
      return
    }
    if (latitude === null || longitude === null) {
      toast.error(
        'Clique em "Obter Coordenadas" antes de salvar.'
      )
      return
    }

    setSalvando(true)

    try {
      const input = {
        nome,
        cor,
        endereco,
        pontoReferencia,
        plusCode,
        latitude,
        longitude,
        modoPrincipal: modoPrincipal || undefined,
      }

      if (modoEdicao && tecnico) {
        await atualizarTecnico(tecnico.id, input)
        toast.success("Técnico atualizado com sucesso!")
      } else {
        await criarTecnico(input)
        toast.success("Técnico cadastrado com sucesso!")
      }

      onSaved?.()
      onOpenChange(false)
    } catch (err) {
      console.error("Erro ao salvar técnico:", err)
      toast.error("Erro ao salvar o técnico. Tente novamente.")
    } finally {
      setSalvando(false)
    }
  }

  const temCoordenadas = latitude !== null && longitude !== null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl">
            {modoEdicao ? "Editar Técnico" : "Cadastrar Técnico"}
          </DialogTitle>
          <DialogDescription>
            {modoEdicao
              ? "Atualize as informações do técnico."
              : "Cadastre um novo técnico com endereço residencial e coordenadas."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Nome */}
          <div className="space-y-2">
            <Label htmlFor="nome">Nome completo</Label>
            <Input
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Matheus Santos"
              maxLength={80}
              disabled={salvando}
            />
          </div>

          {/* Color Picker */}
          <ColorPicker
            value={cor}
            onChange={setCor}
            label="Cor de identificação"
            disabled={salvando}
          />

          {/* Plus Code + Obter Coordenadas */}
          <div className="space-y-2">
            <Label htmlFor="plusCode">Plus Code da residência</Label>
            <div className="flex gap-2">
              <Input
                id="plusCode"
                value={plusCode}
                onChange={(e) => setPlusCode(e.target.value.toUpperCase())}
                placeholder="Ex: 3Q69+77 Brasília"
                maxLength={50}
                disabled={salvando || obtendoCoordenadas}
                className="font-mono"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleObterCoordenadas}
                disabled={salvando || obtendoCoordenadas || !plusCode.trim()}
                className="shrink-0 gap-2"
              >
                {obtendoCoordenadas ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Buscando
                  </>
                ) : (
                  <>
                    <MapPin className="h-4 w-4" />
                    Obter Coordenadas
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Cole o Plus Code do Google Maps e clique em &quot;Obter Coordenadas&quot;.
            </p>
          </div>

          {/* Endereço */}
          <div className="space-y-2">
            <Label htmlFor="endereco">Endereço residencial</Label>
            <Input
              id="endereco"
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              placeholder="Ex: QNN 15, Conjunto B, Lote 24, Ceilândia Norte"
              maxLength={200}
              disabled={salvando}
            />
            <p className="text-xs text-muted-foreground">
              Endereço completo da residência do técnico.
            </p>
          </div>

          {/* Ponto de Referência */}
          <div className="space-y-2">
            <Label htmlFor="referencia">Ponto de referência</Label>
            <Input
              id="referencia"
              value={pontoReferencia}
              onChange={(e) => setPontoReferencia(e.target.value)}
              placeholder="Ex: Ao lado do Mercado Central"
              maxLength={150}
              disabled={salvando}
            />
            <p className="text-xs text-muted-foreground">
              Opcional. Ajuda em entregas ou visitas.
            </p>
          </div>

          {/* Modo principal de transporte */}
          <div className="space-y-2">
            <Label htmlFor="modoPrincipal">Modo de transporte principal</Label>
            <Combobox
              id="modoPrincipal"
              value={modoPrincipal}
              onValueChange={setModoPrincipal}
              disabled={salvando}
              options={MODOS_SELECIONAVEIS.map((modo) => ({
                value: modo,
                label: nomeAmigavelModo(modo),
                render: (
                  <div className="flex items-center gap-2">
                    <IconeModo modo={modo} className="h-4 w-4" />
                    {nomeAmigavelModo(modo)}
                  </div>
                ),
              }))}
              placeholder="Selecione o modo..."
            />
            <p className="text-xs text-muted-foreground">
              Opcional. Usado como sugestão padrão no cálculo de rotas.
            </p>
          </div>

          {/* Latitude / Longitude (read-only após geocoding) */}
          {temCoordenadas && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Latitude
                </Label>
                <Input
                  value={latitude?.toFixed(7) ?? ""}
                  readOnly
                  disabled
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Longitude
                </Label>
                <Input
                  value={longitude?.toFixed(7) ?? ""}
                  readOnly
                  disabled
                  className="font-mono text-sm"
                />
              </div>
            </div>
          )}

          {/* Preview */}
          <div className="space-y-2">
            <Label>Pré-visualização</Label>
            <div className="flex items-center gap-3 rounded-md border bg-muted p-3">
              <TecnicoAvatar
                nome={nome || "?"}
                cor={cor}
                size="lg"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">
                  {nome || "Nome do técnico"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {endereco || "Endereço residencial"}
                </p>
                {temCoordenadas && (
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {latitude?.toFixed(4)}, {longitude?.toFixed(4)}
                  </p>
                )}
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
            {salvando
              ? "Salvando..."
              : modoEdicao
                ? "Salvar alterações"
                : "Cadastrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}