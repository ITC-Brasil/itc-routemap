import { test, expect } from "@playwright/test"

/**
 * Testes de API para /api/routes/alocar (sem auth — rodam em CI)
 * Cobre validação de input (AL-01 a AL-10).
 */
test.describe("API — /api/routes/alocar", () => {
  const BASE = "http://localhost:3000"

  const tecnicoValido = {
    id: "t1",
    nome: "Técnico Teste",
    endereco: "Rua Teste, 1",
    latitude: -15.7801,
    longitude: -47.9292,
  }

  const destinoValido = {
    id: "d1",
    umNome: "UM-TESTE-01",
    projetoId: "proj1",
    projetoSigla: "TST",
    raNome: "RA Teste",
    endereco: "Rua Destino, 2",
    latitude: -15.8301,
    longitude: -47.9892,
    ciclo: 1,
    etapa: 1,
  }

  test("AL-01: sem técnicos retorna 400", async ({ request }) => {
    const res = await request.post(`${BASE}/api/routes/alocar`, {
      data: {
        tecnicos: [],
        destinos: [destinoValido],
      },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.sucesso).toBe(false)
    expect(body.erro).toMatch(/técnico/i)
  })

  test("AL-02: sem destinos retorna 400", async ({ request }) => {
    const res = await request.post(`${BASE}/api/routes/alocar`, {
      data: {
        tecnicos: [tecnicoValido],
        destinos: [],
      },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.sucesso).toBe(false)
    expect(body.erro).toMatch(/destino/i)
  })

  test("AL-03: técnico com latitude null retorna 400", async ({ request }) => {
    const res = await request.post(`${BASE}/api/routes/alocar`, {
      data: {
        tecnicos: [{ ...tecnicoValido, latitude: null }],
        destinos: [destinoValido],
      },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.sucesso).toBe(false)
  })

  test("AL-04: técnico com longitude null retorna 400", async ({ request }) => {
    const res = await request.post(`${BASE}/api/routes/alocar`, {
      data: {
        tecnicos: [{ ...tecnicoValido, longitude: null }],
        destinos: [destinoValido],
      },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.sucesso).toBe(false)
  })

  test("AL-05: destino sem coordenadas retorna 400", async ({ request }) => {
    const res = await request.post(`${BASE}/api/routes/alocar`, {
      data: {
        tecnicos: [tecnicoValido],
        destinos: [{ ...destinoValido, latitude: null, longitude: null }],
      },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.sucesso).toBe(false)
  })

  test("AL-06: latitude fora do range retorna 400", async ({ request }) => {
    const res = await request.post(`${BASE}/api/routes/alocar`, {
      data: {
        tecnicos: [{ ...tecnicoValido, latitude: 999 }],
        destinos: [destinoValido],
      },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.sucesso).toBe(false)
  })

  test("AL-09: body inválido (não é JSON) retorna erro", async ({ request }) => {
    const res = await request.post(`${BASE}/api/routes/alocar`, {
      headers: { "Content-Type": "application/json" },
      data: "texto-invalido-nao-e-json",
    })
    expect([400, 500]).toContain(res.status())
  })

  test("AL-10: body vazio retorna 400", async ({ request }) => {
    const res = await request.post(`${BASE}/api/routes/alocar`, {
      data: {},
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.sucesso).toBe(false)
  })

  test("Resposta de erro tem formato { sucesso: false, erro: string }", async ({ request }) => {
    const res = await request.post(`${BASE}/api/routes/alocar`, {
      data: { tecnicos: [], destinos: [] },
    })
    const body = await res.json()
    expect(typeof body.sucesso).toBe("boolean")
    expect(body.sucesso).toBe(false)
    expect(typeof body.erro).toBe("string")
    expect(body.erro.length).toBeGreaterThan(0)
  })
})
