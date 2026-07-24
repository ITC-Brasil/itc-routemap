"use server"

import { requireSession } from "@/lib/session-server"
import * as db from "@/lib/db/projetos"
import type {
  CriarProjetoInput,
  AtualizarProjetoInput,
} from "@/lib/db/projetos"

/**
 * Server actions de Projetos — ponte entre client components e a camada
 * Prisma (lib/db/projetos), com checagem de sessão Better Auth.
 *
 * Tipos (Projeto, *Input) e utilitários de Sheets são client-safe e devem
 * ser importados de "@/lib/db/projetos" (type-only) e "@/lib/sheets-utils".
 */

export async function listarProjetos() {
  await requireSession()
  return db.listarProjetos()
}

export async function buscarProjeto(id: string) {
  await requireSession()
  return db.buscarProjeto(id)
}

export async function criarProjeto(input: CriarProjetoInput) {
  await requireSession()
  return db.criarProjeto(input)
}

export async function atualizarProjeto(
  id: string,
  input: AtualizarProjetoInput
) {
  await requireSession()
  return db.atualizarProjeto(id, input)
}

export async function marcarSincronizacao(id: string) {
  await requireSession()
  return db.marcarSincronizacao(id)
}

export async function deletarProjeto(id: string) {
  await requireSession()
  return db.deletarProjeto(id)
}
