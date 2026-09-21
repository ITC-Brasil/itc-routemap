import { test, expect } from "@playwright/test"

import {
  avaliarCobertura,
  descreverProblemas,
  type EntradaCobertura,
  type ParVigente,
  type UmCadastrada,
} from "@/lib/cobertura"

/**
 * Invariante da Etapa 15: toda UM tem exatamente um técnico, e todo técnico
 * tem no máximo uma UM.
 *
 * Aqui ele é verificado sobre a função pura, que é onde a regra mora. A
 * verificação contra os DADOS ATUAIS é `npm run verificar:cobertura` — este
 * runner é deliberadamente sem banco (ver playwright.unit.config.ts), e
 * amarrar a regra do 1:1 ao Postgres estar de pé esconderia a regra quando o
 * banco caísse.
 */

function um(nome: string, sigla = "IA"): UmCadastrada {
  return {
    id: `um-${nome}`,
    nome,
    projetoId: "proj-1",
    projetoSigla: sigla,
    projetoAtivo: true,
  }
}

function par(umNome: string, tecnicoId: string, tecnicoNome: string): ParVigente {
  return { umNome, tecnicoId, tecnicoNome }
}

const TECNICOS = [
  { id: "t1", nome: "Anne" },
  { id: "t2", nome: "João" },
  { id: "t3", nome: "Marcos" },
]

function entrada(parcial: Partial<EntradaCobertura>): EntradaCobertura {
  return {
    ums: [um("BSBIA01"), um("BSBIA02"), um("BSBIA03")],
    tecnicos: TECNICOS,
    agendamentos: [],
    ...parcial,
  }
}

test.describe("avaliarCobertura", () => {
  test("emparelhamento completo 1:1 satisfaz o invariante", () => {
    const c = avaliarCobertura(
      entrada({
        agendamentos: [
          par("BSBIA01", "t1", "Anne"),
          par("BSBIA02", "t2", "João"),
          par("BSBIA03", "t3", "Marcos"),
        ],
      })
    )

    expect(c.invarianteOk).toBe(true)
    expect(c.umsSemTecnico).toEqual([])
    expect(c.tecnicosSemUm).toEqual([])
    expect(c.pares).toHaveLength(3)
    expect(descreverProblemas(c)).toEqual([])
  })

  test("UM sem técnico quebra o invariante e é nomeada", () => {
    const c = avaliarCobertura(
      entrada({
        agendamentos: [par("BSBIA01", "t1", "Anne"), par("BSBIA02", "t2", "João")],
      })
    )

    expect(c.invarianteOk).toBe(false)
    expect(c.umsSemTecnico.map((u) => u.nome)).toEqual(["BSBIA03"])
    expect(descreverProblemas(c)).toEqual([
      "BSBIA03 (IA) está sem técnico",
    ])
  })

  test("técnico sem UM aparece, mas não quebra o invariante", () => {
    // Sete técnicos para sete UMs é o caso de projeto; com mais técnicos que
    // UMs alguém sobra legitimamente, e o invariante diz "no máximo uma UM".
    const c = avaliarCobertura(
      entrada({
        ums: [um("BSBIA01"), um("BSBIA02")],
        agendamentos: [par("BSBIA01", "t1", "Anne"), par("BSBIA02", "t2", "João")],
      })
    )

    expect(c.tecnicosSemUm.map((t) => t.nome)).toEqual(["Marcos"])
    expect(c.invarianteOk).toBe(true)
  })

  test("dois técnicos na mesma UM é violação", () => {
    const c = avaliarCobertura(
      entrada({
        agendamentos: [
          par("BSBIA01", "t1", "Anne"),
          par("BSBIA01", "t2", "João"),
          par("BSBIA02", "t3", "Marcos"),
        ],
      })
    )

    expect(c.invarianteOk).toBe(false)
    expect(c.umsComMaisDeUmTecnico).toEqual([
      { umNome: "BSBIA01", tecnicos: ["Anne", "João"] },
    ])
    expect(descreverProblemas(c)).toContain(
      "BSBIA01 tem 2 técnicos agendados: Anne, João"
    )
  })

  test("um técnico em duas UMs é violação", () => {
    const c = avaliarCobertura(
      entrada({
        agendamentos: [
          par("BSBIA01", "t1", "Anne"),
          par("BSBIA02", "t1", "Anne"),
          par("BSBIA03", "t3", "Marcos"),
        ],
      })
    )

    expect(c.invarianteOk).toBe(false)
    expect(c.tecnicosComMaisDeUmaUm).toEqual([
      { tecnicoId: "t1", tecnicoNome: "Anne", ums: ["BSBIA01", "BSBIA02"] },
    ])
  })

  test("vários pontos da MESMA UM para o MESMO técnico não é violação", () => {
    // Uma UM tem vários pontos (ciclo/etapa) e mais de um pode estar agendado
    // para a mesma pessoa. Contar pontos em vez de pares distintos acusaria
    // violação no fluxo normal de operação.
    const c = avaliarCobertura(
      entrada({
        agendamentos: [
          par("BSBIA01", "t1", "Anne"),
          par("BSBIA01", "t1", "Anne"),
          par("BSBIA01", "t1", "Anne"),
          par("BSBIA02", "t2", "João"),
          par("BSBIA03", "t3", "Marcos"),
        ],
      })
    )

    expect(c.invarianteOk).toBe(true)
    expect(c.umsComMaisDeUmTecnico).toEqual([])
    expect(c.pares).toHaveLength(3)
  })

  test("UM agendada fora do cadastro é violação, não é descartada", () => {
    // A ligação ponto → UM é por NOME, não por id. Um nome que não casa com o
    // cadastro significa UM sendo operada sem o cadastro saber — silenciar
    // isso esconderia tanto o par quanto a UM cadastrada que ficou sem gente.
    const c = avaliarCobertura(
      entrada({
        agendamentos: [
          par("BSBIA01", "t1", "Anne"),
          par("BSBIA02", "t2", "João"),
          par("BSBIA0O", "t3", "Marcos"),
        ],
      })
    )

    expect(c.invarianteOk).toBe(false)
    expect(c.paresForaDoCadastro.map((p) => p.umNome)).toEqual(["BSBIA0O"])
    expect(c.umsSemTecnico.map((u) => u.nome)).toEqual(["BSBIA03"])
    expect(descreverProblemas(c)).toContain(
      "BSBIA0O está agendada para Marcos mas não existe no cadastro de UMs"
    )
  })

  test("UM de projeto inativo entra no diagnóstico, com a ressalva", () => {
    const c = avaliarCobertura(
      entrada({
        ums: [
          um("BSBIA01"),
          { ...um("BSBIA09", "XX"), projetoAtivo: false },
        ],
        agendamentos: [par("BSBIA01", "t1", "Anne")],
      })
    )

    expect(c.umsSemTecnico.map((u) => u.nome)).toEqual(["BSBIA09"])
    expect(descreverProblemas(c)).toEqual([
      "BSBIA09 (XX) está sem técnico — projeto inativo ou ausente",
    ])
  })

  test("cadastro e agendamentos vazios: nada a cobrir, invariante válido", () => {
    const c = avaliarCobertura({ ums: [], tecnicos: [], agendamentos: [] })
    expect(c.invarianteOk).toBe(true)
  })
})
