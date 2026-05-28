"use client"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { corTextoIdeal } from "@/lib/firestore/ras"

type TecnicoAvatarProps = {
  /** Nome completo do técnico (para extração de iniciais) */
  nome: string
  /** Cor de fundo do avatar (hex) */
  cor: string
  /** Tamanho do avatar */
  size?: "sm" | "md" | "lg" | "xl"
  /** Classe CSS adicional */
  className?: string
}

/**
 * Avatar de técnico com iniciais sobre a cor escolhida pelo admin.
 * Cor de texto (branco/preto) é calculada automaticamente para garantir contraste.
 */
export function TecnicoAvatar({
  nome,
  cor,
  size = "md",
  className = "",
}: TecnicoAvatarProps) {
  const iniciais = extrairIniciais(nome)
  const corTexto = corTextoIdeal(cor)

  const sizeClasses = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-16 w-16 text-lg",
    xl: "h-24 w-24 text-2xl",
  }

  return (
    <Avatar className={`${sizeClasses[size]} ${className}`}>
      <AvatarFallback
        className="font-semibold"
        style={{ backgroundColor: cor, color: corTexto }}
      >
        {iniciais}
      </AvatarFallback>
    </Avatar>
  )
}

/**
 * Extrai até 2 iniciais do nome completo, ignorando preposições.
 *
 * Exemplos:
 * - "Matheus Santos" → "MS"
 * - "João da Silva" → "JS" (ignora "da")
 * - "Maria de Souza Lima" → "ML" (primeira + última)
 * - "Ana" → "A"
 * - "" → "?"
 */
function extrairIniciais(nomeCompleto: string): string {
  if (!nomeCompleto || !nomeCompleto.trim()) return "?"

  const palavrasIgnoradas = ["de", "do", "da", "dos", "das", "e"]

  const palavras = nomeCompleto
    .trim()
    .split(/\s+/)
    .filter((p) => !palavrasIgnoradas.includes(p.toLowerCase()))

  if (palavras.length === 0) return "?"
  if (palavras.length === 1) return palavras[0].charAt(0).toUpperCase()

  return (
    palavras[0].charAt(0).toUpperCase() +
    palavras[palavras.length - 1].charAt(0).toUpperCase()
  )
}