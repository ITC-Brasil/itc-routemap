import "server-only"

import { prisma } from "@/lib/prisma"
import { calcularHashPonto } from "@/lib/db/pontos"
import {
  atualizarLocalidades,
  listarLocalidadesDasUms,
  type AtualizacaoLocalidade,
  type LinhaLocalidade,
} from "@/lib/nocodb"
import { STATUS_PONTO_AGENDADO } from "@/lib/rotas-utils"

/**
 * Escrita de volta no NocoDB — o RouteMap grava Tecnico + Status depois de
 * confirmar, re-otimizar ou cancelar um lote.
 *
 * O Postgres é a verdade. Esta camada roda DEPOIS da transação e projeta no
 * NocoDB o estado final dos pontos afetados:
 *
 *   ponto Agendado  → Status "Atual",    Tecnico = nome do técnico vinculado
 *   ponto Pendente  → Status "Pendente", Tecnico vazio
 *
 * Mais o efeito na UM:
 *   - UM que ganhou um "Atual": qualquer outro "Atual" dela vira "Histórico".
 *   - UM que perdeu o "Atual" (cancelamento): o anterior volta a "Atual".
 *
 * Por gravar ESTADO e não delta, a mesma função serve para o reenvio: rodar de
 * novo sobre os mesmos pontos chega ao mesmo NocoDB.
 *
 * Falha não reverte o Postgres — a alocação confirmada é real, o que atrasou
 * foi o espelho. Os pontos afetados ficam com `nocodbPendente = true`, a tela
 * avisa e oferece "Reenviar ao NocoDB". Enquanto pendente, a sync não aplica a
 * linha do NocoDB sobre o ponto (desfaria a alocação).
 */

// ============================================================
// TIPOS
// ============================================================

export type ResultadoEscritaNocodb =
  | { ok: true; linhasGravadas: number }
  | { ok: false; erro: string; pontosPendentes: number }

type Opcoes = {
  /**
   * Para UM que ficou sem "Atual" (o ponto dela voltou a Pendente), devolve o
   * "Atual" ao ponto anterior. É o desfazer do cancelamento. Na re-otimização
   * fica desligado: o ponto liberado volta a Pendente e nada mais muda.
   */
  restaurarAnterior: boolean
}

// ============================================================
// ESCRITA
// ============================================================

/**
 * Projeta no NocoDB o estado atual (Postgres) dos pontos informados.
 *
 * Também grava o técnico em `tecnicoNomeHistorico` e recalcula o hash, para a
 * sync seguinte ler a mesma linha do NocoDB e não ver divergência.
 */
export async function escreverPontosNoNocodb(
  pontoIds: string[],
  opcoes: Opcoes
): Promise<ResultadoEscritaNocodb> {
  const ids = Array.from(new Set(pontoIds))
  if (ids.length === 0) return { ok: true, linhasGravadas: 0 }

  try {
    const pontos = await prisma.ponto.findMany({ where: { id: { in: ids } } })
    const tecnicos = await prisma.tecnico.findMany({
      where: {
        id: { in: pontos.map((p) => p.tecnicoId).filter((t): t is string => !!t) },
      },
      select: { id: true, nome: true },
    })
    const nomeTecnico = new Map(tecnicos.map((t) => [t.id, t.nome]))

    // 1. Postgres: técnico no texto histórico + hash. Vale mesmo se o NocoDB
    // falhar depois — é o estado do Postgres, não do espelho.
    await prisma.$transaction(
      pontos
        .filter((p) => p.status === STATUS_PONTO_AGENDADO || p.status === "Pendente")
        .map((p) => {
          const tecnicoNomeHistorico =
            p.status === STATUS_PONTO_AGENDADO
              ? (nomeTecnico.get(p.tecnicoId ?? "") ?? p.tecnicoNomeHistorico)
              : ""
          return prisma.ponto.update({
            where: { id: p.id },
            data: {
              tecnicoNomeHistorico,
              hashMd5: calcularHashPonto({
                projetoId: p.projetoId,
                linhaOrigem: p.linhaOrigem,
                nocodbId: p.nocodbId,
                ciclo: p.ciclo,
                etapa: p.etapa,
                tecnicoNomeHistorico,
                umNome: p.umNome,
                raNome: p.raNome,
                uf: p.uf,
                plusCode: p.plusCode ?? "",
                endereco: p.endereco,
                referencia: p.referencia ?? "",
                linkMaps: p.linkMaps,
                latitude: p.latitude,
                longitude: p.longitude,
                status: p.status,
              }),
            },
          })
        })
    )

    // 2. Ponto sem nocodbId não tem linha para onde ir. Não é silencioso:
    // vira pendente e o reenvio funciona depois que a sync vincular o id.
    const semVinculo = pontos.filter((p) => p.nocodbId === null)
    if (semVinculo.length > 0) {
      throw new Error(
        `${semVinculo.length} ponto(s) sem vínculo com o NocoDB ` +
          `(${semVinculo.map((p) => `${p.umNome} C${p.ciclo}E${p.etapa}`).join(", ")}). ` +
          "Rode Atualizar Pontos e depois reenvie."
      )
    }

    // 3. Estado final de cada linha. Map por Id: a mesma linha não recebe
    // duas instruções, e a do ponto afetado prevalece sobre efeitos na UM.
    const atualizacoes = new Map<number, AtualizacaoLocalidade>()
    for (const p of pontos) {
      if (p.status === STATUS_PONTO_AGENDADO) {
        const nome = nomeTecnico.get(p.tecnicoId ?? "")
        if (!nome) {
          throw new Error(
            `Ponto ${p.umNome} C${p.ciclo}E${p.etapa} está Agendado sem técnico vinculado.`
          )
        }
        atualizacoes.set(p.nocodbId!, { Id: p.nocodbId!, Status: "Atual", Tecnico: nome })
      } else if (p.status === "Pendente") {
        atualizacoes.set(p.nocodbId!, { Id: p.nocodbId!, Status: "Pendente", Tecnico: null })
      }
    }

    // 4. Efeito na UM, lido do NocoDB
    const ums = Array.from(new Set(pontos.map((p) => p.umNome)))
    const linhasDasUms = await listarLocalidadesDasUms(ums)
    const linhasPorUm = new Map<string, LinhaLocalidade[]>()
    for (const l of linhasDasUms) {
      if (!l.UM) continue
      const lista = linhasPorUm.get(l.UM) ?? []
      lista.push(l)
      linhasPorUm.set(l.UM, lista)
    }

    for (const um of ums) {
      const linhas = linhasPorUm.get(um) ?? []
      const statusFinal = (l: LinhaLocalidade) => atualizacoes.get(l.Id)?.Status ?? l.Status
      const ganhouAtual = pontos.some(
        (p) => p.umNome === um && p.status === STATUS_PONTO_AGENDADO
      )

      if (ganhouAtual) {
        // O "Atual" anterior da UM vira Histórico.
        for (const l of linhas) {
          if (!atualizacoes.has(l.Id) && l.Status === "Atual") {
            atualizacoes.set(l.Id, { Id: l.Id, Status: "Histórico" })
          }
        }
        continue
      }

      if (!opcoes.restaurarAnterior) continue
      if (linhas.some((l) => statusFinal(l) === "Atual")) continue

      // UM ficou sem "Atual": o anterior é o Histórico de maior (ciclo,
      // etapa) antes do ponto liberado — o que era "Atual" até a confirmação
      // marcar o liberado. O técnico dele não foi tocado na confirmação.
      const liberados = pontos.filter((p) => p.umNome === um && p.status === "Pendente")
      if (liberados.length === 0) continue
      const limite = Math.min(...liberados.map((p) => ordem(p.ciclo, p.etapa)))
      const anterior = linhas
        .filter(
          (l) =>
            !atualizacoes.has(l.Id) &&
            l.Status === "Histórico" &&
            ordem(l.Ciclo ?? 0, l.Etapa ?? 0) < limite
        )
        .sort((a, b) => ordem(b.Ciclo ?? 0, b.Etapa ?? 0) - ordem(a.Ciclo ?? 0, a.Etapa ?? 0))[0]
      if (anterior) {
        atualizacoes.set(anterior.Id, { Id: anterior.Id, Status: "Atual" })
      }
    }

    // 5. Grava
    await atualizarLocalidades(Array.from(atualizacoes.values()))

    await prisma.ponto.updateMany({
      where: { id: { in: ids } },
      data: { nocodbPendente: false },
    })
    return { ok: true, linhasGravadas: atualizacoes.size }
  } catch (err) {
    const erro = err instanceof Error ? err.message : String(err)
    console.error("Escrita no NocoDB falhou; pontos marcados como pendentes:", erro)
    // Se até marcar pendente falhar, a exceção sobe: a tela mostra erro em
    // vez de fingir que deu certo.
    await prisma.ponto.updateMany({
      where: { id: { in: ids } },
      data: { nocodbPendente: true },
    })
    return { ok: false, erro, pontosPendentes: ids.length }
  }
}

/** Quantos pontos aguardam reenvio ao NocoDB. */
export async function contarPontosNocodbPendentes(): Promise<number> {
  return prisma.ponto.count({ where: { nocodbPendente: true } })
}

/**
 * Reprocessa todos os pontos pendentes. Restaura o anterior de UM sem "Atual"
 * porque o pendente pode ter vindo de um cancelamento; quando veio de uma
 * re-otimização, a UM liberada em geral ganhou outro ponto no mesmo lote e
 * a restauração não se aplica.
 */
export async function reenviarPontosNocodbPendentes(): Promise<ResultadoEscritaNocodb> {
  const pendentes = await prisma.ponto.findMany({
    where: { nocodbPendente: true },
    select: { id: true },
  })
  return escreverPontosNoNocodb(
    pendentes.map((p) => p.id),
    { restaurarAnterior: true }
  )
}

function ordem(ciclo: number, etapa: number): number {
  return ciclo * 10_000 + etapa
}
