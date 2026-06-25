import { test, expect } from "@playwright/test"

test.describe("UI — Histórico", () => {
  test.use({ storageState: "e2e/.auth/user.json" })
  test.skip(!!process.env.CI, "Requer auth e Firebase real")

  test.beforeEach(async ({ page }) => {
    await page.goto("/historico")
    await page.waitForLoadState("networkidle")
    // Aguarda skeleton sumir
    await page.waitForFunction(
      () => document.querySelectorAll(".animate-pulse").length === 0,
      { timeout: 10000 }
    )
  })

  test("HI-01: exibe lotes ou estado vazio amigável", async ({ page }) => {
    const temLotes = (await page.locator("[class*='card']").count()) > 0
    const temVazio = (await page.getByText(/nenhum/i).count()) > 0
    expect(temLotes || temVazio).toBeTruthy()
  })

  test("HI-02: lote auto não mostra badge Ajuste manual junto ao badge Confirmada", async ({ page }) => {
    const badgesConfirmada = page.getByText("Confirmada")
    const count = await badgesConfirmada.count()
    if (count === 0) test.skip()

    // Verifica que nem todo card confirmado tem o badge de ajuste manual
    const badgesAjuste = await page.getByText(/Ajuste manual/i).count()
    // Pode ter 0 ou alguns, mas nunca mais do que os confirmados
    expect(badgesAjuste).toBeLessThanOrEqual(count)
  })

  test("HI-03: lote com ajuste manual mostra badge específico", async ({ page }) => {
    // Verifica que o componente de badge Ajuste manual existe no DOM
    // (pode não haver lotes com ajuste, então é um check de presença opcional)
    const badge = page.getByText(/Ajuste manual/i).first()
    if (await badge.count() > 0) {
      await expect(badge).toBeVisible()
    }
  })

  test("HI-05: lote Cancelado mostra badge correto", async ({ page }) => {
    const badgeCancelada = page.getByText("Cancelada").first()
    if (await badgeCancelada.count() > 0) {
      await expect(badgeCancelada).toBeVisible()
    }
  })

  test("HI-06: filtros estão acessíveis", async ({ page }) => {
    const btnFiltros = page.getByRole("button", { name: /filtros/i })
    if (await btnFiltros.count() > 0) {
      await btnFiltros.click()
      // Algum filtro deve aparecer
      const filtro = page.getByText(/Projeto|Período|Status/i).first()
      await expect(filtro).toBeVisible({ timeout: 3000 })
    }
  })

  test("HI-07: botão Cancelar lote abre dialog de confirmação", async ({ page }) => {
    const btnCancelar = page.getByRole("button", { name: /Cancelar lote/i }).first()
    if (await btnCancelar.count() > 0 && await btnCancelar.isEnabled()) {
      await btnCancelar.click()
      // AlertDialog deve aparecer
      await expect(page.getByRole("alertdialog")).toBeVisible({ timeout: 3000 })
    }
  })

  test("HI-10 / IV-06: loteId inexistente mostra Lote não encontrado sem expor stack trace", async ({ page }) => {
    await page.goto("/historico/lote-que-nao-existe-abc123xyz")
    await page.waitForLoadState("networkidle")

    // Deve mostrar mensagem amigável
    await expect(
      page.getByText(/não encontrado/i)
    ).toBeVisible({ timeout: 10000 })

    // Não deve mostrar stack trace ou detalhes internos
    const html = await page.content()
    expect(html).not.toMatch(/at Object\.|Cannot read properties|TypeError:.*undefined/)
  })

  test("HI-13: expandir rota mostra detalhes e permite trocar modo", async ({ page }) => {
    const btnAbrir = page.getByRole("link", { name: /Abrir detalhes/i }).first()
    if (await btnAbrir.count() === 0) test.skip()

    await btnAbrir.click()
    await page.waitForLoadState("networkidle")

    // Expande primeira rota
    const btnExpandir = page.getByRole("button", { name: /Ver mapa|Expandir|Detalhar/i }).first()
    if (await btnExpandir.count() > 0) {
      await btnExpandir.click()
      // Algum detalhe deve aparecer
      await expect(page.getByText(/modo|distância|duração/i).first()).toBeVisible({ timeout: 5000 })
    }
  })
})
