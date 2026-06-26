# 06 — APIs Externas

---

## Google Routes Compute Matrix API

**Arquivo:** `lib/google-routes.ts`  
**Chamado de:** `app/api/routes/alocar/route.ts` (servidor)

### Finalidade

Calcula os tempos e distâncias reais de deslocamento entre N origens e M destinos, para um ou mais modos de transporte simultaneamente.

### Limites

| Constante | Valor | Significado |
|-----------|-------|-------------|
| `MAX_PARES` | 625 | Máximo de pares para modos não-TRANSIT (25×25) |
| `MAX_PARES_TRANSIT` | 100 | Máximo de pares para TRANSIT (10×10) |
| `MODOS_DEFAULT` | `["DRIVE", "TWO_WHEELER", "WALK"]` | Modos calculados por padrão |

### Função principal

```typescript
async function calcularMatrizDeslocamento(
  origens: Array<{ id: string; latitude: number; longitude: number }>,
  destinos: Array<{ id: string; latitude: number; longitude: number }>,
  modos: ModoMatrix[]
): Promise<{
  matriz: LinhaMatriz[]
  modosCalculados: ModoMatrix[]
  erros: string[]
}>
```

### Chamadas paralelas por modo

A função faz uma chamada REST por modo via `Promise.allSettled`, permitindo que um modo falhe sem derrubar os demais:

```typescript
const resultados = await Promise.allSettled(
  modos.map(modo => chamarMatrixAPI(origens, destinos, modo))
)
```

Se pelo menos um modo retornar resultados, a alocação prossegue. Modos que falharam são adicionados ao array `erros` (devolvido como `avisos` na resposta da API route).

### Endpoint REST

```
POST https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix
```

Headers:
```
X-Goog-Api-Key: {GOOGLE_MAPS_SERVER_API_KEY}
X-Goog-FieldMask: originIndex,destinationIndex,duration,distanceMeters,status
```

### Estrutura do retorno

```typescript
type LinhaMatriz = {
  origemId: string
  destinoId: string
  metricas: {
    [modo: string]: {
      duracaoSegundos: number
      distanciaMetros: number
    }
  }
}
```

### Tratamento de TRANSIT

TRANSIT tem limite de 100 pares na Routes Matrix API. O orquestrador em `route.ts` separa técnicos TRANSIT dos demais e faz uma chamada isolada:

```typescript
const tecnicosTransit = tecnicos.filter(t => modosPorTecnico.get(t.id) === "TRANSIT")
const tecnicosNaoTransit = tecnicos.filter(t => modosPorTecnico.get(t.id) !== "TRANSIT")

// Chamada 1: não-TRANSIT — DRIVE + TWO_WHEELER + WALK
// Chamada 2: TRANSIT — apenas TRANSIT
```

---

## Google Routes Single API

**Arquivo:** `lib/google-routes.ts` (função `calcularRotaIndividual`)  
**Chamado de:** `app/api/routes/single/route.ts` (servidor)

### Finalidade

Obtém a rota detalhada entre um ponto de origem e um destino: polyline codificada (para renderizar no mapa) e etapas detalhadas de TRANSIT (nome da linha, horários, instruções).

### Endpoint REST

```
POST https://routes.googleapis.com/directions/v2:computeRoutes
```

### Payload

```json
{
  "origin": { "location": { "latLng": { "latitude": ..., "longitude": ... } } },
  "destination": { "location": { "latLng": { "latitude": ..., "longitude": ... } } },
  "travelMode": "TRANSIT",
  "computeAlternativeRoutes": false
}
```

### FieldMask para TRANSIT

```
routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,
routes.legs.steps.transitDetails,routes.legs.steps.travelMode,
routes.legs.steps.navigationInstruction,routes.legs.steps.polyline
```

### Uso no frontend

A polyline codificada é passada para o componente `MapaAlocacao`, que a decodifica com a biblioteca do Google Maps JavaScript API e renderiza como caminho no mapa.

---

## Google Maps Embed API

**Usado em:** `app/(privado)/admin/tecnicos/page.tsx`

Renderizado como `<iframe>` simples para exibir o mapa estático na posição do técnico:

```typescript
<iframe
  src={`https://www.google.com/maps?q=${tecnico.latitude},${tecnico.longitude}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
  loading="lazy"
/>
```

Não requer autenticação (Maps Embed é gratuito para uso embed básico). A chave pública `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` é usada apenas para o Maps JavaScript API (mapa interativo no `MapaAlocacao`).

---

## Google Maps JavaScript API

**Usado em:** `_components/MapaAlocacao` (componente de mapa interativo)

Carregado via script tag com `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. Permite:

- Renderizar o mapa base (satélite/street)
- Decodificar e exibir polylines de rotas
- Marcadores customizados para origens e destinos
- Hover com tooltips dos técnicos

---

## Google Sheets API (googleapis)

**Usado em:** API route de sincronização de localidades  
**Biblioteca:** `googleapis 172.0.0`

Autentica com a conta de serviço (`GOOGLE_SERVICE_ACCOUNT_BASE64`) via JWT e lê o conteúdo da planilha compartilhada para importar as UMs.

---

## Gemini API

**Arquivo:** `lib/gemini.ts`  
**Biblioteca:** `@google/genai 2.8.0`

### Por que o SDK novo?

O pacote `@google/generative-ai` foi descontinuado em novembro/2025. O substituto oficial é `@google/genai`, com API levemente diferente:

```typescript
// SDK antigo (descontinuado):
import { GoogleGenerativeAI } from "@google/generative-ai"

// SDK atual:
import { GoogleGenAI } from "@google/genai"
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
```

### Controle de habilitação

```typescript
const GEMINI_ENABLED = process.env.GEMINI_ENABLED !== "false"
```

Defina `GEMINI_ENABLED=false` no `.env.local` para desabilitar chamadas à API e usar sempre o fallback de template. Útil em desenvolvimento para economizar quota.

---

## Segurança de chaves

| Chave | Onde fica | Proteção |
|-------|-----------|----------|
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Browser | Restrição de HTTP referrer no Google Cloud Console |
| `GOOGLE_MAPS_SERVER_API_KEY` | Servidor (Vercel env) | Restrição de IP no Google Cloud Console |
| `GEMINI_API_KEY` | Servidor (Vercel env) | Nunca exposta ao browser |
| `GOOGLE_SERVICE_ACCOUNT_BASE64` | Servidor (Vercel env) | JSON da conta de serviço em Base64 |

> **Importante:** Nunca commite valores reais no repositório. Use `.env.local` localmente e as variáveis de ambiente da Vercel em produção.
