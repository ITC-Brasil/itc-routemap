import { test, expect } from "@playwright/test"

test.describe("Segurança — Validação de Input e Exposição de Dados", () => {
  test("IV-06: loteId inválido não expõe stack trace (sem auth → redirect)", async ({ page }) => {
    await page.goto("/historico/id-falso-que-nao-existe-12345")
    await page.waitForLoadState("networkidle")

    // Sem auth, o middleware redireciona para /login — dados não são expostos
    const url = page.url()
    const redirecionouParaLogin = url.includes("/login")

    if (!redirecionouParaLogin) {
      // Se chegou na página, não deve mostrar stack trace
      await expect(page.getByText(/at Object\.|stack|traceback/i)).not.toBeVisible({ timeout: 3000 })
    }

    // Em nenhum caso deve aparecer dados internos de debug
    const html = await page.content()
    expect(html).not.toMatch(/at Object\.|Cannot read properties|TypeError:.*undefined/)
  })


  test("SE-04: .env.local não é servido via HTTP", async ({ page }) => {
    const res = await page.request.get("/.env.local")
    expect(res.status()).toBe(404)
  })

  test("SE-04b: .env não é servido via HTTP", async ({ page }) => {
    const res = await page.request.get("/.env")
    expect(res.status()).toBe(404)
  })

  test("SE-04c: .env.production não é servido via HTTP", async ({ page }) => {
    const res = await page.request.get("/.env.production")
    expect(res.status()).toBe(404)
  })

  test("IV-01: script injection no DOM não executa alert()", async ({ page }) => {
    let alertDisparado = false
    page.on("dialog", () => {
      alertDisparado = true
    })

    await page.goto("/historico/lote-que-nao-existe-<script>alert(1)</script>")
    await page.waitForLoadState("networkidle")

    expect(alertDisparado).toBe(false)
  })

  test("IV-06b: loteId com injeção de path não expõe dados", async ({ page }) => {
    // Tenta path traversal via URL
    const res = await page.request.get("/historico/../api/admin")
    expect([404, 405]).toContain(res.status())
  })

  test("Página de login não vaza informações de configuração", async ({ page }) => {
    const res = await page.request.get("/login")
    const body = await res.text()

    // Chaves de API de servidor não devem aparecer no HTML
    expect(body).not.toContain("GOOGLE_ROUTES_API_KEY")
    expect(body).not.toContain("GEMINI_API_KEY")
    expect(body).not.toContain("GOOGLE_MAPS_SERVER_API_KEY")
  })
})
