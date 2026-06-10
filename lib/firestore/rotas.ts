import {
  collection,
  doc,
  updateDoc,
  getDocs,
  getDoc,
  query,
  where,
  writeBatch,
  orderBy,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore"
import { db } from "@/lib/firebase"
import type { Ponto } from "./pontos"

// ============================================================
// TIPOS
// ============================================================

/**
 * Modos de transporte suportados pelo Google Routes API.
 *
 * - DRIVE / TWO_WHEELER / WALK / BICYCLE: suportados pelo Compute Route Matrix
 * - TRANSIT (transporte público): SÓ no Compute Routes (single), precisa
 *   ser chamado um por par origem→destino, mais custoso
 */
export type ModoTransporte =
  | "DRIVE"
  | "TWO_WHEELER"
  | "WALK"
  | "BICYCLE"
  | "TRANSIT"

/** Métricas de deslocamento de um único modo de transporte. */
export type MetricaModo = {
  distanciaMetros: number
  duracaoSegundos: number
  observacao?: string // ex: "Sem rota viável" / "Inclui pedágio"
}

/** Ciclo de vida de uma rota. */
export type StatusRota = "Sugerida" | "Confirmada" | "Cancelada"

/**
 * Rota — um par técnico → ponto resultado de uma alocação inteligente.
 *
 * Várias rotas que compartilham o mesmo `loteId` formam uma "alocação" —
 * o conjunto calculado num único clique de "Calcular Alocação Ótima".
 *
 * Snapshots de nome/endereço são guardados aqui pra preservar histórico
 * mesmo que o técnico mude de endereço ou o ponto seja editado depois.
 */
export type Rota = {
  id: string

  // === Lote (agrupamento) ===
  /** Identificador comum a todas as rotas calculadas juntas. */
  loteId: string
  /** Ordem de exibição dentro do lote (1, 2, 3...). */
  loteOrdem: number
  /** Texto do Gemini explicando a alocação (compartilhado pelas N rotas). */
  loteJustificativa: string

  // === Par técnico → ponto ===
  tecnicoId: string
  tecnicoNome: string // snapshot
  pontoId: string
  umNome: string // snapshot
  projetoId: string

  // === Endereços (snapshot pra histórico) ===
  origem: {
    endereco: string
    latitude: number
    longitude: number
  }
  destino: {
    endereco: string
    latitude: number
    longitude: number
  }

  // === Métricas de deslocamento ===
  /** Dicionário aberto: só preenche os modos que foram calculados. */
  metricas: Partial<Record<ModoTransporte, MetricaModo>>
  /** Modo que o algoritmo usou pra otimizar (geralmente DRIVE). */
  modoPrincipal: ModoTransporte

  // === Ciclo de vida ===
  status: StatusRota

  criadoEm: Timestamp | null
  atualizadoEm: Timestamp | null
}

/** Payload pra criar uma rota (sem campos auto-gerados pelo Firestore). */
export type RotaInput = Omit<Rota, "id" | "criadoEm" | "atualizadoEm">

// ============================================================
// CONSTANTES
// ============================================================

const COLECAO = "rotas"

/**
 * Status "Agendado" no `Ponto`: indica que ele está vinculado a uma rota
 * Confirmada. Quando uma nova etapa começa (manual ou via sync), o ponto
 * transiciona pra "Histórico".
 */
export const STATUS_PONTO_AGENDADO = "Agendado"

// ============================================================
// HELPERS DE NEGÓCIO
// ============================================================

/**
 * Identifica o destino de uma UM para uma rota de alocação.
 *
 * Regra de negócio (definida com o cliente em 09/06/2026):
 * - Pega todos os pontos da UM com status "Pendente"
 * - Retorna o de MAIOR (ciclo, etapa) — o mais recente importado
 *   da planilha, ainda sem técnico atribuído
 * - Se a UM não tem Pendente, retorna null (UM fica fora do cálculo)
 *
 * @param pontos     Lista completa de pontos
 * @param projetoId  ID do projeto-alvo
 * @param umNome     Nome da UM (ex: "BSBIA01")
 */
export function obterDestinoDaUM(
  pontos: Ponto[],
  projetoId: string,
  umNome: string
): Ponto | null {
  const candidatos = pontos.filter(
    (p) =>
      p.projetoId === projetoId &&
      p.umNome === umNome &&
      p.status === "Pendente"
  )

  if (candidatos.length === 0) return null

  // Ordena (ciclo desc, etapa desc) e pega o primeiro
  candidatos.sort((a, b) => {
    if (b.ciclo !== a.ciclo) return b.ciclo - a.ciclo
    return b.etapa - a.etapa
  })

  return candidatos[0]
}

/**
 * Retorna {umNome → ponto destino} para todas as UMs de um projeto que
 * estão aptas ao cálculo (têm pelo menos um Pendente).
 *
 * Útil pra montar a UI de seleção: lista de UMs com seu destino atual visível.
 */
export function obterDestinosPorUM(
  pontos: Ponto[],
  projetoId: string
): Map<string, Ponto> {
  const umsDoProjeto = new Set(
    pontos.filter((p) => p.projetoId === projetoId).map((p) => p.umNome)
  )

  const resultado = new Map<string, Ponto>()
  for (const um of umsDoProjeto) {
    const destino = obterDestinoDaUM(pontos, projetoId, um)
    if (destino) resultado.set(um, destino)
  }
  return resultado
}

/**
 * Gera um ID de lote (UUID v4).
 * Disponível em browsers modernos e Node 14.17+.
 */
export function gerarLoteId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback (improvável no nosso ambiente, mas safe)
  return (
    Math.random().toString(36).slice(2) + Date.now().toString(36)
  )
}

// ============================================================
// CRUD
// ============================================================

/**
 * Lista TODAS as rotas, ordenadas por criação decrescente.
 * Útil pra página de Histórico/Listagem.
 */
export async function listarRotas(): Promise<Rota[]> {
  const q = query(collection(db, COLECAO), orderBy("criadoEm", "desc"))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => mapearRota(d.id, d.data()))
}

/**
 * Lista todas as rotas de um lote (uma alocação completa).
 * Ordenadas pela `loteOrdem` (mesmo critério usado na criação).
 */
export async function listarRotasPorLote(loteId: string): Promise<Rota[]> {
  const q = query(
    collection(db, COLECAO),
    where("loteId", "==", loteId),
    orderBy("loteOrdem", "asc")
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => mapearRota(d.id, d.data()))
}

/**
 * Lista rotas filtradas por status.
 */
export async function listarRotasPorStatus(
  status: StatusRota
): Promise<Rota[]> {
  const q = query(
    collection(db, COLECAO),
    where("status", "==", status),
    orderBy("criadoEm", "desc")
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => mapearRota(d.id, d.data()))
}

/**
 * Busca uma rota pelo ID.
 */
export async function buscarRota(id: string): Promise<Rota | null> {
  const ref = doc(db, COLECAO, id)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  return mapearRota(snap.id, snap.data())
}

/**
 * Cria várias rotas em uma única transação (writeBatch).
 *
 * Garante atomicidade: todas as rotas do lote são salvas juntas, ou
 * nenhuma é. Importante porque uma alocação só faz sentido inteira.
 *
 * @param rotas Lista de RotaInput pra persistir. Todas devem ter o MESMO loteId.
 * @returns Array de IDs das rotas criadas (na mesma ordem do input).
 */
export async function criarRotasEmLote(
  rotas: RotaInput[]
): Promise<string[]> {
  if (rotas.length === 0) return []

  const loteId = rotas[0].loteId
  if (!rotas.every((r) => r.loteId === loteId)) {
    throw new Error(
      "Todas as rotas de um batch devem compartilhar o mesmo loteId."
    )
  }

  const batch = writeBatch(db)
  const ids: string[] = []

  for (const rota of rotas) {
    const ref = doc(collection(db, COLECAO))
    batch.set(ref, {
      ...rota,
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
    })
    ids.push(ref.id)
  }

  await batch.commit()
  return ids
}

/**
 * Atualiza o status de uma rota (Sugerida → Confirmada / Cancelada).
 */
export async function atualizarStatusRota(
  id: string,
  status: StatusRota
): Promise<void> {
  const ref = doc(db, COLECAO, id)
  await updateDoc(ref, {
    status,
    atualizadoEm: serverTimestamp(),
  })
}

/**
 * Atualiza o status de TODAS as rotas de um lote.
 * Útil pra confirmar/cancelar uma alocação inteira de uma vez.
 */
export async function atualizarStatusLote(
  loteId: string,
  status: StatusRota
): Promise<void> {
  const rotas = await listarRotasPorLote(loteId)
  if (rotas.length === 0) return

  const batch = writeBatch(db)
  for (const r of rotas) {
    batch.update(doc(db, COLECAO, r.id), {
      status,
      atualizadoEm: serverTimestamp(),
    })
  }
  await batch.commit()
}

/**
 * Deleta todas as rotas de um lote.
 * Útil pra descartar uma sugestão que ainda não foi confirmada.
 */
export async function deletarLote(loteId: string): Promise<void> {
  const rotas = await listarRotasPorLote(loteId)
  if (rotas.length === 0) return

  const batch = writeBatch(db)
  for (const r of rotas) {
    batch.delete(doc(db, COLECAO, r.id))
  }
  await batch.commit()
}

// ============================================================
// HELPERS PRIVADOS
// ============================================================

function mapearRota(id: string, data: Record<string, unknown>): Rota {
  return {
    id,
    loteId: (data.loteId as string) ?? "",
    loteOrdem: (data.loteOrdem as number) ?? 0,
    loteJustificativa: (data.loteJustificativa as string) ?? "",
    tecnicoId: (data.tecnicoId as string) ?? "",
    tecnicoNome: (data.tecnicoNome as string) ?? "",
    pontoId: (data.pontoId as string) ?? "",
    umNome: (data.umNome as string) ?? "",
    projetoId: (data.projetoId as string) ?? "",
    origem: (data.origem as Rota["origem"]) ?? {
      endereco: "",
      latitude: 0,
      longitude: 0,
    },
    destino: (data.destino as Rota["destino"]) ?? {
      endereco: "",
      latitude: 0,
      longitude: 0,
    },
    metricas: (data.metricas as Rota["metricas"]) ?? {},
    modoPrincipal: (data.modoPrincipal as ModoTransporte) ?? "DRIVE",
    status: (data.status as StatusRota) ?? "Sugerida",
    criadoEm: (data.criadoEm as Timestamp) ?? null,
    atualizadoEm: (data.atualizadoEm as Timestamp) ?? null,
  }
}