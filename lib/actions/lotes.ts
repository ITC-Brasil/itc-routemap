"use server"

import { requireSession } from "@/lib/session-server"
import * as db from "@/lib/db/lotes"
import { escreverPontosNoNocodb } from "@/lib/db/escrita-nocodb"

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

/**
 * Cancela no Postgres e DEPOIS desfaz no NocoDB: o ponto do lote volta a
 * "Pendente" sem técnico e o anterior da UM volta a "Atual". Falha no NocoDB
 * não desfaz o cancelamento: volta em `nocodb` para a tela avisar.
 */
export async function cancelarLote(loteId: string) {
  await requireSession()
  const resultado = await db.cancelarLote(loteId)
  const nocodb = await escreverPontosNoNocodb(resultado.pontosLiberadosIds, {
    restaurarAnterior: true,
  })
  return { ...resultado, nocodb }
}
