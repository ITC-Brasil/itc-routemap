import "server-only"

import { prisma } from "@/lib/prisma"
import type { Rota as RotaRow, Prisma } from "@prisma/client"
import {
  STATUS_PONTO_AGENDADO,
  type MetricaModo,
  type ModoTransporte,
  type OrigemDecisao,
  type StatusRota,
} from "@/lib/rotas-utils"

// Tipos, constante e helpers puros são client-safe e vivem em
// lib/rotas-utils.ts. Re-exportados aqui por paridade de API com
// lib/firestore/rotas.ts — consumidores client devem importar direto
// de "@/lib/rotas-utils".
export {
  STATUS_PONTO_AGENDADO,
  gerarLoteId,
  obterDestinoDaUM,
  obterDestinosPorUM,
  obterDestinoRealocavelDaUM,
  obterDestinosRealocaveisPorUM,
} from "@/lib/rotas-utils"
export type {
  MetricaModo,
  ModoTransporte,
  OrigemDecisao,
  StatusRota,
} from "@/lib/rotas-utils"

/**
 * Rotas — CRUD e transações Prisma.
 *
 * NOTAS DE MIGRAÇÃO (vs lib/firestore/rotas.ts):
 * - `criadoEm`/`atualizadoEm` agora são `Date` em vez de `Timestamp`.
 * - `origem`/`destino` aninhados no domínio ↔ colunas achatadas no banco
 *   (origemEndereco, origemLatitude, ... destinoLongitude); mapRota
 *   reconstrói os objetos.
 * - `metricas` é coluna Json; escrita direta, leitura com cast tipado.
 * - writeBatch → prisma.$transaction interativa (timeout 15s). Sem limite
 *   de 500 operações.
 * - `tecnicoId`/`projetoId`/`pontoId` são strings SEM foreign key (decisão
 *   Opção A): o histórico sobrevive à deleção de técnico/projeto via
 *   snapshots, comportamento aprovado em produção.
 */

// ============================================================
// TIPOS
// ============================================================

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

  criadoEm: Date | null
  atualizadoEm: Date | null
}

/** Payload pra criar uma rota (sem campos auto-gerados pelo banco). */
export type RotaInput = Omit<Rota, "id" | "criadoEm" | "atualizadoEm">

// ============================================================
// CONSTANTES
// ============================================================

/** Timeout das transações interativas (lotes de até ~25 pares). */
const TX_TIMEOUT_MS = 15000

// ============================================================
// MAPEAMENTO
// ============================================================

/**
 * Converte uma linha do Prisma para o tipo de domínio `Rota`,
 * reconstruindo origem/destino aninhados a partir das colunas achatadas
 * e tipando a coluna Json de métricas.
 */
function mapRota(row: RotaRow): Rota {
  return {
    id: row.id,
    loteId: row.loteId,
    loteOrdem: row.loteOrdem,
    loteJustificativa: row.loteJustificativa,
    tecnicoId: row.tecnicoId,
    tecnicoNome: row.tecnicoNome,
    pontoId: row.pontoId,
    umNome: row.umNome,
    projetoId: row.projetoId,
    origem: {
      endereco: row.origemEndereco,
      latitude: row.origemLatitude,
      longitude: row.origemLongitude,
    },
    destino: {
      endereco: row.destinoEndereco,
      latitude: row.destinoLatitude,
      longitude: row.destinoLongitude,
    },
    metricas:
      (row.metricas as Partial<Record<ModoTransporte, MetricaModo>>) ?? {},
    modoPrincipal: row.modoPrincipal as ModoTransporte,
    status: row.status as StatusRota,
    origemDecisao: row.origemDecisao as OrigemDecisao,
    realocadaDe: row.realocadaDe,
    criadoEm: row.criadoEm,
    atualizadoEm: row.atualizadoEm,
  }
}

/** Converte um RotaInput (domínio) para as colunas achatadas do banco. */
function rotaInputParaColunas(input: RotaInput) {
  return {
    loteId: input.loteId,
    loteOrdem: input.loteOrdem,
    loteJustificativa: input.loteJustificativa,
    tecnicoId: input.tecnicoId,
    tecnicoNome: input.tecnicoNome,
    pontoId: input.pontoId,
    umNome: input.umNome,
    projetoId: input.projetoId,
    origemEndereco: input.origem.endereco,
    origemLatitude: input.origem.latitude,
    origemLongitude: input.origem.longitude,
    destinoEndereco: input.destino.endereco,
    destinoLatitude: input.destino.latitude,
    destinoLongitude: input.destino.longitude,
    metricas: input.metricas as Prisma.InputJsonValue,
    modoPrincipal: input.modoPrincipal,
    status: input.status,
    origemDecisao: input.origemDecisao,
    realocadaDe: input.realocadaDe,
  }
}

// ============================================================
// CRUD
// ============================================================

/**
 * Lista TODAS as rotas, ordenadas por criação decrescente.
 * Útil pra página de Histórico/Listagem.
 */
export async function listarRotas(): Promise<Rota[]> {
  const rows = await prisma.rota.findMany({ orderBy: { criadoEm: "desc" } })
  return rows.map(mapRota)
}

/**
 * Lista todas as rotas de um lote (uma alocação completa).
 * Ordenadas pela `loteOrdem` (mesmo critério usado na criação).
 */
export async function listarRotasPorLote(loteId: string): Promise<Rota[]> {
  const rows = await prisma.rota.findMany({
    where: { loteId },
    orderBy: { loteOrdem: "asc" },
  })
  return rows.map(mapRota)
}

/**
 * Lista rotas filtradas por status.
 */
export async function listarRotasPorStatus(
  status: StatusRota
): Promise<Rota[]> {
  const rows = await prisma.rota.findMany({
    where: { status },
    orderBy: { criadoEm: "desc" },
  })
  return rows.map(mapRota)
}

/**
 * Busca uma rota pelo ID.
 */
export async function buscarRota(id: string): Promise<Rota | null> {
  const row = await prisma.rota.findUnique({ where: { id } })
  return row ? mapRota(row) : null
}

/**
 * Cria várias rotas em uma única transação.
 *
 * Garante atomicidade: todas as rotas do lote são salvas juntas, ou
 * nenhuma é. Importante porque uma alocação só faz sentido inteira.
 *
 * Creates sequenciais (não createMany) para devolver os IDs na MESMA
 * ordem do input, como a versão Firestore fazia.
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

  return prisma.$transaction(
    async (tx) => {
      const ids: string[] = []
      for (const rota of rotas) {
        const row = await tx.rota.create({ data: rotaInputParaColunas(rota) })
        ids.push(row.id)
      }
      return ids
    },
    { timeout: TX_TIMEOUT_MS }
  )
}

/**
 * Atualiza o status de uma rota (Sugerida → Confirmada / Cancelada).
 */
export async function atualizarStatusRota(
  id: string,
  status: StatusRota
): Promise<void> {
  await prisma.rota.update({ where: { id }, data: { status } })
}

/**
 * Atualiza o status de TODAS as rotas de um lote.
 * Útil pra confirmar/cancelar uma alocação inteira de uma vez.
 * updateMany é um único statement atômico — elimina a janela de corrida
 * entre leitura e commit que a versão Firestore (read + batch) tinha.
 */
export async function atualizarStatusLote(
  loteId: string,
  status: StatusRota
): Promise<void> {
  await prisma.rota.updateMany({ where: { loteId }, data: { status } })
}

/**
 * Deleta todas as rotas de um lote.
 * Útil pra descartar uma sugestão que ainda não foi confirmada.
 */
export async function deletarLote(loteId: string): Promise<void> {
  await prisma.rota.deleteMany({ where: { loteId } })
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

/**
 * Mapa projetoId → sigla, para gravar `Rota.projetoSigla`.
 *
 * A sigla é derivada do Projeto em vez de vir no input: é atributo do projeto, e
 * pedi-la ao chamador só criaria oportunidade de divergência. Antes disso o campo
 * não era gravado em rota nenhuma e ficava com a string vazia do `@default` —
 * enquanto as rotas trazidas do Firestore pela migração vinham preenchidas,
 * deixando a coluna inconsistente entre os dois grupos.
 *
 * Roda FORA da transação: é leitura, e não precisa da consistência dela.
 */
async function buscarSiglasPorProjeto(
  projetoIds: string[]
): Promise<Map<string, string>> {
  const projetos = await prisma.projeto.findMany({
    where: { id: { in: [...new Set(projetoIds)] } },
    select: { id: true, sigla: true },
  })
  return new Map(projetos.map((p) => [p.id, p.sigla]))
}

export type ConfirmarAlocacaoResultado = {
  rotasIds: string[]
  pontosAtualizados: string[]
}

/**
 * Confirma uma alocação inteira atomicamente:
 *   - Cria N linhas em `rotas` com status="Confirmada"
 *   - Atualiza N linhas em `pontos`: status="Agendado", tecnicoId, rotaId
 *
 * Tudo numa única transação. Se qualquer operação falhar, NADA é
 * persistido — mantém consistência: ou a alocação está inteira no banco,
 * ou não está. Transação interativa porque o update do ponto depende do
 * id da rota recém-criada.
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

  const siglaPorProjeto = await buscarSiglasPorProjeto(
    input.alocacoes.map((a) => a.projetoId)
  )

  return prisma.$transaction(
    async (tx) => {
      const rotasIds: string[] = []
      const pontosAtualizados: string[] = []

      for (const [indice, aloc] of input.alocacoes.entries()) {
        // 1. Cria a rota (o id retornado vincula o ponto no passo 2)
        const rota = await tx.rota.create({
          data: {
            loteId: input.loteId,
            loteOrdem: indice + 1,
            loteJustificativa: input.loteJustificativa,
            tecnicoId: aloc.tecnicoId,
            tecnicoNome: aloc.tecnicoNome,
            pontoId: aloc.pontoId,
            umNome: aloc.umNome,
            projetoId: aloc.projetoId,
            projetoSigla: siglaPorProjeto.get(aloc.projetoId) ?? "",
            origemEndereco: aloc.origem.endereco,
            origemLatitude: aloc.origem.latitude,
            origemLongitude: aloc.origem.longitude,
            destinoEndereco: aloc.destino.endereco,
            destinoLatitude: aloc.destino.latitude,
            destinoLongitude: aloc.destino.longitude,
            metricas: aloc.metricas as Prisma.InputJsonValue,
            modoPrincipal: aloc.modoEscolhido,
            status: "Confirmada" satisfies StatusRota,
            origemDecisao,
            realocadaDe: aloc.realocadaDe ?? null,
          },
        })
        rotasIds.push(rota.id)

        // 2. Update do ponto correspondente
        await tx.ponto.update({
          where: { id: aloc.pontoId },
          data: {
            status: STATUS_PONTO_AGENDADO,
            tecnicoId: aloc.tecnicoId,
            rotaId: rota.id,
          },
        })
        pontosAtualizados.push(aloc.pontoId)
      }

      return { rotasIds, pontosAtualizados }
    },
    { timeout: TX_TIMEOUT_MS }
  )
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
 * Numa única transação, na mesma ordem da versão Firestore:
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

  const siglaPorProjeto = await buscarSiglasPorProjeto(
    input.alocacoes.map((a) => a.projetoId)
  )

  return prisma.$transaction(
    async (tx) => {
      const rotasIds: string[] = []
      const pontosAtualizados: string[] = []
      let rotasCanceladas = 0
      let pontosLiberados = 0

      for (const [indice, aloc] of input.alocacoes.entries()) {
        // 1. Cancela rota antiga (se re-otimização)
        if (aloc.rotaAntigaId) {
          await tx.rota.update({
            where: { id: aloc.rotaAntigaId },
            data: { status: "Cancelada" satisfies StatusRota },
          })
          rotasCanceladas++
        }

        // 2. Libera ponto antigo (se re-otimização)
        if (aloc.pontoAntigoId) {
          await tx.ponto.update({
            where: { id: aloc.pontoAntigoId },
            data: {
              status: "Pendente",
              tecnicoId: null,
              rotaId: null,
            },
          })
          pontosLiberados++
        }

        // 3. Cria nova rota
        const rota = await tx.rota.create({
          data: {
            loteId: input.loteId,
            loteOrdem: indice + 1,
            loteJustificativa: input.loteJustificativa,
            tecnicoId: aloc.tecnicoId,
            tecnicoNome: aloc.tecnicoNome,
            pontoId: aloc.pontoId,
            umNome: aloc.umNome,
            projetoId: aloc.projetoId,
            projetoSigla: siglaPorProjeto.get(aloc.projetoId) ?? "",
            origemEndereco: aloc.origem.endereco,
            origemLatitude: aloc.origem.latitude,
            origemLongitude: aloc.origem.longitude,
            destinoEndereco: aloc.destino.endereco,
            destinoLatitude: aloc.destino.latitude,
            destinoLongitude: aloc.destino.longitude,
            metricas: aloc.metricas as Prisma.InputJsonValue,
            modoPrincipal: aloc.modoEscolhido,
            status: "Confirmada" satisfies StatusRota,
            origemDecisao,
            realocadaDe: aloc.rotaAntigaId ?? null,
          },
        })
        rotasIds.push(rota.id)

        // 4. Agenda novo ponto
        await tx.ponto.update({
          where: { id: aloc.pontoId },
          data: {
            status: STATUS_PONTO_AGENDADO,
            tecnicoId: aloc.tecnicoId,
            rotaId: rota.id,
          },
        })
        pontosAtualizados.push(aloc.pontoId)
      }

      return { rotasIds, pontosAtualizados, rotasCanceladas, pontosLiberados }
    },
    { timeout: TX_TIMEOUT_MS }
  )
}
