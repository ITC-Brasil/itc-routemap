# 04 — Telas e Funcionalidades

Descrição técnica de cada tela, seus componentes e comportamentos relevantes para desenvolvimento.

---

## `/` — Dashboard (tela inicial)

**Arquivo:** `app/(privado)/page.tsx`

### Dados carregados

```typescript
const [pontos, tecnicos, rotas] = await Promise.all([
  listarTodosPontos(),
  listarTecnicos(),
  listarRotasPorStatus("Confirmada"),
])
```

Três chamadas paralelas ao Firestore no `useEffect` inicial. A flag `cancelado` previne atualizações de estado após desmontagem.

### KPIs

| KPI | Cálculo |
|-----|---------|
| Pontos pendentes | `pontos.filter(p => p.status === "Pendente").length` |
| Pontos agendados | `pontos.filter(p => p.status === "Agendado").length` |
| Técnicos disponíveis | `tecnicos.filter(t => t.latitude !== null && t.longitude !== null && t.ativo !== false).length` |
| Rotas hoje | `rotasConfirmadas.filter(r => isHoje(r.criadoEm)).length` |
| Alocações no mês | `rotasConfirmadas.filter(r => isNestesMes(r.criadoEm)).length` |
| Tempo médio | Média de `r.metricas[r.modoPrincipal].duracaoSegundos` das rotas do mês |

O KPI de técnicos disponíveis usa `t.ativo !== false` (não `t.ativo === true`) para retrocompatibilidade com documentos que não tinham o campo `ativo`.

### Cronograma do dia

Tabela com colunas: Técnico, Destino, Modo, Tempo. Renderiza `LinhaRota` para cada rota de hoje. Tela vazia exibe CTA para `/calcular-rotas`.

---

## `/calcular-rotas` — Calculador de rotas

**Arquivo:** `app/(privado)/calcular-rotas/page.tsx`

### Máquina de estados

```
selecao
  └─→ calculando
        ├─→ resultado
        │     ├─→ reotimizacao (banner detectado)
        │     │     └─→ resultado (proposta aceita)
        │     └─→ confirmando
        │           ├─→ confirmado
        │           └─→ erroConfirmar
        └─→ erro
```

### Filtro de técnicos elegíveis

```typescript
const tecnicosComLocalizacao = tecnicos.filter(
  t => t.latitude !== null && t.longitude !== null && t.ativo !== false
)
```

Técnicos sem coordenadas ou pausados são silenciosamente excluídos da lista de seleção.

### Persistência no sessionStorage

- Chave: `itc_routemap_calculo_pendente`
- TTL: `STORAGE_TTL_MS` (2 horas)
- Estrutura: payload completo do resultado + timestamp
- Banner de restauração aparece se há cálculo válido não confirmado

### Detecção de re-otimização (13.12)

Após confirmar, o sistema compara pares alternativos que melhorariam o tempo total:

```typescript
const THRESHOLD_SEG = 300 // 5 minutos
```

Se o ganho potencial superar 5 minutos, um banner de re-otimização é exibido com a proposta.

---

## `/calcular-rotas/_components/resultado-alocacao.tsx`

### Swap manual

```typescript
const [alocacoesEditadas, setAlocacoesEditadas] = useState<Map<string, Alocacao>>(new Map())

function aplicarSwap(keyA: string, keyB: string) {
  // Troca os destinos entre os dois pares
  // Refaz fetch paralelo das métricas para os dois novos pares
}
```

Após swap, `PayloadConfirmacao.origemDecisao = "ajuste-pos-auto"` para a rota afetada.

### Seletor de modo no mapa

Permite alternar a visualização do mapa entre os modos calculados (`DRIVE`, `TWO_WHEELER`, `WALK`, `TRANSIT`). Cada modo mostra a rota correspondente com polyline diferente.

---

## `/historico` — Histórico de alocações

**Arquivo:** `app/(privado)/historico/page.tsx`

### Agregação client-side

```typescript
// listarLotes() em lib/firestore/lotes.ts
// Agrupa rotas por loteId, descarta lotes com apenas Sugeridas
// Ordena por data desc
```

Não há coleção `lotes` no Firestore — o agrupamento é feito no cliente com `Array.reduce`.

### Filtros

- **Período**: range de datas via `react-day-picker` (DateRangePicker)
- **Técnico**: dropdown com todos os técnicos que aparecem nos lotes
- **Status**: `Confirmada | Cancelada | Todos`
- **Projeto**: dropdown com todas as siglas de projetos nos lotes

Filtros ficam em um Popover acionado por ícone no header — não ocupam espaço permanente na tela.

---

## `/historico/[loteId]` — Detalhe do lote

**Arquivo:** `app/(privado)/historico/[loteId]/page.tsx`

### Componente `BadgeAjusteManual`

Exibido nas rotas onde `origemDecisao === "ajuste-pos-auto"`. Tooltip explica que a atribuição foi trocada manualmente pelo coordenador.

### Componente `BadgeReotimizacao`

Exibido nas rotas onde `realocadaDe !== null`. Tooltip mostra o ID da rota original que foi substituída.

### Agrupamento de caminhadas TRANSIT

Etapas consecutivas de `WALK` dentro de uma rota TRANSIT são agrupadas como "caminhadas" para simplificar a exibição. Evita mostrar N etapas de "andar 50m" separadas.

### Cancelar lote

```typescript
// cancelarLote() em lib/firestore/lotes.ts
// writeBatch atômico
// Rotas: Confirmada → Cancelada
// Pontos: Agendado → Pendente
// Guarda <= 450 operações por batch para não exceder limite do Firestore
```

---

## `/admin/tecnicos` — Gerenciamento de técnicos

**Arquivo:** `app/(privado)/admin/tecnicos/page.tsx`

### Lista em Accordion

Cada técnico é um `AccordionItem`. Expandido, mostra:

- Dados tabulados (endereço, ponto de referência, Plus Code, coordenadas)
- Ações: Editar, Pausar/Reativar, Deletar
- Mapa embed via `<iframe>` do Google Maps (quando há coordenadas)

### Pausa com confirmação

Pausar exige `AlertDialog` com texto explicativo ("não aparecerá na seleção ao calcular rotas"). Reativar é imediato, sem confirmação.

### Badge "Pausado"

```typescript
const pausado = tecnico.ativo === false

// Na UI:
{pausado && (
  <span className="rounded-full bg-amber-100 px-2 py-0.5 ...">Pausado</span>
)}
```

Item pausado também recebe `opacity-60` no AccordionItem.

---

## `/admin/projetos` — Gerenciamento de projetos

**Arquivo:** `app/(privado)/admin/projetos/page.tsx`

CRUD simples: nome, sigla, cor. Sigla é exibida como badge nos cards de UM e no histórico.

---

## `/admin/localidades` — Sincronização de UMs

**Arquivo:** `app/(privado)/admin/localidades/page.tsx`

### Fluxo de sincronização

1. Usuário cola URL da planilha Google Sheets
2. Sistema chama API route (`/api/sheets/sync`) com Firebase Admin SDK
3. Admin SDK lê a planilha via `googleapis`
4. Para cada UM, geocodifica o endereço via Google Maps Geocoding API
5. Faz upsert no Firestore (`pontos` coleção)

O e-mail da conta de serviço (`NEXT_PUBLIC_SERVICE_ACCOUNT_EMAIL`) é exibido na tela para orientar o usuário a compartilhar a planilha.

---

## `/estatisticas` — Indicadores gerenciais

**Arquivo:** `app/(privado)/estatisticas/page.tsx`

### Três painéis

| Painel | Dados |
|--------|-------|
| Ranking de técnicos | Count de rotas confirmadas por técnico, ordenado desc |
| UMs por frequência | Count de aparições de cada UM em rotas confirmadas |
| Distribuição por modo | Percentual de cada `ModoTransporte` nas rotas confirmadas |

Todos os dados são calculados client-side a partir das rotas confirmadas carregadas do Firestore.

---

## `/login` — Autenticação

**Arquivo:** `app/login/page.tsx`

- Formulário simples: e-mail + senha
- `signInWithEmailAndPassword` do Firebase Auth
- Erro de credencial inválida exibido via `sonner` toast
- Redireciona para `/` após login bem-sucedido

---

## Layout global (`app/(privado)/layout.tsx`)

- Navbar com links: Dashboard, Calcular Rotas, Histórico, Estatísticas, Admin (submenu)
- `container mx-auto` com `px-4 sm:px-6 lg:px-8` e `py-8` no `<main>`
- Rodapé com versão do `package.json`
- `BackgroundGrid` com grid animado e spotlight que segue o mouse (decorativo)
- `glassmorphism` nos cards via `backdrop-filter`
- Transição de página: slide horizontal animado entre rotas
