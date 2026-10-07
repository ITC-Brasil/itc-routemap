import "server-only"

/**
 * Cliente da API v2 do NocoDB — fonte dos pontos de operação.
 *
 * Substitui a leitura do Google Sheets. A tabela é "Localidades", na base
 * "Localidades"; as antigas abas por UM viraram views da mesma tabela, então
 * a sync lê a tabela direto e usa o campo `UM` em vez do nome da aba.
 *
 * Por que v2 e não v3: a instância não tem licença, e parte da v3 (views)
 * responde 402. Os endpoints de dados da v2 cobrem tudo o que a sync e a
 * escrita de volta precisam — filtro por `where`, paginação e PATCH em lote.
 *
 * Autenticação: header `xc-token` com NOCODB_API_TOKEN.
 */

// ============================================================
// CONFIGURAÇÃO
// ============================================================

/**
 * Id da tabela Localidades. Fixo no código porque é um identificador da
 * instância, não um segredo — e trocar de tabela é mudança de código (os
 * nomes de campo abaixo dependem dela), não de ambiente.
 */
const TABELA_LOCALIDADES = "ml94sdj5x8okov5"

/** Teto de página da instância (pedir mais devolve 1000 do mesmo jeito). */
const TAMANHO_PAGINA = 1000

/** PATCH em lote: mantém cada request pequeno. */
const TAMANHO_LOTE_ESCRITA = 100

function configuracao(): { url: string; token: string } {
  const url = process.env.NOCODB_URL?.trim().replace(/\/+$/, "")
  const token = process.env.NOCODB_API_TOKEN?.trim()
  if (!url) throw new Error("NOCODB_URL não está configurada.")
  if (!token) throw new Error("NOCODB_API_TOKEN não está configurada.")
  return { url, token }
}

// ============================================================
// TIPOS
// ============================================================

/** Valores possíveis do single select Status. */
export type StatusNocodb = "Pendente" | "Atual" | "Histórico"

/**
 * Uma linha da tabela Localidades, como a API v2 devolve.
 *
 * `Tecnico` é MultiSelect: vem como string com os nomes separados por
 * vírgula ("Allan,Paulo"), ou null. `Coordenadas` é GeoData: "lat; lng".
 */
export type LinhaLocalidade = {
  Id: number
  Nome: string | null
  Ciclo: number | null
  Etapa: number | null
  Endereco: string | null
  Referencia: string | null
  Link: string | null
  Coordenadas: string | null
  Projeto: string | null
  UF: string | null
  UM: string | null
  Cidade: string | null
  PlusCode: string | null
  Tecnico: string | null
  Status: string | null
}

/** Atualização parcial de uma linha. `null` limpa o campo no NocoDB. */
export type AtualizacaoLocalidade = {
  Id: number
  Tecnico?: string | null
  Status?: StatusNocodb
}

export class ErroNocodb extends Error {
  constructor(
    mensagem: string,
    readonly status: number | null
  ) {
    super(mensagem)
    this.name = "ErroNocodb"
  }
}

// ============================================================
// HTTP
// ============================================================

async function requisitar<T>(
  caminho: string,
  init: RequestInit = {}
): Promise<T> {
  const { url, token } = configuracao()

  let res: Response
  try {
    res = await fetch(`${url}${caminho}`, {
      ...init,
      headers: {
        "xc-token": token,
        "Content-Type": "application/json",
        ...init.headers,
      },
      cache: "no-store",
    })
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err)
    throw new ErroNocodb(`NocoDB inacessível: ${motivo}`, null)
  }

  const texto = await res.text()
  if (!res.ok) {
    // A API devolve { msg } ou { message } — não há segredo no corpo, mas
    // corta para não despejar HTML de proxy no log.
    throw new ErroNocodb(
      `NocoDB respondeu ${res.status}: ${texto.slice(0, 300)}`,
      res.status
    )
  }

  try {
    return JSON.parse(texto) as T
  } catch {
    throw new ErroNocodb("NocoDB devolveu uma resposta que não é JSON.", res.status)
  }
}

// ============================================================
// LEITURA
// ============================================================

type PaginaV2 = {
  list: LinhaLocalidade[]
  pageInfo: { isLastPage?: boolean; totalRows?: number }
}

/**
 * Escapa um valor para a sintaxe de filtro `where` da v2, onde vírgula separa
 * valores e parênteses delimitam a condição.
 */
function valorFiltro(valor: string): string {
  return valor.replace(/([,()\\])/g, "\\$1")
}

/**
 * Lê todas as linhas que casam com o filtro `where` da v2, paginando até a
 * última página.
 */
async function listarPorFiltro(where: string): Promise<LinhaLocalidade[]> {
  const linhas: LinhaLocalidade[] = []
  let offset = 0

  while (true) {
    const params = new URLSearchParams({
      where,
      limit: String(TAMANHO_PAGINA),
      offset: String(offset),
      sort: "Id",
    })
    const pagina = await requisitar<PaginaV2>(
      `/api/v2/tables/${TABELA_LOCALIDADES}/records?${params}`
    )
    linhas.push(...pagina.list)

    if (pagina.pageInfo.isLastPage || pagina.list.length === 0) break
    offset += pagina.list.length
  }

  return linhas
}

/**
 * Lê todas as linhas da tabela Localidades cujo Projeto está entre `siglas`.
 *
 * O filtro é feito no NocoDB (`Projeto in ...`): linha de projeto que não
 * está cadastrado no RouteMap não chega ao app.
 */
export async function listarLocalidades(
  siglas: string[]
): Promise<LinhaLocalidade[]> {
  if (siglas.length === 0) return []
  return listarPorFiltro(`(Projeto,in,${siglas.map(valorFiltro).join(",")})`)
}

/**
 * Linhas "Atual" de uma UM. Usado na escrita de volta para achar o Atual
 * anterior pelo que o NocoDB diz — não pelo que o Postgres acha que está lá.
 */
export async function listarAtuaisDaUm(umNome: string): Promise<LinhaLocalidade[]> {
  return listarPorFiltro(`(UM,eq,${valorFiltro(umNome)})~and(Status,eq,Atual)`)
}

// ============================================================
// ESCRITA
// ============================================================

/**
 * Atualiza Tecnico/Status de várias linhas (PATCH em lote da v2).
 *
 * Lança ErroNocodb na primeira falha. Lotes anteriores à falha já ficaram
 * gravados — por isso quem chama marca TODOS os pontos afetados como
 * pendentes e o reenvio regrava tudo (a escrita é idempotente: grava o
 * estado final, não um delta).
 */
export async function atualizarLocalidades(
  atualizacoes: AtualizacaoLocalidade[]
): Promise<void> {
  for (let i = 0; i < atualizacoes.length; i += TAMANHO_LOTE_ESCRITA) {
    const lote = atualizacoes.slice(i, i + TAMANHO_LOTE_ESCRITA)
    await requisitar<unknown>(
      `/api/v2/tables/${TABELA_LOCALIDADES}/records`,
      { method: "PATCH", body: JSON.stringify(lote) }
    )
  }
}

// ============================================================
// CONVERSÕES
// ============================================================

/**
 * Converte o GeoData "lat; lng" em números. Null quando vazio ou inválido —
 * o geocoding preenche depois.
 */
export function parsearCoordenadas(
  valor: string | null
): { latitude: number; longitude: number } | null {
  if (!valor || !valor.trim()) return null
  const partes = valor.split(";").map((p) => p.trim().replace(",", "."))
  if (partes.length !== 2) return null
  const latitude = Number(partes[0])
  const longitude = Number(partes[1])
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  return { latitude, longitude }
}

/** Nomes do MultiSelect Tecnico, sem vazios. */
export function nomesTecnicos(valor: string | null): string[] {
  if (!valor) return []
  return valor
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean)
}
