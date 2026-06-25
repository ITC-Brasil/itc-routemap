import { test as setup } from "@playwright/test"
import { STORAGE_STATE } from "../helpers/auth"
import * as fs from "fs"

setup("autenticar usuario de teste", async ({ page }) => {
  // Este setup roda UMA VEZ antes de todos os testes.
  // Como Firebase Auth usa Google Popup (impossível em headless),
  // este arquivo instrui o desenvolvedor a gerar o storage state
  // manualmente na primeira vez.

  const authDir = "e2e/.auth"
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true })
  }

  // Verifica se já existe storage state válido
  if (fs.existsSync(STORAGE_STATE)) {
    console.log("Storage state existente encontrado — reutilizando.")
    return
  }

  console.log(`
  ===================================================
  ATENÇÃO: Storage state não encontrado.

  Para gerar o storage state de autenticação:
  1. Inicie o servidor: npm run dev
  2. Acesse: http://localhost:3000/login
  3. Faça login com a conta de teste Google
  4. Execute: npx playwright test e2e/setup/auth.setup.ts --headed

  Isso salvará a sessão em e2e/.auth/user.json
  ===================================================
  `)

  // Em CI: cria storage state vazio (testes com auth fazem skip)
  if (process.env.CI) {
    fs.writeFileSync(STORAGE_STATE, JSON.stringify({ cookies: [], origins: [] }))
    return
  }

  throw new Error("Storage state não encontrado. Siga as instruções acima.")
})
