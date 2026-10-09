import "server-only"

import { prisma } from "@/lib/prisma"
import { titleCase } from "@/lib/text-utils"
import type { Projeto as ProjetoRow } from "@prisma/client"

// ============================================================
// TIPOS
// ============================================================

/**
 * Projeto — agrupamento lógico de UMs e pontos de operação.
 *
 * A `sigla` é o vínculo com o NocoDB: a sync lê da tabela Localidades as
 * linhas cuja opção Projeto é IGUAL à sigla. As colunas sheetId/sheetUrl/
 * sheetAbas (Google Sheets) continuam no schema com os valores antigos, mas
 * o app não as lê nem grava mais; saem numa limpeza futura.
 *
 * NOTAS DE MIGRAÇÃO:
 * - `ultimaSincronizacao`/`criadoEm` agora são `Date` (Prisma) em vez de
 *   `Timestamp` (Firestore).
 * - `sigla` é UNIQUE no banco — criar dois projetos com a mesma sigla lança
 *   erro (P2002), comportamento que o Firestore não impunha.
 */
export type Projeto = {
  id: string
  nome: string
  sigla: string
  cor: string
  ultimaSincronizacao: Date | null
  criadoEm: Date | null
}

export type CriarProjetoInput = {
  nome: string
  sigla: string
  cor: string
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
  const row = await prisma.projeto.create({
    data: {
      nome: titleCase(input.nome),
      sigla: input.sigla.trim().toUpperCase(),
      cor: input.cor,
      ultimaSincronizacao: null,
    },
  })

  return row.id
}

export async function atualizarProjeto(
  id: string,
  input: AtualizarProjetoInput
): Promise<void> {
  // Colunas sheet* ficam fora do data: projetos antigos mantêm os valores.
  await prisma.projeto.update({
    where: { id },
    data: {
      nome: titleCase(input.nome),
      sigla: input.sigla.trim().toUpperCase(),
      cor: input.cor,
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

/**
 * Quantos pontos o projeto tem. O formulário usa para pedir confirmação antes
 * de trocar a sigla: com pontos, a próxima sync passa a buscar a sigla nova
 * no NocoDB.
 */
export async function contarPontosDoProjeto(id: string): Promise<number> {
  return prisma.ponto.count({ where: { projetoId: id } })
}
