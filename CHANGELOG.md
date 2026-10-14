# Changelog

Este arquivo registra todas as alterações notáveis feitas no projeto **PersonalControl**. O formato é baseado no [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e este projeto adere ao [Versionamento Semântico](https://semver.org/spec/v2.0.0-rc.2.html).

## [Unreleased]

### Alterado
- **Performance do Minhas Finanças (MF)**: com 13,7 mil lançamentos, cada ação recarregava a tabela inteira 3× (~15 MB). Agora: (1) resumo do mês agregado no servidor (RPC `mf_month_summary`, ~100 linhas); (2) extrato geral agregado no servidor (RPC `mf_statement`: grupos + abertura + saldo corrente); (3) extrato de uma conta, drill-down, tela de cartões, faturas do cartão e modal de lançamento baixam só as contas envolvidas no servidor (`or` por origem/destino — de ~13 mil linhas para centenas, mês ~275 linhas); (4) invalidação pós-mutação restrita às queries `mf-*`. RPCs verificadas nos dados reais (0 divergências) com fallback local/Dexie intacto. Cálculos client-side intactos.

### Adicionado
- **Autocomplete do histórico na descrição (MF)**: ao digitar 2+ letras na criação de um lançamento aparece uma lista (setas ↑/↓, Enter ou clique) com descrições já usadas do mesmo tipo — escolher preenche **descrição, categoria e as tags** do lançamento original, **sem copiar o valor** (como no Minhas Finanças original). A busca ignora acentos e caixa (ex.: "mi" encontra "Mídia"). Fonte: cache de `useMFAllTransactions` (sem request extra); ícone/avatar da categoria em cada sugestão.
- **Aviso de atualização no Extrato (MF)**: ao criar/editar um lançamento o Extrato recarregava em silêncio (só `isLoading` inicial mostrava algo); agora o `isFetching` em segundo plano transforma o ícone do cabeçalho num spinner (com tooltip, i18n pt/en/es) sem esconder a lista.
- **Botão Editar nos grupos da tela de Contas (MF)**: o cabeçalho de cada grupo ganhou lápis (`mf-group-edit-*`) abrindo o `MFGroupModal` em modo edição (nome, ícone, contas, flags) — antes só dava para criar grupo, nunca editar.
- **Reordenar contas (MF)**: toggle "Reordenar" na toolbar da Contas troca as ações por ↑/↓ (`mf-move-up/down-*`), que trocam o `sort_order` com o vizinho — a mesma ordem vale no Resumo e em todo lugar (todas as listas ordenam por `sort_order`).
- **Mais ícones em categorias (MF)**: +16 emojis de oficina/serviços (🧑‍🔧 mecânico, 💈 barbearia, 💇 cabeleireiro, 🧯 extintor, 🧤 luvas, 🪣 balde, ⛏️ picareta, 🪓 machado, 🧲 ímã, 🚧 obra, 🌬️ ventilador/AR, ❄️ refrigeração, 🖥️ informática, 🔦 lanterna, 📡 antena, 🛜 wifi) com busca em pt; 🔌 ganhou "eletricista".
- **Marcas de marketplace como ícone (MF)**: Amazon, Shopee, Mercado Livre, AliExpress, Shein e Magalu (`brand:<chave>`, SVG monograma em `public/mf-brands`), escolhíveis em categorias, contas e grupos.

### Corrigido
- **Espelho de fatura só no mês vigente (MF)**: despesas com data futura (parcelas de nov/dez/jan) ficavam fora da janela do agendador e as faturas futuras nunca ganhavam a cobrança agendada; `buildCardInvoices` ganhou `includeFutureBound` (efeito só no agendador — telas inalteradas) e os meses futuros passam a ter o pagamento espelhado no vencimento.
- **"Ignorar nos totais" valendo nos lugares errados (MF)**: a regra agora é — a conta ignorada **continua somando nos totais de grupo** (cabeçalhos da Contas, cards e drill de grupo no Resumo, rodapé da tabela) e **sai somente dos cards de KPI** (somas e contagens de Saldo/Recebido/Gasto/Previsto, mais a variação e os gráficos que seguem o mesmo universo). Antes os grupos a excluíam (ex.: grupo C6 Bank somando R$ 0,21 sem o CDB de R$ 16.602,50).

## [1.7.3] - 2026-10-13

### Adicionado
- **Módulo Minhas Finanças** (branch `feat/minhas-financas`, sem push):
  - Resumo, Contas, Cartões, Transações, Extrato, Orçamentos, Relatórios, Importação OFX/CSV, Felix e modo offline-first; i18n pt/en/es.
- **Pagamento de fatura automático (MF)**: cartão com conta vinculada ganha uma despesa-espelho pelo valor da fatura (`notes` "Agendado automaticamente (fatura)"), criada no vencimento (PENDENTE) ou, se já vencida, PAGO **na data do vencimento**; sincronizada a cada mudança da fatura (o valor muda até o fechamento e o fechamento também pode mudar) e promovida a PAGO quando o vencimento passa — fatura vencida nunca fica sem pagar. Agendador `useMFScheduleCardPayments` só grava no escopo de perfis visível; Reabrir limpa o marcador e a linha vira sua.
- **Calculadora no valor** (MF): clicar no valor do modal Detalhes abre uma calculadora (C, %, ⌫, ÷ × − +, 00 0 , ✓) e o ✓ altera o valor — em série o escopo (só esta / esta e próximas / todas) é perguntado depois; botão de calculadora ao lado do campo Valor na criação de lançamento e no modal de transferência.
- **Tela de Contas redesenhada (MF)**: 3 cards de KPI (Saldo, Movimento do mês com o mês corrente, Previsão) com chips de contagem; toolbar única (busca, Arquivadas, Agrupadas, moeda, mês, Transferir, Novo grupo, Nova conta); tabela de 8 colunas com **Transf. líquida** (crédito − débito); cabeçalhos de grupo com trilho colorido (`group.color` ou hash do id) e subtotais por coluna; nome da conta em 2 linhas (avatar + chips tipo/moeda); botão "Ver extrato" por conta e rodapé com Total (contas/grupos).
- **Filtro de contas no modal de grupo (MF)**: busca no modal Criar/editar grupo (`mf-group-accounts-search`), ações em massa "Selecionar visíveis"/"Limpar" sobre o resultado filtrado, contador de selecionadas e estado de "sem resultados"; lista com scroll.
- **FAB global "+" com "Nova conta" (MF)**: o menu flutuante ganhou a 5ª opção (conta primeiro); o FAB duplicado da tela de Contas saiu; o pedido de nova conta vira uma flag em memória (`requestNewAccount`) que a tela de Contas atende no mount ou pelo evento `mf-new-account` — fica **pendente até o modal fechar** (sobrevive aos remounts do Dashboard) e é descartado ao trocar de aba.
- **Tabela de Contas sem scroll lateral + tooltips (MF)**: colunas com largura fixa (`tableLayout: fixed`, sem `min-width`, tabela com `max-width: 1320` centrada), células compactas e nome da conta com quebra de linha — os 4 botões de ação (Ver extrato, Arquivar, Editar, Excluir) cabem na tela numa linha só; todos ganharam `title` (tooltip nativo) além do `aria-label`, incluindo a sanfona dos grupos.
- **Ícones de oficina e conserto (MF)**: 16 emojis novos nas categorias (⚙️ 🔩 🪛 🛠️ 🔨 🪚 🛞 🛢️ 🔑 🔒 🪡 🔌 🚘 🧱 🪜 🚰) com palavras-chave pt (+cognatos es/en) — "oficina", "fenda", "pneu", "chaveiro", "parafuso", "torneira" etc.; 🔧/🧰/🚗 ganharam "oficina/mecanico" nas keywords.

### Alterado
- **Modelo de fatura de cartão**: despesa pertence à fatura escolhida (data é só rótulo, default = fatura do mês); "Fatura corrente" = fatura do mês calendário (rotulada pelo vencimento, pode estar PAGA); detalhe mostra Fechamento + Vencimento; pagamento vira DESPESA na conta vinculada, sem transação no cartão; cartão sem bloco de saldo/transferências na movimentação, extrato e timeline.
- **Detalhes do lançamento + antecipação de cartão**: clique na despesa abre o modal Detalhes (resumo, edição rápida com criar tag, toggle Pendente, menu ⋮ com 9 ações e escopo de série) em qualquer transação (Transações, timeline, fatura, Extrato); Duplicar vira submenu só em despesa (como cartão/transferência/compensação); transferência mostra de→para; antecipar move N parcelas à fatura destino com shift reverso e estorno separado do desconto (só se parcelada).
- **Busca com X para limpar**: cronologia, tela de categorias, seletor de categoria, busca de ícone do modal, Transações e Contas ganham o botão × ao lado do campo de busca.
- **Mais ícones de categoria**: emojis novos (calça 👖, bermuda 🩳, terno 🤵, família 👪👨‍👩‍👧‍👦👨‍👩‍👦👩‍👧‍👦👨‍👧‍👦 e outros) com palavras-chave em pt/en/es; glifos máq. de lavar e geladeira; e **marcas de banco** (SVGs de `public/mf-brands`) agora podem ser escolhidas como ícone de categoria (gravado como `brand:<chave>`, render pelo `MFAccountIcon`).
- **Resumo do Detalhes**: linha de Tags com chips e Categoria/Subcategoria como pílulas coloridas; cabeçalho do dia da cronologia com data completa ("13/08/26 • quinta-feira"); filhas mensais de série de cartão ancoram na fatura da cabeça + N.
- **Anti-duplicada**: criar série fixa/parcelada/repetida com mesmo nome no mês pede confirmação.
- **Fatura "Agendada" e Reabrir sem exclusão (MF)**: fatura coberta só por pagamento pendente mostra o status **Agendada** (não "Paga") no widget e no detalhe, com "Pagar fatura" sempre à mão (valor = em aberto + agendado) e a confirmação reusando a despesa pendente existente — um único débito por fatura; **Reabrir fatura** não exclui mais nada: vira o vínculo PAGO→PENDENTE com o valor atual da fatura e limpa o marcador automático.

### Removido
- **Pasta `docs/Extratos/` do repositório**: extratos e exportações (xlsx/csv/html) + scripts locais de migração saíram do git (`git rm --cached`, arquivos locais preservados) e a pasta entrou no `.gitignore`.

### Corrigido
- **Flake do E2E "pagamento de fatura" (MF)**: ao trocar de aba o Dashboard remonta o módulo (`key={activeTab + refreshKey}`) e o agendador reavaliava o plano com o cache ainda sem o espelho (invalidação adiada 750 ms), duplicando o agendamento — o pagamento parcial atualizava só um dos espelhos e o EM ABERTO zerava (~50% das execuções). Correções: guard por `invoice_close` (60 s) no agendador, `usePayCardInvoice` apaga espelhos automáticos duplicados da mesma fatura ao pagar e `planInvoicePaymentSync` apaga o espelho quando existe pagamento manual junto (corrida agendador × usuário).

## [1.7.1] - 2026-07-17