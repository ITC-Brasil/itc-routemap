import { test, expect } from "@playwright/test"

test.describe("UI — Calcular Rotas", () => {
  test.use({ storageState: "e2e/.auth/user.json" })
  test.skip(!!process.env.CI, "Requer auth e Firebase real")

  test.beforeEach(async ({ page }) => {
    await page.goto("/calcular-rotas")
    await page.waitForLoadState("networkidle")
  })

  test("UI-04: botão Todos marca todos os técnicos", async ({ page }) => {
    // Limpa seleção primeiro, se possível
    const btnLimpar = page.getByRole("button", { name: "Limpar" }).first()
    if (await btnLimpar.isEnabled()) await btnLimpar.click()

    // Seleciona todos
    await page.getByRole("button", { name: "Todos" }).first().click()

    // Todos os checkboxes (ou itens de lista) devem estar marcados
    const checkboxes = page.locator("li").filter({ has: page.locator("[role='checkbox']") })
    const count = await checkboxes.count()
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        await expect(checkboxes.nth(i).locator("[role='checkbox']")).toBeChecked()
      }
    }
  })

  test("UI-07: botão Calcular desabilitado sem seleção", async ({ page }) => {
    const btnLimpar = page.getByRole("button", { name: "Limpar" }).first()
    if (await btnLimpar.isEnabled()) await btnLimpar.click()

    const btnCalcular = page.getByRole("button", { name: /Calcular Alocação/i })
    await expect(btnCalcular).toBeDisabled()
  })

  test("UI-08: clicar Calcular mostra estado de loading", async ({ page }) => {
    const btnCalcular = page.getByRole("button", { name: /Calcular Alocação/i })
    if (!(await btnCalcular.isEnabled())) test.skip()

    await btnCalcular.click()
    await expect(
      page.getByText(/Calculando alocação ótima/i)
    ).toBeVisible({ timeout: 5000 })
  })

  test("UI-09: resultado mostra banner de análise da IA", async ({ page }) => {
    const btnCalcular = page.getByRole("button", { name: /Calcular Alocação/i })
    if (!(await btnCalcular.isEnabled())) test.skip()

    await btnCalcular.click()

    // Aguarda resultado (pode demorar até 45s com Google Routes + Gemini)
    await expect(
      page.getByText(/Análise da alocação/i)
    ).toBeVisible({ timeout: 45000 })
  })

  test("UI-10: métricas da rodada são exibidas", async ({ page }) => {
    const btnCalcular = page.getByRole("button", { name: /Calcular Alocação/i })
    if (!(await btnCalcular.isEnabled())) test.skip()

    await btnCalcular.click()
    await expect(page.getByText(/Análise da alocação/i)).toBeVisible({ timeout: 45000 })

    // Verifica que existe ao menos uma métrica numérica (tempo total/médio)
    await expect(page.getByText(/min/i).first()).toBeVisible()
  })

  test("UI-14/15: dropdowns de swap mostram após expandir linha", async ({ page }) => {
    const btnCalcular = page.getByRole("button", { name: /Calcular Alocação/i })
    if (!(await btnCalcular.isEnabled())) test.skip()

    await btnCalcular.click()
    await expect(page.getByText(/Análise da alocação/i)).toBeVisible({ timeout: 45000 })

    // Expande primeira alocação
    const btnDetalhar = page.getByRole("button", { name: /Detalhar/i }).first()
    if (await btnDetalhar.count() > 0) {
      await btnDetalhar.click()
      await expect(page.getByText(/Trocar técnico por/i)).toBeVisible()
      await expect(page.getByText(/Trocar UM por/i)).toBeVisible()
    }
  })

  test("RG-09/10: swap + Voltar pra ótima restaura banner Gemini", async ({ page }) => {
    const btnCalcular = page.getByRole("button", { name: /Calcular Alocação/i })
    if (!(await btnCalcular.isEnabled())) test.skip()

    await btnCalcular.click()
    await expect(page.getByText(/Análise da alocação/i)).toBeVisible({ timeout: 45000 })

    // Expande primeira linha
    const btnDetalhar = page.getByRole("button", { name: /Detalhar/i }).first()
    if (await btnDetalhar.count() === 0) test.skip()

    await btnDetalhar.click()

    // Tenta swap via combobox de técnico
    const comboTecnico = page.getByRole("combobox").first()
    if (await comboTecnico.count() > 0) {
      await comboTecnico.click()
      const opcao = page.getByRole("option").nth(1) // segundo técnico
      if (await opcao.count() > 0) {
        await opcao.click()

        // Banner amarelo de ajuste manual
        await expect(
          page.getByText(/Alocação ajustada manualmente/i)
        ).toBeVisible({ timeout: 10000 })

        // Voltar pra ótima (banner)
        await page.getByRole("button", { name: /Voltar pra ótima/i }).first().click()

        // Banner Gemini volta
        await expect(page.getByText(/Análise da alocação/i)).toBeVisible()
      }
    }
  })

  test("UI-20: Voltar para seleção reseta o estado", async ({ page }) => {
    const btnCalcular = page.getByRole("button", { name: /Calcular Alocação/i })
    if (!(await btnCalcular.isEnabled())) test.skip()

    await btnCalcular.click()
    await expect(page.getByText(/Análise da alocação/i)).toBeVisible({ timeout: 45000 })

    await page.getByRole("button", { name: /Voltar para seleção/i }).click()

    // Deve mostrar a tela de seleção novamente
    await expect(
      page.getByRole("button", { name: /Calcular Alocação/i })
    ).toBeVisible()
  })
})
