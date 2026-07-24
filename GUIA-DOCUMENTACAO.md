# Guia de documentação de projetos

Template e instruções para documentar projetos web desenvolvidos com
Next.js, Prisma e stack relacionada. Baseado no padrão adotado no
Sistema Fraterna (2026).

---

## Estrutura de arquivos

```
projeto/
├── documentacao-[projeto].md     ← documento técnico principal
├── CLAUDE.md                     ← contexto permanente para o Claude Code
├── PROMPT_CLAUDE_CODE.md         ← prompt de inicialização do desenvolvimento
├── docs/
│   ├── ARCHITECTURE.md           ← arquitetura e decisões estruturais
│   ├── PROGRESS.md               ← log cronológico de módulos concluídos
│   ├── DECISIONS.md              ← decisões técnicas com contexto e justificativa
│   ├── API.md                    ← todas as rotas documentadas
│   └── modules/
│       ├── 00-foundation.md
│       ├── 01-auth.md
│       ├── 02-layout.md
│       └── ...
└── tests/                        ← tudo relacionado a testes, numa única pasta
    ├── PLANO-DE-TESTES.md        ← plano de testes: casos, critérios, status
    ├── unit/                     ← testes unitários (Vitest) — lógica pura
    ├── integration/              ← testes de integração (Vitest + banco de teste)
    └── e2e/                      ← testes E2E (Playwright)
        ├── tests/
        ├── helpers/
        └── setup/
```

Todo projeto deve manter uma única pasta `tests/` na raiz reunindo planos de
teste e specs (unitários, integração, E2E). Evita testes e documentação de
teste espalhados pela raiz do repositório.

---

## 1. documentacao-[projeto].md

Documento técnico completo. Atualizado após cada módulo concluído.

### Seções obrigatórias

**1. Visão Geral** — o que o sistema faz, para quem e qual problema resolve.
Inclui dados do cliente e do desenvolvedor.

**2. Stack de Tecnologia** — tabela com tecnologia, versão e papel de cada uma.
Versões exatas — não "latest".

**3. Estrutura de Pastas** — árvore com comentários explicando cada diretório.

**4. Schema do Banco de Dados** — lista dos models com suas responsabilidades,
campos notáveis e regras de negócio. Inclui informações sobre o seed.

**5. Autenticação e Autorização** — biblioteca usada, estratégia de sessão,
hash de senhas, roles, regras de proteção de rotas. Destacar a regra crítica
de validação server-side.

**6. Módulos implementados** — um parágrafo por módulo com data de conclusão
e link para o arquivo detalhado em `docs/modules/`.

**7. Identidade visual e design system** — paleta de cores (tokens CSS),
tipografia, símbolo/logo, temas. Referenciar `.interface-design/system.md`
se existir.

**8. Integrações de IA** — modelos usados por feature, justificativa de cada
escolha, custo estimado.

**9. Segurança** — ferramentas de análise estática, rate limiting, validações.

**10. Infraestrutura e deploy** — como rodar localmente, como fazer deploy,
onde está hospedado.

**11. Git e versionamento** — estratégia de branches, padrão de commits,
pre-commit hooks.

**12. CI/CD** — workflows ativos, o que cada um faz, ferramentas usadas.

---

## 2. CLAUDE.md

Contexto permanente lido automaticamente pelo Claude Code a cada sessão.
Deve ser conciso — o Claude Code lê no início de cada sessão.

### Conteúdo obrigatório

- O que é o projeto (2-3 frases)
- Stack com versões fixas (tabela)
- Regras invioláveis de identidade visual (tokens CSS)
- Roles e permissões (tabela)
- Modelos de IA em uso
- Lista de componentes obrigatórios (se houver design system próprio)
- Decisões de arquitetura críticas (bullet list)
- Modo de execução (como o Claude Code deve se comportar)
- Padrão de commits
- Ferramentas ativas (Context7, shadcn MCP, Ponytail, interface-design)
- Comandos úteis

### O que não colocar

Detalhes de implementação, lógica de negócio, histórico de versões.
Esses ficam nos arquivos da pasta `docs/`.

---

## 3. PROMPT_CLAUDE_CODE.md

Prompt de inicialização do desenvolvimento. Enviado como primeira mensagem
ao Claude Code no início de um projeto novo.

### Conteúdo obrigatório

- Contexto do projeto
- Stack técnica com versões exatas
- Identidade visual completa (tokens CSS, fontes, símbolo, tom)
- Perfis de acesso (tabela de roles)
- Schema Prisma completo
- Estrutura de pastas esperada
- Telas e funcionalidades por módulo
- Integrações de IA (modelos e propósito de cada um)
- Variáveis de ambiente necessárias
- Docker Compose de desenvolvimento
- Sidebar e comportamento de layout (se aplicável)
- Responsividade (breakpoints)
- Padrão de commits (tabela de tipos com exemplos)
- Documentação em /docs (estrutura e o que documentar por módulo)
- Instruções de desenvolvimento (regras gerais)
- Plano de desenvolvimento — módulos e tarefas detalhadas
- Modo de execução (sequencial, com ou sem aprovação entre módulos)

### Plano de módulos

Cada módulo deve ter:
- Número e nome
- Lista de tarefas com checkboxes
- Commit ao final de cada tarefa
- Checkpoint de aprovação ao final do módulo (ou execução automática)
- Instrução de atualizar `/docs` ao finalizar

---

## 4. docs/ARCHITECTURE.md

Visão geral da arquitetura. Atualizado quando há mudança estrutural.

### Seções

**Visão geral** — 2-3 frases descrevendo o fluxo principal de dados.

**Stack** — tabela camada/tecnologia (mais concisa que o documento principal).

**Decisões estruturais** — bullet list com as decisões que impactam toda a
base de código. Exemplos: Server Components por padrão, sem SQL raw, validação
sempre no servidor, banco de teste isolado.

**Fluxo de dados** — descreve o fluxo principal de ponta a ponta.

**Infra local** — como rodar o ambiente de desenvolvimento.

---

## 5. docs/PROGRESS.md

Log cronológico de tudo que foi implementado. Nunca editar entradas antigas.

### Formato

Tabela com três colunas: Data | Módulo | Resumo.

O resumo deve ser objetivo e técnico — o que foi implementado, quais
problemas foram resolvidos, quais bugs foram corrigidos. Não é um diário,
é um registro técnico.

### Quando atualizar

Após cada módulo ou versão concluída. A entrada mais recente fica no topo.

---

## 6. docs/DECISIONS.md

O documento mais valioso para manutenção futura. Registra o **porquê**
de cada decisão técnica relevante, não apenas o quê.

### Formato por entrada

```
## [módulo]-[número] — [Título curto da decisão]

[Contexto: por que a decisão precisou ser tomada]
[Alternativas consideradas]
[Justificativa da escolha]
[Consequências para manutenção futura]
```

### O que documentar

- Escolhas de biblioteca (especialmente quando há alternativas)
- Decisões de modelagem do banco
- Estratégias de autenticação e autorização
- Padrões de validação e segurança
- Comportamentos não óbvios escolhidos deliberadamente
- Qualquer coisa que, se não documentada, levaria a refazer a mesma análise

### O que não documentar

Decisões óbvias ou consensuais. Foco em decisões onde a alternativa também
seria razoável.

---

## 7. docs/API.md

Documentação de todas as rotas de API. Atualizado após cada módulo que
adiciona ou modifica rotas.

### Formato por rota

```
### [MÉTODO] /api/[rota]
Autenticação: [pública | sessão ativa | role específica]
Query: `param` (tipo, descrição) — quando aplicável
Body: `{ campo: tipo, campo?: tipo_opcional }`
Resposta 200: `{ estrutura }`
Resposta [código]: [condição]
[Notas adicionais quando relevante]
```

### Organizar por recurso

Agrupar rotas pelo recurso que manipulam (lançamentos, contas, etc.).
Incluir as regras comuns de cada grupo no topo da seção.

---

## 8. docs/modules/[N]-[nome].md

Um arquivo por módulo. Criado e preenchido ao concluir cada módulo.

### Seções obrigatórias

**O que foi implementado** — lista detalhada por subcategoria (validação,
API, UI, utilitários). Nomes de arquivos, funções, componentes e rotas.
Seja específico.

**Verificação executada** — o que foi testado e como. Pode ser tabela de
cenários ou descrição. Módulo sem verificação documentada não está concluído.

**Decisões** — decisões técnicas tomadas neste módulo. As mais importantes
devem ser duplicadas no `docs/DECISIONS.md`.

**Pontos de atenção** — o que a pessoa que vai manter este código precisa
saber. Comportamentos não óbvios, pendências, compromissos de arquitetura.

**Commits** — lista dos commits deste módulo (hash + mensagem).

---

## 9. Testes

### Organização

Todos os testes e a documentação de testes ficam dentro de uma única pasta
`tests/` na raiz do projeto — nunca soltos na raiz ou em pastas próprias
(`e2e/`, `PLANO-DE-TESTES.md` na raiz, etc.):

- `tests/PLANO-DE-TESTES.md` — plano de testes completo
- `tests/unit/` — specs Vitest de lógica pura
- `tests/integration/` — specs Vitest com banco de teste
- `tests/e2e/` — specs Playwright (`tests/`, `helpers/`, `setup/`)

### Tipos de teste e o que cobrem

| Tipo | Ferramenta | O que cobre |
|---|---|---|
| Unitários | Vitest | Lógica pura: schemas Zod, funções utilitárias, helpers, regras de negócio sem I/O |
| Integração | Vitest + banco de teste | API routes com banco real, queries Prisma, permissões, validações server-side |
| E2E | Playwright | Fluxos completos no browser: login, ações críticas, exportações |
| Acessibilidade | axe-core + Playwright | Violações WCAG nas telas principais |

### Configuração

- **Banco de teste isolado:** o `vitest.config.ts` deve sobrescrever
  `DATABASE_URL` para um banco dedicado (ex: `projeto_test`). Nunca testar
  contra o banco de desenvolvimento.
- **Paralelismo:** desabilitar paralelismo de arquivos para testes de
  integração que compartilham banco (`fileParallelism: false`).
- **Cobertura:** restringir aos arquivos de lógica pura (`lib/**`),
  excluindo código gerado, singletons e arquivos de configuração.
  Thresholds recomendados: 80% linhas, 80% funções, 70% branches.

### Scripts no package.json

```json
{
  "test": "vitest",
  "test:coverage": "vitest run --coverage",
  "test:watch": "vitest --watch",
  "test:e2e": "playwright test",
  "test:e2e:ui": "playwright test --ui",
  "test:e2e:report": "playwright show-report"
}
```

### Onde cada workflow roda

| Workflow | GitHub Actions | Forgejo Actions | Observações |
|---|---|---|---|
| CI (type-check, lint, testes unitários/integração, audit) | ✅ `.github/workflows/ci.yml` | ✅ `.forgejo/workflows/ci.yml` | Requer service PostgreSQL no CI. No Forgejo, hostname do banco é o nome do service (não `localhost`) |
| Testes E2E (Playwright) | ✅ | ✅ (com adaptação) | Playwright roda contra dev server. No Forgejo, garantir que o runner tem Node e que `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` para Alpine |
| Security — Gitleaks | ✅ `.github/workflows/gitleaks.yml` | ✅ `.forgejo/workflows/security.yml` | No GitHub: usa `gitleaks/gitleaks-action@v2`. No Forgejo: instalar binário estático diretamente |
| Security — Semgrep | ✅ (via CodeQL ou Semgrep) | ✅ `.forgejo/workflows/security.yml` | No Forgejo: usar container Semgrep com clone manual via token |
| CodeQL | ✅ `.github/workflows/codeql.yml` | ❌ Não disponível | CodeQL é exclusivo do GitHub. No Forgejo, Semgrep cobre SAST |
| Trivy (filesystem scan) | ✅ | ✅ `.forgejo/workflows/trivy.yml` | No Forgejo: usar binário estático (sem Docker no runner Alpine) |
| Renovate / Dependabot | Dependabot (`.github/dependabot.yml`) | Renovate (`.forgejo/workflows/renovate.yml`) | Ferramentas diferentes, mesma função. Renovate requer token de acesso pessoal |
| Deploy | ❌ (manual ou script) | ✅ `.forgejo/workflows/deploy.yml` | Deploy automático no merge para main via SSH |

### Adaptações necessárias para o Forgejo

O runner padrão do Forgejo usa imagem `node:22-alpine` (musl, sem glibc).
Isso causa problemas com ferramentas que dependem de glibc ou Docker:

1. **`actions/setup-node`** — não usar. O runner já tem Node 22; o `setup-node`
   baixa binário glibc que não roda em Alpine.
2. **`ssh-keyscan`** — não disponível por padrão. Instalar com
   `apk add --no-cache openssh-client` antes de usar SSH.
3. **Docker CLI** — não disponível no runner Alpine. Para Trivy, usar o binário
   estático em vez de `trivy-action`. Para deploy, fazer SSH no servidor e
   executar Docker lá.
4. **Secret names** — o Forgejo reserva os prefixos `FORGEJO_`, `GITEA_` e
   `GITHUB_`. Usar prefixos como `BOT_`, `DEPLOY_` etc.
5. **PostgreSQL service** — o hostname do banco no CI do Forgejo é o nome do
   service definido no workflow (ex: `postgres`), não `localhost`.

### Pinagem de actions

Para evitar supply-chain attacks (regra do Semgrep), todas as `uses:` devem
referenciar o SHA completo do commit em vez de tags mutáveis:

```yaml
# Errado
uses: actions/checkout@v4

# Correto
uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
```

---

## 10. Padrão de commits

```
tipo(escopo): descrição curta
```

| Tipo | Uso |
|---|---|
| `feat` | Nova funcionalidade |
| `fix` | Correção de bug |
| `security` | Correção de segurança |
| `refactor` | Refatoração sem mudança de comportamento |
| `test` | Testes |
| `docs` | Documentação |
| `chore` | Manutenção, configuração |
| `perf` | Performance |
| `ci` | Pipeline |
| `style` | Formatação |

Exemplos:
```
feat(lancamentos): add multi-select category filter
fix(auth): redirect loop on session expiry
security(api): add filialId validation to all routes
docs: update module 04 lancamentos documentation
ci: add Gitleaks secret scanning workflow
chore: bump version to 1.0.6
```

---

## 11. Ciclo de atualização da documentação

Após cada módulo ou versão concluída:

1. Preencher `docs/modules/[N]-[nome].md`
2. Adicionar entrada no topo de `docs/PROGRESS.md`
3. Mover decisões relevantes para `docs/DECISIONS.md`
4. Atualizar `docs/API.md` com novas rotas
5. Atualizar a seção "Módulos implementados" em `documentacao-[projeto].md`
6. Commitar: `docs: document module [N] [nome]`

---

## 12. Princípios

**Documente o porquê, não só o quê.**
O `DECISIONS.md` é o documento mais valioso. Cada decisão relevante deve
ter contexto e justificativa — especialmente quando a alternativa também
seria razoável.

**Verificação é parte do módulo.**
Módulo sem verificação documentada não está concluído. A verificação pode
ser manual (browser, curl) ou automatizada (testes), mas deve ser registrada.

**Commits rastreáveis.**
A lista de commits no final de cada módulo permite reconstruir o histórico
de qualquer decisão sem sair da documentação.

**Pontos de atenção para o próximo desenvolvedor.**
Escreva o que você gostaria de ter sabido antes de entrar naquele código.
Comportamentos não óbvios, pendências com o cliente, compromissos de
arquitetura.
