import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore"
import { db } from "@/lib/firebase"
import { titleCase } from "@/lib/text-utils"

// ============================================================
// TIPOS
// ============================================================

/**
 * Técnico — pessoa física que opera as UMs.
 * PRD seção 4.3 (adaptado: sem campo fotoUrl — usamos avatar de iniciais
 * com cor escolhida pelo admin no cadastro, padronizando com Projetos/UMs/RAs).
 */
export type Tecnico = {
  id: string
  nome: string
  cor: string
  endereco: string
  pontoReferencia: string
  plusCode: string
  latitude: number | null
  longitude: number | null
  modoPrincipal?: string
  criadoEm: Timestamp | null
}

export type CriarTecnicoInput = {
  nome: string
  cor: string
  endereco: string
  pontoReferencia: string
  plusCode: string
  latitude: number | null
  longitude: number | null
  modoPrincipal?: string
}

export type AtualizarTecnicoInput = CriarTecnicoInput

// ============================================================
// CONSTANTES
// ============================================================

const COLECAO = "tecnicos"

/** Cor padrão para técnicos sem cor definida (compatibilidade) */
export const COR_PADRAO_TECNICO = "#008F95"

// ============================================================
// OPERAÇÕES CRUD
// ============================================================

/**
 * Lista todos os técnicos cadastrados, ordenados por nome alfabético (pt-BR).
 */
export async function listarTecnicos(): Promise<Tecnico[]> {
  const snapshot = await getDocs(collection(db, COLECAO))

  const tecnicos = snapshot.docs.map((doc) => {
    const data = doc.data()
    return {
      id: doc.id,
      nome: data.nome ?? "",
      cor: data.cor ?? COR_PADRAO_TECNICO,
      endereco: data.endereco ?? "",
      pontoReferencia: data.pontoReferencia ?? "",
      plusCode: data.plusCode ?? "",
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      modoPrincipal: data.modoPrincipal ?? undefined,
      criadoEm: data.criadoEm ?? null,
    }
  })

  return tecnicos.sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" })
  )
}

/**
 * Busca um técnico pelo ID.
 */
export async function buscarTecnico(id: string): Promise<Tecnico | null> {
  const ref = doc(db, COLECAO, id)
  const snap = await getDoc(ref)

  if (!snap.exists()) return null

  const data = snap.data()
  return {
    id: snap.id,
    nome: data.nome ?? "",
    cor: data.cor ?? COR_PADRAO_TECNICO,
    endereco: data.endereco ?? "",
    pontoReferencia: data.pontoReferencia ?? "",
    plusCode: data.plusCode ?? "",
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    modoPrincipal: data.modoPrincipal ?? undefined,
    criadoEm: data.criadoEm ?? null,
  }
}

/**
 * Cria um novo técnico.
 * Aplica titleCase no nome e uppercase no Plus Code para padronização.
 */
export async function criarTecnico(
  input: CriarTecnicoInput
): Promise<string> {
  const docRef = await addDoc(collection(db, COLECAO), {
    nome: titleCase(input.nome),
    cor: input.cor,
    endereco: input.endereco.trim(),
    pontoReferencia: input.pontoReferencia.trim(),
    plusCode: input.plusCode.trim().toUpperCase(),
    latitude: input.latitude,
    longitude: input.longitude,
    ...(input.modoPrincipal ? { modoPrincipal: input.modoPrincipal } : {}),
    criadoEm: serverTimestamp(),
  })

  return docRef.id
}

/**
 * Atualiza um técnico existente.
 */
export async function atualizarTecnico(
  id: string,
  input: AtualizarTecnicoInput
): Promise<void> {
  const ref = doc(db, COLECAO, id)
  await updateDoc(ref, {
    nome: titleCase(input.nome),
    cor: input.cor,
    endereco: input.endereco.trim(),
    pontoReferencia: input.pontoReferencia.trim(),
    plusCode: input.plusCode.trim().toUpperCase(),
    latitude: input.latitude,
    longitude: input.longitude,
    modoPrincipal: input.modoPrincipal ?? null,
  })
}

/**
 * Deleta um técnico pelo ID.
 */
export async function deletarTecnico(id: string): Promise<void> {
  const ref = doc(db, COLECAO, id)
  await deleteDoc(ref)
}