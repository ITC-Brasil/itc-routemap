import { defineConfig, devices } from "@playwright/test"
import { STORAGE_STATE } from "./tests/e2e/helpers/auth"
import * as dotenv from "dotenv"
dotenv.config({ path: ".env.local" })
// `.env` também: ADMIN_EMAIL/ADMIN_PASSWORD (usados pelo setup de auth) vivem
// lá, não no .env.local. Sem override — o .env.local continua tendo precedência.
dotenv.config({ path: ".env" })

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["list"],
  ],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },
  projects: [
    {
      // Login real pela UI, salva a sessão em tests/e2e/.auth/user.json.
      // testMatch é necessário: o default do Playwright só casa *.spec.ts.
      name: "setup",
      testMatch: /.*\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Specs que verificam acesso SEM sessão (redirect pro /login,
      // exposição de dados) — precisam de contexto anônimo.
      name: "anonimo",
      testMatch: /(01-auth|07-seguranca)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Todo o resto roda autenticado, reusando a sessão do project "setup".
      name: "chromium",
      testIgnore: [/(01-auth|07-seguranca)\.spec\.ts/, /.*\.setup\.ts/],
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
