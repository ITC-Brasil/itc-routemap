"use server"

import { requireSession } from "@/lib/session-server"
import * as db from "@/lib/db/rotas"
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

export async function confirmarAlocacao(input: ConfirmarAlocacaoInput) {
  await requireSession()
  return db.confirmarAlocacao(input)
}

export async function aplicarReotimizacao(input: ReotimizacaoInput) {
  await requireSession()
  return db.aplicarReotimizacao(input)
}
