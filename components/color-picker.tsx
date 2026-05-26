"use client"

import { useState } from "react"
import { Shuffle } from "lucide-react"
import { gerarCorSugerida } from "@/lib/firestore/ras"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type ColorPickerProps = {
  /** Valor atual da cor em hex (#RRGGBB) */
  value: string
  /** Callback ao mudar a cor */
  onChange: (color: string) => void
  /** Label do campo */
  label?: string
  /** Desabilita o picker */
  disabled?: boolean
}

/**
 * Componente reutilizável de seleção de cor.
 *
 * Combina:
 * - Color picker nativo do navegador (visual + drag para escolher)
 * - Campo de texto (digitar/colar hex manualmente)
 * - Botão "Sugerir" (gera cor aleatória de paleta profissional)
 */
export function ColorPicker({
  value,
  onChange,
  label = "Cor",
  disabled = false,
}: ColorPickerProps) {
  const [textValue, setTextValue] = useState(value)

  // Quando o usuário digita no campo hex, valida antes de propagar
  const handleTextChange = (input: string) => {
    setTextValue(input)
    // Valida formato hex válido
    if (/^#[0-9A-Fa-f]{6}$/.test(input)) {
      onChange(input)
    }
  }

  // Quando o color picker muda, atualiza tudo
  const handlePickerChange = (input: string) => {
    setTextValue(input.toUpperCase())
    onChange(input.toUpperCase())
  }

  const handleSugerir = () => {
    const novaCor = gerarCorSugerida()
    setTextValue(novaCor)
    onChange(novaCor)
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>

      <div className="flex items-center gap-2">
        {/* Color picker nativo */}
        <input
          type="color"
          value={value}
          onChange={(e) => handlePickerChange(e.target.value)}
          disabled={disabled}
          className="h-10 w-14 cursor-pointer rounded-md border bg-transparent p-1 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Seletor de cor"
        />

        {/* Campo de texto pro hex */}
        <Input
          value={textValue}
          onChange={(e) => handleTextChange(e.target.value.toUpperCase())}
          placeholder="#008F95"
          maxLength={7}
          disabled={disabled}
          className="font-mono"
        />

        {/* Botão de sugestão */}
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleSugerir}
          disabled={disabled}
          aria-label="Sugerir cor"
          title="Sugerir cor aleatória"
        >
          <Shuffle className="h-4 w-4" />
        </Button>
      </div>

      <p className="font-mono text-xs text-muted-foreground">
        Use o seletor, digite o código hex ou clique em sugerir.
      </p>
    </div>
  )
}