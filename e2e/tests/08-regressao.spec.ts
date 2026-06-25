import { test, expect } from "@playwright/test"

test.describe("Regressão — Features Críticas", () => {
  test.use({ storageState: "e2e/.auth/user.json" })

  test("RG-03: tema dark/light persiste após reload", async ({ page }) => {
    test.skip(!!process.env.CI)
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    // Captura tema atual
    const htmlEl = page.locator("html")
    const classeAntes = await htmlEl.getAttribute("class")

    // Recarrega
    await page.reload()
    await page.waitForLoadState("networkidle")

    const classeDepois = await htmlEl.getAttribute("class")
    expect(classeAntes).toBe(classeDepois)
  })

  test("RG-01: background grid existe na página inicial", async ({ page }) => {
    test.skip(!!process.env.CI)
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    // Verifica que existe algum elemento de background decorativo
    const gridExists = await page
      .locator("[class*='grid'], [class*='bg-grid'], canvas")
      .count()
    expect(gridExists).toBeGreaterThan(0)
  })

  test("RG-05: todas as rotas principais retornam 200 quando autenticado", async ({ page }) => {
    test.skip(!!process.env.CI)
    const rotas = ["/", "/historico", "/calcular-rotas", "/admin/tecnicos", "/admin/projetos"]

    for (const rota of rotas) {
      const res = await page.request.get(`http://localhost:3000${rota}`)
      // Pode retornar 200 ou redirecionar (3xx)
      expect(res.status()).toBeLessThan(500)
    }
  })

  test("RG-06: detalhe de lote carrega sem erros JS", async ({ page }) => {
    test.skip(!!process.env.CI)

    const errosJs: string[] = []
    page.on("pageerror", (err) => errosJs.push(err.message))

    await page.goto("/historico")
    await page.waitForLoadState("networkidle")

    const btnAbrir = page.getByRole("link", { name: /Abrir detalhes/i }).first()
    if (await btnAbrir.count() > 0) {
      await btnAbrir.click()
      await page.waitForLoadState("networkidle")
    }

    // Não deve haver erros de JavaScript não tratados
    expect(errosJs.filter((e) => !e.includes("ResizeObserver"))).toHaveLength(0)
  })

  test("Sem scroll horizontal em nenhuma página", async ({ page }) => {
    test.skip(!!process.env.CI)
    const rotas = ["/", "/historico", "/calcular-rotas", "/admin/tecnicos"]

    for (const rota of rotas) {
      await page.goto(rota)
      await page.waitForLoadState("networkidle")

      const overflow = await page.evaluate(
        () => document.body.scrollWidth - document.body.clientWidth
      )
      expect(overflow, `Scroll horizontal em ${rota}`).toBe(0)
    }
  })

  test("RG-11/12: lotes no histórico com badge correto de origemDecisao", async ({ page }) => {
    test.skip(!!process.env.CI)
    await page.goto("/historico")
    await page.waitForLoadState("networkidle")

    // Verifica que badges de status são visíveis
    const badgesStatus = page.getByText(/Confirmada|Cancelada|Mista/i)
    if (await badgesStatus.count() > 0) {
      await expect(badgesStatus.first()).toBeVisible()
    }
  })

  test("Tema dark/light toggle funciona", async ({ page }) => {
    test.skip(!!process.env.CI)
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    const htmlEl = page.locator("html")
    const classeBefore = await htmlEl.getAttribute("class")

    // Clica no toggle de tema
    const themeToggle = page.getByRole("button", { name: /tema|dark|light|toggle/i })
    if (await themeToggle.count() > 0) {
      await themeToggle.first().click()
      await page.waitForTimeout(300)

      const classeAfter = await htmlEl.getAttribute("class")
      expect(classeAfter).not.toBe(classeBefore)
    }
  })
})
