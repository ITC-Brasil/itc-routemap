/**
 * Âncora de chegada para o cálculo de transporte público.
 *
 * A operação escala o técnico para CHEGAR na unidade às 08:00 do próximo dia
 * útil. Antes disso o cálculo usava "agora + 5 min", então um lote rodado às
 * 19h de sábado media a malha de ônibus das 19h de sábado — números que não
 * representam a operação real.
 *
 * Client-safe de propósito: a tela de cálculo mostra a âncora antes de rodar,
 * e o servidor a envia para a Routes API. Nada aqui toca banco ou rede.
 *
 * FUSO: America/Sao_Paulo, UTC−3 o ano inteiro (o horário de verão brasileiro
 * acabou em 2019; o DF segue o mesmo fuso). O offset é escrito explicitamente
 * em vez de derivado do processo — o container roda com TZ=America/Sao_Paulo,
 * mas CI e máquinas de desenvolvimento não necessariamente, e a regra precisa
 * valer nos três.
 */

/** Offset fixo de America/Sao_Paulo. Ver nota sobre horário de verão acima. */
const OFFSET_SAO_PAULO = "-03:00"

/** Hora de chegada exigida pela operação. */
const HORA_ANCORA = "08:00:00"

/**
 * Data-calendário (YYYY-MM-DD) de um instante, lida no fuso de São Paulo.
 *
 * `Intl` faz a conversão de fuso sem depender da TZ do processo: às 22h de
 * 14/09 em São Paulo já é dia 15 em UTC, e usar os getters locais de `Date`
 * daria o dia errado dependendo de onde o código roda.
 */
function dataCalendarioEmSaoPaulo(instante: Date): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instante)
  // en-CA formata como "2026-09-15" — já é o formato ISO de data.
  return partes
}

/** Avança uma data-calendário em N dias, sem passar por Date local. */
function somarDias(ymd: string, dias: number): string {
  // Meio-dia UTC evita que qualquer arredondamento de fuso empurre a data para
  // o dia vizinho: sobra folga de 12h para os dois lados.
  const base = new Date(`${ymd}T12:00:00Z`)
  base.setUTCDate(base.getUTCDate() + dias)
  return base.toISOString().slice(0, 10)
}

/** Dia da semana (0 = domingo) de uma data-calendário. */
function diaDaSemana(ymd: string): number {
  return new Date(`${ymd}T12:00:00Z`).getUTCDay()
}

/**
 * É dia útil? Segunda a sexta que não esteja na tabela de dias não úteis.
 *
 * Feriados e pontos facultativos não se distinguem aqui de propósito: a
 * operação não escala técnico em nenhum dos dois, então ambos entram na mesma
 * tabela e recebem o mesmo tratamento.
 */
export function ehDiaUtil(ymd: string, diasNaoUteis: Set<string>): boolean {
  const dow = diaDaSemana(ymd)
  if (dow === 0 || dow === 6) return false
  return !diasNaoUteis.has(ymd)
}

/**
 * 08:00 do próximo dia útil, a partir de amanhã, em America/Sao_Paulo.
 *
 * Sempre do dia seguinte em diante — nunca hoje, qualquer que seja a hora do
 * cálculo. Um lote rodado às 06h de uma terça-feira aponta para quarta, não
 * para as 08h daquela mesma terça: o escalonamento é sempre para o dia
 * seguinte em diante.
 *
 * @param agora         Instante de referência (normalmente `new Date()`)
 * @param diasNaoUteis  Datas "YYYY-MM-DD" de feriados e facultativos
 */
export function proximaAncoraDeChegada(
  agora: Date,
  diasNaoUteis: Set<string>
): Date {
  const hoje = dataCalendarioEmSaoPaulo(agora)

  let candidato = somarDias(hoje, 1)
  // Limite defensivo: 30 iterações cobrem qualquer emenda de feriado
  // concebível e impedem laço infinito se a tabela vier corrompida.
  for (let i = 0; i < 30; i++) {
    if (ehDiaUtil(candidato, diasNaoUteis)) break
    candidato = somarDias(candidato, 1)
  }

  return new Date(`${candidato}T${HORA_ANCORA}${OFFSET_SAO_PAULO}`)
}

/**
 * Formata um instante como RFC 3339 com offset −03:00, que é o que a Routes
 * API espera em `arrivalTime`.
 *
 * `toISOString()` também seria RFC 3339 válido, mas em UTC ("...T11:00:00Z").
 * Manter o offset local torna o request legível em depuração: dá para ver
 * "08:00" no corpo da requisição e reconhecer a regra de negócio.
 */
export function formatarIsoSaoPaulo(instante: Date): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(instante)

  const get = (tipo: string) =>
    partes.find((p) => p.type === tipo)?.value ?? "00"

  const data = `${get("year")}-${get("month")}-${get("day")}`
  // Intl pode devolver "24" para meia-noite em algumas engines; normaliza.
  const hora = get("hour") === "24" ? "00" : get("hour")
  const relogio = `${hora}:${get("minute")}:${get("second")}`

  return `${data}T${relogio}${OFFSET_SAO_PAULO}`
}

/**
 * Rótulo para a UI: "segunda, 15/09 às 08:00".
 *
 * A tela de cálculo mostra isso antes de rodar. Sem o aviso, o usuário vê os
 * tempos de transporte público mudarem sem explicação e reporta como bug.
 */
export function rotularAncora(ancora: Date): string {
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  })
  const partes = fmt.formatToParts(ancora)
  const get = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? ""
  return `${get("weekday")}, ${get("day")}/${get("month")} às 08:00`
}
