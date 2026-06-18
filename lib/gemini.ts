// lib/gemini.ts
//
// Geração de justificativa em linguagem natural para uma alocação.
//
// Migração para o novo SDK oficial @google/genai (substitui @google/generative-ai
// que foi deprecated em nov/2025).
//
// Estratégia (igual à anterior, comportamento preservado):
//   1) Se GEMINI_ENABLED=false no .env.local → usa o template procedural local
//   2) Se GEMINI_ENABLED não estiver definida (ou ≠ "false") → tenta o Gemini,
//      com fallback automático no template se a chamada falhar.
//   3) Se a chamada do Gemini falhar (rede, billing, modelo indisponível, etc),
//      cai no template — usuário nunca vê "indisponível".

import { GoogleGenAI } from "@google/genai"
import type { ResultadoAlocacao } from "@/lib/alocacao"
import type { ModoTransporte } from "@/lib/firestore/rotas"

// Modelo: Flash 2.5 dá output mais elaborado que o Lite, free tier suficiente
// para o volume previsto (10-30 alocações/dia).
// Trocar pra "gemini-2.5-flash-lite" se algum dia a quota apertar.
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
    const ai = new GoogleGenAI({ apiKey })
    const prompt = construirPrompt(resultado, contexto)

    const response = await ai.models.generateContent({
      model: MODELO,
      contents: prompt,
      config: {
        // Temperatura um pouco acima do default deixa o texto mais natural,
        // sem virar criativo demais. 1.1 é um sweet spot pra análise narrativa.
        temperature: 1.1,
        // Limite suficiente pra ~6 frases de análise rica.
        // (1 frase português ≈ 30-50 tokens; 500 cobre 10+ frases com folga)
        maxOutputTokens: 500,
      },
    })

    const texto = (response.text ?? "").trim()
    return texto || gerarJustificativaTemplate(resultado, contexto)
  } catch (err) {
    console.warn(
      "Gemini indisponível, usando fallback template:",
      err instanceof Error ? err.message : err,
    )
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

/**
 * Monta um prompt rico em contexto pra fazer o Gemini gerar uma análise
 * narrativa de qualidade. Diferenças do prompt antigo:
 *   - Identifica o sistema como Grupo ITC Brasil (contexto institucional)
 *   - Lista alocações por NOME (não só por ID)
 *   - Calcula métricas comparativas (mais longa, mais curta, variação)
 *   - Pede pra citar pares específicos por nome
 *   - Pede análise mais elaborada (4-6 frases)
 *   - Estrutura instruções em seções claras (===)
 */
function construirPrompt(
  resultado: ResultadoAlocacao,
  contexto: ContextoAlocacao,
): string {
  const modoLabel = nomeAmigavelModo(contexto.modoPrincipal)
  const totalAlocados = resultado.alocacoes.length

  // Lista detalhada das alocações já com nomes resolvidos
  const alocacoesDetalhadas = resultado.alocacoes
    .map((a) => {
      const nome = contexto.tecnicos.get(a.tecnicoId) || a.tecnicoId
      const um = contexto.umsLookup.get(a.destinoId)
      const destinoLabel = um ? `${um.umNome} (${um.raNome})` : a.destinoId
      const min = Math.round(a.custo / 60)
      return `  - ${nome} → ${destinoLabel}: ${min} min`
    })
    .join("\n")

  // Métricas comparativas
  const tempos = resultado.alocacoes.map((a) => a.custo)
  const tempoMaxSeg = tempos.length > 0 ? Math.max(...tempos) : 0
  const tempoMinSeg = tempos.length > 0 ? Math.min(...tempos) : 0
  const tempoMaxMin = Math.round(tempoMaxSeg / 60)
  const tempoMinMin = Math.round(tempoMinSeg / 60)
  const tempoMedioMin = Math.round(resultado.custoMedio / 60)
  const tempoTotalMin = Math.round(resultado.custoTotal / 60)

  // Identifica os pares de maior/menor tempo
  const alocMaisLonga = resultado.alocacoes.find((a) => a.custo === tempoMaxSeg)
  const alocMaisCurta = resultado.alocacoes.find((a) => a.custo === tempoMinSeg)
  const tecMaxNome = alocMaisLonga
    ? contexto.tecnicos.get(alocMaisLonga.tecnicoId) ?? "?"
    : "?"
  const tecMinNome = alocMaisCurta
    ? contexto.tecnicos.get(alocMaisCurta.tecnicoId) ?? "?"
    : "?"
  const umMaxNome = alocMaisLonga
    ? contexto.umsLookup.get(alocMaisLonga.destinoId)?.umNome ?? "?"
    : "?"
  const umMinNome = alocMaisCurta
    ? contexto.umsLookup.get(alocMaisCurta.destinoId)?.umNome ?? "?"
    : "?"

  // Análise da variação entre técnicos
  const variacao = tempoMaxMin - tempoMinMin
  const variacaoTexto =
    variacao === 0
      ? "tempos idênticos entre técnicos"
      : variacao <= 5
        ? "tempos bem equilibrados entre técnicos"
        : variacao <= 15
          ? "variação moderada entre técnicos"
          : "variação significativa entre técnicos"

  // Bloco de sobras (só inclui se houver)
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
  const sobrasBloco =
    sobrasTexto.length > 0
      ? `\n\n=== SOBRAS ===\n${sobrasTexto.map((s) => `  - ${s}`).join("\n")}\nMotivo: técnicos e UMs em quantidades diferentes nesta rodada.`
      : ""

  return `Você é um analista sênior de operações logísticas do Grupo ITC Brasil, especializado em alocação de equipes técnicas em campo no Distrito Federal. Sua tarefa é gerar uma análise narrativa sobre uma rodada de alocação que acabou de ser calculada pelo sistema.

=== CONTEXTO OPERACIONAL ===
- Empresa: Grupo ITC Brasil
- Operação: alocação de técnicos a unidades móveis (UMs) para visitas em campo no DF
- Técnicos disponíveis nesta rodada: ${contexto.totalTecnicos}
- UMs a serem visitadas: ${contexto.totalUMs}
- Modo de transporte principal: ${modoLabel}

=== ALOCAÇÃO PROPOSTA (${totalAlocados} ${totalAlocados === 1 ? "par" : "pares"}) ===
${alocacoesDetalhadas}

=== MÉTRICAS GLOBAIS ===
- Tempo total de deslocamento: ${tempoTotalMin} min
- Tempo médio por técnico: ${tempoMedioMin} min
- Rota mais curta: ${tempoMinMin} min (${tecMinNome} → ${umMinNome})
- Rota mais longa: ${tempoMaxMin} min (${tecMaxNome} → ${umMaxNome})
- Diferença entre rotas: ${variacao} min (${variacaoTexto})${sobrasBloco}

=== INSTRUÇÕES ===
Escreva uma análise narrativa de 4 a 6 frases em português brasileiro que:
1. Comece comentando o tamanho e a eficiência geral da alocação (quantos técnicos foram alocados, tempo total)
2. Destaque pelo menos um par específico citando NOMES de técnicos e UMs (a rota mais longa, a mais curta, ou outra característica notável da lista acima)
3. Comente o equilíbrio (ou desequilíbrio) entre os técnicos com base na variação dos tempos
4. Se houver sobras (técnicos ou UMs sem par), explique a causa de forma objetiva — sem soar negativo
5. Termine com uma observação prática sobre a viabilidade operacional da rodada (ex: dia tranquilo, dia exigente, etc)

Estilo:
- Tom profissional, analítico, claro — como um consultor apresentando o resultado pra um gestor
- Parágrafo único, fluente, sem listas
- Use números específicos quando relevante (ex: "Anne percorrerá apenas 11 min até a UM BSBIA02")
- NÃO use bullets, listas, marcadores ou quebras de linha
- NÃO cite jargão técnico (algoritmos, modelos, "matriz de custo", etc) — fale como uma pessoa real
- NÃO comece frases vazias do tipo "esta é uma alocação eficiente" sem justificar com números`
}