import "server-only"

import { headers } from "next/headers"

/**
 * Controle de acesso do painel do HERMES.
 *
 * As TVs não fazem login: ninguém vai renovar token numa tela pendurada no
 * mural. Em troca da sessão, duas camadas independentes — token fixo e faixa
 * de IP — ambas conferidas aqui, no servidor.
 *
 * QUEM DECIDE OS VALORES É O HERMES, não este código. Faixa e token vêm de
 * variável de ambiente para que a configuração mude sem deploy:
 *
 *   HERMES_PAINEL_TOKEN=<segredo compartilhado com as TVs>
 *   HERMES_PAINEL_IPS=100.64.0.0/10          (opcional; vazio = não filtra)
 *
 * FECHA POR PADRÃO. Sem `HERMES_PAINEL_TOKEN` configurado, o painel responde
 * negando em produção — uma rota sem sessão que ainda não foi protegida é uma
 * rota aberta, e o intervalo entre "subiu" e "o HERMES decidiu o token" é
 * exatamente quando isso passa despercebido. Em desenvolvimento libera, com
 * aviso no log, para não travar o trabalho local.
 *
 * O filtro de IP fica INATIVO enquanto `HERMES_PAINEL_IPS` não for definida:
 * com o token valendo, a faixa é a segunda camada, e travá-la em um palpite
 * de rede impediria o próprio HERMES de testar.
 */

export type ResultadoAcesso =
  | { permitido: true }
  | { permitido: false; motivo: string; status: 401 | 403 | 503 }

/**
 * Confere token e IP da requisição corrente.
 *
 * O token é aceito no header `x-hermes-token` (para quem faz fetch) e na query
 * `?token=` (para a TV, que só sabe abrir uma URL). A query string aparece em
 * log de acesso e em qualquer foto do mural — o header é preferível sempre que
 * o consumidor puder mandá-lo.
 */
export async function verificarAcessoHermes(
  urlDaRequisicao?: string
): Promise<ResultadoAcesso> {
  const esperado = process.env.HERMES_PAINEL_TOKEN?.trim()

  if (!esperado) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[hermes] HERMES_PAINEL_TOKEN não configurada — painel liberado porque " +
          "isto é desenvolvimento. Em produção a rota nega o acesso."
      )
      return { permitido: true }
    }
    return {
      permitido: false,
      motivo: "Painel não configurado (HERMES_PAINEL_TOKEN ausente).",
      status: 503,
    }
  }

  const cabecalhos = await headers()
  const recebido =
    cabecalhos.get("x-hermes-token")?.trim() ||
    tokenDaQuery(urlDaRequisicao) ||
    ""

  if (!comparacaoSegura(recebido, esperado)) {
    return { permitido: false, motivo: "Token inválido ou ausente.", status: 401 }
  }

  const faixas = lerFaixasPermitidas()
  if (faixas.length > 0) {
    const ip = ipDaRequisicao(cabecalhos)
    if (!ip || !faixas.some((faixa) => ipNaFaixa(ip, faixa))) {
      return {
        permitido: false,
        motivo: "Origem fora da faixa autorizada.",
        status: 403,
      }
    }
  }

  return { permitido: true }
}

// ============================================================
// HELPERS
// ============================================================

function tokenDaQuery(url: string | undefined): string {
  if (!url) return ""
  try {
    return new URL(url).searchParams.get("token")?.trim() ?? ""
  } catch {
    return ""
  }
}

/**
 * Comparação em tempo constante.
 *
 * `===` em string sai no primeiro byte diferente, e a diferença de tempo entre
 * "errou no primeiro caractere" e "errou no último" é mensurável em rede local
 * — que é exatamente onde as TVs estão.
 */
function comparacaoSegura(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diferenca = 0
  for (let i = 0; i < a.length; i++) {
    diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diferenca === 0
}

function lerFaixasPermitidas(): string[] {
  return (process.env.HERMES_PAINEL_IPS ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean)
}

/**
 * IP de origem atrás do nginx.
 *
 * `x-forwarded-for` acumula a cadeia de proxies; o primeiro da lista é o
 * cliente. Confiar nele só faz sentido porque o nginx do projeto o reescreve —
 * exposto direto à internet, o header é forjável, e aí a camada que vale é o
 * token.
 */
function ipDaRequisicao(cabecalhos: Headers): string | null {
  const encaminhado = cabecalhos.get("x-forwarded-for")
  if (encaminhado) return encaminhado.split(",")[0]!.trim()
  return cabecalhos.get("x-real-ip")?.trim() ?? null
}

/** Um IPv4 está dentro de uma faixa CIDR? Aceita também IP solto (sem /). */
function ipNaFaixa(ip: string, faixa: string): boolean {
  const [rede, bitsTexto] = faixa.split("/")
  const bits = bitsTexto ? Number(bitsTexto) : 32
  if (!rede || !Number.isFinite(bits) || bits < 0 || bits > 32) return false

  const alvo = paraInteiro(ip)
  const base = paraInteiro(rede)
  if (alvo === null || base === null) return false

  if (bits === 0) return true
  const mascara = (0xffffffff << (32 - bits)) >>> 0
  return (alvo & mascara) >>> 0 === (base & mascara) >>> 0
}

function paraInteiro(ip: string): number | null {
  const partes = ip.split(".")
  if (partes.length !== 4) return null // IPv6 não é tratado: as TVs são v4
  let valor = 0
  for (const parte of partes) {
    const octeto = Number(parte)
    if (!Number.isInteger(octeto) || octeto < 0 || octeto > 255) return null
    valor = (valor << 8) | octeto
  }
  return valor >>> 0
}
