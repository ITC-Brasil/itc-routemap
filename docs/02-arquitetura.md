# 02 — Arquitetura

## Stack técnica

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Framework | Next.js (App Router) | 16.2.6 |
| Runtime UI | React | 19.2.4 |
| Banco de dados | Firebase Firestore | 12.13.0 (cliente) / 13.10.0 (Admin SDK) |
| Autenticação | Firebase Auth | incluso no SDK |
| IA generativa | Google Gemini 2.5 Flash | @google/genai 2.8.0 |
| Rotas + matriz | Google Routes API | REST |
| Algoritmo de alocação | Algoritmo Húngaro | munkres-js 1.2.2 |
| UI components | shadcn/ui + Radix UI | shadcn 4.8.0 |
| Estilização | Tailwind CSS v4 | ^4 |
| Testes E2E | Playwright | 1.61.1 |
| Mapas embed | Google Maps Embed API | REST |
| Planilhas | Google Sheets API (googleapis) | 172.0.0 |
| Deploy | Vercel | — |

---

## Estrutura de pastas

```
itc-routemap/
├── app/
│   ├── (privado)/               # Rotas autenticadas (layout com Navbar)
│   │   ├── page.tsx             # Dashboard (KPIs + cronograma)
│   │   ├── calcular-rotas/
│   │   │   ├── page.tsx         # Máquina de estados do cálculo
│   │   │   └── _components/     # ResultadoAlocacao, MapaAlocacao, etc.
│   │   ├── historico/
│   │   │   ├── page.tsx         # Lista de lotes com filtros
│   │   │   ├── [loteId]/
│   │   │   │   └── page.tsx     # Detalhe do lote
│   │   │   └── _components/     # Formatters, badges, helpers UI
│   │   ├── admin/
│   │   │   ├── tecnicos/page.tsx
│   │   │   ├── projetos/page.tsx
│   │   │   └── localidades/page.tsx
│   │   └── estatisticas/page.tsx
│   ├── api/
│   │   └── routes/
│   │       ├── alocar/route.ts  # POST — orquestrador principal
│   │       └── single/route.ts  # POST — rota individual com polyline
│   ├── login/page.tsx
│   └── layout.tsx               # Root layout (providers)
├── components/
│   ├── ui/                      # shadcn/ui (Button, Card, Dialog, …)
│   ├── tecnicos/                # TecnicoFormDialog, TecnicoAvatar
│   └── ...
├── lib/
│   ├── firebase.ts              # Inicializa Firebase client SDK
│   ├── firebase-admin.ts        # Inicializa Firebase Admin SDK (servidor)
│   ├── firestore/
│   │   ├── tecnicos.ts          # CRUD técnicos + pausar/reativar
│   │   ├── rotas.ts             # CRUD rotas, confirmarAlocacao, aplicarReotimizacao
│   │   ├── pontos.ts            # CRUD pontos (UMs)
│   │   ├── projetos.ts          # CRUD projetos
│   │   ├── lotes.ts             # Agregação client-side por loteId
│   │   └── ras.ts               # CRUD regiões administrativas
│   ├── alocacao.ts              # Algoritmo Húngaro (resolverAlocacao)
│   ├── gemini.ts                # Justificativa via Gemini 2.5 Flash
│   ├── google-routes.ts         # Google Routes Matrix + Single
│   ├── modos-transporte.ts      # IconeModo, helpers de modo
│   └── text-utils.ts            # titleCase e utilitários de texto
├── contexts/
│   └── auth-context.tsx         # AuthContext (Firebase Auth)
├── e2e/
│   ├── tests/                   # Specs Playwright
│   └── helpers/                 # Setup de autenticação
├── docs/                        # Esta documentação
├── firestore.indexes.json       # Índices compostos do Firestore
├── firestore.rules              # Regras de segurança
├── firebase.json                # Config deploy Firebase CLI
├── .env.example                 # Template de variáveis de ambiente
└── package.json
```

---

## Fronteiras de execução

```
┌─────────────────────────────────────────────────────┐
│                    BROWSER                          │
│                                                     │
│  app/(privado)/**  →  Firebase client SDK           │
│  (React 19, Tailwind, shadcn)   Firestore + Auth    │
│                                                     │
│  fetch("/api/routes/alocar")                        │
│          │                                          │
└──────────┼──────────────────────────────────────────┘
           │ HTTPS
┌──────────┼──────────────────────────────────────────┐
│          ▼         VERCEL EDGE / NODE               │
│                                                     │
│  app/api/routes/alocar/route.ts                     │
│   ├─ lib/google-routes.ts  →  Google Routes API     │
│   ├─ lib/alocacao.ts       →  munkres-js            │
│   └─ lib/gemini.ts         →  Gemini API            │
│                                                     │
│  app/api/routes/single/route.ts                     │
│   └─ lib/google-routes.ts  →  Google Routes API     │
│                                                     │
│  Firebase Admin SDK  →  Firestore (server-side)     │
└─────────────────────────────────────────────────────┘
```

O cliente **nunca** chama Google Routes ou Gemini diretamente — essas chamadas ficam nas API routes do servidor, onde as chaves secretas (`GOOGLE_MAPS_SERVER_API_KEY`, `GEMINI_API_KEY`) não são expostas ao browser.

---

## Fluxo de autenticação

1. Usuário acessa qualquer rota sob `app/(privado)/`
2. `AuthContext` verifica `onAuthStateChanged` do Firebase Auth
3. Se não autenticado, redireciona para `/login`
4. Login via `signInWithEmailAndPassword` do Firebase Auth
5. Token JWT gerenciado automaticamente pelo SDK (refresh automático)

---

## Decisões de arquitetura relevantes

### Por que Firebase Firestore e não um banco relacional?

O Firestore foi escolhido pela integração nativa com Firebase Auth, pelo SDK client-side que elimina uma camada de API para leituras simples, e pela facilidade de `writeBatch` para operações atômicas (confirmar lote inteiro sem transaction server-side customizada).

### Por que o algoritmo Húngaro em vez de heurística gulosa?

O algoritmo Húngaro garante a alocação **globalmente ótima** para matrizes de custo N×M. Uma heurística gulosa pode alocar o melhor par local e deixar um técnico distante para os demais. Para N≤25, o algoritmo roda em milissegundos.

### Por que sessionStorage para persistência temporária?

O `sessionStorage` evita que um cálculo seja perdido por refresh acidental, sem precisar persitir estados parciais ("Sugerida") no Firestore e depois ter que limpar. O TTL de 2 horas cobre a janela de revisão normal de um coordenador.

### Por que duas chaves do Google Maps?

A chave `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` é exposta ao browser (Maps Embed em iframes), então é protegida por **restrição de HTTP referrer** no Google Cloud Console. A `GOOGLE_MAPS_SERVER_API_KEY` fica exclusivamente no servidor e é protegida por **restrição de IP**, permitindo chamar a Routes API sem expor a chave ao usuário final.

### Por que `writeBatch` e não transações do Firestore?

`writeBatch` é suficiente porque as operações de confirmação de lote são **writes apenas** — não há read-then-write condicional que exigiria uma transaction. O batch tem limite de 500 operações; o código de `cancelarLote` em `lib/firestore/lotes.ts` tem uma guarda que limita a 450 para deixar margem.
