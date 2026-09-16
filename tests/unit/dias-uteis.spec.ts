import { test, expect } from "@playwright/test"

import {
  ehDiaUtil,
  formatarIsoSaoPaulo,
  proximaAncoraDeChegada,
  rotularAncora,
} from "../../lib/dias-uteis"

/**
 * Testes da âncora de chegada (08:00 do próximo dia útil).
 *
 * Playwright é usado só como runner — nenhum teste aqui abre browser, e o
 * config `playwright.unit.config.ts` não sobe webServer. O projeto não tinha
 * runner unitário e reusar o que já existe evitou mais uma dependência.
 *
 * Todas as datas são fixas. A função recebe `agora` por parâmetro justamente
 * para que nada aqui dependa do relógio ou da TZ de quem roda.
 */

/** Helper: a data-calendário da âncora, lida em São Paulo. */
function diaDa(ancora: Date): string {
  return formatarIsoSaoPaulo(ancora).slice(0, 10)
}

const SEM_FERIADOS = new Set<string>()

test.describe("proximaAncoraDeChegada", () => {
  test("dia comum: terça → quarta", () => {
    // Terça, 15/09/2026, 10h da manhã em São Paulo.
    const agora = new Date("2026-09-15T10:00:00-03:00")
    expect(diaDa(proximaAncoraDeChegada(agora, SEM_FERIADOS))).toBe("2026-09-16")
  })

  test("nunca aponta para hoje, mesmo de madrugada", () => {
    // 00:05 de terça: ainda assim a âncora é quarta, não as 08h de hoje.
    const agora = new Date("2026-09-15T00:05:00-03:00")
    expect(diaDa(proximaAncoraDeChegada(agora, SEM_FERIADOS))).toBe("2026-09-16")
  })

  test("sexta → segunda", () => {
    const agora = new Date("2026-09-18T14:00:00-03:00")
    expect(diaDa(proximaAncoraDeChegada(agora, SEM_FERIADOS))).toBe("2026-09-21")
  })

  test("sábado 19h → segunda (o caso que originou a mudança)", () => {
    const agora = new Date("2026-09-19T19:00:00-03:00")
    expect(diaDa(proximaAncoraDeChegada(agora, SEM_FERIADOS))).toBe("2026-09-21")
  })

  test("véspera de feriado: pula o feriado", () => {
    // 27/11 é sexta; 30/11 (segunda) é o Dia do Evangélico, distrital do DF.
    const feriados = new Set(["2026-11-30"])
    const agora = new Date("2026-11-27T16:00:00-03:00")
    expect(diaDa(proximaAncoraDeChegada(agora, feriados))).toBe("2026-12-01")
  })

  test("feriado emendado em sequência: pula o bloco inteiro", () => {
    // Quinta 02/04 e sexta 03/04 não úteis + fim de semana → segunda 06/04.
    const feriados = new Set(["2026-04-02", "2026-04-03"])
    const agora = new Date("2026-04-01T09:00:00-03:00")
    expect(diaDa(proximaAncoraDeChegada(agora, feriados))).toBe("2026-04-06")
  })

  test("virada de ano: 31/12 → 04/01, pulando feriado e fim de semana", () => {
    // 31/12/2026 é quinta; 01/01/2027 é sexta e feriado; 02 e 03 são fds.
    const feriados = new Set(["2027-01-01"])
    const agora = new Date("2026-12-31T20:00:00-03:00")
    expect(diaDa(proximaAncoraDeChegada(agora, feriados))).toBe("2027-01-04")
  })

  test("a âncora é 08:00 em São Paulo, isto é, 11:00 UTC", () => {
    const ancora = proximaAncoraDeChegada(
      new Date("2026-09-15T10:00:00-03:00"),
      SEM_FERIADOS
    )
    expect(ancora.toISOString()).toBe("2026-09-16T11:00:00.000Z")
  })

  test("independe do fuso de quem calcula: mesmo instante, mesma âncora", () => {
    // 15/09 23:30 em São Paulo == 16/09 02:30 UTC. Ler o dia em UTC daria 16 e
    // produziria a âncora errada (17/09).
    const agora = new Date("2026-09-16T02:30:00Z")
    expect(diaDa(proximaAncoraDeChegada(agora, SEM_FERIADOS))).toBe("2026-09-16")
  })
})

test.describe("ehDiaUtil", () => {
  test("sábado e domingo não são úteis", () => {
    expect(ehDiaUtil("2026-09-19", SEM_FERIADOS)).toBe(false)
    expect(ehDiaUtil("2026-09-20", SEM_FERIADOS)).toBe(false)
  })

  test("dia da tabela não é útil, mesmo em dia de semana", () => {
    expect(ehDiaUtil("2026-11-30", SEM_FERIADOS)).toBe(true)
    expect(ehDiaUtil("2026-11-30", new Set(["2026-11-30"]))).toBe(false)
  })
})

test.describe("formatarIsoSaoPaulo", () => {
  test("RFC 3339 com offset -03:00, que é o que a Routes API recebe", () => {
    const ancora = proximaAncoraDeChegada(
      new Date("2026-09-15T10:00:00-03:00"),
      SEM_FERIADOS
    )
    expect(formatarIsoSaoPaulo(ancora)).toBe("2026-09-16T08:00:00-03:00")
  })
})

test.describe("rotularAncora", () => {
  test("rótulo legível para a tela de cálculo", () => {
    const ancora = proximaAncoraDeChegada(
      new Date("2026-09-18T14:00:00-03:00"),
      SEM_FERIADOS
    )
    expect(rotularAncora(ancora)).toBe("segunda-feira, 21/09 às 08:00")
  })
})
