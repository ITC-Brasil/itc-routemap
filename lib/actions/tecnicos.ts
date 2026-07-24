"use server"

import { requireSession } from "@/lib/session-server"
import * as db from "@/lib/db/tecnicos"
import type {
  CriarTecnicoInput,
  AtualizarTecnicoInput,
} from "@/lib/db/tecnicos"

/**
 * Server actions de Técnicos. Tipos (Tecnico, *Input) em "@/lib/db/tecnicos"
 * (type-only).
 */

export async function listarTecnicos() {
  await requireSession()
  return db.listarTecnicos()
}

export async function buscarTecnico(id: string) {
  await requireSession()
  return db.buscarTecnico(id)
}

export async function criarTecnico(input: CriarTecnicoInput) {
  await requireSession()
  return db.criarTecnico(input)
}

export async function atualizarTecnico(
  id: string,
  input: AtualizarTecnicoInput
) {
  await requireSession()
  return db.atualizarTecnico(id, input)
}

export async function deletarTecnico(id: string) {
  await requireSession()
  return db.deletarTecnico(id)
}

export async function pausarTecnico(id: string) {
  await requireSession()
  return db.pausarTecnico(id)
}

export async function reativarTecnico(id: string) {
  await requireSession()
  return db.reativarTecnico(id)
}
