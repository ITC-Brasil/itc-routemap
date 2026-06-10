import { getAdminDb } from "@/lib/firebase-admin"
import { Timestamp } from "firebase-admin/firestore"
import { calcularHashPonto, type PontoInput, type Ponto } from "./pontos"

/**
 * Operações server-side de Pontos.
 * Usa Firebase Admin SDK (bypassa Security Rules).
 *
 * Use SOMENTE em API Routes — nunca em componentes React.
 */

const COLECAO = "pontos"

// ============================================================
// LISTAR PONTOS DE UM PROJETO (server-side)
// ============================================================

export async function listarPontosPorProjetoAdmin(
  projetoId: string
): Promise<Ponto[]> {
  const db = getAdminDb()
  const snapshot = await db
    .collection(COLECAO)
    .where("projetoId", "==", projetoId)
    .get()

  return snapshot.docs.map((doc) => {
    const data = doc.data()
    return {
      id: doc.id,
      projetoId: data.projetoId ?? "",
      linhaOrigem: data.linhaOrigem ?? 0,
      ciclo: data.ciclo ?? 0,
      etapa: data.etapa ?? 0,
      tecnicoNomeHistorico: data.tecnicoNomeHistorico ?? "",
      umNome: data.umNome ?? "",
      raNome: data.raNome ?? "",
      uf: data.uf ?? "",
      plusCode: data.plusCode ?? "",
      endereco: data.endereco ?? "",
      referencia: data.referencia ?? "",
      linkMaps: data.linkMaps ?? "",
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      status: data.status ?? "",
      hashMd5: data.hashMd5 ?? "",
      criadoEm: data.criadoEm ?? null,
      atualizadoEm: data.atualizadoEm ?? null,
    } as Ponto
  })
}

// ============================================================
// CRIAR PONTO (server-side)
// ============================================================

export async function criarPontoAdmin(input: PontoInput): Promise<string> {
  const db = getAdminDb()
  const docRef = await db.collection(COLECAO).add({
    ...input,
    criadoEm: Timestamp.now(),
    atualizadoEm: Timestamp.now(),
  })
  return docRef.id
}

// ============================================================
// ATUALIZAR PONTO (server-side)
// ============================================================

export async function atualizarPontoAdmin(
  id: string,
  input: Partial<PontoInput>
): Promise<void> {
  const db = getAdminDb()
  await db.collection(COLECAO).doc(id).update({
    ...input,
    atualizadoEm: Timestamp.now(),
  })
}

// ============================================================
// DELETAR PONTOS EM BATCH (server-side)
// ============================================================

export async function deletarPontosEmBatchAdmin(
  ids: string[]
): Promise<void> {
  if (ids.length === 0) return

  const db = getAdminDb()
  const TAMANHO_BATCH = 500

  for (let i = 0; i < ids.length; i += TAMANHO_BATCH) {
    const fatia = ids.slice(i, i + TAMANHO_BATCH)
    const batch = db.batch()

    for (const id of fatia) {
      batch.delete(db.collection(COLECAO).doc(id))
    }

    await batch.commit()
  }
}

// ============================================================
// MARCAR SINCRONIZAÇÃO DO PROJETO (server-side)
// ============================================================

export async function marcarSincronizacaoAdmin(
  projetoId: string
): Promise<void> {
  const db = getAdminDb()
  await db.collection("projetos").doc(projetoId).update({
    ultimaSincronizacao: Timestamp.now(),
  })
}

// ============================================================
// BUSCAR PROJETO (server-side)
// ============================================================

export async function buscarProjetoAdmin(projetoId: string) {
  const db = getAdminDb()
  const docSnap = await db.collection("projetos").doc(projetoId).get()

  if (!docSnap.exists) return null

  const data = docSnap.data()
  if (!data) return null

  return {
    id: docSnap.id,
    nome: (data.nome as string) ?? "",
    sigla: (data.sigla as string) ?? "",
    cor: (data.cor as string) ?? "",
    sheetId: (data.sheetId as string) ?? "",
    sheetUrl: (data.sheetUrl as string) ?? "",
    sheetAbas: lerAbasFlexivel(data),
  }
}

/**
 * Lê o campo de abas de forma flexível, suportando:
 * - Formato novo: campo "sheetAbas" (array de strings)
 * - Formato antigo: campo "sheetAbaNome" (string única)
 *
 * Útil durante a migração — projetos cadastrados antes do refactor
 * continuam funcionando.
 */
function lerAbasFlexivel(data: Record<string, unknown>): string[] {
  const abas = data.sheetAbas as string[] | undefined
  if (Array.isArray(abas)) return abas

  // Fallback para projetos antigos
  const nomeAntigo = data.sheetAbaNome as string | undefined
  if (nomeAntigo) return [nomeAntigo]

  return []
}

// Re-exportar utilitário de hash para conveniência
export { calcularHashPonto }