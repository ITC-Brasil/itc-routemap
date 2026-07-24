import "server-only"

import crypto from "crypto"
import { prisma } from "@/lib/prisma"
import { buscarProjeto, marcarSincronizacao } from "@/lib/db/projetos"
import type { Ponto as PontoRow } from "@prisma/client"

/**
 * Pontos de operação (UMs) — CRUD Prisma.
 *
 * NOTA DE MIGRAÇÃO: substitui DOIS arquivos Firestore de uma vez:
 * - lib/firestore/pontos.ts        (SDK client, Security Rules)
 * - lib/firestore/pontos-admin.ts  (Admin SDK, bypassa Rules)
 * A separação existia por causa dos dois SDKs do Firebase; com Prisma
 * (sempre server-side) ela desaparece. Os aliases *Admin são mantidos
 * por paridade de API para app/api/sincronizar/route.ts migrar sem
 * renomear nada.
 *
 * `criadoEm`/`atualizadoEm` agora são `Date` (Prisma) em vez de
 * `Timestamp` (Firestore).
 */

// ============================================================
// TIPOS
// ============================================================

/**
 * Ponto de operação — uma linha da planilha Google Sheets de um projeto.
 *
 * Representa: "no ciclo X, etapa Y, a UM Z esteve atendendo a localidade W
 * com o técnico T". Pode ser histórico (já passou) ou pendente (a definir).
 */
export type Ponto = {
  id: string

  // Identificação na origem
  projetoId: string
  linhaOrigem: number

  // Dados da operação
  ciclo: number
  etapa: number
  tecnicoNomeHistorico: string  // texto livre da planilha
  umNome: string
  raNome: string
  uf: string

  // Localização
  plusCode: string
  endereco: string
  referencia: string
  linkMaps: string
  latitude: number | null
  longitude: number | null

  // Controle
  status: string                // "Histórico", "Pendente", etc
  hashMd5: string

  criadoEm: Date | null
  atualizadoEm: Date | null
}

/**
 * Payload para criar/atualizar ponto.
 * Não inclui `id`, `criadoEm`, `atualizadoEm` (gerados pelo banco).
 */
export type PontoInput = Omit<Ponto, "id" | "criadoEm" | "atualizadoEm">

// ============================================================
// HASH MD5 — DETECÇÃO DE MUDANÇAS
// ============================================================

/**
 * Calcula o hash MD5 dos campos relevantes de um ponto.
 *
 * Mesmo conteúdo → mesmo hash sempre. Qualquer diferença
 * (até em um espaço) → hash totalmente diferente.
 *
 * Use isso para comparar o conteúdo da planilha com o banco
 * sem precisar comparar campo a campo.
 *
 * CRÍTICO: a ordem dos campos e o separador "|" são IDÊNTICOS aos de
 * lib/firestore/pontos.ts — preservação byte a byte. Alterar qualquer
 * detalhe faria a sincronização reprocessar todas as linhas como
 * "alteradas".
 *
 * MIGRAÇÃO DE DADOS (decisão registrada — Opção A): `projetoId` participa
 * do hash, e na migração Firestore→Postgres os projetos ganham IDs novos
 * (cuid). Os hashMd5 vindos do Firestore ficam, portanto, inválidos.
 * A fase de importação de dados DEVE recalcular o hash de cada ponto com
 * o novo projetoId (via esta função) — NÃO copiar o hash antigo.
 */
export function calcularHashPonto(
  input: Omit<PontoInput, "hashMd5">
): string {
  // Concatena todos os campos relevantes com separador
  const chave = [
    input.projetoId,
    input.linhaOrigem,
    input.ciclo,
    input.etapa,
    input.tecnicoNomeHistorico,
    input.umNome,
    input.raNome,
    input.uf,
    input.plusCode,
    input.endereco,
    input.referencia,
    input.linkMaps,
    input.status,
  ].join("|")

  return crypto.createHash("md5").update(chave).digest("hex")
}

// ============================================================
// MAPEAMENTO
// ============================================================

/**
 * Converte uma linha do Prisma para o tipo de domínio `Ponto`,
 * normalizando os campos nullable do banco (String? → "") para manter
 * a mesma forma que os consumidores esperavam da versão Firestore.
 * Campos relacionais do schema (raId, tecnicoId, rotaId) não fazem
 * parte do domínio atual e são ignorados aqui.
 */
function mapPonto(row: PontoRow): Ponto {
  return {
    id: row.id,
    projetoId: row.projetoId,
    linhaOrigem: row.linhaOrigem,
    ciclo: row.ciclo,
    etapa: row.etapa,
    tecnicoNomeHistorico: row.tecnicoNomeHistorico,
    umNome: row.umNome,
    raNome: row.raNome,
    uf: row.uf,
    plusCode: row.plusCode ?? "",
    endereco: row.endereco,
    referencia: row.referencia ?? "",
    linkMaps: row.linkMaps,
    latitude: row.latitude,
    longitude: row.longitude,
    status: row.status,
    hashMd5: row.hashMd5,
    criadoEm: row.criadoEm,
    atualizadoEm: row.atualizadoEm,
  }
}

// ============================================================
// OPERAÇÕES CRUD
// ============================================================

/**
 * Lista TODOS os pontos do banco (sem filtro).
 * Útil para diagnósticos. Para uso prático, prefira listarPontosPorProjeto.
 */
export async function listarTodosPontos(): Promise<Ponto[]> {
  const rows = await prisma.ponto.findMany()
  return rows.map(mapPonto)
}

/**
 * Lista todos os pontos de um projeto específico.
 */
export async function listarPontosPorProjeto(
  projetoId: string
): Promise<Ponto[]> {
  const rows = await prisma.ponto.findMany({ where: { projetoId } })
  return rows.map(mapPonto)
}

/**
 * Lista todos os pontos de uma RA específica.
 * Útil para a página de Localidades quando o admin filtra por cidade.
 */
export async function listarPontosPorRA(raNome: string): Promise<Ponto[]> {
  const rows = await prisma.ponto.findMany({ where: { raNome } })
  return rows.map(mapPonto)
}

/**
 * Busca um ponto pelo ID.
 */
export async function buscarPonto(id: string): Promise<Ponto | null> {
  const row = await prisma.ponto.findUnique({ where: { id } })
  return row ? mapPonto(row) : null
}

/**
 * Cria um novo ponto.
 */
export async function criarPonto(input: PontoInput): Promise<string> {
  const row = await prisma.ponto.create({
    data: {
      projetoId: input.projetoId,
      linhaOrigem: input.linhaOrigem,
      ciclo: input.ciclo,
      etapa: input.etapa,
      tecnicoNomeHistorico: input.tecnicoNomeHistorico,
      umNome: input.umNome,
      raNome: input.raNome,
      uf: input.uf,
      plusCode: input.plusCode,
      endereco: input.endereco,
      referencia: input.referencia,
      linkMaps: input.linkMaps,
      latitude: input.latitude,
      longitude: input.longitude,
      status: input.status,
      hashMd5: input.hashMd5,
    },
  })
  return row.id
}

/**
 * Atualiza um ponto existente.
 * Campos ausentes (undefined) no Partial não são tocados — mesma semântica
 * do updateDoc parcial do Firestore.
 */
export async function atualizarPonto(
  id: string,
  input: Partial<PontoInput>
): Promise<void> {
  await prisma.ponto.update({
    where: { id },
    data: {
      projetoId: input.projetoId,
      linhaOrigem: input.linhaOrigem,
      ciclo: input.ciclo,
      etapa: input.etapa,
      tecnicoNomeHistorico: input.tecnicoNomeHistorico,
      umNome: input.umNome,
      raNome: input.raNome,
      uf: input.uf,
      plusCode: input.plusCode,
      endereco: input.endereco,
      referencia: input.referencia,
      linkMaps: input.linkMaps,
      latitude: input.latitude,
      longitude: input.longitude,
      status: input.status,
      hashMd5: input.hashMd5,
    },
  })
}

/**
 * Deleta um ponto.
 */
export async function deletarPonto(id: string): Promise<void> {
  await prisma.ponto.delete({ where: { id } })
}

/**
 * Deleta MÚLTIPLOS pontos de uma vez.
 *
 * Usado durante a sincronização: linhas removidas da planilha
 * são deletadas em lote.
 *
 * O chunking de 500 era um limite rígido do Firestore; no Postgres é
 * mantido apenas como proteção de tamanho de query (IN gigante).
 *
 * @param ids Array de IDs a deletar
 */
export async function deletarPontosEmBatch(ids: string[]): Promise<void> {
  if (ids.length === 0) return

  const TAMANHO_BATCH = 500

  for (let i = 0; i < ids.length; i += TAMANHO_BATCH) {
    const fatia = ids.slice(i, i + TAMANHO_BATCH)
    await prisma.ponto.deleteMany({ where: { id: { in: fatia } } })
  }
}

// ============================================================
// GEOCODING — suporte ao batch de /api/geocode-pontos
// ============================================================

/**
 * Lista pontos candidatos a geocoding: status "Pendente" e SEM
 * latitude/longitude (uma das duas nula). Opcionalmente restrito a um
 * projeto.
 *
 * O filtro de endereço vazio NÃO é aplicado aqui — fica no chamador, com
 * `trim()`, para paridade byte a byte com a versão Firestore (que filtrava
 * client-side por não conseguir expressar isso na query).
 */
export async function listarPontosPendentesSemCoordenadas(
  projetoId?: string
): Promise<Ponto[]> {
  const rows = await prisma.ponto.findMany({
    where: {
      status: "Pendente",
      ...(projetoId ? { projetoId } : {}),
      OR: [{ latitude: null }, { longitude: null }],
    },
  })
  return rows.map(mapPonto)
}

/**
 * Grava latitude/longitude de vários pontos numa única transação atômica
 * — equivalente ao `batch.commit()` (tudo-ou-nada) do Firestore.
 * `atualizadoEm` é atualizado automaticamente pelo `@updatedAt` do schema.
 */
export async function atualizarCoordenadasPontosEmLote(
  updates: { id: string; latitude: number; longitude: number }[]
): Promise<void> {
  if (updates.length === 0) return
  await prisma.$transaction(
    updates.map((u) =>
      prisma.ponto.update({
        where: { id: u.id },
        data: { latitude: u.latitude, longitude: u.longitude },
      })
    )
  )
}

// ============================================================
// ALIASES *Admin — paridade com lib/firestore/pontos-admin.ts
// ============================================================
// Com Prisma não existe a distinção SDK client vs Admin SDK; os aliases
// existem só para app/api/sincronizar/route.ts migrar sem renomear.

export const listarPontosPorProjetoAdmin = listarPontosPorProjeto
export const criarPontoAdmin = criarPonto
export const atualizarPontoAdmin = atualizarPonto
export const deletarPontosEmBatchAdmin = deletarPontosEmBatch

/**
 * Atualiza apenas o timestamp de última sincronização do projeto.
 * Wrapper fino sobre lib/db/projetos.marcarSincronizacao.
 */
export async function marcarSincronizacaoAdmin(
  projetoId: string
): Promise<void> {
  await marcarSincronizacao(projetoId)
}

/**
 * Busca um projeto retornando a forma reduzida que a sincronização espera.
 * Wrapper fino sobre lib/db/projetos.buscarProjeto.
 */
export async function buscarProjetoAdmin(projetoId: string): Promise<{
  id: string
  nome: string
  sigla: string
  cor: string
  sheetId: string
  sheetUrl: string
  sheetAbas: string[]
} | null> {
  const projeto = await buscarProjeto(projetoId)
  if (!projeto) return null

  return {
    id: projeto.id,
    nome: projeto.nome,
    sigla: projeto.sigla,
    cor: projeto.cor,
    sheetId: projeto.sheetId,
    sheetUrl: projeto.sheetUrl,
    sheetAbas: projeto.sheetAbas,
  }
}
