"use server"

import { requireSession } from "@/lib/session-server"
import * as db from "@/lib/db/ums"
import type { CriarUMInput, AtualizarUMInput } from "@/lib/db/ums"

/**
 * Server actions de UMs (Unidades Móveis). Tipos (UM, UMComProjeto, *Input)
 * em "@/lib/db/ums" (type-only).
 */

export async function listarUMs() {
  await requireSession()
  return db.listarUMs()
}

export async function listarUMsComProjeto() {
  await requireSession()
  return db.listarUMsComProjeto()
}

export async function buscarUM(id: string) {
  await requireSession()
  return db.buscarUM(id)
}

export async function criarUM(input: CriarUMInput) {
  await requireSession()
  return db.criarUM(input)
}

export async function atualizarUM(id: string, input: AtualizarUMInput) {
  await requireSession()
  return db.atualizarUM(id, input)
}

export async function deletarUM(id: string) {
  await requireSession()
  return db.deletarUM(id)
}
