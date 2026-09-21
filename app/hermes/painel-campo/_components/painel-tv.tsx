"use client"

import { useCallback, useEffect, useState } from "react"

import type { PainelCampo } from "@/lib/hermes/painel-campo"
import { CartaoUnidade, type Densidade } from "./cartao-unidade"
import { FaixaTotais } from "./faixa-totais"
import { MapaPainel } from "./mapa-painel"

/**
 * A tela em si: dado, atualização e degradação.
 *
 * REGRA CENTRAL DA DEGRADAÇÃO — a tela fica semanas ligada sem ninguém olhar.
 * Quando a busca falha, o último dado bom permanece e o carimbo do rodapé
 * envelhece. Não pisca, não mostra tela de erro, não zera número. Um painel
 * que se apaga a cada instabilidade de rede ensina a sala a ignorá-lo.
 */

/** Intervalo de atualização. O dado muda algumas vezes ao dia; 60s sobra. */
const INTERVALO_MS = 60_000

/** A partir daqui o carimbo fica âmbar: dado velho com cara de novo engana. */
const LIMITE_DADO_VELHO_MS = 5 * 60_000

/** Recarga preventiva: navegador de TV vaza memória em dias de uptime. */
const RECARGA_MS = 6 * 60 * 60_000

export function PainelTv({
  inicial,
  token,
}: {
  inicial: PainelCampo
  token: string | null
}) {
  const [painel, setPainel] = useState<PainelCampo>(inicial)
  const [buscadoEm, setBuscadoEm] = useState<number>(() => Date.now())
  const [agora, setAgora] = useState<number>(() => Date.now())

  // `token` entra direto nas dependências em vez de passar por um ref: ele vem
  // da query string da página e não muda enquanto a TV estiver aberta, então o
  // intervalo não é recriado na prática. O ref que havia aqui era escrito
  // durante o render, o que o React proíbe — e resolvia um problema que esta
  // tela não tem.
  const buscar = useCallback(async () => {
    const url = token
      ? `/api/hermes/painel-campo?token=${encodeURIComponent(token)}`
      : "/api/hermes/painel-campo"

    try {
      const res = await fetch(url, { cache: "no-store" })
      if (!res.ok) return // mantém o último dado bom; o carimbo envelhece
      if (!res.headers.get("content-type")?.includes("application/json")) return

      const dado = (await res.json()) as PainelCampo
      setPainel(dado)
      setBuscadoEm(Date.now())
    } catch {
      // Rede caiu. Silêncio proposital: a tela continua mostrando o que tem.
    }
  }, [token])

  useEffect(() => {
    const id = setInterval(() => void buscar(), INTERVALO_MS)
    return () => clearInterval(id)
  }, [buscar])

  // Relógio só para a idade do carimbo. Segundo a segundo seria animação
  // contínua numa tela que não deve ter nenhuma; 10s basta para o rodapé.
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 10_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const id = setTimeout(() => location.reload(), RECARGA_MS)
    return () => clearTimeout(id)
  }, [])

  const idadeMs = agora - buscadoEm
  const dadoVelho = idadeMs > LIMITE_DADO_VELHO_MS

  const densidade = densidadePara(painel.unidades.length)
  const colunas = densidade === "alta" ? 5 : 4

  const semLote = painel.loteConfirmadoEm === null

  return (
    // `h-full` + `min-h-0`: ocupa a altura que o layout deu e deixa a grade
    // encolher dentro dela, em vez de exigir uma altura mínima que force
    // rolagem quando a lista cresce.
    <main className="flex h-full min-h-0 flex-col gap-[1.4vh]">
      <Cabecalho ancoraChegada={painel.ancoraChegada} />

      <FaixaTotais totais={painel.totais} />

      {semLote ? (
        <SemLote />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[2.5fr_1fr] gap-[1.4vw]">
          <div
            className="grid content-start gap-[0.9vw] overflow-hidden"
            style={{ gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))` }}
          >
            {painel.unidades.map((unidade) => (
              <CartaoUnidade
                key={`${unidade.projeto}-${unidade.sigla}`}
                unidade={unidade}
                densidade={densidade}
              />
            ))}

            {painel.tecnicosSemUnidade.map((tecnico) => (
              <CartaoTecnicoSemUnidade
                key={tecnico.nome}
                nome={tecnico.nome}
                iniciais={tecnico.iniciais}
              />
            ))}
          </div>

          <MapaPainel unidades={painel.unidades} />
        </div>
      )}

      <Rodape
        loteConfirmadoEm={painel.loteConfirmadoEm}
        idadeMs={idadeMs}
        dadoVelho={dadoVelho}
      />
    </main>
  )
}

// ============================================================
// FAIXAS DE DENSIDADE
// ============================================================

/**
 * A grade se adapta à contagem sem ninguém tocar no código — a equipe vai de 7
 * para 12 técnicos até novembro e cresce de novo depois.
 *
 * Acima de 20 a especificação prevê paginação em ciclo; não está implementada
 * de propósito, porque ainda não existe esse número. O que acontece hoje com
 * 21+ é a faixa "alta" continuar valendo: cartões menores, cinco colunas.
 */
function densidadePara(quantidade: number): Densidade {
  if (quantidade <= 8) return "baixa"
  if (quantidade <= 16) return "media"
  return "alta"
}

// ============================================================
// PEÇAS
// ============================================================

function Cabecalho({ ancoraChegada }: { ancoraChegada: string | null }) {
  return (
    <header className="flex items-baseline justify-between border-b border-[#21262d] pb-[1.2vh]">
      <h1 className="font-mono text-[1.5vw] font-semibold uppercase tracking-[0.35em] text-[#e6edf3]">
        TV3 · Campo · Alocação
      </h1>

      {/* Sem âncora, a linha some inteira — melhor que exibir data inventada
          ou um traço que alguém leia como "chegada indefinida". */}
      {ancoraChegada && (
        <p className="font-mono text-[1.1vw] text-[#7d8590]">
          Chegada prevista{" "}
          <span className="text-[#e6edf3]">{formatarChegada(ancoraChegada)}</span>
        </p>
      )}
    </header>
  )
}

function SemLote() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-[1vh]">
      <p className="text-[2.8vw] font-bold text-[#e6edf3]">
        Nenhum lote confirmado
      </p>
      <p className="text-[1.2vw] text-[#7d8590]">
        Quando uma alocação for confirmada no RouteMap, as unidades aparecem aqui.
      </p>
    </div>
  )
}

function CartaoTecnicoSemUnidade({
  nome,
  iniciais,
}: {
  nome: string
  iniciais: string
}) {
  return (
    // Tracejado e sem cor de estado: técnico livre é informação, não alerta.
    // Só o âmbar das unidades descobertas deve puxar o olho do corredor.
    <article className="flex items-center gap-[0.6vw] rounded-[0.6vw] border border-dashed border-[#30363d] px-[0.8vw] py-[1vh]">
      <span className="flex size-[2.2vw] shrink-0 items-center justify-center rounded-full bg-[#21262d] font-mono text-[0.85vw] text-[#7d8590]">
        {iniciais}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[1vw] text-[#c9d1d9]">{nome}</span>
        <span className="block font-mono text-[0.7vw] uppercase tracking-[0.15em] text-[#6e7681]">
          sem unidade
        </span>
      </span>
    </article>
  )
}

function Rodape({
  loteConfirmadoEm,
  idadeMs,
  dadoVelho,
}: {
  loteConfirmadoEm: string | null
  idadeMs: number
  dadoVelho: boolean
}) {
  return (
    <footer className="flex items-baseline justify-between border-t border-[#21262d] pt-[1vh] font-mono text-[0.85vw]">
      <span className="text-[#6e7681]">
        {loteConfirmadoEm
          ? `Lote confirmado ${formatarDataHora(loteConfirmadoEm)}`
          : "Sem lote confirmado"}
        {" · "}
        {/* O painel mostra onde a unidade DEVE estar nesta etapa, segundo o
            último lote. Dizer isso na tela evita que alguém no corredor leia
            como rastreamento ao vivo. */}
        posição planejada, não tempo real
      </span>

      <span className={dadoVelho ? "text-[#d29922]" : "text-[#6e7681]"}>
        {dadoVelho ? "⚠ " : ""}
        atualizado {formatarIdade(idadeMs)}
      </span>
    </footer>
  )
}

// ============================================================
// FORMATAÇÃO (camada de exibição — o contrato entrega seg/metros)
// ============================================================

function formatarChegada(iso: string): string {
  const data = new Date(iso)
  if (Number.isNaN(data.getTime())) return ""
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(data)
}

function formatarDataHora(iso: string): string {
  const data = new Date(iso)
  if (Number.isNaN(data.getTime())) return ""
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(data)
}

function formatarIdade(ms: number): string {
  const min = Math.floor(ms / 60_000)
  if (min < 1) return "agora"
  if (min === 1) return "há 1 min"
  if (min < 60) return `há ${min} min`
  const horas = Math.floor(min / 60)
  return horas === 1 ? "há 1 h" : `há ${horas} h`
}
