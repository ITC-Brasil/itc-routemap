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

// ============================================================
// TIPOS
// ============================================================

/**
 * Representação de um Projeto no Firestore.
 * Espelha a estrutura definida no PRD seção 4.1.
 */
export type Projeto = {
  id: string
  nome: string
  sigla: string
  cor: string
  criadoEm: Timestamp | null
}

/**
 * Payload para criar um projeto novo.
 * O `id` e `criadoEm` são gerados automaticamente.
 */
export type CriarProjetoInput = {
  nome: string
  sigla: string
  cor: string
}

/**
 * Payload para atualizar um projeto existente.
 * Todos os campos editáveis.
 */
export type AtualizarProjetoInput = {
  nome: string
  sigla: string
  cor: string
}

// ============================================================
// CONSTANTES
// ============================================================

const COLECAO = "projetos"

// ============================================================
// OPERAÇÕES CRUD
// ============================================================

/**
 * Lista todos os projetos cadastrados, ordenados por data de criação (mais recentes primeiro).
 */
export async function listarProjetos(): Promise<Projeto[]> {
  const q = query(collection(db, COLECAO), orderBy("criadoEm", "desc"))
  const snapshot = await getDocs(q)

  return snapshot.docs.map((doc) => {
    const data = doc.data()
    return {
      id: doc.id,
      nome: data.nome ?? "",
      sigla: data.sigla ?? "",
      cor: data.cor ?? "#008F95",
      criadoEm: data.criadoEm ?? null,
    }
  })
}

/**
 * Busca um único projeto pelo ID.
 * Retorna null se não encontrado.
 */
export async function buscarProjeto(id: string): Promise<Projeto | null> {
  const ref = doc(db, COLECAO, id)
  const snap = await getDoc(ref)

  if (!snap.exists()) {
    return null
  }

  const data = snap.data()
  return {
    id: snap.id,
    nome: data.nome ?? "",
    sigla: data.sigla ?? "",
    cor: data.cor ?? "#008F95",
    criadoEm: data.criadoEm ?? null,
  }
}

/**
 * Cria um novo projeto no Firestore.
 * Retorna o ID gerado automaticamente.
 */
export async function criarProjeto(
  input: CriarProjetoInput
): Promise<string> {
  const docRef = await addDoc(collection(db, COLECAO), {
    nome: input.nome.trim(),
    sigla: input.sigla.trim().toUpperCase(),
    cor: input.cor,
    criadoEm: serverTimestamp(),
  })

  return docRef.id
}

/**
 * Atualiza um projeto existente.
 */
export async function atualizarProjeto(
  id: string,
  input: AtualizarProjetoInput
): Promise<void> {
  const ref = doc(db, COLECAO, id)
  await updateDoc(ref, {
    nome: input.nome.trim(),
    sigla: input.sigla.trim().toUpperCase(),
    cor: input.cor,
  })
}

/**
 * Deleta um projeto pelo ID.
 *
 * NOTA: este sistema não impede a deleção de projetos com UMs vinculadas.
 * Essa validação deve ser feita pela camada de UI antes de chamar essa função.
 */
export async function deletarProjeto(id: string): Promise<void> {
  const ref = doc(db, COLECAO, id)
  await deleteDoc(ref)
}