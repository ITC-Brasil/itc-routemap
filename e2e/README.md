# Testes E2E — ITC RouteMap

## Pré-requisitos

- Node.js 20+
- Servidor rodando: `npm run dev`
- Chromium: `npx playwright install chromium`

## Primeira execução (gerar autenticação)

Os testes que acessam Firebase precisam de um storage state de autenticação.

1. Inicie o servidor: `npm run dev`
2. Acesse `http://localhost:3000/login` e faça login com a conta de teste Google
3. Execute: `npx playwright test e2e/setup/auth.setup.ts --headed`
4. O arquivo `e2e/.auth/user.json` será criado automaticamente

## Rodar testes

```bash
# Todos os testes (servidor sobe automaticamente se não estiver rodando)
npm run test:e2e

# Com interface visual do Playwright
npm run test:e2e:ui

# Só testes de API (sem auth — rápido, roda em CI)
npm run test:e2e:api

# Só segurança
npm run test:e2e:seguranca

# Só regressão
npm run test:e2e:regressao

# Com browser visível
npm run test:e2e:headed

# Ver relatório da última execução
npm run test:e2e:report
```

## GitHub Actions (CI/CD)

Os testes rodam automaticamente a cada push em `main`.

**O que roda em CI** (sem auth real):
- `01-auth.spec.ts` — redirecionamentos de rotas protegidas
- `07-seguranca.spec.ts` — exposição de arquivos .env e injeção
- `tests/api/alocar.spec.ts` — validação de input da API de alocação
- `tests/api/single.spec.ts` — validação de input da API de rota individual

**O que pula em CI** (requer Firebase real):
- `02-calcular-rotas.spec.ts` — fluxo completo com Google Routes + Gemini
- `03-historico.spec.ts` — dados reais do Firestore
- `04-admin-tecnicos.spec.ts` — CRUD real de técnicos
- `08-regressao.spec.ts` — features visuais e temas

## Configurar secrets no GitHub

Para que o CI construa o app corretamente, configure os seguintes secrets em
**Settings → Secrets and variables → Actions**:

| Secret | Descrição |
|--------|-----------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Chave pública Firebase |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Domínio de autenticação |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | ID do projeto |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Bucket de storage |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | App ID |

As chaves de servidor (`GOOGLE_ROUTES_API_KEY`, `GEMINI_API_KEY`) não são
necessárias em CI porque os testes de API que as usam fazem `test.skip` em CI.

## Estrutura

```
e2e/
├── helpers/
│   ├── auth.ts          — loginComoAdmin(), STORAGE_STATE
│   └── navigation.ts    — irPara(), esperarToast(), esperarSkeleton()
├── setup/
│   └── auth.setup.ts    — Geração do storage state (rodar uma vez)
├── tests/
│   ├── api/
│   │   ├── alocar.spec.ts   — AL-01..AL-10 (roda em CI)
│   │   └── single.spec.ts   — SI-03..SI-05 (roda em CI)
│   ├── 01-auth.spec.ts      — AU-05..AU-06 (redirecionamentos)
│   ├── 02-calcular-rotas.spec.ts — UI-04..RG-10
│   ├── 03-historico.spec.ts — HI-01..HI-13
│   ├── 04-admin-tecnicos.spec.ts — AD-01..AD-03
│   ├── 07-seguranca.spec.ts — IV-01, IV-06, SE-04
│   └── 08-regressao.spec.ts — RG-01..RG-13
└── README.md
```

## Mapeamento com o Plano de Testes

| ID do plano | Arquivo | Status CI |
|-------------|---------|-----------|
| AU-05, AU-06 | 01-auth.spec.ts | ✅ Roda |
| UI-04..UI-20, RG-09/10 | 02-calcular-rotas.spec.ts | ⏭ Skip |
| HI-01..HI-13 | 03-historico.spec.ts | ⏭ Skip |
| AD-01..AD-03 | 04-admin-tecnicos.spec.ts | ⏭ Skip |
| IV-01, IV-06, SE-04 | 07-seguranca.spec.ts | ✅ Roda |
| RG-01..RG-13 | 08-regressao.spec.ts | ⏭ Skip |
| AL-01..AL-10 | tests/api/alocar.spec.ts | ✅ Roda |
| SI-03..SI-05 | tests/api/single.spec.ts | ✅ Roda |
