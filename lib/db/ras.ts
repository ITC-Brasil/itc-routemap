import "server-only"

import { prisma } from "@/lib/prisma"
import type { Ra as RaRow } from "@prisma/client"

// Utilitários de cor são client-safe e vivem em lib/cores.ts.
// Re-exportados aqui por paridade de API com lib/firestore/ras.ts —
// consumidores client devem importar direto de "@/lib/cores".
export {
  calcularLuminancia,
  corTextoIdeal,
  gerarCorSugerida,
} from "@/lib/cores"

// ============================================================
// TIPOS
// ============================================================

/**
 * Região Administrativa — divisão geográfica para organizar pontos de operação.
 * PRD seção 4.4 + extensão: cor para identificação visual.
 *
 * NOTA DE MIGRAÇÃO: `criadoEm` agora é `Date` (Prisma) em vez de `Timestamp`
 * (Firestore). No banco, o campo de domínio `nomeCidade` é a coluna `nome`
 * (model Ra) — o mapeamento é feito por mapRA/inputs abaixo.
 */
export type RA = {
  id: string
  nomeCidade: string
  cor: string
  criadoEm: Date | null
}

export type CriarRAInput = {
  nomeCidade: string
  cor: string
}

export type AtualizarRAInput = {
  nomeCidade: string
  cor: string
}

// ============================================================
// CONSTANTES
// ============================================================

/** Cor padrão para RAs sem cor definida (compatibilidade) */
export const COR_PADRAO_RA = "#008F95"

// ============================================================
// MAPEAMENTO
// ============================================================

/**
 * Converte uma linha do Prisma para o tipo de domínio `RA`.
 * Coluna `nome` → campo de domínio `nomeCidade`.
 */
function mapRA(row: RaRow): RA {
  return {
    id: row.id,
    nomeCidade: row.nome,
    cor: row.cor ?? COR_PADRAO_RA,
    criadoEm: row.criadoEm,
  }
}

// ============================================================
// OPERAÇÕES CRUD
// ============================================================

/**
 * Lista todas as RAs cadastradas, ordenadas alfabeticamente.
 * Ordenação em JS com localeCompare pt-BR (sensitivity: base) para preservar
 * o comportamento da versão Firestore, independente da collation do Postgres.
 */
export async function listarRAs(): Promise<RA[]> {
  const rows = await prisma.ra.findMany()

  return rows
    .map(mapRA)
    .sort((a, b) =>
      a.nomeCidade.localeCompare(b.nomeCidade, "pt-BR", {
        sensitivity: "base",
      })
    )
}

/**
 * Busca uma RA pelo ID.
 */
export async function buscarRA(id: string): Promise<RA | null> {
  const row = await prisma.ra.findUnique({ where: { id } })
  return row ? mapRA(row) : null
}

/**
 * Cria uma nova RA.
 */
export async function criarRA(input: CriarRAInput): Promise<string> {
  const row = await prisma.ra.create({
    data: {
      nome: input.nomeCidade.trim(),
      cor: input.cor,
    },
  })

  return row.id
}

/**
 * Atualiza uma RA existente.
 */
export async function atualizarRA(
  id: string,
  input: AtualizarRAInput
): Promise<void> {
  await prisma.ra.update({
    where: { id },
    data: {
      nome: input.nomeCidade.trim(),
      cor: input.cor,
    },
  })
}

/**
 * Deleta uma RA pelo ID.
 */
export async function deletarRA(id: string): Promise<void> {
  await prisma.ra.delete({ where: { id } })
}
