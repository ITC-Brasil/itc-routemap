import { test as setup, expect } from "@playwright/test"
import { STORAGE_STATE } from "../helpers/auth"
import * as fs from "fs"
import * as path from "path"

/**
 * Setup de autenticação — roda UMA VEZ antes dos testes (project "setup").
 *
 * Faz login de verdade pela UI com email/senha (Better Auth) usando as
 * credenciais do ambiente e salva a sessão em `tests/e2e/.auth/user.json`.
 * Os specs que precisam de sessão usam `test.use({ storageState: STORAGE_STATE })`.
 *
 * Substituiu a versão legada de Firebase Auth (popup do Google), que não
 * funcionava headless e exigia gerar o storage state à mão.
 *
 * Requer ADMIN_EMAIL e ADMIN_PASSWORD no ambiente (vêm do `.env`, carregado
 * pelo playwright.config.ts).
 */
setup("autenticar usuario de teste", async ({ page }) => {
  const email = (process.env.ADMIN_EMAIL ?? "").toLowerCase().trim()
  const senha = process.env.ADMIN_PASSWORD ?? ""

  if (!email || !senha) {
    throw new Error(
      "Defina ADMIN_EMAIL e ADMIN_PASSWORD no ambiente (.env) para o setup de auth."
    )
  }

  await page.goto("/login")

  await page.locator("#email").fill(email)
  await page.locator("#senha").fill(senha)
  await page.getByRole("button", { name: "Entrar", exact: true }).click()

  // O AuthGuard libera as rotas privadas só depois que a sessão resolve.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 30000,
  })
  // Confirma a sessão pelo cookie do Better Auth — mais estável que casar
  // texto da UI, que varia por página.
  const cookies = await page.context().cookies()
  expect(
    cookies.some((c) => c.name.includes("session_token")),
    "cookie de sessão do Better Auth não foi definido após o login"
  ).toBe(true)

  const dir = path.dirname(STORAGE_STATE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  await page.context().storageState({ path: STORAGE_STATE })
})
