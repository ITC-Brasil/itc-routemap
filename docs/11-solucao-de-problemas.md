# 11 — Solução de Problemas

Erros comuns e como resolvê-los.

---

## Erros de build / TypeScript

### `Property 'table' does not exist on type 'Partial<ClassNames>'`

**Arquivo:** `components/ui/calendar.tsx:90`  
**Causa:** `react-day-picker` v9/v10 renomeou a chave `table` para `month_grid`.  
**Solução:** Remova a linha `table: "w-full border-collapse"` ou substitua por `month_grid: "w-full border-collapse"`.

### `Module not found: @google/generative-ai`

**Causa:** Pacote descontinuado em novembro/2025.  
**Solução:** O projeto já usa `@google/genai 2.8.0`. Se o erro aparecer, rode `npm install @google/genai` e remova qualquer referência ao pacote antigo.

### `Type 'X' is not assignable to type 'ModoTransporte'`

**Causa:** String literal não pertence ao union `"DRIVE" | "TWO_WHEELER" | "WALK" | "BICYCLE" | "TRANSIT"`.  
**Solução:** Adicione um cast `as ModoTransporte` ou valide com `MODOS_MATRIX_VALIDOS.has(valor)` antes de usar.

---

## Erros de runtime (API routes)

### `400 — Limite excedido: máximo 625 pares`

**Causa:** `tecnicos.length × destinos.length > 625`.  
**Solução:** Divida o cálculo em lotes menores. Máximo recomendado: 25 técnicos × 25 UMs por chamada.

### `400 — Limite TRANSIT excedido`

**Causa:** Técnicos com `modoPrincipal === "TRANSIT"` × número de UMs > 100.  
**Solução:** Reduza o número de UMs ou o número de técnicos TRANSIT no cálculo.

### `502 — Falha ao calcular matriz de deslocamento`

**Causa:** Todos os modos de transporte falharam na Routes Matrix API.  
**Possíveis razões:**
- Chave `GOOGLE_MAPS_SERVER_API_KEY` inválida ou com quota esgotada
- Routes API não habilitada no projeto Google Cloud
- Coordenadas inválidas (NaN, fora do range -90/90 lat, -180/180 lng)

**Solução:**
1. Verifique a chave no Google Cloud Console (seção "APIs & Services > Credentials")
2. Certifique-se de que "Routes API" está habilitada ("APIs & Services > Library")
3. Confira se as coordenadas dos técnicos e UMs são válidas no Firestore

### `422 — Não foi possível encontrar uma alocação viável`

**Causa:** Todos os pares da matriz têm custo `CUSTO_INFINITO` (sem rota calculável).  
**Possíveis razões:**
- Coordenadas todas iguais (bug de geocodificação)
- Modo TRANSIT sem cobertura de transporte público na área

**Solução:** Revise as coordenadas dos técnicos e UMs. Para TRANSIT, teste com outra área ou mude o modo do técnico.

---

## Erros de Firestore

### `FirebaseError: Missing or insufficient permissions`

**Causa:** Regras de segurança do Firestore bloqueando a operação.  
**Solução:** Verifique se o usuário está autenticado. Faça deploy das regras com:

```bash
firebase deploy --only firestore:rules
```

### `FirebaseError: The query requires an index`

**Causa:** Consulta com `orderBy` em mais de um campo sem índice composto.  
**Solução:** Faça deploy dos índices:

```bash
firebase deploy --only firestore:indexes
```

O link para criar o índice diretamente também aparece no console de erro do Firestore.

### `writeBatch commit failed — too many operations`

**Causa:** Batch com mais de 500 operações.  
**Solução:** A função `cancelarLote()` já tem guarda de 450 operações. Se o erro aparecer, verifique se há operações extras sendo adicionadas ao batch.

---

## Erros de autenticação

### Loop de redirect: `/login` → `/login`

**Causa:** Cookie de sessão corrompido ou variável `NEXT_PUBLIC_FIREBASE_*` incorreta.  
**Solução:**
1. Abra o DevTools do browser, vá em Application > Storage > Clear site data
2. Verifique se as variáveis `NEXT_PUBLIC_FIREBASE_*` correspondem ao projeto correto no Firebase Console

### `auth/wrong-password` ou `auth/user-not-found`

**Causa:** Credenciais incorretas.  
**Solução:** Redefina a senha no Firebase Console (Authentication > Users).

---

## Problemas de geocodificação

### Técnico sem coordenadas após cadastro

**Causa:** Plus Code inválido ou endereço não reconhecido pela Geocoding API.  
**Diagnóstico:** Abra o Google Maps, busque o Plus Code e verifique se resolve para um local.  
**Solução:** Corrija o Plus Code no cadastro do técnico. O formato correto é `XXXX+XX` ou `XXXXXXXX+XX`.

### Endereço exibe Plus Code em vez do nome da rua

**Causa:** Componentes `plus_code` ou `route` não retornados pela Geocoding API para aquela localidade.  
**Solução:** O código em `fix(geocoding): fallback hierarquico` já trata isso com a hierarquia `route → sublocality → administrative_area_level_4 → administrative_area_level_3`. Se ainda aparecer Plus Code, o endereço está em área com cobertura incompleta do Google Maps.

---

## Problemas de IA (Gemini)

### Justificativa não é gerada / timeout

**Causa:** Quota da Gemini API esgotada ou chave inválida.  
**Solução:**
1. Verifique a chave em `GEMINI_API_KEY`
2. O sistema automaticamente usa o fallback de template — o cálculo continua normalmente
3. Para desabilitar Gemini completamente: `GEMINI_ENABLED=false` no `.env.local`

### `GoogleGenerativeAIError: SDK deprecated`

**Causa:** Código usando o pacote antigo `@google/generative-ai`.  
**Solução:** O projeto já migrou para `@google/genai 2.8.0`. Apague `node_modules` e rode `npm install`.

---

## Problemas de deploy na Vercel

### Build falha: variável de ambiente não encontrada

**Solução:** Configure todas as variáveis listadas em `docs/08-deploy-e-infraestrutura.md` na Vercel (Settings > Environment Variables). Variáveis `NEXT_PUBLIC_` precisam estar em **All Environments**.

### `GOOGLE_SERVICE_ACCOUNT_BASE64` inválido

**Diagnóstico:** Erro `SyntaxError: Unexpected token` ao decodificar o JSON.  
**Solução:** Regenere o Base64:

```bash
cat service-account.json | base64 -w 0
```

Certifique-se de não ter quebras de linha no Base64 (flag `-w 0` remove isso).

---

## Problemas de mapa

### `g.maps.Map is not a constructor`

**Causa:** Google Maps JavaScript API não carregada ainda quando o componente monta.  
**Solução:** O componente `MapaAlocacao` usa `useEffect` com `window.google?.maps` para aguardar o carregamento. Verifique se a tag `<script>` do Maps está no `layout.tsx` com `async defer`.

### Mapa embed (iframe do técnico) não carrega

**Causa:** Bloqueador de pop-ups ou política de CSP do browser.  
**Solução:** O iframe usa a URL pública do Google Maps (`output=embed`) e não requer chave de API. Verifique se o browser permite iframes do domínio `google.com`.

---

## Dicas gerais de diagnóstico

1. **Abra o DevTools** (F12) → Console: erros de JS e falhas de rede
2. **Aba Network**: verifique o status das chamadas para `/api/routes/alocar` e `/api/routes/single`
3. **Firebase Console > Firestore**: inspecione documentos diretamente
4. **Vercel Dashboard > Functions**: logs em tempo real das API routes
5. **Google Cloud Console > APIs & Services**: quota e erros das APIs externas
