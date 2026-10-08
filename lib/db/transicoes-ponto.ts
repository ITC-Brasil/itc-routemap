import "server-only"

import type { Prisma } from "@prisma/client"
import { STATUS_PONTO_AGENDADO } from "@/lib/rotas-utils"
import { planejarTecnicoAtual } from "@/lib/tecnico-atual"

/**
 * Efeitos de confirmar/cancelar sobre a UM — sempre DENTRO da transação que
 * agenda ou libera os pontos, para o Postgres nunca ficar num estado
 * intermediário que o NocoDB, o reenvio ou a cobertura leiam errado.
 *
 * Regras (as mesmas que a escrita de volta aplica no NocoDB):
 *   - UM que ganhou um ponto Agendado: o Agendado anterior vira Histórico.
 *   - UM que perdeu o Agendado num cancelamento: o anterior volta a Agendado.
 *   - ums.tecnicoAtualId reflete o técnico do ponto Agendado da UM (NULL se
 *     não houver).
 *
 * A ligação ponto → UM é por NOME (`pontos.umNome` = `ums.nome`), como em
 * todo o sistema (ver lib/cobertura.ts).
 */

type Tx = Prisma.TransactionClient

/** Ordena (ciclo, etapa) num número só. */
function ordem(ciclo: number, etapa: number): number {
  return ciclo * 10_000 + etapa
}

const chaveUm = (p: { projetoId: string; umNome: string }) =>
  `${p.projetoId}|${p.umNome}`

/**
 * O ponto Agendado anterior de cada UM que acabou de ganhar um ponto vira
 * Histórico. `tecnicoId`/`rotaId` ficam: é o registro de quem esteve lá.
 *
 * @param novosIds Pontos recém-agendados (já com status Agendado).
 * @returns ids dos pontos rebaixados
 */
export async function rebaixarAnterioresDaUm(
  tx: Tx,
  novosIds: string[]
): Promise<string[]> {
  if (novosIds.length === 0) return []

  const novos = await tx.ponto.findMany({
    where: { id: { in: novosIds } },
    select: { projetoId: true, umNome: true },
  })
  const ums = new Map(novos.map((p) => [chaveUm(p), p]))

  const rebaixados: string[] = []
  for (const um of ums.values()) {
    const anteriores = await tx.ponto.findMany({
      where: {
        projetoId: um.projetoId,
        umNome: um.umNome,
        status: STATUS_PONTO_AGENDADO,
        id: { notIn: novosIds },
      },
      select: { id: true },
    })
    if (anteriores.length === 0) continue
    const ids = anteriores.map((p) => p.id)
    await tx.ponto.updateMany({
      where: { id: { in: ids } },
      data: { status: "Histórico" },
    })
    rebaixados.push(...ids)
  }
  return rebaixados
}

/**
 * Desfaz o rebaixamento num cancelamento: para cada UM que ficou SEM ponto
 * Agendado, o anterior volta a Agendado. O anterior é o Histórico de maior
 * (ciclo, etapa) antes do ponto liberado — a mesma regra que a escrita de
 * volta usa no NocoDB.
 *
 * @param liberadosIds Pontos que acabaram de voltar a Pendente.
 * @returns ids dos pontos restaurados
 */
export async function restaurarAnterioresDaUm(
  tx: Tx,
  liberadosIds: string[]
): Promise<string[]> {
  if (liberadosIds.length === 0) return []

  const liberados = await tx.ponto.findMany({
    where: { id: { in: liberadosIds } },
    select: { projetoId: true, umNome: true, ciclo: true, etapa: true },
  })
  const limitePorUm = new Map<string, { projetoId: string; umNome: string; limite: number }>()
  for (const p of liberados) {
    const atual = limitePorUm.get(chaveUm(p))
    const o = ordem(p.ciclo, p.etapa)
    if (!atual || o < atual.limite) {
      limitePorUm.set(chaveUm(p), { projetoId: p.projetoId, umNome: p.umNome, limite: o })
    }
  }

  const restaurados: string[] = []
  for (const um of limitePorUm.values()) {
    const aindaAgendados = await tx.ponto.count({
      where: { projetoId: um.projetoId, umNome: um.umNome, status: STATUS_PONTO_AGENDADO },
    })
    if (aindaAgendados > 0) continue

    const historicos = await tx.ponto.findMany({
      where: { projetoId: um.projetoId, umNome: um.umNome, status: "Histórico" },
      select: { id: true, ciclo: true, etapa: true },
    })
    const anterior = historicos
      .filter((p) => ordem(p.ciclo, p.etapa) < um.limite)
      .sort((a, b) => ordem(b.ciclo, b.etapa) - ordem(a.ciclo, a.etapa))[0]
    if (!anterior) continue

    await tx.ponto.update({
      where: { id: anterior.id },
      data: { status: STATUS_PONTO_AGENDADO },
    })
    restaurados.push(anterior.id)
  }
  return restaurados
}

/**
 * Recalcula `ums.tecnicoAtualId` das UMs informadas a partir do ponto
 * Agendado de cada uma, respeitando o índice único: zera todas as afetadas
 * antes de gravar os novos valores (ver lib/tecnico-atual.ts).
 *
 * Lança erro — e a transação inteira volta — se uma UM afetada tiver mais de
 * um ponto Agendado, ou se o resultado puser um técnico em duas UMs.
 */
export async function sincronizarTecnicoAtualDasUms(
  tx: Tx,
  umNomes: string[]
): Promise<void> {
  const nomes = Array.from(new Set(umNomes))
  if (nomes.length === 0) return

  const [ums, agendados, tecnicos] = await Promise.all([
    tx.um.findMany({ select: { id: true, nome: true, tecnicoAtualId: true } }),
    tx.ponto.findMany({
      where: { umNome: { in: nomes }, status: STATUS_PONTO_AGENDADO },
      select: { umNome: true, tecnicoId: true },
    }),
    tx.tecnico.findMany({ select: { id: true, nome: true } }),
  ])
  const nomeTecnico = new Map(tecnicos.map((t) => [t.id, t.nome]))

  const alvos = ums
    .filter((u) => nomes.includes(u.nome))
    .map((u) => {
      const daUm = agendados.filter((p) => p.umNome === u.nome)
      if (daUm.length > 1) {
        throw new Error(
          `${u.nome} ficaria com ${daUm.length} pontos Agendado; o técnico atual ` +
            "da UM é ambíguo. Corrija o status dos pontos antes de continuar."
        )
      }
      return { umId: u.id, tecnicoId: daUm[0]?.tecnicoId ?? null }
    })

  const plano = planejarTecnicoAtual(
    ums.map((u) => ({ umId: u.id, umNome: u.nome, tecnicoAtualId: u.tecnicoAtualId })),
    alvos,
    (id) => nomeTecnico.get(id) ?? id
  )

  for (const op of plano) {
    await tx.um.update({
      where: { id: op.umId },
      data: { tecnicoAtualId: op.tecnicoAtualId },
    })
  }
}
