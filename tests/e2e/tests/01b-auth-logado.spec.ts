import { test, expect } from "@playwright/test"

/**
 * Contrapartida autenticada do 01-auth.spec.ts.
 *
 * Arquivo separado porque a divisão de projects no playwright.config.ts é por
 * nome de arquivo: 01-auth e 07-seguranca rodam no project "anonimo" (contexto
 * sem sessão) e todo o resto no project "chromium" (com storageState).
 *
 * AU-06 estava no 01-auth e passava por acidente: sem proxy o redirect para
 * /login era client-side, então o assert corria antes de acontecer.
 */
test.describe("Autenticação — sessão válida", () => {
  test.use({ storageState: "tests/e2e/.auth/user.json" })

  test("AU-06: rota privada com login carrega normalmente", async ({ page }) => {
    await page.goto("/")
    await expect(page).not.toHaveURL(/\/login/)
  })
})
