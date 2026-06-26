# 01 — Visão Geral

## O que é o ITC RouteMap

O **ITC RouteMap** é um sistema web interno do Grupo ITC Brasil para alocar técnicos de campo às Unidades de Medição (UMs) que precisam de atendimento. O sistema substitui o processo manual de planilhas e calcula automaticamente qual técnico deve ir para qual UM, levando em conta distância, modo de transporte e proximidade residencial.

O resultado é uma sugestão de alocação que o coordenador pode revisar, ajustar manualmente e confirmar — tudo em uma única interface.

---

## Problema que resolve

Antes do sistema, o coordenador precisava:

1. Consultar a lista de UMs pendentes em uma planilha
2. Verificar quais técnicos estavam disponíveis e onde moravam
3. Estimar manualmente qual técnico ficaria mais próximo de cada UM
4. Registrar a alocação em outra planilha
5. Repetir esse processo para dezenas de UMs por semana

Com o ITC RouteMap esse fluxo cai para menos de 2 minutos: selecionam-se as UMs e os técnicos, clica-se em **Calcular Alocação**, e o sistema retorna a distribuição ótima com tempos de deslocamento, mapa e justificativa em linguagem natural.

---

## Glossário

| Termo | Significado |
|-------|-------------|
| **UM** | Unidade de Medição — endereço físico que precisa de atendimento técnico |
| **Ponto** | Registro no Firestore que representa uma UM + metadados (ciclo, etapa, status) |
| **Técnico** | Colaborador de campo com endereço residencial cadastrado e coordenadas GPS |
| **Rota** | Resultado de uma alocação: técnico → UM, com métricas de tempo e distância |
| **Lote** | Conjunto de N rotas geradas no mesmo cálculo, agrupadas por `loteId` (UUID) |
| **RA** | Região Administrativa — agrupamento geográfico de UMs |
| **Projeto** | Contrato/obra ao qual as UMs pertencem (ex.: BSBIA, RFAM, …) |
| **ModoTransporte** | Meio de locomoção: `DRIVE`, `TWO_WHEELER`, `WALK`, `BICYCLE`, `TRANSIT` |
| **origemDecisao** | Campo que registra se a alocação foi automática (`auto`), manual (`manual`) ou ajustada após o cálculo (`ajuste-pos-auto`) |
| **StatusRota** | Ciclo de vida de uma rota: `Sugerida` → `Confirmada` → `Cancelada` |
| **StatusPonto** | Ciclo de vida de um ponto: `Pendente` → `Agendado` → `Atual` → `Histórico` |

---

## Fluxo de valor resumido

```
Pontos pendentes no Firestore
         │
         ▼
  Coordenador acessa /calcular-rotas
         │
         ├─ Seleciona técnicos disponíveis
         ├─ Seleciona UMs a alocar
         └─ Clica em "Calcular Alocação"
                  │
                  ▼
         POST /api/routes/alocar
                  │
          ┌───────┴────────┐
          │                │
   Google Routes      Algoritmo
   Matrix API         Húngaro
   (tempos reais)     (alocação ótima)
          │                │
          └───────┬────────┘
                  │
           Gemini 2.5 Flash
           (justificativa)
                  │
                  ▼
     Resultado exibido na UI
     (mapa + tabela + métricas)
                  │
                  ├─ Coordenador revisa
                  ├─ Pode fazer swap manual entre pares
                  └─ Confirma alocação
                           │
                           ▼
                  writeBatch no Firestore
                  Rotas → Confirmada
                  Pontos → Agendado
```

---

## Perfis de usuário

O sistema tem um único perfil de acesso: **administrador/coordenador**, autenticado via Firebase Auth (e-mail + senha). Não há perfis distintos para visualização versus edição — qualquer usuário logado tem acesso completo a todas as funcionalidades.

---

## Limitações conhecidas

| Limitação | Detalhe |
|-----------|---------|
| Máximo de pares por cálculo | 625 pares (25 técnicos × 25 UMs) para modos não-TRANSIT; 100 pares para TRANSIT |
| TRANSIT isolado | Técnicos TRANSIT usam chamada separada à Google Routes Matrix (limite de 100 pares) |
| Persistência temporária | Cálculo não confirmado fica no `sessionStorage` por 2 horas (TTL configurado) |
| Sem multi-tenant | Sistema é single-tenant — dados de um único Grupo ITC Brasil |
| Sem histórico em tempo real | Dashboard e histórico fazem fetch pontual, sem WebSocket |
