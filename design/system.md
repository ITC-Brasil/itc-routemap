# ITC RouteMap — Design System

Fundação visual do sistema de alocação inteligente de técnicos do Grupo ITC Brasil.
Ferramenta operacional, desktop-first, usada por poucas pessoas com alta frequência.
O trabalho é geográfico: emparelhar técnicos a unidades móveis pelo Distrito Federal.

**Alvo de implementação:** Next.js 16 + Tailwind CSS 4 (`@theme`) + shadcn/ui.
**Família ITC:** compartilha fundação com o ITC Sentinel (tokens, tipografia, componentes base).
O que difere é o domínio — aqui tudo é deslocamento, não inventário.

---

## Princípios

1. **O par é a unidade de informação.** A tela do RouteMap não lista coisas; ela mostra *quem vai para onde*. Todo componente central é um par técnico → UM com o custo do deslocamento no meio. Esse é o objeto, não a linha de tabela.
2. **Off-white, nunca branco puro.** No tema claro o fundo base é `#F5F0E8`, superfícies `#FDFBF7`. Branco puro é proibido.
3. **Ciano é ação, não decoração.** A interface é neutra; o ciano marca o que se pode acionar e o que está comprometido.
4. **Status tem cor própria e inconfundível.** Pendente, Agendado e Histórico precisam ser distinguíveis num relance, sem ler o texto. Hoje não são — é o defeito visual mais caro do sistema.
5. **Cor de projeto e de técnico vêm do banco.** São dados, não decisão de design. O sistema define *como* exibir cor arbitrária com segurança, nunca qual cor usar.
6. **Ciclo e etapa são sequência real.** Numeração aqui carrega informação (a UM avança de etapa). É o único lugar onde numerar é legítimo.
7. **Caixa-alta espaçada com moderação.** No máximo dois rótulos de seção por tela. Hoje há cinco ou seis, e viram ruído.
8. **Dado técnico é tabular.** Distâncias, durações, coordenadas, Plus Codes e IDs de lote alinham em coluna com `tabular-nums`.

---

## 1. Cores

### Fundação de marca (fixa — tokens ITC, não alterar)

| Papel | HEX |
|---|---|
| Acento primário — Ciano ITC | `#008F95` |
| Ciano hover | `#007A80` |
| Ciano pressed | `#006C72` |
| Ciano claro (tint) | `#E0F4F5` |
| Ciano escuro | `#003C3F` |
| Ciano ajustado (dark) | `#30A5AB` |
| Institucional — Bordô | `#491027` |

### Funcionais (só em status)

| Papel | Token | Claro | Escuro |
|---|---|---|---|
| Sucesso / Confirmada | `--ok` | `#1A7F3C` | `#3DA35D` |
| Atenção / Pendente | `--warn` | `#CC7A00` | `#D98E2B` |
| Erro / Cancelada | `--err` | `#C0392B` | `#D75A4A` |
| Informação | `--info` | `#1565C0` | `#4B93DB` |

### Tokens semânticos por tema

| Token | Papel | Claro | Escuro |
|---|---|---|---|
| `bg-base` | fundo base | `#F5F0E8` | `#141918` |
| `bg-surface` | superfície / cards | `#FDFBF7` | `#1E2422` |
| `bg-muted` | fundo sutil / cabeçalho de tabela | `#EBE4D8` | `#2A302E` |
| `border` | bordas | `#D8DEDE` | `#333B39` |
| `text-base` | texto primário | `#1A2020` | `#F4F6F6` |
| `text-muted` | texto secundário | `#697272` | `#8E9A98` |
| `accent` | ação / destaque | `#008F95` | `#30A5AB` |
| `accent-hover` | hover | `#007A80` | `#46B5BA` |
| `accent-pressed` | pressionado | `#006C72` | `#268A8F` |
| `accent-light` | tint de fundo do acento | `#E0F4F5` | `rgba(48,165,171,0.16)` |
| `accent-dark` | acento escuro | `#003C3F` | `#0C2C2E` |
| `bordo` | institucional pontual | `#491027` | `#7A2A45` |

O tema escuro é o padrão atual do produto e continua disponível pelo alternador na topbar. Ambos os temas são de primeira classe: nenhuma tela pode ser desenhada só para um.

---

## 2. Tipografia

**Archivo** para títulos (personalidade, caixa-alta no display) e **Inter** para toda a UI.
Dados técnicos usam Inter com `font-variant-numeric: tabular-nums`.

| Papel | Família | Peso | Tamanho / line-height | Notas |
|---|---|---|---|---|
| Display | Archivo | 800 | 48 / 1.05 | `-0.02em`, CAIXA-ALTA — só no login |
| H1 | Archivo | 700 | 32 / 1.15 | `-0.01em` — título de página |
| H2 | Archivo | 700 | 24 / 1.2 | seções maiores, título de modal |
| H3 | Inter | 600 | 18 / 1.3 | cabeçalho de card |
| Body | Inter | 400 | 15 / 1.5 | corpo padrão |
| Small | Inter | 400 | 13 / 1.45 | apoio, endereços secundários |
| Caption | Inter | 500–600 | 11 / 1.3 | `0.06em`, CAIXA-ALTA, `text-muted` |
| Dados (tabular) | Inter | 600 | 13–14 | `tabular-nums` |
| Métrica | Inter | 700 | 28–36 | `tabular-nums`, números de card-resumo |

Fonts: `Archivo` (600/700/800), `Inter` (300/400/500/600/700) — Google Fonts.

**O que é dado tabular no RouteMap:** distância (`24,7 km`), duração (`36 min`, `1h 12min`), coordenadas (`-15.8331000, -48.0575000`), Plus Code (`3Q69+77`), ID de lote (`7401CC7D`), ciclo/etapa (`C2 · E7`), contagens.

---

## 3. Espaçamento, raio e sombra

**Espaçamento** (base 4px): `space-1` 4 · `space-2` 8 · `space-3` 12 · `space-4` 16 · `space-5` 20 · `space-6` 24 · `space-8` 32 · `space-10` 40 · `space-12` 48 · `space-16` 64.

**Raio:** `radius-sm` 4 · `radius-md` 6 · `radius-lg` 8 · `radius-xl` 12 · `radius-full` 9999.

**Sombras:**
- `shadow-1` (cards, inputs): claro `0 1px 2px rgba(26,32,32,0.06)` · escuro `0 1px 2px rgba(0,0,0,0.35)`
- `shadow-2` (modais, popovers): claro `0 10px 34px rgba(26,32,32,0.09)` · escuro `0 12px 42px rgba(0,0,0,0.5)`

**Largura de conteúdo:** máximo `1280px` centralizado, com `padding` lateral de 32px. Telas de tabela curta (Projetos, UMs) usam `max-width: 960px` — hoje elas esticam até a borda e ficam vazias.

---

## 4. Componentes base

- **Botões:** primário (ciano, texto branco), secundário (surface + border), ghost (transparente, texto ciano, hover `accent-light`), perigo (`err`). Alturas: sm 30px · md 38px · lg 44px. Raio 8px.
- **Campos:** altura 38px, raio 9px, foco = border `accent` + ring `0 0 0 3px accent-light`. Erro = border/ring `err`, com mensagem abaixo em `err` 13px.
- **Select / combobox:** mesmo chassi do input. **Itens de lista precisam de `role="option"` e o container `role="listbox"`** — requisito de acessibilidade, não opcional.
- **Checkbox / radio / toggle:** 19px; marcado = `accent`. Toggle 38×22px.
- **Tabela:** cabeçalho `bg-muted`, linhas 52px, divisórias `border`, cantos `radius-xl`, hover leve. Coluna cujos valores estejam todos vazios é ocultada, não exibida com traços.
- **Cards:** `bg-surface` + border + `shadow-1`, raio 12px, padding 20px.
- **Modal:** `bg-surface`, `shadow-2`, raio 13px, largura 560px para formulários. Título em Archivo 24px.
- **Toasts:** inferior centralizado, fundo `text-base` (inverso), ícone circular `ok`/`err`.
- **Skeleton:** shimmer entre `bg-muted` e `bg-base`. Toda métrica que depende de chamada externa nasce em skeleton, nunca em texto de espera.
- **Empty state:** ícone em `accent-light`, título Archivo 18px, descrição `text-muted`, CTA secundário.

### Navegação

Topbar de 60px, `bg-surface`, com logo ITC RouteMap à esquerda, navegação horizontal centralizada e área de conta à direita. Item ativo = `accent-light` + texto `accent` + peso 600. O submenu Administração abre em popover.

**Rótulo de seção (eyebrow):** um só por página, em Caption, dizendo a **área** de navegação — `OPERAÇÃO` para Calcular Rotas, `ADMINISTRAÇÃO` para os cadastros, `ANÁLISE` para Histórico e Estatísticas. Se o eyebrow não corresponder ao caminho real do menu, ele mente e deve sair. Nada de rótulo de desenvolvimento (`FASE 5`) na interface.

---

## 5. Padrões de produto

### 5.1 O par de alocação — elemento assinatura

É o componente que define o RouteMap e aparece em Calcular Rotas, Resultado, Histórico e Detalhe do lote. Estrutura horizontal em três zonas:

```
┌──────────────────────┬─────────────────────┬──────────────────────┐
│ TÉCNICO              │    ROTA             │ DESTINO              │
│ ● Paulo              │  ──── 24,7 km ────► │ [BSBIA] BSBIA01      │
│   Jardim Ingá, GO    │      36 min · 🚗    │ Santa Maria          │
│                      │                     │ C2 · E7              │
└──────────────────────┴─────────────────────┴──────────────────────┘
```

- **Zona esquerda:** avatar circular com a cor do técnico e iniciais, nome em Inter 600, endereço residencial em Small `text-muted`.
- **Zona central:** conector horizontal com a distância acima e duração + ícone de modo abaixo, ambos tabulares. O conector é uma linha de 1px em `border` com seta em `accent`. **Enquanto o dado não chega, skeleton — nunca a palavra "buscando".**
- **Zona direita:** badge de projeto (cor do banco), nome da UM em Inter 600, cidade em Body, ciclo/etapa em tabular `text-muted`.

Em telas estreitas as três zonas empilham e o conector vira vertical.

### 5.2 Status — cada um com identidade própria

**Ponto**

| Status | Tratamento | Racional |
|---|---|---|
| Pendente | pílula `warn` sobre tint 13% | aguarda ação humana — precisa chamar atenção |
| Agendado | pílula `accent` sobre `accent-light` | comprometido, em andamento |
| Histórico | pílula `text-muted` sobre `bg-muted` | encerrado, recolhe-se ao fundo |

**Rota / lote:** Confirmada = `ok` sólido em tint · Cancelada = `err` em outline (border 40%, sem preenchimento) — cancelado não deve competir com confirmado na varredura visual.

**Técnico:** Ativo não recebe badge (ausência é o estado normal) · Pausado = `warn` em outline.

**Ajuste manual:** badge `info` em outline no lote cuja alocação foi editada depois do cálculo automático.

### 5.3 Modo de transporte

Ícone + rótulo, sempre juntos, em `text-muted` no tamanho Small:

| Valor | Rótulo | Ícone |
|---|---|---|
| `DRIVE` | Carro | carro |
| `TWO_WHEELER` | Moto | moto |
| `TRANSIT` | Transporte público | ônibus |
| `WALK` | A pé | pessoa caminhando |

O modo influencia fortemente o resultado da alocação. Onde ele aparece junto de uma duração, os dois formam par visual — a duração sem o modo é ambígua.

### 5.4 Cores vindas do banco (projeto, UM, técnico)

Projetos, UMs e técnicos têm `cor` em hex cadastrada pelo usuário. Regras:

- **Badge de projeto/UM:** pílula com a cor em 16% de opacidade como fundo, a cor pura como texto, e border na cor a 30%. Se o contraste do texto contra o fundo ficar abaixo de 4.5:1, escurece (tema claro) ou clareia (tema escuro) a cor do texto até atingir — nunca exibir texto ilegível porque o usuário escolheu amarelo.
- **Avatar de técnico:** círculo 40px preenchido com a cor, iniciais em branco ou `#1A2020` conforme luminância.
- A cor é identificação, não status. Nunca usar cor de projeto para comunicar estado.

### 5.5 Cronograma e vazios

O dashboard tem seis cards de métrica e frequentemente metade fica em zero. Cards zerados não desaparecem (a ausência é informação), mas o número em zero usa `text-muted` em vez de `text-base`, e o card perde o link de ação. O card com dado real fica visualmente à frente.

Empty state de cronograma diz o que fazer, não que está vazio: título "Nenhuma rota confirmada hoje", descrição com o caminho ("Calcule e confirme alocações para vê-las aqui") e botão secundário.

### 5.6 Fundo cartográfico

O grid de fundo é a única licença decorativa do sistema e existe porque o produto é geográfico. Regras: opacidade máxima 4% no escuro e 3% no claro, células de 64px, ancorado no viewport e **sem cortes visíveis nas bordas** — hoje ele forma faixas à esquerda em várias telas. Não aparece dentro de cards, modais ou tabelas.

---

## 6. Telas

Todas entregues em tema claro **e** escuro.

1. **Login** — marca, entrada com Google (método padrão da equipe), email/senha como alternativa, aviso de acesso por convite.
2. **Início** — saudação, seis cards de métrica, cronograma do dia, acesso rápido.
3. **Calcular Rotas** — prontidão, seleção de técnicos e UMs, aviso de re-otimização, ação primária.
4. **Resultado da alocação** — pares de alocação, sobras, ação de confirmar.
5. **Histórico** — resumo, lista de lotes com métricas agregadas.
6. **Detalhe do lote** — pares, mapa, justificativa, compartilhamento.
7. **Estatísticas** — ranking de técnicos, UMs por frequência, distribuição por modo.
8. **Localidades** — resumo por projeto, filtros, tabela de pontos.
9. **Projetos**, **Unidades Móveis**, **Técnicos** — cadastros.
10. **Modais de cadastro** — técnico (o mais complexo: cor, Plus Code, coordenadas, modo).

---

## 7. Tailwind CSS 4 — `@theme`

```css
@import "tailwindcss";

@theme {
  /* Neutros — claro é o padrão */
  --color-bg-base: #F5F0E8;
  --color-bg-surface: #FDFBF7;
  --color-bg-muted: #EBE4D8;
  --color-border: #D8DEDE;
  --color-text-base: #1A2020;
  --color-text-muted: #697272;

  /* Acento — Ciano ITC */
  --color-accent: #008F95;
  --color-accent-hover: #007A80;
  --color-accent-pressed: #006C72;
  --color-accent-light: #E0F4F5;
  --color-accent-dark: #003C3F;

  /* Institucional */
  --color-bordo: #491027;

  /* Funcionais (só em status) */
  --color-ok: #1A7F3C;
  --color-warn: #CC7A00;
  --color-err: #C0392B;
  --color-info: #1565C0;

  /* Tipografia */
  --font-display: "Archivo", sans-serif;
  --font-sans: "Inter", sans-serif;

  /* Raio */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;

  /* Sombra */
  --shadow-1: 0 1px 2px rgb(26 32 32 / 0.06);
  --shadow-2: 0 10px 34px rgb(26 32 32 / 0.09);
}

.dark {
  --color-bg-base: #141918;
  --color-bg-surface: #1E2422;
  --color-bg-muted: #2A302E;
  --color-border: #333B39;
  --color-text-base: #F4F6F6;
  --color-text-muted: #8E9A98;

  --color-accent: #30A5AB;
  --color-accent-hover: #46B5BA;
  --color-accent-pressed: #268A8F;
  --color-accent-light: rgb(48 165 171 / 0.16);
  --color-accent-dark: #0C2C2E;

  --color-bordo: #7A2A45;

  --color-ok: #3DA35D;
  --color-warn: #D98E2B;
  --color-err: #D75A4A;
  --color-info: #4B93DB;

  --shadow-1: 0 1px 2px rgb(0 0 0 / 0.35);
  --shadow-2: 0 12px 42px rgb(0 0 0 / 0.5);
}
```

### Mapeamento shadcn/ui (globals.css)

```css
:root {
  --background: var(--color-bg-base);
  --foreground: var(--color-text-base);
  --card: var(--color-bg-surface);
  --card-foreground: var(--color-text-base);
  --popover: var(--color-bg-surface);
  --popover-foreground: var(--color-text-base);
  --primary: var(--color-accent);
  --primary-foreground: #FFFFFF;
  --secondary: var(--color-bg-muted);
  --secondary-foreground: var(--color-text-base);
  --muted: var(--color-bg-muted);
  --muted-foreground: var(--color-text-muted);
  --accent: var(--color-accent-light);
  --accent-foreground: var(--color-accent-pressed);
  --destructive: var(--color-err);
  --destructive-foreground: #FFFFFF;
  --border: var(--color-border);
  --input: var(--color-border);
  --ring: var(--color-accent);
  --radius: 0.5rem;
}
```

> No escuro, botões primários grandes sobre `#30A5AB` levam texto grafite (`#08201F`) para contraste.

---

## 8. Restrições de implementação

O RouteMap já existe e está em uso. Esta é uma reforma de apresentação, não uma reescrita.

- **Não alterar comportamento, rotas, server actions ou schema.** O design system muda como as telas se parecem, não o que fazem.
- **Componentes shadcn já instalados** — estender via tokens e variantes, não substituir a biblioteca.
- **Vocabulário de status é fixo:** `Pendente`, `Agendado`, `Histórico` para ponto; `Confirmada`/`Cancelada` para rota. A planilha usa `Atual`, que a ingestão traduz para `Agendado` — a interface nunca mostra "Atual".
- **Nada de `localStorage`** nos protótipos.
- **Piso de qualidade:** foco visível por teclado, `prefers-reduced-motion` respeitado, contraste mínimo 4.5:1 em texto.
