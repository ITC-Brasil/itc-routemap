import "server-only"

import { prisma } from "@/lib/prisma"
import type { DiaNaoUtil as DiaNaoUtilRow } from "@prisma/client"

/**
 * Dias não úteis — feriados e pontos facultativos do DF.
 *
 * Alimentam a âncora de chegada do cálculo de transporte público
 * (lib/dias-uteis.ts): a rota é calculada para chegar às 08:00 do próximo dia
 * útil, e "útil" depende desta tabela.
 *
 * Feriado e facultativo não se distinguem: a operação não escala técnico em
 * nenhum dos dois. O calendário do DF sai por decreto anual, então a tabela é
 * editável no Admin — uma tela que alguém usa uma vez por ano.
 */

// ============================================================
// TIPOS
// ============================================================

export type DiaNaoUtil = {
  id: string
  /** Data-calendário "YYYY-MM-DD". Ver nota sobre fuso em mapDiaNaoUtil. */
  data: string
  descricao: string
  criadoEm: Date | null
}

export type CriarDiaNaoUtilInput = {
  data: string // "YYYY-MM-DD"
  descricao: string
}

// ============================================================
// MAPEAMENTO
// ============================================================

/**
 * Converte a linha do Prisma para o domínio.
 *
 * A coluna é `DATE` no Postgres, e o driver a entrega como `Date` à meia-noite
 * UTC. Ler com `toISOString().slice(0, 10)` devolve a data-calendário original;
 * usar getters locais daria o dia anterior em qualquer fuso a oeste de
 * Greenwich — inclusive o nosso. Todo o domínio trabalha com a string
 * "YYYY-MM-DD" justamente para não reabrir essa armadilha a cada consumidor.
 */
function mapDiaNaoUtil(row: DiaNaoUtilRow): DiaNaoUtil {
  return {
    id: row.id,
    data: row.data.toISOString().slice(0, 10),
    descricao: row.descricao,
    criadoEm: row.criadoEm,
  }
}

/** "YYYY-MM-DD" → `Date` à meia-noite UTC, que é como a coluna DATE guarda. */
function paraColunaData(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`)
}

// ============================================================
// CRUD
// ============================================================

/** Todos os dias não úteis, mais antigos primeiro. */
export async function listarDiasNaoUteis(): Promise<DiaNaoUtil[]> {
  const rows = await prisma.diaNaoUtil.findMany({ orderBy: { data: "asc" } })
  return rows.map(mapDiaNaoUtil)
}

/** Dias não úteis de um ano — o recorte que a tela do Admin usa. */
export async function listarDiasNaoUteisPorAno(
  ano: number
): Promise<DiaNaoUtil[]> {
  const rows = await prisma.diaNaoUtil.findMany({
    where: {
      data: {
        gte: paraColunaData(`${ano}-01-01`),
        lte: paraColunaData(`${ano}-12-31`),
      },
    },
    orderBy: { data: "asc" },
  })
  return rows.map(mapDiaNaoUtil)
}

/**
 * Conjunto de datas "YYYY-MM-DD" para alimentar `proximaAncoraDeChegada`.
 *
 * Sem cache: são poucas dezenas de linhas por ano, e o cálculo que consome
 * isso faz chamadas de rede à Google Routes ordens de grandeza mais caras.
 * Um cache aqui só adicionaria invalidação para economizar microssegundos.
 */
export async function obterConjuntoDiasNaoUteis(): Promise<Set<string>> {
  const rows = await prisma.diaNaoUtil.findMany({ select: { data: true } })
  return new Set(rows.map((r) => r.data.toISOString().slice(0, 10)))
}

export async function criarDiaNaoUtil(
  input: CriarDiaNaoUtilInput
): Promise<string> {
  const row = await prisma.diaNaoUtil.create({
    data: {
      data: paraColunaData(input.data),
      descricao: input.descricao,
    },
  })
  return row.id
}

export async function deletarDiaNaoUtil(id: string): Promise<void> {
  await prisma.diaNaoUtil.delete({ where: { id } })
}
