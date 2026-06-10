import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  where,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore"
import crypto from "crypto"
import { db } from "@/lib/firebase"

// ============================================================
// TIPOS
// ============================================================

/**
 * Ponto de operação — uma linha da planilha Google Sheets de um projeto.
 *
 * Representa: "no ciclo X, etapa Y, a UM Z esteve atendendo a localidade W
 * com o técnico T". Pode ser histórico (já passou) ou pendente (a definir).
 */
export type Ponto = {
  id: string

  // Identificação na origem
  projetoId: string
  linhaOrigem: number

  // Dados da operação
  ciclo: number
  etapa: number
  tecnicoNomeHistorico: string  // texto livre da planilha
  umNome: string
  raNome: string
  uf: string

  // Localização
  plusCode: string
  endereco: string
  referencia: string
  linkMaps: string
  latitude: number | null
  longitude: number | null

  // Controle
  status: string                // "Histórico", "Pendente", etc
  hashMd5: string

  criadoEm: Timestamp | null
  atualizadoEm: Timestamp | null
}

/**
 * Payload para criar/atualizar ponto.
 * Não inclui `id`, `criadoEm`, `atualizadoEm` (gerados pelo Firestore).
 */
export type PontoInput = Omit<Ponto, "id" | "criadoEm" | "atualizadoEm">

// ============================================================
// CONSTANTES
// ============================================================

const COLECAO = "pontos"

// ============================================================
// HASH MD5 — DETECÇÃO DE MUDANÇAS
// ============================================================

/**
 * Calcula o hash MD5 dos campos relevantes de um ponto.
 *
 * Mesmo conteúdo → mesmo hash sempre. Qualquer diferença
 * (até em um espaço) → hash totalmente diferente.
 *
 * Use isso para comparar o conteúdo da planilha com o Firestore
 * sem precisar comparar campo a campo.
 */
export function calcularHashPonto(
  input: Omit<PontoInput, "hashMd5">
): string {
  // Concatena todos os campos relevantes com separador
  const chave = [
    input.projetoId,
    input.linhaOrigem,
    input.ciclo,
    input.etapa,
    input.tecnicoNomeHistorico,
    input.umNome,
    input.raNome,
    input.uf,
    input.plusCode,
    input.endereco,
    input.referencia,
    input.linkMaps,
    input.status,
  ].join("|")

  return crypto.createHash("md5").update(chave).digest("hex")
}

// ============================================================
// OPERAÇÕES CRUD
// ============================================================

/**
 * Lista TODOS os pontos do Firestore (sem filtro).
 * Útil para diagnósticos. Para uso prático, prefira listarPontosPorProjeto.
 */
export async function listarTodosPontos(): Promise<Ponto[]> {
  const snapshot = await getDocs(collection(db, COLECAO))
  return snapshot.docs.map((doc) => mapearPonto(doc.id, doc.data()))
}

/**
 * Lista todos os pontos de um projeto específico.
 */
export async function listarPontosPorProjeto(
  projetoId: string
): Promise<Ponto[]> {
  const q = query(
    collection(db, COLECAO),
    where("projetoId", "==", projetoId)
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map((doc) => mapearPonto(doc.id, doc.data()))
}

/**
 * Lista todos os pontos de uma RA específica.
 * Útil para a página de Localidades quando o admin filtra por cidade.
 */
export async function listarPontosPorRA(raNome: string): Promise<Ponto[]> {
  const q = query(collection(db, COLECAO), where("raNome", "==", raNome))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((doc) => mapearPonto(doc.id, doc.data()))
}

/**
 * Busca um ponto pelo ID.
 */
export async function buscarPonto(id: string): Promise<Ponto | null> {
  const ref = doc(db, COLECAO, id)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  return mapearPonto(snap.id, snap.data())
}

/**
 * Cria um novo ponto.
 */
export async function criarPonto(input: PontoInput): Promise<string> {
  const docRef = await addDoc(collection(db, COLECAO), {
    ...input,
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  })
  return docRef.id
}

/**
 * Atualiza um ponto existente.
 */
export async function atualizarPonto(
  id: string,
  input: Partial<PontoInput>
): Promise<void> {
  const ref = doc(db, COLECAO, id)
  await updateDoc(ref, {
    ...input,
    atualizadoEm: serverTimestamp(),
  })
}

/**
 * Deleta um ponto.
 */
export async function deletarPonto(id: string): Promise<void> {
  const ref = doc(db, COLECAO, id)
  await deleteDoc(ref)
}

/**
 * Deleta MÚLTIPLOS pontos de uma vez (batch operation).
 *
 * Usado durante a sincronização: linhas removidas da planilha
 * são deletadas em batch (uma única transação do Firestore).
 *
 * @param ids Array de IDs a deletar
 */
export async function deletarPontosEmBatch(ids: string[]): Promise<void> {
  if (ids.length === 0) return

  // Firestore limita batch a 500 operações
  const TAMANHO_BATCH = 500

  for (let i = 0; i < ids.length; i += TAMANHO_BATCH) {
    const fatia = ids.slice(i, i + TAMANHO_BATCH)
    const batch = writeBatch(db)

    for (const id of fatia) {
      batch.delete(doc(db, COLECAO, id))
    }

    await batch.commit()
  }
}

// ============================================================
// HELPERS PRIVADOS
// ============================================================

function mapearPonto(
  id: string,
  data: Record<string, unknown>
): Ponto {
  return {
    id,
    projetoId: (data.projetoId as string) ?? "",
    linhaOrigem: (data.linhaOrigem as number) ?? 0,
    ciclo: (data.ciclo as number) ?? 0,
    etapa: (data.etapa as number) ?? 0,
    tecnicoNomeHistorico: (data.tecnicoNomeHistorico as string) ?? "",
    umNome: (data.umNome as string) ?? "",
    raNome: (data.raNome as string) ?? "",
    uf: (data.uf as string) ?? "",
    plusCode: (data.plusCode as string) ?? "",
    endereco: (data.endereco as string) ?? "",
    referencia: (data.referencia as string) ?? "",
    linkMaps: (data.linkMaps as string) ?? "",
    latitude: (data.latitude as number | null) ?? null,
    longitude: (data.longitude as number | null) ?? null,
    status: (data.status as string) ?? "",
    hashMd5: (data.hashMd5 as string) ?? "",
    criadoEm: (data.criadoEm as Timestamp) ?? null,
    atualizadoEm: (data.atualizadoEm as Timestamp) ?? null,
  }
}