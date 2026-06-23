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
 * Origem da decisão de uma rota (13.11 — Alocação Manual).
 *
 * - "auto"            → 100% do algoritmo Húngaro, sem alteração humana
 * - "ajuste-pos-auto" → algoritmo sugeriu, usuário ajustou 1+ pares antes de confirmar
 * - "manual"          → reservado pra futura modalidade onde usuário monta do zero
 *
 * Decisão de design: aplicado por LOTE, não por par. Se qualquer par do lote
 * foi ajustado, todas as rotas do lote ganham "ajuste-pos-auto". Suficiente
 * pro caso de uso (badge no histórico) e simples de manter.
 */
export type OrigemDecisao = "auto" | "manual" | "ajuste-pos-auto"

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

  /**
   * Como esta rota foi decidida — 13.11 Alocação Manual.
   * Compartilhado por todas as rotas do mesmo lote.
   * Default em rotas antigas (pré-13.11): "auto".
   */
  origemDecisao: OrigemDecisao

  /**
   * ID da rota anterior que esta rota substituiu — 13.12 Re-otimização.
   * null quando a rota foi criada normalmente (não é uma re-otimização).
   */
  realocadaDe: string | null

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
 * Retorna o ponto destino de uma UM considerando status realocáveis:
 * Pendente, Agendado ou Atual — exclui Histórico.
 *
 * 13.12 Re-otimização: usado pra incluir pontos de técnicos com rotas ativas
 * no cálculo de re-otimização.
 */
export function obterDestinoRealocavelDaUM(
  pontos: Ponto[],
  projetoId: string,
  umNome: string
): Ponto | null {
  const STATUS_REALOCAVEIS = new Set(["Pendente", "Agendado", "Atual"])
  const candidatos = pontos.filter(
    (p) =>
      p.projetoId === projetoId &&
      p.umNome === umNome &&
      STATUS_REALOCAVEIS.has(p.status)
  )
  if (candidatos.length === 0) return null
  candidatos.sort((a, b) => {
    if (b.ciclo !== a.ciclo) return b.ciclo - a.ciclo
    return b.etapa - a.etapa
  })
  return candidatos[0]
}

/**
 * Retorna {umNome → ponto destino} para todas as UMs de um projeto que
 * têm ao menos um ponto realocável (Pendente, Agendado ou Atual).
 *
 * 13.12 Re-otimização: escopo mais amplo que obterDestinosPorUM.
 */
export function obterDestinosRealocaveisPorUM(
  pontos: Ponto[],
  projetoId: string
): Map<string, Ponto> {
  const umsDoProjeto = new Set(
    pontos.filter((p) => p.projetoId === projetoId).map((p) => p.umNome)
  )
  const resultado = new Map<string, Ponto>()
  for (const um of umsDoProjeto) {
    const destino = obterDestinoRealocavelDaUM(pontos, projetoId, um)
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
    // 13.11: fallback "auto" pra rotas antigas no banco que ainda não têm o campo
    origemDecisao: (data.origemDecisao as OrigemDecisao) ?? "auto",
    // 13.12: null pra rotas antigas que não passaram por re-otimização
    realocadaDe: (data.realocadaDe as string) ?? null,
    criadoEm: (data.criadoEm as Timestamp) ?? null,
    atualizadoEm: (data.atualizadoEm as Timestamp) ?? null,
  }
}

// ============================================================
// CONFIRMAÇÃO DE ALOCAÇÃO (cria rotas + atualiza pontos)
// ============================================================
 
/**
 * Payload de entrada para confirmar uma alocação.
 * Cada item é um par técnico → ponto que vai virar uma Rota persistida.
 */
export type ConfirmarAlocacaoInput = {
  loteId: string
  loteJustificativa: string
  /**
   * Como o lote foi formado (13.11).
   * Opcional pra compatibilidade com call sites antigos — quando omitido,
   * assume "auto" (vem do algoritmo sem ajuste manual).
   */
  origemDecisao?: OrigemDecisao
  alocacoes: Array<{
    tecnicoId: string
    tecnicoNome: string
    pontoId: string
    umNome: string
    projetoId: string
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
    metricas: Partial<Record<ModoTransporte, MetricaModo>>
    /** Modo que o usuário escolheu para essa alocação específica. */
    modoEscolhido: ModoTransporte
    /** 13.12: ID da rota anterior se esta substituiu uma rota ativa. */
    realocadaDe?: string | null
  }>
}
 
export type ConfirmarAlocacaoResultado = {
  rotasIds: string[]
  pontosAtualizados: string[]
}
 
/**
 * Confirma uma alocação inteira atomicamente:
 *   - Cria N documentos em /rotas com status="Confirmada"
 *   - Atualiza N documentos em /pontos: status="Agendado", tecnicoId, rotaId
 *
 * Tudo num único writeBatch. Se qualquer operação falhar, NADA é persistido —
 * mantém consistência: ou a alocação está inteira no banco, ou não está.
 *
 * O `modoPrincipal` salvo em cada Rota reflete o que o USUÁRIO escolheu
 * para aquele par específico (pode variar entre rotas do mesmo lote).
 *
 * O `origemDecisao` é compartilhado por todas as rotas do lote — se qualquer
 * par foi ajustado manualmente (13.11), o lote inteiro ganha "ajuste-pos-auto".
 *
 * @param input  Dados estruturados da alocação confirmada
 * @returns      IDs das rotas criadas e dos pontos atualizados
 */
export async function confirmarAlocacao(
  input: ConfirmarAlocacaoInput
): Promise<ConfirmarAlocacaoResultado> {
  if (input.alocacoes.length === 0) {
    return { rotasIds: [], pontosAtualizados: [] }
  }
 
  // Default "auto" se o call site não passar (compatibilidade)
  const origemDecisao: OrigemDecisao = input.origemDecisao ?? "auto"

  const batch = writeBatch(db)
  const rotasIds: string[] = []
  const pontosAtualizados: string[] = []
 
  input.alocacoes.forEach((aloc, indice) => {
    // 1. Pré-aloca a referência da rota (gera ID localmente sem ida ao server)
    const rotaRef = doc(collection(db, COLECAO))
    rotasIds.push(rotaRef.id)
 
    // 2. Set do documento da rota
    batch.set(rotaRef, {
      loteId: input.loteId,
      loteOrdem: indice + 1,
      loteJustificativa: input.loteJustificativa,
      tecnicoId: aloc.tecnicoId,
      tecnicoNome: aloc.tecnicoNome,
      pontoId: aloc.pontoId,
      umNome: aloc.umNome,
      projetoId: aloc.projetoId,
      origem: aloc.origem,
      destino: aloc.destino,
      metricas: aloc.metricas,
      modoPrincipal: aloc.modoEscolhido,
      status: "Confirmada" as StatusRota,
      origemDecisao,
      realocadaDe: aloc.realocadaDe ?? null,
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
    })
 
    // 3. Update do ponto correspondente
    const pontoRef = doc(db, "pontos", aloc.pontoId)
    batch.update(pontoRef, {
      status: STATUS_PONTO_AGENDADO,
      tecnicoId: aloc.tecnicoId,
      rotaId: rotaRef.id,
      atualizadoEm: serverTimestamp(),
    })
    pontosAtualizados.push(aloc.pontoId)
  })
 
  await batch.commit()
  return { rotasIds, pontosAtualizados }
}

// ============================================================
// RE-OTIMIZAÇÃO DE ALOCAÇÕES (13.12)
// ============================================================

/**
 * Payload de entrada para aplicar re-otimização inteligente.
 *
 * Cada item pode ser:
 * - Re-otimização: técnico já tinha rota ativa (rotaAntigaId + pontoAntigoId definidos)
 *   → cancela rota antiga, libera ponto antigo, cria nova rota com realocadaDe
 * - Nova alocação: técnico sem rota ativa (sem rotaAntigaId)
 *   → cria rota normalmente, como em confirmarAlocacao
 */
export type ReotimizacaoInput = {
  loteId: string
  loteJustificativa: string
  origemDecisao?: OrigemDecisao
  alocacoes: Array<{
    /** Rota ativa a cancelar (13.12: re-otimização). Omitir pra novas alocações. */
    rotaAntigaId?: string
    /** Ponto a liberar (Agendado → Pendente). Obrigatório quando rotaAntigaId está presente. */
    pontoAntigoId?: string
    tecnicoId: string
    tecnicoNome: string
    pontoId: string
    umNome: string
    projetoId: string
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
    metricas: Partial<Record<ModoTransporte, MetricaModo>>
    modoEscolhido: ModoTransporte
  }>
}

export type ReotimizacaoResultado = {
  rotasIds: string[]
  pontosAtualizados: string[]
  rotasCanceladas: number
  pontosLiberados: number
}

/**
 * Aplica re-otimização inteligente atomicamente (13.12).
 *
 * Num único writeBatch:
 *   - Cancela rotas ativas que serão substituídas (status → "Cancelada")
 *   - Libera pontos das rotas canceladas (status → "Pendente", remove tecnicoId/rotaId)
 *   - Cria novas rotas (status → "Confirmada", realocadaDe aponta pra rota antiga)
 *   - Agenda novos pontos (status → "Agendado", vincula tecnicoId/rotaId)
 *
 * Tudo atômico: ou tudo persiste, ou nada.
 */
export async function aplicarReotimizacao(
  input: ReotimizacaoInput
): Promise<ReotimizacaoResultado> {
  if (input.alocacoes.length === 0) {
    return { rotasIds: [], pontosAtualizados: [], rotasCanceladas: 0, pontosLiberados: 0 }
  }

  const origemDecisao: OrigemDecisao = input.origemDecisao ?? "auto"
  const batch = writeBatch(db)
  const rotasIds: string[] = []
  const pontosAtualizados: string[] = []
  let rotasCanceladas = 0
  let pontosLiberados = 0

  input.alocacoes.forEach((aloc, indice) => {
    // 1. Cancela rota antiga (se re-otimização)
    if (aloc.rotaAntigaId) {
      batch.update(doc(db, COLECAO, aloc.rotaAntigaId), {
        status: "Cancelada" as StatusRota,
        atualizadoEm: serverTimestamp(),
      })
      rotasCanceladas++
    }

    // 2. Libera ponto antigo (se re-otimização)
    if (aloc.pontoAntigoId) {
      batch.update(doc(db, "pontos", aloc.pontoAntigoId), {
        status: "Pendente",
        tecnicoId: null,
        rotaId: null,
        atualizadoEm: serverTimestamp(),
      })
      pontosLiberados++
    }

    // 3. Cria nova rota
    const rotaRef = doc(collection(db, COLECAO))
    rotasIds.push(rotaRef.id)
    batch.set(rotaRef, {
      loteId: input.loteId,
      loteOrdem: indice + 1,
      loteJustificativa: input.loteJustificativa,
      tecnicoId: aloc.tecnicoId,
      tecnicoNome: aloc.tecnicoNome,
      pontoId: aloc.pontoId,
      umNome: aloc.umNome,
      projetoId: aloc.projetoId,
      origem: aloc.origem,
      destino: aloc.destino,
      metricas: aloc.metricas,
      modoPrincipal: aloc.modoEscolhido,
      status: "Confirmada" as StatusRota,
      origemDecisao,
      realocadaDe: aloc.rotaAntigaId ?? null,
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
    })

    // 4. Agenda novo ponto
    const pontoRef = doc(db, "pontos", aloc.pontoId)
    batch.update(pontoRef, {
      status: STATUS_PONTO_AGENDADO,
      tecnicoId: aloc.tecnicoId,
      rotaId: rotaRef.id,
      atualizadoEm: serverTimestamp(),
    })
    pontosAtualizados.push(aloc.pontoId)
  })

  await batch.commit()
  return { rotasIds, pontosAtualizados, rotasCanceladas, pontosLiberados }
}