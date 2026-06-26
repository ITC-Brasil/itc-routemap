# 08 — Deploy e Infraestrutura

---

## Visão geral

```
GitHub (main)
     │
     │  push
     ▼
  Vercel
  (Next.js 16, serverless functions)
     │
     ├── Firebase Firestore (banco de dados)
     ├── Firebase Auth (autenticação)
     ├── Google Routes API (cálculo de rotas)
     ├── Google Maps API (mapas embed + JavaScript)
     └── Gemini API (justificativas IA)
```

---

## Domínio de produção

| Ambiente | URL |
|----------|-----|
| **Produção** | `https://routemap.grupoitcbrasil.com.br` |
| Desenvolvimento local | `http://localhost:3000` |

O domínio de produção é gerenciado via DNS do Grupo ITC Brasil apontando para a Vercel. Para adicionar ou renovar o domínio: **Vercel Dashboard > Project > Settings > Domains**.

> A chave `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` deve ter restrição de HTTP referrer configurada no Google Cloud Console para os padrões:
> - `https://routemap.grupoitcbrasil.com.br/*`
> - `http://localhost:3000/*` (desenvolvimento)

---

## Vercel

O projeto é hospedado na Vercel com deploy automático via integração com o repositório GitHub.

### Deploy automático

- Push para `main` → deploy de produção automático em `https://routemap.grupoitcbrasil.com.br`
- Pull requests → deploy de preview automático (URL única por PR)

### Variáveis de ambiente na Vercel

Configure em **Project Settings > Environment Variables**. As variáveis marcadas com `NEXT_PUBLIC_` são injetadas no bundle do cliente; as demais ficam apenas no servidor.

| Variável | Ambiente | Descrição |
|----------|----------|-----------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | All | Chave pública do Firebase |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | All | Domínio de auth do Firebase |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | All | ID do projeto Firebase |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | All | Bucket do Firebase Storage |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | All | Sender ID para FCM |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | All | App ID do Firebase |
| `GOOGLE_SERVICE_ACCOUNT_BASE64` | Production, Preview | JSON da conta de serviço em Base64 |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | All | Chave do Maps para o browser |
| `GOOGLE_MAPS_SERVER_API_KEY` | Production, Preview | Chave do Maps para o servidor |
| `NEXT_PUBLIC_SERVICE_ACCOUNT_EMAIL` | All | E-mail da conta de serviço (exibido na UI) |
| `GEMINI_API_KEY` | Production, Preview | Chave da Gemini API |
| `GEMINI_ENABLED` | All | `true` \| `false` — habilita/desabilita chamadas Gemini |

---

## Firebase

### Projeto Firebase

- **ID do projeto:** `itc-routemap` (definido em `.firebaserc`)
- **Firestore:** modo nativo, região `southamerica-east1` (São Paulo)
- **Auth:** provedor e-mail/senha habilitado

### Deploy de regras e índices via Firebase CLI

```bash
# Instalar Firebase CLI (se não tiver)
npm install -g firebase-tools

# Autenticar
firebase login

# Deploy apenas das regras de segurança
firebase deploy --only firestore:rules

# Deploy apenas dos índices
firebase deploy --only firestore:indexes

# Deploy de ambos
firebase deploy --only firestore
```

### Conta de serviço (Admin SDK)

O Firebase Admin SDK é usado nas API routes do servidor. A autenticação é feita via conta de serviço:

```bash
# Gerar o Base64 da chave JSON
cat service-account.json | base64 -w 0
# Cole o resultado em GOOGLE_SERVICE_ACCOUNT_BASE64
```

O arquivo `lib/firebase-admin.ts` decodifica e inicializa:

```typescript
const serviceAccount = JSON.parse(
  Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_BASE64!, "base64").toString("utf8")
)
```

---

## Ambiente de desenvolvimento local

### Pré-requisitos

- Node.js ≥ 20
- npm ≥ 10

### Setup

```bash
# Clone o repositório
git clone <url-do-repo>
cd itc-routemap

# Instale as dependências
npm install

# Crie o arquivo de variáveis de ambiente
cp .env.example .env.local
# Edite .env.local com os valores reais

# Inicie o servidor de desenvolvimento
npm run dev
```

O servidor inicia em `http://localhost:3000`.

### Scripts disponíveis

| Script | Comando | Descrição |
|--------|---------|-----------|
| Desenvolvimento | `npm run dev` | Servidor Next.js com Turbopack |
| Build de produção | `npm run build` | Compila TypeScript + bundle |
| Servidor de produção | `npm start` | Serve o build compilado |
| Lint | `npm run lint` | ESLint com regras do Next.js |
| Testes E2E | `npm run test:e2e` | Playwright headless |
| Testes E2E UI | `npm run test:e2e:ui` | Playwright com interface visual |
| Testes E2E headed | `npm run test:e2e:headed` | Playwright com browser visível |
| Testes de API | `npm run test:e2e:api` | Apenas specs de API |
| Testes de segurança | `npm run test:e2e:seguranca` | Spec `07-seguranca.spec.ts` |
| Testes de regressão | `npm run test:e2e:regressao` | Spec `08-regressao.spec.ts` |

---

## Monitoramento e observabilidade

O sistema não tem telemetria customizada. Observe:

- **Vercel Dashboard** — logs de deploy, erros de runtime, performance
- **Firebase Console** — uso do Firestore (leituras/escritas), erros de Auth
- **Google Cloud Console** — quota e erros das APIs (Routes, Maps, Gemini)

### Logs de erro

Erros nas API routes são logados via `console.error` e aparecem nos **Function Logs** da Vercel. Exemplos comuns:

- `Erro em /api/routes/alocar:` — erros não capturados no orquestrador
- `Google Routes Matrix falhou para modo TRANSIT:` — falha de quota ou parâmetro inválido

---

## Considerações de custo

| Serviço | Modelo de custo | Gatilho |
|---------|----------------|---------|
| Vercel | Free tier cobre uso normal | Builds e Edge Functions |
| Firebase Firestore | Free tier: 50K leituras/dia, 20K escritas/dia | Cada cálculo confirma ~N escritas |
| Google Routes Matrix | $5 / 1000 elementos | Cada par técnico×UM = 1 elemento por modo |
| Google Routes Single | $10 / 1000 requisições | 1 chamada por rota visualizada no mapa |
| Gemini 2.5 Flash | Free tier com limites de RPM | 1 chamada por cálculo |
| Google Maps JS API | Free tier: $200/mês de crédito | 1 load por sessão de usuário |
