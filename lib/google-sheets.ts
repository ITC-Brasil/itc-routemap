import { google } from "googleapis"
import { JWT } from "google-auth-library"

// ============================================================
// TIPOS
// ============================================================

/**
 * Representação de uma linha bruta da planilha,
 * com mapeamento direto das colunas A-M.
 *
 * Estrutura da planilha (PRD adaptado à realidade do Grupo ITC):
 *   A: Projeto (sigla)
 *   B: UF
 *   C: Ciclo
 *   D: Etapa
 *   E: Técnico (nome ou vazio)
 *   F: UM
 *   G: Cidade (RA)
 *   H: Plus Code
 *   I: Endereço
 *   J: Referência
 *   K: Link Google Maps
 *   L: Status (Histórico | Pendente)
 *   M: Latitude (geralmente vazio — preenchemos via Geocoding)
 */
export type LinhaPlanilha = {
  numeroLinha: number          // posição na planilha (>= 2, pois linha 1 é cabeçalho)
  projeto: string
  uf: string
  ciclo: string                // string crua — convertemos para número depois
  etapa: string
  tecnico: string
  um: string
  cidade: string
  plusCode: string
  endereco: string
  referencia: string
  link: string
  status: string
  latitude: string
}

// ============================================================
// CLIENTE DA SHEETS API
// ============================================================

/**
 * Cria um cliente autenticado da Google Sheets API
 * usando o Service Account configurado em variáveis de ambiente.
 *
 * Lança erro se as credenciais não estiverem configuradas.
 */
function criarClienteSheets() {
  const base64 = process.env.GOOGLE_SERVICE_ACCOUNT_BASE64

  if (!base64) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_BASE64 não está configurada.")
  }

  let credencial: { client_email: string; private_key: string }
  try {
    const json = Buffer.from(base64, "base64").toString("utf-8")
    credencial = JSON.parse(json)
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_BASE64 contém valor inválido.")
  }

  const auth = new JWT({
    email: credencial.client_email,
    key: credencial.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  })

  return google.sheets({ version: "v4", auth })
}

// ============================================================
// LEITURA DE PLANILHAS
// ============================================================

/**
 * Lê todas as linhas de dados de uma aba da planilha (ignora a linha 1 de cabeçalhos).
 *
 * @param sheetId      ID extraído da URL do Google Sheets
 * @param nomeAba      Nome da aba (ex: "Localidades", "Página1")
 * @returns Array de linhas brutas com numeração original
 *
 * @throws Error se a planilha não estiver compartilhada com o Service Account
 */
export async function lerLinhasDaPlanilha(
  sheetId: string,
  nomeAba: string
): Promise<LinhaPlanilha[]> {
  const sheets = criarClienteSheets()

  // Range A2:M busca da linha 2 até o fim, colunas A até M
  // Linha 1 é o cabeçalho — ignoramos
  const range = `${nomeAba}!A2:M`

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range,
    })

    const valores = response.data.values ?? []

    return valores
      .map((linha, indice) => mapearLinha(linha, indice + 2))
      .filter((linha) => !isLinhaVazia(linha))
  } catch (err: unknown) {
    const mensagem = err instanceof Error ? err.message : String(err)

    // Erros comuns com diagnóstico amigável
    if (mensagem.includes("Unable to parse range")) {
      throw new Error(
        `Aba "${nomeAba}" não encontrada na planilha. Verifique o nome da aba.`
      )
    }
    if (mensagem.includes("permission")) {
      throw new Error(
        "Sem permissão de acesso. Compartilhe a planilha com o Service Account."
      )
    }
    if (mensagem.includes("not found")) {
      throw new Error(
        "Planilha não encontrada. Verifique a URL configurada no projeto."
      )
    }

    throw new Error(`Erro ao ler planilha: ${mensagem}`)
  }
}

// ============================================================
// LEITURA DE MÚLTIPLAS ABAS EM PARALELO
// ============================================================

/**
 * Resultado da leitura de uma aba individual.
 * Inclui o nome da aba pra identificar origem ao concatenar
 * e flag de erro pra continuar mesmo se uma falhar.
 */
export type ResultadoLeituraAba = {
  nomeAba: string
  linhas: LinhaPlanilha[]
  erro: string | null
}

/**
 * Lê várias abas da mesma planilha em paralelo.
 *
 * Características:
 * - Disparos paralelos via Promise.all (rápido)
 * - Erros granulares: se uma aba falha, outras continuam
 * - Cada linha mantém seu numeroLinha da aba de origem
 *
 * @param sheetId    ID da planilha
 * @param nomesAbas  Lista de nomes de abas a ler
 * @returns Array de resultados, na mesma ordem das abas solicitadas
 */
export async function lerLinhasDeAbas(
  sheetId: string,
  nomesAbas: string[]
): Promise<ResultadoLeituraAba[]> {
  if (nomesAbas.length === 0) return []

  // Dispara todas as leituras em paralelo.
  // Cada promise é "envolvida" num try/catch individual pra não derrubar
  // as outras se uma falhar (padrão "settled promises").
  const promessas = nomesAbas.map(async (nomeAba) => {
    try {
      const linhas = await lerLinhasDaPlanilha(sheetId, nomeAba)
      return { nomeAba, linhas, erro: null } as ResultadoLeituraAba
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : String(err)
      return { nomeAba, linhas: [], erro: mensagem } as ResultadoLeituraAba
    }
  })

  return Promise.all(promessas)
}

/**
 * Concatena os resultados de várias abas em um único array de linhas.
 *
 * - Anexa o nome da aba origem em cada linha (campo `abaOrigem`)
 * - Ignora abas que tiveram erro
 * - Útil pra processar tudo como um conjunto único no Firestore
 *
 * @param resultados  Saída de lerLinhasDeAbas
 * @returns Array com TODAS as linhas das abas que tiveram sucesso
 */
export function consolidarLinhas(
  resultados: ResultadoLeituraAba[]
): LinhaComAba[] {
  const todasLinhas: LinhaComAba[] = []

  for (const resultado of resultados) {
    if (resultado.erro !== null) continue

    for (const linha of resultado.linhas) {
      todasLinhas.push({ ...linha, abaOrigem: resultado.nomeAba })
    }
  }

  return todasLinhas
}

/**
 * Linha da planilha com identificação da aba de origem.
 * Usada após consolidação de múltiplas abas.
 */
export type LinhaComAba = LinhaPlanilha & {
  abaOrigem: string
}

// ============================================================
// HELPERS PRIVADOS
// ============================================================

/**
 * Converte um array de strings (uma linha da API) em um objeto tipado.
 * Trata células vazias como string vazia.
 */
function mapearLinha(linha: string[], numeroLinha: number): LinhaPlanilha {
  return {
    numeroLinha,
    projeto: (linha[0] ?? "").trim(),
    uf: (linha[1] ?? "").trim(),
    ciclo: (linha[2] ?? "").trim(),
    etapa: (linha[3] ?? "").trim(),
    tecnico: (linha[4] ?? "").trim(),
    um: (linha[5] ?? "").trim(),
    cidade: (linha[6] ?? "").trim(),
    plusCode: (linha[7] ?? "").trim(),
    endereco: (linha[8] ?? "").trim(),
    referencia: (linha[9] ?? "").trim(),
    link: (linha[10] ?? "").trim(),
    status: (linha[11] ?? "").trim(),
    latitude: (linha[12] ?? "").trim(),
  }
}

/**
 * Detecta linhas completamente vazias (úteis para ignorar
 * espaços em branco no meio ou final da planilha).
 */
function isLinhaVazia(linha: LinhaPlanilha): boolean {
  return (
    !linha.projeto &&
    !linha.um &&
    !linha.cidade &&
    !linha.plusCode &&
    !linha.endereco
  )
}