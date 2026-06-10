import { NextResponse } from "next/server"
import {
  lerLinhasDeAbas,
  consolidarLinhas,
  type LinhaComAba,
  type ResultadoLeituraAba,
} from "@/lib/google-sheets"
import {
  buscarProjetoAdmin,
  listarPontosPorProjetoAdmin,
  criarPontoAdmin,
  atualizarPontoAdmin,
  deletarPontosEmBatchAdmin,
  marcarSincronizacaoAdmin,
  calcularHashPonto,
} from "@/lib/firestore/pontos-admin"
import type { Ponto, PontoInput } from "@/lib/firestore/pontos"

// ============================================================
// TIPOS DE RESPOSTA
// ============================================================

/**
 * Resumo por aba sincronizada.
 * Útil pra UI mostrar status de cada UM (1 aba = 1 UM no nosso modelo).
 */
type ResumoAba = {
  nomeAba: string
  totalLinhas: number
  erro: string | null
}

type RelatorioSync = {
  sucesso: true
  totalLinhasPlanilha: number
  novos: number
  atualizados: number
  deletados: number
  ignorados: number
  abas: ResumoAba[]
  duracao: number  // milissegundos
}

type RespostaErro = {
  sucesso: false
  erro: string
  detalhe?: string
}

// ============================================================
// API ROUTE
// ============================================================

/**
 * POST /api/sincronizar
 * Body: { projetoId: string }
 *
 * Sincroniza pontos do Firestore com TODAS as abas configuradas
 * no projeto. Cada aba representa tipicamente uma UM.
 *
 * Algoritmo (PRD seção 8):
 *   1. Lê o projeto (URL da planilha + lista de abas)
 *   2. Lê todas as abas em paralelo
 *   3. Para cada linha: cria/atualiza/ignora baseado em hash MD5
 *   4. Detecta pontos deletados (no Firestore mas não na planilha)
 *   5. Retorna relatório consolidado
 */
export async function POST(request: Request) {
  const inicio = Date.now()

  try {
    // 1. PARSE DO BODY
    const body = await request.json()
    const projetoId: string | undefined = body.projetoId

    if (!projetoId) {
      return respostaErro("Parâmetro 'projetoId' é obrigatório.", 400)
    }

    // 2. BUSCAR PROJETO
    const projeto = await buscarProjetoAdmin(projetoId)
    if (!projeto) {
      return respostaErro("Projeto não encontrado.", 404)
    }

    if (!projeto.sheetId) {
      return respostaErro(
        "Este projeto não tem planilha configurada. Edite e informe a URL.",
        400
      )
    }

    if (!projeto.sheetAbas || projeto.sheetAbas.length === 0) {
      return respostaErro(
        "Este projeto não tem abas configuradas. Edite e adicione pelo menos uma.",
        400
      )
    }

    // 3. LER TODAS AS ABAS EM PARALELO
    let resultados: ResultadoLeituraAba[]
    try {
      resultados = await lerLinhasDeAbas(projeto.sheetId, projeto.sheetAbas)
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : String(err)
      return respostaErro("Erro ao ler a planilha.", 400, mensagem)
    }

    // Se TODAS as abas falharam, retorna erro
    const todasComErro = resultados.every((r) => r.erro !== null)
    if (todasComErro) {
      const primeiroErro = resultados.find((r) => r.erro)?.erro
      return respostaErro(
        "Nenhuma aba pôde ser lida.",
        400,
        primeiroErro ?? "Erro desconhecido."
      )
    }

    // Consolida linhas de todas as abas bem-sucedidas
    const todasLinhas = consolidarLinhas(resultados)

    // 4. BUSCAR PONTOS EXISTENTES NO FIRESTORE
    const pontosExistentes = await listarPontosPorProjetoAdmin(projetoId)

    // 5. INDEXAR POR (abaOrigem + linhaOrigem) — chave composta única
    // Por que composta? Várias abas podem ter o mesmo numeroLinha (linha 2, 3...)
    // — só ficam distintos quando combinados com o nome da aba.
    const mapaExistentes = new Map<string, Ponto>()
    for (const p of pontosExistentes) {
      mapaExistentes.set(criarChaveComposta(p.umNome, p.linhaOrigem), p)
    }

    // 6. PROCESSAR LINHAS
    let novos = 0
    let atualizados = 0
    let ignorados = 0
    const chavesPresentes = new Set<string>()

    for (const linha of todasLinhas) {
      const inputCompleto = converterLinhaParaPontoInput(linha, projetoId)
      if (!inputCompleto) {
        ignorados++
        continue
      }

      // Chave composta: aba + linha (ex: "BSBIA01:2")
      const chave = criarChaveComposta(linha.abaOrigem, linha.numeroLinha)
      chavesPresentes.add(chave)

      const existente = mapaExistentes.get(chave)

      if (!existente) {
        // NOVO: nunca esteve no Firestore
        await criarPontoAdmin(inputCompleto)
        novos++
      } else if (existente.hashMd5 !== inputCompleto.hashMd5) {
        // ALTERADO: hash mudou
        await atualizarPontoAdmin(existente.id, inputCompleto)
        atualizados++
      }
      // Hash igual: já sincronizado, nada a fazer
    }

    // 7. DETECTAR DELETADOS
    // Pontos que estão no Firestore mas NÃO estão mais na planilha
    const idsParaDeletar: string[] = []
    for (const p of pontosExistentes) {
      const chave = criarChaveComposta(p.umNome, p.linhaOrigem)
      if (!chavesPresentes.has(chave)) {
        idsParaDeletar.push(p.id)
      }
    }

    if (idsParaDeletar.length > 0) {
      await deletarPontosEmBatchAdmin(idsParaDeletar)
    }

    // 8. ATUALIZAR TIMESTAMP DE SYNC
    await marcarSincronizacaoAdmin(projetoId)

    // 9. MONTAR RELATÓRIO
    const abasResumo: ResumoAba[] = resultados.map((r) => ({
      nomeAba: r.nomeAba,
      totalLinhas: r.linhas.length,
      erro: r.erro,
    }))

    const relatorio: RelatorioSync = {
      sucesso: true,
      totalLinhasPlanilha: todasLinhas.length,
      novos,
      atualizados,
      deletados: idsParaDeletar.length,
      ignorados,
      abas: abasResumo,
      duracao: Date.now() - inicio,
    }

    return NextResponse.json(relatorio)
  } catch (err) {
    console.error("Erro na sincronização:", err)
    const mensagem = err instanceof Error ? err.message : String(err)
    return respostaErro("Erro interno na sincronização.", 500, mensagem)
  }
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Cria uma chave única combinando o nome da UM/aba com o número da linha.
 *
 * Necessária porque o mesmo numeroLinha pode existir em várias abas
 * (toda planilha começa na linha 2). Sem essa combinação, daria conflito.
 *
 * Ex: criarChaveComposta("BSBIA01", 2) === "BSBIA01:2"
 */
function criarChaveComposta(umNome: string, numeroLinha: number): string {
  return `${umNome}:${numeroLinha}`
}

/**
 * Converte uma linha bruta consolidada (com aba origem) em PontoInput.
 * Retorna null se a linha estiver com dados essenciais faltando.
 */
function converterLinhaParaPontoInput(
  linha: LinhaComAba,
  projetoId: string
): PontoInput | null {
  // Validação mínima: precisa ter cidade ou plus code ou endereço
  if (!linha.cidade && !linha.plusCode && !linha.endereco) {
    return null
  }

  const ciclo = parseInt(linha.ciclo) || 0
  const etapa = parseInt(linha.etapa) || 0
  const latitude = linha.latitude ? parseFloat(linha.latitude) : null

  // umNome vem da ABA ORIGEM (ex: "BSBIA01"), não do campo F da planilha.
  // Isso é importante: a aba é a fonte de verdade pra identificação da UM.
  const inputSemHash = {
    projetoId,
    linhaOrigem: linha.numeroLinha,
    ciclo,
    etapa,
    tecnicoNomeHistorico: linha.tecnico,
    umNome: linha.abaOrigem,
    raNome: linha.cidade,
    uf: linha.uf,
    plusCode: linha.plusCode,
    endereco: linha.endereco,
    referencia: linha.referencia,
    linkMaps: linha.link,
    latitude: !isNaN(latitude ?? NaN) ? latitude : null,
    longitude: null,
    status: linha.status || "Pendente",
  }

  const hashMd5 = calcularHashPonto(inputSemHash)

  return {
    ...inputSemHash,
    hashMd5,
  }
}

function respostaErro(
  mensagem: string,
  status: number,
  detalhe?: string
): NextResponse<RespostaErro> {
  return NextResponse.json(
    { sucesso: false, erro: mensagem, detalhe },
    { status }
  )
}