import "server-only"

import { prisma } from "@/lib/prisma"
import { titleCase } from "@/lib/text-utils"
import { extrairSheetId } from "@/lib/sheets-utils"
import type { Projeto as ProjetoRow } from "@prisma/client"

// Utilitários de Sheets são client-safe e vivem em lib/sheets-utils.ts.
// Re-exportados aqui por paridade de API com lib/firestore/projetos.ts —
// consumidores client devem importar direto de "@/lib/sheets-utils".
export {
  ABA_PADRAO_SUGERIDA,
  extrairSheetId,
  isUrlSheetsValida,
} from "@/lib/sheets-utils"

// ============================================================
// TIPOS
// ============================================================

/**
 * Projeto — agrupamento lógico de UMs e pontos de operação.
 * PRD seção 4.1 + extensões:
 *   - sheetUrl/sheetId: vínculo com planilha Google Sheets
 *   - sheetAbas: lista de abas que devem ser sincronizadas
 *     (típicamente uma aba por UM, ex: ["BSBIA01", "BSBIA02"])
 *
 * NOTAS DE MIGRAÇÃO:
 * - `ultimaSincronizacao`/`criadoEm` agora são `Date` (Prisma) em vez de
 *   `Timestamp` (Firestore).
 * - O fallback legado `sheetAbaNome` (string única) da versão Firestore não
 *   existe aqui: no Postgres o campo `sheetAbas` é um array nativo e a carga
 *   inicial de dados deve normalizar o formato antigo na importação.
 * - `sigla` é UNIQUE no banco — criar dois projetos com a mesma sigla lança
 *   erro (P2002), comportamento que o Firestore não impunha.
 */
export type Projeto = {
  id: string
  nome: string
  sigla: string
  cor: string
  sheetId: string
  sheetUrl: string
  /** Lista de nomes de abas da planilha que devem ser sincronizadas */
  sheetAbas: string[]
  ultimaSincronizacao: Date | null
  criadoEm: Date | null
}

export type CriarProjetoInput = {
  nome: string
  sigla: string
  cor: string
  sheetUrl: string
  sheetAbas: string[]
}

export type AtualizarProjetoInput = CriarProjetoInput

// ============================================================
// MAPEAMENTO
// ============================================================

/**
 * Converte uma linha do Prisma para o tipo de domínio `Projeto`.
 */
function mapProjeto(row: ProjetoRow): Projeto {
  return {
    id: row.id,
    nome: row.nome,
    sigla: row.sigla,
    cor: row.cor ?? "#008F95",
    sheetId: row.sheetId,
    sheetUrl: row.sheetUrl,
    sheetAbas: row.sheetAbas,
    ultimaSincronizacao: row.ultimaSincronizacao,
    criadoEm: row.criadoEm,
  }
}

// ============================================================
// OPERAÇÕES CRUD
// ============================================================

/**
 * Lista todos os projetos, mais recentes primeiro (paridade com o
 * orderBy("criadoEm", "desc") da versão Firestore).
 */
export async function listarProjetos(): Promise<Projeto[]> {
  const rows = await prisma.projeto.findMany({
    orderBy: { criadoEm: "desc" },
  })
  return rows.map(mapProjeto)
}

export async function buscarProjeto(id: string): Promise<Projeto | null> {
  const row = await prisma.projeto.findUnique({ where: { id } })
  return row ? mapProjeto(row) : null
}

export async function criarProjeto(
  input: CriarProjetoInput
): Promise<string> {
  const sheetId = extrairSheetId(input.sheetUrl)
  if (!sheetId) {
    throw new Error("URL da planilha inválida.")
  }

  const row = await prisma.projeto.create({
    data: {
      nome: titleCase(input.nome),
      sigla: input.sigla.trim().toUpperCase(),
      cor: input.cor,
      sheetId,
      sheetUrl: input.sheetUrl.trim(),
      sheetAbas: normalizarAbas(input.sheetAbas),
      ultimaSincronizacao: null,
    },
  })

  return row.id
}

export async function atualizarProjeto(
  id: string,
  input: AtualizarProjetoInput
): Promise<void> {
  const sheetId = extrairSheetId(input.sheetUrl)
  if (!sheetId) {
    throw new Error("URL da planilha inválida.")
  }

  await prisma.projeto.update({
    where: { id },
    data: {
      nome: titleCase(input.nome),
      sigla: input.sigla.trim().toUpperCase(),
      cor: input.cor,
      sheetId,
      sheetUrl: input.sheetUrl.trim(),
      sheetAbas: normalizarAbas(input.sheetAbas),
    },
  })
}

/**
 * Atualiza apenas o timestamp de última sincronização.
 */
export async function marcarSincronizacao(id: string): Promise<void> {
  await prisma.projeto.update({
    where: { id },
    data: { ultimaSincronizacao: new Date() },
  })
}

export async function deletarProjeto(id: string): Promise<void> {
  await prisma.projeto.delete({ where: { id } })
}

// ============================================================
// HELPERS PRIVADOS
// ============================================================

/**
 * Normaliza um array de nomes de abas:
 * - Remove espaços nas pontas
 * - Remove entradas vazias
 * - Remove duplicatas (preservando ordem)
 */
function normalizarAbas(abas: string[]): string[] {
  const limpas = abas.map((a) => a.trim()).filter((a) => a.length > 0)
  return Array.from(new Set(limpas))
}
