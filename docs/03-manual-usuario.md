# 03 — Manual do Usuário

Este manual é voltado para o coordenador que opera o sistema no dia a dia. Não é necessário conhecimento técnico.

---

## Acesso ao sistema

1. Abra o navegador e acesse o endereço fornecido pelo time de TI (ex.: `https://itc-routemap.vercel.app`)
2. Digite seu e-mail e senha cadastrados
3. Clique em **Entrar**

> Se não tiver credenciais, solicite ao administrador do sistema.

---

## Calculando uma alocação

Este é o fluxo principal do sistema.

### Passo 1 — Acesse "Calcular Rotas"

No menu lateral, clique em **Calcular Rotas** ou use o botão de acesso rápido na tela inicial.

### Passo 2 — Selecione os técnicos

A lista exibe todos os técnicos **ativos** com localização cadastrada. Técnicos pausados não aparecem.

- Clique em cada técnico para selecioná-lo (checkbox fica marcado)
- Use o botão **Todos** para selecionar todos de uma vez
- Use **Limpar** para desmarcar tudo

> Técnicos sem coordenadas GPS cadastradas não aparecem na lista — cadastre o endereço completo na tela de Administração.

### Passo 3 — Selecione as UMs

A lista exibe todos os pontos com status **Pendente**. Cada card mostra o nome da UM, o projeto e o endereço.

- Clique nos cards para selecionar as UMs desejadas
- Você pode selecionar todas as pendentes ou um subconjunto

### Passo 4 — Calcule a alocação

Clique no botão **Calcular Alocação**. O sistema irá:

1. Consultar o Google Maps para medir os tempos reais de deslocamento
2. Calcular a distribuição ótima via algoritmo de otimização
3. Gerar uma justificativa em linguagem natural via IA (Gemini)

O cálculo leva entre 5 e 30 segundos dependendo do número de pares.

> Se o número de técnicos × UMs exceder 625, o sistema exibirá um aviso e bloqueará o cálculo. Divida em lotes menores.

### Passo 5 — Revise o resultado

A tela de resultado exibe:

- **Tabela de alocações**: cada linha mostra técnico → UM com modo de transporte e tempo estimado
- **Mapa interativo**: visualiza origens (casa dos técnicos) e destinos (UMs) com as rotas
- **Justificativa da IA**: explicação em linguagem natural do critério de distribuição
- **Seletor de modo**: troque entre visualizações DRIVE / TWO_WHEELER / WALK / TRANSIT

#### Fazendo um swap manual

Se quiser trocar a atribuição entre dois técnicos:

1. Clique no ícone de troca (⇄) em uma das linhas da tabela
2. O sistema listará os outros técnicos disponíveis para trocar
3. Selecione o técnico desejado
4. O sistema recalcula as métricas dos dois pares automaticamente

Após um swap, o badge **Ajuste manual** fica visível no histórico.

### Passo 6 — Confirme a alocação

Quando estiver satisfeito com a distribuição:

1. Clique em **Confirmar Alocação**
2. Uma barra de progresso aparece enquanto o sistema salva no banco de dados
3. Após confirmação, você é redirecionado para a tela de Localidades

> A confirmação é atômica — ou todas as rotas são salvas, ou nenhuma.

---

## Re-otimização inteligente

Após confirmar uma alocação, se o sistema detectar que há oportunidade de melhorar significativamente as rotas (>5 minutos de ganho), um banner aparecerá com uma proposta de re-otimização.

- Clique em **Ver proposta** para ver a nova distribuição sugerida
- Clique em **Aplicar Re-otimização** para substituir as rotas atuais pelas otimizadas
- As rotas antigas são canceladas atomicamente e as novas são criadas

---

## Consultando o histórico

No menu lateral, clique em **Histórico**. A tela exibe todos os lotes confirmados, do mais recente ao mais antigo.

### Filtros disponíveis

- **Período**: selecione um intervalo de datas
- **Técnico**: filtre por nome
- **Status**: Confirmada, Cancelada ou Todos
- **Projeto**: filtre por sigla do projeto

### Detalhe de um lote

Clique em um lote para ver o detalhe. A tela mostra:

- Todas as rotas do lote com técnico, UM, modo, tempo e distância
- Mapa com todas as rotas do lote
- Justificativa da IA
- Badge de **Ajuste manual** nas rotas que foram trocadas manualmente
- Badge de **Re-otimização** nas rotas que vieram de uma re-otimização

### Cancelando um lote

Na tela de detalhe, clique em **Cancelar lote**. Isso:

1. Muda o status de todas as rotas do lote para `Cancelada`
2. Retorna todos os pontos (UMs) para o status `Pendente`

> O cancelamento é irreversível via interface. Rotas canceladas ficam no histórico para auditoria.

---

## Administração

### Gerenciando técnicos

Acesse **Admin > Técnicos**.

**Cadastrar novo técnico:**
1. Clique em **Cadastrar Técnico**
2. Preencha nome, cor, endereço e ponto de referência
3. Informe o Plus Code (obtido no Google Maps) para geocodificação precisa
4. Escolha o modo de transporte principal do técnico
5. Clique em **Salvar**

**Pausar um técnico:**

Quando um técnico estiver de férias ou afastado:
1. Expanda o card do técnico
2. Clique em **Pausar**
3. Confirme no diálogo de confirmação

O técnico pausado não aparecerá na lista de seleção ao calcular rotas. Rotas já confirmadas não são afetadas.

**Reativar um técnico:**
1. Expanda o card do técnico pausado (indicado com badge "Pausado")
2. Clique em **Reativar**

**Editar técnico:**

Clique em **Editar** no card expandido do técnico e altere os campos desejados.

**Deletar técnico:**

Clique em **Deletar** no card expandido. Esta ação **não pode ser desfeita**. Rotas vinculadas ao técnico permanecerão no histórico sem técnico associado.

### Gerenciando projetos

Acesse **Admin > Projetos**. Você pode criar, editar e deletar projetos. Cada projeto tem nome, sigla e cor.

### Gerenciando localidades (UMs)

Acesse **Admin > Localidades**.

**Sincronizar da planilha Google Sheets:**
1. Certifique-se de que a planilha está compartilhada com a conta de serviço exibida na tela
2. Cole a URL da planilha no campo indicado
3. Clique em **Sincronizar**

O sistema importa as UMs da planilha, geocodifica os endereços via Google Maps e atualiza o Firestore.

---

## Dashboard (tela inicial)

A tela inicial exibe:

| KPI | O que significa |
|-----|----------------|
| Pontos pendentes | UMs aguardando alocação |
| Pontos agendados | UMs com rota confirmada |
| Técnicos disponíveis | Com localização cadastrada e não pausados |
| Rotas confirmadas hoje | Alocações feitas no dia atual |
| Alocações no mês | Total de rotas confirmadas no mês corrente |
| Tempo médio | Média de deslocamento das rotas do mês |

O **Cronograma de hoje** lista todas as rotas confirmadas no dia atual em formato de tabela compacta.

---

## Estatísticas

Acesse **Estatísticas** no menu. A tela exibe:

- **Ranking de técnicos**: quem realizou mais alocações no período
- **UMs por frequência**: quais localidades foram mais alocadas
- **Distribuição por modo**: percentual de uso de cada modo de transporte
