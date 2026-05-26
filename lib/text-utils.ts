/**
 * Utilitários para normalização e formatação de textos.
 * Centralizado para reuso em diferentes entidades do sistema.
 */

/** Preposições e artigos que ficam minúsculos em Title Case brasileiro */
const PALAVRAS_MINUSCULAS = [
  "de", "do", "da", "dos", "das",
  "e", "em", "no", "na", "nos", "nas",
  "o", "a", "os", "as",
]

/**
 * Converte um texto para Title Case brasileiro.
 * - Primeira letra de cada palavra significativa fica MAIÚSCULA
 * - Preposições e artigos comuns ficam minúsculas (exceto se for a primeira palavra)
 * - Preserva acentos e caracteres especiais
 *
 * Exemplos:
 * - "ceilândia" → "Ceilândia"
 * - "JARDIM BOTÂNICO DE BRASÍLIA" → "Jardim Botânico de Brasília"
 * - "águas CLARAS" → "Águas Claras"
 * - "samambaia sul" → "Samambaia Sul"
 */
export function titleCase(texto: string): string {
  if (!texto) return ""

  const palavras = texto.trim().toLowerCase().split(/\s+/)

  return palavras
    .map((palavra, index) => {
      // Primeira palavra sempre capitalizada (mesmo se for "de")
      if (index === 0) {
        return capitalizar(palavra)
      }

      // Preposições/artigos ficam minúsculos no meio
      if (PALAVRAS_MINUSCULAS.includes(palavra)) {
        return palavra
      }

      return capitalizar(palavra)
    })
    .join(" ")
}

/**
 * Capitaliza a primeira letra de uma palavra, respeitando acentos.
 *
 * Exemplos:
 * - "ceilândia" → "Ceilândia"
 * - "águas" → "Águas"
 * - "são" → "São"
 */
function capitalizar(palavra: string): string {
  if (!palavra) return ""
  return palavra.charAt(0).toUpperCase() + palavra.slice(1)
}