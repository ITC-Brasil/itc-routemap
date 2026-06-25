import { test, expect } from "@playwright/test"

test.describe("Admin — Técnicos", () => {
  test.use({ storageState: "e2e/.auth/user.json" })
  test.skip(!!process.env.CI, "Requer auth e Firebase real")

  test.beforeEach(async ({ page }) => {
    await page.goto("/admin/tecnicos")
    await page.waitForLoadState("networkidle")
  })

  test("Página lista técnicos ou exibe estado vazio", async ({ page }) => {
    const temLista = (await page.locator(".divide-y [data-state]").count()) > 0
    const temVazio = (await page.getByText(/nenhum técnico/i).count()) > 0
    expect(temLista || temVazio).toBeTruthy()
  })

  test("AD-01: salvar formulário sem nome mostra validação", async ({ page }) => {
    // Abre modal de cadastro
    await page.getByRole("button", { name: /Cadastrar/i }).first().click()

    // Aguarda modal abrir
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 3000 })

    // Tenta salvar sem preencher nada
    await page.getByRole("button", { name: /^Cadastrar$/ }).click()

    // Deve mostrar validação de campo obrigatório
    await expect(
      page.getByText(/obrigatório|informe o nome|nome muito curto/i)
    ).toBeVisible({ timeout: 3000 })
  })

  test("AD-02: geocodificar Plus Code inválido mostra erro", async ({ page }) => {
    await page.getByRole("button", { name: /Cadastrar/i }).first().click()
    await expect(page.getByRole("dialog")).toBeVisible()

    const plusCodeInput = page.getByPlaceholder(/Plus Code/i)
    await plusCodeInput.fill("INVALIDO")

    await page.getByRole("button", { name: /Obter Coordenadas/i }).click()

    // Deve mostrar toast de erro
    await expect(
      page.locator("[data-sonner-toast]").filter({ hasText: /não foi possível|inválido|erro/i })
    ).toBeVisible({ timeout: 8000 })
  })

  test("AD-03: geocodificar Plus Code válido preenche coordenadas", async ({ page }) => {
    await page.getByRole("button", { name: /Cadastrar/i }).first().click()
    await expect(page.getByRole("dialog")).toBeVisible()

    const plusCodeInput = page.getByPlaceholder(/Plus Code/i)
    await plusCodeInput.fill("85QW+RFW SOBRADINHO, BRASÍLIA - DF")

    await page.getByRole("button", { name: /Obter Coordenadas/i }).click()

    // Aguarda preenchimento (chamada de API real)
    await page.waitForTimeout(4000)

    // Latitude e longitude devem estar preenchidas (input desabilitado com valor)
    const latInput = page.locator("input[disabled]").first()
    const value = await latInput.inputValue()
    expect(value).not.toBe("")
  })

  test("Accordion do técnico expande e mostra dados", async ({ page }) => {
    const accordionItem = page.locator("[data-state]").first()
    if (await accordionItem.count() === 0) test.skip()

    await accordionItem.click()

    // Conteúdo do accordion deve aparecer
    await expect(
      page.getByText(/Endereço|Ponto de referência|Plus Code/i).first()
    ).toBeVisible({ timeout: 3000 })
  })
})
