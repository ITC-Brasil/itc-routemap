import { test, expect } from "@playwright/test"

/**
 * Testes de API para /api/routes/single (sem auth — rodam em CI)
 * Cobre validação de input (SI-03 a SI-05).
 */
test.describe("API — /api/routes/single", () => {
  const BASE = "http://localhost:3000"

  const origemValida = { latitude: -15.7801, longitude: -47.9292 }
  const destinoValido = { latitude: -15.8301, longitude: -47.9892 }

  test("SI-03: sem origem retorna 400", async ({ request }) => {
    const res = await request.post(`${BASE}/api/routes/single`, {
      data: {
        destino: destinoValido,
        modo: "DRIVE",
      },
    })
    expect(res.status()).toBe(400)
  })

  test("SI-04: sem destino retorna 400", async ({ request }) => {
    const res = await request.post(`${BASE}/api/routes/single`, {
      data: {
        origem: origemValida,
        modo: "DRIVE",
      },
    })
    expect(res.status()).toBe(400)
  })

  test("SI-05: modo inválido retorna 400", async ({ request }) => {
    const res = await request.post(`${BASE}/api/routes/single`, {
      data: {
        origem: origemValida,
        destino: destinoValido,
        modo: "HELICOPTER",
      },
    })
    expect(res.status()).toBe(400)
  })

  test("SI-05b: modo vazio retorna 400", async ({ request }) => {
    const res = await request.post(`${BASE}/api/routes/single`, {
      data: {
        origem: origemValida,
        destino: destinoValido,
        modo: "",
      },
    })
    expect(res.status()).toBe(400)
  })

  test("Body de erro é JSON com mensagem legível", async ({ request }) => {
    const res = await request.post(`${BASE}/api/routes/single`, {
      data: { modo: "DRIVE" }, // sem origem e destino
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    // Deve ter algum campo de erro
    expect(body.erro ?? body.message ?? body.mensagem).toBeTruthy()
  })
})
