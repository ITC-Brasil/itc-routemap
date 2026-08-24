/**
 * Utilitários de Google Sheets — puros e client-safe.
 *
 * NOTA DE MIGRAÇÃO: extraídos de lib/firestore/projetos.ts para que client
 * components (ex.: projeto-form-dialog.tsx valida a URL enquanto o usuário
 * digita) possam continuar importando essas funções depois que o CRUD migrar
 * para lib/db/projetos.ts, que é server-only.
 */

/** Aba padrão sugerida quando o admin não especifica nenhuma */
export const ABA_PADRAO_SUGERIDA = "Página1"

/**
 * Extrai o ID da planilha a partir da URL do Google Sheets.
 */
export function extrairSheetId(url: string): string | null {
  if (!url || !url.trim()) return null
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : null
}

/**
 * Valida se uma URL é um link válido de Google Sheets.
 */
export function isUrlSheetsValida(url: string): boolean {
  return extrairSheetId(url) !== null
}
