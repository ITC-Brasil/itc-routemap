"use server"

import { requireSession } from "@/lib/session-server"
import * as db from "@/lib/db/pontos"
import type { PontoInput } from "@/lib/db/pontos"

/**
 * Server actions de Pontos de operação. Tipos (Ponto, PontoInput) em
 * "@/lib/db/pontos" (type-only). Os aliases *Admin e helpers de
 * sincronização ficam fora daqui — são consumidos server-side por
 * app/api/sincronizar/route.ts, que importa lib/db/pontos direto.
 */

export async function listarTodosPontos() {
  await requireSession()
  return db.listarTodosPontos()
}

export async function listarPontosPorProjeto(projetoId: string) {
  await requireSession()
  return db.listarPontosPorProjeto(projetoId)
}

export async function listarPontosPorRA(raNome: string) {
  await requireSession()
  return db.listarPontosPorRA(raNome)
}

export async function buscarPonto(id: string) {
  await requireSession()
  return db.buscarPonto(id)
}

export async function criarPonto(input: PontoInput) {
  await requireSession()
  return db.criarPonto(input)
}

export async function atualizarPonto(id: string, input: Partial<PontoInput>) {
  await requireSession()
  return db.atualizarPonto(id, input)
}

export async function deletarPonto(id: string) {
  await requireSession()
  return db.deletarPonto(id)
}

export async function deletarPontosEmBatch(ids: string[]) {
  await requireSession()
  return db.deletarPontosEmBatch(ids)
}
