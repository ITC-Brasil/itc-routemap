"use server"

import { requireSession } from "@/lib/session-server"
import * as db from "@/lib/db/escrita-nocodb"

/**
 * Server actions da escrita de volta no NocoDB. Tipos
 * (ResultadoEscritaNocodb) em "@/lib/db/escrita-nocodb" (type-only).
 */

export async function contarPontosNocodbPendentes() {
  await requireSession()
  return db.contarPontosNocodbPendentes()
}

export async function reenviarPontosNocodbPendentes() {
  await requireSession()
  return db.reenviarPontosNocodbPendentes()
}
