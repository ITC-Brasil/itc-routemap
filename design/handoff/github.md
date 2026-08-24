repo: ITC-Brasil/itc-routemap
branch: main

## Last sync
date: 2026-08-07T19:03:41Z
commit: 818dc71230a3

### Updated in this project
- Identidade visual completa em `Identidade ITC RouteMap.dc.html` + pacote `exports/`: simbolo de rota, lockup horizontal e empilhado nas variantes colorida/mono/negativa, versoes animadas (SMIL, 4s) e favicons rasterizados da mesma geometria vetorial.
- Metricas do lockup herdadas do pacote ITC NoteScan (texto em x=72, ITC 12/600 tracking 5,04 baseline 19, RouteMap Archivo 800/40 tracking -1 baseline 59); largura do viewBox 275,42 medida na Archivo ExtraBold real.
- `ITC RouteMap v2.dc.html`: raio de 10px em botoes/inputs/selects (o `--radius` de `app/globals.css`), selects nativos trocados por trigger + listbox no padrao de `components/ui/select.tsx`, sidebar seguindo o tema (tokens `--rail-*`) e o `ColorPicker` original restaurado (picker nativo + hex monoespacado + botao Sugerir, com o texto de ajuda verbatim de `components/color-picker.tsx`).
- Redesenho completo das telas em `ITC RouteMap v2.dc.html`: rail de ícones à esquerda (92px, ink) no lugar da topbar, liberando a largura do topo para o contexto da operação.
- Mapa real (Leaflet + OpenStreetMap, `itc-map.js`) como elemento principal do Resultado — pares plotados a partir das coordenadas de `PARES`, linha origem→destino na cor do técnico, destino etiquetado na cor do projeto; o par expandido no card acende no mapa.
- Início reorganizado em "Rodando agora" + "Números da semana", com gráfico de barras de tempo médio e barras de alocação por projeto.
- Superfícies com régua teal de 2px no topo de cada painel; Login em duas colunas (painel ink com o logo oficial + formulário sobre off-white).
- Toda a lógica do repositório preservada: seleção de técnicos/UMs, contagens e aviso de divergência, re-otimização, cálculo com estado de loading, troca de modo por par, ajuste manual, sobras, toast de confirmação e alternância de tema.
- Sete telas restantes construídas a partir do código: Histórico, Detalhe do lote, Estatísticas e Administração em quatro abas.
- Diálogos portados dos componentes reais, com títulos, descrições, campos e textos de ajuda verbatim: ProjetoFormDialog (nome, sigla, cor, e o bloco de integração Google Sheets — URL da planilha, abas a sincronizar, aviso do Service Account), UMFormDialog (nome, projeto vinculado, cor), TecnicoFormDialog (nome, cor, Plus Code com o botão "Obter Coordenadas", endereço, ponto de referência, modo principal), EditarPontoDialog (status, RA/UF, endereço, referência, Plus Code somente-leitura, link do Maps, lat/lng e o aviso de sobrescrita na sincronização), CancelarLoteDialog (bullets de impacto, "Voltar"/"Cancelar lote", desabilitado quando o lote não tem rota confirmada), ConfirmDeleteDialog e o AlertDialog de pausar técnico.
- Localidades tem a coluna Ações de tabela-pontos.tsx: link para o Google Maps por coordenada e botão Editar abrindo o EditarPontoDialog.
- Técnicos é accordion, não tabela, como em admin/tecnicos/page.tsx: endereço, ponto de referência, Plus Code, coordenadas, e ações Editar / Pausar–Reativar / Deletar. Pausar altera o estado de fato e reflete na seleção de Calcular Rotas.
- Estatísticas é derivada das rotas confirmadas dos lotes (ranking de técnicos, UMs por frequência, distribuição por modo), não tabelada à mão.

## Screen map
| Tela do protótipo | Arquivos do repositório |
|---|---|
| Login | app/login/page.tsx, app/globals.css |
| Início (dashboard) | app/(privado)/page.tsx, app/(privado)/layout.tsx |
| Rail de navegação / tema | components/layout/navbar.tsx, components/theme-toggle.tsx |
| Calcular Rotas (seleção, loading, aviso de re-otimização) | app/(privado)/calcular-rotas/page.tsx |
| Resultado da alocação (mapa, pares, métricas, sobras, editar par) | app/(privado)/calcular-rotas/_components/resultado-alocacao.tsx, .../alocacao-helpers.tsx |
| Histórico (filtros, stats, cards de lote) | app/(privado)/historico/page.tsx, .../_components/card-lote.tsx, .../filtros-historico.tsx, .../historico-formatters.ts |
| Detalhe do lote | app/(privado)/historico/[loteId]/page.tsx (estrutura levantada por busca: métricas, justificativa, explicação algorítmica por rota, copiar para WhatsApp) + .../_components/cancelar-lote-dialog.tsx |
| Estatísticas | app/(privado)/estatisticas/page.tsx |
| Admin · Localidades | .../admin/localidades/_components/tabela-pontos.tsx + .../editar-ponto-dialog.tsx — a page.tsx, com barra de filtros e sincronismo, ainda não foi lida: a tela cobre a tabela e a edição de ponto, não os filtros |
| Admin · Projetos | app/(privado)/admin/projetos/page.tsx, components/projetos/projeto-form-dialog.tsx |
| Admin · Unidades Móveis | app/(privado)/admin/ums/page.tsx, components/ums/um-form-dialog.tsx |
| Admin · Técnicos | app/(privado)/admin/tecnicos/page.tsx, components/tecnicos/tecnico-form-dialog.tsx |
| Avatar de técnico / cores do banco | components/tecnico-avatar.tsx, lib/firestore/ras.ts |
| Seletor de cor dos formulários | components/color-picker.tsx |
| Select / raio dos controles | components/ui/select.tsx, app/globals.css (--radius 0.625rem) |
| Identidade visual (`exports/`) | referência de métricas: notescan-lockup-horizontal-color.svg (enviado pelo usuário) |
| Modos de transporte | lib/modos-transporte.tsx |

## Sync history
- 2026-08-07T14:32:00Z — redesenho completo das onze telas em `ITC RouteMap v2.dc.html` (rail de ícones, mapa Leaflet no Resultado, diálogos e campos portados verbatim dos componentes reais).
- 2026-08-06T22:26:28Z — primeira referência visual (Login, Início, Calcular Rotas, Resultado) sob o padrão ITC, tokens claro/escuro e logos oficiais.

## Dados de demonstração
Os cinco lotes, os oito pontos de Localidades, os nomes por extenso dos projetos e o ponto de referência / Plus Code dos técnicos são fictícios — o repositório entrega esses registros pelo Firestore em runtime. As agregações em cima deles seguem o código: statusLote derivado das rotas, modo predominante por contagem, formatarDuracao e formatarDistancia portadas de historico-formatters.ts.
