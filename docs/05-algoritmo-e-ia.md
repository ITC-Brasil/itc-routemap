# 05 — Algoritmo e IA

---

## Visão geral do pipeline de alocação

```
Entrada: N técnicos + M UMs
         │
         ▼
1. Google Routes Matrix API
   → Matriz de tempos N×M (por modo de transporte)
         │
         ▼
2. Algoritmo Húngaro (munkres-js)
   → Alocação ótima: minimiza soma total de tempo
   → Aplica penalidade de proximidade residencial
         │
         ▼
3. Gemini 2.5 Flash
   → Justificativa em linguagem natural
         │
         ▼
Saída: alocações ricas (técnico, UM, métricas, modoEfetivo)
```

---

## Algoritmo Húngaro

**Arquivo:** `lib/alocacao.ts`  
**Biblioteca:** `munkres-js 1.2.2`

### O que é

O Algoritmo Húngaro (também chamado de método de Munkres) resolve o **problema de atribuição** em tempo polinomial O(n³). Dado uma matriz de custos N×M, encontra o conjunto de N atribuições que minimiza o custo total — garantindo que a solução seja **globalmente ótima**, não apenas localmente boa.

### Função principal

```typescript
function resolverAlocacao(
  linhasMatriz: LinhaMatriz[],
  tecnicoIds: string[],
  destinoIds: string[],
  modosPorTecnico: Map<string, ModoTransporte>
): ResultadoAlocacao
```

**Retorna:**
```typescript
type ResultadoAlocacao = {
  alocacoes: Array<{
    tecnicoId: string
    destinoId: string
    custo: number         // duracaoSegundos do modo efetivo
    modoEfetivo: ModoTransporte
  }>
  tecnicosNaoAlocados: string[]
  destinosNaoAlocados: string[]
  custoTotal: number
  custoMedio: number
}
```

### Construção da matriz de custo

Para cada par (técnico i, destino j):

```typescript
const metricas = linhaMatriz.metricas[modoEfetivo]
const duracaoSeg = metricas?.duracaoSegundos ?? CUSTO_INFINITO

// Penalidade de proximidade residencial
const custo = duracaoSeg + (PESO_PROXIMIDADE * proximidadeExtra)
```

**`CUSTO_INFINITO = 1e9`** é usado para pares sem rota viável (ex.: técnico TRANSIT sem linha disponível para aquela UM). O algoritmo Húngaro evitará esses pares automaticamente.

### Peso de proximidade residencial

```typescript
const PESO_PROXIMIDADE = 0.3
```

Técnicos que moram mais próximos da UM ganham uma penalidade menor, incentivando o algoritmo a preferi-los para aquela localidade, mesmo que o tempo de deslocamento seja ligeiramente maior do que um técnico distante. O fator `0.3` foi calibrado empiricamente para equilibrar tempo versus proximidade.

### Modos mistos

Cada técnico tem seu `modoPrincipal` (ex.: Anne usa `DRIVE`, Allan usa `TRANSIT`). O algoritmo usa o modo efetivo do técnico ao extrair o custo da matriz:

```typescript
const modoEfetivo = modosPorTecnico.get(tecnicoId) ?? modoPrincipalGlobal
```

Isso permite que técnicos com modos diferentes coexistam no mesmo cálculo.

### Casos de dimensão irregular (N ≠ M)

Quando há mais UMs do que técnicos (M > N), o algoritmo Húngaro precisa de uma matriz quadrada. A biblioteca `munkres-js` padeia automaticamente com `CUSTO_INFINITO`. Os destinos sem par viável aparecem em `destinosNaoAlocados` no resultado.

---

## Justificativa por IA (Gemini 2.5 Flash)

**Arquivo:** `lib/gemini.ts`  
**SDK:** `@google/genai 2.8.0` (substituiu `@google/generative-ai` descontinuado em novembro/2025)

### Modelo

```typescript
const MODEL = "gemini-2.5-flash"
```

O modelo Gemini 2.5 Flash foi escolhido pelo baixo custo e pela velocidade (< 2s para justificativas curtas), mantendo qualidade suficiente para texto explicativo operacional.

### Contexto enviado ao modelo

```typescript
type ContextoAlocacao = {
  totalTecnicos: number
  totalUMs: number
  modoPrincipal: string
  tecnicos: Map<string, string>        // id → nome
  umsLookup: Map<string, {
    umNome: string
    raNome: string
    projetoSigla: string
  }>
}
```

O prompt inclui:
- Número de técnicos e UMs alocadas
- Modo de transporte principal
- Lista de pares (técnico → UM + RA + tempo)
- Instrução para gerar justificativa concisa em português

### Fallback automático

Se a API do Gemini falhar (rate limit, chave inválida, `GEMINI_ENABLED=false`), o sistema recorre ao `gerarJustificativaTemplate()`, que gera um texto procedural determinístico:

```typescript
// Exemplo de output do template:
// "Alocação de 3 técnicos para 3 UMs via carro.
//  Anne foi alocada para BSBIA01 (RA Brasília) — 12 min.
//  Allan foi alocado para RFAM02 (RA Fama) — 18 min.
//  ..."
```

O fallback garante que o fluxo de confirmação nunca seja bloqueado por uma falha da IA.

### Nomes amigáveis de modo

```typescript
function nomeAmigavelModo(modo: ModoTransporte): string {
  const mapa = {
    DRIVE: "carro",
    TWO_WHEELER: "moto",
    WALK: "a pé",
    BICYCLE: "bicicleta",
    TRANSIT: "transporte público",
  }
  return mapa[modo] ?? modo
}
```

Essa função é compartilhada entre `lib/gemini.ts` (prompt da IA) e `app/(privado)/historico/_components/historico-formatters.ts` (UI).

---

## Re-otimização inteligente (13.12)

**Arquivo:** `app/(privado)/calcular-rotas/page.tsx`  
**Função:** `aplicarReotimizacao()` em `lib/firestore/rotas.ts`

### Detecção de oportunidade

Após confirmar um lote, o sistema verifica pares alternativos:

```typescript
const THRESHOLD_SEG = 300 // 5 minutos
```

Para cada par (técnico A → UM X), verifica se existe outro par (técnico B → UM X) com tempo menor. Se a soma dos ganhos superar `THRESHOLD_SEG`, a re-otimização é oferecida.

### Aplicação atômica

```typescript
async function aplicarReotimizacao(
  loteIdAtual: string,
  novasAlocacoes: NovaAlocacao[]
): Promise<string> // retorna novo loteId
```

O `writeBatch` faz:
1. Cancela todas as rotas `Confirmada` do lote atual
2. Libera os pontos (`Agendado → Pendente`)
3. Cria novas rotas com `realocadaDe: rotaAntiga.id`
4. Atualiza os pontos das novas rotas (`Pendente → Agendado`)

O campo `realocadaDe` permite rastrear no histórico qual rota originou cada re-otimização.

---

## Diagrama completo do cálculo

```
POST /api/routes/alocar
├── Validação de input
│   ├── tecnicos.length > 0
│   ├── destinos.length > 0
│   ├── tecnicos × destinos ≤ MAX_PARES (625)
│   ├── tecnicosTransit × destinos ≤ MAX_PARES_TRANSIT (100)
│   └── coordenadas válidas para todos
│
├── Google Routes Matrix
│   ├── Chamada 1: técnicos não-TRANSIT × todos destinos
│   │   Modos: DRIVE + TWO_WHEELER + WALK + individuais
│   └── Chamada 2: técnicos TRANSIT × todos destinos
│       Modo: TRANSIT (isolado, limite 100 pares)
│
├── Algoritmo Húngaro (munkres-js)
│   ├── Monta matriz de custo N×M
│   │   ├── custo = duracaoSegundos (modo efetivo do técnico)
│   │   ├── + penalidade PESO_PROXIMIDADE (0.3)
│   │   └── CUSTO_INFINITO (1e9) para pares sem rota
│   └── Retorna: alocacoes, tecnicosNaoAlocados, destinosNaoAlocados
│
├── Gemini 2.5 Flash
│   ├── Prompt com pares alocados + contexto
│   └── Fallback: template procedural determinístico
│
└── Resposta JSON rica
    ├── loteId (UUID gerado em gerarLoteId())
    ├── alocacoes (origem, destino, metricas, modoEfetivo)
    ├── tecnicosNaoAlocados
    ├── destinosNaoAlocados
    ├── custoTotalSegundos
    ├── custoMedioSegundos
    ├── justificativaGemini
    ├── duracaoMs
    └── avisos (erros não-fatais da matriz)
```
