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
import { listarProjetos, type Projeto } from "@/lib/firestore/projetos"

// ============================================================
// TIPOS
// ============================================================

/**
 * Unidade Móvel — veículo ou estrutura operacional itinerante.
 * PRD seção 4.2.
 *
 * Cada UM pertence a um projeto e (futuramente) pode ter um técnico e uma RA atual.
 */
export type UM = {
  id: string
  nome: string
  cor: string
  projetoId: string
  tecnicoAtualId: string | null
  raAtualId: string | null
  criadoEm: Timestamp | null
}

/**
 * UM "enriquecida" — inclui os dados completos do projeto vinculado.
 * Usada na listagem para evitar N+1 queries no componente.
 */
export type UMComProjeto = UM & {
  projeto: Projeto | null
}

export type CriarUMInput = {
  nome: string
  cor: string
  projetoId: string
}

export type AtualizarUMInput = {
  nome: string
  cor: string
  projetoId: string
}

// ============================================================
// CONSTANTES
// ============================================================

const COLECAO = "ums"
export const COR_PADRAO_UM = "#008F95"

// ============================================================
// OPERAÇÕES CRUD BÁSICAS
// ============================================================

/**
 * Lista todas as UMs cadastradas, ordenadas por nome alfabético (pt-BR).
 */
export async function listarUMs(): Promise<UM[]> {
  const snapshot = await getDocs(collection(db, COLECAO))

  const ums = snapshot.docs.map((doc) => {
    const data = doc.data()
    return {
      id: doc.id,
      nome: data.nome ?? "",
      cor: data.cor ?? COR_PADRAO_UM,
      projetoId: data.projetoId ?? "",
      tecnicoAtualId: data.tecnicoAtualId ?? null,
      raAtualId: data.raAtualId ?? null,
      criadoEm: data.criadoEm ?? null,
    }
  })

  return ums.sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" })
  )
}

/**
 * Lista UMs com os dados completos do projeto vinculado.
 *
 * Estratégia: busca todos os projetos UMA VEZ e cria um mapa
 * por ID, evitando N+1 queries. Eficiente para até centenas de UMs.
 */
export async function listarUMsComProjeto(): Promise<UMComProjeto[]> {
  const [ums, projetos] = await Promise.all([listarUMs(), listarProjetos()])

  // Mapa de projetos por ID para lookup rápido
  const mapaProjetos = new Map(projetos.map((p) => [p.id, p]))

  return ums.map((um) => ({
    ...um,
    projeto: mapaProjetos.get(um.projetoId) ?? null,
  }))
}

/**
 * Busca uma UM pelo ID.
 */
export async function buscarUM(id: string): Promise<UM | null> {
  const ref = doc(db, COLECAO, id)
  const snap = await getDoc(ref)

  if (!snap.exists()) {
    return null
  }

  const data = snap.data()
  return {
    id: snap.id,
    nome: data.nome ?? "",
    cor: data.cor ?? COR_PADRAO_UM,
    projetoId: data.projetoId ?? "",
    tecnicoAtualId: data.tecnicoAtualId ?? null,
    raAtualId: data.raAtualId ?? null,
    criadoEm: data.criadoEm ?? null,
  }
}

/**
 * Cria uma nova UM.
 */
export async function criarUM(input: CriarUMInput): Promise<string> {
  const docRef = await addDoc(collection(db, COLECAO), {
    nome: input.nome.trim(),
    cor: input.cor,
    projetoId: input.projetoId,
    tecnicoAtualId: null,
    raAtualId: null,
    criadoEm: serverTimestamp(),
  })

  return docRef.id
}

/**
 * Atualiza uma UM existente.
 * Preserva os campos tecnicoAtualId e raAtualId (gerenciados em outros fluxos).
 */
export async function atualizarUM(
  id: string,
  input: AtualizarUMInput
): Promise<void> {
  const ref = doc(db, COLECAO, id)
  await updateDoc(ref, {
    nome: input.nome.trim(),
    cor: input.cor,
    projetoId: input.projetoId,
  })
}

/**
 * Deleta uma UM pelo ID.
 */
export async function deletarUM(id: string): Promise<void> {
  const ref = doc(db, COLECAO, id)
  await deleteDoc(ref)
}