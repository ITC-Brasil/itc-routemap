import "server-only"

import { listarTodosPontos } from "@/lib/db/pontos"
import { listarRotasPorStatus } from "@/lib/db/rotas"
import { listarTecnicos } from "@/lib/db/tecnicos"
import { listarProjetos } from "@/lib/db/projetos"
import { obterDestinoDaUM, type ModoTransporte } from "@/lib/rotas-utils"
import { formatarIsoSaoPaulo } from "@/lib/dias-uteis"
import type { Ponto } from "@/lib/db/pontos"
import type { Rota } from "@/lib/db/rotas"

/**
 * TV3 · CAMPO · ALOCAÇÃO — fonte única do painel do HERMES.
 *
 * A página (app/hermes/painel-campo) e o endpoint JSON
 * (app/api/hermes/painel-campo) consomem esta função e nada mais. Painel e
 * JSON divergindo é bug que ninguém percebe, porque ninguém olha os dois ao
 * mesmo tempo.
 *
 * ESTE DADO É LOCALIZAÇÃO PLANEJADA, NÃO POSIÇÃO EM TEMPO REAL. O sistema sabe
 * onde a unidade deve estar nesta etapa, segundo o último lote confirmado; não
 * sabe onde ela está agora. Nenhuma fonte do RouteMap acompanha movimento — se
 * o painel na parede precisar disso, a origem do dado teria que ser outra.
 *
 * ESCOPO DOS PONTOS — diferente da tela de cálculo de propósito. Lá só entram
 * pontos "Pendente", porque o que se aloca é o que está livre. Aqui interessa o
 * estado atual do campo, e a unidade cujo ponto está "Agendado" é justamente a
 * que TEM técnico. "Histórico" nunca entra: é etapa encerrada.
 */

// ============================================================
// CONTRATO
// ============================================================

export type EstadoUnidade = "coberta" | "sem_tecnico"

export type TecnicoPainel = {
  nome: string
  iniciais: string
  cor: string
}

export type DeslocamentoPainel = {
  modo: ModoTransporte
  duracaoSeg: number
  distanciaMetros: number
}

export type UnidadePainel = {
  sigla: string
  projeto: string
  ra: string
  endereco: string
  ciclo: number
  etapa: number
  latitude: number | null
  longitude: number | null
  estado: EstadoUnidade
  /** null quando sem_tecnico. */
  tecnico: TecnicoPainel | null
  /** null quando sem_tecnico. */
  deslocamento: DeslocamentoPainel | null
  /** Quando sem_tecnico, desde quando. null nas cobertas. */
  desdeIso: string | null
}

export type TotaisPainel = {
  unidades: number
  cobertas: number
  semTecnico: number
  deslocamentoTotalSeg: number
  deslocamentoMedioSeg: number
}

export type PainelCampo = {
  geradoEm: string
  /** Âncora de chegada do lote mais recente. null quando o lote não tem. */
  ancoraChegada: string | null
  /** null quando não há nenhum lote confirmado. */
  loteConfirmadoEm: string | null
  totais: TotaisPainel
  unidades: UnidadePainel[]
  tecnicosSemUnidade: Array<{ nome: string; iniciais: string }>
}

// ============================================================
// CONSTANTES
// ============================================================

/**
 * Estados de ponto que representam a etapa CORRENTE de uma unidade.
 *
 * "Pendente" = etapa aberta, ninguém alocado ainda. "Agendado" = o app gravou
 * a confirmação da rota. Os dois descrevem o campo hoje; "Histórico" não.
 */
const STATUS_ETAPA_CORRENTE = ["Pendente", "Agendado"] as const

/** Cor neutra quando o técnico não tem cor de cadastro. */
const COR_TECNICO_PADRAO = "#008F95"

// ============================================================
// FUNÇÃO PÚBLICA
// ============================================================

export async function montarPainelCampo(): Promise<PainelCampo> {
  const [pontos, rotasConfirmadas, tecnicos, projetos] = await Promise.all([
    listarTodosPontos(),
    listarRotasPorStatus("Confirmada"),
    listarTecnicos(),
    listarProjetos(),
  ])

  const agora = new Date()
  const geradoEm = formatarIsoSaoPaulo(agora)

  const tecnicoPorId = new Map(tecnicos.map((t) => [t.id, t]))

  // Rota Confirmada indexada pelo ponto que ela atende. Quando mais de uma
  // rota aponta para o mesmo ponto — re-otimização confirmada em sequência —
  // vale a mais recente, que é a que está valendo em campo.
  const rotaPorPonto = new Map<string, Rota>()
  for (const rota of rotasConfirmadas) {
    const anterior = rotaPorPonto.get(rota.pontoId)
    if (!anterior || maisRecente(rota, anterior)) {
      rotaPorPonto.set(rota.pontoId, rota)
    }
  }

  // Uma unidade por (projeto, umNome), com o ponto da etapa corrente.
  const unidades: UnidadePainel[] = []
  for (const projeto of projetos) {
    const umsDoProjeto = new Set(
      pontos.filter((p) => p.projetoId === projeto.id).map((p) => p.umNome)
    )

    for (const umNome of umsDoProjeto) {
      const ponto = obterDestinoDaUM(
        pontos,
        projeto.id,
        umNome,
        STATUS_ETAPA_CORRENTE
      )
      if (!ponto) continue // só tem Histórico: etapa encerrada, fora do painel

      unidades.push(
        montarUnidade(ponto, projeto.sigla, rotaPorPonto.get(ponto.id), tecnicoPorId)
      )
    }
  }

  // Ordem estável e legível na parede: sigla do projeto, depois nome da UM.
  unidades.sort(
    (a, b) =>
      a.projeto.localeCompare(b.projeto) || a.sigla.localeCompare(b.sigla)
  )

  // Lote mais recente: define a âncora exibida e o carimbo de confirmação.
  const loteMaisRecente = obterLoteMaisRecente(rotasConfirmadas)

  const cobertas = unidades.filter((u) => u.estado === "coberta")
  const somaSeg = cobertas.reduce(
    (acc, u) => acc + (u.deslocamento?.duracaoSeg ?? 0),
    0
  )

  const tecnicosAlocados = new Set(
    rotasConfirmadas
      .filter((r) => rotaPorPonto.get(r.pontoId)?.id === r.id)
      .map((r) => r.tecnicoId)
  )

  return {
    geradoEm,
    ancoraChegada: loteMaisRecente?.metricas.ancoraIso ?? null,
    loteConfirmadoEm: loteMaisRecente?.criadoEm
      ? formatarIsoSaoPaulo(loteMaisRecente.criadoEm)
      : null,
    totais: {
      unidades: unidades.length,
      cobertas: cobertas.length,
      semTecnico: unidades.length - cobertas.length,
      deslocamentoTotalSeg: somaSeg,
      // Média sobre as COBERTAS, não sobre o total: incluir unidades sem
      // técnico no denominador puxaria o número para baixo e diria que a
      // operação melhorou quando na verdade alguém ficou descoberto.
      deslocamentoMedioSeg:
        cobertas.length > 0 ? Math.round(somaSeg / cobertas.length) : 0,
    },
    unidades,
    tecnicosSemUnidade: tecnicos
      .filter((t) => t.ativo !== false && !tecnicosAlocados.has(t.id))
      .map((t) => ({ nome: t.nome, iniciais: iniciaisDe(t.nome) }))
      .sort((a, b) => a.nome.localeCompare(b.nome)),
  }
}

// ============================================================
// HELPERS
// ============================================================

function montarUnidade(
  ponto: Ponto,
  projetoSigla: string,
  rota: Rota | undefined,
  tecnicoPorId: Map<string, { nome: string; cor: string }>
): UnidadePainel {
  const base = {
    sigla: ponto.umNome,
    projeto: projetoSigla,
    ra: ponto.raNome,
    endereco: ponto.endereco,
    ciclo: ponto.ciclo,
    etapa: ponto.etapa,
    latitude: ponto.latitude,
    longitude: ponto.longitude,
  }

  if (!rota) {
    return {
      ...base,
      estado: "sem_tecnico",
      tecnico: null,
      deslocamento: null,
      // Aproximação declarada: não existe histórico de transição de status no
      // banco, então o melhor marcador de "desde quando está descoberta" é a
      // última escrita no ponto — a sincronização que abriu a etapa. Se o
      // ponto nunca foi tocado depois da importação, cai na criação.
      desdeIso: formatarIsoOuNulo(ponto.atualizadoEm ?? ponto.criadoEm),
    }
  }

  // O nome vem do snapshot da rota, não do cadastro: o histórico tem que
  // sobreviver à edição ou exclusão do técnico. A cor, essa sim, vem do
  // cadastro — é atributo visual do presente, e não há snapshot dela.
  const cadastro = tecnicoPorId.get(rota.tecnicoId)
  const metrica = rota.metricas[rota.modoPrincipal]

  return {
    ...base,
    estado: "coberta",
    tecnico: {
      nome: rota.tecnicoNome,
      iniciais: iniciaisDe(rota.tecnicoNome),
      cor: cadastro?.cor ?? COR_TECNICO_PADRAO,
    },
    deslocamento: metrica
      ? {
          modo: rota.modoPrincipal,
          duracaoSeg: metrica.duracaoSegundos,
          distanciaMetros: metrica.distanciaMetros,
        }
      : null,
    desdeIso: null,
  }
}

/**
 * A rota Confirmada mais recente entre duas.
 *
 * `criadoEm` pode ser null em linha migrada; nesse caso a que tem data ganha,
 * e no empate total fica a primeira encontrada — determinístico porque
 * `listarRotasPorStatus` já devolve ordenado.
 */
function maisRecente(candidata: Rota, atual: Rota): boolean {
  const tc = candidata.criadoEm?.getTime() ?? 0
  const ta = atual.criadoEm?.getTime() ?? 0
  return tc > ta
}

/** A rota Confirmada mais recente carrega o lote que está valendo. */
function obterLoteMaisRecente(rotas: Rota[]): Rota | null {
  let escolhida: Rota | null = null
  for (const rota of rotas) {
    if (!escolhida || maisRecente(rota, escolhida)) escolhida = rota
  }
  return escolhida
}

function formatarIsoOuNulo(data: Date | null): string | null {
  return data ? formatarIsoSaoPaulo(data) : null
}

/** "José Frederico" → "JF". */
function iniciaisDe(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0] ?? "")
    .join("")
    .toUpperCase()
}
