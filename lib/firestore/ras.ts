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
 * Região Administrativa — divisão geográfica para organizar pontos de operação.
 * PRD seção 4.4 + extensão: cor para identificação visual.
 */
export type RA = {
  id: string
  nomeCidade: string
  cor: string
  criadoEm: Timestamp | null
}

export type CriarRAInput = {
  nomeCidade: string
  cor: string
}

export type AtualizarRAInput = {
  nomeCidade: string
  cor: string
}

// ============================================================
// CONSTANTES
// ============================================================

const COLECAO = "ras"

/** Cor padrão para RAs sem cor definida (compatibilidade) */
export const COR_PADRAO_RA = "#008F95"

// ============================================================
// OPERAÇÕES CRUD
// ============================================================

/**
 * Lista todas as RAs cadastradas, ordenadas alfabeticamente.
 */
export async function listarRAs(): Promise<RA[]> {
  const snapshot = await getDocs(collection(db, COLECAO))

  const ras = snapshot.docs.map((doc) => {
    const data = doc.data()
    return {
      id: doc.id,
      nomeCidade: data.nomeCidade ?? "",
      cor: data.cor ?? COR_PADRAO_RA,
      criadoEm: data.criadoEm ?? null,
    }
  })

  return ras.sort((a, b) =>
    a.nomeCidade.localeCompare(b.nomeCidade, "pt-BR", {
      sensitivity: "base",
    })
  )
}

/**
 * Busca uma RA pelo ID.
 */
export async function buscarRA(id: string): Promise<RA | null> {
  const ref = doc(db, COLECAO, id)
  const snap = await getDoc(ref)

  if (!snap.exists()) {
    return null
  }

  const data = snap.data()
  return {
    id: snap.id,
    nomeCidade: data.nomeCidade ?? "",
    cor: data.cor ?? COR_PADRAO_RA,
    criadoEm: data.criadoEm ?? null,
  }
}

/**
 * Cria uma nova RA.
 */
export async function criarRA(input: CriarRAInput): Promise<string> {
  const docRef = await addDoc(collection(db, COLECAO), {
    nomeCidade: input.nomeCidade.trim(),
    cor: input.cor,
    criadoEm: serverTimestamp(),
  })

  return docRef.id
}

/**
 * Atualiza uma RA existente.
 */
export async function atualizarRA(
  id: string,
  input: AtualizarRAInput
): Promise<void> {
  const ref = doc(db, COLECAO, id)
  await updateDoc(ref, {
    nomeCidade: input.nomeCidade.trim(),
    cor: input.cor,
  })
}

/**
 * Deleta uma RA pelo ID.
 */
export async function deletarRA(id: string): Promise<void> {
  const ref = doc(db, COLECAO, id)
  await deleteDoc(ref)
}

// ============================================================
// UTILITÁRIOS DE COR
// ============================================================

/**
 * Calcula a luminância relativa de uma cor hex.
 * Retorna 0 (preto) a 1 (branco).
 * Útil para decidir se o texto sobre essa cor deve ser branco ou preto.
 */
export function calcularLuminancia(hexColor: string): number {
  const hex = hexColor.replace("#", "")
  const r = parseInt(hex.substring(0, 2), 16) / 255
  const g = parseInt(hex.substring(2, 4), 16) / 255
  const b = parseInt(hex.substring(4, 6), 16) / 255

  // Fórmula sRGB
  const transformar = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)

  return (
    0.2126 * transformar(r) + 0.7152 * transformar(g) + 0.0722 * transformar(b)
  )
}

/**
 * Retorna "white" ou "black" — qual cor de texto contrasta melhor com a cor de fundo.
 */
export function corTextoIdeal(hexColor: string): "white" | "black" {
  return calcularLuminancia(hexColor) > 0.5 ? "black" : "white"
}

/**
 * Gera uma cor hex aleatória dentro de uma paleta institucional segura
 * (evita cores muito claras, muito escuras, ou neon irritante).
 */
export function gerarCorSugerida(): string {
  // Paleta de cores "vibrantes mas profissionais" pré-selecionadas
  const paleta = [
    "#008F95", "#491027", "#1565C0", "#1A7F3C", "#CC7A00",
    "#7B1FA2", "#C0392B", "#2E7D32", "#1976D2", "#D32F2F",
    "#7B1FA2", "#388E3C", "#F57C00", "#5D4037", "#455A64",
    "#0097A7", "#512DA8", "#00796B", "#5E35B1", "#3949AB",
    "#00ACC1", "#43A047", "#FB8C00", "#8E24AA", "#6D4C41",
  ]
  return paleta[Math.floor(Math.random() * paleta.length)]
}