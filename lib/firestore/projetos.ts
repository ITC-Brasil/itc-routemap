import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore"
import { db } from "@/lib/firebase"
import { titleCase } from "@/lib/text-utils"

// ============================================================
// TIPOS
// ============================================================

/**
 * Projeto — agrupamento lógico de UMs e pontos de operação.
 * PRD seção 4.1 + extensões:
 *   - sheetUrl/sheetId: vínculo com planilha Google Sheets
 *   - sheetAbas: lista de abas que devem ser sincronizadas
 *     (típicamente uma aba por UM, ex: ["BSBIA01", "BSBIA02"])
 */
export type Projeto = {
  id: string
  nome: string
  sigla: string
  cor: string
  sheetId: string
  sheetUrl: string
  /** Lista de nomes de abas da planilha que devem ser sincronizadas */
  sheetAbas: string[]
  ultimaSincronizacao: Timestamp | null
  criadoEm: Timestamp | null
}

export type CriarProjetoInput = {
  nome: string
  sigla: string
  cor: string
  sheetUrl: string
  sheetAbas: string[]
}

export type AtualizarProjetoInput = CriarProjetoInput

// ============================================================
// CONSTANTES
// ============================================================

const COLECAO = "projetos"

/** Aba padrão sugerida quando o admin não especifica nenhuma */
export const ABA_PADRAO_SUGERIDA = "Página1"

// ============================================================
// UTILITÁRIOS — EXTRAÇÃO DE SHEET ID
// ============================================================

/**
 * Extrai o ID da planilha a partir da URL do Google Sheets.
 */
export function extrairSheetId(url: string): string | null {
  if (!url || !url.trim()) return null
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : null
}

/**
 * Valida se uma URL é um link válido de Google Sheets.
 */
export function isUrlSheetsValida(url: string): boolean {
  return extrairSheetId(url) !== null
}

// ============================================================
// OPERAÇÕES CRUD
// ============================================================

export async function listarProjetos(): Promise<Projeto[]> {
  const q = query(collection(db, COLECAO), orderBy("criadoEm", "desc"))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((doc) => mapearProjeto(doc.id, doc.data()))
}

export async function buscarProjeto(id: string): Promise<Projeto | null> {
  const ref = doc(db, COLECAO, id)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  return mapearProjeto(snap.id, snap.data())
}

export async function criarProjeto(
  input: CriarProjetoInput
): Promise<string> {
  const sheetId = extrairSheetId(input.sheetUrl)
  if (!sheetId) {
    throw new Error("URL da planilha inválida.")
  }

  const docRef = await addDoc(collection(db, COLECAO), {
    nome: titleCase(input.nome),
    sigla: input.sigla.trim().toUpperCase(),
    cor: input.cor,
    sheetId,
    sheetUrl: input.sheetUrl.trim(),
    sheetAbas: normalizarAbas(input.sheetAbas),
    ultimaSincronizacao: null,
    criadoEm: serverTimestamp(),
  })

  return docRef.id
}

export async function atualizarProjeto(
  id: string,
  input: AtualizarProjetoInput
): Promise<void> {
  const sheetId = extrairSheetId(input.sheetUrl)
  if (!sheetId) {
    throw new Error("URL da planilha inválida.")
  }

  const ref = doc(db, COLECAO, id)
  await updateDoc(ref, {
    nome: titleCase(input.nome),
    sigla: input.sigla.trim().toUpperCase(),
    cor: input.cor,
    sheetId,
    sheetUrl: input.sheetUrl.trim(),
    sheetAbas: normalizarAbas(input.sheetAbas),
  })
}

/**
 * Atualiza apenas o timestamp de última sincronização.
 */
export async function marcarSincronizacao(id: string): Promise<void> {
  const ref = doc(db, COLECAO, id)
  await updateDoc(ref, {
    ultimaSincronizacao: serverTimestamp(),
  })
}

export async function deletarProjeto(id: string): Promise<void> {
  const ref = doc(db, COLECAO, id)
  await deleteDoc(ref)
}

// ============================================================
// HELPERS PRIVADOS
// ============================================================

/**
 * Normaliza um array de nomes de abas:
 * - Remove espaços nas pontas
 * - Remove entradas vazias
 * - Remove duplicatas (preservando ordem)
 */
function normalizarAbas(abas: string[]): string[] {
  const limpas = abas.map((a) => a.trim()).filter((a) => a.length > 0)
  return Array.from(new Set(limpas))
}

/**
 * Lê o campo de abas de forma flexível, suportando:
 * - Formato novo: campo "sheetAbas" (array de strings)
 * - Formato antigo: campo "sheetAbaNome" (string única)
 *
 * Útil durante a migração — projetos cadastrados antes do refactor
 * continuam funcionando sem precisar de migração explícita do Firestore.
 */
function lerAbasFlexivel(data: Record<string, unknown>): string[] {
  const abas = data.sheetAbas as string[] | undefined
  if (Array.isArray(abas)) return abas

  // Fallback para projetos cadastrados antes da refatoração
  const nomeAntigo = data.sheetAbaNome as string | undefined
  if (nomeAntigo) return [nomeAntigo]

  return []
}

/**
 * Converte um documento do Firestore em objeto Projeto tipado.
 */
function mapearProjeto(
  id: string,
  data: Record<string, unknown>
): Projeto {
  return {
    id,
    nome: (data.nome as string) ?? "",
    sigla: (data.sigla as string) ?? "",
    cor: (data.cor as string) ?? "#008F95",
    sheetId: (data.sheetId as string) ?? "",
    sheetUrl: (data.sheetUrl as string) ?? "",
    sheetAbas: lerAbasFlexivel(data),
    ultimaSincronizacao: (data.ultimaSincronizacao as Timestamp) ?? null,
    criadoEm: (data.criadoEm as Timestamp) ?? null,
  }
}