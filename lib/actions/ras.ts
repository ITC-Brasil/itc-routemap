"use server"

import { requireSession } from "@/lib/session-server"
import * as db from "@/lib/db/ras"
import type { CriarRAInput, AtualizarRAInput } from "@/lib/db/ras"

/**
 * Server actions de RAs (Regiões Administrativas). Utilitários de cor são
 * client-safe e vivem em "@/lib/cores"; tipos em "@/lib/db/ras" (type-only).
 */

export async function listarRAs() {
  await requireSession()
  return db.listarRAs()
}

export async function buscarRA(id: string) {
  await requireSession()
  return db.buscarRA(id)
}

export async function criarRA(input: CriarRAInput) {
  await requireSession()
  return db.criarRA(input)
}

export async function atualizarRA(id: string, input: AtualizarRAInput) {
  await requireSession()
  return db.atualizarRA(id, input)
}

export async function deletarRA(id: string) {
  await requireSession()
  return db.deletarRA(id)
}
