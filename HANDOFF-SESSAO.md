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

- **Senha admin consolidada em `ADMIN_PASSWORD`** (fonte única, via seed).
  **⚠️ ATENÇÃO — o que segue vale para o `.env` (dev), NÃO para o
  `.env.docker`.** No **`.env`** o valor tem `#`; o bug histórico era o dotenv
  truncar no `#` sem aspas, corrigido colocando **aspas** ali. Validado: login
  com a senha completa → 200. `ADMIN_PASSWORD_RESET` e
  `prisma/reset-admin-password.ts` foram removidos. **Seed é idempotente por
  early-return se o user já existe** (NÃO atualiza senha de admin existente →
  reaplicar exige banco limpo, ou recriar o usuário).
- **🔴 Os dois arquivos têm senhas DIFERENTES** (medido em 2026-07-27, sem expor
  valores):

  | arquivo | len do valor | tem `#` | entre aspas |
  |---|---|---|---|
  | `.env` (dev) | 16 | sim | sim |
  | `.env.docker` | **6** | **não** | sim |

  Consequência: o `.env.docker` **reprova na validação do seed** (`>= 8`) quando
  executado via Compose. Ele só "passou" no ensaio de deploy porque foi rodado
  com `docker run --env-file`, que **não remove as aspas** — o valor chegou com
  8 caracteres (6 + 2 aspas) e o admin foi criado com **as aspas fazendo parte
  da senha**. Trocar antes do deploy (ver §10.2, item 4).
- **🔴 REGRA GERAL MEDIDA — escreva os valores do `.env.docker` SEM aspas e SEM
  `#`.** `docker run --env-file` **preserva as aspas** como parte do valor,
  enquanto `docker compose --env-file` **as remove**. Qualquer valor citado no
  arquivo é corrompido silenciosamente em um dos dois caminhos — e o seed é
  justamente executado por um deles. Isso **invalida** a conclusão antiga de que
  "aspas protegem o `#`": aspas resolvem o truncamento do **dotenv** (Node, no
  `.env` de dev), mas criam um problema novo no caminho `docker run`.
- **Senha de PRODUÇÃO ≠ senha de dev.** A de dev foi exposta em chat (inclusive
  por acidente nesta sessão). O usuário gera/seta a de prod manualmente no
  servidor, fora do chat. **Não gerar nem sugerir senha.** Recomendado: sem `#`/
  símbolos (só letras+números, ≥16) para não depender de quote-handling.
- **`docker-compose.yml`:** serviço `app` recebe `ADMIN_EMAIL/ADMIN_NOME/
  ADMIN_PASSWORD` no `environment:` (commit `264e078`). Sobre o parsing: o
  Compose v2 com `--env-file` **remove as aspas** e não trunca no `#` — mas essa
  validação foi feita **com o `.env` de dev**, cujo valor tem `#`. Ela **não**
  descreve o `.env.docker` atual (senha de 6 chars, sem `#`), e **não vale para
  `docker run --env-file`**, que preserva as aspas. Ver os dois itens acima.
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

## 9.2 RODADA DE QUITAÇÃO DE DÍVIDAS (2026-07-27)

### ✅ Combobox — era BUG FUNCIONAL, não falta de ARIA

A hipótese registrada antes (itens sem `role="option"`) **estava errada**: o
cmdk 1.1.1 **já expõe** `role="option"`, `role="listbox"`, `role="combobox"` e
`aria-selected` — medido no DOM. O defeito real era **CSS**: a classe do
`CommandItem` usava `data-[disabled]:pointer-events-none`, seletor que casa pela
**presença** do atributo, e o cmdk 1.x renderiza `data-disabled="false"` nos
itens habilitados. Resultado: `pointer-events: none` em **todos** os itens —
nenhuma opção era clicável com mouse (só por teclado, `ArrowDown`+`Enter`).
Corrigido para `data-[disabled=true]:` (mesma forma já usada em
`components/ui/label.tsx`). Varredura confirmou que era a única ocorrência do
padrão sem valor no repo. Validado por clique nos 3 comboboxes de formulário.

⚠️ **O bug está em PRODUÇÃO** (`main` = `818dc71` tem a linha idêntica), afetando
os 5 pontos de uso do Combobox: UM→projeto, técnico→modo, ponto→status, filtros
de Localidades e filtros do Histórico. Branch de hotfix criada a partir da
`main`: **`hotfix/combobox-pointer-events`** (1 commit, build pass) — aguardando
push/merge do usuário.

### ✅ 09-crud — 10 testes destravados (dívida quitada)

Suíte foi de 51 para **61 passed / 5 skipped / 0 failed** (os 5 skips restantes
são só os do `GEMINI_BLOQUEADO_403`). O que cada bloco exigiu:
- **UMs (3):** passaram de graça após o fix do combobox — a causa era o clique
  bloqueado, não o `getByRole`.
- **Projetos/Técnicos (6):** prefixo do spec passou a ser `"Zz Teste Crud"` (já
  em Title Case, idempotente sob `titleCase`), então `exact: true` volta a
  casar. Em **Técnicos** houve uma segunda causa: a lista é um `Accordion`
  (`type="single"`), então os botões de ação só existem depois de expandir o
  item — e ali eles têm **texto visível** "Editar"/"Deletar", não `aria-label`
  com o nome como em Projetos/UMs. Helper `expandirTecnico` cobre isso.
- **Confirmação de alocação (1):** o spec agora passa pela etapa condicional de
  re-otimização (13.12) via "Ignorar e ver resultado" — aplicar a re-otimização
  cancelaria rotas e deixaria o teste dependente de estado. Persistência
  confirmada no Postgres: lote novo com 2 rotas `Confirmada` e pontos Agendados
  de 4 → 6.

### ⬜ DECISÃO DE PRODUTO PENDENTE — Title Case tem DOIS efeitos

`titleCase` (`lib/text-utils.ts`) é **intencional**. A heurística é
**estritamente por palavra** — cada palavra é avaliada isoladamente, sem olhar
as vizinhas. Saída **medida** (não inferida), rodando a função:

```
"SQN 410"             ->  "Sqn 410"
"QDFM 26 Conjunto A"  ->  "Qdfm 26 Conjunto a"
"SQN"                 ->  "Sqn"
"QNL 12"              ->  "Qnl 12"
```

São **dois efeitos distintos**, não um:

1. **Siglas puras são capitalizadas.** Só palavras **que contêm dígito** são
   preservadas como digitadas (`BSBIA04`, `UM-1`, `410`). Uma sigla sem dígito
   não é: `SQN` → `Sqn`, `QNL` → `Qnl`, `CLN` → `Cln`, `QDFM` → `Qdfm`,
   `CCSW` → `Ccsw`. **Atenção:** `"SQN 410"` **não** sobrevive — vira
   `"Sqn 410"`. O fato de a palavra seguinte ter dígito é irrelevante (uma
   versão anterior deste handoff afirmava o contrário; estava errado).
2. **Palavras de uma letra e artigos/preposições são rebaixados** quando não são
   a primeira palavra, porque estão em `PALAVRAS_MINUSCULAS` (`a`, `o`, `e`,
   `de`, `do`, `da`, `os`, `as`…): `"Conjunto A"` → `"Conjunto a"`, e o mesmo
   para `"Bloco A"`, `"Quadra A"`, `"Lote E"`. Este efeito **não estava mapeado**
   antes.

**Alcance real (verificado — para não inflar a prioridade):** `titleCase` tem
**4 chamadas** no repo, todas sobre o campo `nome`:
`criarProjeto`/`atualizarProjeto` (`lib/db/projetos.ts:111,136`) e
`criarTecnico`/`atualizarTecnico` (`lib/db/tecnicos.ts:116,140`).
`lib/db/ums.ts`, `lib/db/ras.ts` e `lib/db/pontos.ts` têm **zero** ocorrências.

Portanto o problema aparece **somente quando alguém digita uma sigla (ou uma
palavra de uma letra) dentro do NOME de um projeto ou de um técnico**. Os
**endereços dos pontos** — onde as siglas do DF realmente aparecem o tempo todo
na tela — **vêm da planilha e não passam por `titleCase`**, assim como nomes de
UM e de RA. O escopo é bem mais estreito do que "aparece o tempo todo em tela".

**Opções (não implementadas — decisão do usuário/produto):**
1. **Lista de siglas conhecidas** — allowlist do DF (SQN, SQS, SHN, SHS, CLN,
   CLS, QNL, QNM, QNP, QNN, QSA, QDFM, CCSW, SCS, SCN…). Previsível, mas exige
   manutenção da lista.
2. **Heurística de palavra toda-maiúscula curta** — preservar palavra que já
   veio 100% em maiúsculas e tem ≤5 letras. Genérico e sem manutenção, mas
   depende de o usuário digitar em maiúsculas, e "DE"/"DA" digitados assim também
   seriam preservados.
3. **Não normalizar** nomes de Projeto/Técnico — devolve o controle ao usuário e
   elimina a classe de problema, ao custo de perder a padronização visual.

### ⬜ MELHORIA FUTURA DE A11Y — `aria-controls` / `aria-activedescendant`

Os roles estão corretos, mas o **Radix não liga automaticamente** o trigger
(`role="combobox"` no `PopoverTrigger`) ao `listbox` do cmdk: faltam
`aria-controls` apontando para o id da lista e `aria-activedescendant` apontando
para o item em foco. Leitores de tela anunciam as opções (já têm role), mas não
a relação trigger↔lista nem o item ativo durante a navegação por teclado.
Fora do escopo desta rodada.

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

## 10. CHECKLIST DE DEPLOY — servidor definitivo

> **Status: ENSAIADO LOCALMENTE em 2026-07-27.** O stack completo
> (postgres → app → nginx) subiu de fato, com a imagem do Dockerfile, e o
> roteiro abaixo foi **corrigido com o que o ensaio revelou**. O que está
> marcado ⚠️ falhou na primeira tentativa e exigiu mudança.

### 10.0 O QUE O ENSAIO REVELOU (leia isto antes de seguir o roteiro)

**Funcionou de primeira:** `output: "standalone"` + `node server.js`; o
`depends_on: service_healthy` do postgres; o app subindo (`Ready in 0ms`); o
`proxy.ts` em produção (307 sem cookie / 200 com cookie); as rotas de API em
**401 sem sessão** e `/api/auth/*` pública em 200; login **200** direto na 3000
**e** através do nginx (com `Set-Cookie session_token`); assets `.js`/`.css`
servidos via nginx; e a `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` **corretamente
embutida no bundle** pelo build arg (encontrada em 2 chunks de `.next/static`,
zero placeholders não substituídos, e `len=0` em runtime — que é o esperado,
pois não precisa ser env de runtime).

**⚠️ Falhou e precisou de correção (já aplicada no repo):**

1. **Build estourou o heap dentro do container.** `npm run build` compilou em
   ~44s e morreu no type-check com `FATAL ERROR: Ineffective mark-compacts near
   heap limit — JavaScript heap out of memory`. **Correção:** `ENV
   NODE_OPTIONS="--max-old-space-size=6144"` no stage `builder` do Dockerfile.
   Com isso o build passa (TypeScript em ~67s). O daemon local tinha ~7,7 GB —
   **conferir a RAM do host de produção**; se for menor, o build não passa.
2. **Não existia `.dockerignore`.** O `COPY . .` levava para a imagem:
   `tests/e2e/.auth/user.json` (**token de sessão válido**), todos os `.env*`,
   `.git/`, `node_modules/`, `.next/`, `test-results/`. **Correção:**
   `.dockerignore` criado, com o storage state e os `.env*` no topo.

**⚠️ Descobertas que mudam o procedimento (nenhum código a mudar, mas o
roteiro antigo estava errado):**

3. **`prisma migrate deploy` e o seed NÃO rodam no container de produção.** O
   runner recebe apenas `.next/standalone`, `.next/static`, `public`, `prisma/`
   e `node_modules/.prisma` — **não** tem o CLI do Prisma (não é importado pelo
   código, então o standalone não o empacota) nem o `tsx` (é devDependency, e o
   `db:seed` é `tsx prisma/seed.ts`). **Procedimento correto: one-off com a
   imagem do stage `builder`**, que tem o `node_modules` completo:

   ```bash
   docker build --target builder -t itc-routemap-migrate:latest \
     --build-arg NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=dummy .

   docker run --rm --network itc-routemap_default --env-file .env.docker \
     -e DATABASE_URL="postgresql://itc_user:<senha>@postgres:5432/itc_routemap" \
     itc-routemap-migrate:latest npx prisma migrate deploy

   docker run --rm --network itc-routemap_default --env-file .env.docker \
     -e DATABASE_URL="postgresql://itc_user:<senha>@postgres:5432/itc_routemap" \
     itc-routemap-migrate:latest npm run db:seed
   ```
   Note o `-e DATABASE_URL` sobrescrito: dentro da rede do compose o host é
   **`postgres`**, não `localhost`. Ambos foram **provados** no ensaio, num
   banco descartável: `Applying migration 20260723211652_init` → 12 tabelas, e
   `Admin ... criado com papel=admin` com `providerId=credential` e o convite
   consumido pelo hook.

4. **🔴 `docker run --env-file` e `docker compose --env-file` tratam aspas de
   forma DIFERENTE.** Medido no ensaio, para o mesmo `.env.docker`:
   `docker run` entregou `ADMIN_PASSWORD` com **8 caracteres e aspas
   literais**; o container do compose recebeu **6 caracteres** (aspas
   removidas). Consequência prática: **semear via `docker run --env-file` cria o
   admin com as aspas fazendo parte da senha** — e ninguém conseguiria logar
   depois. Isto é a mesma família de armadilha do `#` que já morde este projeto.
   **Regra para o `.env.docker` de produção: SEM aspas e SEM `#` no valor**
   (ver 10.2, item 4). Alternativa: semear com `docker compose run`, que
   normaliza as aspas.

5. **🔴 O `ADMIN_PASSWORD` do `.env.docker` atual tem 6 caracteres** — o seed
   valida `>= 8` e **abortaria** se rodado via compose. Só "funcionou" no ensaio
   porque o `docker run` somou as aspas. Precisa ser trocado antes do deploy
   (ação do usuário).

6. **`GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` estão VAZIOS no `.env.docker`**
   (`len=0`). O app sobe, mas loga
   `WARN [Better Auth]: Social provider google is missing clientId or
   clientSecret` e **o login com Google não funciona**. Se esse método for
   usado em produção, preencher.

7. **O `nginx.conf` não faz TLS** — ver 10.4, que deixou de ser "só colocar os
   certificados" e virou tarefa de trabalho.

8. **Ruído no build:** o prerender emite várias linhas
   `BetterAuthError: You are using the default secret`, porque
   `BETTER_AUTH_SECRET` é env de runtime e não build arg. **Não** quebra o build
   e em runtime o secret chega correto (`len=44`, idêntico ao do `.env`).
   Ignorar.

9. **Sem healthcheck no `app`**, e o `nginx` usa `depends_on: app` **sem**
   `condition` — só garante ordem de início, não prontidão. Se o nginx subir
   antes do Next servir, as primeiras requisições podem dar 502. Não aconteceu
   no ensaio (o app sobe em ~1s), mas em produção vale um healthcheck.

10. **`nginx/certs/` não existe no repo** (está no `.gitignore`), e o bind mount
    faz o Docker **criar o diretório vazio automaticamente** — então o nginx
    sobe normalmente mesmo sem certificados. Isso mascara a ausência de TLS.

---

Roteiro corrigido abaixo.

### 10.1 Infra e host
1. **DNS** do domínio de produção apontando para o host.
2. **Host Docker** provisionado (Docker + Compose v2).
3. `git clone`/`pull` da branch `docker-server` no servidor.

### 10.2 Segredos no `.env.docker` do servidor
Nunca commitados; preenchidos pelo dono do projeto, fora do chat.
4. **`ADMIN_PASSWORD` de produção** — gerada pelo usuário. Recomendação, agora
   reforçada pelo ensaio: **só letras e números, ≥16 caracteres, SEM `#` e
   escrita SEM ASPAS no arquivo**. Motivo medido: `docker run --env-file`
   **preserva as aspas** como parte do valor, enquanto o Compose as remove — com
   aspas, o seed grava um hash da senha *com* as aspas e o login depois falha
   (ver 10.0, item 4). A senha de dev **não** vale para produção. O assistente
   não gera nem sugere senha.
   ⚠️ O valor hoje no `.env.docker` tem **6 caracteres** e reprovaria na
   validação do seed (`>= 8`).
5. **`BETTER_AUTH_SECRET` NOVO** para produção (não reaproveitar o de dev — ele
   assina os cookies de sessão).
5b. ⚠️ **`BETTER_AUTH_URL` tem de casar EXATAMENTE com a origem de acesso** —
   protocolo + host + porta. Divergindo, o login responde **403 com
   `[Better Auth]: Invalid origin: <origem>`** no log e a senha parece errada
   sem estar. Em produção: `https://routemap.grupoitcbrasil.com.br`, **nunca**
   `localhost`. Medido em 2026-07-31: app na porta 3100 com a variável em
   `:3000` → todo `POST /api/auth/sign-in/email` em 403.
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

### 10.4 TLS e nginx — ⚠️ TAREFA DE TRABALHO, não só "colocar os certs"
10. `nginx/nginx.conf` hoje tem **apenas `listen 80`**. Não há `listen 443 ssl`,
    nem `ssl_certificate`/`ssl_certificate_key`, nem redirect 80→443 — embora o
    compose publique a porta **443** e monte `./nginx/certs`. Ou seja: **443 é
    publicada sem listener e o volume de certificados nunca é lido**. Colocar os
    arquivos em `./nginx/certs` **não** habilita HTTPS.
    Trabalho necessário antes do deploy:
    - obter os certificados (Let's Encrypt ou os do Grupo) e colocá-los em
      `./nginx/certs` (o diretório **não** está no repo — `.gitignore:56` — e o
      bind mount cria um vazio automaticamente, o que **mascara** a ausência);
    - acrescentar ao `nginx.conf` um `server { listen 443 ssl; ... }` com
      `ssl_certificate`/`ssl_certificate_key` e o mesmo bloco de `proxy_pass`
      já existente;
    - transformar o server da 80 em redirect permanente para HTTPS;
    - garantir que `BETTER_AUTH_URL=https://routemap.grupoitcbrasil.com.br` bate
      com a origem servida pelo nginx — ver 10.2 item 5b: divergência de porta
      dá 403. No ensaio local a divergência `http://localhost:3000` vs origem
      `http://localhost` não quebrou o login, mas não conte com essa tolerância.

### 10.5 Build e banco
11. **Build**: o heap maior é **obrigatório** e já está no Dockerfile
    (`ENV NODE_OPTIONS="--max-old-space-size=6144"` no stage `builder`) —
    sem ele o build **falha** dentro do container (comprovado). **Conferir a RAM
    do host**: o daemon do ensaio tinha ~7,7 GB.
    `docker compose --env-file .env.docker build`
12. Subir só o `postgres` primeiro e esperar `healthy`.
13. **`prisma migrate deploy`** — **NUNCA `migrate reset`** em produção — via
    **one-off da imagem `builder`**, com `DATABASE_URL` apontando para o host
    interno `postgres`. Comando exato em 10.0, item 3. **Não** tente rodar isso
    no container do app: ele não tem o CLI do Prisma.
14. **Seed do admin** também por **one-off da imagem `builder`** (o runner não
    tem `tsx`). Comando exato em 10.0, item 3.
    O seed é **idempotente por early-return**: se o usuário já existe, ele
    **não atualiza a senha** — trocar `ADMIN_PASSWORD` depois não tem efeito.
    Cuidado com aspas (10.0, item 4).
15. Subir `app` e depois `nginx`. Considerar adicionar um **healthcheck** ao
    `app` e `condition: service_healthy` no `depends_on` do nginx (hoje é só
    ordem de início — risco de 502 nas primeiras requisições).

### 10.6 Validação pós-deploy
16. Smoke test: login com a senha de produção, navegar pelas 8 páginas, abrir um
    lote no Histórico, rodar um cálculo de rotas.
17. Conferir que as rotas de API respondem **401 sem sessão** (blindagem da
    Frente 4) e que `/api/auth/*` segue pública. **Todas validadas no ensaio,
    através do nginx:** `geocode-pontos`, `sincronizar`, `routes/alocar`,
    `routes/single` e `geocoding` → 401; `auth/get-session` → 200.
18. Conferir acentuação (UTF-8) e ausência de erro no log do container.
19. Conferir que o **mapa carrega** (é o teste de que a
    `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` foi passada como **build arg**; se o build
    rodar sem ela, o bundle sai sem a chave e só se descobre no browser).

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

## 10.8 MIGRAÇÃO DE DADOS Firestore → Postgres (`scripts/migrar-firestore.ts`)

O código já roda em Postgres, mas os dados de produção seguem no Firestore. O
script traz projetos, RAs, técnicos, UMs, pontos e rotas. **Dry-run é o default**
(`--gravar` para persistir), só-leitura no Firestore, idempotente por `upsert`
com os IDs originais.

### ⚠️ PRESSUPOSTO CRÍTICO: planilha e app ALINHADOS

A migração assume que o ciclo operacional está fechado, ou seja, que **cada ponto
`Agendado` (era `Atual` na planilha) é exatamente um dos pontos referenciados por
uma rota `Confirmada`**. O ciclo é:

```
confirma a rota no app → app grava "Agendado" → marca-se "Atual" na planilha
                                              → a linha anterior vira "Histórico"
```

Quando o **passo manual da planilha está pendente**, os dois conjuntos divergem —
e é isso que o `analisarVinculo` detecta. **O dry-run é a checagem desse
alinhamento**, e vale re-executá-lo perto da virada, porque o alinhamento muda
com a operação do dia a dia:

- **Alinhados** → o script reconstrói `Ponto.rotaId`/`tecnicoId` pela rota
  `Confirmada` mais recente de cada ponto ("Agendado" sem rota seria incoerente).
- **Divergentes** → registra a diferença como **CONFLITO**, que **bloqueia a
  gravação**, e lista ponto por ponto os dois lados. A saída é alinhar a fonte
  (marcar a planilha) e rodar de novo — não forçar.

Estado em 2026-07-29: **desalinhado**. 7 pontos `Atual` × 7 pontos com rota
`Confirmada`, apenas 3 em comum: nas 4 UMs BSBIA a rota da etapa 7 já foi
confirmada no app, mas a planilha ainda marca a etapa 6 como `Atual`. O usuário
vai completar esse passo na planilha e avisar.

### Consolidação 7 documentos → 3 projetos

O Firestore tem um "projeto" **por aba** (artefato de modelagem), não duplicatas.
Canônico = `criadoEm` mais antigo; recebe a **união** dos `sheetAbas`;
`Ponto/Rota/Um.projetoId` são remapeados. Verificado: `sheetId`/`sheetUrl`
idênticos dentro de cada sigla, batendo com as 3 planilhas reais, e os
`sheetAbas` do Firestore contêm **só abas de UM** (`LEIA-ME`/`GERAL` nunca
entraram).

| sigla | id canônico | sheetAbas | pontos | rotas | ums |
|---|---|---|---|---|---|
| BSBIA | `KMPN6GsZS9VumMjPGTLG` | BSBIA01..04 | 64 | 64 | 4 |
| SPV | `J44DXkY1jNE9Z1oZ31eu` | SPV01, SPV02 | 35 | 8 | 2 |
| CODHAB | `nfv4FP9dPwS4JsaRffVT` | CODHAB01 | 32 | 4 | 1 |

**IDs preservados** (o `@default(cuid())` só vale quando o valor não é
fornecido), o que mantém os vínculos cruzados sem remapeamento. **`hashMd5` é
recalculado** nos pontos que mudaram de `projetoId` **ou** de `status` — ambos
participam do hash (`projetoId` é o 1º campo, `status` o 13º).

### Não migra

- **`convites`**: o único é do admin, que o seed já cria.
- **15 pontos órfãos** (projeto deletado no Firestore): todos da aba `BSBIA03`,
  que segue na planilha — a sincronização repovoa. 14 dos 15 duplicam pontos
  existentes. `--incluir-orfaos` migra, se um dia fizer sentido.
- **Usuários**: o auth antigo era Firebase Auth com popup Google — não há senha
  para migrar. O acesso se resolve por convite + primeiro acesso.

### Divergência de nomenclatura conhecida (não bloqueia)

A UM do CODHAB está cadastrada como `CODHAB` e a aba/`Ponto.umNome` é
`CODHAB01`. Não afeta a roteirização: `obterDestinosPorUM` monta a lista a partir
de `Ponto.umNome`, não da tabela `Um`. Afeta só o cadastro exibido em
Admin → UMs.

---

## 10.9. Identidade do ponto: chave natural (commit `d15ee58`)

A identidade era `umNome + linhaOrigem` — a POSIÇÃO da linha. Inserir uma etapa
no meio da aba desloca as linhas seguintes, e a sync lia cada deslocada como
"sumiu" + "nova": deletava e recriava a aba inteira, perdendo vínculos de rota.
Inserir etapa é evento de todo ciclo.

Chave nova: `projetoId + umNome + ciclo + etapa + plusCode`. Única nos 131 pontos
do Firestore E nas 131 linhas das 3 planilhas (0 colisões dos dois lados).
`plusCode` é necessário: sem ele restam 5 grupos de visitas legítimas
indistinguíveis (2 visitas à mesma cidade na mesma etapa, em locais diferentes).
`linhaOrigem` saiu do hash pelo mesmo motivo — segue como campo informativo.

- **Plus Code vazio** → linha pulada, com aviso (aba, linha, cidade). Sem ele não
  há identidade, e degradar em silêncio fundiria dois pontos em um.
- **Guarda de deleção**: ponto com `rotaId` ou "Agendado" não é deletado quando a
  linha sai da planilha — vira "Histórico" e entra no contador `preservados`.
- **Migração**: recalcula o hash dos **131** pontos (antes, só os remapeados) —
  todo hash gravado antes inclui `linhaOrigem`. Invariante conferido: 131/131
  idênticos entre Firestore e planilha, casados pela chave nova.
- **`.npmrc`** com `node-options=--max-old-space-size=6144` (mesmo valor do
  Dockerfile): `npm run build` estourava o heap default.

---

## 10.10. Vínculo `Rota.pontoId` corrompido no Firestore

**12 das 13 rotas Confirmada apontam para o ponto errado.** Conferido comparando
`Rota.destino` (snapshot) com o conteúdo atual do `Ponto` referenciado: só 1 casa.
Todos os 12 pontos apontados estão hoje em `linhaOrigem=2`. Ex.: a rota do lote
`7401cc7d` gravou Candangolândia, e o ponto `GcFRT7MK…` hoje é Planaltina c2/e7.

**Causa:** a identidade por posição de linha. Etapa nova entra no topo da aba, a
sync antiga fazia update-in-place e sobrescrevia o conteúdo do ponto mantendo o
mesmo id — a rota seguia apontando para o id, agora com outro dado. A chave
natural (§10.9) corrige a recorrência; a guarda de deleção cobre o outro lado.

**Consequências:**
- A migração **não reconstrói `rotaId`/`tecnicoId`** (decisão B, nulo): reconstruir
  tornaria o vínculo corrompido permanente no Postgres.
- O "desalinhamento planilha × app" que o script bloqueia é **artefato desta
  corrupção**, não passo manual pendente. A planilha **não** deve ser editada para
  forçar alinhamento, e o bloqueio deixa de ser critério válido.
- O snapshot da Rota está **correto** e é o que toda a UI já exibe. O `Ponto`
  corrompido é lido só para a `referencia` do texto de WhatsApp
  (`historico/[loteId]/page.tsx:96,996`) e — este é o dano real, em escrita — no
  `cancelarLote` (`lib/db/lotes.ts:155`), que libera o ponto errado.

### Dívida adiada (decisão de 2026-07-31)

1. `destinoReferencia` no snapshot da `Rota` (~15 linhas: schema + migration +
   escrita) — hoje o texto de WhatsApp busca a `referencia` no `Ponto` e pode
   colar a de outro ponto junto do endereço correto do snapshot.
2. `cancelarLote` liberar o ponto errado só afeta os vínculos antigos do
   Firestore; com `rotaId` nulo na migração não há vínculo corrompido no Postgres.

## 10.11. Coordenadas e `PESO_PROXIMIDADE` (validação com dados reais)

🔴 **Vírgula decimal:** a planilha grava `-15,9040875` e `parseFloat` devolve
`-15` — erro de ~100 km, gravado sem erro nenhum. **As 34 latitudes das abas SPV
estão como `-15` no Firestore de produção.** Ficou mascarado porque a longitude
nunca era lida (range parava em `M`): sem ela o ponto contava como "sem
coordenadas" e o geocoding sobrescrevia os dois campos. Corrigir só a longitude
teria **ativado** a corrupção. Commits `2f9dd37` (range `A2:N`) e `39d3f04`
(`coordenadaDaPlanilha`).

**Auto-cura (opção b):** quando o hash bate e a coordenada divergiu, a sync
atualiza só latitude/longitude (`coordenadasCorrigidas` no relatório) — necessário
porque coordenada não entra no hash. Guarda: planilha vazia **nunca** sobrescreve
o que o geocoding gravou, nos dois caminhos de escrita. Cura também o que a
migração trouxer com `-15`, já que produção roda o código antigo até a virada.

**`PESO_PROXIMIDADE` = 0.3 está correto — medido, não estimado.** Sobre a matriz
real (7×5, Routes API), **0.3, 0.5 e 0.7 dão alocação idêntica**: 169 min de time,
pior individual 70 min. O peso está saturado (só vira par em quase-empate). Forçar
melhora custa: Allan→Planaltina **+93 min**, Paulo→Gama **+38 min** (e Santa Maria
já é o ótimo do Paulo). O `modoPrincipal` vem do cadastro; Allan em TRANSIT levaria
o time a 236 min — o carro dele é o que viabiliza o destino isolado.

---

## 11. PRÓXIMA AÇÃO IMEDIATA

Aguardando **OK do usuário no grupo B da Frente 2** (§6). Com o OK: aplicar os 10
disables + limpeza da diretiva órfã → `lint` (0) → `build` (pass) → reportar →
seguir para a Frente 3 (propor seed-teste no CHECKPOINT 3.1).
