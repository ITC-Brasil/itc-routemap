# 🗺 ITC RouteMap — Roadmap Detalhado

> **Cole também este arquivo no início da próxima conversa, junto com o HANDOFF.md.**
> Enquanto o HANDOFF descreve **onde estamos**, este ROADMAP descreve **pra onde vamos**.

---

# 🟦 FASE 4 — Conclusão (etapas restantes)

## 13.9 — Histórico de Alocações

### Objetivo

Página `/historico` que lista todas as alocações já confirmadas, agrupadas por **lote** (cada lote = uma rodada de cálculo), permitindo consulta, auditoria visual e (opcionalmente) cancelamento de lotes inteiros.

### Escopo da UX

**Visualização macro (default)**: lista de cards, um por lote, ordenados por data decrescente. Cada card mostra:

- **Cabeçalho**: data/hora do cálculo (formato pt-BR), `loteId` truncado, status agregado (ex: "3/3 Confirmadas", "2/3 Confirmadas + 1 Cancelada")
- **Métricas resumidas**: total de rotas, tempo total agregado, modo predominante (com ícone)
- **Justificativa do Gemini/template** (1ª linha truncada, ler completa ao expandir)
- **Mini-grid** das alocações: avatares dos técnicos + UMs, sem detalhes
- **Botão "Expandir"** → mostra cada Rota detalhada (formato similar ao `ResultadoAlocacao` v2 mas **read-only**: sem seletor de modo, sem botão confirmar)
- **Botão "Cancelar lote"** (com confirmação): transiciona todas as Rotas do lote pra `status="Cancelada"` e os Pontos correspondentes voltam pra `status="Pendente"` (atômico em writeBatch)

**Vista detalhada (ao expandir um lote)**: cada Rota individual fica como um card menor mostrando:
- Técnico → UM (snapshot, não precisa link clicável por enquanto)
- Modo escolhido (com ícone + tempo + distância)
- Mapa estático opcional (decisão a tomar: pode ser caro pq cada lote teria N mini-mapas; sugestão: NÃO renderizar mapa por default no histórico, oferecer botão "Ver mapa" que carrega lazy)

### Filtros e ordenação

- **Período**: hoje / últimos 7 dias / últimos 30 dias / customizado (date range picker)
- **Status do lote**: todos / com confirmadas / com canceladas
- **Técnico**: dropdown com lista de técnicos cadastrados; filtra lotes que incluem aquele técnico
- **Projeto**: dropdown de projetos
- **Ordenação**: data desc (default), data asc, qtd de rotas, tempo total

### Arquitetura proposta

**Dados**:
- Já temos `listarRotas()` em `lib/firestore/rotas.ts` — retorna todas as rotas ordenadas por criação desc
- Vamos precisar agrupar client-side pelo `loteId` → criar nova função helper `agruparPorLote(rotas: Rota[]): LoteAgrupado[]`
- `LoteAgrupado` carrega: `loteId`, `criadoEm` (primeira), `justificativa`, `rotas[]`, métricas agregadas

**Componentes novos**:
- `app/(privado)/historico/page.tsx` — entry point
- `app/(privado)/historico/_components/filtros.tsx` — barra de filtros sticky
- `app/(privado)/historico/_components/card-lote.tsx` — card colapsado/expandido
- `app/(privado)/historico/_components/rota-readonly.tsx` — versão view-only

**Função em `rotas.ts`** (a adicionar):
```typescript
export async function cancelarLote(loteId: string): Promise<void> {
  // Lista rotas do lote
  // writeBatch: 
  //   - update rotas.status = "Cancelada"
  //   - update pontos correspondentes: status = "Pendente", remove tecnicoId, remove rotaId
}
```

### Considerações importantes

- **Paginação**: se o histórico crescer, listar TODOS os lotes vai ficar pesado. Sugestão: limitar últimos 50 por padrão e ter botão "Carregar mais" (ou cursor pagination com `startAfter`)
- **Não regere mapa**: o JSON da rota tem todas as métricas mas NÃO tem polyline (a polyline foi fetched no momento do cálculo e descartada). Pra ver o mapa de uma rota histórica, vai precisar refetchar via `/api/routes/single`. Decisão a tomar: salvar polyline da rota escolhida no documento Rota (custo de storage menor que custo da chamada)
- **Permissão de cancelar**: admin-only? Qualquer logado? Discutir antes
- **Side effects de cancelar**: se um ponto já transicionou pra "Histórico" entre a confirmação e o cancelamento, o que fazer? Talvez bloquear cancelamento se o ponto não estiver mais "Agendado"

### Estimativa: 5-7h de implementação

---

## 13.10 — Polish + Testes E2E da Fase 4

### Polish list (UX/bugs)

- [ ] **Loading state mais fino no TRANSIT**: hoje aparece "Buscando rota..." genérico. Trocar pra "Calculando rota de transporte público..." quando o modo for TRANSIT
- [ ] **Empty state pra UMs sem transit**: card específico explicando "Transporte público não disponível entre esses pontos no horário solicitado"
- [ ] **Centralizar `nomeAmigavelModo` e `IconeModo`**: hoje duplicados em `lib/gemini.ts` e `_components/resultado-alocacao.tsx`. Mover pra `lib/modos-transporte.ts` e importar dos dois lugares
- [ ] **Persistir polyline no Rota**: salvar a polyline do modo escolhido no documento Firestore pra histórico não precisar refetchar (preparação pro 13.9)
- [ ] **Confirmação dupla antes de Confirmar**: dialog "Tem certeza? Esta ação cria X rotas e altera Y pontos" — opcional, discutir
- [ ] **Tela vazia pós-confirmação**: depois de confirmar, se voltar pra `/calcular-rotas`, mostrar "Todos os pontos pendentes foram alocados" em vez do empty state genérico
- [ ] **Erro mais útil quando geocoding falha**: hoje só mostra mensagem; oferecer link "Editar ponto" inline na mensagem de erro
- [ ] **Loading do mapa**: quando muda de modo rapidamente, evitar piscar (debounce 200ms na carga da nova rota)

### Testes E2E (escopo da Fase 4)

Setup recomendado:
- **Playwright** (mais estável que Cypress pra Next 16)
- Arquivos em `e2e/fase4/*.spec.ts`
- Mock do Gemini com fixture (não gastar quota nos testes)
- Stub do Google Maps via interceptação de requests

**Cenários críticos a cobrir**:

1. **Happy path: cálculo + confirmação**
   - Login como admin
   - Vai pra `/calcular-rotas`
   - Pré-seleções aparecem
   - Clica Calcular
   - Aguarda resultado
   - Confirma
   - Verifica redirect e status dos pontos no Firestore (via Admin SDK no teardown)

2. **Atomicidade do batch**
   - Simular erro no meio do writeBatch (mock que falha no update do segundo ponto)
   - Verificar que NENHUMA rota foi criada e NENHUM ponto foi alterado

3. **Validações de entrada**
   - Selecionar 0 técnicos → botão Calcular disabled
   - Técnico sem coordenadas → erro claro antes de chamar API

4. **Troca de modo recalcula totais**
   - Calcular alocação
   - Expandir card
   - Trocar modo de DRIVE pra WALK
   - Verificar que os 4 cards do topo atualizam

5. **TRANSIT lazy + cache**
   - Trocar pra TRANSIT
   - Verificar 1 chamada à `/api/routes/single`
   - Voltar pra DRIVE, voltar pra TRANSIT
   - Verificar que NÃO houve nova chamada (cache hit)

### Estimativa: 4-6h (setup + 5 specs)

---

# 🟦 FASE 5 — Dashboard, Estatísticas e Página Início

> **Objetivo geral da Fase 5**: o usuário admin abre o sistema e tem **visão imediata** do estado operacional, sem precisar ir clicando em cada página administrativa.

## 5.1 — Página Início (`/`)

Substitui o login direto → dashboard como tela inicial após autenticação.

### Composição da página

**Linha 1 — KPIs principais (4-6 cards)**:
- Pontos Pendentes (= aguardando alocação) com link "Calcular Rotas →"
- Pontos Agendados (rotas confirmadas) com link "Histórico →"
- Técnicos disponíveis (com lat/lng) com link "Técnicos →"
- Rotas Confirmadas hoje (cronograma da equipe)
- Alocações no mês (volume operacional)
- Tempo médio de deslocamento (insight de performance)

**Linha 2 — Cronograma do dia**:
- Lista das Rotas com status="Confirmada" agendadas pra hoje
- Cada item: avatar técnico + UM + horário previsto + ícone do modo
- Empty state amigável se não tem nada agendado pra hoje

**Linha 3 — Gráficos compactos**:
- Histograma de alocações (últimos 30 dias) → linha
- Pizza de modos de transporte (proporção carro/moto/a pé/transit no mês)
- Barra horizontal: top 5 técnicos por número de alocações

**Linha 4 — Atividade recente**:
- Feed dos últimos 10 eventos: "Alocação confirmada por Matheus", "Sincronização do Sheets X concluída", "Ponto Y editado", etc
- Requer auditoria implementada (Fase 6.3)

### Stack para gráficos

- **Recharts** (já tem suporte no preset Nova do shadcn)
- Componentes: `ResponsiveContainer`, `LineChart`, `PieChart`, `BarChart`

### Estimativa: 6-8h

---

## 5.2 — Estatísticas Operacionais (`/estatisticas`)

Página dedicada pra análise mais profunda. Filtros por período + visualizações ricas.

### Métricas calculáveis

**Volumétricas**:
- Total de alocações por período
- Total de pontos cobertos vs pendentes
- Volume de pontos sincronizados (importações do Sheets)

**Tempo**:
- Tempo médio de deslocamento por técnico
- Tempo total de deslocamento da frota (mês)
- Distribuição (percentis P50, P75, P95) dos tempos

**Modo de transporte**:
- % de uso de cada modo (DRIVE/TWO_WHEELER/WALK/TRANSIT)
- Tempo médio por modo

**Geográficas**:
- Top 10 RAs mais visitadas
- Mapa de calor de UMs (cidades com mais atividade)

**Por técnico**:
- Ranking de produtividade (volume)
- Eficiência (tempo médio mais baixo)
- Localização dos pontos cobertos por cada técnico (heatmap por técnico)

### Filtros

- Período (date range picker)
- Comparativo (mês atual vs mês passado, lado a lado)
- Por projeto (PNCS/BSBIA01-04)
- Por técnico individual ou time inteiro

### Exports

- Botão "Exportar PDF" (relatório completo)
- Botão "Exportar Excel" (planilha com todas as alocações filtradas)

### Estimativa: 8-12h (depende de quantos gráficos)

---

## 5.3 — Histórico Avançado

Versão mais completa do `/historico` da 13.9.

Diferenças do 13.9:

- **Busca textual**: encontrar lote por nome de técnico, UM, RA, justificativa do Gemini
- **Comparação de lotes**: selecionar 2 lotes e ver diff lado a lado
- **Reaplicar alocação anterior**: "Refazer o cálculo de TAL data com os parâmetros de hoje" (útil pra ver se rota mudou)
- **Reagendar**: cancela o lote e propõe novo cálculo na hora

### Estimativa: 4-6h

---

# 🟦 FASE 6 — Hardening pra Produção

> **Objetivo geral da Fase 6**: transformar o MVP em sistema robusto para uso real pela equipe do Grupo ITC, com segurança, observabilidade e resiliência.

## 6.1 — Firestore Security Rules por coleção

Hoje o `firestore.rules` tem um wildcard `match /{document=**}` que permite tudo. Vai virar régua específica:

### Estrutura proposta

```javascript
// firestore.rules

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helpers
    function isAuthenticated() {
      return request.auth != null;
    }
    function isAdmin() {
      return isAuthenticated() && 
             get(/databases/$(database)/documents/usuarios/$(request.auth.uid)).data.role == 'admin';
    }
    function isOwner(uid) {
      return isAuthenticated() && request.auth.uid == uid;
    }
    
    // Coleção: usuarios
    match /usuarios/{uid} {
      allow read: if isAuthenticated();
      allow write: if isAdmin();
    }
    
    // Coleção: projetos, ras, ums, tecnicos
    match /projetos/{id} {
      allow read: if isAuthenticated();
      allow write: if isAdmin();
    }
    // (mesma regra pra ras, ums, tecnicos)
    
    // Coleção: pontos
    match /pontos/{id} {
      allow read: if isAuthenticated();
      // Sync da planilha + edição manual pelo admin
      allow create, update: if isAdmin();
      allow delete: if false;  // nunca deletar, só transicionar status
    }
    
    // Coleção: rotas
    match /rotas/{id} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated();  // qualquer logado pode confirmar uma alocação
      allow update: if isAdmin();  // cancelar lote
      allow delete: if false;
    }
    
    // Coleção: auditoria (Fase 6.3)
    match /auditoria/{id} {
      allow read: if isAdmin();
      allow create: if isAuthenticated();
      allow update, delete: if false;  // imutável
    }
    
    // Coleção: convites (Fase 6.2)
    match /convites/{token} {
      allow read: if true;  // qualquer um (vai precisar pra validar antes de logar)
      allow create, delete: if isAdmin();
      allow update: if false;
    }
  }
}
```

### Migração das rules

1. Criar coleção `usuarios` com docs `{uid, role, nome, email}`
2. Backfill: criar 1 doc por usuário existente com `role: 'admin'`
3. Atualizar `firestore.rules` em `firestore.rules` na raiz
4. Deploy: `firebase deploy --only firestore:rules`
5. Validar: tentar operações que deveriam falhar

### Estimativa: 3-5h (rules + migração + validação)

---

## 6.2 — Sistema de Convites e Gestão de Usuários

Hoje só existe o `dev.itcbrasil@gmail.com` que pode fazer tudo. Pra uso real precisa:

### Fluxo proposto

1. Admin clica "+ Convidar usuário" em `/admin/usuarios`
2. Form: email + role (admin/operador/visualizador)
3. Sistema gera token UUID, salva em `convites/{token}` com TTL 7 dias
4. Sistema envia email via Firebase Functions ou serviço externo (Resend) com link `https://itc-routemap.vercel.app/convite?token=XXX`
5. Convidado clica no link → tela de signup pré-preenchida com email
6. Após cadastro: deleta o convite, cria doc em `usuarios/{uid}` com o role definido
7. Login normal a partir daí

### Roles propostos

- **`admin`**: tudo (CRUD em projetos/RAs/UMs/Técnicos/Pontos, sync, cancelar lotes, gestão de usuários)
- **`operador`**: pode calcular e confirmar alocações; pode editar pontos manualmente; não pode mexer em técnicos/projetos
- **`visualizador`**: só lê (útil pra cliente final ver o que tá acontecendo sem mexer)

### UI nova

- `/admin/usuarios/page.tsx` — lista usuários cadastrados + convites pendentes
- `_components/convidar-usuario-dialog.tsx` — form de convite
- `/convite/page.tsx` (rota pública) — landing pra novo usuário aceitar
- Indicador de role na navbar

### Estimativa: 8-12h (form + emails + landing + integração roles em todas as telas)

---

## 6.3 — Auditoria e logs

Toda ação relevante do sistema vai pra coleção `auditoria/{autoId}`:

### Schema de evento

```typescript
type Evento = {
  id: string
  tipo: 
    | "ponto.criado" | "ponto.editado" | "ponto.transicionado"
    | "rota.criada" | "rota.cancelada"
    | "alocacao.calculada" | "alocacao.confirmada"
    | "sincronizacao.executada"
    | "usuario.convidado" | "usuario.cadastrado" | "usuario.role-alterada"
    | "tecnico.criado" | "tecnico.editado"
    // ... etc
  
  uid: string         // quem fez
  email: string       // snapshot do email
  
  recurso?: {         // o que foi afetado
    tipo: "ponto" | "rota" | "tecnico" | "usuario" | "projeto" | "lote"
    id: string
    descricao?: string  // ex: "Ponto BSBIA01 - AR 9 Quadra"
  }
  
  detalhes?: Record<string, unknown>  // dados específicos do evento
  
  criadoEm: Timestamp
}
```

### Onde registrar

Cada operação relevante chama `registrarEvento()` no fim:

```typescript
// lib/firestore/auditoria.ts
export async function registrarEvento(evento: Omit<Evento, "id" | "criadoEm">) {
  await addDoc(collection(db, "auditoria"), {
    ...evento,
    criadoEm: serverTimestamp(),
  })
}
```

### UI

- `/admin/auditoria/page.tsx` — feed completo, filtros por tipo/usuário/período
- Card na página Início mostrando últimos 10 eventos (Fase 5.1)

### Estimativa: 6-8h (schema + integrações + UI)

---

## 6.4 — Testes E2E completos

Expansão do escopo da 13.10 pra cobrir o sistema inteiro:

### Cenários adicionais

- Convidar usuário → aceitar → logar → fazer ação
- Sincronização do Sheets com 50+ pontos
- Cancelar lote (validar reversão de status dos pontos)
- Tentativa de ação sem permissão (operador tentando deletar técnico)
- Geocoding em massa pós-sync
- Performance: tempo de carregamento de cada página principal

### CI/CD

- GitHub Actions: roda E2E em cada PR
- Smoke tests em produção (cron diário, pinga `/api/health`)
- Lighthouse score em cada deploy

### Estimativa: 10-15h (testes + setup CI)

---

## 6.5 — Performance e Otimizações

### Frontend

- **Migrar fetch → SWR ou React Query**: cache + revalidação automática nas listagens (`/admin/*`)
- **Code splitting**: componentes pesados (mapa) só carregam quando necessários (já tá lazy, validar)
- **Image optimization**: usar `next/image` em todos os lugares (auditar)
- **Bundle analysis**: rodar `@next/bundle-analyzer` e atacar os maiores chunks
- **PWA preparation**: adicionar manifest.json + service worker básico (offline-first para algumas telas)

### Backend

- **Cache de matriz Google Routes em Firestore**: chave = `${origemId}|${destinoId}|${modo}`, TTL 30 dias. Economia significativa em re-cálculos
- **Indexes do Firestore**: definir explicitamente em `firestore.indexes.json` os índices compostos necessários (ex: pontos onde status==X AND projetoId==Y)
- **Connection pooling no Admin SDK**: revisar singleton de `getAdminDb()` em cenário de alta concorrência

### Estimativa: 8-12h

---

## 6.6 — Deploy de Produção

### Configuração Vercel

- **Variáveis de ambiente em prod** (todas as `NEXT_PUBLIC_*` + chaves de servidor): adicionar via Vercel Dashboard → Settings → Environment Variables
- **Diferentes envs**: Preview (PRs), Production (main)
- **Domínio custom**: configurar `routemap.itcbrasil.com.br` (ou similar) com SSL automático
- **Build cache**: garantir cache de `node_modules` ativo
- **Functions region**: configurar pra `gru1` (São Paulo) — reduz latência

### Monitoramento

- **Vercel Analytics** ativo
- **Sentry** pra error tracking (Web Vitals + erros de runtime)
- **Custom dashboard** Firestore Usage no GCP

### Backup

- **Cloud Scheduler + Cloud Functions**: backup diário do Firestore pra Cloud Storage
- **Retenção 30 dias**, depois move pra cold storage

### Estimativa: 4-6h (config + monitoramento + backup)

---

## 6.7 — Reativação do Gemini

Pequena etapa quando o billing for resolvido:

1. Criar projeto novo no Google AI Studio sem billing pago (free tier)
2. Gerar nova API key
3. Trocar `GEMINI_API_KEY` no `.env.local` (local) e no Vercel (prod)
4. Setar `GEMINI_ENABLED=true` em ambos
5. Restart dev server local + redeploy Vercel
6. Testar via `/api/routes/alocar` e via UI
7. Verificar que justificativa nova vem do Gemini (não do fallback)
8. Validar quotas: free tier dá 15 req/min e 1M tokens/dia — suficiente pra uso normal

### Estimativa: 1h

---

# 🟪 FASES FUTURAS (especulativas — não comprometidas)

> Itens que provavelmente farão sentido depois da Fase 6, mas não estão planejados em detalhe ainda. Listados aqui pra ficarem no radar e serem priorizados quando chegar o momento.

## Mobile / PWA

- Tornar o app instalável (Add to Home Screen)
- Otimizar telas pra uso em campo (técnico abre no celular pra ver rota do dia)
- Geolocalização nativa pra "estou onde?" → atualizar arrival time
- Modo offline pra consultar rota sem rede

## Notificações

- Email pro técnico quando uma rota é confirmada pra ele
- Push notification (via FCM) lembrando do compromisso
- Alerta pro admin quando uma sincronização falha

## Exports e Relatórios

- PDF: relatório de alocação do dia com mapas e instruções
- Excel: planilha completa com todas as métricas (pra integrar com sistemas legados)
- CSV pro Looker Studio / Power BI (dashboards externos)

## Backup e Disaster Recovery

- Backup diário automatizado (mencionado em 6.6 mas pode expandir)
- Plan de recuperação: como restaurar em < 1h
- Multi-region replication (se ITC crescer pra outros estados)

## Multi-tenancy

- Se a ITC quiser oferecer o sistema como SaaS pra outras empresas similares
- Isolar dados por tenant (`tenants/{tenantId}/pontos/...` em vez de `pontos/...`)
- Billing por tenant
- Branding customizável

## Integrações externas

- WhatsApp Business: enviar rota do dia via WhatsApp
- Waze SDK: abrir Waze direto com a rota
- Calendário Google: criar eventos na agenda do técnico
- ERP/CRM da ITC: sincronização bidirecional

---

# 🎯 Priorização sugerida

Se eu fosse o decisor de produto, atacaria nessa ordem:

1. **13.9** — Histórico (sem isso fica difícil auditar o que aconteceu) — **alta prioridade**
2. **13.10** — Polish da Fase 4 (UX detalhes) — **média prioridade**
3. **6.2** — Sistema de convites (sem isso só 1 pessoa pode usar) — **alta prioridade pra ir pra produção**
4. **6.1** — Firestore Rules (segurança) — **alta prioridade pra ir pra produção**
5. **5.1** — Página Início (visão executiva) — **alta prioridade pra demonstrar valor**
6. **6.7** — Reativar Gemini (rápido e valioso) — **fazer junto com qualquer fase**
7. **6.3** — Auditoria — **importante pra produção**
8. **5.2** — Estatísticas — **médio**
9. **6.6** — Deploy produção final — **fazer após 6.1, 6.2, 6.3**
10. **6.4** — E2E completos — **fazer junto com 6.6**
11. **6.5** — Performance — **fazer quando começar a sentir lentidão**
12. **5.3** — Histórico avançado — **baixa, dá pra viver sem**

---

# 🚦 Critérios pra considerar "pronto pra produção"

Antes de virar a chave e disponibilizar pra equipe da ITC usar de verdade:

- [ ] Fase 4 completa (13.9 + 13.10)
- [ ] Sistema de convites funcionando (6.2)
- [ ] Firestore Rules hardened (6.1)
- [ ] Auditoria registrando ações críticas (6.3)
- [ ] Página Início (5.1) — pra impacto visual no primeiro acesso
- [ ] Gemini reativado OU template procedural validado como definitivo (6.7)
- [ ] E2E cobrindo happy paths (parcial de 6.4)
- [ ] Deploy de produção configurado com env vars (6.6)
- [ ] Documentação básica de uso pra usuários finais (não-Claude — pra humanos)

---

# 📊 Estimativa total de esforço

| Fase | Estimativa | Acumulado |
|---|---|---|
| 13.9 Histórico | 5-7h | ~7h |
| 13.10 Polish + E2E | 4-6h | ~13h |
| **FASE 4 COMPLETA** | — | **~13h** |
| 5.1 Página Início | 6-8h | ~21h |
| 5.2 Estatísticas | 8-12h | ~33h |
| 5.3 Histórico avançado | 4-6h | ~39h |
| **FASE 5 COMPLETA** | — | **~39h total** |
| 6.1 Rules | 3-5h | ~44h |
| 6.2 Convites | 8-12h | ~56h |
| 6.3 Auditoria | 6-8h | ~64h |
| 6.4 E2E completos | 10-15h | ~79h |
| 6.5 Performance | 8-12h | ~91h |
| 6.6 Deploy prod | 4-6h | ~97h |
| 6.7 Gemini | 1h | ~98h |
| **FASE 6 COMPLETA** | — | **~98h total** |

> Estimativas em horas de **trabalho focado em pares (você + Claude)**. Considerando ritmo médio de 4-6h produtivas por dia, equivale a ~3-4 semanas pra fechar tudo.

---

# Trecho a adicionar no `ROADMAP-itc-routemap.md`

Cola este bloco numa seção apropriada (Fase 4 - polish, ou Fase 5 - features
operacionais; você decide onde encaixa melhor).

---

## 13.11 — Alocação Manual (~6-10h)

Permite ao usuário ajustar manualmente os pares técnico↔UM propostos pelo
algoritmo Húngaro antes de confirmar a alocação. Hoje o sistema só aceita ou
rejeita a sugestão inteira — não permite override granular.

### Escopo

- UI pra editar pares na tela de resultado (drag-and-drop OU dropdown por linha)
- Lógica de swap automático quando troca dois técnicos: se T1↔T2, ambas as
  rotas trocam de UM
- Re-cálculo de métricas via `/api/routes/single` quando troca ocorre
  (atualiza tempo/distância exibidos em tempo real)
- Validação de viabilidade: barra de confirmar se algum par ficou sem rota
  calculável após o ajuste
- Persistência: novo campo `Rota.origemDecisao: "auto" | "manual" | "ajuste-pos-auto"`
  pra rastrear o que veio do algoritmo vs do usuário
- Badge visual no histórico mostrando "Ajuste manual" quando aplicável
- Re-gerar (ou não) justificativa do Gemini quando há ajustes manuais —
  decidir antes de implementar

### Decisões pendentes

- **Padrão UX**: drag-and-drop entre técnicos/UMs OU dropdown "trocar
  técnico" / "trocar UM" em cada linha. Drag é mais elegante mas mais código;
  dropdown é mais acessível em mobile.
- **Comportamento em conflito**: se trocar T1 pra UM2 mas T2 já estava em
  UM2, faz swap automático (T1→UM2 e T2→UM1) OU bloqueia com erro?
- **Justificativa do Gemini após ajuste**: re-chama o Gemini (custo extra) OU
  desabilita o texto (mostra "Alocação ajustada manualmente — análise
  algorítmica desatualizada") OU mantém a original com um aviso?

---

## 13.12 — Re-otimização Inteligente (~4-6h)

Sistema detecta automaticamente quando técnicos já alocados em rotas
`Confirmada` se beneficiariam de troca por novas UMs que apareceram. Regra
de negócio operacional do ITC: o técnico permanece na UM atual até o fim
da etapa OU até uma UM ficar mais próxima da residência dele.

### Decisões fechadas

1. **Threshold de sugestão**: qualquer melhora ≥ 5 min de tempo de
   deslocamento dispara a sugestão. Aceita-se ruído inicial; ajustaremos
   se poluir demais a UI na prática.
2. **Status do ponto que permite troca**:
   - `Pendente` (vazio na planilha) — pode trocar ✅
   - `Agendado` (alocado, não visitado) — pode trocar ✅
   - `Atual` (técnico em campo agora) — **pode trocar** ✅ (justificativa:
     estadia é de dias, WhatsApp resolve avisar, vale a pena se UM mais
     próxima aparecer)
   - `Histórico` (visita encerrada) — NUNCA realoca ❌
3. **Mecanismo de transição "Atual → Histórico"**: manual via planilha.
   A operação edita a planilha quando uma etapa encerra. O RouteMap
   importa esse status no sync. Source of truth = planilha.

### Implicação técnica crítica

Como o status `Histórico` é controlado pela planilha (não pelo RouteMap),
**a re-otimização precisa rodar sobre dados sincronizados**. Senão pode
sugerir realocar um técnico de uma UM que já virou Histórico na planilha
mas que o Firestore ainda enxerga como Atual. Duas opções:

- **(A)** Forçar sync automaticamente antes de detectar oportunidades, OU
- **(B)** Mostrar aviso claro: "Última sincronização há X minutos.
  Sincronize antes de calcular pra evitar dados desatualizados."

Decidir entre A e B na implementação. Recomendação inicial: **B** (mais
explícito, dá ao usuário controle, menos chamadas automáticas à API
da planilha).

### Escopo

- Em `/calcular-rotas`, considera no Húngaro **todos** os técnicos (alocados
  ativos + livres) e todos os pontos com status realocável (Pendente,
  Agendado, Atual — não Histórico)
- Compara a solução do Húngaro com as alocações atuais já persistidas
- Banner sugestivo ANTES do botão "Calcular Alocação Ótima":

  > ⚠️ N oportunidades de re-otimização detectadas
  > - **José** está em BSBIA01 (51 min). Trocar para BSBIA02 economiza
  >   43 min/dia.
  > - **Anne ↔ Matheus**: trocar destinos economiza 15 min total.
  > - [Aplicar realocação] [Ignorar e usar seleção manual]

- Aplicação atômica: cancela rotas antigas (status → "Cancelada") + cria
  novas (status → "Confirmada") em writeBatch único
- Auditoria: linkar rota nova com rota antiga via campo opcional
  `Rota.realocadaDe: string | null`
- WhatsApp continua manual (usuário avisa técnicos depois) — fora de escopo

### Melhoria opcional (pode ficar fora do MVP)

UI "Marcar etapa como encerrada" — aprovada como ideia, mas o mecanismo
manual via planilha já resolve. Considerar só se a operação reclamar do
fluxo atual.