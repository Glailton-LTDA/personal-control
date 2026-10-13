# Changelog

Este arquivo registra todas as alterações notáveis feitas no projeto **PersonalControl**. O formato é baseado no [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e este projeto adere ao [Versionamento Semântico](https://semver.org/spec/v2.0.0-rc.2.html).

## [Unreleased]

### Adicionado
- **Módulo Minhas Finanças** (branch `feat/minhas-financas`, sem push):
  - Resumo, Contas, Cartões, Transações, Extrato, Orçamentos, Relatórios, Importação OFX/CSV, Felix e modo offline-first; i18n pt/en/es.
- **Pagamento de fatura automático (MF)**: cartão com conta vinculada ganha uma despesa-espelho pelo valor da fatura (`notes` "Agendado automaticamente (fatura)"), criada no vencimento (PENDENTE) ou, se já vencida, PAGO **na data do vencimento**; sincronizada a cada mudança da fatura (o valor muda até o fechamento e o fechamento também pode mudar) e promovida a PAGO quando o vencimento passa — fatura vencida nunca fica sem pagar. Agendador `useMFScheduleCardPayments` só grava no escopo de perfis visível; Reabrir limpa o marcador e a linha vira sua.
- **Calculadora no valor** (MF): clicar no valor do modal Detalhes abre uma calculadora (C, %, ⌫, ÷ × − +, 00 0 , ✓) e o ✓ altera o valor — em série o escopo (só esta / esta e próximas / todas) é perguntado depois; botão de calculadora ao lado do campo Valor na criação de lançamento e no modal de transferência.

### Alterado
- **Modelo de fatura de cartão**: despesa pertence à fatura escolhida (data é só rótulo, default = fatura do mês); "Fatura corrente" = fatura do mês calendário (rotulada pelo vencimento, pode estar PAGA); detalhe mostra Fechamento + Vencimento; pagamento vira DESPESA na conta vinculada, sem transação no cartão; cartão sem bloco de saldo/transferências na movimentação, extrato e timeline.
- **Detalhes do lançamento + antecipação de cartão**: clique na despesa abre o modal Detalhes (resumo, edição rápida com criar tag, toggle Pendente, menu ⋮ com 9 ações e escopo de série) em qualquer transação (Transações, timeline, fatura, Extrato); Duplicar vira submenu só em despesa (como cartão/transferência/compensação); transferência mostra de→para; antecipar move N parcelas à fatura destino com shift reverso e estorno separado do desconto (só se parcelada).
- **Busca com X para limpar**: cronologia, tela de categorias, seletor de categoria, busca de ícone do modal, Transações e Contas ganham o botão × ao lado do campo de busca.
- **Mais ícones de categoria**: emojis novos (calça 👖, bermuda 🩳, terno 🤵, família 👪👨‍👩‍👧‍👦👨‍👩‍👦👩‍👧‍👦👨‍👧‍👦 e outros) com palavras-chave em pt/en/es; glifos máq. de lavar e geladeira; e **marcas de banco** (SVGs de `public/mf-brands`) agora podem ser escolhidas como ícone de categoria (gravado como `brand:<chave>`, render pelo `MFAccountIcon`).
- **Resumo do Detalhes**: linha de Tags com chips e Categoria/Subcategoria como pílulas coloridas; cabeçalho do dia da cronologia com data completa ("13/08/26 • quinta-feira"); filhas mensais de série de cartão ancoram na fatura da cabeça + N.
- **Anti-duplicada**: criar série fixa/parcelada/repetida com mesmo nome no mês pede confirmação.
- **Fatura "Agendada" e Reabrir sem exclusão (MF)**: fatura coberta só por pagamento pendente mostra o status **Agendada** (não "Paga") no widget e no detalhe, com "Pagar fatura" sempre à mão (valor = em aberto + agendado) e a confirmação reusando a despesa pendente existente — um único débito por fatura; **Reabrir fatura** não exclui mais nada: vira o vínculo PAGO→PENDENTE com o valor atual da fatura e limpa o marcador automático.

## [1.7.1] - 2026-07-17

### Adicionado
- **Swipe Refresh para PWA Standalone**:
  - Implementação de pull-to-refresh customizado em `PullToRefresh.jsx` para modos standalone.
  - Captura de gestos tácteis e rotação acelerada por GPU integrada às variáveis de cores do tema do aplicativo.

### Alterado
- **Ícone do Aplicativo e Favicon Multiplataforma**:
  - Atualização do favicon principal para usar o novo PNG do Luminous Ledger (`favicon.png`) para compatibilidade e nitidez multiplataforma (Chrome, Firefox, Safari, Edge).
  - Adição da tag `apple-touch-icon` e de tags meta iOS standalone no `index.html`.
  - Criação do manifesto PWA (`manifest.json`) com os metadados do aplicativo e ícones de 1024x1024.

## [1.7.0] - 2026-06-17

### Corrigido
- **Navegação de Setlists**:
  - Botão de voltar (ChevronLeft) redireciona condicionalmente à rota correta (`music-setlists` ou `music-repertoire`).
  - Subtabs persistem no `sessionStorage` via `useSessionState` e não são apagadas ao abrir uma música.
- **Rolagem Dupla (Scroll-within-Scroll)**:
  - `Dashboard.jsx`: travado o scroll do `<main>` com `overflowY: hidden` e `display: flex` para as abas de trips, investments e music.
  - `TripsList.jsx`: estrutura flexível incondicional nos contêineres, remoção de `maxHeight` na lista virtualizada e `paddingBottom: 80px` no mobile para o FAB.
  - `TripsItinerary.jsx`: layout flexível no grid de colunas, remoção de `maxHeight` da barra lateral e scroll interno independente nos detalhes.
  - `InvestmentList.jsx`: layout flexível incondicional, remoção de `maxHeight` da tabela virtualizada e `paddingBottom: 80px` no mobile.
  - `Trips.jsx` e `Investments.jsx`: estilo flex no elemento raiz para esticar verticalmente.

## [1.6.0] - 2026-06-11

### Adicionado
- **Arquitetura Offline-First (Módulo de Viagens)**:
  - Migração de todo o fluxo de Viagens, Despesas, Itinerários, Checklists e Compartilhamento para o banco Dexie local (IndexedDB v4).
  - Refatoração modular do `SyncEngine` suportando provedores registráveis (`MusicSyncProvider` e `TripsSyncProvider`).
  - Sincronização incremental e mesclagem resiliente no Dexie preservando dados locais frente a retornos parciais da API.
- **Resiliência e Estabilização da Suíte de Testes**:
  - Resolução de deadlocks de +1min do Vitest sob Happy-DOM inibindo o auto-reload do Dexie em ambiente de testes.
  - Saneamento de conexões IndexedDB pendentes eliminando erros de `DatabaseClosedError`.
  - Mocks dinâmicos e stateful com suporte a arrays de payload e roteamento Playwright para testes E2E.
- **Mapeamento Remoto de Artistas**:
  - Busca direta no Supabase para filtragem de letras e buscas de artistas únicos quando online com fallback local offline.

## [1.5.0] - 2026-06-11

### Adicionado
- **Arquitetura Offline-First (Módulo de Música)**:
  - Integração robusta com Dexie (IndexedDB) para persistência e disponibilidade offline local.
  - Sincronização automática em background com Supabase via `SyncEngine` com limites seguros de reprocessamento (`attempts`).
  - Fallback automático e transparente de busca local via `fetchSongsFromDexie` em caso de falha de conexão ou offline.
  - Geração de UUIDs definitivos no cliente com `generateUUID` eliminando chaves temporárias e duplicados de sincronização.
  - Mapeamento dinâmico local de gêneros musicais no Dexie (joins em memória).

## [1.4.0] - 2026-06-07

### Adicionado
- **Módulo de Investimentos**:
  - Suporte multimoeda nos Ajustes de Conta com o componente `CurrencySelector` e badges de bandeiras.
  - Filtragem e formatação dinâmica baseada na moeda ativa no dashboard e na planilha.
  - Auto-preenchimento automático do "Saldo Inicial" recuperando o "Saldo Final" do mês anterior.
- **Módulo de Música**:
  - Modo Tela Cheia (Full Screen) em `CifraViewer` e `SheetViewer` com atalho `Escape` para fechar.
  - Sincronização da rolagem automática em mobile/tablet no modo tela cheia via `mobileScrollRef`.
- **Testes**:
  - Testes unitários para modo tela cheia nos visualizadores de música.
  - Testes E2E (Playwright) para validação do fluxo de tela cheia e fluxo de auto-preenchimento de saldo em investimentos.

## [1.3.0] - 2026-06-06

### Adicionado
- **Módulo de Música**:
  - Rolagem automática (Auto-Scroll) no visualizador de partituras e cifras.
  - Transpositor de tons dinâmico para acordes de texto cifrado.
  - Movimentação por drag-and-drop de anotações salvas (realces e textos) no visualizador de partituras.
- **Listas Personalizadas**:
  - Editor/leitor de anotações Markdown integrado (estilo Simplenote).

### Alterado
- **Arquitetura**:
  - Migração de estado assíncrono para React Query (`@tanstack/react-query`).
  - Virtualização de linhas em `FinanceList`, `InvestmentList` e `TripsList` usando `@tanstack/react-virtual`.
