"use server"

import { requireSession } from "@/lib/session-server"
import * as db from "@/lib/db/dias-nao-uteis"
import type { CriarDiaNaoUtilInput } from "@/lib/db/dias-nao-uteis"

/**
 * Server actions de Dias não úteis (feriados e pontos facultativos).
 * Tipos em "@/lib/db/dias-nao-uteis" (type-only).
 */

export async function listarDiasNaoUteis() {
  await requireSession()
  return db.listarDiasNaoUteis()
}

export async function listarDiasNaoUteisPorAno(ano: number) {
  await requireSession()
  return db.listarDiasNaoUteisPorAno(ano)
}

export async function criarDiaNaoUtil(input: CriarDiaNaoUtilInput) {
  await requireSession()
  return db.criarDiaNaoUtil(input)
}

export async function deletarDiaNaoUtil(id: string) {
  await requireSession()
  return db.deletarDiaNaoUtil(id)
}
