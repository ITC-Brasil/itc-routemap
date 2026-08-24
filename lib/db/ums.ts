import "server-only"

import { prisma } from "@/lib/prisma"
import { listarProjetos, type Projeto } from "@/lib/db/projetos"
import type { Um as UmRow } from "@prisma/client"

// ============================================================
// TIPOS
// ============================================================

/**
 * Unidade Móvel — veículo ou estrutura operacional itinerante.
 * PRD seção 4.2.
 *
 * Cada UM pertence a um projeto e (futuramente) pode ter um técnico e uma RA atual.
 *
 * NOTA DE MIGRAÇÃO: `criadoEm` agora é `Date` (Prisma) em vez de `Timestamp`
 * (Firestore). `projetoId`/`tecnicoAtualId`/`raAtualId` são strings sem
 * foreign key (Opção A) — deletar projeto não quebra UMs; o join de
 * listarUMsComProjeto é em memória, como no original.
 */
export type UM = {
  id: string
  nome: string
  cor: string
  projetoId: string
  tecnicoAtualId: string | null
  raAtualId: string | null
  criadoEm: Date | null
}

/**
 * UM "enriquecida" — inclui os dados completos do projeto vinculado.
 * Usada na listagem para evitar N+1 queries no componente.
 */
export type UMComProjeto = UM & {
  projeto: Projeto | null
}

export type CriarUMInput = {
  nome: string
  cor: string
  projetoId: string
}

export type AtualizarUMInput = {
  nome: string
  cor: string
  projetoId: string
}

// ============================================================
// CONSTANTES
// ============================================================

export const COR_PADRAO_UM = "#008F95"

// ============================================================
// MAPEAMENTO
// ============================================================

/**
 * Converte uma linha do Prisma para o tipo de domínio `UM`.
 */
function mapUm(row: UmRow): UM {
  return {
    id: row.id,
    nome: row.nome,
    cor: row.cor ?? COR_PADRAO_UM,
    projetoId: row.projetoId,
    tecnicoAtualId: row.tecnicoAtualId,
    raAtualId: row.raAtualId,
    criadoEm: row.criadoEm,
  }
}

// ============================================================
// OPERAÇÕES CRUD BÁSICAS
// ============================================================

/**
 * Lista todas as UMs cadastradas, ordenadas por nome alfabético (pt-BR).
 * Ordenação em JS com localeCompare (sensitivity: base) para preservar o
 * comportamento da versão Firestore, independente da collation do Postgres.
 */
export async function listarUMs(): Promise<UM[]> {
  const rows = await prisma.um.findMany()

  return rows
    .map(mapUm)
    .sort((a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" })
    )
}

/**
 * Lista UMs com os dados completos do projeto vinculado.
 *
 * Estratégia: busca todos os projetos UMA VEZ e cria um mapa
 * por ID, evitando N+1 queries. Eficiente para até centenas de UMs.
 */
export async function listarUMsComProjeto(): Promise<UMComProjeto[]> {
  const [ums, projetos] = await Promise.all([listarUMs(), listarProjetos()])

  // Mapa de projetos por ID para lookup rápido
  const mapaProjetos = new Map(projetos.map((p) => [p.id, p]))

  return ums.map((um) => ({
    ...um,
    projeto: mapaProjetos.get(um.projetoId) ?? null,
  }))
}

/**
 * Busca uma UM pelo ID.
 */
export async function buscarUM(id: string): Promise<UM | null> {
  const row = await prisma.um.findUnique({ where: { id } })
  return row ? mapUm(row) : null
}

/**
 * Cria uma nova UM.
 */
export async function criarUM(input: CriarUMInput): Promise<string> {
  const row = await prisma.um.create({
    data: {
      nome: input.nome.trim(),
      cor: input.cor,
      projetoId: input.projetoId,
      tecnicoAtualId: null,
      raAtualId: null,
    },
  })

  return row.id
}

/**
 * Atualiza uma UM existente.
 * Preserva os campos tecnicoAtualId e raAtualId (gerenciados em outros fluxos).
 */
export async function atualizarUM(
  id: string,
  input: AtualizarUMInput
): Promise<void> {
  await prisma.um.update({
    where: { id },
    data: {
      nome: input.nome.trim(),
      cor: input.cor,
      projetoId: input.projetoId,
    },
  })
}

/**
 * Deleta uma UM pelo ID.
 */
export async function deletarUM(id: string): Promise<void> {
  await prisma.um.delete({ where: { id } })
}
