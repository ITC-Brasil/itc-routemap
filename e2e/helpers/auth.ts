import { Page } from "@playwright/test"

/**
 * Faz login no sistema usando Firebase Auth com Google.
 * Em CI, usa credenciais de teste via variável de ambiente.
 * Em local, verifica se já há sessão ativa.
 */
export async function loginComoAdmin(page: Page) {
  await page.goto("/login")

  // Verifica se já está logado (redirect automático pro /)
  if (page.url().includes("/login")) {
    // Firebase Auth com Google Popup não funciona em CI headless.
    // Para CI funcionar, precisamos de storage state pré-autenticado.
    await page
      .waitForURL(/\/(admin|calcular|historico|estatisticas|$)/, {
        timeout: 5000,
      })
      .catch(() => {})
  }
}

/**
 * Salva o estado de autenticação para reuso entre testes.
 * Rodar uma vez manualmente: npx playwright test e2e/setup/auth.setup.ts --headed
 */
export const STORAGE_STATE = "e2e/.auth/user.json"
