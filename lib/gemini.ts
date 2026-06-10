// lib/gemini.ts
//
// Geração de justificativa em linguagem natural para uma alocação.
//
// Estratégia:
//   1) Se GEMINI_ENABLED=false no .env.local → usa o template procedural local
//   2) Se GEMINI_ENABLED não estiver definida (ou ≠ "false") → tenta o Gemini,
//      com fallback automático no template se a chamada falhar.
//   3) Se a chamada do Gemini falhar (rede, billing, modelo indisponível, etc),
//      cai no template — usuário nunca vê "indisponível".

import { GoogleGenerativeAI } from "@google/generative-ai"
import type { ResultadoAlocacao } from "@/lib/alocacao"
import type { ModoTransporte } from "@/lib/firestore/rotas"

const MODELO = "gemini-2.5-flash"

export interface ContextoAlocacao {
  totalTecnicos: number
  totalUMs: number
  modoPrincipal: ModoTransporte
  tecnicos: Map<string, string> // id -> nome
  umsLookup: Map<string, { umNome: string; raNome: string; projetoSigla: string }>
}

/**
 * Gera uma justificativa em linguagem natural para a alocação calculada.
 *
 * Tenta Gemini se habilitado e configurado. Caso contrário (ou em caso de erro
 * na chamada), recorre ao template procedural local que monta uma frase clara
 * a partir das métricas da alocação. O usuário sempre recebe algum texto.
 */
export async function gerarJustificativaAlocacao(
  resultado: ResultadoAlocacao,
  contexto: ContextoAlocacao,
): Promise<string> {
  const geminiEnabled = process.env.GEMINI_ENABLED !== "false"
  const apiKey = process.env.GEMINI_API_KEY

  // Desligado explicitamente → template direto, sem latência adicional
  if (!geminiEnabled) {
    return gerarJustificativaTemplate(resultado, contexto)
  }

  // Sem chave configurada → template (silencioso, sem warning ruidoso)
  if (!apiKey) {
    return gerarJustificativaTemplate(resultado, contexto)
  }

  // Tenta Gemini com fallback automático no template em qualquer erro
  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: MODELO })
    const prompt = construirPrompt(resultado, contexto)
    const result = await model.generateContent(prompt)
    const texto = result.response.text().trim()
    return texto || gerarJustificativaTemplate(resultado, contexto)
  } catch (err) {
    console.warn("Gemini indisponível, usando fallback template:", err instanceof Error ? err.message : err)
    return gerarJustificativaTemplate(resultado, contexto)
  }
}

// ============================================================
// Template procedural (fallback)
// ============================================================

/**
 * Monta uma justificativa a partir das próprias métricas da alocação.
 * Saída em 2-4 frases curtas em português brasileiro.
 */
function gerarJustificativaTemplate(
  resultado: ResultadoAlocacao,
  contexto: ContextoAlocacao,
): string {
  const totalAlocados = resultado.alocacoes.length
  const modoLabel = nomeAmigavelModo(contexto.modoPrincipal)

  // Caso degenerado: nenhuma alocação possível
  if (totalAlocados === 0) {
    return "Nenhuma alocação foi possível com os dados fornecidos. Verifique se há rotas viáveis entre os técnicos e as unidades móveis selecionadas."
  }

  const partes: string[] = []

  // Frase 1 — visão geral
  if (totalAlocados === 1) {
    partes.push("1 técnico foi alocado.")
  } else {
    partes.push(`${totalAlocados} técnicos foram alocados otimamente.`)
  }

  // Frase 2 — métricas principais (tempo total e médio)
  const tempoTotalMin = Math.round(resultado.custoTotal / 60)
  const tempoMedioMin = Math.round(resultado.custoMedio / 60)

  if (totalAlocados > 1) {
    partes.push(
      `O tempo total de deslocamento é de ${tempoTotalMin} minutos via ${modoLabel}, com média de ${tempoMedioMin} min por técnico.`,
    )
  } else {
    partes.push(`Tempo de deslocamento: ${tempoTotalMin} minutos via ${modoLabel}.`)
  }

  // Frase 3 — sobras (apenas se houver)
  const sobras: string[] = []
  if (resultado.tecnicosNaoAlocados.length > 0) {
    const n = resultado.tecnicosNaoAlocados.length
    sobras.push(`${n} ${n === 1 ? "técnico ficou" : "técnicos ficaram"} sem destino`)
  }
  if (resultado.destinosNaoAlocados.length > 0) {
    const n = resultado.destinosNaoAlocados.length
    sobras.push(`${n} ${n === 1 ? "unidade móvel ficou" : "unidades móveis ficaram"} sem técnico`)
  }
  if (sobras.length > 0) {
    partes.push(`${capitalizar(sobras.join(" e "))} (técnicos e UMs em quantidades diferentes).`)
  }

  // Frase final — garantia algorítmica (só para casos com 2+ alocações)
  if (totalAlocados > 1) {
    partes.push(
      "Esta é a configuração com menor tempo total de deslocamento possível para os dados informados.",
    )
  }

  return partes.join(" ")
}

function capitalizar(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function nomeAmigavelModo(modo: ModoTransporte): string {
  const nomes: Record<ModoTransporte, string> = {
    DRIVE: "carro",
    TWO_WHEELER: "moto",
    WALK: "a pé",
    BICYCLE: "bicicleta",
    TRANSIT: "transporte público",
  }
  return nomes[modo] || modo.toLowerCase()
}

// ============================================================
// Prompt do Gemini (usado quando habilitado)
// ============================================================

function construirPrompt(
  resultado: ResultadoAlocacao,
  contexto: ContextoAlocacao,
): string {
  const modoLabel = nomeAmigavelModo(contexto.modoPrincipal)
  const totalAlocados = resultado.alocacoes.length

  const alocacoesTexto = resultado.alocacoes
    .map((a, i) => {
      const nome = contexto.tecnicos.get(a.tecnicoId) || a.tecnicoId
      const um = contexto.umsLookup.get(a.destinoId)
      const destinoLabel = um ? `${um.umNome} (${um.raNome})` : a.destinoId
      const min = Math.round(a.custo / 60)
      return `${i + 1}. ${nome} → ${destinoLabel}: ${min} min`
    })
    .join("\n")

  const sobrasTexto: string[] = []
  if (resultado.tecnicosNaoAlocados.length > 0) {
    const nomes = resultado.tecnicosNaoAlocados
      .map((id) => contexto.tecnicos.get(id) || id)
      .join(", ")
    sobrasTexto.push(`Técnicos sem alocação: ${nomes}`)
  }
  if (resultado.destinosNaoAlocados.length > 0) {
    const nomes = resultado.destinosNaoAlocados
      .map((id) => {
        const um = contexto.umsLookup.get(id)
        return um ? um.umNome : id
      })
      .join(", ")
    sobrasTexto.push(`UMs sem técnico: ${nomes}`)
  }
  const sobrasBloco = sobrasTexto.length > 0 ? `\n\n${sobrasTexto.join("\n")}` : ""

  return `Você é um assistente que explica decisões de alocação de equipes técnicas.

Contexto: ${contexto.totalTecnicos} técnicos disponíveis e ${contexto.totalUMs} unidades móveis (UMs) a serem visitadas. Modo de transporte principal: ${modoLabel}.

Alocação calculada (${totalAlocados} pares):
${alocacoesTexto}

Tempo total de deslocamento: ${Math.round(resultado.custoTotal / 60)} min
Tempo médio por técnico: ${Math.round(resultado.custoMedio / 60)} min${sobrasBloco}

Em 2-3 frases em português brasileiro, explique de forma natural por que essa alocação é eficiente. Mencione o tempo total/médio e, se houver, sobras (técnicos ou UMs sem par). Não use bullet points, apenas texto corrido. Não cite o nome do algoritmo (Húngaro) — fale como se fosse uma análise de operações.`
}