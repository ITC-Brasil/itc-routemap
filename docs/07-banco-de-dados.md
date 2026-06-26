# 07 — Banco de Dados

O sistema usa **Firebase Firestore** (NoSQL orientado a documentos) como único banco de dados.

---

## Coleções

### `tecnicos`

Técnicos de campo com localização residencial.

```typescript
type Tecnico = {
  id: string                // auto-gerado pelo Firestore
  nome: string              // titleCase aplicado na escrita
  cor: string               // hex (#RRGGBB) para avatar colorido
  endereco: string
  pontoReferencia: string
  plusCode: string          // uppercase na escrita
  latitude: number | null
  longitude: number | null
  modoPrincipal?: string    // ModoTransporte preferencial
  ativo: boolean            // false = pausado (não aparece no cálculo)
  criadoEm: Timestamp | null
}
```

**Fallback de retrocompatibilidade:**

Documentos criados antes da feature de pausa não têm o campo `ativo`. O mapeamento usa `data.ativo !== false` (em vez de `data.ativo === true`) para que documentos antigos sejam considerados ativos:

```typescript
ativo: data.ativo !== false
```

**Funções em `lib/firestore/tecnicos.ts`:**

| Função | Descrição |
|--------|-----------|
| `listarTecnicos()` | Lista todos, ordenados por nome (pt-BR) |
| `buscarTecnico(id)` | Retorna um técnico ou `null` |
| `criarTecnico(input)` | Cria e retorna o ID gerado |
| `atualizarTecnico(id, input)` | Atualiza todos os campos |
| `deletarTecnico(id)` | Remove o documento |
| `pausarTecnico(id)` | `updateDoc({ ativo: false })` |
| `reativarTecnico(id)` | `updateDoc({ ativo: true })` |

---

### `projetos`

Contratos/obras aos quais as UMs pertencem.

```typescript
type Projeto = {
  id: string
  nome: string
  sigla: string   // ex.: "BSBIA", "RFAM"
  cor: string
  criadoEm: Timestamp | null
}
```

---

### `ras`

Regiões Administrativas — agrupamento geográfico de UMs.

```typescript
type RA = {
  id: string
  nome: string
  criadoEm: Timestamp | null
}
```

---

### `pontos`

Unidades de Medição — pontos de trabalho a serem visitados pelos técnicos.

```typescript
type Ponto = {
  id: string
  umNome: string          // código da UM (ex.: "BSBIA01")
  projetoId: string
  projetoSigla: string    // desnormalizado para evitar join
  raNome: string          // desnormalizado
  endereco: string
  latitude: number
  longitude: number
  ciclo: number
  etapa: number
  status: StatusPonto
  criadoEm: Timestamp | null
}

type StatusPonto = "Pendente" | "Agendado" | "Atual" | "Histórico"
```

**Ciclo de vida:**

```
Pendente → Agendado (confirmarAlocacao)
Agendado → Pendente (cancelarLote / aplicarReotimizacao libera)
```

---

### `rotas`

Resultado de uma alocação confirmada: técnico → UM.

```typescript
type Rota = {
  id: string
  loteId: string                    // UUID gerado em gerarLoteId()
  loteOrdem: number                 // posição dentro do lote (0-based)
  loteJustificativa: string         // justificativa Gemini do lote
  status: StatusRota
  tecnicoId: string
  tecnicoNome: string               // snapshot no momento da confirmação
  modoPrincipal: ModoTransporte
  origem: {
    id: string
    endereco: string
    latitude: number
    longitude: number
  }
  destino: {
    id: string                      // pontoId
    umNome: string                  // snapshot
    projetoId: string
    projetoSigla: string            // snapshot
    raNome: string                  // snapshot
    endereco: string
    latitude: number
    longitude: number
    ciclo: number
    etapa: number
  }
  metricas: {
    [modo: string]: {
      duracaoSegundos: number
      distanciaMetros: number
    }
  }
  origemDecisao: "auto" | "manual" | "ajuste-pos-auto"
  realocadaDe: string | null        // ID da rota que esta substitui (re-otimização)
  criadoEm: Timestamp | null
}

type StatusRota = "Sugerida" | "Confirmada" | "Cancelada"
type ModoTransporte = "DRIVE" | "TWO_WHEELER" | "WALK" | "BICYCLE" | "TRANSIT"
```

**Observação sobre snapshots:** `tecnicoNome`, `umNome`, `projetoSigla`, `raNome` e endereços são copiados no momento da confirmação. Isso garante que o histórico seja imutável mesmo se o técnico ou UM forem editados/deletados depois.

---

## Índices compostos

Definidos em `firestore.indexes.json`:

```json
[
  {
    "collectionGroup": "rotas",
    "fields": [
      { "fieldPath": "loteId", "order": "ASCENDING" },
      { "fieldPath": "loteOrdem", "order": "ASCENDING" }
    ]
  },
  {
    "collectionGroup": "rotas",
    "fields": [
      { "fieldPath": "status", "order": "ASCENDING" },
      { "fieldPath": "criadoEm", "order": "DESCENDING" }
    ]
  }
]
```

O primeiro índice suporta `listarRotasDeLote(loteId)` ordenado por posição. O segundo suporta `listarRotasPorStatus("Confirmada")` ordenado por data decrescente.

> Implantar índices: `firebase deploy --only firestore:indexes`

---

## Regras de segurança

Definidas em `firestore.rules`. A regra geral exige autenticação Firebase para todas as operações:

```firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

> Para produção, considere regras mais granulares que validem campos obrigatórios e restrinjam operações por papel de usuário.

---

## Operações em batch

### `confirmarAlocacao()` — `lib/firestore/rotas.ts`

Cria N rotas + atualiza N pontos em um único `writeBatch` atômico:

```typescript
const batch = writeBatch(db)

for (const alocacao of alocacoes) {
  // Cria rota
  const rotaRef = doc(collection(db, "rotas"))
  batch.set(rotaRef, { status: "Confirmada", ... })

  // Atualiza ponto para Agendado
  const pontoRef = doc(db, "pontos", alocacao.destino.id)
  batch.update(pontoRef, { status: "Agendado" })
}

await batch.commit()
```

### `cancelarLote()` — `lib/firestore/lotes.ts`

Cancela todas as rotas e libera os pontos. Limitado a 450 operações por batch (margem de segurança abaixo do limite de 500 do Firestore):

```typescript
// Guarda de segurança
if (rotas.length * 2 > 450) {
  throw new Error("Lote grande demais para cancelamento em batch único.")
}
```

### `aplicarReotimizacao()` — `lib/firestore/rotas.ts`

1. Cancela rotas ativas do lote atual
2. Libera pontos (`Agendado → Pendente`)
3. Cria novas rotas com `realocadaDe` preenchido
4. Atualiza pontos das novas rotas (`Pendente → Agendado`)

Tudo em um único `writeBatch`.

---

## `gerarLoteId()`

```typescript
export function gerarLoteId(): string {
  return crypto.randomUUID()
}
```

UUID v4 gerado na API route `alocar/route.ts` no momento de montar a resposta. O mesmo `loteId` é usado para todas as rotas do lote na confirmação.

---

## Agregação de lotes (client-side)

Não existe coleção `lotes` no Firestore. A função `listarLotes()` em `lib/firestore/lotes.ts` agrupa as rotas da coleção `rotas` por `loteId` no cliente:

```typescript
const grupos = rotas.reduce((acc, rota) => {
  if (!acc.has(rota.loteId)) acc.set(rota.loteId, [])
  acc.get(rota.loteId)!.push(rota)
  return acc
}, new Map<string, Rota[]>())
```

Lotes que contêm apenas rotas com status `Sugerida` são descartados (nunca foram confirmados).
