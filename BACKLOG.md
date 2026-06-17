# Backlog — ITC RouteMap

Itens pendentes e melhorias identificadas durante o desenvolvimento do sistema.

---

## 🐛 Bugs e Warnings conhecidos

### [P3] Warnings React 19 "setState in effect" nos modais

**Onde:** todos os modais Add/Edit
- `src/components/projetos/projeto-form-dialog.tsx`
- `src/components/ras/ra-form-dialog.tsx`
- `src/components/ums/um-form-dialog.tsx`
- `src/components/tecnicos/tecnico-form-dialog.tsx`

**Sintoma:** ESLint avisa que `setState` dentro de `useEffect` pode causar
cascading renders.

**Estado atual:** suprimido com `eslint-disable` + justificativa em
`projeto-form-dialog.tsx`. Outros modais ainda mostram warning, mas funcionam.

**Por que está OK por ora:** padrão "sync props to state" é validado na
documentação oficial do React. Funcional, sem bugs reais.

**Solução ideal (refatoração futura):** usar prop `key={item?.id ?? "novo"}`
no `<Dialog>` forçando remount em mudança de item. Elimina o useEffect inteiro.

**Prioridade:** P3 (cosmético, não bloqueante)

---

## 🚧 Melhorias futuras

### Substituir logo placeholder pela definitiva

**Onde:** Navbar e Login (atualmente usam quadrado ciano "ITC" como placeholder)

**Pendente:**
- Aguardando arquivos PNG da logo nas variantes claro/escuro (640×86)
- Implementar componente `<Logo />` reutilizável com troca por tema
- Estratégia anti-flash para evitar piscada ao alternar tema

**Prioridade:** P2

---

### Tela de gestão de convites

**Onde:** atualmente convites são criados manualmente no Firebase Console

**Visão:** UI dentro do sistema (Administração → Convites) para:
- Criar convite (email + prazo)
- Listar convites ativos
- Revogar/expirar convites
- Ver quem usou cada convite

**Prioridade:** P2

---

### Refatorar repositório para a Organization

**Estado atual:** repositório em `github.com/ITC-Brasil/itc-routemap` (público)

**Quando trocar:** quando o sistema entrar em produção comercial. Vai requerer
**Vercel Pro** ($20/mês por user) por causa de repos privados em Organizations.

**Prioridade:** P3 (não bloqueante, decisão de negócio)

### Centralizar tipo `Projeto` em um único arquivo

**Problema:** o tipo `Projeto` está duplicado entre:
- `src/lib/firestore/projetos.ts` (versão cliente)
- `src/lib/firestore/pontos-admin.ts` (versão server-side, dentro de `buscarProjetoAdmin`)

**Consequência:** quando muda o schema, é fácil esquecer de atualizar uma 
das cópias. Aconteceu na refatoração de `sheetAbaNome` → `sheetAbas`.

**Solução:** extrair os tipos comuns (`Projeto`, `Ponto`, etc) para 
`src/lib/firestore/types.ts`. Tanto cliente quanto admin importam dali. 
Single source of truth.

**Prioridade:** P2 (boa prática, evita regressões)

### Refatorar fetch de dados para SWR ou react-query

**Onde:** páginas client-side que carregam dados via useEffect
- `src/app/(privado)/admin/localidades/page.tsx`
- (qualquer outra página que apareça com o mesmo pattern)

**Problema atual:** carregamento de dados via `useEffect + carregarDados()` 
dispara warning `react-hooks/set-state-in-effect` no React 19.

**Estado atual:** suprimido com justificativa em comentário.

**Solução ideal:** adotar `@tanstack/react-query` ou `swr` para:
- Cache de dados entre páginas
- Refresh automático
- Estado de loading/error gerenciado pela lib
- Eliminação do warning na raiz

**Prioridade:** P3 (não bloqueante, refactor opcional)
---

## ✅ Resolvidos recentemente

### Alert "Acesso não autorizado" no Login

**Resolução:** persistir mensagem em `sessionStorage` + reload completo via
`window.location.href`. Implementado em `src/app/login/page.tsx`.

**Data:** Fase 1

---

### Sincronização Google Sheets — Permissão Firestore

**Resolução:** migrado de Firebase Auth (cliente) para Firebase Admin SDK
(server-side) com Service Account `firebase-adminsdk-fbsvc`. Credencial
armazenada em Base64 na variável `GOOGLE_SERVICE_ACCOUNT_BASE64`.

**Data:** Fase 3

---

## 📊 Convenção de Prioridades

| Nível | Significado | Quando atacar |
|---|---|---|
| **P0** | Bloqueante / crítico | Imediato |
| **P1** | Alta — afeta UX significativamente | Próxima sprint |
| **P2** | Média — melhoria importante | Próximo trimestre |
| **P3** | Baixa — polish, cosmético | Quando sobrar tempo |
P3 (Fase 6) — Refinar firestore.rules por coleção:
- projetos/, ums/, ras/, tecnicos/, pontos/, rotas/
- Considerar checagem de claim "admin: true" em vez de só auth != null

- [ ] Reativar Gemini quando billing do AI Studio for resolvido
  - Resolver prepay no projeto atual OU criar novo projeto sem billing
  - Atualizar GEMINI_API_KEY no .env.local
  - Trocar GEMINI_ENABLED=false → true
  - Testar via /api/routes/alocar


  ## Backlog técnico — Infra Firebase

### Versionar índices do Firestore no repo

**Problema:** índices compostos do Firestore vivem só no projeto atual.
Quando criar staging/prod ou outro dev clonar o repo, vai dar
"FirebaseError: The query requires an index" em produção até alguém
criar os índices manualmente no Console.

**Solução:** versionar `firestore.indexes.json` na raiz do projeto.

**Passos (~10min, fazer uma vez na Fase 5):**

1. `firebase login` (se ainda não tá logado)
2. `firebase init firestore` na raiz do projeto
   - Escolhe o projeto `itc-routemap`
   - Aceita `firestore.indexes.json` e `firestore.rules` como nomes padrão
3. Puxa os índices que já existem hoje:
   `firebase firestore:indexes > firestore.indexes.json`
4. Commita o arquivo: `git add firestore.indexes.json firebase.json`
5. Daqui pra frente, sempre que criar índice no Console, rodar
   `firebase firestore:indexes > firestore.indexes.json` pra atualizar
6. Pra recriar em ambiente novo:
   `firebase deploy --only firestore:indexes`

**Índices que existem hoje (atualizar quando criar novos):**
- `rotas`: `loteId ASC, loteOrdem ASC` — criado em [data] pra histórico