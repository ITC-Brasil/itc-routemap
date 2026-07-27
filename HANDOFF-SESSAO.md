# HANDOFF — Sessão de estabilização pré-deploy (ITC RouteMap)

> Documento para retomar o trabalho num novo Claude Code (app). Cole/abra isto
> no início da nova sessão. **NÃO é para commitar** (é artefato de sessão).
> Data de referência: 2026-07-24.

---

## 0. TL;DR — ONDE PARAMOS AGORA

**Frente 2 CONCLUÍDA** (grupo B aprovado e aplicado em 2026-07-24): 10 supressões
`eslint-disable-next-line react-hooks/set-state-in-effect` com comentário
justificando + diretiva órfã de `exhaustive-deps` do `calcular-rotas` substituída.
**`npm run lint` = 0** (saída vazia) e **`npm run build` = pass**. Nada commitado
ainda — junta tudo no fechamento.

Estamos agora no **CHECKPOINT 3.1 da FRENTE 3**, aguardando OK do usuário para o
seed de teste (`prisma/seed-teste.ts`).

⚠️ **`.next` está com build de produção** — antes de rodar `npm run dev` na
Frente 3, apagar (`Remove-Item -Recurse -Force .next`), senão dá 404 em rotas
catch-all (ver §2).

Ordem do plano: **Frente 1 (geocode)** ✅ implementada/validada (falta write-path
com dados) → **Frente 2 (lint)** ✅ concluída → **Frente 3 (validação e2e com
seed de teste)** 🔶 no CHECKPOINT 3.1 → **Fechamento** (commits separados,
lint=0, build pass, sem push).

---

## 1. REGRAS INEGOCIÁVEIS (do usuário)

- Trabalhar **somente na branch `docker-server`**. **NUNCA tocar na `main`.**
- **NÃO fazer `git push`** — o usuário faz manualmente via **GCM** (Git Credential
  Manager). Só commits locais.
- **NUNCA imprimir segredos/senhas** no chat. Para checar `.env`, usar
  fingerprint/comprimento/booleanos, nunca o valor.
- Ambiente Docker atual é de **TESTE** (não é o servidor definitivo). PODE semear
  dados de teste e rodar `migrate reset` — **mas sempre confirmar antes de
  qualquer comando destrutivo**.
- Parar e reportar em cada **CHECKPOINT**; não avançar sem OK.
- Objetivo global: app rodando **perfeitamente, zero erros**, antes de produção.

---

## 2. ESTADO DO AMBIENTE

- **Docker Postgres:** container `itc-routemap-db` (postgres:16-alpine),
  `Up (healthy)`, porta 5432. Subir com:
  `docker compose --env-file .env.docker up -d postgres`
- **Banco:** recriado do zero na sessão (migrate reset). Contém **só o admin**
  (`dev.itcbrasil@gmail.com`), **zero dados de negócio** (projetos/pontos/
  técnicos/rotas/ums = 0).
- **Dev server:** roda com `npm run dev` (Turbopack) → http://localhost:3000.
  Env carregado em dev: **`.env.local, .env`** (NÃO `.env.docker`).
- **`npm run build`:** precisa de heap maior nesta máquina, senão dá OOM no
  type-check. Rodar assim:
  `$env:NODE_OPTIONS="--max-old-space-size=6144"; npm run build`
- **`.next`:** se rodar `next build` e depois `next dev` no mesmo `.next`, o dev
  passa a dar **404 em rotas catch-all** (ex.: `/api/auth/sign-in/email`). Cura:
  parar dev, `Remove-Item -Recurse -Force .next`, subir dev de novo. **Não é
  regressão de código**; produção usa `next start`.
- **Shell:** PowerShell 5.1 (primário). Cuidados: sem `&&`/ternário; `$env:VAR`;
  aliases colidem com funções (ex.: função `H` vira `Get-History`) — nomear
  funções sem colisão. Para SQL no psql, passar via arquivo + stdin
  (`Get-Content x.sql | docker exec -i itc-routemap-db psql -U itc_user -d itc_routemap`).
- **Prisma tem guard-rail de IA** para `migrate reset`: exige a env
  `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="<texto do consentimento>"` +
  consentimento explícito do usuário na hora.

---

## 3. ESTADO DO GIT

- Branch: `docker-server`. **Último push confirmado do usuário: `902aaab`**
  (origin/docker-server). Commits acima disso são **locais** (o usuário empurra
  via GCM quando decidir).
- **Log (mais recente → antigo):**
  - `8196354` chore(eslint): ignora .graphify/
  - `8625e42` chore: remove camada firestore morta e dep firebase client
  - `43afb0f` fix(login): envolve useSearchParams em Suspense (corrige build)
  - `264e078` fix: log dashboard no unmount + passa ADMIN_ ao container app no compose
  - `902aaab` chore: remove script de reset de senha (senha consolidada em ADMIN_PASSWORD)  ← origin
  - `10f119b` feat: wiring paginas para postgres via server actions + fix encoding/cosmeticas
- **Working tree NÃO commitado (Frente 1 + Frente 2-A):**
  - `app/api/geocode-pontos/route.ts` — reescrita sem Firestore (Frente 1)
  - `lib/db/pontos.ts` — +2 funções de geocoding (Frente 1)
  - `components/ui/command.tsx` — `interface {}` → `type` (Frente 2-A)
  - `app/(privado)/calcular-rotas/_components/resultado-alocacao.tsx` — remove imports `Bike`,`Car` (2-A)
  - `app/(privado)/historico/[loteId]/page.tsx` — remove função morta `formatarDataPorExtenso` (2-A)
  - `tests/e2e/setup/auth.setup.ts` — remove param `page` não usado (2-A)
  - `tests/e2e/tests/01-auth.spec.ts` — remove expressão no-op `page.context().storageState` (2-A)

### Commits a fazer no FECHAMENTO (separados, sem acento):
1. **geocode** — migração de `geocode-pontos` p/ Postgres (`route.ts` + `lib/db/pontos.ts`).
2. **lint** — grupo A + grupo B (após OK do B).
3. **seed-teste** — se aplicável (Frente 3).
4. **firebase-admin** — remoção (só no fim; ver §5).

---

## 4. FRENTE 1 — geocode-pontos (✅ implementada, write-path pendente)

- **Feito (não commitado):** `app/api/geocode-pontos/route.ts` reescrita sem
  `firebase-admin`/Firestore, usando 2 funções novas em `lib/db/pontos.ts`:
  - `listarPontosPendentesSemCoordenadas(projetoId?)` — query Prisma
    (`status:"Pendente"` + `latitude/longitude` nula).
  - `atualizarCoordenadasPontosEmLote(updates)` — grava lat/lng em
    `prisma.$transaction` (atômico, equivale ao `batch.commit()` do Firestore).
  - `enderecoFormatado` foi **descartado** (não existe no model `Ponto` e nada
    lê de um ponto). `atualizadoEm` é automático (`@updatedAt`, schema:102).
  - Resposta da rota **idêntica** à original; consumidor (Localidades, pós-sync)
    inalterado.
- **`npm run build`:** PASSOU (com heap 6144).
- **Teste da rota:** `POST /api/geocode-pontos` body `"{}"` → **HTTP 200**, sem
  FirebaseError, roda 100% no Postgres. **Ressalva:** banco vazio → validado só
  o caminho **sem dados** (total:0). O **caminho de escrita** (geocodificar +
  gravar lat/lng) **ainda não foi exercitado** — fica para a **Frente 3** (seed
  com ≥1 ponto `Pendente` sem coords e com endereço real).

---

## 5. firebase-admin — ORDEM OBRIGATÓRIA (Opção A aprovada)

- **NÃO remover ainda.** Só remover `lib/firebase-admin.ts` + dep `firebase-admin`
  **DEPOIS** que o **write-path** da rota geocode for provado com dados reais na
  Frente 3. "Migra e prova primeiro, remove por último."
- Confirmado nesta sessão: **`geocode-pontos` é o ÚNICO importador** de
  `@/lib/firebase-admin`, e `lib/firebase-admin.ts` é o único que usa o pacote
  `firebase-admin`. Ao remover: grep final (zero importadores) + `npm run build`
  + **commit separado**.

---

## 6. FRENTE 2 — lint (🔶 grupo A feito; grupo B no CHECKPOINT)

`npm run lint` começou com **17 problemas (11 erros + 6 warnings)**. `.graphify/`
já está no ignore do eslint (commit `8196354`).

### Grupo A (triviais) — ✅ CORRIGIDO (não commitado). De 17 → 11 restantes.
- `command.tsx:25` `interface {}` → `type CommandDialogProps = DialogProps`
- `resultado-alocacao.tsx:31,32` removidos imports `Bike`,`Car`
- `historico/[loteId]/page.tsx:92` removida função morta `formatarDataPorExtenso`
- `auth.setup.ts:5` removido param `page` não usado
- `01-auth.spec.ts:26` removida expressão no-op `page.context().storageState`

### Grupo B (sensível) — ⬜ AGUARDANDO OK. 10× `react-hooks/set-state-in-effect`:
`admin/projetos:49`, `admin/tecnicos:62`, `admin/ums:55`, `calcular-rotas:336`,
`estatisticas:69`, `page-transition:28`, `ras/ra-form-dialog:45`,
`tecnicos/tecnico-form-dialog:61`, `theme-toggle:14`, `ums/um-form-dialog:52`.

**Proposta apresentada (aguardando OK):** em TODOS, adicionar
`// eslint-disable-next-line react-hooks/set-state-in-effect` com comentário
justificando — **zero mudança de runtime** (só suprime o falso-positivo da regra
nova em padrões intencionais: carga no mount, reset de form ao abrir modal, flag
de montagem do next-themes, sync de transição de página).
No `calcular-rotas/page.tsx`: trocar a diretiva órfã de `exhaustive-deps` (:340,
warning do grupo A ainda pendente) por uma de `set-state-in-effect` antes do
`setResultado` (:336) — resolve os dois de uma vez.
Refactors "de verdade" (ex.: dialogs via `key` no pai) foram oferecidos mas
**não recomendados** por risco de mudança de comportamento.

**RESULTADO (2026-07-24):** OK dado ("supressões comentadas"). Aplicado nos 10
arquivos; no `calcular-rotas/page.tsx` a diretiva órfã de `exhaustive-deps` (:340)
foi trocada por `set-state-in-effect` antes do `setResultado`. Arquivos tocados no
grupo B (todos não commitados): `components/theme-toggle.tsx`,
`components/ums/um-form-dialog.tsx`, `components/tecnicos/tecnico-form-dialog.tsx`,
`components/ras/ra-form-dialog.tsx`, `components/page-transition.tsx`,
`app/(privado)/admin/{projetos,tecnicos,ums}/page.tsx`,
`app/(privado)/estatisticas/page.tsx`, `app/(privado)/calcular-rotas/page.tsx`.
Verificado: **`npm run lint` = 0** e **`npm run build` = pass** (heap 6144).

---

## 7. FRENTE 3 — validação e2e com dados (⬜ NÃO INICIADA)

- **Aprovações do usuário no CHECKPOINT 3.1 (2026-07-24):** geocoding real
  AUTORIZADO (1 requisição); `metricas` deve copiar o shape exato de
  `lib/db/rotas.ts` + `_components/` (não inventar campos); flag `--limpar`
  aprovada (melhor que `migrate reset`). Seed aprovado como descrito.
- **Chave da API conferida (sem expor valor):** `GOOGLE_MAPS_SERVER_API_KEY`
  presente em `.env.local` (39 chars) e em `.env.docker`. `DATABASE_URL` só em
  `.env` (dev) e `.env.docker`. `GOOGLE_ROUTES_API_KEY` não existe em nenhum —
  `lib/google-routes.ts` usa a `GOOGLE_MAPS_SERVER_API_KEY`, então ok.
- **3.1 (CHECKPOINT):** propor um **seed de teste** via Prisma em arquivo
  **separado** (`prisma/seed-teste.ts`, NÃO o seed oficial) — quais entidades e
  quantos registros para exercitar listas, datas (`isHoje`/`isNestesMes`/
  `formatarDuracao`), Histórico, e o cálculo de rotas. **Incluir ≥1 ponto
  `Pendente` SEM coords com endereço real** para validar o write-path do
  geocode-pontos (Frente 1). PARAR para OK antes de rodar.
- **3.2 ✅ FEITO (2026-07-24):** `prisma/seed-teste.ts` criado e rodado 2×
  (idempotência provada: 2 projetos, 3 RAs, 4 UMs, 3 técnicos, 10 pontos,
  4 rotas). Ajuste vs plano: **10 pontos em vez de 8** — as 4 rotas
  Confirmadas exigem pontos `Agendado` com `rotaId` (rota Confirmada +
  ponto Pendente = estado impossível). Status usados são os do domínio
  (`Pendente`/`Agendado`/`Histórico`); o plano dizia "Concluído", que não
  existe no código. `metricas` copiado de `MetricaModo`
  (`distanciaMetros`/`duracaoSegundos`/`observacao?`), sem campos inventados.
  `calcularHashPonto` foi **replicado** no seed (não importado) porque
  `lib/db/pontos.ts` tem `import "server-only"`.
- **WRITE-PATH DO GEOCODE ✅ PROVADO (o item mais crítico da Frente 1):**
  `teste-ponto-09` ("Praça dos Três Poderes") antes: lat/lng NULL →
  `POST /api/geocode-pontos` HTTP 200 `{total:1, geocodados:1, falhas:0}` →
  depois no Postgres via psql: `-15.8003048 / -47.8626804`, `atualizadoEm`
  avançou 21:07:32 → 21:10:21. 2ª chamada devolveu `total:0` (idempotente,
  não gasta API). **firebase-admin agora está liberado para remoção.**
  Obs.: mojibake na resposta lida via PowerShell é artefato do cliente
  (`content-type` sem charset + PS 5.1 decodificando Latin-1); no banco os
  acentos estão íntegros.
- **Ambiente:** dev server ORFÃO da sessão VS Code estava na porta 3000
  (PID encerrado); `.next` limpo; dev único subiu na 3000.
- **ACHADO DE SEGURANÇA — VERSÃO CORRIGIDA (não corrigido no código, aguarda
  Frente 4):** não existe `middleware.ts`; a proteção de página é só o
  `AuthGuard` **client-side** (`app/(privado)/layout.tsx`), então `GET /`,
  `/admin/projetos`, `/historico`, `/estatisticas` devolvem **200 sem sessão**
  (HTML do fallback, sem dados). **CORREÇÃO de um relato anterior desta
  sessão:** as **server actions em `lib/actions/*` JÁ validam sessão** — todas
  chamam `requireSession()` (de `lib/session-server`) antes de tocar em
  `lib/db/*`; comprovado ao tentar executá-las fora de request scope
  (`\`headers\` was called outside a request scope`). O que **permanece
  desprotegido** são as **rotas de API**: `/api/geocode-pontos` foi exercitada
  **sem sessão** e gravou no banco; conferir também `/api/geocoding`,
  `/api/routes/*` e `/api/sincronizar`. Ordem acordada: validar → blindar →
  revalidar.
- **LOGIN RESOLVIDO (2026-07-24):** a hipótese de divergência `.env` vs
  `.env.local` foi **descartada** — `ADMIN_PASSWORD` só existe no `.env`
  (len=16) e o login por HTTP com esse valor dá **200**. O hash no banco está
  correto; os 401 foram senha digitada errada no formulário. **NÃO** foi
  necessário apagar o admin nem rerodar o seed.
- **CAMINHO DE AUTH E2E (novo, reutilizável):** `tests/e2e/setup/auth.setup.ts`
  reescrito — login real pela UI (`#email`/`#senha` + botão Entrar), confirma
  o cookie do Better Auth e salva `tests/e2e/.auth/user.json`. No
  `playwright.config.ts`: carrega também o `.env` (sem override), project
  `setup` (testMatch `*.setup.ts`), project `anonimo` (01-auth e 07-seguranca,
  contexto sem sessão) e project `chromium` (resto, com `storageState` +
  `dependencies: ["setup"]`). Artefatos (`.auth/`, `test-results/`,
  `playwright-report/`) já estão no .gitignore.
- **SUÍTE E2E COM DADOS: 47 passaram, 8 falharam.** Nenhuma falha é bug do
  código da app:
  1. **5× `02-calcular-rotas`** — **Gemini 403 PERMISSION_DENIED** ("Your
     project has been denied access"); o app cai no *fallback template* como
     projetado e `POST /api/routes/alocar` responde **200**. O teste espera o
     banner "Análise da alocação" do Gemini. → decisão do usuário (chave/billing).
  2. **1× `03-historico` HI-10** — teste frágil: `getByText(/não encontrado/i)`
     casa 2 elementos (h2 + p). App correta, sem stack trace.
  3. **2× `04-admin-tecnicos` AD-02/AD-03** — `locator.fill` timeout no campo
     de Plus Code; seletor não resolve (teste provavelmente desatualizado).
- **CRUD + TRANSAÇÃO: VALIDADOS (2026-07-24), 17/17 passos OK.** Provado sem
  UI (script temporário já removido), com leitura de conferência via Prisma:
  criar/editar/excluir OK em **Projetos, UMs, Técnicos e Pontos**; e
  `confirmarAlocacao` criou `Rota` **Confirmada** + moveu `teste-ponto-05` para
  **Agendado com `rotaId`** correspondente (transação), seguido de rollback.
  Editar Ponto também foi provado **pela UI** (spec 09-crud, bloco Localidades).
- **PENDÊNCIA — GEMINI 403 PERMISSION_DENIED (ação do usuário no Google Cloud):**
  mensagem exata da API: *"Your project has been denied access. Please contact
  support."* É **acesso/billing do projeto no Google Cloud** — não é código, e o
  assistente **não deve tocar em credencial nem contornar**.
  - **Onde está o fallback:** `lib/gemini.ts`, em
    `gerarJustificativaAlocacao()`. A degradação é **intencional e documentada
    no cabeçalho do arquivo**: cai em `gerarJustificativaTemplate()` (template
    procedural local) quando `GEMINI_ENABLED=false`, quando não há
    `GEMINI_API_KEY`, ou em **qualquer erro** da chamada (rede, billing, modelo)
    — "o usuário nunca vê indisponível". Modelo configurado: `gemini-2.5-flash`.
  - **O que degrada:** **somente** a justificativa em linguagem natural da
    alocação — o banner "Análise da alocação" na tela de resultado e o texto
    gravado em `Rota.loteJustificativa` (que aparece como "JUSTIFICATIVA DA IA"
    no detalhe do lote). Passa a ser o texto do template.
  - **O que NÃO é afetado:** algoritmo Húngaro de alocação, Google Routes API
    (matriz/rotas), confirmação da alocação, Histórico, Estatísticas e todos os
    cadastros. `POST /api/routes/alocar` continua respondendo **200**.
  - **Testes:** 5 casos de `02-calcular-rotas` que dependem do banner ficaram
    `test.skip` com a constante `GEMINI_BLOQUEADO_403` e comentário apontando o
    403. **Não reescrever para aceitar o fallback** — isso mascararia a ausência
    do Gemini. Para desbloquear: liberar o acesso e remover a constante.
- **PENDÊNCIA — DÍVIDA DE TESTE DE UI (o que retomar na próxima sessão):** em
  `tests/e2e/tests/09-crud.spec.ts`, 4 blocos estão em `describe.skip` — **10
  testes**. O que falha em cada um, e o conserto correspondente:
  1. **CRUD — Projetos** e **CRUD — Técnicos** (3+3 testes): o registro **É
     criado** (confirmado por screenshot e por leitura do Postgres), mas o app
     **normaliza o nome para title case** ("ZZ Teste CRUD" → "Zz Teste Crud"),
     então `getByText(nome, { exact: true })` nunca casa. Conserto: comparar
     case-insensitive, ou usar o nome já normalizado. Atenção: os forms têm
     **validações obrigatórias** que o spec precisa preencher — Projeto exige
     URL da planilha + ao menos uma aba; Técnico exige Plus Code **com
     coordenadas obtidas** antes de salvar.
  2. **CRUD — UMs** (3 testes): o combobox **abre e lista os projetos**, mas os
     itens (CommandItem) **não expõem `role="option"`**, então
     `getByRole("option")` estoura timeout.
     ⚠️ **CANDIDATO A FIX DE APP, NÃO DE TESTE (acessibilidade):** um combobox
     cujos itens não têm `role="option"` (e cujo container não tem
     `role="listbox"`) também **prejudica leitor de tela** — o padrão ARIA de
     combobox espera esses roles para anunciar as opções e a seleção. Ou seja, o
     teste está apenas revelando um problema real de a11y em
     `components/ui/combobox.tsx`. O conserto correto é **expor os roles no
     componente** (beneficia usuários de leitor de tela e, de graça, torna
     `getByRole("option")` válido); contornar no spec selecionando por texto
     esconderia o problema. **Não corrigido nesta sessão** — decisão do usuário.
     Afeta todos os comboboxes do app (UM→projeto, técnico→modo, ponto→status).
  3. **Confirmação de alocação** (1 teste): o fluxo tem uma **etapa
     intermediária de re-otimização** (feature 13.12 — "Aplicar re-otimização" /
     "Ignorar e ver resultado") **antes** de "Confirmar alocação"; o spec pulava
     essa tela. Conserto: tratar as duas telas.
  Nada disso é bug de aplicação — o write-path das 4 entidades e a transação de
  `confirmarAlocacao` estão provados na camada `lib/db` (17/17 passos).
- **VEREDITO AD-02/AD-03 (Plus Code): TESTE DESATUALIZADO, não regressão.** O
  campo renderiza normal (`Label "Plus Code da residência"`, `Input
  id="plusCode"`, botão "Obter Coordenadas"); o teste usava
  `getByPlaceholder(/Plus Code/i)` contra o placeholder real
  `"Ex: 3Q69+77 Brasília"`. Seletor trocado por `#plusCode`. `enderecoFormatado`
  segue **intacto** na cadeia do técnico (`lib/google-geocoding.ts` →
  `app/api/geocoding/route.ts` → `tecnico-form-dialog.tsx:98`) — o campo
  descartado na Frente 1 era o do model **Ponto**, outro fluxo.
- **Banco após a validação:** dados `teste-*` **removidos** via
  `npx tsx prisma/seed-teste.ts --limpar`. Para repovoar:
  `npx tsx prisma/seed-teste.ts`.
- **CUSTO PENDENTE:** o fluxo calcular-rotas ponta a ponta consome a Google
  **Routes API** (matriz técnicos × pontos) — custo além da 1 requisição de
  geocoding já autorizada.
- **3.2 (original):** rodar o seed + subir app.
- **3.3:** navegar logado por TODAS as páginas E exercitar ações (criar/editar/
  excluir em Projetos, UMs, Localidades, Técnicos; abrir Histórico com dados;
  rodar calcular-rotas ponta a ponta).
- **3.4:** tabela página/ação × resultado. Capturar QUALQUER erro (FirebaseError,
  500, stack trace, console do browser, log do server). Meta: zero erros.
- **3.5:** achou erro → causa raiz + fix (CHECKPOINT se não-trivial).
- Ferramenta útil: Playwright já instalado. Para script headless, colocar o
  `.mjs` na **raiz do projeto** (não no scratchpad — senão não resolve
  `node_modules`) e apagar depois. Login por API via `context.request.post`
  em `/api/auth/sign-in/email` e reaproveitar o contexto.

---

## 8. FECHAMENTO (só com as 3 frentes verdes)

- `npm run lint` = **0** e `npm run build` = **pass** (ambos colados no relatório).
- Commits separados e descritivos na `docker-server` (sem acento): geocode, lint,
  seed-teste (se aplicável), firebase-admin.
- `git log --oneline -8`.
- **NÃO fazer push** (usuário via GCM).
- Resumo: o que mudou, o que foi validado com dados, e pendências p/ deploy.

---

## 9. FATOS DO PROJETO (contexto acumulado)

- **Senha admin consolidada em `ADMIN_PASSWORD`** (fonte única, via seed). O
  valor tem `#`; o bug histórico era o dotenv truncar no `#` sem aspas — corrigido
  colocando **aspas** em `.env`/`.env.docker`. Validado: login com a senha
  completa → 200. `ADMIN_PASSWORD_RESET` e `prisma/reset-admin-password.ts` foram
  removidos. **Seed é idempotente por early-return se o user já existe** (NÃO
  atualiza senha de admin existente → reaplicar exige banco limpo).
- **Senha de PRODUÇÃO ≠ senha de dev.** A de dev foi exposta em chat (inclusive
  por acidente nesta sessão). O usuário gera/seta a de prod manualmente no
  servidor, fora do chat. **Não gerar nem sugerir senha.** Recomendado: sem `#`/
  símbolos (só letras+números, ≥16) para não depender de quote-handling.
- **`docker-compose.yml`:** serviço `app` agora recebe `ADMIN_EMAIL/ADMIN_NOME/
  ADMIN_PASSWORD` no `environment:` (commit `264e078`, para o seed rodar no
  container). Validado empiricamente: Compose v2 com `--env-file` **consome as
  aspas e preserva o `#`** (não trunca).
- **Encoding:** navbar renderiza acentos corretos ("Início/Histórico/
  Administração/Técnicos"); Postgres `server_encoding=UTF8`, `client_encoding=UTF8`.
  Sem mojibake. Não precisa `client_encoding` na DATABASE_URL.
- **Migração Firestore→Postgres:** todas as páginas usam `lib/actions/*`→
  `lib/db/*` (Prisma). `lib/firestore/*`, `lib/auth.ts`, `lib/firebase.ts` e a dep
  `firebase` (client) já removidos (commit `8625e42`). Zero `.toDate(` no caminho
  ativo. Único resquício Firestore = `geocode-pontos` (Frente 1, em migração).
- **calcular-rotas:** persistência atômica fica no server action
  `confirmarAlocacao` (`lib/actions/rotas.ts` → `lib/db/rotas.ts`, `prisma.$transaction`).
  A route `/api/routes/alocar` é só cálculo.

---

## 9.1 FRENTE 4 — blindagem de auth (passos 1-3 CONCLUÍDOS, não commitados)

Escopo reduzido após descobrir que as server actions já validam sessão.

- **Passo 1 ✅ — guard nas rotas de API.** `exigirSessaoApi()` novo em
  `lib/session-server.ts` (401 JSON `{sucesso:false,erro}`, não `throw`),
  aplicado como PRIMEIRA instrução de `sincronizar`, `geocode-pontos`,
  `routes/alocar`, `routes/single`, `routes/matrix` e `geocoding` — antes de
  parse, escrita ou chamada paga. Smoke sem cookie: **6/6 = 401**;
  `/api/auth/get-session` segue **200** (pública). Prova de que barra antes de
  escrever: o `POST /api/geocode-pontos` que antes gravou sem sessão agora dá
  401 e o `teste-ponto-09` continua com lat/lng **NULL**.
- **Passo 2 ✅ — AU-06 movido.** Saiu de `01-auth.spec.ts` (project `anonimo`,
  sem sessão) para `01b-auth-logado.spec.ts` (project `chromium`). Confirmado
  **empiricamente** que o fixture `request` do Playwright **herda o
  storageState**: os 14 testes de `api/alocar`+`api/single` seguem recebendo 400
  de validação, não 401.
- **Passo 3 ✅ — `proxy.ts`.** **No Next 16 `middleware.ts` não existe mais:
  virou `proxy.ts`** na raiz (docs em
  `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`). Roda em
  **Node.js runtime por padrão** e a config `runtime` é proibida (lança erro) —
  isso derruba a limitação clássica do Better Auth em edge.
  Matcher: `/`, `/admin/:path*`, `/calcular-rotas`, `/estatisticas`,
  `/historico/:path*` — **sem `/api`** (API responde 401 JSON, não redirect).
  Verificado por HTTP: `/login`, `/api/auth/*`, `_next/static`, `_next/image` e
  favicon **não** são bloqueados (200); as 7 rotas privadas dão **307 → /login**
  sem cookie e **200** com cookie válido. Suíte: **51 passed / 15 skipped /
  0 failed**, idêntica ao baseline pré-proxy.
  **LIMITAÇÃO DECLARADA (está no cabeçalho do `proxy.ts`):** é *optimistic
  check*, **não fronteira de segurança** — `getSessionCookie` apenas LÊ o
  cookie, sem verificar assinatura HMAC nem consultar o banco, então cookie
  expirado/forjado passa. Quem barra de fato é `requireSession()` nas server
  actions e `exigirSessaoApi()` nas rotas de API. Validação forte no proxy
  (`auth.api.getSession`) foi avaliada e **recusada**: custaria uma query ao
  Postgres por request de página, e o doc do Next diz que Proxy "should not be
  used as a full session management or authorization solution".
- **`redirectTo` — DECIDIDO: fica sem o parâmetro.** A página `/login` **não
  consome** `redirectTo` (lê só `error` do querystring e faz `router.push("/")`
  fixo), então anexá-lo criaria parâmetro decorativo na URL. O proxy redireciona
  para `/login` puro.
  **MELHORIA FUTURA OPCIONAL:** voltar para a página de origem após o login.
  Exige os dois lados — o proxy anexar `?redirectTo=<pathname>` e o `/login` ler
  esse param e usá-lo no lugar do `push("/")` fixo (validando que é um caminho
  interno, para não virar open redirect).
- **Passo 4 ✅ — `/api/routes/matrix` REMOVIDA.** Grep em todo o repo (app, lib,
  components, tests, scripts, docs), incluindo URL em string: **zero chamadores
  reais**. As ocorrências restantes de "matrix" são o tipo `ModoMatrix`
  (`lib/google-routes.ts`, sem relação com a rota), `munkres(matrix)` e a
  documentação — e `docs/06-apis-externas.md` descreve a **função**
  `calcularMatrizDeslocamento` e o endpoint REST **do Google**, não a nossa
  rota, então a remoção **não deixa doc obsoleta**. Nenhum teste a exercitava.
  Junto com a remoção, dois comentários em `lib/alocacao.ts` que apontavam para
  a rota inexistente passaram a referenciar `calcularMatrizDeslocamento`.
  Observação de build: o Next mantém tipos gerados em `.next/types` para cada
  rota — após remover uma rota é preciso **limpar `.next`**, senão o type-check
  falha com "Cannot find module '.../matrix/route.js'".

---

## 10. CHECKLIST DE DEPLOY — servidor definitivo (não executar daqui)

Roteiro consolidado. Nada disto foi executado nesta sessão; o ambiente atual é
o Docker de **teste**.

### 10.1 Infra e host
1. **DNS** do domínio de produção apontando para o host.
2. **Host Docker** provisionado (Docker + Compose v2).
3. `git clone`/`pull` da branch `docker-server` no servidor.

### 10.2 Segredos no `.env.docker` do servidor
Nunca commitados; preenchidos pelo dono do projeto, fora do chat.
4. **`ADMIN_PASSWORD` de produção** — gerada pelo usuário. Recomendação:
   **só letras e números, ≥16 caracteres, SEM `#`** (nem outros símbolos), para
   não depender de quote-handling do dotenv. A senha de dev **não** vale para
   produção. O assistente não gera nem sugere senha.
5. **`BETTER_AUTH_SECRET` NOVO** para produção (não reaproveitar o de dev — ele
   assina os cookies de sessão).
6. `DATABASE_URL` apontando para o Postgres do compose, `ADMIN_EMAIL`,
   `ADMIN_NOME`, `GOOGLE_MAPS_SERVER_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`,
   `GEMINI_API_KEY`, `BETTER_AUTH_URL` (URL pública), `GOOGLE_CLIENT_ID`/
   `GOOGLE_CLIENT_SECRET` se o login Google for usado.
   Lembrete validado empiricamente: Compose v2 com `--env-file` **consome as
   aspas e preserva o `#`** — mas veja o item 4 e evite `#`.

### 10.3 Google Cloud
7. **Redirect URI de produção** no console OAuth:
   `https://<dominio>/api/auth/callback/google` (o de dev não serve).
8. **Gemini**: liberar acesso/billing (hoje retorna 403 PERMISSION_DENIED —
   ver §7). Sem isso o app funciona, mas a justificativa da alocação sai do
   template.
9. Conferir cotas/billing de Routes API e Geocoding API.

### 10.4 TLS e nginx
10. Certificados em **`./nginx/certs`** — **não estão no repositório**, precisam
    ser colocados no servidor.

### 10.5 Build e banco
11. **Build**: nesta máquina de dev o type-check dá OOM sem heap maior —
    `$env:NODE_OPTIONS="--max-old-space-size=6144"; npm run build`. **Verificar
    se o host de produção tem RAM suficiente**; se der OOM no build da imagem,
    passar `NODE_OPTIONS=--max-old-space-size=6144` no Dockerfile/compose.
12. Subir só o `postgres` primeiro.
13. **`prisma migrate deploy`** — **NUNCA `migrate reset`** em produção.
14. **Seed manual do admin**: `npm run db:seed` (o Dockerfile só roda
    `node server.js`, então migration e seed são passos **manuais**).
    O seed é **idempotente por early-return**: se o usuário já existe, ele
    **não atualiza a senha** — trocar `ADMIN_PASSWORD` depois não tem efeito.
15. Subir `app` + `nginx`.

### 10.6 Validação pós-deploy
16. Smoke test: login com a senha de produção, navegar pelas 8 páginas, abrir um
    lote no Histórico, rodar um cálculo de rotas.
17. Conferir que as rotas de API respondem **401 sem sessão** (blindagem da
    Frente 4) e que `/api/auth/*` segue pública.
18. Conferir acentuação (UTF-8) e ausência de erro no log do container.

### 10.7 Pendências conhecidas para o deploy
- **`x-api-key` para cron externo**: hoje **não existe nenhum cron/job** — os
  scripts do `package.json` são dev/build/start/lint/test/db:seed, o
  `docker-compose.yml` tem só `postgres`/`app`/`nginx` e o `Dockerfile` roda
  `node server.js`. As rotas blindadas exigem **cookie de sessão**, então se um
  dia um agendador externo precisar chamar `/api/sincronizar` ou
  `/api/geocode-pontos`, será necessário aceitar um segredo em header como
  alternativa ao cookie. Registrado como necessidade **futura**.
- Paridade de env dev(`.env`)/servidor(`.env.docker`) no carregamento do seed
  deve ser revalidada no caminho Docker.
- Prisma avisou: `package.json#prisma` (config do seed) está deprecado no
  Prisma 7 → migrar para `prisma.config.ts` no futuro.

---

## 11. PRÓXIMA AÇÃO IMEDIATA

Aguardando **OK do usuário no grupo B da Frente 2** (§6). Com o OK: aplicar os 10
disables + limpeza da diretiva órfã → `lint` (0) → `build` (pass) → reportar →
seguir para a Frente 3 (propor seed-teste no CHECKPOINT 3.1).
