"use client"

// ============================================================
// SELETOR DE MODO — HISTÓRICO
//
// Irmão do SeletorModo de resultado-alocacao.tsx, com duas
// diferenças que justificam existir separado:
//
// 1. Distingue a PROCEDÊNCIA do número. No histórico, um tempo
//    pode vir do snapshot gravado na confirmação (o tempo real
//    daquele dia) ou de uma consulta feita agora (o tempo de
//    hoje). São coisas diferentes e não podem ter a mesma cara.
// 2. Não suprime TRANSIT. Lá, `m !== "TRANSIT"` fazia sentido
//    porque a matriz nunca traz transporte público. Aqui ele
//    pode estar persistido em `rota.metricas`.
//
// Compartilha MODOS_SELECIONAVEIS, IconeModo e nomeAmigavelModo
// com a tela de cálculo — nada de constante duplicada.
// ============================================================

import { MODOS_SELECIONAVEIS, IconeModo } from "@/lib/modos-transporte"
import { rotularChegadaAncora } from "@/lib/dias-uteis"
import type { ModoTransporte, MetricaModo } from "@/lib/rotas-utils"
import {
  nomeAmigavelModo,
  formatarDuracao,
  formatarDistancia,
} from "./historico-formatters"

// ============================================================
// Estado de um modo no seletor
// ============================================================

export type EstadoModo =
  /** Número gravado na confirmação do lote — é o tempo real daquele dia. */
  | { tipo: "snapshot"; duracaoSeg: number; distanciaMetros: number | null }
  /**
   * Número buscado na API nesta sessão. É o tempo de hoje — exceto quando
   * `ancoraIso` bate com a âncora do snapshot: aí a consulta mediu a MESMA
   * janela do cálculo e o número é comparável. Fora de TRANSIT é `null`.
   */
  | {
      tipo: "consultado"
      duracaoSeg: number
      distanciaMetros: number | null
      ancoraIso: string | null
    }
  /** Consulta em andamento. */
  | { tipo: "carregando" }
  /** API respondeu que não há rota possível neste modo. */
  | { tipo: "indisponivel"; mensagem: string }
  /** Sem dado no snapshot e ainda não consultado — clicar dispara a busca. */
  | { tipo: "ausente" }

/**
 * Forma mínima da entrada de cache que este componente precisa.
 * Compatível por estrutura com o RotaCacheEntry da página — não
 * importe o tipo de lá para não criar dependência circular.
 */
type EntradaCache =
  | { estado: "carregando" }
  | {
      estado: "ok"
      duracaoSegundos: number
      distanciaMetros: number
      ancoraIso?: string | null
    }
  | { estado: "erro"; mensagem: string }

/**
 * Monta o estado de todos os modos de uma rota.
 *
 * Precedência: o cache (dado consultado agora) ganha do snapshot,
 * porque quando o usuário acabou de consultar ele espera ver o
 * resultado da consulta. A procedência é marcada em `tipo`.
 *
 * EXCEÇÃO — o modo oficial do lote. Ali o snapshot ganha sempre, mesmo
 * havendo consulta em cache. "Ver trajeto" busca a polyline do modo
 * oficial e traz junto a duração de hoje; sem esta exceção, abrir o
 * traçado trocaria silenciosamente o tempo registrado no lote pelo tempo
 * com o trânsito de agora — e o delta da simulação passaria a subtrair
 * duas épocas diferentes. A tela existe para dizer quanto levou.
 */
export function montarEstadosDosModos(
  metricas: Partial<Record<ModoTransporte, MetricaModo>>,
  obterCache: (modo: ModoTransporte) => EntradaCache | undefined,
  modoOficial: ModoTransporte,
): Record<string, EstadoModo> {
  const estados: Record<string, EstadoModo> = {}

  for (const modo of MODOS_SELECIONAVEIS) {
    const snapshotOficial = modo === modoOficial ? metricas[modo] : undefined
    if (snapshotOficial) {
      estados[modo] = {
        tipo: "snapshot",
        duracaoSeg: snapshotOficial.duracaoSegundos,
        distanciaMetros: snapshotOficial.distanciaMetros,
      }
      continue
    }

    const cache = obterCache(modo)

    if (cache?.estado === "carregando") {
      estados[modo] = { tipo: "carregando" }
      continue
    }
    if (cache?.estado === "ok") {
      estados[modo] = {
        tipo: "consultado",
        duracaoSeg: cache.duracaoSegundos,
        distanciaMetros: cache.distanciaMetros,
        ancoraIso: cache.ancoraIso ?? null,
      }
      continue
    }
    if (cache?.estado === "erro") {
      estados[modo] = { tipo: "indisponivel", mensagem: cache.mensagem }
      continue
    }

    const snapshot = metricas[modo]
    estados[modo] = snapshot
      ? {
          tipo: "snapshot",
          duracaoSeg: snapshot.duracaoSegundos,
          distanciaMetros: snapshot.distanciaMetros,
        }
      : { tipo: "ausente" }
  }

  return estados
}

/** Duração de um estado, quando ele tem uma. */
function duracaoDe(estado: EstadoModo | undefined): number | null {
  if (estado?.tipo === "snapshot" || estado?.tipo === "consultado") {
    return estado.duracaoSeg
  }
  return null
}

// ============================================================
// Seletor
// ============================================================

type Props = {
  /** Modo que o algoritmo escolheu e que está gravado no lote. */
  modoOficial: ModoTransporte
  /** Modo em exibição — igual ao oficial quando não há simulação. */
  modoExibido: ModoTransporte
  estados: Record<string, EstadoModo>
  onSelecionar: (modo: ModoTransporte) => void
  /** Quando o lote foi calculado — usado no rótulo de procedência. */
  calculadoEm: Date | null
  /**
   * Âncora de chegada gravada no snapshot desta rota. `null` em lotes
   * anteriores à âncora e em rotas sem transporte público.
   */
  ancoraIso: string | null
}

export function SeletorModoRota({
  modoOficial,
  modoExibido,
  estados,
  onSelecionar,
  calculadoEm,
  ancoraIso,
}: Props) {
  const simulando = modoExibido !== modoOficial
  const estadoAtual = estados[modoExibido]
  const duracaoAtual = duracaoDe(estadoAtual)
  const duracaoOficial = duracaoDe(estados[modoOficial])

  const delta =
    simulando && duracaoAtual != null && duracaoOficial != null
      ? duracaoAtual - duracaoOficial
      : null

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/30 p-4">
      {/* ===== Botões ===== */}
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Ver como
        </p>

        {MODOS_SELECIONAVEIS.map((m) => {
          const estado = estados[m]
          const ativo = m === modoExibido
          const oficial = m === modoOficial

          return (
            <button
              key={m}
              type="button"
              onClick={() => onSelecionar(m)}
              aria-pressed={ativo}
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                ativo
                  ? "border-primary bg-primary/10 font-semibold text-primary"
                  : "border-border hover:bg-accent"
              }`}
            >
              <IconeModo modo={m} className="h-4 w-4" />
              <span>{nomeAmigavelModo(m)}</span>
              <SufixoBotao estado={estado} />
              {oficial && (
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                  cálculo
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ===== Modo indisponível ===== */}
      {estadoAtual?.tipo === "indisponivel" && (
        <div className="rounded-md border border-warn bg-warn-tint p-3">
          <p className="text-sm font-medium text-warn">
            Sem rota neste modo
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-warn/80">
            {estadoAtual.mensagem}
          </p>
        </div>
      )}

      {/* ===== Métricas do modo exibido ===== */}
      {estadoAtual?.tipo !== "indisponivel" && (
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <Metrica rotulo="Duração" carregando={estadoAtual?.tipo === "carregando"}>
            {duracaoAtual != null ? formatarDuracao(duracaoAtual) : "—"}
          </Metrica>

          <Metrica rotulo="Distância" carregando={estadoAtual?.tipo === "carregando"}>
            {estadoAtual?.tipo === "snapshot" || estadoAtual?.tipo === "consultado"
              ? estadoAtual.distanciaMetros != null
                ? formatarDistancia(estadoAtual.distanciaMetros)
                : "—"
              : "—"}
          </Metrica>

          {delta != null && delta !== 0 && (
            <span
              className={`text-[13px] tabular-nums ${
                delta > 0 ? "text-err" : "text-ok"
              }`}
            >
              {delta > 0 ? "+" : "−"}
              {formatarDuracao(Math.abs(delta))} vs {nomeAmigavelModo(modoOficial)}
            </span>
          )}
        </div>
      )}

      {/* ===== Procedência ===== */}
      <RotuloProcedencia
        estado={estadoAtual}
        simulando={simulando}
        modoOficial={modoOficial}
        modoExibido={modoExibido}
        calculadoEm={calculadoEm}
        ancoraIso={ancoraIso}
      />

      {simulando && (
        <button
          type="button"
          onClick={() => onSelecionar(modoOficial)}
          className="text-[12.5px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Voltar ao modo do cálculo
        </button>
      )}
    </div>
  )
}

// ============================================================
// Peças internas
// ============================================================

function SufixoBotao({ estado }: { estado: EstadoModo | undefined }) {
  if (!estado) return null

  switch (estado.tipo) {
    case "snapshot":
    case "consultado":
      return (
        <span className="text-xs tabular-nums text-muted-foreground">
          · {Math.round(estado.duracaoSeg / 60)}min
        </span>
      )
    case "carregando":
      return <span className="h-3 w-8 animate-pulse rounded bg-skeleton" />
    case "ausente":
      return <span className="text-xs text-muted-foreground">· consultar</span>
    case "indisponivel":
      return <span className="text-xs text-muted-foreground">· sem rota</span>
  }
}

function Metrica({
  rotulo,
  carregando,
  children,
}: {
  rotulo: string
  carregando: boolean
  children: React.ReactNode
}) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {rotulo}
      </span>
      {carregando ? (
        <span className="h-5 w-16 animate-pulse rounded bg-skeleton" />
      ) : (
        <span className="text-base font-semibold tabular-nums">{children}</span>
      )}
    </span>
  )
}

/**
 * O rótulo que impede a leitura errada. Sem ele o usuário compara
 * um tempo consultado hoje com o histórico do lote e conclui que o
 * sistema errou.
 */
function RotuloProcedencia({
  estado,
  simulando,
  modoOficial,
  modoExibido,
  calculadoEm,
  ancoraIso,
}: {
  estado: EstadoModo | undefined
  simulando: boolean
  modoOficial: ModoTransporte
  modoExibido: ModoTransporte
  calculadoEm: Date | null
  ancoraIso: string | null
}) {
  if (!estado) return null

  const dataLote = calculadoEm
    ? calculadoEm.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null

  // A âncora só descreve transporte público — carro, moto e a pé não são
  // ancorados, então citá-la no rótulo deles afirmaria algo falso.
  const ancoraDoModo = modoExibido === "TRANSIT" ? ancoraIso : null

  // Consulta que reusou a âncora do snapshot mediu a mesma janela do cálculo
  // (a Routes API aceita TRANSIT até 7 dias no passado). O número é
  // comparável ao do lote, e chamá-lo de "trânsito atual" seria enganoso.
  if (
    estado.tipo === "consultado" &&
    ancoraDoModo &&
    estado.ancoraIso === ancoraDoModo
  ) {
    return (
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        {`Consultado agora, para chegada ${rotularChegadaAncora(ancoraDoModo)} — a mesma janela do cálculo, então é comparável ao número do lote.`}
        {simulando &&
          ` Simulação — o lote confirmado usa ${nomeAmigavelModo(modoOficial)}.`}
      </p>
    )
  }

  if (estado.tipo === "consultado" || estado.tipo === "carregando") {
    return (
      <p className="text-[12px] leading-relaxed text-warn">
        Consultado agora, com trânsito atual.
        {dataLote && ` O lote foi calculado em ${dataLote} e não muda.`}
      </p>
    )
  }

  if (estado.tipo === "ausente") {
    return (
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        Este modo não foi calculado para esta rota. Clique para consultar na API
        — o resultado será o tempo de hoje, não o do dia do lote.
      </p>
    )
  }

  const base = ancoraDoModo
    ? `Tempo registrado no cálculo, para chegada ${rotularChegadaAncora(ancoraDoModo)}.`
    : "Tempo registrado no cálculo do lote."

  return (
    <p className="text-[12px] leading-relaxed text-muted-foreground">
      {simulando
        ? `${base} Simulação — o lote confirmado usa ${nomeAmigavelModo(modoOficial)}.`
        : base}
    </p>
  )
}
