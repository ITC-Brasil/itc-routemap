# 10 — Histórico de Alterações

Changelog do projeto ITC RouteMap, organizado por fase de desenvolvimento.

---

## Fase 5 — Indicadores e Estatísticas

### `feat(fase5): pagina estatisticas com 3 indicadores gerenciais`

- Página `/estatisticas` com três painéis: ranking de técnicos, UMs por frequência e distribuição por modo de transporte
- Dados calculados client-side a partir das rotas confirmadas

---

## Feature: Pausar/Reativar Técnico

### `feat(admin): pausar/reativar tecnico`

- Campo `ativo: boolean` adicionado ao tipo `Tecnico`
- Fallback `data.ativo !== false` para retrocompatibilidade com documentos antigos
- Funções `pausarTecnico(id)` e `reativarTecnico(id)` em `lib/firestore/tecnicos.ts`
- UI em `admin/tecnicos/page.tsx`: botão Pausar com `AlertDialog` de confirmação, botão Reativar imediato
- Badge "Pausado" no card do técnico + opacidade reduzida
- Filtro em `calcular-rotas/page.tsx` e `app/(privado)/page.tsx`: técnicos pausados excluídos da seleção e do KPI

---

## Fase 4 — Algoritmo Avançado e Histórico

### `feat(fase4): 13.12 re-otimizacao inteligente completa`

- Detecção de oportunidade pós-confirmação com `THRESHOLD_SEG = 300` (5 minutos)
- `aplicarReotimizacao()` em `lib/firestore/rotas.ts`: batch atômico cancela rotas antigas e cria novas
- Campo `realocadaDe: string | null` nas rotas para rastrear origem da re-otimização

### `feat(fase4): 13.11 bloco 4 - badge Ajuste manual no historico`

- `BadgeAjusteManual` exibido nas rotas com `origemDecisao === "ajuste-pos-auto"`
- `BadgeReotimizacao` exibido nas rotas com `realocadaDe !== null`

### `feat(fase4): 13.11 bloco 1 - adiciona campo origemDecisao em Rota`

- Campo `origemDecisao: "auto" | "manual" | "ajuste-pos-auto"` adicionado ao tipo `Rota`
- Rastreia se a alocação foi automática, totalmente manual ou ajustada após o cálculo

### `feat(fase4): agrupa caminhadas consecutivas no detalhe TRANSIT`

- Etapas consecutivas de `WALK` dentro de uma rota TRANSIT agrupadas na UI do detalhe
- Evita exibição fragmentada de pequenas caminhadas

### `feat(fase4): 13.10 polish - centralizar helpers, TRANSIT e tela vazia`

- Helpers compartilhados centralizados em `historico/_components/historico-formatters.ts`
- Suporte a TRANSIT no seletor de modo do mapa
- Tela vazia para estado sem rotas hoje no dashboard

### `feat(fase4): gemini com SDK novo + prompt rico + Q1 contexto no expand`

- Migração de `@google/generative-ai` (descontinuado) para `@google/genai 2.8.0`
- Prompt enriquecido com contexto de pares + RA + modo de transporte
- Fallback automático para template procedural quando Gemini falha

### `feat(fase4): dashboard operacional na pagina inicial`

- Cards KPI: pontos pendentes/agendados, técnicos, rotas do dia e do mês, tempo médio
- Cronograma do dia com tabela de rotas confirmadas hoje
- Acesso rápido com 4 botões de navegação

### `feat(fase4): 13.9 historico de alocacoes com mapa interativo`

- Página `/historico` com lista de lotes agrupados por `loteId` (agregação client-side)
- Lotes com apenas rotas `Sugerida` são descartados
- Filtros: período, técnico, status, projeto
- Página `/historico/[loteId]` com detalhe completo + mapa interativo
- Seletor de modo (DRIVE/TWO_WHEELER/WALK/TRANSIT) no mapa do detalhe
- Cancelar lote: `writeBatch` atômico (rotas `Confirmada→Cancelada`, pontos `Agendado→Pendente`)

### `feat(fase4): 13.8 persistencia atomica de alocacao`

- `confirmarAlocacao()` em `writeBatch` (rotas + pontos `Pendente→Agendado`)
- Snapshots de `tecnicoNome` e endereços preservados na `Rota`
- Máquina de estados ampliada: `confirmando / confirmado / erroConfirmar`

### `feat(fase4): 13.7 UI de resultado com mapa + seletor de modo + transit`

- Componente `MapaAlocacao` com mapa Google Maps interativo
- Seletor de modo para alternar visualização
- Suporte a etapas TRANSIT detalhadas

---

## Fase 3 — Algoritmo e Persistência

### `feat(algoritmo): modo de transporte por tecnico no calculo`

- Cada técnico pode ter um `modoPrincipal` diferente
- Chamadas separadas para TRANSIT na Routes Matrix
- Modo efetivo por par no resultado da alocação

### `feat(algoritmo): peso de proximidade residencial na alocacao`

- `PESO_PROXIMIDADE = 0.3` adicionado ao custo do algoritmo Húngaro
- Incentiva alocar técnicos próximos às suas áreas de origem

### `fix(google-routes): habilita TRANSIT na Route Matrix`

- TRANSIT adicionado como modo válido na chamada à Routes Matrix API
- Separação de técnicos TRANSIT com `MAX_PARES_TRANSIT = 100`

---

## Fase 2 — UX e Admin

### `feat(ux): persiste calculo no sessionStorage com banner de restauracao`

- Cálculo não confirmado persiste no `sessionStorage` por 2 horas
- Banner de restauração aparece na próxima visita à página

### `feat(ui): transicao de pagina slide horizontal`

- Animação de transição entre páginas via CSS

### `feat(ui): combobox em todos os dropdowns do projeto`

- Dropdowns substituídos por Combobox com busca (cmdk 1.1.1)

### `feat(ui): background interativo + glassmorphism nos cards`

- `BackgroundGrid` global com grid animado e spotlight que segue o mouse
- Glass effect nos `Card` via `backdrop-filter`
- `card-interactive` com hover: elevação + barra lateral colorida + spotlight interno

### `feat(admin): card tecnico com mapa estatico ao lado`

- Mapa embed via `<iframe>` no card expandido do técnico

### `feat(admin): tecnico com modo principal + reordenacao formulario`

- Campo `modoPrincipal` no formulário de técnico
- Formulário reordenado para melhor UX

### `feat(historico): mapa e trajeto transit lado a lado`

- Layout side-by-side no detalhe do lote

### `feat(historico): filtros em popover pelo icone no header`

- Filtros colapsáveis via Popover para economizar espaço vertical

### `feat(historico): tooltip com nomes dos tecnicos ao hover`

- Hover nos cards do histórico exibe nomes dos técnicos

### `feat(dashboard): cronograma de hoje como tabela compacta`

- Cronograma do dia exibido em tabela em vez de cards

---

## Fase 1 — Base e CRUD

### `feat(ui): card-interactive nos cards faltantes`

- Classe `card-interactive` aplicada consistentemente

### `fix(geocoding): fallback hierarquico para endereco legivel`

- Hierarquia: `route` → `sublocality` → `administrative_area_level_4` → `administrative_area_level_3`
- Evita Plus Code aparecendo como endereço

### `fix(geocoding): extrai endereco legivel sem plus code`

- Remove `plus_code` dos componentes de endereço geocodificado

### `fix(admin): mapa tecnico com iframe + layout meio a meio`

- Correção do componente `g.maps.Map is not a constructor`

### `feat(admin): card tecnico com mapa estatico`

- Primeiro MVP do mapa no card de técnico

### `chore: adiciona firebase.json, firestore.rules e .firebaserc`

- Configuração para deploy via Firebase CLI

### `docs: adiciona plano de testes nivel ouro`

- Plano de testes abrangente em `docs/plano-testes-ouro.md`

### `docs: adiciona .env.example com todas as variaveis`

- Template documentado de variáveis de ambiente

### `chore: versiona firestore.indexes.json`

- Índices compostos do Firestore versionados no repositório

### `refactor(P4): centraliza helpers duplicados entre calcular-rotas e historico`

- Helpers de formatação centralizados em `historico-formatters.ts`

### `fix(navbar): remove duplicata Historico em menusAdmin`

- Correção de link duplicado no menu de navegação

### `test(e2e): playwright com cobertura completa + github actions`

- Setup completo do Playwright com specs para auth, calcular-rotas, histórico e admin
- Workflow GitHub Actions para CI
