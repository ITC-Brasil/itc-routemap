/**
 * Utilitários de cor — puros e client-safe.
 *
 * NOTA DE MIGRAÇÃO: extraídos de lib/firestore/ras.ts para que client
 * components (~12 consumidores de corTextoIdeal/gerarCorSugerida) possam
 * continuar importando essas funções depois que o CRUD migrar para
 * lib/db/ras.ts, que é server-only e não pode ser importado no browser.
 */

/**
 * Calcula a luminância relativa de uma cor hex.
 * Retorna 0 (preto) a 1 (branco).
 * Útil para decidir se o texto sobre essa cor deve ser branco ou preto.
 */
export function calcularLuminancia(hexColor: string): number {
  const hex = hexColor.replace("#", "")
  const r = parseInt(hex.substring(0, 2), 16) / 255
  const g = parseInt(hex.substring(2, 4), 16) / 255
  const b = parseInt(hex.substring(4, 6), 16) / 255

  // Fórmula sRGB
  const transformar = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)

  return (
    0.2126 * transformar(r) + 0.7152 * transformar(g) + 0.0722 * transformar(b)
  )
}

/**
 * Retorna "white" ou "black" — qual cor de texto contrasta melhor com a cor de fundo.
 */
export function corTextoIdeal(hexColor: string): "white" | "black" {
  return calcularLuminancia(hexColor) > 0.5 ? "black" : "white"
}

/**
 * Gera uma cor hex aleatória dentro de uma paleta institucional segura
 * (evita cores muito claras, muito escuras, ou neon irritante).
 */
export function gerarCorSugerida(): string {
  // Paleta de cores "vibrantes mas profissionais" pré-selecionadas
  const paleta = [
    "#008F95", "#491027", "#1565C0", "#1A7F3C", "#CC7A00",
    "#7B1FA2", "#C0392B", "#2E7D32", "#1976D2", "#D32F2F",
    "#7B1FA2", "#388E3C", "#F57C00", "#5D4037", "#455A64",
    "#0097A7", "#512DA8", "#00796B", "#5E35B1", "#3949AB",
    "#00ACC1", "#43A047", "#FB8C00", "#8E24AA", "#6D4C41",
  ]
  return paleta[Math.floor(Math.random() * paleta.length)]
}
