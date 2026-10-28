# Changelog

Este arquivo registra todas as alterações notáveis feitas no projeto **PersonalControl**. O formato é baseado no [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e este projeto adere ao [Versionamento Semântico](https://semver.org/spec/v2.0.0-rc.2.html).

## [Unreleased]

## [1.23.0] - 2026-10-27

### Adicionado
- **Seletor de tags com um campo só**: digitar filtra as tags existentes e, quando o nome não existe, aparece **“Criar a tag <nome>”** — cria na hora com cor automática, já marca no lançamento e entra no cache. Vale para a tela de lançamento e para a edição rápida dos Detalhes, no web e no mobile.
- **Tags no Resumo**: o feed de lançamentos recentes agora mostra o badge **“Categoria › Subcategoria”** e os **chips das tags** de cada lançamento (a lista de tags vem do cache; só os vínculos dos 10 recentes são consultados).
- **Lançamentos da tag em modal paginado**: o “olho” da tag abre um modal com **busca por descrição** e **20 lançamentos por página**, consultados direto no servidor (`mf_transaction_tags` com embed em `mf_transactions`, `count` exato) — o histórico inteiro não é mais carregado/empilhado dentro do card de Ajustes.

### Alterado
- **Modal de tag (Ajustes → Tags)**: cabeçalho com título/fechar, corpo rolável, paleta com **prévia do chip** e rodapé fixo **Cancelar/Salvar** — a paleta não fica mais cortada. No mobile vira **bottom sheet**. O modal (e o de categoria) é renderizado em **portal**, como os demais do app, então não fica preso/recortado dentro do card de Ajustes.

## [1.22.0] - 2026-10-27

### Adicionado
- **Categoria e subcategoria em um seletor**: o seletor em árvore do lançamento ganhou **“+ Nova categoria”** e um **“+” em cada categoria** para criar subcategoria, abrindo o formulário completo (nome, cor e ícone) com pai e tipo pré-preenchidos; a criada já entra selecionada. O detalhe do lançamento agora mostra **“Categoria › Subcategoria”** numa linha só.
- **Ícones agrupados por família**: o seletor de ícone da categoria agrupa os glifos em **Finanças**, **Casa e vida**, **Transporte e viagem**, **Trabalho e estudos**, **Família e pessoas**, **Compras e presentes** e **Saúde**; a busca continua funcionando e mostra os resultados sem os cabeçalhos.
- O gatilho do seletor mostra o caminho completo quando a subcategoria está escolhida (ex.: “Alimentação › Supermercado”).

## [1.21.0] - 2026-10-27

### Corrigido
- **Felix 502 (Gemini)**: o modelo era fixo em `gemini-3.6-flash`. Agora o padrão é o alias **`gemini-flash-latest`** (sempre o Flash atual), configurável pela secret **`GEMINI_MODEL`**, com fallback automático para `gemini-2.5-flash` e `gemini-2.0-flash` quando o modelo configurado responde 404 (descontinuado/renomeado). Erros de chave/cota não tentam outro modelo.
- **Mensagem de erro do Felix**: a Edge Function devolve `code` (`auth`/`model`/`quota`) e um detalhe curto do Gemini; o chat mostra “modelo indisponível”, “chave recusada” ou “limite atingido” em vez de um erro genérico, e o log da função mantém o corpo completo para diagnóstico.

## [1.20.0] - 2026-10-26

### Adicionado
- **Exportar CSV na aba Importar/Exportar**: baixa os lançamentos do período (padrão = mês atual, com intervalo de/até) em CSV, com filtros de conta, tipo e status. Reaproveita a geração dos Relatórios: data ISO, valor numérico com vírgula e conta/categoria por nome. Sem lançamentos no período, avisa em vez de baixar um arquivo vazio.
- **Filtros do export**: **Tipo de lançamento**, **Tipo de conta** (tipos padrão e personalizados, com ícone e grupos) e conta no formato **"Nome · Tipo"** (ex.: "Nubank · Cartão"), com o **ícone da conta** (a **bandeira** quando é cartão) e a moeda — assim contas com o mesmo nome não se confundem. Os dropdowns usam o layout com busca e grupos do módulo; a conta de destino da importação segue o mesmo padrão.

### Alterado
- **Ordem das abas do Minhas Finanças**: Resumo · Contas · Cartões · Relatórios · Objetivos · Orçamentos · Importar/Exportar · Felix · Lançamentos · Extrato · Ajustes.
- A aba de importação passa a se chamar **Importar/Exportar** (pt/en/es); o filtro antes chamado só de "Tipo" virou **Tipo de lançamento**.

### Corrigido
- **Bandeira do cartão**: valores gravados com capitalização do banco (ex.: "Mastercard") exibiam a chave crua `MINHASFINANCAS.CARD_BRAND_MASTERCARD` no card; o rótulo e o ícone agora normalizam a caixa.

## [1.19.0] - 2026-10-26

### Adicionado
- **Integração com Investimentos (rendimento)**: o bloco "Integrar com outros módulos" ganha a opção **Registrar rendimento no investimento**, com seletor de contas agrupado por instituição e lembrança da última usada. Receita soma no rendimento e despesa subtrai (rendimento negativo); parcelado lança **um único ajuste com o valor total**.
- **Registro do mês**: se já existe registro da conta no mês, atualiza `yield` e `final_balance`; se não existe, cria com `initial_balance` = fechamento do registro anterior, mantendo **SI + rendimento = SF**.
- **Editar e excluir acompanham o vínculo**: alterar valor/data/conta desfaz o delta antigo e aplica o novo; excluir o lançamento desfaz o efeito e apaga o registro quando ele foi criado pela integração e ficou sem efeito (só se for o último da série, para não quebrar a corrente dos meses seguintes).
- **Migration `20261026000000_mf_tx_links_investment.sql`**: RPC `mf_save_tx_linked` passa a gravar o rendimento, trigger de limpeza desfaz o investimento e **índice único (conta de investimento, mês)** impede registros duplicados.
- **Bloqueios**: cartão não integra investimento; só contas de investimento **na mesma moeda** da conta do lançamento aparecem (sem conversão); receita continua indisponível para viagem.

### Alterado
- Mensagens de bloqueio do bloco ficaram neutras (valem para viagem e investimento); o motivo é exibido em cada opção.

### Corrigido
- **Duplicatas de rendimento**: limpeza dos 3 registros duplicados em produção (CDB C6 em 01 e 02/2025, Tesouro Direto em 05/2026) e índice único para impedir novos.

## [1.18.0] - 2026-10-25

### Adicionado
- **Integração com Viagens (gasto espelho)**: a tela de lançamento ganha o bloco **Integrar com outros módulos**. Ao marcar "Registrar gasto na viagem" e escolher a viagem, o lançamento cria também o gasto em Viagens com a mesma data, descrição e valor; no cartão, a data é a da compra (não a da fatura). O gasto usa a moeda da conta e o `paid_by` do perfil ativo.
- **Parcelado**: a viagem recebe **um único gasto com o valor total** (parcela × número de parcelas), na data da primeira parcela.
- **Edição e exclusão acompanham o vínculo**: alterar valor/data/descrição, trocar de viagem ou desmarcar a integração atualiza/remove o espelho; excluir o lançamento (inclusive por série/cascata) remove o gasto da viagem por trigger.
- **Migration `20261025000000_mf_tx_links_trip.sql`**: tabela `mf_tx_links`, RPC `mf_save_tx_linked` (grava lançamento, filhas da série, vínculo e espelho numa única transação) e trigger `mf_cleanup_tx_links`.
- **Avisos da integração**: data fora do período da viagem e viagem sem a moeda da conta (não há conversão).

### Alterado
- **Integração só para despesa PAGA**: receitas, transferências, estornos, lançamentos pendentes e séries recorrentes/fixas ficam desabilitados, com o motivo exibido no bloco.
- **Offline**: a integração fica desabilitada e o vínculo existente não é alterado; o lançamento salva normalmente e o espelho só muda quando houver conexão.

### Corrigido
- **Editar despesa da viagem criada pelo Minhas Finanças**: a gravação no cache local (Dexie) falhava com `DataError` quando a despesa ainda não tinha cópia local — caso justamente das despesas criadas pelo espelho da integração. Agora o `id` é sempre incluído na atualização (despesas, viagens, roteiro, checklists e itens).
- **Responsável padrão do espelho**: usa o perfil ativo, o perfil da conta ou o primeiro perfil antes de cair no prefixo do e-mail; e a edição do lançamento no MF **preserva** o nome ajustado diretamente na viagem.

## [1.17.2] - 2026-10-25

### Corrigido
- **Saldo e previsto zerados no detalhe da conta**: o cabeçalho lia `saldo`/`previsto` de `mf_accounts`, que não guarda esses campos (o Resumo os calcula na RPC `mf_month_summary`); o resultado era sempre `0` mesmo com movimentações. O detalhe agora calcula a linha com o mesmo `computeAccountRows` do Extrato sobre os lançamentos já carregados — sem requisição extra — e usa o valor também no gráfico de fluxo e no "Reajustar saldo" (que abria com o alvo em zero).

## [1.17.1] - 2026-10-24

### Alterado
- **Músicas: cifras saem da listagem e da sincronização em bloco**: `music_songs` passa a ser consultada só com metadados (título, artista, tipo, gênero, links). No banco de produção, o texto das cifras ocupa ~8,8 MB contra ~0,2 MB de metadados para as 4.812 músicas; o `content` agora é baixado por ID apenas quando a música é aberta ou editada e fica no cache local.
- **Abertura/edição de música**: o visualizador e o editor completam a cifra a partir do cache ou do servidor antes de exibir/salvar, evitando gravar `content` vazio por cima do original.
- **Lista de artistas**: consultas de artistas (geral e por letra) ficam 5 minutos em cache, reduzindo rebaixamentos repetidos ao abrir o dropdown e trocar de letra.
- **Abertura do módulo de músicas**: o sync não carrega mais todas as músicas do cache para descobrir o `updated_at` mais recente (com 4.812 músicas com cifra, a leitura caiu de ~550-1.000 ms para 2-30 ms) e as tabelas auxiliares (setlists, gêneros, vínculos e acordes) são baixadas em paralelo em vez de uma após a outra.

### Corrigido
- **Criação de música com gênero no ambiente local**: o `supabase/seed.sql` agora cria os 36 gêneros padrão com os mesmos UUIDs e o mesmo dono da produção (`9659a65c-…`). Sem eles, o insert falhava com 409 por violação de `music_songs_genre_id_fkey` e a policy `auth.uid() = user_id` escondia os gêneros do app.
- **Falha silenciosa ao criar música**: quando o servidor recusa o insert, o editor remove a cópia temporária do cache e mostra o toast de erro. Antes ele exibia "Música criada" e deixava uma música fantasma que nunca chegava ao servidor.
- **Música ainda sem cifra**: abrir o editor de uma música cadastrada sem texto falhava com "Música não encontrada". Agora só bloqueia quando a busca da cifra falha de verdade; a música sem cifra abre normalmente para receber o texto. Offline, sem a cifra no cache, a edição continua bloqueada para não sobrescrever o conteúdo do servidor, mas a música já cacheada pode ser visualizada.

## [1.17.0] - 2026-10-24

### Adicionado
- **Rotas aninhadas em todos os menus**: URLs passam a seguir o padrão `/modulo/tela` (por exemplo, `/minhasfinancas/accounts`, `/trips/itinerary` e `/music/setlists`). Contas e cartões do Minhas Finanças também têm rotas por ID (`/minhasfinancas/accounts/{id}` e `/minhasfinancas/cards/{id}`), que preservam o detalhe ao atualizar e permitem voltar pelo histórico do navegador.
- **Deep links do repertório**: música, artista e filtro alfabético usam segmentos próprios na URL.

### Alterado
- **Compatibilidade de rotas antigas**: URLs com hífens são redirecionadas para o novo padrão sem adicionar uma entrada extra ao histórico.
- **Estado de detalhe de conta/cartão**: a URL passa a ser a fonte da verdade; o drill legado em `localStorage` não reabre detalhes ao navegar para trás.

## [1.16.1] - 2026-10-23

### Adicionado
- **Deploy automático de migrations em produção**: o GitHub Actions `Apply Supabase production migrations` executa `supabase db push` quando `supabase/migrations/**` é mergeado na `main`, serializa execuções para impedir concorrência e confirma o histórico ao final. O README documenta os dois secrets necessários (`SUPABASE_ACCESS_TOKEN` e `SUPABASE_DB_PASSWORD`) e o fluxo local → PR → produção.

## [1.16.0] - 2026-10-22

### Adicionado
- **Ambiente de desenvolvimento local (Supabase em Docker)**: o repositório passa a ter `supabase/config.toml` + `supabase/seed.sql`, então `npx supabase start` sobe banco/API/Studio na máquina e `npm run dev` aponta para ele. O objetivo é **parar de desenvolver contra produção** — o dev server em `localhost:5173` era a maior fonte de egress do projeto (~148 MB em 24 h, medidos nos logs). As portas ficam em **544xx** (API 54421, banco 54422, Studio 54423, e-mail 54424, analytics 54427) para conviver com outro projeto Supabase local nas portas padrão.
- **`supabase/seed.sql` (mínimo, não é dump de produção)**: usuário local de desenvolvimento e 4 contas (corrente, cartão, poupança e uma carteira em **USD**), 7 categorias com uma subcategoria, e lançamentos que cobrem os cenários das telas: **fatura fechada em aberto**, **fatura fechada e paga** (com o pagamento vinculado por `invoice_close`), **fatura corrente**, **parcela 3/10**, **gasto fixo mensal**, **transferência entre contas**, **receita**, viagem passada e futura (com despesa e itinerário) e investimento **Rendimentos / Mercado Pago** com 2 registros.
- **Migration baseline (`20200101000000_baseline_schema.sql`)**: 38 tabelas, 2 views e 2 funções (`get_artists_by_letter`, `get_public_key_by_email`) que só existiam porque foram criadas direto no painel do Supabase. O arquivo foi gerado a partir do catálogo de produção (`pg_catalog`), com 115 constraints, 28 índices e 77 policies.

### Corrigido
- **A cadeia de migrations não aplicava do zero**: a primeira (`20260620143000_add_order_index_to_custom_list_items.sql`) quebrava com `relation "public.custom_list_items" does not exist`, porque 38 tabelas nunca tiveram migration. Com o baseline, `supabase db reset` aplica as 26 migrations e deixa o schema igual ao de produção — conferido fato a fato (colunas, defaults, constraints, índices, policies, views, funções **e grants**): **1.020 fatos + 160 grants idênticos**, sobrando só 1 índice que existe apenas no local (`idx_mf_import_batches_user`, criado por migration e ausente em produção) e diferenças de encoding nos nomes de policy. Os grants foram gerados do ACL real (não são uniformes: `cars`, `trips` e outras 15 tabelas não têm `anon` em produção), e o baseline revoga o `anon` que o stack local concede por *default privileges*.
- **Colunas de `mf_accounts` que existiam só em produção**: `linked_account_id` (usada por `mf_card_cycle_totals`) e `card_brand` foram criadas fora de migration — o `mf_card_cycle_totals` nem aplicava do zero. Nova migration `20261021000000_mf_accounts_linked_account_and_brand.sql` repõe as duas.

### Alterado
- **`.env.local` passa a apontar para o banco local** (`http://127.0.0.1:54421`), com a chave anon do stack de desenvolvimento. O arquivo é ignorado pelo git; `.env.local.example` (commitado) traz os mesmos valores para copiar.
- **Teste E2E de recuperação de senha** deixou de injetar a sessão com a chave de storage da produção (`sb-xfcehxyhhmuscodilfha-auth-token`) e passou a fazer o login mockado, então funciona com qualquer URL de projeto (produção ou local).

## [1.15.1] - 2026-10-21

### Corrigido
- **Cada módulo puxava também os dados dos outros**: o `SyncEngine` registrava os três providers (música + viagens + MF) — abrir o Minhas Finanças baixava as **38 mil músicas** (143 MB na tabela) e o pull de música, sem índice em `updated_at`, ordenava tudo a cada página: **~7 s por requisição, voltando 500**. Agora cada módulo registra só o provider dele (`providers: ['mf' | 'music' | 'trips']`) e o índice `(user_id, updated_at)` derruba a query de **6.965 ms → 2,7 ms**.
- **Rodapé (TOTAL) da tabela de Contas não batia com o cabeçalho**: ficou na ordem antiga depois da reordenação das colunas e ainda mostrava o saldo de criação da conta em vez do saldo do fim do mês anterior. Agora segue a mesma ordem e o mesmo critério das linhas.
- **Telas do MF que baixavam a tabela INTEIRA de lançamentos (≈10 MB por abertura)**: o **sino de lembretes** (montado o tempo todo no cabeçalho) buscava as ~14 mil linhas só para contar lembretes — agora busca **só os pendentes**, com as colunas do planeador; o **autocomplete de descrições** (tela de edição) buscava a tabela inteira — agora só as **300 linhas mais recentes**, colunas mínimas; os **modais de antecipação de parcelas** buscavam a tabela inteira para achar meia dúzia de linhas da série — agora pegam **só a raiz e as irmãs**; a **importação** comparava contra a tabela inteira — agora compara **só a conta de destino**; e o **drill-down do cartão** pegava o histórico inteiro da conta vinculada — agora usa o mesmo recorte enxuto do cálculo de fatura (transações do cartão + transferências para ele + espelhos vinculados).

### Alterado
- **`useMFAllTransactions` aceita a conta de destino** (`accountId`) — sem ela, ela segue sendo a tabela inteira (use com cuidado).
- **As consultas novas são filtradas no servidor** (`status = PENDENTE`, `invoice_close` do cartão, conta de destino), então o custo não cresce com o histórico.

## [1.15.0] - 2026-10-21

### Adicionado
- **Preferências de interface sincronizadas entre aparelhos (MF)**: o painel do Resumo (ordem dos widgets, widgets/ contas/ gráficos ocultos) e o critério de ordenação das contas passaram a ser salvos **na conta** (tabela nova `mf_user_prefs`), e não só no `localStorage` do navegador — até agora cada aparelho tinha o seu próprio painel (o mesmo usuário via um layout diferente no celular, no tablet e no desktop). O `localStorage` continua como cache instantâneo (e funciona offline); a conta é a fonte da verdade. O **perfil ativo** e o **mês navegado** seguem locais de propósito: cada aparelho pode estar num perfil/mês diferente ao mesmo tempo, sem se atropelar.

### Alterado
- **Camada de preferências movida para `src/lib/mfPrefs.js`** (o `mfDashboard.js` continua exportando os mesmos símbolos, sem quebrar imports).

## [1.14.1] - 2026-10-21

### Corrigido
- **Coluna "Transferências" da tabela de Contas não empilhava as moedas**: as demais colunas mostram uma moeda por linha, mas a de transferências juntava tudo numa linha só ("R$ 0,00 - US$ 0,00"), o que não alinhava com o resto e ainda invadia a coluna vizinha (Saldo). Agora cada moeda ocupa a sua linha, com a cor pelo seu sinal (verde/vermelho/cinza) — a célula segue o mesmo padrão de `MFTotalsStack` usado nas outras colunas.
- **Tabela de Contas no tablet: o nome da conta quebrava letra por letra e invadia a linha de cima**: com a largura do tablet (~975px) as colunas fixas somavam mais que o espaço livre e, como a 1ª coluna ficava com "o que sobrasse" (tabela com `table-layout: fixed`), ela colapsava — o nome da conta ("Nuconta") saía em uma coluna de ~20px, uma letra por linha, e transbordava por cima da linha do grupo. Agora a coluna do nome tem **largura explícita** e, até 1100px, as colunas numéricas encolhem (a tabela cabe sem espremer; abaixo disso ela rola na horizontal em vez de quebrar o texto).
- **"Saldo inicial" da tabela de Contas era o saldo de criação da conta, não o do mês anterior**: a coluna mostrava `initial_balance` (o saldo com que a conta nasceu) em vez da abertura do mês — por isso as colunas não fechavam (ex.: Nuconta em outubro/26: 20.052,28 + 989,02 − 2.954,73 + 1.996,93 ≠ 34,27). Agora mostra o **saldo do fim do mês anterior** (`saldoPrev` da RPC): 3,05 + 989,02 − 2.954,73 + 1.996,93 = **34,27** ✓.

### Alterado
- **Ordem das colunas da tabela de Contas**: Saldo inicial · Saldo · Previsão · Receitas · Despesas · Transferências · Ações (o saldo e a previsão ficam colados no saldo inicial, que é a base da conta no mês).
- **RPC do Resumo (`mf_month_summary`) ~2,7× mais rápida**: o cálculo do painel era montado com um join `tx.account_id = acc.id OR tx.transfer_account_id = acc.id` — com o `OR` o Postgres varria 75 contas × 14 mil lançamentos (1.055.595 avaliações de join, 1.037.774 linhas descartadas) e a tela levava **~405 ms** por chamada (pico de 5,2 s). Agora o mesmo cálculo sai de duas agregações (uma por lado da movimentação) somadas por hash join, sem varredura quadrática. **Os números não mudaram**: a saída antiga e a nova foram comparadas byte a byte em 6 meses (2025-12 a 2026-11) e são idênticas.

## [1.14.0] - 2026-10-21

### Adicionado
- **Card "Pendentes" no Resumo (MF)**: novo widget ao lado do card "Lançamentos" (a posição é a que o usuário escolher no "Personalizar painel", como os outros widgets). Mostra **só o mês navegado** — cada mês abre com os seus próprios pendentes, sem grupo de atrasados, listando **todos** (sem limite). Tem os **mini-totais** (A pagar · A receber · Transferir) e as **pílulas** de filtro (Tudo · Pagar · Receber · Transferir) com as contagens; quando o total é zero, o valor fica em **cinza neutro** (sem cor de sinal). O **pagamento-espelho da fatura do cartão** aparece marcado com 🎴 (mostrando o fechamento e o vencimento) — fatura em aberto sem agendamento **não** entra. Clicar no item abre o **detalhe da transação** (o mesmo modal do Extrato, com o botão **Efetivar**). A consulta é filtrada no servidor pelo mês (`payment_date` dentro do mês), então o custo não cresce com o histórico. Rótulos em pt/en/es.

## [1.13.2] - 2026-10-21

### Corrigido
- **Fatura de cartão: o cálculo parava de baixar o histórico inteiro do cartão**: o item 30 ("caminho do FIFO") era re-derivado no cliente a cada montagem do módulo — para saber quanto crédito antigo abate a fatura, o app baixava **todo** o histórico do cartão (3.365 lançamentos do Nubank) e refazia um saldo corrente no browser. Agora o servidor entrega os **agregados por ciclo** (RPC nova `mf_card_cycle_totals`: total e estornos de cada ciclo, pagamento vinculado/pendente por fechamento, o pool de pagamentos históricos e a data inicial do histórico) e o cliente baixa **só a janela de exibição** (13 meses) + os espelhos. O caminho do FIFO continua no cliente — o mesmo código, alimentado por números em vez de milhares de linhas — então os valores não podem divergir. Validado com os dados reais: os 8 cartões devolvem **números idênticos** nos dois caminhos (Itaú 15/10 R$ 1.609,15 · AGENDADA · em aberto R$ 0,00; Nubank R$ 2.954,73 · PAGA; C6 R$ 2.453,80; Nomand R$ 582,71) e o agendador não tem nada a gravar em nenhum dos dois. Offline (sem RPC) ou com a RPC fora, o app cai no caminho antigo, que sabe fazer o FIFO sozinho.

## [1.13.1] - 2026-10-21

### Corrigido
- **Egress do app: o módulo MF baixava a tabela de lançamentos INTEIRA a cada abertura (≈1,8 GB/dia)**: o agendador do pagamento-espelho, a tela de Cartões e a Próxima fatura do Resumo buscavam as transações pelo escopo "cartões + contas vinculadas" — e como as contas vinculadas guardam todo o histórico, esse filtro não recortava nada: a tabela (14.009 linhas ≈ 10,4 MB de JSON) era paginada em 15 blocos de 1.000 a cada montagem do módulo (≈133 varreduras/dia, ≈2.000 requisições). Agora existe o hook `useMFCardTransactions`, que baixa só o conjunto que o cálculo de faturas realmente lê — compras no cartão, transferências com destino no cartão e os lançamentos com `invoice_close` (pagamentos-espelho) na conta vinculada. O cálculo continua idêntico (mesmo conjunto usado na auditoria do agendador: fatura, FIFO e espelho reproduzidos exatamente — Itaú 1.609,15 / agendada / em aberto R$ 0,00).
- **Saldos dos objetivos vinham da tabela inteira (MF)**: o Resumo e a tela de Objetivos somavam o saldo de todas as contas baixando **todos** os lançamentos (sem filtro de conta). Agora o hook `useMFAccountBalances` recebe as contas que interessam (as atreladas a objetivos) e busca só os lançamentos dessas contas, com as colunas mínimas. Como o saldo chega depois dos objetivos, o cartão do objetivo mostra "…" (em vez de um R$ 0,00 mentiroso) até o valor ficar pronto.
- **Janela de orçamento do Resumo (6 meses)**: passou a pedir só as colunas que o cálculo de orçamento lê (`id,type,amount,payment_date,status,account_id,category_id`) e os vínculos de tag só com `transaction_id,tag_id` — o resto do lançamento (descrição, notas, anexos, datas auxiliares) pesa no payload sem uso.
- **Drill-down da conta no modo offline (MF)**: o filtro de escopo do `mfSelectAll` era passado como predicado, mas o motor aplica transform de lista — no offline o resultado voltava `false` no lugar das linhas. Alinhado com o contrato das outras chamadas.

### Alterado
- **Sincronização offline por módulo**: abrir Música ou Viagens não baixa mais as 13 tabelas `mf_*` (cada abertura puxava ~1.000 linhas de `mf_transactions` ≈ 740 KB sem uso). O `SyncEngine` ganhou a opção `skipMf`; o módulo Minhas Finanças continua sincronizando sozinho quando é aberto, e a tela de Configurações (sync manual) segue sincronizando tudo.
- **Pull do MF limitado a um por sessão curta**: o download completo das tabelas `mf_*` passou a acontecer no máximo uma vez a cada 10 minutos por sessão; entre um pull e outro, o sync só esvazia a fila de escritas offline (o cache local já é preenchido pelas próprias queries). Cada evento `database-synced` agora carrega a origem do sync, e o MF só invalida as queries quando o pull foi dele.
- **Invalidação de queries escopada no MF**: cada sincronização invalidava **todas** as queries do app (finance, viagens, música, MF) e disparava uma nova onda de buscas; agora invalida só as chaves `mf*`.
- **Faturas com dados frescos por mais tempo**: a leitura das transações de cartão passou a valer 10 minutos (antes 5) — ela só muda quando o usuário edita algo, e aí as mutations invalidam na hora.

## [1.13.0] - 2026-10-20

### Adicionado
- **Card-resumo no topo do detalhe no mobile (MF)**: a aba Transações do detalhe de conta/cartão ganhou um card-resumo no topo (só no mobile — some no desktop ≥1100px, onde a coluna Resumo já traz tudo): na conta, **Saldo em conta** (verde/vermelho conforme o sinal, com olho próprio que esconde só o card), **saldo inicial** do mês (fechamento anterior), mini-cards de **Entradas/Saídas** (mesmo cashflow do gráfico — receita/despesa + transferências, régua PAGO) e o rodapé **"Pendente no mês"** + **"Previsto"** (linha que só aparece quando difere do saldo); no cartão, **Fatura corrente** com chip de status, total, fechamento/vencimento, **Gastos no mês**, **Próxima fatura** (quando há despesa já vinculada) e link "Faturas do cartão". Quem cai direto na aba Transações enxerga o saldo sem trocar de aba (padrão do app de referência).
- **Menu "⋯" de gerenciamento no detalhe (MF)**: os ícones de editar/arquivar/excluir do cabeçalho viraram um único menu "⋯" (novo componente `MFManageMenu`, popover em portal como o MFAddMenu) com título "Gerenciar conta"/"Gerenciar cartão" — e o **Reajustar saldo**, que só existia na aba Resumo, passou a estar também no menu da conta (no cartão não entra: cartão não tem saldo). O cabeçalho seguiu o padrão do app de referência: **navegação de mês esticada à esquerda da faixa, com "+" e "⋯" à direita** (no estreito ≤768px o "+" vira só ícone) e o mês como contexto embaixo do nome. Os popovers dos menus "+" e "⋯" passaram a usar fundo **sólido** (`--menu-popover-bg`) — no tema claro o `--bg-card` 90% deixava o conteúdo de trás atrapalhar a leitura.
- **Rótulo da navegação de mês sem ano (MF)**: a faixa ‹ mês › ganhou fonte menor (0.9 → 0.82rem) e passou a **omitir o ano quando o mês é do ano corrente** ("Novembro"); fora dele, mês curto + ano ("Nov./2025" — pt-BR "nov." → "Nov./2025"). Faturas e subtítulos seguem com o formato completo ("Novembro de 2025") — helper nova `formatMonthNavLabel`.

### Alterado
- **Consolidado da tela Contas (MF, estreita) em duas colunas e sem duplicata**: o card do topo ("Saldo nas contas" | "Previsão" — ex.: **R$ 154.409,62** com **€ 86,30 · £ 64,05 · US$ 899,70** embaixo × previsão **R$ 152.583,79**) virou o **único consolidado**: o card-total idêntico que aparecia no fim da lista foi removido. As **previsões** de toda a tela Contas (consolidado, cabeçalhos de grupo, rodapé e células da tabela desktop) passaram a seguir a mesma lógica de cor do app de referência — **na cor do rótulo (muted) quando positiva e vermelha quando negativa** — e os **saldos** ficam **bold, vermelhos só quando negativos** (props `mutedNegative`/`redNegative` do `MFTotalsStack`). A **previsão some quando repete o saldo** (tolerância 0,005, por moeda): nos cards de conta como linha inline "Saldo: R$ X | Previsão: Y", e no cabeçalho do grupo (e no "Sem grupo") numa linha só com o rótulo, sem quebrar.
- **Cores por sinal no card-resumo do detalhe (MF)**: "Pendente no mês" passou a herdar a cor do rótulo (muted) e "Previsto" fica verde/vermelho pelo sinal — a mesma lógica do saldo grande, que agora vale também para os **chips Saldo/Previsão** do detalhe.

### Corrigido
- **Chevron `›` de avançar mês engolido pelo `+` no mobile (MF)**: no ≤768px o ícone `+` cobria o `›` de navegação na faixa do detalhe; o rótulo agora encolhe com reticências e as setinhas têm área mínima de 8px.

## [1.12.0] - 2026-10-20

### Adicionado
- **KPI "Total gasto" desdobrado (MF)**: o card do Resumo passou a exibir embaixo do total as duas linhas que o compõem — **"Gastos do mês"** (compras e débitos) e **"Pagamentos de fatura"** — somando o valor principal (caso real de outubro/2026: **R$ 22.052,57 = R$ 14.038,53 + R$ 8.014,04**; o número parecia inflado porque a compra de meses anteriores já havia sido contada no mês em que foi feita e a liquidação — o pagamento da fatura — contava de novo). A régua usa o novo campo `despesasFatura` da RPC `mf_month_summary` (DESPESA com `invoice_close` em conta que **não** é cartão, **qualquer status** — pendentes entram; no cartão, `invoice_close` marca a compra vinculada = gasto), espelhada no fallback client (`computeAccountRows`) e na emulação E2E (migration `mf_month_summary_despesas_fatura`). Sem pagamento de fatura no mês as linhas somem; rótulos em pt/en/es.

## [1.11.0] - 2026-10-20

### Adicionado
- **Diferença de fatura reajustada depois de paga (MF)**: quando a fatura muda de valor **depois de já estar paga** (espelho automático PAGO ou pagamento seu quitando tudo), o pagamento nunca é reescrito — a divergência vira um **lançamento novo** na conta vinculada (`MF_INVOICE_DIFF_NOTE`, "Ajuste de fatura — cartão", PAGO, **datado de hoje**): subiu = despesa positiva, desceu = despesa negativa (estorno). É idempotente (só cria enquanto a conta divergir), grava no `invoice_close` da fatura (ela segue quitada, sem excedente no FIFO) e a corrida "espelho × pagamento seu" passa a ignorar linhas de diferença (não apaga o espelho por causa delas). Antes a diferença não refletia e o usuário tinha que ajustar a mão (C6 de 20/10: ajuste de 0,16 na fatura paga).
- **Links conta ↔ cartão (MF)**: o detalhe da conta mostra os **cartões vinculados com o nome clicável** (abre o detalhe do cartão) e o cartão ganhou a **conta vinculada clicável** — no campo "Conta" do widget de Cartões e num chip "Conta: X" no cabeçalho do detalhe do cartão. A navegação é resolvida pelo pai via callbacks opcionais (`onOpenCard`/`onOpenAccount`): em Contas o clique pula para a aba Cartões com o cartão aberto (drill salvo); em Resumo/Cartões o drill troca direto. Nenhum componente importa o outro — zero dependência cíclica.

### Corrigido
- **Espelho PENDENTE revaloriza nas duas direções (MF)**: a régua antiga (`em aberto + espelho`) só seguia a fatura pra cima — o `openAmount` trava em 0 na queda e o agendamento parado ficava no valor antigo (a conta continuava com o valor antigo e o excedente virava crédito FIFO da próxima fatura). O valor-alvo agora sai do total da fatura (`billable − fifoCovered − demais vínculos`): fatura reduzida abaixa o pagamento pendente na hora, e a fatura aberta segue sem lançamento de diferença (nada foi pago ainda).

## [1.11.1] - 2026-10-20

### Corrigido
- **Pizza "Despesas por categoria" do detalhe do cartão não batia com a fatura (MF)**: o gráfico somava **qualquer compra paga no mês** (parcelas já vinculadas às faturas futuras entravam junto), enquanto a fatura e a Movimentação usam a régua da fatura (mês da fatura) — caso real do Nubank em outubro/2026: **R$ 4.854,22 no gráfico × R$ 2.954,73 na fatura**. A pizza do cartão passou a usar as **mesmas linhas da fatura do mês** (o mesmo `buildCardInvoices` do chip "Fatura corrente"); contas seguem a régua de sempre. De quebra, o resumo da fatura paga/agendada passou a exibir a linha **"Estornos"** ao lado de "Gastos do mês" (bruto − estornos = líquido), reconciliando o número do resumo com o chip e com o gráfico (2.962,69 − 7,96 = 2.954,73).

## [1.10.0] - 2026-10-20

### Adicionado
- **Efetivação automática opcional na criação (MF)**: criar despesa/receita/transferência ganhou o checkbox **"Efetivação automática"** com **default DESMARCADO** (`mf_transactions.auto_settle`, migration `mf_transactions_auto_settle`) — desmarcado, o lançamento PENDENTE **nunca vira PAGO sozinho** (só efetivação manual, na mesma régua de antes); marcado, uma rotina ao abrir o MF promove `PENDENTE → PAGO` quando `payment_date <= hoje`, preservando `effective_date` já gravada (sem ela, contabiliza na própria data agendada). O nascimento continua PAGO por padrão (sem mudança) e a despesa de cartão segue nascendo PAGO sempre, sem o campo. O agendador de pagamento de fatura **não muda**: o espelho "Agendado automaticamente (fatura)" continua promovendo pelo marcador (invariante "não existe fatura vencida não paga"). Filhas de série fixa/parcelada/repetição e da transferência herdam a opção por `spread`.

## [1.9.0] - 2026-10-19

### Adicionado
- **Ordem manual das contas no Resumo (MF)**: o seletor de ordenação ganhou o chip **"Manual"** (novo padrão = ordem do banco) e um botão **"Reordenar"** no cabeçalho da seção (mesmo estilo dos grupos) que liga/desliga as setas **↑/↓** nas linhas de conta (tabela larga e lista estreita) — as setas ficam visíveis só enquanto o modo está ativo; escolher outro critério desliga. A troca persiste o `sort_order` no banco e a mesma ordem vale na tela Contas (tudo ordena por `sort_order`). De quebra, o chip "Nome (A–Z)" passou a **ordenar de verdade** (antes ele só rotulava a ordem natural do banco, que já era o padrão).
- **Bandeira da rede do cartão no Resumo (MF)**: a descrição dos cartões (tabela larga e lista estreita) passou a mostrar a bandeira **Visa/Mastercard/Elo/Amex/Hipercard** (`mf_accounts.card_brand`, mesma base da tela de Cartões) no lugar da bandeira da moeda — o valor já traz o símbolo (R$, US$), então a moeda era redundante. Quem ainda não cadastrou a bandeira continua sem o selo; dá para preencher no modal da conta (campo "Bandeira").
- **Escopo "Todas as moedas" não vaza mais como moeda albanesa (MF)**: os widgets de objetivos e orçamentos do Resumo formatavam os valores com a moeda ativa do filtro; com o escopo "Todas as moedas" (`'all'`) o `formatMoney` validava o código ISO (`/^[A-Za-z]{3}$/`) e renderizava **ALL** (Lek albanês) — "ALL 15.031,10". Agora `formatMoney` rejeita `'all'`/`'ALL'` e cai em BRL, e o widget de objetivos usa a moeda própria do objetivo (`goal.currency`), igual à tela de Objetivos.
- **Fatura paga mostra o check verde no Resumo (MF)**: `useMFCardUpcoming` carregava só as transações das **contas de cartão** (`account_id`/`transfer_account_id`), mas o pagamento de fatura é DESPESA na **conta vinculada** (`invoice_close`) — o Resumo nunca via o pagamento, a fatura ficava com saldo e o ícone travava no cadeado âmbar mesmo com a fatura zerada (o dado certo só aparecia na tela de Cartões, que já incluía a vinculada). O escopo passou a somar as contas vinculadas (mesmo padrão de Cartões/planner; sem `invoice_close` nada se atribui a troco). O hook também ganhou `monthKey` (com `monthRefISO`), igual à tela de Cartões: navegar o mês no Resumo agora troca os valores das faturas de verdade em vez de sempre mostrar o mês vivo.
- **"Próxima" do cartão espelha a Movimentação do detalhe (MF)**: despesas de cartão **sem `invoice_close`** (fatura escolhida no picker) do mês seguinte passaram a entrar na "Próxima" no mês vivo, pela régua já usada nas faturas fechadas (mês da data = mês do vencimento) — antes só as vinculadas apareciam e a soma divergia do detalhe (bug Nomand: 513,54 × 1.096,25). Em relatório de época (mês passado) a regra não vale: a compra "ainda não existia" e não vaza para o mês; a vinculada segue vazando (comprometimento de limite).
- **"Inicial" do Resumo = fechamento do mês anterior (MF)**: o KPI deixou de somar os `initial_balance` (marcador de configuração, que não acompanha o movimento) e passou a mostrar o saldo ao fim do mês anterior (`saldoPrev` = inicial + lançamentos PAGO até o fim do mês anterior). O campo vem da RPC `mf_month_summary` (migration `mf_month_summary_saldo_prev`) com fallback client e emulação E2E em paridade; o ajuste manual "Inicial" atualiza Inicial/Saldo/Previsto otimisticamente.
- **Pontos de "Ignorar nos totais" (MF)**: conta marcada ganha dois pontinhos (vermelho + âmbar) com tooltip "Ignorar nos totais" ao lado do nome — nas listas do Resumo (estreito e tabela larga) e nos cards/tabela do Contas. Avisa que a conta fica fora dos KPIs, mas continua somando nos totais de grupo, drill e rodapé.
- **Tabela de cartões do Resumo no layout do Minhas Finanças (MF)**: no web a seção Cartões deixou de reusar as colunas de contas (Receitas/Despesas/Saldo/Previsão) e passou a mostrar Descrição (ícone + nome + bandeira da moeda) · Fechamento (dia da semana) · Vencimento (dia da semana) · Fatura (valor da fatura corrente + ícone de status) · Próxima (valor do mês seguinte); o rodapé traz "A pagar" sob Fatura e "próxima" sob Próxima, com a linha Fechamento/Vencimento vazia.
- **Menu do Resumo no estreito de volta ao topo (MF)**: "Todas as moedas" reapareceu e a lista de moedas voltou a rolar no mobile. O painel (e o do sino) agora é renderizado via portal no `<body>` — o `glass-card` do cabeçalho tem `backdrop-filter`, que cria um *containing block* para `position: fixed`, deixando o bottom-sheet ancorado no card e **atrás** do cabeçalho fixo do app (`main-header`, z-index 100); o topo (Voltar, "Todas as moedas") ficava escondido e não dava para rolar. Portal + z-index acima do cabeçalho corrigem os dois.
- **Previsão negativa das contas em vermelho (MF)**: nas listas do Resumo (estreito e tabela larga) uma Previsão < 0 sai destacada em vermelho em vez do cinza de muted.
- **Ordenação das contas a critério do usuário (MF)**: um botão de ordenar (setas) no cabeçalho da seção Contas abre chips com Nome (A–Z, padrão), Maior/Menor saldo e Maior/Menor previsto; a escolha é aplicada na hora e persiste no `localStorage` (`mf_accounts_sort`) — vale para a lista estreita e a tabela larga.
- **Ícone do C6 em preto (MF)**: o logotipo oficial do C6 (SVG monocromático) aparecia num chip branco; agora o chip usa o fundo preto da marca com o logo invertido para branco, igual à referência.
- **Cartões do Resumo estreito com as infos da referência (MF)**: a linha de cartão passa a mostrar — bandeira da moeda ao lado do nome (mantendo o ícone da conta), ícone de status da fatura ao lado do valor (paga = check verde, fechada = cadeado âmbar, aberta = cadeado azul) e os rótulos Fechamento, Vencimento e Próxima fatura (valor do mês seguinte, quando existe despesa já vinculada). O rodapé "A pagar / próxima" continua igual.
- **Menu do Resumo em dois níveis + KPIs no formato do mock (MF)**: o menu ⋮ virou dois passos — "Selecionar moeda" (com a moeda atual ao lado) abre a lista de moedas; "Personalizar painel" segue no primeiro nível — e o painel ganhou ✕ + overlay que fecha em qualquer lugar, nos dois modos (antes o bottom-sheet cobria a tela e quem clicava nos três pontos não conseguia sair); escolher a moeda aplica e fecha o menu. Os KPIs do web passaram ao formato do mock de referência: o valor em R$ sai em destaque grande e as demais moedas viram chips pequenos de sigla na linha de baixo (novo `MFTotalsHero`). No estreito, os ícones de ação (sino e ⋮) ficam na mesma linha do nome "Minhas Finanças" (à direita), a descrição sai abaixo e o seletor de mês ficou centralizado numa linha própria.
- **Sem bandeiras nos valores (MF)**: os ícones de bandeira saíram dos valores em destaque (compacto do Resumo, KPIs e resumo da Contas — prop `showFlags` removida do `MFTotalsStack`) — só a sigla (R$, US$, €, £), que já vem do formato monetário. As abas de moeda seguem com bandeira.
- **Push do sino explica quando não dá (MF)**: em endereço http (dev por IP local) o navegador não expõe notificação nem service worker e o "Ativar" ficava morto sem aviso — agora o clique mostra um aviso dizendo que push exige HTTPS (ou localhost).
- **Menu de três pontos, personalizar em modal e saldo em destaque (MF)**: o Resumo ganha menu ⋮ no cabeçalho com as moedas e o atalho "Personalizar painel"; no estreito a régua de abas de moedas sai de circulação (tudo no menu, que abre como bottom-sheet) e um badge mostra a moeda ativa quando não é "Todas". "Personalizar painel" virou modal de verdade (overlay + título + X + Concluir) no lugar do card solto no meio da página. O compacto volta ao formato do mock de referência — Inicial | saldo em R$ em destaque | Previsto — com as demais moedas menores e apagadas (`hero` no `MFTotalsStack`); o resumo estreito da Contas segue o mesmo estilo.
- **Ajustes mobile do Resumo (MF)**: sino de lembretes e seletor de moedas viram bottom-sheet no estreito (antes o dropdown saía da tela e as abas vazavam com rolagem lateral); o card compacto passa ao formato do mockup — saldo grande no topo e Inicial/Previsto como linhas de total. Novo hook compartilhado `useMFNarrowScreen` (≤768px) no lugar do matchMedia duplicado.
- **Resumo compacto no estreito + grupos recolhidos por padrão (MF)**: em telas ≤768px o Resumo mostra Inicial/Saldo/Previsto sem gráficos; grupos começam recolhidos (web e mobile). Lançamento novo já nasce efetivado (PAGO).
- **Resumo mobile sem rolagem lateral**: no estreito, contas e cartões viram lista de linhas (ícone + saldo/previsto + total) em vez da tabela; atalho (olho) no cabeçalho das seções abre o painel de contas visíveis.
- **Próxima fatura por cartão no Resumo (MF)**: cada linha de cartão mostra a data da próxima fatura com despesa vinculada (mesma fonte da tela de Cartões — `buildCardInvoices`) e o rodapé da seção traz "A pagar / próxima" (fatura corrente em aberto × total da próxima), nos modos tabela e lista.
- **Feed de lançamentos recentes no Resumo (MF)**: widget "Recentes" com os 10 últimos lançamentos de todas as contas, independente do mês navegado — data, descrição, conta · categoria e valor colorido (− despesa / + receita); clique leva aos Lançamentos. Widget novo migra sozinho na preferência salva (entra logo abaixo de "Contas").
- **Gráficos novos com visibilidade individual (MF)**: o Resumo ganhou "Receitas por categoria" (pizza) e "Despesas por tipo de conta" (barras, com ícone e nome do tipo) somando-se aos dois atuais. No "Personalizar painel", a seção "Gráficos do Resumo" oculta/revela cada um à parte (persistido em `hiddenCharts`, todos visíveis por padrão).
- **Orçamentos e objetivos em lista com barra (MF)**: os widgets do Resumo mostram cada orçamento (uso/límite + barra de uso, vermelha ao estourar) e cada objetivo ativo (ícone, nome, atual/meta + barra de progresso e %), em vez de um destaque único.
- **Seletor de cor de volta à fileira de 19 tons (MF)**: categoria, grupo, tag e objetivo voltam à paleta original (`MF_CATEGORY_COLORS`) em vez da grade de 54 tons; a constante `MF_COLOR_GRID` foi removida.
- **Tema noturno com as cores do mock (MF)**: só tokens em `index.css` — fundo `#0b0d12`, cards sólidos `#14171e`, bordas `#262b36`, texto `#f1f3f7` e muted `#8a93a5`; primária índigo mantida.
- **C6 Bank em preto puro (MF)**: o quadradinho da marca passa a `#000000`; marcas escuras (C6, XP, Safra, Pine, Stone…) ganham anel interno claro para não sumirem no card do tema noturno.
- **Toggle "Fixa mensal" da transferência com estados claros (MF)**: selecionado usa o botão primário preenchido (índigo) e não selecionado o neutro, em vez do contorno vermelho de antes.

### Alterado
- **Tela de Lançamentos no estreito (mobile) no layout do Minhas Finanças (MF)**: a lista virou **cartões agrupados por dia de pagamento** — separador "● 01 DE OUTUBRO DE 2026 · N transações" **fixo (sticky) no topo** enquanto rola o dia, então os botões Selecionar/Pagar/Excluir continuam visíveis mesmo no último lançamento. Cada cartão é **clicável e abre os Detalhes** (área do ícone/valor; checkbox e ⋮ são irmãos fora do botão) e o **⋮ expande as ações DENTRO do card** — Pago ✓ · Editar · Enviar · Excluir, os mesmos handlers da tabela — em vez de abrir modal. O cartão traz ícone (da categoria, senão da conta), descrição com selos de fixa/parcela/anexo, badge de categoria + tags + conta, valor colorido à direita e status. Cada dia ganhou sua linha de seleção ("Selecionar todos" + **Pagar** + **Excluir**, ativos só com algo selecionado do dia — a barra de lote global ficou só no largo); o cabeçalho recebeu o badge de itens, a busca largou para largura total, os filtros de KPI viraram tira de 3 colunas (Receitas · Despesas · Transf. — novo total de transferências) e o "+" do cabeçalho virou **FAB fixo** no canto inferior direito.
- **Coluna Saldo em 1ª no Resumo (MF)**: a tabela larga de contas passou a ordem **Saldo · Receitas · Despesas · Previsão** (antes Receitas · Despesas · Saldo · Previsão) — no cabeçalho, nas linhas e no rodapé TOTAL.

### Corrigido
- **"Em aberto" dos cartões não zera mais com fatura agendada (MF)**: a métrica EM ABERTO da tela de Cartões descontava pagamentos **agendados** (PENDENTE) — como o agendador espelha todas as faturas, o número ficava R$ 0,00 enquanto o usuário ainda devia. Agora EM ABERTO = **todas as faturas não pagas** (corrente + futuras + vencidas; só PAGO abate), na mesma régua do `payable` do modal de pagamento — e a régua do usuário vale: **EM ABERTO + DISPONÍVEL = LIMITE**. O rodapé "A pagar / próxima" do Resumo (cartões) alinhou (agendamento também não zera); status/selo Agendada continua distinguindo o que já está programado, e agendamento **parcial** não abate (a fatura segue cheia até o pagamento).
- **Scroll do Contas, do Extrato e da grade de Cartões travando no mobile (MF)**: cada linha de conta, cada cabeçalho de grupo, cada card de dia e cada card da grade era um `.glass-card` — ou seja, `backdrop-filter: blur(20px)` **por elemento**: no scroll o navegador refazia o blur do fundo por linha a cada frame, e a lista engasgava (com o `--bg-card` opaco o blur nem chegava a aparecer). Listas repetidas passaram a usar a nova classe `.glass-card-flat` (mesmo visual, sem blur nem transition) — linhas e grupos do Contas (inclusive as aninhadas), os cards por dia do Extrato e os widgets da grade de Cartões; instâncias únicas (cabeçalhos, KPIs, totais, modais) seguem com `glass-card`.
- **Reordenar contas e grupos não "trava" mais (MF)**: cada clique de ↑/↓ (Resumo e Contas, contas e grupos) disparava a invalidação de **todas** as queries do MF — incluindo a RPC do resumo, que varre todos os lançamentos do mês + 5 meses de gráfico — e a linha só se movia quando o refetch terminava (dava a sensação de travar). A reordenação virou **otimista**: o `sort_order` novo vai para os caches na hora do clique (a UI move na hora) e a gravação corre em paralelo; como reordenar não muda valores, o sucesso não refetcha nada — em erro, os snapshots são restaurados e tudo é invalidado (rollback).

### Adicionado
- **Gestão de tags nos Ajustes (MF)**: seção refeita com busca, utilização (nº de lançamentos), ver lançamentos (drill expansível), editar (modal Nova/Editar tag com nome + grade de cores) e excluir com confirmação.
- **Busca no seletor de tags do lançamento (MF)**: o picker (criação e edição rápida) ganhou campo de busca para filtrar as tags.
- **Seletor de ícone e cor no objetivo (MF)**: o modal de objetivo ganhou o `MFIconPicker` compartilhado (busca + emojis + marcas + glifos, extraído do modal de categoria) e a grade de cores do app original — no lugar do campo de texto e do input de cor nativo. O cartão do objetivo renderiza marca/glifo via `MFAccountIcon`.
- **Grade de cores do app original + marcas streaming/tech (MF)**: `MFColorGrid` (54 tons em 6 colunas, com ✓) nos modais de categoria, grupo e tag; novas marcas `brand:` Ambev Tech, HBO Max, Netflix, Disney+ e Apple (monogramas; Shopee/AliExpress/Shein/Mercado Livre/Magalu já existiam).
- **Lembretes do Minhas Finanças com sino + push (MF)**: sino no header do Resumo com os lembretes do dia (D-3, D-0 e D+3 exatos, sem spam; fatura de cartão usa o vencimento da fatura; contas "Ignorar nos totais" também geram; transferências ficam de fora) — o clique leva aos Lançamentos no mês do vencimento. Opt-in de push no painel (Web Push/VAPID, mesma base da `send-push` do Babylog). Servidor: Edge Function `mf-reminders` (cron diário, resumo de até 5 por usuário, limpa inscrições mortas) + tabela `mf_push_subscriptions` + handlers de push/clique no service worker. Para ativar o push faltam: chaves VAPID, secrets (`CRON_SECRET`, `VAPID_*`, `MF_VAPID_MAILTO`) e o cron diário.

### Adicionado
- **Abas por moeda em Contas e Resumo (MF)**: o filtro de moeda virou abas visíveis (Todas + BRL/USD/EUR… com contagem de contas, `MFCurrencyTabs` compartilhado). Com uma moeda selecionada, KPIs e listas mostram só ela — fim do header concatenado "R$ · US$ · € · £" quando há muitas moedas estrangeiras. Vale também para o Resumo.
- **Contas em cards no tablet/mobile (MF)**: abaixo de 769px a tabela de 8 colunas (que quebrava o texto letra por letra) vira cards em coluna única no layout do mockup — consolidado (saldo total + projetado) + chips por tipo, conta com nome por extenso, SALDO em destaque e Previsão abaixo, badges de tipo/moeda, filhas aninhadas no cartão do grupo com trilho; respiro no fim da lista; toque abre o detalhe completo.
- **Tabela web sem sobreposição multimoeda (MF)**: subtotais de grupo e rodapé empilham uma moeda por linha (antes o "R$ · US$" estourava a coluna e invadia a vizinha).
- **Totais por moeda empilhados nos KPIs (MF)**: na aba Todas, cada moeda aparece numa linha (`MFTotalsStack`, BRL primeiro) em vez de lado a lado — vale para os KPIs do Resumo e de Contas, os cards de grupo e, no mobile, o consolidado e os totais de grupo. Tabelas e rodapés seguem inline compactos.

### Alterado
- **Saldo inicial do detalhe da conta é o fechamento do mês anterior (MF)**: o card mostrava a âncora de criação/reajuste (`initial_balance`, ex.: £240) enquanto o mês anterior tinha fechado em outro valor (£64,05) — com aviso de "customizado" para explicar a divergência. Agora a abertura é sempre o fechamento anterior (`prevClose`); a âncora continua valendo na matemática, mas não aparece mais como "inicial". Saíram a linha "Saldo sem o inicial" e o aviso (perderam o sentido), e os valores ganharam destaque (Saldo 1,4rem, abertura 1,15rem, movimentação e Previsão maiores).

### Corrigido
- **Dropdowns (menu ⋮ e sino) atrás dos cards de KPI no web (MF)**: o `backdrop-filter` do card de cabeçalho criava um stacking context e prendia os dropdowns atrás dos cards de KPI — o cabeçalho do Resumo ganhou `position: relative` + `z-index` e os dois menus abrem por cima.
- **Spinners nativos quebrados no tema escuro (MF)**: o `type=number` (ex.: qtd de parcelas na antecipação) renderizava as setinhas numa caixa clara sobre o fundo escuro — regra global esconde as setinhas (teclado numérico continua).
- **Tabela web multimoeda sem sobreposição (MF)**: o pill do total do grupo estourava a coluna e invadia a vizinha — total agora direto na célula; rodapé com fonte compacta.

## [1.8.0] - 2026-10-15

### Adicionado
- **Criar categoria dentro do lançamento (MF)**: a busca do seletor de categoria ganhou o botão Criar "nome" quando não há correspondência exata — cria na hora (tipo atual, raiz) e já seleciona, sem sair do modal. Vale na criação e na edição.
- **Fatura padrão segue o mês visualizado (MF)**: ao criar despesa de cartão a partir do Extrato/detalhe/Lançamentos/FAB, o picker de fatura já abre na fatura do mês em tela (`invoiceMonthKey`) em vez de sempre cair no mês corrente — com fallback para o comportamento anterior fora das opções.
- **Editar série com escopo (MF)**: editar um lançamento fixo ou parcelado agora pergunta o escopo antes de gravar (apenas este / a partir deste / todos — mesmo diálogo da exclusão, i18n pt/en/es). O escopo amplo aplica só o conteúdo (descrição, valor, conta, categoria, observações) nas demais ocorrências, mantendo datas, faturas, status e parcelas de cada mês. Vale na edição completa e na edição rápida do modal de detalhes (nome, observações, categoria e tags), e em repetições com vínculo (semanais/anuais com `parent_transaction_id`, que antes caíam no update único sem perguntar).
- **Spinner do Extrato cobre o intervalo do save (MF)**: o sinal `useMFRefreshPending` acende na hora do salvamento e apaga quando os refetchs assentam — fecha a janela de 750 ms do debounce da invalidação em que não havia `isFetching` nem aviso nenhum. O subtítulo do cabeçalho também troca para "Atualizando…" durante o refresh, para o aviso não passar despercebido.
- **Barra de uso do limite sempre visível (MF)**: piso de 2,5% quando há uso (1% real, ex.: C6 R$ 311 de R$ 30 mil, sumia no trilho) e cor do cartão com fallback para a primária quando não tem contraste no tema escuro (preto #000000 da C6 era invisível — só o laranja do Nomand aparecia). Sem limite cadastrado (Itaú), a barra mostra dica para cadastrar o limite.
- **EM ABERTO conta faturas futuras vinculadas (MF)**: fixas criadas 12 meses à frente (ex.: Nubank com despesas até 2027, pagamento e `invoice_close` no futuro) ficavam fora da janela de exibição e o cartão mostrava R$ 0 em aberto / limite intacto — enquanto o Nomand (parcelas sem vínculo, que entram quando o mês chega) parecia "funcionar". Agora widget, detalhe da fatura e modal usam `includeFutureBound` (igual ao agendador): a fatura futura vinculada entra no EM ABERTO/DISPONÍVEL e na barra como limite comprometido.
- **Agendado compromete o limite até pagar (MF)**: fatura coberta por espelho PENDENTE (chip AGENDADA) zerava o EM ABERTO "na hora" e o DISPONÍVEL voltava ao limite cheio — no mês corrente tudo ficava R$ 0 em aberto com o dinheiro ainda por sair. Regra agora: EM ABERTO segue líquido (a pagar já descontado o agendado — invariant do E2E "modal parcial"), mas DISPONÍVEL/barra usam o comprometido (`openTotal + pendingTotal`, novo campo do `buildCardInvoices`): agendado só libera limite quando vira PAGO.

### Corrigido
- **Aviso de duplicada mira a fatura nas despesas de cartão (MF)**: o cheque de série repetida comparava o mês da `payment_date` — uma "Compra ração" lançada em 10/10 na fatura de novembro fazia o modal citar "outubro". Agora, para cartão, a comparação e o intervalo da busca usam `invoice_close` (fatura da cabeça + N), e o aviso cita o mês da fatura.
- **Valor da calculadora atualiza o modal na hora (MF)**: o ✓ da calculadora salvava, mas o modal de detalhes seguia mostrando o valor antigo até fechar e reabrir (o `tx` do pai é um snapshot). Agora o modal espelha o valor/nome salvo na hora (otimista local) e o Extrato confirma no refetch.
- **Escopo amplo da fixa não arrastava meses anteriores (MF)**: filhas de série fixa (com `parent_transaction_id`) caíam no ramo de parcelada (`installmentHeadId` devolve o pai de qualquer filha vinculada) e o filtro por nº de parcela (zerado nas fixas) incluía a série inteira — "a partir deste mês" atualizava cabeça e meses passados. Agora parcelada = só com numeração (`installments_total>1`); fixa/repetição usam a série por data.

## [1.7.4] - 2026-10-14

### Alterado
- **Performance do Minhas Finanças (MF)**: com 13,7 mil lançamentos, cada ação recarregava a tabela inteira 3× (~15 MB). Agora: (1) resumo do mês agregado no servidor (RPC `mf_month_summary`, ~100 linhas); (2) extrato geral agregado no servidor (RPC `mf_statement`: grupos + abertura + saldo corrente); (3) extrato de uma conta, drill-down, tela de cartões, faturas do cartão e modal de lançamento baixam só as contas envolvidas no servidor (`or` por origem/destino — de ~13 mil linhas para centenas, mês ~275 linhas); (4) invalidação pós-mutação restrita às queries `mf-*`. RPCs verificadas nos dados reais (0 divergências) com fallback local/Dexie intacto. Cálculos client-side intactos.
- **Cards de grupo redesenhados (MF)**: componente único `MFGroupCard` no widget do Resumo e no drill-down (avatar + nome com elipse e tooltip + subtítulo numa linha + total à direita, conforme mockup); grade mais larga; plural corrigido ("1 conta", "1 grupo" via chaves `_one/_other` em pt/en/es).

### Adicionado
- **Autocomplete do histórico na descrição (MF)**: ao digitar 2+ letras na criação de um lançamento aparece uma lista (setas ↑/↓, Enter ou clique) com descrições já usadas do mesmo tipo — escolher preenche **descrição, categoria e as tags** do lançamento original, **sem copiar o valor** (como no Minhas Finanças original). A busca ignora acentos e caixa (ex.: "mi" encontra "Mídia"). Fonte: cache de `useMFAllTransactions` (sem request extra); ícone/avatar da categoria em cada sugestão.
- **Aviso de atualização no Extrato (MF)**: ao criar/editar um lançamento o Extrato recarregava em silêncio (só `isLoading` inicial mostrava algo); agora o `isFetching` em segundo plano transforma o ícone do cabeçalho num spinner (com tooltip, i18n pt/en/es) sem esconder a lista.
- **Botão Editar nos grupos da tela de Contas (MF)**: o cabeçalho de cada grupo ganhou lápis (`mf-group-edit-*`) abrindo o `MFGroupModal` em modo edição (nome, ícone, contas, flags) — antes só dava para criar grupo, nunca editar.
- **Reordenar contas (MF)**: toggle "Reordenar" na toolbar da Contas troca as ações por ↑/↓ (`mf-move-up/down-*`), que trocam o `sort_order` com o vizinho — a mesma ordem vale no Resumo e em todo lugar (todas as listas ordenam por `sort_order`).
- **Reordenar grupos (MF)**: no mesmo modo Reordenar, os cabeçalhos de grupo na Contas e os cards no Resumo ganham ↑/↓ que reescrevem o `sort_order` entre irmãos — fim da ordem alfabética sem controle.
- **Cor do grupo (MF)**: o modal de grupo ganhou seletor de cor (paleta + automático), aplicada no trilho do cabeçalho — como já era com o ícone.
- **Fixa mensal na transferência (MF)**: o modal de transferência ganhou a opção "Fixa mensal" (cabeça + 11 filhas vinculadas, como nos lançamentos).
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
