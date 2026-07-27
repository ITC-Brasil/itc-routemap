import { test, expect } from "@playwright/test"

test.describe("Autenticação e Autorização", () => {
  test("AU-05: /calcular-rotas sem login redireciona para /login", async ({ page }) => {
    await page.goto("/calcular-rotas")
    await expect(page).toHaveURL(/\/login/)
  })

  test("AU-05b: /historico sem login redireciona para /login", async ({ page }) => {
    await page.goto("/historico")
    await expect(page).toHaveURL(/\/login/)
  })

  test("AU-05c: /admin sem login redireciona para /login", async ({ page }) => {
    await page.goto("/admin/tecnicos")
    await expect(page).toHaveURL(/\/login/)
  })

  test("AU-05d: /estatisticas sem login redireciona para /login", async ({ page }) => {
    await page.goto("/estatisticas")
    await expect(page).toHaveURL(/\/login/)
  })

  // AU-06 ("rota privada COM login") vive em 01b-auth-logado.spec.ts: este
  // arquivo roda no project "anonimo", sem sessão, então um teste que exige
  // login estava no lugar errado.
})
