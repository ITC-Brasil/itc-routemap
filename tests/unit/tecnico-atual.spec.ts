import { test, expect } from "@playwright/test"

import {
  ErroTecnicoAtual,
  planejarTecnicoAtual,
  separarCandidatos,
  type OperacaoTecnicoAtual,
  type UmTecnicoAtual,
} from "../../lib/tecnico-atual"

/**
 * Plano de escrita de ums.tecnicoAtualId sob índice único.
 *
 * `aplicarComIndiceUnico` imita o Postgres: checa o índice a CADA UPDATE, não
 * só no fim — é isso que faz a ordem das operações importar.
 */
function aplicarComIndiceUnico(
  ums: UmTecnicoAtual[],
  operacoes: OperacaoTecnicoAtual[]
): Map<string, string | null> {
  const estado = new Map(ums.map((u) => [u.umId, u.tecnicoAtualId]))
  for (const op of operacoes) {
    if (op.tecnicoAtualId !== null) {
      for (const [umId, tecnicoId] of estado) {
        if (umId !== op.umId && tecnicoId === op.tecnicoAtualId) {
          throw new Error(
            `índice único violado: ${op.tecnicoAtualId} em ${umId} e ${op.umId}`
          )
        }
      }
    }
    estado.set(op.umId, op.tecnicoAtualId)
  }
  return estado
}

const A: UmTecnicoAtual = { umId: "um-a", umNome: "SPV01", tecnicoAtualId: "x" }
const B: UmTecnicoAtual = { umId: "um-b", umNome: "SPV02", tecnicoAtualId: "y" }

test.describe("planejarTecnicoAtual", () => {
  test("troca A<->B não viola o índice em nenhum passo", () => {
    const ums = [A, B]
    const plano = planejarTecnicoAtual(ums, [
      { umId: "um-a", tecnicoId: "y" },
      { umId: "um-b", tecnicoId: "x" },
    ])

    const final = aplicarComIndiceUnico(ums, plano)
    expect(final.get("um-a")).toBe("y")
    expect(final.get("um-b")).toBe("x")
  })

  test("a ordem ingênua da mesma troca viola o índice (é o que o plano evita)", () => {
    expect(() =>
      aplicarComIndiceUnico(
        [A, B],
        [
          { umId: "um-a", tecnicoAtualId: "y" },
          { umId: "um-b", tecnicoAtualId: "x" },
        ]
      )
    ).toThrow(/índice único violado/)
  })

  test("zera todas as afetadas antes de gravar qualquer valor", () => {
    const plano = planejarTecnicoAtual([A, B], [
      { umId: "um-a", tecnicoId: "y" },
      { umId: "um-b", tecnicoId: "x" },
    ])
    const primeiroValor = plano.findIndex((op) => op.tecnicoAtualId !== null)
    const ultimoNull = plano.map((op) => op.tecnicoAtualId).lastIndexOf(null)
    expect(ultimoNull).toBeLessThan(primeiroValor)
  })

  test("UM que fica sem ponto Agendado termina NULL", () => {
    const final = aplicarComIndiceUnico(
      [A],
      planejarTecnicoAtual([A], [{ umId: "um-a", tecnicoId: null }])
    )
    expect(final.get("um-a")).toBeNull()
  })

  test("UM fora da transação não é tocada", () => {
    const C: UmTecnicoAtual = { umId: "um-c", umNome: "BSBIA01", tecnicoAtualId: "z" }
    const plano = planejarTecnicoAtual([A, B, C], [
      { umId: "um-a", tecnicoId: "y" },
      { umId: "um-b", tecnicoId: "x" },
    ])
    expect(plano.some((op) => op.umId === "um-c")).toBe(false)
  })

  test("técnico dono de UM fora da transação é recusado com mensagem clara", () => {
    const C: UmTecnicoAtual = { umId: "um-c", umNome: "BSBIA01", tecnicoAtualId: "z" }
    expect(() =>
      planejarTecnicoAtual([A, C], [{ umId: "um-a", tecnicoId: "z" }])
    ).toThrow(ErroTecnicoAtual)
    expect(() =>
      planejarTecnicoAtual([A, C], [{ umId: "um-a", tecnicoId: "z" }])
    ).toThrow(/já é o técnico atual de BSBIA01/)
  })

  test("mesmo técnico como alvo de duas UMs é recusado", () => {
    expect(() =>
      planejarTecnicoAtual([A, B], [
        { umId: "um-a", tecnicoId: "w" },
        { umId: "um-b", tecnicoId: "w" },
      ])
    ).toThrow(ErroTecnicoAtual)
  })
})

test.describe("separarCandidatos", () => {
  const paulo = { id: "paulo", nome: "Paulo" }
  const allan = { id: "allan", nome: "Allan" }
  const novo = { id: "novo", nome: "Técnico sem UM" }
  const ums = [
    { nome: "SPV01", tecnicoAtualId: "paulo" },
    { nome: "BSBIA01", tecnicoAtualId: "allan" },
    { nome: "QDFM01", tecnicoAtualId: null },
  ]

  test("técnico sem UM é sempre candidato", () => {
    const { candidatos } = separarCandidatos([novo], ums, new Set())
    expect(candidatos).toEqual([novo])
  })

  test("dono de UM do lote é candidato; dono de UM fora do lote fica de fora", () => {
    const { candidatos, foraDoLote } = separarCandidatos(
      [paulo, allan, novo],
      ums,
      new Set(["BSBIA01", "QDFM01"])
    )
    expect(candidatos.map((t) => t.id)).toEqual(["allan", "novo"])
    expect(foraDoLote).toEqual([{ tecnico: paulo, umNome: "SPV01" }])
  })

  test("com as duas UMs no lote, a troca entre os donos é possível", () => {
    const { candidatos, foraDoLote } = separarCandidatos(
      [paulo, allan],
      ums,
      new Set(["SPV01", "BSBIA01"])
    )
    expect(candidatos).toHaveLength(2)
    expect(foraDoLote).toHaveLength(0)
  })
})
