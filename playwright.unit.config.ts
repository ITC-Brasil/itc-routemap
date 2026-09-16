import { defineConfig } from "@playwright/test"

/**
 * Config dos testes UNITÁRIOS — funções puras, sem browser e sem servidor.
 *
 * Separado do playwright.config.ts porque aquele sobe `npm run dev` via
 * `webServer` e depende de sessão autenticada: um teste de função pura não
 * precisa de nenhum dos dois, e amarrá-lo ao dev server faria uma regra de
 * calendário depender do banco estar de pé.
 *
 * Playwright é só o runner aqui. O projeto não tinha ferramenta de teste
 * unitário e reusar a que já existe evitou mais uma dependência.
 *
 * Rode com: npm run test:unit
 */
export default defineConfig({
  testDir: "./tests/unit",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: [["list"]],
  // Sem `use.timezoneId`: os testes de fuso precisam valer com a TZ que a
  // máquina tiver. Fixá-la aqui esconderia exatamente o bug que eles cobrem.
})
