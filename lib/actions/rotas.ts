"use server"

import { requireSession } from "@/lib/session-server"
import * as db from "@/lib/db/rotas"
import { escreverPontosNoNocodb } from "@/lib/db/escrita-nocodb"
import type {
  RotaInput,
  ConfirmarAlocacaoInput,
  ReotimizacaoInput,
} from "@/lib/db/rotas"
import type { StatusRota } from "@/lib/rotas-utils"

/**
 * Server actions de Rotas — inclui as transações atômicas (confirmarAlocacao,
 * aplicarReotimizacao) que criam rotas e atualizam pontos numa única
 * prisma.$transaction (ver lib/db/rotas.ts).
 *
 * Tipos e helpers puros (ModoTransporte, StatusRota, gerarLoteId,
 * obterDestinosPorUM, obterDestinosRealocaveisPorUM, ...) são client-safe e
 * devem ser importados de "@/lib/rotas-utils".
 */

export async function listarRotas() {
  await requireSession()
  return db.listarRotas()
}

export async function listarRotasPorLote(loteId: string) {
  await requireSession()
  return db.listarRotasPorLote(loteId)
}

export async function listarRotasPorStatus(status: StatusRota) {
  await requireSession()
  return db.listarRotasPorStatus(status)
}

export async function buscarRota(id: string) {
  await requireSession()
  return db.buscarRota(id)
}

export async function criarRotasEmLote(rotas: RotaInput[]) {
  await requireSession()
  return db.criarRotasEmLote(rotas)
}

export async function atualizarStatusRota(id: string, status: StatusRota) {
  await requireSession()
  return db.atualizarStatusRota(id, status)
}

export async function atualizarStatusLote(loteId: string, status: StatusRota) {
  await requireSession()
  return db.atualizarStatusLote(loteId, status)
}

export async function deletarLote(loteId: string) {
  await requireSession()
  return db.deletarLote(loteId)
}

/**
 * Confirma no Postgres e DEPOIS espelha no NocoDB (ponto novo vira "Atual"
 * com o técnico; o "Atual" anterior da UM vira "Histórico"). Falha no NocoDB
 * não desfaz a confirmação: volta em `nocodb` para a tela avisar.
 */
export async function confirmarAlocacao(input: ConfirmarAlocacaoInput) {
  await requireSession()
  const resultado = await db.confirmarAlocacao(input)
  const nocodb = await escreverPontosNoNocodb(resultado.pontosAtualizados, {
    restaurarAnterior: false,
  })
  return { ...resultado, nocodb }
}

/**
 * Mesma regra da confirmação para os pontos novos; o ponto liberado de cada
 * re-otimização volta a "Pendente" sem técnico no NocoDB.
 */
export async function aplicarReotimizacao(input: ReotimizacaoInput) {
  await requireSession()
  const resultado = await db.aplicarReotimizacao(input)
  const liberados = input.alocacoes
    .map((a) => a.pontoAntigoId)
    .filter((id): id is string => !!id)
  const nocodb = await escreverPontosNoNocodb(
    [...resultado.pontosAtualizados, ...liberados],
    { restaurarAnterior: false }
  )
  return { ...resultado, nocodb }
}
