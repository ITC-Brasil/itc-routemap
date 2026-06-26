# 09 — Testes

O sistema usa **Playwright 1.61.1** para testes End-to-End (E2E).

---

## Estrutura dos testes

```
e2e/
├── tests/
│   ├── 01-auth.spec.ts            # Autenticação e autorização
│   ├── 02-calcular-rotas.spec.ts  # UI do calculador de rotas
│   ├── 03-historico.spec.ts       # Histórico de alocações
│   ├── 04-admin-tecnicos.spec.ts  # Gestão de técnicos
│   ├── 07-seguranca.spec.ts       # Testes de segurança
│   ├── 08-regressao.spec.ts       # Testes de regressão
│   └── api/                       # Testes de API routes
├── helpers/                       # Funções auxiliares
├── setup/                         # Setup de autenticação
└── README.md
```

---

## Executando os testes

### Pré-requisitos

```bash
# Instalar browsers do Playwright
npx playwright install
```

### Comandos

```bash
# Todos os testes (headless)
npm run test:e2e

# Interface visual do Playwright
npm run test:e2e:ui

# Com browser visível
npm run test:e2e:headed

# Apenas testes de API
npm run test:e2e:api

# Apenas testes de segurança
npm run test:e2e:seguranca

# Apenas testes de regressão
npm run test:e2e:regressao

# Ver relatório do último run
npm run test:e2e:report
```

---

## Specs por arquivo

### `01-auth.spec.ts` — Autenticação e Autorização

| ID | Teste | Descrição |
|----|-------|-----------|
| AU-05 | `/calcular-rotas` sem login | Redireciona para `/login` |
| AU-05b | `/historico` sem login | Redireciona para `/login` |
| AU-05c | `/admin` sem login | Redireciona para `/login` |
| AU-05d | `/estatisticas` sem login | Redireciona para `/login` |
| AU-06 | Rota privada com login | Carrega normalmente |

> AU-06 é pulado em CI (`test.skip(!!process.env.CI)`) pois requer autenticação manual com Firebase real.

### `02-calcular-rotas.spec.ts` — UI do Calculador

Esses testes usam `storageState: "e2e/.auth/user.json"` para autenticação e são pulados em CI.

| ID | Teste | Descrição |
|----|-------|-----------|
| UI-04 | Botão "Todos" | Seleciona todos os técnicos |
| UI-07 | Calcular desabilitado | Sem seleção, botão fica disabled |
| UI-08 | Estado de loading | Clicar em Calcular mostra spinner |

### `03-historico.spec.ts` — Histórico

Testa renderização da lista de lotes, filtros e detalhe de lote.

### `04-admin-tecnicos.spec.ts` — Admin de Técnicos

Testa CRUD de técnicos: criar, editar, pausar, reativar, deletar.

### `07-seguranca.spec.ts` — Segurança

- Verifica que rotas protegidas redirecionam para login
- Verifica que tokens expirados são tratados corretamente
- Testa que chaves de API não aparecem no HTML do cliente

### `08-regressao.spec.ts` — Regressão

Suite de regressão para garantir que funcionalidades existentes não quebram com novas features. Executado após cada merge em `main`.

### `api/` — Testes de API Routes

Testa as API routes diretamente via HTTP:

```bash
# Exemplo: POST /api/routes/alocar com payload inválido
# Deve retornar 400 com mensagem de erro clara
```

---

## Autenticação nos testes

O Playwright usa `storageState` para reutilizar uma sessão autenticada entre testes. O setup em `e2e/setup/` realiza o login uma vez e salva o estado:

```typescript
// e2e/setup/auth.setup.ts
import { test as setup } from "@playwright/test"

setup("authenticate", async ({ page }) => {
  await page.goto("/login")
  await page.fill('[name="email"]', process.env.TEST_EMAIL!)
  await page.fill('[name="password"]', process.env.TEST_PASSWORD!)
  await page.click('button[type="submit"]')
  await page.waitForURL("/")
  await page.context().storageState({ path: "e2e/.auth/user.json" })
})
```

O arquivo `e2e/.auth/user.json` está no `.gitignore` e não é commitado.

---

## Configuração do Playwright

`playwright.config.ts` na raiz do projeto. Configurações relevantes:

```typescript
{
  baseURL: "http://localhost:3000",
  use: {
    storageState: "e2e/.auth/user.json",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  }
}
```

---

## CI/CD

O repositório tem um workflow do GitHub Actions (`.github/workflows/`) que executa os testes de autenticação (que não requerem Firebase real) em cada push para `main` e em pull requests.

Testes que requerem Firebase real são marcados com:

```typescript
test.skip(!!process.env.CI, "Requer auth e Firebase real")
```

---

## Plano de testes completo

O plano detalhado com todos os casos de teste, critérios de aceitação e status está documentado em `docs/plano-testes-ouro.md` (adicionado no commit `22f7513`). O plano cobre:

- Autenticação e autorização
- CRUD de técnicos, projetos e localidades
- Fluxo completo de cálculo e confirmação de alocação
- Histórico: filtros, detalhe, cancelamento de lote
- Estatísticas
- Comportamento offline e erros de rede
- Segurança (OWASP básico)

---

## Adicionando novos testes

1. Crie um arquivo `e2e/tests/XX-nome.spec.ts`
2. Use `test.describe` para agrupar casos relacionados
3. Se o teste requer login, adicione `test.use({ storageState: "e2e/.auth/user.json" })`
4. Se o teste requer Firebase real (dados ao vivo), adicione `test.skip(!!process.env.CI, "...")`
5. Prefixe IDs de teste com a categoria (AU, UI, HI, AD, ST…)
