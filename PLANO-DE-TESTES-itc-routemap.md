# Plano de Testes — ITC RouteMap
## Nível Ouro: Cobertura Total de Segurança e Funcionalidade

> Versão 1.0 | Grupo ITC Brasil | Junho 2026
> Aplicação: Sistema de Alocação Inteligente de Técnicos para Unidades Móveis

---

## Índice

1. Autenticação e Autorização
2. API Routes — Alocação (`/api/routes/alocar`)
3. API Routes — Rota Individual (`/api/routes/single`)
4. Firestore — Operações de Escrita
5. Firestore — Operações de Leitura
6. Algoritmo Húngaro (Alocação)
7. Integração Gemini (IA)
8. UI — Fluxo de Alocação (`/calcular-rotas`)
9. UI — Histórico e Detalhe de Lote
10. UI — Admin (Técnicos, Projetos, UMs)
11. Segurança — Firestore Rules
12. Segurança — Variáveis de Ambiente
13. Segurança — Input Validation
14. Resiliência e Fallbacks
15. Performance e Limites
16. Regressão — Features Entregues

---

## 1. Autenticação e Autorização

### 1.1 Login com Google

| ID | Teste | Entrada | Resultado esperado |
|----|-------|---------|-------------------|
| AU-01 | Login válido com conta Google | Conta Google ativa | Redireciona pra `/` autenticado, `user` disponível no contexto |
| AU-02 | Login com popup bloqueado pelo navegador | Popup bloqueado | Exibe mensagem clara de erro, não trava a tela |
| AU-03 | Login com conta Google suspensa | Conta suspensa | Exibe erro Firebase, não entra no sistema |
| AU-04 | Sessão expirada durante uso | Token Firebase expirado | Redireciona pra `/login` sem perder dados da URL atual |
| AU-05 | Acesso a rota privada sem login | URL direta `/calcular-rotas` sem auth | Redireciona pra `/login` |
| AU-06 | Acesso a rota privada com login válido | URL direta com usuário logado | Carrega normalmente |
| AU-07 | Logout | Clica "Sair" | Limpa sessão, redireciona pra `/login`, não deixa dados em cache |
| AU-08 | Múltiplas abas — logout em uma | Logout em aba A | Aba B detecta e redireciona pra login (listener de auth state) |
| AU-09 | Firebase offline durante login | Sem conexão | Erro tratado, mensagem clara, não trava |

### 1.2 Autorização por papel

| ID | Teste | Resultado esperado |
|----|-------|--------------------|
| AU-10 | Usuário sem papel admin tenta acessar `/admin/*` | Bloqueado (404 ou redirect) |
| AU-11 | API route chamada sem token de sessão | 401 Unauthorized |
| AU-12 | Token manipulado/forjado | Firebase rejeita, 401 |

---

## 2. API — `/api/routes/alocar` (POST)

### 2.1 Validação de input

| ID | Teste | Entrada | Resultado esperado |
|----|-------|---------|-------------------|
| AL-01 | Sem técnicos | `tecnicos: []` | 400: "Nenhum técnico fornecido" |
| AL-02 | Sem destinos | `destinos: []` | 400: "Nenhum destino fornecido" |
| AL-03 | Técnico sem latitude | `latitude: null` | 400: "Técnico X tem coordenadas inválidas" |
| AL-04 | Técnico sem longitude | `longitude: undefined` | 400: "Técnico X tem coordenadas inválidas" |
| AL-05 | Destino sem coordenadas | `latitude: null, longitude: null` | 400: "UM X tem coordenadas inválidas" |
| AL-06 | Latitude fora do range | `latitude: 999` | 400: coordenadas inválidas |
| AL-07 | Limite de pares excedido | 10 técnicos × 11 UMs (> MAX_PARES) | 400: "Limite excedido: máximo X pares" |
| AL-08 | Modo principal não está em modos calculados | `modoPrincipal: "WALK", modos: ["DRIVE"]` | 400: modo principal não incluído |
| AL-09 | Body inválido (não é JSON) | `body: "texto"` | 400 ou 500 com erro claro |
| AL-10 | Body vazio | `body: {}` | 400: falha de validação |

### 2.2 Integração Google Routes

| ID | Teste | Resultado esperado |
|----|-------|--------------------|
| AL-11 | Google Routes API key inválida | 502: "Falha ao calcular matriz" |
| AL-12 | Timeout na chamada ao Google | Timeout tratado, 502 com detalhe |
| AL-13 | Rota sem caminho viável (origem = destino) | Métrica `null`, excluído da alocação |
| AL-14 | Apenas 1 modo disponível após falhas | Usa o modo disponível, `modosCalculados` correto |
| AL-15 | Todos os modos falham | 502: "Falha ao calcular matriz" |

### 2.3 Resposta de sucesso

| ID | Teste | Resultado esperado |
|----|-------|--------------------|
| AL-16 | 1 técnico e 1 UM | 1 alocação, sem sobras, `custoTotal = custo da única rota` |
| AL-17 | N técnicos = N UMs | N alocações, sem sobras |
| AL-18 | 3 técnicos e 2 UMs | 2 alocações, 1 técnico em `tecnicosNaoAlocados` |
| AL-19 | 2 técnicos e 3 UMs | 2 alocações, 1 UM em `destinosNaoAlocados` |
| AL-20 | Justificativa Gemini presente | `justificativaGemini` é string não vazia (ou fallback do template) |
| AL-21 | Gemini desabilitado (`GEMINI_ENABLED=false`) | `justificativaGemini` = template procedural, sem erro |
| AL-22 | Gemini falha (503/429) | `justificativaGemini` = template procedural, requisição principal retorna 200 |

---

## 3. API — `/api/routes/single` (POST)

| ID | Teste | Entrada | Resultado esperado |
|----|-------|---------|-------------------|
| SI-01 | Requisição válida DRIVE | Coords origem + destino + modo DRIVE | 200: polyline, distancia, duracao |
| SI-02 | Modo TRANSIT | Modo TRANSIT | 200: campos `transitSteps`, `partidaIso`, `chegadaIso` presentes |
| SI-03 | Sem origem | `origem: null` | 400 com mensagem |
| SI-04 | Sem destino | `destino: null` | 400 com mensagem |
| SI-05 | Modo inválido | `modo: "HELICOPTER"` | 400 |
| SI-06 | Google Routes falha | API down | 502 com detalhe, não 500 genérico |
| SI-07 | Rota sem polyline | Rota muito curta ou sem caminho | `polyline: null`, mas duração e distância presentes |

---

## 4. Firestore — Operações de Escrita

### 4.1 `confirmarAlocacao`

| ID | Teste | Resultado esperado |
|----|-------|--------------------|
| FW-01 | Batch atômico completo | Todas as rotas criadas + todos os pontos atualizados pra "Agendado" em transação única |
| FW-02 | Falha no meio do batch | NENHUM documento criado (atomicidade garantida pelo writeBatch) |
| FW-03 | pontoId inexistente no Firestore | Erro propagado, batch não commitado |
| FW-04 | `origemDecisao: "auto"` | Campo gravado corretamente no Firestore |
| FW-05 | `origemDecisao: "ajuste-pos-auto"` | Campo gravado corretamente no Firestore |
| FW-06 | `loteJustificativa` vazia (ajuste manual) | String vazia gravada, sem erro |
| FW-07 | Confirmar alocação com 0 alocações | Retorna `{rotasIds: [], pontosAtualizados: []}` sem tocar o banco |
| FW-08 | Dois lotes simultaneamente | Não há conflito (loteIds diferentes, UUIDs únicos) |

### 4.2 `cancelarLote`

| ID | Teste | Resultado esperado |
|----|-------|--------------------|
| FW-09 | Cancela lote com N rotas Confirmadas | N rotas → Cancelada, N pontos → Pendente, atômico |
| FW-10 | Cancela lote já Cancelado | Erro: "Nenhuma rota ativa pra cancelar" |
| FW-11 | Lote com mistura Confirmada + Cancelada | Só rotas Confirmadas são canceladas |
| FW-12 | Ponto não está "Agendado" (já foi atualizado) | Idempotente: ignora pontos que não estão Agendado |
| FW-13 | Lote com > 450 operações | Erro claro antes de tentar o batch |

---

## 5. Firestore — Operações de Leitura

| ID | Teste | Resultado esperado |
|----|-------|--------------------|
| FR-01 | `listarLotes` com 0 rotas | Retorna `[]` |
| FR-02 | `listarLotes` com rotas só Sugeridas | Retorna `[]` (lotes de rascunho descartados) |
| FR-03 | `listarLotes` com rotas Confirmadas e Canceladas | Retorna lotes corretos, ordenados por data desc |
| FR-04 | `listarRotasPorLote` com loteId inexistente | Retorna `[]` |
| FR-05 | `mapearRota` em documento sem `origemDecisao` | Retorna `"auto"` (fallback de compatibilidade) |
| FR-06 | `mapearRota` em documento sem `criadoEm` | Retorna `null` sem crash |
| FR-07 | Firestore offline | Operação falha gracefully, UI mostra erro |
| FR-08 | `listarTodosPontos` com 500+ pontos | Retorna todos sem truncar |

---

## 6. Algoritmo Húngaro

| ID | Teste | Entrada | Resultado esperado |
|----|-------|---------|-------------------|
| HU-01 | 1×1 | 1 técnico, 1 UM | 1 alocação ótima |
| HU-02 | 2×2 simétrico | Custos iguais para todos | Qualquer alocação é válida, sem sobras |
| HU-03 | 2×2 assimétrico | T1→UM1=10min, T1→UM2=50min, T2→UM1=40min, T2→UM2=5min | T1→UM1, T2→UM2 (custo total 15min, ótimo) |
| HU-04 | 3×2 (mais técnicos) | 3 técnicos, 2 UMs | 2 alocações, 1 técnico em `tecnicosNaoAlocados` |
| HU-05 | 2×3 (mais UMs) | 2 técnicos, 3 UMs | 2 alocações, 1 UM em `destinosNaoAlocados` |
| HU-06 | Custo zero | Técnico no mesmo endereço da UM | Alocado com custo 0, sem crash |
| HU-07 | Todos os custos `null` | Nenhuma rota viável | 422: "Não foi possível encontrar alocação viável" |
| HU-08 | Custo muito alto (> Number.MAX_SAFE_INTEGER) | Overflow de custo | Sem crash, alocação razoável |
| HU-09 | 10×10 (máximo real) | 100 pares | Retorna em < 5s |

---

## 7. Integração Gemini

| ID | Teste | Resultado esperado |
|----|-------|--------------------|
| GM-01 | `GEMINI_ENABLED=false` | Usa template procedural, sem chamada à API |
| GM-02 | `GEMINI_API_KEY` ausente | Usa template procedural, sem erro |
| GM-03 | API key inválida | Warn no console, retorna template procedural |
| GM-04 | 429 (rate limit / billing) | Warn no console, retorna template procedural |
| GM-05 | 503 (serviço indisponível) | Warn no console, retorna template procedural |
| GM-06 | Resposta vazia da IA | Retorna template procedural (não string vazia) |
| GM-07 | Resposta válida da IA | Texto de 4-6 frases em português, com nomes reais dos técnicos/UMs |
| GM-08 | Timeout de rede | Warn no console, retorna template procedural |
| GM-09 | Template com 0 alocações | "Nenhuma alocação foi possível..." sem crash |
| GM-10 | Template com 1 alocação | Texto singular correto ("1 técnico foi alocado") |
| GM-11 | Template com sobras (técnicos > UMs) | Menciona técnicos sem destino com seus nomes |
| GM-12 | Template com sobras (UMs > técnicos) | Menciona UMs sem técnico |

---

## 8. UI — Fluxo de Alocação (`/calcular-rotas`)

### 8.1 Tela de seleção

| ID | Teste | Resultado esperado |
|----|-------|--------------------|
| UI-01 | Sem técnicos cadastrados | Estado vazio com link pra `/admin/tecnicos` |
| UI-02 | Técnicos sem geocodificação | Estado vazio com instrução pra geocodificar |
| UI-03 | Sem UMs pendentes | Estado vazio com link pra `/admin/localidades` |
| UI-04 | "Selecionar todos" técnicos | Todos marcados |
| UI-05 | "Limpar" técnicos | Todos desmarcados, botão "Calcular" desabilitado |
| UI-06 | Contagens diferentes (3 técnicos, 2 UMs) | Aviso amarelo: "1 técnico ficará sem alocação" |
| UI-07 | Exatamente 0 selecionados em qualquer coluna | Botão "Calcular" desabilitado |
| UI-08 | Botão "Calcular" → estado "calculando" | Spinner, texto de loading, botão desaparece |

### 8.2 Resultado da alocação

| ID | Teste | Resultado esperado |
|----|-------|--------------------|
| UI-09 | Banner Gemini presente | Texto da IA visível no topo |
| UI-10 | Métricas corretas | Tempo total, médio, contagem, modo predominante corretos |
| UI-11 | Expandir linha | Mostra: justificativa mini, explicação algorítmica, dropdowns editar par, seletor modo, mapa |
| UI-12 | Trocar modo pra TRANSIT | "Calculando..." → carrega dados de transporte público após ~2s |
| UI-13 | Detalhes TRANSIT | Mostra linhas de ônibus/metrô agrupadas, caminhadas consecutivas somadas |
| UI-14 | Dropdown "Trocar técnico" | Lista outros técnicos com UM atual ao lado |
| UI-15 | Dropdown "Trocar UM" | Lista outras UMs com técnico atual ao lado |
| UI-16 | Swap realizado | Banner troca pra amarelo "Ajuste manual", métricas atualizam, explicação vira "escolhida manualmente" |
| UI-17 | Swap em andamento | Dropdowns desabilitados, "calculando..." visível |
| UI-18 | "Voltar pra ótima" (banner) | Volta ao estado original, banner Gemini reaparece |
| UI-19 | "Voltar pra ótima" (rodapé) | Idem |
| UI-20 | "Voltar para seleção" | Volta pra tela de seleção, estado resetado |
| UI-21 | "Confirmar alocação" (sem swap) | Loading → "Alocação confirmada!" → redirect `/admin/localidades` em 3s |
| UI-22 | "Confirmar alocação" (com swap) | `origemDecisao: "ajuste-pos-auto"` gravado no Firestore |
| UI-23 | Erro no cálculo (Google API down) | Card de erro com mensagem + botão "Voltar e tentar novamente" |
| UI-24 | Erro ao confirmar | Card de erro, nada salvo no banco (atomicidade) |

---

## 9. UI — Histórico

### 9.1 Lista de lotes (`/historico`)

| ID | Teste | Resultado esperado |
|----|-------|--------------------|
| HI-01 | Sem lotes | Estado vazio amigável |
| HI-02 | Lote "auto" | Badge "Confirmada", SEM badge "Ajuste manual" |
| HI-03 | Lote "ajuste-pos-auto" | Badge "Confirmada" + Badge "Ajuste manual" com ícone Hand |
| HI-04 | Lote "Mista" | Badge "Mista" com contagem "X ok · Y canc." |
| HI-05 | Lote "Cancelada" | Badge "Cancelada", botão "Cancelar lote" desabilitado |
| HI-06 | Filtro por data | Mostra só lotes dentro do período |
| HI-07 | "Cancelar lote" → confirmação | Abre AlertDialog destrutivo |
| HI-08 | Confirma cancelamento | Rotas → Cancelada, pontos → Pendente, UI atualiza |
| HI-09 | Cancela o cancelamento | Nada muda |

### 9.2 Detalhe de lote (`/historico/[loteId]`)

| ID | Teste | Resultado esperado |
|----|-------|--------------------|
| HI-10 | loteId inexistente | "Lote não encontrado" com botão voltar |
| HI-11 | Lote com `origemDecisao: "ajuste-pos-auto"` | Badge "Ajuste manual" no header |
| HI-12 | Lote sem justificativa (ajuste manual) | Banner da IA não aparece |
| HI-13 | Expandir rota e trocar modo | Mapa atualiza, tempo/distância refletem novo modo |
| HI-14 | Métricas com TRANSIT carregando | Asterisco "*" no tempo total/médio |
| HI-15 | Rota cancelada | Opacidade 70%, badge "Cancelada" na linha |

---

## 10. UI — Admin

| ID | Área | Teste | Resultado esperado |
|----|------|-------|-------------------|
| AD-01 | Técnicos | Cadastrar técnico sem endereço | Validação: campo obrigatório |
| AD-02 | Técnicos | Geocodificar endereço inválido | Erro: "Endereço não encontrado" |
| AD-03 | Técnicos | Geocodificar endereço válido | Lat/lng preenchidos, mapa preview aparece |
| AD-04 | Técnicos | Editar técnico ativo (em rota Confirmada) | Alerta ou bloqueio (snapshot da rota não é alterado retroativamente) |
| AD-05 | Projetos | Criar projeto com sigla duplicada | Erro ou aviso de conflito |
| AD-06 | UMs/Localidades | Sincronizar planilha | Importa novos pontos, não duplica existentes |
| AD-07 | UMs/Localidades | Sincronizar planilha offline | Erro tratado, dados locais preservados |

---

## 11. Segurança — Firestore Rules

> Testar no Firebase Console → Firestore → Regras → Simulador de regras

| ID | Operação | Usuário | Resultado esperado |
|----|----------|---------|-------------------|
| SR-01 | Leitura `/rotas/*` | Autenticado | ✅ Permitido |
| SR-02 | Leitura `/rotas/*` | Não autenticado | ❌ Negado |
| SR-03 | Escrita `/rotas/*` | Não autenticado | ❌ Negado |
| SR-04 | Escrita `/rotas/*` diretamente no console | Autenticado comum (não admin) | ❌ Negado (só server-side via Admin SDK) |
| SR-05 | Leitura `/pontos/*` | Autenticado | ✅ Permitido |
| SR-06 | Escrita `/pontos/*` | Não autenticado | ❌ Negado |
| SR-07 | Leitura `/tecnicos/*` | Autenticado | ✅ Permitido |
| SR-08 | Deletar rota | Qualquer usuário via client SDK | ❌ Negado (deleção só via Admin SDK se necessário) |
| SR-09 | Manipular `origemDecisao` via client SDK | Usuário malicioso | ❌ Negado pela regra de servidor |

---

## 12. Segurança — Variáveis de Ambiente

| ID | Teste | Resultado esperado |
|----|-------|--------------------|
| SE-01 | `GEMINI_API_KEY` exposta no bundle client | Não aparece em nenhum chunk `.js` do browser (é variável de servidor) |
| SE-02 | `GOOGLE_ROUTES_API_KEY` exposta no bundle | Idem — nunca `NEXT_PUBLIC_` em keys de servidor |
| SE-03 | Firebase keys públicas (`NEXT_PUBLIC_*`) | Presentes no bundle (comportamento correto — são públicas por design) |
| SE-04 | `.env.local` commitado no git | Não existe no repositório (verificar `.gitignore`) |
| SE-05 | Build sem `.env.local` | Falha com erro claro ("variável ausente"), não silenciosamente |

---

## 13. Segurança — Validação de Input nas APIs

| ID | Teste | Resultado esperado |
|----|-------|--------------------|
| IV-01 | Injeção de script no nome do técnico | `<script>alert(1)</script>` escapado na UI, não executado |
| IV-02 | SQL injection no endereço | Não aplicável (Firestore NoSQL), mas verificar que não há `eval()` ou `Function()` |
| IV-03 | Payload muito grande (> 1MB) | Next.js rejeita antes de processar |
| IV-04 | Coordenadas como strings em vez de números | `"lat": "-15.78"` — validar que `validarCoordenadas` trata corretamente |
| IV-05 | Campo extra no payload da API | Ignorado silenciosamente, não quebra o processamento |
| IV-06 | loteId manipulado na URL | `/historico/id-falso` → "Lote não encontrado" sem expor dados internos |
| IV-07 | CORS na API route | Requisição de origem diferente bloqueada |

---

## 14. Resiliência e Fallbacks

| ID | Teste | Resultado esperado |
|----|-------|--------------------|
| RE-01 | Gemini falha → fallback template | Usuário não vê erro, vê texto do template procedural |
| RE-02 | Google Routes falha parcialmente (1 modo) | Outros modos funcionam, `modosCalculados` reflete o disponível |
| RE-03 | Firestore lento (> 5s) | UI mostra skeleton/loading, não trava |
| RE-04 | Rota single falha (mapa lazy) | Mapa mostra erro localizado, resto da UI funciona |
| RE-05 | Swap falha (Google Routes down) | Erro localizado na linha, outras linhas funcionam |
| RE-06 | Conexão cai durante confirmação | `writeBatch` não commitado = nada salvo, UI mostra erro de confirmação |
| RE-07 | Sync planilha falha | Dados existentes preservados, UI mostra erro do sync |
| RE-08 | Firebase Auth offline | Redireciona pra login com mensagem de conexão |

---

## 15. Performance e Limites

| ID | Teste | Limiar esperado |
|----|-------|----------------|
| PE-01 | Cálculo de alocação 5×5 | < 10s pra Google Routes + Húngaro + Gemini |
| PE-02 | Cálculo de alocação 10×10 (máximo) | < 30s total |
| PE-03 | Carregamento de `/historico` com 100 lotes | < 3s, sem travar o browser |
| PE-04 | Carregamento de `/admin/localidades` com 500+ pontos | < 5s |
| PE-05 | `listarRotas` com 1000 rotas | < 5s no Firestore |
| PE-06 | Mapa lazy load | Primeiro mapa carrega < 3s após expandir |
| PE-07 | Swap (troca de pares) | Tempo de resposta < 2s por pair |
| PE-08 | Quota Gemini free tier | < 1500 tokens por chamada, dentro do limite diário com 30 alocações/dia |

---

## 16. Regressão — Features Entregues (não quebrar)

> Executar após QUALQUER mudança significativa no código

| ID | Feature | Teste crítico |
|----|---------|--------------|
| RG-01 | Background interativo | Grid reage ao mousemove em qualquer tela |
| RG-02 | Glassmorphism nos cards | Cards têm backdrop-filter em modo dark e light |
| RG-03 | Theme dark/light | Toggle muda corretamente, persiste entre sessões |
| RG-04 | Alocação completa ponta-a-ponta | Selecionar → Calcular → Resultado → Confirmar → Aparecer no Histórico |
| RG-05 | Cancelar lote | Confirmar → Histórico → Cancelar lote → Pontos voltam pra Pendente |
| RG-06 | Histórico com mapa | Abrir detalhe → Expandir rota → Mapa aparece com polyline |
| RG-07 | TRANSIT agrupado | Modo transporte público mostra caminhadas consecutivas somadas |
| RG-08 | Q1 no expand | Expandir linha → Análise da rodada + Decisão do algoritmo visíveis |
| RG-09 | Swap manual | Expandir → Trocar técnico → Swap funciona → Banner amarelo |
| RG-10 | Voltar pra ótima | Após swap → Voltar pra ótima → Estado original restaurado |
| RG-11 | Badge ajuste manual | Lote com swap → `/historico` → Badge "Ajuste manual" visível |
| RG-12 | origemDecisao no Firestore | Lote sem swap → `"auto"`. Lote com swap → `"ajuste-pos-auto"` |
| RG-13 | Gemini rico | Texto da IA cita nomes de técnicos e UMs, tem 4-6 frases |
| RG-14 | Fallback template Gemini | `GEMINI_ENABLED=false` → texto template procedural, sem erro |

---

## Checklist de execução por tipo de deploy

### 🔄 A cada PR / merge

- [ ] Rodar todos os testes de Regressão (seção 16)
- [ ] Verificar variáveis de ambiente (seção 12)
- [ ] Testar happy path completo: seleção → cálculo → confirmação → histórico

### 🚀 A cada release (deploy produção)

- [ ] Todas as seções acima
- [ ] Testar Firestore Rules no simulador (seção 11)
- [ ] Verificar limites de performance com volume real (seção 15)
- [ ] Testar fallbacks principais: Gemini down, Google Routes down (seções 7 e 14)
- [ ] Confirmar que `.env.local` não está no bundle (seção 12, SE-01 e SE-02)

### 🆕 A cada feature nova

- [ ] Escrever casos de teste da feature antes de implementar (TDD)
- [ ] Adicionar novos casos na seção de Regressão
- [ ] Testar edge cases da feature (0 itens, 1 item, N itens, overflow)

---

## Notas de execução

**Ferramentas sugeridas para automação futura:**
- **Unit tests**: Jest + Testing Library pra helpers puros (`gerarExplicacaoAlgoritmica`, `gerarJustificativaTemplate`, algoritmo Húngaro)
- **Integration tests**: Vitest + MSW (mock de Google Routes e Gemini) pra API routes
- **E2E**: Playwright pra fluxos completos (seção 8, happy paths)
- **Security**: OWASP ZAP pra scan de vulnerabilidades nas API routes

**Prioridade de automação (ordem sugerida):**
1. Testes unitários do algoritmo Húngaro (HU-01 a HU-09) — puro, sem dependências
2. Testes unitários dos helpers Gemini (GM-09 a GM-12) — puro, sem dependências
3. Testes de integração das API routes com MSW (AL-01 a AL-10)
4. Testes E2E do fluxo principal (RG-04 a RG-12)
