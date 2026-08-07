# ITC RouteMap — protótipo de interface para revisão

Este pacote é um **protótipo de design navegável**, não o código de produção. Ele existe para
validar telas, fluxos, textos e identidade visual antes de a equipe implementar no Next.js.

Repositório de origem: `ITC-Brasil/itc-routemap` (branch `main`). O mapeamento tela → arquivos
do repositório está em `github.md`.

---

## Como abrir

Abra `ITC RouteMap v2.dc.html` num navegador (Chrome/Edge/Safari atuais). Não há build, não há
`npm install`. Os três arquivos precisam ficar na mesma pasta:

```
ITC RouteMap v2.dc.html   a tela inteira (template + lógica)
support.js                runtime que interpreta o arquivo acima
itc-map.js                camada do mapa (Leaflet + OpenStreetMap)
public/logos/             logos oficiais usados no protótipo
```

Requer internet: Google Fonts (Archivo, Inter, Poppins), Leaflet 1.9.4 e os tiles do
OpenStreetMap são carregados por CDN.

Entrada: qualquer e-mail/senha no Login — o botão **Entrar** apenas troca de tela.

---

## O que tem dentro do arquivo principal

Um único arquivo com duas partes:

1. **Template** (dentro de `<x-dc>`) — a marcação de todas as telas, com estilo inline.
   `{{ nome }}` são valores vindos da lógica; `<sc-for>` e `<sc-if>` são laço e condicional.
2. **Lógica** (`<script data-dc-script>`) — uma classe `Component` no estilo de um componente
   React de classe: `state`, `setState`, handlers e um método `renderVals()` que devolve tudo
   o que o template consome.

Não há CSS externo nem classes: as cores vêm de variáveis CSS (`--accent`, `--bg-surface`,
`--border`, …) declaradas em dois temas, `:root` (claro) e `[data-theme="dark"]` (escuro).

---

## Telas (11)

| Tela | Como chegar |
|---|---|
| Login | inicial |
| Início (dashboard) | rail → Início |
| Calcular Rotas (seleção) | rail → Calcular |
| Calculando (loading) | botão "Calcular alocação ótima" |
| Resultado da alocação | após o cálculo — mapa, pares, métricas, sobras |
| Histórico | rail → Histórico |
| Detalhe do lote | card de lote → "Abrir" |
| Estatísticas | rail → Estatísticas |
| Admin · Localidades / Projetos / Unidades Móveis / Técnicos | rail → Admin (abas) |

Interações que funcionam de verdade: seleção de técnicos e UMs com aviso de divergência,
re-otimização, troca de modo de transporte por par, ajuste manual, cancelamento de lote com
diálogo de impacto, pausar/reativar técnico (reflete na seleção do cálculo), formulários de
criação e edição, edição de ponto, filtros do Histórico e alternância de tema.

---

## Dados

Os cinco lotes, os oito pontos de Localidades, os nomes por extenso dos projetos e o Plus Code
dos técnicos são **fictícios** — em produção vêm do Firestore em runtime. As agregações em cima
deles seguem o código real: `statusLote` derivado das rotas, modo predominante por contagem,
`formatarDuracao` e `formatarDistancia` portadas de `historico-formatters.ts`.

Os diálogos foram portados dos componentes reais com títulos, descrições, campos e textos de
ajuda verbatim (ProjetoFormDialog, UMFormDialog, TecnicoFormDialog, EditarPontoDialog,
CancelarLoteDialog, ConfirmDeleteDialog, AlertDialog de pausar técnico).

---

## Identidade visual (`exports/`)

Símbolo de rota, lockup horizontal e empilhado, variantes colorida / monocromática / negativa,
versões animadas e favicons. Métricas herdadas do pacote ITC NoteScan — detalhes em
`exports/LEIA-ME.txt`.

Os arquivos animados vêm com extensão `.svg.txt`: renomeie removendo o `.txt` final; o conteúdo
já é SVG válido com animação SMIL.

---

## O que faz sentido revisar

- **Fidelidade ao domínio**: nomenclatura, estados, regras de negócio e textos batem com o que
  o sistema faz? Alguma tela ou caso de borda faltando?
- **Fluxo**: a sequência seleção → cálculo → resultado → confirmação corresponde à operação real?
- **Formulários**: campos, validações implícitas, textos de ajuda e ordem dos campos.
- **Acessibilidade e uso**: contraste nos dois temas, alvos de toque, navegação por teclado.
- **Lacuna conhecida**: `admin/localidades/page.tsx` (barra de filtros e controle de
  sincronismo) ainda não foi lida — a tela de Localidades cobre a tabela de pontos e a edição
  de ponto, não os filtros.

Ao portar para o repositório, o que deve viajar é a **decisão de design** (layout, hierarquia,
copy, estados, tokens), não este HTML: os componentes de produção são shadcn/ui + Tailwind.
