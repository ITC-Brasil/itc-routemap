import "server-only"

import { prisma } from "@/lib/prisma"
import { titleCase } from "@/lib/text-utils"
import type { Tecnico as TecnicoRow } from "@prisma/client"

// ============================================================
// TIPOS
// ============================================================

/**
 * Técnico — pessoa física que opera as UMs.
 * PRD seção 4.3 (adaptado: sem campo fotoUrl — usamos avatar de iniciais
 * com cor escolhida pelo admin no cadastro, padronizando com Projetos/UMs/RAs).
 *
 * NOTA DE MIGRAÇÃO: `criadoEm` agora é `Date` (Prisma) em vez de `Timestamp`
 * (Firestore). Consumidores que usavam métodos de Timestamp (.toMillis/.toDate)
 * precisarão ser ajustados ao trocar de @/lib/firestore/tecnicos para este módulo.
 */
export type Tecnico = {
  id: string
  nome: string
  cor: string
  endereco: string
  pontoReferencia: string
  plusCode: string
  latitude: number | null
  longitude: number | null
  modoPrincipal?: string
  ativo: boolean
  criadoEm: Date | null
}

export type CriarTecnicoInput = {
  nome: string
  cor: string
  endereco: string
  pontoReferencia: string
  plusCode: string
  latitude: number | null
  longitude: number | null
  modoPrincipal?: string
}

export type AtualizarTecnicoInput = CriarTecnicoInput

// ============================================================
// CONSTANTES
// ============================================================

/** Cor padrão para técnicos sem cor definida (compatibilidade) */
export const COR_PADRAO_TECNICO = "#008F95"

// ============================================================
// MAPEAMENTO
// ============================================================

/**
 * Converte uma linha do Prisma para o tipo de domínio `Tecnico`,
 * normalizando os campos opcionais (String? → "" / undefined) para manter
 * a mesma forma que os consumidores esperavam da versão Firestore.
 */
function mapTecnico(row: TecnicoRow): Tecnico {
  return {
    id: row.id,
    nome: row.nome,
    cor: row.cor ?? COR_PADRAO_TECNICO,
    endereco: row.endereco,
    pontoReferencia: row.pontoReferencia ?? "",
    plusCode: row.plusCode ?? "",
    latitude: row.latitude,
    longitude: row.longitude,
    modoPrincipal: row.modoPrincipal ?? undefined,
    ativo: row.ativo,
    criadoEm: row.criadoEm,
  }
}

// ============================================================
// OPERAÇÕES CRUD
// ============================================================

/**
 * Lista todos os técnicos cadastrados, ordenados por nome alfabético (pt-BR).
 * A ordenação é feita em JS com localeCompare para preservar exatamente o
 * comportamento pt-BR (sensitivity: base) da versão Firestore, independente
 * da collation do Postgres.
 */
export async function listarTecnicos(): Promise<Tecnico[]> {
  const rows = await prisma.tecnico.findMany()

  return rows
    .map(mapTecnico)
    .sort((a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" })
    )
}

/**
 * Busca um técnico pelo ID.
 */
export async function buscarTecnico(id: string): Promise<Tecnico | null> {
  const row = await prisma.tecnico.findUnique({ where: { id } })
  return row ? mapTecnico(row) : null
}

/**
 * Cria um novo técnico.
 * Aplica titleCase no nome e uppercase no Plus Code para padronização.
 */
export async function criarTecnico(
  input: CriarTecnicoInput
): Promise<string> {
  const row = await prisma.tecnico.create({
    data: {
      nome: titleCase(input.nome),
      cor: input.cor,
      endereco: input.endereco.trim(),
      pontoReferencia: input.pontoReferencia.trim(),
      plusCode: input.plusCode.trim().toUpperCase(),
      latitude: input.latitude,
      longitude: input.longitude,
      modoPrincipal: input.modoPrincipal ?? null,
    },
  })

  return row.id
}

/**
 * Atualiza um técnico existente.
 */
export async function atualizarTecnico(
  id: string,
  input: AtualizarTecnicoInput
): Promise<void> {
  await prisma.tecnico.update({
    where: { id },
    data: {
      nome: titleCase(input.nome),
      cor: input.cor,
      endereco: input.endereco.trim(),
      pontoReferencia: input.pontoReferencia.trim(),
      plusCode: input.plusCode.trim().toUpperCase(),
      latitude: input.latitude,
      longitude: input.longitude,
      modoPrincipal: input.modoPrincipal ?? null,
    },
  })
}

/**
 * Deleta um técnico pelo ID.
 */
export async function deletarTecnico(id: string): Promise<void> {
  await prisma.tecnico.delete({ where: { id } })
}

/**
 * Pausa um técnico: ele deixa de aparecer na seleção de calcular-rotas.
 * Rotas já confirmadas não são afetadas.
 */
export async function pausarTecnico(id: string): Promise<void> {
  await prisma.tecnico.update({ where: { id }, data: { ativo: false } })
}

/**
 * Reativa um técnico pausado.
 */
export async function reativarTecnico(id: string): Promise<void> {
  await prisma.tecnico.update({ where: { id }, data: { ativo: true } })
}
