"use server"

import { requireSession } from "@/lib/session-server"
import * as db from "@/lib/db/lotes"

/**
 * Server actions de Lotes de alocação (agregação derivada de `rotas`).
 * Tipos (LoteSumario, StatusLote, ResultadoCancelamento) em "@/lib/db/lotes"
 * (type-only).
 */

export async function listarLotes() {
  await requireSession()
  return db.listarLotes()
}

export async function obterRotasDoLote(loteId: string) {
  await requireSession()
  return db.obterRotasDoLote(loteId)
}

export async function cancelarLote(loteId: string) {
  await requireSession()
  return db.cancelarLote(loteId)
}
