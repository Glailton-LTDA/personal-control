# Plano de Desenvolvimento — Módulo "Minhas Finanças"

> Objetivo: replicar no PersonalControl as funcionalidades do app **Minhas Finanças**
> (https://minhasfinancas.app.br/) como um **módulo novo**, deixando o módulo
> **Finance** atual intacto.
> Data: 03/10/2026 · Status: **Fases 0, 1 e 2 concluídas — schema + módulo + contas/transferências/extrato**

---

## 0. Decisão de arquitetura: NOVO MÓDULO

**Decisão (confirmada pelo usuário): criar um módulo novo**, para não arriscar
nada do módulo Finance existente.

| Item | Definição |
|---|---|
| Pasta do módulo | `src/components/MinhasFinancas/` |
| id do módulo (menu/rotas) | `minhasfinancas` |
| Abas (rotas) | `minhasfinancas-resumo`, `-transactions`, `-accounts`, `-statement`, `-cards`, `-budgets`, `-goals`, `-reports`, `-settings` |
| Tabelas no banco | prefixo **`mf_`** (12 tabelas novas, zero alteração nas existentes) |
| Módulo Finance atual | permanece como está, sem nenhuma mudança |
| Reuso de código | copiar padrões (hooks React Query, optimistic updates, testes), não dados |

**Sub-abas do novo módulo:**

```
minhasfinancas-resumo      → Resumo (dashboard + insights)      [fase 2+]
minhasfinancas-transactions→ Lançamentos (receita/despesa/transferência)
minhasfinancas-accounts    → Contas e saldos
minhasfinancas-statement   → Extrato
minhasfinancas-cards       → Cartões e faturas
minhasfinancas-budgets     → Orçamentos
minhasfinancas-goals       → Objetivos
minhasfinancas-reports     → Relatórios
minhasfinancas-settings    → Configurações (categorias, tags, responsáveis)
```

**Observação:** por ser módulo novo, ele começa vazio. Como extra futuro, vale um
botão "Importar categorias e responsáveis do módulo Finance" para não recadastrar.

---

## 1. Viabilidade geral

| Situação | Itens | Veredito |
|---|---|---|
| ✅ Totalmente viável | Lançamentos, contas, transferências, cartões, faturas, recorrência, parcelas, subcategorias, tags, extrato, orçamentos, objetivos, relatórios, exportação, gráficos, dashboard personalizável, perfis, anexos, edição em lote | ~70% das funcionalidades — fazer |
| ⚠️ Viável com esforço extra | Importação/conciliação OFX-CSV ✅, assistente de IA (Felix) ✅, relatório mensal inteligente ⚠️ (parcial), offline/sync ✅ | Foto do comprovante (vision) e XLS adiados |
| ❌ Não viável / fora de escopo | **Open Finance** (certificação no Open Finance Brasil), **recursos nativos** (notificações/SMS Android, Siri/iOS, cupons fiscais, Google Agenda), **app desktop** (PersonalControl já é web — PWA cobre) | Descartar ou substituir |

**Substituições:** Open Finance → **importação de OFX/CSV com conciliação**; app
desktop → PWA; Siri/notificações → FAB rápido + IA lendo foto do comprovante.

---

## 2. Inventário das funcionalidades do Minhas Finanças × status no módulo novo

Legenda: ✅ existe no Finance (padrão a copiar) · ⚠️ parcial · ❌ previsto no novo módulo

### 2.1 Lançamentos
| Funcionalidade | Status | Fase |
|---|---|---|
| Receitas e despesas ilimitadas | ✅ | 3 |
| Status PAGO/PENDENTE + "Pagar agora" | ✅ | 3 |
| Transferências entre contas | ✅ | 2 |
| Categorias + subcategorias (2 níveis) | ✅ | 3 |
| Tags | ✅ | 3 |
| Transações fixas (recorrência) | ✅ | 3 |
| Parcelamento | ✅ | 3 |
| Reembolso/estorno (valores negativos) | ✅ | 3 |
| Edição/pesquisa em lote | ✅ | 3 |
| Anexos (comprovantes) | ✅ | 3 |
| Datas: competência, vencimento, efetivação | ✅ | 3 |
| Autocompletar categoria por palavra-chave | ✅ | 3 |
| Responsáveis/perfis | ⚠️ (CRUD nos Ajustes; campo no modal pendente) | 3/9 |

### 2.2 Contas e saldo
| Funcionalidade | Status | Fase |
|---|---|---|
| Contas (saldo inicial, cor, ícone, imagem) | ⚠️ (sem ícone/imagem) | 2 |
| Contas multimoeda (USD, EUR, ARS...) sem cotação | ✅ | 2 |
| Tipos de conta configuráveis (usuário adiciona os seus) | ✅ | 2 |
| Saldo atual/previsto por conta e consolidado | ✅ | 2 |
| Extrato detalhado com saldo diário | ✅ | 2 |
| Ajuste/reajuste de saldo | ⚠️ (via saldo inicial da conta) | 2 |

### 2.3 Cartões de crédito
| Funcionalidade | Status | Fase |
|---|---|---|
| Cartão com fechamento, vencimento, limite, conta vinculada | ❌ | 4 |
| Fatura: compras, parcelas, estornos, valor em aberto | ❌ | 4 |
| Pagar/antecipar/reabrir fatura | ❌ | 4 |

### 2.4 Orçamentos e objetivos
| Funcionalidade | Status | Fase |
|---|---|---|
| Orçamento por categoria/tag/conta, fixo ou % da receita | ✅ | 5 |
| Progresso, histórico e projeção | ✅ (projeção simplificada: histórico 6 meses) | 5 |
| Objetivos com valor/prazo, aportes e retiradas | ✅ | 5 |
| Vincular objetivo a conta (progresso automático) | ✅ (saldo atual da conta) | 5 |

### 2.5 Análises, dashboard e relatórios
| Funcionalidade | Status | Fase |
|---|---|---|
| Dashboard com KPIs, barras mensais e pizza por categoria | ⚠️ (KPIs + tabela no Resumo; gráficos na fase 6) | 2/6 |
| Insights (projeção, comparativo, alertas) | ⚠️ | 6 |
| Dashboard personalizável (escolha de cards) | ❌ | 6 |
| Relatórios com filtros avançados + salvar filtros | ❌ | 6 |
| Comparar períodos lado a lado | ❌ | 6 |
| Saúde Financeira / indicadores | ❌ | 6 |
| Exportação XLS/CSV/PDF | ❌ | 6 |

### 2.6 Importação / exportação
| Funcionalidade | Status | Fase |
|---|---|---|
| Importação OFX com sugestão de conciliação | ❌ | 7 |
| Importação CSV/XLSX com modelos personalizados | ❌ | 7 |

### 2.7 Inteligência Artificial (Felix)
| Funcionalidade | Status | Fase |
|---|---|---|
| Chat consultivo em linguagem natural | ✅ | 8 |
| Criar/efetivar lançamentos por linguagem natural | ✅ | 8 |
| Foto de comprovante → lançamento (OCR) | ❌ (adiada) | extra |
| Relatório inteligente mensal | ⚠️ parcial (resumo via chat `resumo_mes`) | 8 |

### 2.8 Multi-perfis, segurança e plataforma
| Funcionalidade | Status | Fase |
|---|---|---|
| Perfis separados (pessoal/família/empresa) | ⚠️ `mf_responsibles` | 3 |
| Sincronização multi-dispositivo / backup | ✅ (Supabase) | — |
| Offline-first | ⚠️ (Dexie/SyncEngine só em Música/Viagens) | 9 |
| Personalização de menu/módulos | ✅ (padrão do app) | 1 |
| App desktop | ✅ (é web; opcional PWA) | 9 |

---

## 3. Plano de desenvolvimento por fases

### ✅ Fase 0 — Fundação do modelo de dados (2–3 dias) — **ARQUIVO CRIADO**
**Arquivo:** `supabase/migrations/20261003000000_create_minhas_financas_module.sql`

12 tabelas novas com prefixo `mf_` (nenhuma tabela existente é alterada):

| Tabela | Propósito |
|---|---|
| `mf_accounts` | Contas e cartões (tipo `CARTAO` usa fechamento/vencimento/limite) |
| `mf_categories` | Categorias com `parent_id` (subcategorias) |
| `mf_responsibles` | Quem paga/recebe (perfis) |
| `mf_transactions` | Lançamentos: tipo RECEITA/DESPESA/TRANSFERENCIA, datas de competência/vencimento/efetivação, recorrência, parcelas, anexo |
| `mf_tags` / `mf_transaction_tags` | Tags e vínculo com lançamentos |
| `mf_budgets` | Orçamentos (fixo ou % da receita; escopo categoria/tag/conta) |
| `mf_goals` / `mf_goal_contributions` | Objetivos e aportes/retiradas |
| `mf_saved_reports` | Relatórios salvos (filtros em JSONB) |
| `mf_import_batches` / `mf_import_rows` | Importação OFX/CSV com conciliação |

Também inclui: índices (`payment_date`, `due_date`, conta+data, etc.), triggers de
`updated_at` e **RLS completa** (`user_id = auth.uid()` nas 12 tabelas).

**Aplicada em:** 03/10/2026 via MCP (`apply_migration`, nome `create_minhas_financas_module`) —
12 tabelas criadas com RLS habilitado. Arquivo local: `supabase/migrations/20261003000000_create_minhas_financas_module.sql`.

---

### ✅ Fase 1 — Scaffold do módulo (1–1,5 dias) — **CONCLUÍDA**
- Pasta `src/components/MinhasFinancas/`: container `MinhasFinancas.jsx`, `MFResumo.jsx` (cards com contagens reais via Supabase/RLS), `MFPlaceholder.jsx` (abas futuras) + teste `MinhasFinancas.test.jsx`.
- Hook `src/hooks/useMinhasFinancas.js` (`useMFOverview` — React Query).
- Registrado em `Dashboard.jsx` (menu com ícone Wallet, 9 sub-abas, rota inicial `minhasfinancas-resumo`, título, render e fallback) e `Launchpad.jsx` (card ciano `#06b6d4`).
- `i18n.js`: `nav.minhasfinancas(+_desc)`, `nav.sub.minhasfinancas.*` e namespace `minhasfinancas` nos 3 idiomas.
- Testes: novos 2 passam; `Dashboard.test.jsx` atualizado (ícones novos no mock). Build de produção OK.

### ✅ Fase 2 — Contas, saldos, transferências e extrato (5–7 dias) — **CONCLUÍDA**
- CRUD de contas (`mf_accounts`): tabela mensal com saldo inicial, receitas, despesas,
  transferências crédito/débito, saldo e previsão + totais + busca (`MFContas.jsx`).
- Modal de conta (`MFAccountModal.jsx`): nome, tipo (6 padrões + personalizados), saldo inicial, cor,
  dias de fechamento/vencimento e limite (quando tipo `CARTAO`); exclusão com confirmação
  e bloqueio quando há lançamentos (FK RESTRICT → mensagem amigável).
- Modal de **transferência** (`MFTransferModal.jsx`): origem/destino, valor, data e descrição —
  grava `mf_transactions.type = 'TRANSFERENCIA'` movimentando as duas contas.
- Resumo redesenhado na referência do app original (`MFResumo.jsx`): navegação de mês,
  4 KPIs (Saldo nas contas, Total recebido, Total gasto, Saldo previsto) com **% vs mês anterior**
  e tabela de contas do mês com totais.
- `minhasfinancas-statement`: extrato (`MFExtrato.jsx`) agrupado por dia, com saldo corrente,
  filtro por conta e sinal correto de transferências (neutro no consolidado).
- Mês selecionado compartilhado entre as telas do módulo (estado no container).
- Hooks: `useMFAccounts`, `useMFMonthSummary`, `useMFStatement` + mutações
  (create/update/delete conta, transferência) com invalidação de cache.
- i18n: ~80 novas strings × 3 idiomas. Testes: 6 novos (Resumo, Extrato, Contas CRUD/exclusão);
  suíte completa verde (133 testes), lint e build OK.
- *Pendências menores:* imagem/ícone de conta via Storage e % de progresso das contas-cartão
  ficaram para a Fase 4.

**Aceite:** 2 contas + transferência → saldo e extrato corretos.

#### Extra — Contas multimoeda (sem cotação) — **CONCLUÍDA**
- **Decisão de produto:** moeda mora na entidade da conta (`mf_accounts.currency`, ISO 4217,
  migração `20261003000001_add_currency_to_mf_accounts` aplicada em 03/10/2026). **Sem cotação/API**:
  valores sempre exibidos na moeda nativa da conta; totais com moedas mistas aparecem **separados por
  moeda** (`R$ 1.000,00 · US$ 200,00`) — nunca somamos moedas diferentes.
- **Seletor de moeda por tela** (Resumo, Contas, Extrato): padrão "Todas as moedas" (agrupa) ou uma
  moeda específica (filtra contas daquela moeda). Relatórios e gráficos da Fase 6 herdam esse padrão.
- Modal de conta com campo **Moeda** (14 moedas + rótulos via `Intl.DisplayNames` nos 3 idiomas);
  badge da moeda na linha da tabela; formatação `Intl` por moeda (`formatMoney(value, currency)`).
- **Transferências apenas entre contas da mesma moeda** (sem cotação não há troca de câmbio):
  origem/destino filtrados pela moeda + validação com toast de erro.
- Extrato: saldo corrente exibido só quando o escopo tem **uma única moeda** (`mixed: true` oculta);
  valores por item na moeda da conta.
- Testes: +4 (`MFMultiCurrency.test.jsx`) — agrupamento, filtro por tela, nativo + totais e
  restrição de transferência.

#### Extra — Tipos de conta configuráveis + seletor de moeda com bandeiras — **CONCLUÍDA**
- **Tipos de conta configuráveis** (pedido do usuário): os 6 tipos padrão continuam como código
  (`CORRENTE`, ...) e o usuário pode **adicionar tipos personalizados** (nome + emoji) em
  `mf_account_types` (migração `20261003000002_mf_custom_account_types` aplicada em 04/10/2026,
  RLS `user_id = auth.uid()`, nome único por usuário). `mf_accounts.account_type` passou a aceitar
  nomes livres (CHECK relaxado para 1–60 chars).
- Modal: select com optgroups (Padrões/Personalizados) + botão **"+ Novo tipo"** com formulário
  inline (ícone + nome), validações (vazio/reservado/duplicado) e chips de gestão (remoção com
  confirmação; contas que usam o tipo mantêm o rótulo salvo).
- Tabela de Contas: badge de tipo (ícone + rótulo) ao lado da badge de moeda.
- **Moeda com bandeiras** (pedido do usuário): novo `MFCurrencySelect.jsx` — gatilho com
  bandeira + código + nome e popover com **busca**, bandeira, nome localizado
  (`Intl.DisplayNames`) e símbolo de cada moeda (helpers `currencyFlag/currencyName/currencySymbol`,
  mesmo padrão visual do módulo Viagens). Substitui o `<select>` no modal de conta e no
  filtro por tela das 3 telas (`MFCurrencyFilter` virou wrapper, mantém `mf-currency-filter`).
- i18n: +14 strings × 3 idiomas. Testes: +8 (`MFCurrencySelect.test.jsx`,
  `MFAccountTypes.test.jsx`) — bandeiras/busca, criação de tipo, validações e remoção.

### ✅ Fase 3 — Lançamentos avançados (6–8 dias) — **CONCLUÍDA**
- Modal com subcategoria, tags, parcelas (gera N filhos), recorrência, 3 datas, anexo, estorno/reembolso.
- Configurações: categorias (com subníveis), tags, responsáveis.
- Edição e mover de categoria em lote; autocomplete por palavra-chave.
- **Aceite:** parcelar em 12x, estornar a 5ª, filtrar por tag, anexar comprovante.

**Implementação (04/10/2026):**
- **Tela Lançamentos** (`MFTransacoes.jsx`, aba `minhasfinancas-transactions`): lista do mês com
  filtros (busca por descrição, status, tipo, conta, categoria — pai inclui filhos —, tag, moeda),
  badges de categoria/tags/parcela (`2/12`)/recorrência/anexo, totais separados por moeda no rodapé,
  ações por linha (**pagar/despagar**, **estorno**, editar, excluir) e **edição em lote**
  (seleção múltipla → marcar pago, mover categoria, excluir).
- **Estorno/reembolso**: cria lançamento de valor **negativo** na mesma data de competência
  (`amount <> 0` já era permitido pelo schema; o delta por tipo deixa o estorno verde na tela).
- **Modal de lançamento** (`MFTransacaoModal.jsx`): tipo receita/despesa, descrição, valor
  (máscara), conta, categoria em 2 níveis (filhos indentados `└`), tags (chips + criação rápida),
  3 datas (competência/vencimento/efetivação), status, notas, **parcelamento** (gera N filhos com
  `installments_current/total` + `parent_transaction_id`, datas avançadas com clamp de mês),
  **recorrência** (WEEKLY/MONTHLY/YEARLY gera 12 ocorrências), **anexo** (upload no bucket
  `mf-attachments`, ver via signed URL, remover) e **autocompletar de categoria/tipo por
  palavra-chave** (mapping padrão tipo Finance, sugere só se o usuário não escolheu).
- **Bucket `mf-attachments`** (migração `20261004000001_mf_attachments_bucket`, 10 MB,
  imagens/PDF, políticas SELECT/INSERT/DELETE do dono).
- **Ajustes** (`MFConfig.jsx`, aba `minhasfinancas-settings`): CRUD completo de **categorias**
  (2 níveis + botão de subcategoria na linha, tipo DESPESA/RECEITA/AMBAS, cor, validação de
  duplicado no mesmo nível), **tags** (nome+cor, duplicado bloqueado) e **responsáveis**
  (nome/e-mail/cor, perfil principal única) — substitui o placeholder da aba.
- Hooks: `useMFLancamentos`/`useMFCategories`/`useMFTags`/`useMFResponsibles`, mutations de
  criar/editar/excluir (criar aceita array p/ parcelas), `useMFSetTransactionStatus`,
  `useBulkMFTransactions`/`useBulkDeleteMFTransactions` (`.in('id', ids)`), helper
  `addMonthsISO` (clamp 31/01 → 28/02).
- i18n: +98 strings × 3 idiomas (lançamentos + ajustes).
- Testes: +17 (`MFTransacoes.test.jsx` 9, `MFConfig.test.jsx` 8) — lista/filtros/pagar/estorno/
  parcelas 12x/autocomplete/anexo/edição/lote; seções/criação/duplicado/edição/exclusão.
- **Suíte: 33 arquivos, 155 testes verdes**; ESLint limpo.

### ✅ Fase 4 — Cartões de crédito e faturas (4–6 dias) — **CONCLUÍDA**
- Conta tipo `CARTAO` com fechamento/vencimento/limite/conta vinculada.
- Tela de fatura (compras, parcelas, estornos, em aberto), pagar/antecipar (gera transferência).
- **Aceite:** compra com fechamento dia 10 → fatura de vencimento dia 20 → pagar.

**Implementação (04/10/2026):**
- Migração `20261004000002` (aplicada via MCP): `mf_accounts.linked_account_id`
  (FK em si, `ON DELETE SET NULL`) — conta que paga a fatura.
- **Modal de conta**: quando tipo = CARTAO, além de fechamento/vencimento/limite agora
  inclui **conta vinculada** (select de contas não-cartão, testids `mf-card-*`).
- **Cálculo de fatura** (helpers puros em `useMinhasFinancas.js`):
  - `cardCycles(card, refISO)`: ciclos ancorados no fechamento (dia C) com regra do
    emissor — vence dia D do mesmo mês se D ≥ C, senão no mês seguinte; clamp de dias
    (29/30/31); período = dia seguinte ao fechamento anterior .. fechamento.
  - `buildCardInvoices({card, transactions, refISO})`: faturas fechadas (últimas N,
    **pagamento alocado em FIFO** dos repasses `TRANSFERENCIA` de entrada → status
    PAGA/EM_ABERTO/VENCIDA com valor em aberto) + **fatura corrente** (desde o último
    fechamento, vence na data do próximo ciclo).
- **Tela Cartões** (`MFCartoes.jsx`, aba `minhasfinancas-cards` — deixou de ser
  placeholder): lista de cartões (limite/disponível/fechamento/vencimento, bandeira da
  moeda), filtro de moeda por tela, chips de fatura (corrente + fechadas com vencimento
  e status), detalhe (período, vencimento, total/pago/em aberto, compras com badge de
  parcela, estorno em verde), **Pagar fatura** e **Antecipar corrente** → cria
  `TRANSFERENCIA` (origem = conta vinculada, destino = cartão, `status = 'PAGO'`);
  sem conta vinculada, aviso `card_link_required` e sem inserção.
- i18n: +31 strings × 3 idiomas. Testes: +5 (`MFCartoes.test.jsx` — aceite 10→20,
  pagamento gera transferência, fatura paga sem botão, antecipação pelo total, cartão
  sem vínculo bloqueado; relatório congelado em 04/10/2026 com `vi.useFakeTimers({toFake:['Date']})`).

### ✅ Fase 5 — Orçamentos e objetivos (5–7 dias) — **CONCLUÍDA**
- `minhasfinancas-budgets`: limites com progresso, alerta de estouro, histórico.
- `minhasfinancas-goals`: metas, aportes/retiradas, vínculo a conta.
- Cards no dashboard.
- **Aceite:** orçamento R$ 800 em Alimentação, gastar R$ 900 → alerta.

**Implementação (04/10/2026):**
- **Tela Orçamentos** (`MFOrcamentos.jsx`): cards com progresso colorido (<80% verde,
  ≥80% âmbar, estourado vermelho), **alerta de estouro** consolidado no topo, resumo do mês
  (total gasto vs total limite), **histórico de 6 meses** em barras por orçamento e CRUD via
  `MFBudgetModal` (escopo global/categoria/tag/conta, período com default no mês selecionado,
  modo **fixo** ou **% da receita**, validações de período/percentual/duplicado).
- **Sem cotação**: seletor de moeda da tela **sem "todas as moedas"** (uma moeda por vez —
  gasto e limite nunca cruzam moedas); default BRL (ou primeira moeda das contas).
- **Escopo**: categoria pai inclui subcategorias; estornos reduzem; cancelados ignorados;
  pendentes contam (comprometido).
- **Tela Objetivos** (`MFObjetivos.jsx`): cards com progresso, badge Concluído/Ativo/Arquivado,
  prazo, **aportes/retiradas** (modal de movimento com tipo/data/observações; marca
  `COMPLETED` ao atingir a meta) e histórico de movimentos; CRUD via `MFGoalModal`.
  **Vinculado a conta → progresso automático pelo saldo da conta** (`useMFAccountBalances`,
  PAGO até hoje); sem vínculo → inicial + aportes − retiradas (`goalCurrentAmount`).
- **Cards no Resumo** (`MFResumo`): "Orçamento do mês" (contagem + estouros + valores com
  moeda única) e "Objetivos" (meta em destaque com barra) — com atalhos para as abas.
- Hooks: `useMFBudgets/useCreate|Update|DeleteMFBudget`, `useMFBudgetWindow` (janela de
  6 meses com tags), helpers puros `budgetSpent`/`budgetLimit`, `useMFGoals/*`,
  `useMFGoalContributions`, `useAdd|DeleteMFGoalContribution`, `useMFAccountBalances`,
  `goalCurrentAmount`. Sem migração (tabelas já existiam da Fase 0).
- i18n: +60 strings × 3 idiomas. Testes: +10 (`MFOrcamentos.test.jsx` 6 — aceite 800/900,
  % da receita, criação, validações, exclusão, fora do período — e `MFObjetivos.test.jsx` 4 —
  progresso manual/automático, aporte, criação, exclusão de movimento).

### ✅ Fase 6 — Relatórios, gráficos e exportação (5–7 dias) — **CONCLUÍDA**
- Filtros avançados, salvar filtros (`mf_saved_reports`), comparar períodos.
- Gráficos (Recharts): evolução, ranking, saúde financeira.
- Exportação CSV/XLS/PDF (`jspdf` + `jspdf-autotable` já no projeto).
- Dashboard personalizável.
- **Aceite:** relatório jan–jun por categoria → salvar → exportar PDF.

**Implementação (04/10/2026):**
- **Tela Relatórios** (`MFRelatorios.jsx`, aba `minhasfinancas-reports` — deixou de ser
  placeholder): filtros de **período em meses** (de/até), tipo (todos/receitas/despesas),
  **categoria com filhos**, conta, tag e **moeda única por tela** (sem cotação); "Limpar
  filtros" volta aos defaults (últimos 6 meses).
- **KPIs**: receitas, despesas, saldo (com variação % vs. **período anterior** do mesmo
  tamanho), **taxa de poupança** e contagem. Transferências e cancelados ficam de fora;
  outras moedas são excluídas pelo seletor.
- **Gráficos (Recharts)**: evolução mensal (barras receitas × despesas) e **ranking de
  despesas por categoria** (barras horizontais coloridas, top 6, "Sem categoria" agrupado).
- **Filtros salvos**: salvar (`mf_saved_reports.filters` JSONB com as 7 chaves), aplicar
  por chip e excluir com confirmação.
- **Exportação**: CSV (`;` com aspas escapadas + BOM para Excel, cabeçalhos i18n via
  `buildCsv`/`downloadText`) e **PDF** (`jspdf` + `jspdf-autotable`, título/período/KPIs/
  tabela — padrão do módulo Viagens) em `mfReportPdf.js`; lógica pura em `mfReports.js`
  (filtros, KPIs, série mensal, ranking, CSV).
- i18n: +35 strings × 3 idiomas. Testes: +6 (`MFRelatorios.test.jsx` — KPIs padrão,
  aceite jan–jun por categoria com filhos, salvar filtro, aplicar/excluir salvo, CSV,
  PDF; Date congelado, `jspdf` mockado por classe com rastro de instâncias).
- Simplificações: "dashboard personalizável" (widgets arrastáveis) e exportação XLS
  ficaram fora — CSV abre no Excel; XLS pode entrar no polimento (Fase 9).

### ✅ Fase 7 — Importação OFX/CSV e conciliação (5–8 dias) — **CONCLUÍDA**
- Upload → `mf_import_batches`/`mf_import_rows` → mapeamento de colunas → sugestão por valor+data+descrição → revisão → gravação em lote.
- **Aceite:** importar extrato real, conciliar por sugestão, salvar.

**Implementação (04/10/2026):**
- **Tela Importar** (`MFImportar.jsx`, aba `minhasfinancas-import` — nova sub-aba com
  ícone `Upload` no Dashboard): conta de destino (default primeira conta) + upload de
  `.ofx`/`.txt`/`.csv` com leitura via `file.text()` (fallback `FileReader`).
- **Parsing puro** (`mfImportParse.js`): `parseOfx` (SGML/XML, `STMTTRN`, `DTPOSTED`
  compacto, `CURDEF`), `parseCsv` (delimitador `; , tab |`, aspas, BOM),
  `guessCsvMapping` (sinônimos pt/en), `mapCsvRows` (datas DD/MM + MM/DD + ISO,
  valores pt/en/contabilidade, tipo por sinal ou coluna, inversão de sinal),
  `parseAmount`/`parseFlexibleDate` reutilizáveis.
- **Conciliação**: `suggestMatches` — mesma assinatura de valor (±0,01), data dentro de
  **±3 dias** e `similarDescription` (sem acento/caixa, 50% dos tokens); transferências e
  cancelados fora do pool. Linha com sugestão começa **"Ignorar"** (evita duplicidade);
  sem sugestão começa **"Importar"**; toggle por linha com resumo (total/importar/sugestões).
- **Gravação em lote** (`useRunMFImport`): lote `PENDING` → `mf_transactions` (PAGO) →
  `mf_import_rows` (MATCHED com `imported_transaction_id` / IGNORED com
  `suggested_transaction_id`) → lote `COMPLETED`. Histórico das últimas 10 importações.
- **Migração `20261004000003` (aplicada via MCP)**: `mf_import_batches.account_id`
  (FK para `mf_accounts`, `ON DELETE SET NULL`) — a conta de destino do lote, que não
  existia no schema da Fase 0; + índice de histórico `(user_id, created_at DESC)`.
- i18n: +40 strings × 3 idiomas (inclui `nav.sub.minhasfinancas.import`). Testes: +16
  (`mfImportParse.test.js` puro ×10 + `MFImportar.test.jsx` ×6: aceite CSV completo com
  payloads das 4 tabelas, toggle de decisão, OFX sem mapeamento, mapeamento manual,
  arquivo inválido, histórico).
- **Bug corrigido**: `useEffect` com `setDecisions` dependendo de arrays derivados de
  `data = []` (identidade nova por render durante `isPending`) causava **loop infinito
  síncrono dentro de `act()`** (vitest “travado” sem saída). Solução: **deps por
  assinatura string** das linhas — padrão a reutilizar em efeitos derivados de dados
  Query pendentes.

### ✅ Fase 8 — Assistente de IA "Felix" (5–8 dias) — **CONCLUÍDA**
- Edge Function `finance-ai` (Deno) com chave de LLM em secret e JWT do usuário (RLS preservada).
- Tools: `buscar_lancamentos`, `criar_lancamento`, `efetivar_lancamento`, `resumo_mes`.
- Foto de comprovante → sugestão de lançamento; relatório inteligente mensal *(adiados — ver implementação)*.
- **Aceite:** "quanto gastei em alimentação em junho?" → número correto.

**Implementação (04/10/2026):** — **nome do assistente: Felix** 🐱 (os gatinhos do app)
- **Edge Function `finance-ai`** (`supabase/functions/finance-ai/index.ts`, deploy via CLI em
  `xfcehxyhhmuscodilfha`, `verify_jwt: true`): mesmo padrão/secret da `baby-ai-insights` do
  projeto babylog — **Gemini `gemini-3.6-flash` + secret `GEMINI_API_KEY`** (fallbacks
  GOOGLE_AI_KEY/SUPABASE_GEMINI_KEY/GEMINI_KEY), 30s de timeout por chamada, **fallback**
  `{configured:false}` quando a secret falta (cliente mostra i18n).
- **Function calling** com loop de até 8 rodadas e 4 tools executadas **com o JWT do usuário**
  (anon key + Authorization → RLS vale; sem service role):
  `buscar_lancamentos` (filtros período/tipo/categoria/status/texto), `resumo_mes` (receitas,
  despesas, saldo, pagas/pendentes, ranking por categoria — atende o aceite), `criar_lancamento`
  (validação + `user_id` do JWT; default conta/contexto), `efetivar_lancamento` (status PAGO).
  O system prompt recebe **IDs reais de contas/categorias** como contexto (o LLM não inventa IDs).
- **Cliente**: `mfFelixRequest.js` (helpers puros `buildFelixRequest`/`felixReplyOf`),
  **`MFFelix.jsx`** (aba `minhasfinancas-felix`, ícone `MessageCircle`): chat com balões,
  estado "pensando", sugestões clicáveis, limpar conversa, erros/sem-secret exibidos no chat.
- i18n: +12 strings × 3 idiomas (inclui `nav.sub.minhasfinancas.felix`). Testes: +8
  (`mfFelixRequest.test.js` ×3 + `MFFelix.test.jsx` ×5: envio com contexto de IDs, sem secret,
  erro de invoke, sugestões, limpar).
- **Ativação:** definir a secret no projeto PersonalControl (secrets são POR PROJETO — a do
  babylog não vale aqui): `supabase secrets set GEMINI_API_KEY=<chave> --project-ref xfcehxyhhmuscodilfha`
  (usuário assumiu essa tarefa).
- **Bug de resolução corrigido (Windows)**: `import './MFFelix'` sondava `MFFelix.js` e, por FS
  case-insensitive, casava com `mfFelix.js` (default export inexistente → componente
  `undefined`). Solução: helper renomeado para `mfFelixRequest.js` — **nunca nomear helper
  `mfX` cujo case-fold colida com componente `MFX` neste projeto**.
- Foto do comprovante (Gemini vision) e relatório inteligente mensal: adiados (extra futuro).

### Fase 9 — Extras e polimento (4–6 dias) — ✅ concluída em 04/10/2026
- **E2E Playwright**: `tests-e2e/minhasfinancas.spec.js` — 4 testes verdes (resumo + navegação
  por 10 telas, criação de lançamento, criação de conta, chat do Felix); padrão de store em
  memória por tabela `mf_*` com auth/functions mockados.
- **XLS (SpreadsheetML)**: `mfReportXls.js` + botão XLS nos Relatórios (abas Resumo e
  Lançamentos, `.xls` sem dependência nova; CSV `;`+BOM e PDF já da Fase 6).
- **Dashboard personalizável**: widgets `kpis/accounts/budgets/goals` com ordem e visibilidade
  em localStorage (`mf_dashboard_widgets`), botão de personalizar no Resumo.
- **Pontos de restauração**: tabela `mf_restore_points` (migração `20261004000004`), snapshot
  das 11 tabelas core (sem `mf_import_*` e sem os pontos), seção em Ajustes — salvar,
  restaurar (DELETE filhos→pais + INSERT pais→filhos) e excluir com confirmação.
- **Perfis separados**: tabela `mf_profiles` + `mf_accounts.profile_id` (migração
  `20261004000005`, `ON DELETE SET NULL`), contexto `MFProfileContext` com perfil ativo em
  localStorage, trocador no topo do módulo (só aparece com perfis cadastrados), CRUD em
  Ajustes, campo "Perfil" no modal de conta e filtro de escopo nas leituras de
  contas/lançamentos/extrato/saldos/relatórios (orçamentos e objetivos filtrados por conta;
  sem conta = global). Sem perfil ativo = "Todos os perfis" (comportamento anterior intacto —
  testes montados fora do provider não mudam).
- **Offline (Dexie + `SyncEngine`)**: Dexie v5 com 13 tabelas `mf_*` (junção
  `mf_transaction_tags` com PK composto). Leituras passam por `mfSelect`
  (`src/lib/offline/mfOffline.js`): offline lê o Dexie reaplicando filtros/ordens do servidor;
  online roda a query e cacheia (erro online continua em estado de erro). Escritas de contas,
  transferências e lançamentos passam por `mfMutate`: offline gravam no Dexie e enfileiram em
  `sync_queue` (drain pelo `SyncEngine` ao voltar a conexão); online mantêm o cache coerente.
  `MfSyncProvider` baixa as tabelas em bloco (clear+put) ao abrir o módulo e o container
  invalida as queries no evento `database-synced`. A escrita offline cobre contas,
  transferências, lançamentos (criar/editar/pagar/excluir/em lote) e vínculos de tag — a junção
  `mf_transaction_tags` tem PK composto: `mfMutate` não gera `id`/`updated_at` nela, a ação
  `deleteLinks` apaga os vínculos por `transaction_id` e o drain da fila trata insert/delete
  com case especial. Demais mutations (categorias, tags, orçamentos, objetivos...) seguem
  exigindo conexão.
- **PWA**: `public/sw.js` (navegação com fallback de shell offline, assets cache-first,
  APIs Supabase sempre rede) registrado só em produção no `src/main.jsx`; `manifest.json` e
  ícones já existentes.
- Qualidade: suíte **47 arquivos / 259 testes** verdes, ESLint limpo, E2E 4/4, `npm run build` OK.

### Migração de dados reais — ✅ aplicada em 04/10/2026 (produção)

Importação pontual dos exports do app original (`docs/Extratos/`) para as tabelas `mf_*` do
usuário `9659a65c…` (único com dados no app) via Management API (16 arquivos SQL, 0 falha);
gerador `docs/Extratos/gen-mf-migration.mjs` + runner `docs/Extratos/run-mf-sql.ps1`
(SQL derivado regenerável, não versionado).

- **Fontes**: `_Despesas.csv`/`_Receitas.csv` (XLSX→CSV, 8272+3630 linhas), `Transferências.csv`
  (1417), marcação "não somada" só no HTML (font `#757575` — flag inexistente no nosso schema,
  tudo importado como normal).
- **Mapeamentos**: `payment_date`/`due_date` = **vencimento** (extrato original agrupa por
  vencimento — validado com "Pagamento Deisi" venc 24/08/receb 06/08 sob header 24/AGO),
  `effective_date` = data pagamento/recebimento, status Efetivada→PAGO; despesa com cartão →
  `account_id` = conta do cartão (fatura), sem cartão → `Conta`; categoria "Cartão" + descrição
  `Fatura*|Contas acumuladas|Pagamento cart*` (7 linhas, cartão via campo ou subcategoria) →
  TRANSFERENCIA conta→cartão; parceladas `N/M` → `installments_*` + `parent` por encadeamento
  em série (âncora `1/M`, anexação à série compatível mais próxima por data — 2121 com badge,
  1517 com pai); "Fixa mensal"→MONTHLY (729); contas em BRL (inclusive "Euro"/"Nomad dollar");
  tipos por heurística de nome (poupança/investimento/dinheiro/caixinha-cartão-benefício);
  cartões com `linked_account_id` = pagador; tags split por vírgula (19 tags, 85 vínculos).
- **Validação (bateu ao milésimo)**: DESPESA 8264 = R$ 973.646,07 (= 977.367,48 − 3.721,41 de
  faturas→transferência), RECEITA 3630 = R$ 1.109.504,60 (total com não somadas do HTML),
  TRANSFERENCIA 1424, total 13.318 linhas; 72 contas, 245 categorias; consolidado pago
  R$ 140.529,96 vs saldo final do extrato original R$ 143.440,49.
- **Ressalvas**: 1 linha "Canecas" com valor 0 descartada (CHECK `amount <> 0`, efeito nulo;
  único aviso do gerador); diferença de saldo vs extrato original ≈ R$ 2,9 mil por saldos
  iniciais das contas não constarem nos exports (`initial_balance` = 0, ajustável por conta);
  flag "não somadas" (R$ 214k D / R$ 171k R) não tem coluna no schema — futura feature se
  quiser filtrar esses lançamentos dos totais.
- **Correção UTF-8 (04/10/2026)**: a 1ª passada gravou U+FFFD ("CDB Ita●") em 19 contas,
  64 categorias, 4 tags e 5.846 lançamentos — causa: `Invoke-RestMethod` do PowerShell 5.1
  codifica o body como Latin-1 sem `charset`. Runner corrigido (body em bytes UTF-8 +
  `charset=utf-8` no header) e processo tornado idempotente com `00_wipe.sql` (DELETE das 5
  tabelas antes do insert); reexecução completa validada (0 U+FFFD, `CDB Itaú` =
  `43444220497461c3ba`, 13.318 linhas e somas idênticas).

### Drill-down de conta — ✅ implementado em 04/10/2026 (extra)

Clicar numa linha de **Contas** abre `MFAccountDetail`: movimentações do mês separadas em
**Agendado** (PENDENTE) e **Realizado** (PAGO) com total por seção, chips de saldo/previsão/
receitas/despesas (mesma fonte da tabela), navegação mês a mês (a conta selecionada é mantida
por ref durante a troca de mês), transferências exibidas com o lado da conta (+/−) e
contraparte, cancelados excluídos e clique num lançamento abrindo `MFTransacaoModal`.
i18n pt/en/es (chaves `acct_det_*`), testes unitários (+5) e E2E do módulo verdes.

---

## 4. Estimativa consolidada

| Fase | Escopo | Esforço | Status |
|---|---|---|---|
| 0 | Schema/migrações (12 tabelas, RLS, índices) | 2–3 dias | ✅ aplicada em 03/10/2026 |
| 1 | Scaffold do módulo (menu, rotas, i18n, hooks) | 1–1,5 dias | ✅ concluída em 03/10/2026 |
| 2 | Contas, transferências, extrato | 5–7 dias | ✅ concluída em 03/10/2026 |
| 3 | Subcategorias, tags, recorrência, parcelas, lote, anexos | 6–8 dias | ✅ concluída em 04/10/2026 |
| 4 | Cartões e faturas | 4–6 dias | ✅ concluída em 04/10/2026 |
| 5 | Orçamentos e objetivos | 5–7 dias | ✅ concluída em 04/10/2026 |
| 6 | Relatórios, gráficos, exportação | 5–7 dias | ✅ concluída em 04/10/2026 |
| 7 | Importação OFX/CSV + conciliação | 5–8 dias | ✅ concluída em 04/10/2026 |
| 8 | Assistente de IA (Felix) | 5–8 dias | ✅ concluída em 04/10/2026 |
| 9 | Extras (perfis, offline, PWA, E2E, XLS, dashboard) | 4–6 dias | ✅ concluída em 04/10/2026 |
| | **Total** | **~42–62 dias** (≈ 2–3 meses full-time) | |

**Ordem recomendada:** `0 → 1 → 2 → 3 → 5 → 4 → 6 → 7 → 8 → 9`
**MVP utilizável:** fases 0 + 1 + 2 + 3 + 5 (~4 semanas).

---

## 5. Pendências e riscos

1. ~~Aplicar a migração da Fase 0~~ — **concluído.** O MCP agora tem dois servidores ativos
   (`supabase-personalcontrol` + `supabase-babylog`), configurados no
   `~/.config/opencode/opencode.jsonc` (formato com servers direto em `mcp`, que é o que o
   CLI 1.16.2 valida — o formato `mcp.servers` era rejeitado).
2. **Módulo começa vazio** — decidir se criamos o botão "importar do módulo Finance".
3. **Custo de IA (fase 8)** — chave de API + limite de "créditos" por usuário.
4. **Open Finance** — fora de escopo; OFX é a alternativa.
5. **RLS** — todo acesso do app deve manter `user_id = auth.uid()` (já garantido no schema).
6. **Conta padrão** — definição de conta "Não atribuída" para lançamentos sem conta.

---

## 6. Checklist técnico do repositório (por fase, padrão do repo)

1. Componentes em `src/components/MinhasFinancas/` + teste `*.test.jsx` colado (Vitest/Testing Library, mock em `src/tests/mocks/supabaseMock.js`).
2. Hooks React Query em `src/hooks/useMinhasFinancas*.js` com optimistic updates.
3. `src/components/Dashboard.jsx`: import, `defaultMenuItems` (l.58), `moduleSubItems` (l.69), `getModuleInitialTab` (l.106), bloco de render (l.611+), fallback (l.664), título (l.543).
4. `src/components/Launchpad.jsx`: `moduleData` (l.17) e `getModuleInitialTab` (l.27).
5. `src/i18n.js`: strings nos 3 idiomas (pt/en/es).
6. Migração SQL em `supabase/migrations/` com RLS + índices (nunca editar migração já aplicada — criar nova).
7. Opcional: CSS em `src/index.css`, E2E em `tests-e2e/`.

---

## 7. Fila de trabalho (05/10/2026)

Itens ativos, na ordem de atendimento:

1. ~~Erros de console no app (feedback 05/10)~~ — **concluído (diagnóstico)**:
   - **LockManager `lock:sb-…-auth-token` "immediately failed"** — causa raiz no
     `@supabase/auth-js`: `_autoRefreshTokenTick` adquire o lock com `ifAvailable`
     (`_acquireLock(0)`); com **mais de uma aba aberta**, outra aba segura o lock no momento
     do `visibilitychange` e o tick rejeita. É comportamento intencional: o refresh é feito
     pela aba que detém o lock e o token sincroniza via localStorage — **sem impacto
     funcional**. A versão travada no repo (**auth-js/supabase-js 2.103.3**) **já engole esse
     erro** no `catch` do tick (`isAcquireTimeout` → só debug) — confirmado no prebundle do
     Vite (`node_modules/.vite/deps/@supabase_supabase-js.js`). O uncaught no console veio
     de **aba/bundle antiga** (aberta antes da atualização de dependências, ou build antigo).
     **Ação**: recarregar com Ctrl+Shift+R / fechar abas antigas; se aparecer no app
     publicado, republicar com o lockfile atual. Sem código novo a escrever.
   - **Falhas CORS com `status: (null)`** — status null = requisição nunca completou
     (camada de rede), não rejeição CORS do servidor. Descartados: service worker (só
     registra em PROD e ignora cross-origin em `public/sw.js`), múltiplos clients
     (`createClient` único em `src/lib/supabase.js:6`), mixed content. Padrão do log:
     estouro coletivo de TODOS os endpoints `/rest/v1/*` junto com `visibilitychange` →
     janela de rede indisponível (restauração de aba/após sono, VPN/proxy/extensão). O app
     se recupera sozinho (react-query retries). **Ação**: monitorar; se persistir, checar
     VPN/antivírus/adblock e Enhanced Tracking Protection do Firefox.
2. ~~Seletor de ícones do modal de conta~~ — **concluído**: catálogo de 15 → **62 arquivos**
   (`public/mf-brands/`; 36 novos do Tgentil/Bancos-em-SVG — Sicoob, Sicredi, Banrisul,
   Original, Safra, Pan, BMG, Pine, Daycoval, BRB, Nordeste, Cresol, Unicred, Ailos, Cora,
   InfinitePay, Efi, MagaluPay, RecargaPay, BK, Bees, BS2, Topázio, BV, Mercantil, Paulista,
   Let's Bank, Uniprime, Amazônia, Banestes, Quality, PagBank, BMP, Sulcredi, Tribanco,
   Bank of America — e `bb.svg` substituído pela versão com fundo) + 11 do simple-icons
   (Wise, Revolut, N26, Monzo, Starling, PayPal, Venmo, Cash App, Google Pay, Apple Pay,
   JCB) + fallbacks embutidos (iti, Nomad, iFood, Will, redes de cartão) = **71 marcas com
   nome buscável**; campo Ícone virou toggle + painel com busca (padrão tags) agrupando
   marcas e 23 glífeos; Cor ganhou `<input type="color">` além dos 8 presets; i18n ×3.
   **Validação**: ESLint 0, 294 testes, build OK, E2E 37/37.
3. ~~Separação contas × cartões (feedback 05/10)~~ — **concluído**:
   - **Contas lista só contas**: `MFContas` filtra `account_type !== 'CARTAO'`
     (linhas, totais, drill-down e o `accounts` do modal de transferência);
     **Cartões já listava só cartões**; no Resumo a separação já existia.
   - Criação coerente com as listas: "Cadastrar cartão" (topo e estado vazio)
     agora abre o modal direto na aba Cartões com o tipo travado em Cartão
     (nova prop `defaultType` esconde o campo Tipo); na criação comum de
     Contas o tipo **Cartão** saiu das opções (edição mantém todos — a
     conversão conta ↔ cartão continua possível). Resposta sobre **pagamento
     de fatura** enviada: "Pagar fatura" (corrente e fechada) criam a
     transferência conta → cartão. **Rename feito** (feedback 05/10):
     `card_anticipate` deixou de ser "Antecipar fatura" e agora diz **"Pagar
     fatura"** (pt/en/es; desc, confirm e toast alinhados a `card_payment`/
     `card_paid_toast`; a antecipação de parcelas — `anticipate_*` — é outro
     recurso e não mudou).
     **Investigação "nenhuma fatura paga?"**: os dados migrados contêm
     apenas **7 pagamentos de fatura em 6 anos** (jun/jul-2020 ×5,
     11/2022 e 07/2023 = R$ 3.721,41) + 6 pares "Pagamento antecipado/
     Adiantamento fatura" (despesa negativa no cartão, reduz a fatura).
     As "Transferência C6" mensais vão para **C6 Bank CORRENTE**
     (`endpointId` resolve homônimos para a corrente), não para o cartão —
     por isso o FIFO só marca PAGA faturas antigas (simulado em SQL:
     Inter/Nubank/Ourocard jul–ago/2020 PAGA) e a janela atual (6
     fechamentos) não exibe nenhuma. "Em aberto" = compras − pagamentos
     dos dados (Nubank fev/2025: R$ 184.694,70 = 278.178,55 de compras −
     3.080,21 pagos, acumulado até 28/02) — fiel ao export original.
4. ~~Mês selecionado não alterava valores (abril == outubro; feedback 05/10)~~
   — **concluído**: causa raiz dupla.
   - **REST do Supabase corta em 1000 linhas** (`db.max_rows=1000`; medido em
     produção: `content-range: 0-999/13318`). Consultas abertas
     (`lte('payment_date')`) devolviam **sempre as mesmas 1000 primeiras
     linhas** e qualquer mês montava os mesmos valores. Novo `mfSelectAll`
     pagina com `offset/limit` até a página **vazia** (checado na API real:
     `offset=13000` → 318 linhas; `offset=13318` → vazio), deduplica por `id`
     e encerra se o servidor ignorar o range. Aplicado em `useMFMonthSummary`
     (Contas/Resumo), `useMFStatement` (Extrato), `useMFAllTransactions`
     (faturas), `useMFReportData` (Relatórios), `useMFAccountBalances`
     (em aberto/objetivos) e `useMFBudgetWindow` (orçamentos).
   - **Fatura corrente presa em "hoje"**: `refISO = new Date()` ignorava o mês
     → novo `monthRefISO(monthKey)` (mês atual = hoje; demais = fim do mês) em
     `MFCartoes`, `MFAccountDetail` (faturas vinculadas) e `MFCardInvoices`
     (drill-down agora recebe `monthKey`); `buildCardInvoices` corta despesas
     em `payment_date <= refISO` (sem o corte, a fatura de abril englobava
     compras dos meses seguintes); "em aberto"/disponível passam a ser
     calculados até o mês selecionado (`balancesAsOf` substitui
     `useMFAccountBalances` na tela de Cartões).
   - **Validação**: ESLint 0, 49 arquivos/300 testes, build OK, E2E 37/37
     (+4/4 do spec MF após a trava de progresso). Novos testes: paginação ×4
     (`mfOffline`), navegação de mês (`MFCartoes`), cartões fora de Contas +
     tipo oculto na criação (`MFContas`).
5. **Seção de cartões no Resumo** (cartões separados das contas) — implementado e validado em
   teste; aguardando confirmação do usuário.
6. ~~Bug "marcar fatura como paga não acontece nada" + replicar fluxo do app
   original (feedback 06/10)~~ — **concluído**:
   - **Causa raiz dupla**: (a) `buildCardInvoices` fixava
     `current.openAmount = currentTotal` — o pagamento nunca reduzia a fatura
     corrente e o FIFO antigo engolia o valor nas fechadas antigas da janela
     (as 2 transferências de teste de 05/10, R$ 748,76 ×2, não mudavam nada na
     tela); (b) o botão do confirm exibia a key crua — `minhasfinancas.confirm`
     **não existia** no namespace (o `confirm: 'Confirmar'` do i18n.js estava no
     namespace `common`).
   - **Vínculo pagamento → fatura**: migration
     `20261006000000_mf_transactions_invoice_close.sql` (aplicada no projeto)
     adiciona `mf_transactions.invoice_close`; `buildCardPaymentTx` grava o
     ciclo no payload e `buildCardInvoices` aloca pagamentos vinculados
     **direto na fatura certa** (inclusive a corrente, mesmo com data futura),
     mantendo o FIFO sem vínculo para o histórico migrado.
   - **Replicado do Minhas Finanças original**: modal "Quanto você quer
     pagar?" (`MFPaymentModal`) com valor editável + dica de **pagamento
     parcial**; o payload sai **PENDENTE agendada no vencimento** (vencida →
     PAGO hoje), aparece no Extrato da conta vinculada com botão **Efetivar**
     (`mf-statement-settle`); widget/drill-down/detalhe reagem na hora
     (fatura reduz, botão some quando zerada, badge "Paga").
   - **Chaves i18n novas ×3**: `confirm`, `card_pay_amount_title`,
     `card_pay_partial_hint`, `card_pay_schedule_note`, `card_pay_now_note`,
     `card_pay_continue`, `statement_efetivar`; toasts unificados em
     "Pagamento registrado!".
   - **Limpeza de dados**: as 2 transferências duplicadas de teste (C6,
     R$ 748,76 ×2, criadas pelo fluxo quebrado) foram removidas — refazer o
     pagamento pelo novo modal.
   - **Validação**: ESLint 0, **50 arquivos/310 testes** (novo
     `mfCardPayments` ×9, parcial no `MFCartoes`, modal no `MFAccountDetail`),
     E2E MF 5/5 (+ teste "modal parcial zera o em aberto na hora").
7. ~~Navegação rápida de mês/ano + lentidão ao "Pagar fatura" (feedback 06/10)~~
   — **concluído**:
   - **MFMonthNav**: clique no rótulo salta para o **mês vigente**; clique e
     segure (500ms) ou botão direito abre o modal **Filtrar** com selects de
     Mês e Ano (Cancelar/Ok) — igual ao app Minhas Finanças original. Vale
     para as 8 telas que usam o nav (Resumo, Transações, Contas, Extrato,
     Cartões, Orçamentos, Relatórios, Objetivos). i18n ×3 (`filter_title`,
     `filter_month`, `filter_year`, `filter_ok`, `month_nav_hint`).
   - **Demora em "Pagar fatura"** — não era o insert: no React Query v5 o
     `mutateAsync` **aguarda** promises retornadas em `onSuccess`, e o
     `invalidateQueries()` pós-insert só resolve quando todos os refetchs
     ativos terminam — `mf-all-transactions` são 14 páginas **sequenciais** de
     13.318 linhas (~segundos) e o modal ficava "salvando" à espera disso.
     Corrigido: `useInvalidateAll` virou fire-and-forget (modal fecha na hora;
     a UI atualiza conforme os refetchs chegam) + `mfSelectAll` paginas em
     **ondas paralelas de 8** (14 idas-e-voltas → 4 rodadas; tabela pequena
     mantém as 2 requisições de antes — 1ª página sequencial mede o resto).
   - **Modais "tortos" (prints 06/10)** — causa raiz única: a `.glass-card`
     tem `backdrop-filter: blur(20px)`, que cria stacking context **e**
     *containing block* para `position: fixed`. O modal "Filtrar" (montado
     dentro do cabeçalho `glass-card`) ficava recortado na altura do card e
     atrás do conteúdo; o popover de moedas (`absolute` + `z-index` interno)
     perdia o empilhamento para os KPIs (`glass-card` irmãos, depois no
     DOM). Corrigido com **portal no `document.body`**: modal Filtrar e
     popover do `MFCurrencySelect` (8 telas + dentro de modais) agora são
     fixed na raiz — overlay z:1000; popover z:1100, reancorado no gatilho
     com flip quando não cabe abaixo e reposicionado em scroll/resize.
   - **Validação**: ESLint 0, **50 arquivos/315 testes** (+3 do MFMonthNav,
     +2 de regressão dos portals; teste de paginação recalculado 5 → 11
     chamadas na onda), build OK, **E2E 39/39** (novo "navegação de mês:
     setas, clique volta ao vigente e segurar abre o filtro").
8. ~~Transferência em "Novo lançamento" (feedback 06/10)~~ — **concluído**:
   - O editor só tinha Despesa/Receita; a transferência vivia só em
     Contas → "Transferir" (descoberta ruim). Novo **3º botão
     "Transferência"** no segmented control (índigo, `mf-tx-type-transferencia`)
     que abre o `MFTransferModal` — reusa origem/destino com validação de
     mesma moeda; **sucesso fecha o modal e volta para a lista**, cancelar
     mantém o editor. Só contas ativas não-cartão (consistente com o botão de
     Contas).
   - `MFTransferModal` ganhou prop `onSuccess` e passou a montar via
     **portal no body** (fixaria o mesmo recorte `position: fixed` dentro de
     `.glass-card` — o editor é uma glass-card); testids novos
     `mf-transfer-cancel`/`mf-transfer-confirm`; i18n ×3
     (`type_transferencia`).
   - **Validação**: ESLint 0, **50 arquivos/317 testes** (+2: abrir/cancelar
     e gravação `TRANSFERENCIA` com fechamento da tela), **E2E 40/40**
     (novo "transferência a partir de Novo lançamento (3º botão)").
9. ~~Dropdown de conta do editor: arquivadas + modernização (feedback 06/10)~~
   — **concluído**:
   - **Causa das arquivadas aparecendo**: o filtro `visibleAccounts` já
     excluía `archived_at` (10 das 72 contas estão arquivadas), mas o efeito
     de **conta padrão** usava `accounts[0]` por `sort_order` — "Ame Digital"
     (arquivada em 05/10) era a primeira e a exceção `id === form.account_id`
     a mantinha visível e selecionada. Corrigido: padrão = **primeira não
     arquivada** (`accounts.find(!archived_at)`).
   - **Novo `MFAccountSelect`**: troca o `<select>` nativo por gatilho
     `glass-input` com bolinha de cor + nome + moeda e popover com **busca**
     por nome/moeda — mesmo padrão do seletor de moedas: portal no body,
     `position: fixed` (z:1100), ancorado no gatilho com flip, click-outside
     e Escape. Só o editor usou por ora (fica pronto para os selects de
     transferência/filtros).
   - **i18n ×3**: `account_no_results` (busca reaproveita
     `search_account`); testids `mf-tx-account(-popover/-search/-option-*/-none)`.
   - **Testes**: +7 (`MFAccountSelect` ×6 incl. regressão do portal,
     `MFTransacoes` ×1 novo "ignora arquivada como padrão e não lista");
     interações antigas (`fireEvent.change`/`selectOption`) migradas para o
     popover; `MFAccountDetail` asserta texto no gatilho.
   - **Validação**: ESLint 0, **51 arquivos/324 testes**, **E2E 40/40**.
10. ~~Dropdowns globais do MF + ícones de bandeira (feedback 06/10)~~
    — **concluído**:
    - Novo **`MFSelect`** genérico: gatilho moderno (cor + label + meta +
      chevron), popover via **portal no body** (fixed z:1100, flip),
      **busca**, cabeçalhos de **grupo** (optgroups), `disabled`,
      valores numéricos (mês/ano/índice de coluna) e `emptyLabel`;
      `MFAccountSelect` virou um wrapper dele (mesma API/testids).
    - **34 `<select>` nativos** em 13 arquivos trocados: filtros de
      Lançamentos (status/tipo/conta/categoria/tag/bulk), Extrato,
      Relatórios (tipo/conta/categoria/tag), transferência (De/Para),
      editor (categoria/status/recorrência), modal de conta (tipo com
      grupos/perfil/vinculada/bandeira), orçamentos (escopo/alvo/modo),
      meta, config (tipo/pai), contribuição, importador (conta +
      4 colunas), seletor de perfil e modal Filtrar (mês/ano).
      **Testids preservados** — testes migrados para clique na opção.
    - **Bandeiras dos cartões**: novo `MFCardBrandIcon` reusa o sistema
      `MFAccountIcon` + `MF_BRAND_FILES` — logos novos
      `visa/mastercard/elo/amex/hipercard.svg` em `public/mf-brands/`;
      badge do MFCartoes agora ícone+texto, ícone no cabeçalho da fatura
      (MFCardInvoices) e nas opções do select de bandeira;
      `outro` cai no ícone genérico de cartão.
    - **i18n ×3**: `select_search`, `select_none`.
    - **Testes**: +11 (`MFSelect` ×5, `MFCardBrandIcon` ×5, badge de
      bandeira no MFCartoes); 15 testes migrados de
      `fireEvent.change`/`toHaveValue`/`selectOption` para o popover.
      **Validação**: ESLint 0, **53 arquivos/335 testes**, **E2E 40/40**.
11. ~~Bug "paguei a fatura e o limite disponível não ajustou" (feedback 06/10)~~
    — **concluído**:
    - **Causa**: as métricas LIMITE/EM ABERTO/DISPONÍVEL do MFCartoes
      usavam `balancesAsOf` com régua estrita `PAGO && payment_date <=
      refISO` — o pagamento feito hoje ficava de fora ao navegar num mês
      antigo, enquanto a fatura (que reage ao vínculo `invoice_close` no
      `buildCardInvoices`) já exibia **Paga / R$ 0,00**: os dois painéis
      do mesmo card divergiam.
    - **Fix**: `balancesAsOf` conta pagamento de fatura **com vínculo**
      (`invoice_close` preenchido e não `CANCELADO`) na hora — mesma
      régua do `buildCardInvoices`, inclusive `PENDENTE` ou com data
      fora do mês —; sem vínculo mantém `PAGO` até `refISO`.
    - **Dados**: vínculo órfão do C6 reparado — pagamento de R$ 1.305,46
      (13h50) estava com `invoice_close = 2023-06-01`, fechamento válido
      quando `closing_day` ainda era `null` (fallback dia 1º); às 17h44
      o usuário passou `closing_day = 14` e nenhum ciclo fecha em 01/06
      → rebind para **`2023-06-14`** (ciclo 15/05–14/06 soma exatamente
      R$ 1.305,46). Nubank/Inter (closing_day `null` → dia 1) seguem
      corretos com `2023-06-01`.
    - **Testes**: +1 regressão no `MFCartoes` (compra fev/2023 +
      pagamento vinculado de hoje → em aberto zera e disponível = limite
      ao navegar); testids novos `mf-card-limit/open/available-<id>`.
      **Validação**: ESLint 0, **53 arquivos/336 testes**, **E2E 40/40**.
12. ~~Editar lançamento dentro da fatura do cartão (feedback 07/10)~~
    — **concluído**:
    - **Causa**: as linhas da tabela de `MFCardInvoices` não tinham
      `onClick` (somente leitura) — no restante do módulo o clique já
      abria a edição.
    - **Fix**: nova prop opcional `onEditTx` — clique na linha abre a
      mesma `MFTransacaoScreen` do detalhe (fluxo dos `DetailRow`), com
      hover `table-row-hover` + cursor pointer; `MFAccountDetail` passa
      `openTx` no drill-down do cartão (caminho comum de Cartões e
      Contas). Sem a prop, a tabela continua inerte.
    - **Tags preservadas**: `useMFLancamentos` deixou de recortar os
      vínculos de tag por mês (a query já baixa todos) — compra de
      outra fatura editada mantém as tags, já que o salvar apaga e
      recria os links a partir de `tx.tagIds`; se os lançamentos do mês
      ainda estiverem carregando, `openTx` busca os vínculos direto
      antes de abrir.
    - **Teste**: +1 em `MFAccountDetail` (clique na linha da fatura →
      `MFTransacaoScreen` pré-preenchida → volta ao detalhe).
      **Validação**: ESLint 0, **53 arquivos/337 testes**, **E2E 40/40**
      (`--workers=1`; com 2 houve 4 flakes de Dashboard/E-mail, sem
      relação com o MF).
13. ~~Fatura corrente do widget escondia o valor ao pagar (feedback 07/10)~~
    — **concluído**:
    - **Causa**: o rodapé do card exibia o *em aberto* da fatura corrente —
      ao pagar, virava R$ 0,00 e o valor da fatura só ficava visível
      entrando na fatura.
    - **Fix**: rodapé agora mostra o **total** da fatura; badge
      PAGA/estilo continuam guiados pelo em aberto, e o que está em aberto
      já aparece na métrica **EM ABERTO** (linha acima).
    - **Testes**: regressão do rodapé ajustada (748,76 com badge Paga) e
      E2E de pagamento parcial agora assere fatura **R$ 300,00** +
      **EM ABERTO R$ 150,00**.
      **Validação**: ESLint 0, **53 arquivos/337 testes**, E2E do MF **7/7**.
14. ~~Categorias estilo Minhas Finanças original (feedback 07/10)~~ — **concluído**:
    - **Seletor em árvore** (`MFCategorySelect`) no formulário de lançamento:
      gatilho com ícone + lupa, painel inline com busca sem acento, raízes
      (chevron expande as subcategorias), avatar colorido por categoria e
      check na selecionada (antes: `MFSelect` flat com `└ nome`).
    - **Tela "Gerenciar categorias"** (`MFCategoriesScreen`) acessada pelo
      card em Configurações: busca, árvore com ícones, expandir/recolher,
      switch ativa/desativa (arquiva com cascata nos filhos) e barra com
      **Adicionar categoria** / **Adicionar subcategoria**.
    - **Modal de ícone + cor** (`MFCategoryFormModal`, replica o original):
      paleta de 11 cores + grade de 40 emojis (∅ limpa), nome, tipo (raiz)
      ou pai (sub/edit), edição com exclusão; payload grava `icon`, `color`
      e `is_archived` (colunas já existentes, antes sempre nulas).
    - **Fallback visual**: categorias migradas sem cor/ícone ganham cor
      determinística pelo nome + inicial no avatar (sem migração de dados).
    - **Fundo dos dropdowns (feedback 07/10)**: `background: ... : undefined`
      fazia o React remover a propriedade e sobrava o fundo padrão branco do
      `<button>` — corrigido para `'transparent'` em `MFSelect`,
      `MFCurrencySelect` (2 pontos) e `MFCategorySelect` (helper `rowBg`).
    - **i18n**: `select_search`/`select_none` (e `back`) existiam fora do
      bloco `minhasfinancas` — a placeholder mostrava a chave crua; adicionadas
      as 3 chaves × pt/en/es. Mais 13 chaves novas (`cfg_manage_categories`,
      `cat_*`); CRUD antigo inline removido do `MFConfig`.
    - **Paleta maior (feedback 07/10)**: ícones 40 → **100** emojis e cores
      11 → **19** (grid do modal com `maxHeight` 210); append-only — índices
      dos testes (`icon-0`, `color-2`) preservados.
      **Testes**: `MFCategorySelect` (5) + `MFCategoriesScreen` (8) +
      `MFConfig` reescrito (8).
      **Validação**: ESLint 0, **55 arquivos/347 testes**, E2E **40/40**
      (`--workers=1`).
15. ~~"Em aberto mas não consigo pagar" no widget (feedback 07/10)~~ — **concluído**:
    - **Causa**: o EM ABERTO é saldo acumulado (inclui fatura fechada antiga
      em aberto), mas o botão de pagar do widget só saía para a fatura
      CORRENTE — com ela zerada (R$ 0,00), a dívida antiga ficava sem ação
      (só os chips dentro do cartão permitiam pagar).
    - **Fix**: com a corrente zerada e fatura fechada em aberto, o rodapé do
      widget oferece **Pagar fatura** (`mf-card-pay-open-<id>`) para a fatura
      em aberto mais antiga; o vínculo `invoice_close` faz o EM ABERTO e o
      limite reagirem na hora — mesmo com pagamento agendado (PENDENTE).
    - **Teste**: regressão em `MFCartoes.test` (janeiro/2021 com compra de
      dezembro em aberto: botão aparece, modal pré-preenche 1.266,93 e o
      pagamento sai agendado no vencimento, com vínculo).
      **Validação**: ESLint 0, **55 arquivos/348 testes**, E2E **40/40**.
 16. ~~Régua de época em mês passado (feedback 07/10)~~ — **concluído**:
    - **Causa**: pagamento com vínculo (`invoice_close`) contava no saldo e
      nas faturas de **qualquer** mês — um pagamento de out/2026 zerava
      fev/2021 (números impossíveis de acompanhar).
    - **Fix**: no mês vivo o vínculo conta na hora (agendado PENDENTE
       incluso); em mês passado só conta se o ciclo já tinha fechado
       (`invoice_close <= ref`) — mesma régua em `buildCardInvoices`
       (novo parâmetro `monthKey`); o widget usa o aberto calculado pelas
       mesmas faturas. Avulso segue a regra de data. O teste da regressão do
       limite agora valida a época (fev/2023 em aberto → mar/2023 Paga).
    - **Testes**: régua de época em `mfCardPayments` (3) + widget navegando
      de mês em `MFCartoes` (época conta vínculo do ciclo fechado).
       **Validação**: ESLint 0, **55 arquivos/358 testes**, E2E **40/40**.
17. ~~Bloco Fatura/Estornos/Pagamentos no detalhe (feedback 07/10)~~ — **concluído**:
    - Replica o app original: **Fatura** (líquido) + **Estornos** (quando há),
      ou **Pagamentos realizados** + **Despesas no mês** (paga/parcial);
      valor grande = em aberto (✓ verde quando paga); selo
      **Paga/Fechada/Aberta** (`mf-invoice-badge`); ação **Registrar
      pagamento** no resumo (testids `mf-invoice-pay/anticipate` mantidos) e
      **Reabrir fatura** (exclui só os vinculados, com confirmação).
    - `buildCardInvoices` agora devolve `refunds` + `paid` por fatura e na
      corrente; 14 chaves i18n × pt/en/es (`inv_*`, `card_register_payment`,
      `card_reopen*`).
    - **Testes**: métricas no `mfCardPayments` + resumo/selo/Reabrir no
      `MFCartoes` (delete do vínculo + toast).
       **Validação**: ESLint 0, **55 arquivos/358 testes**, E2E **40/40**.
18. ~~Backfill de pagamentos históricos (feedback 07/10)~~ — **reconciliado**:
    - 5.120 despesas (R$ 429k) sem os pagamentos mensais → migração trouxe as
      compras mas não os pagamentos; saldo acumulava desde 2020.
    - A primeira versão (169 pagamentos no vencimento) foi substituída por
      **182 pagamentos mensais** `TRANSFERENCIA` conta→cartão, PAGO no último
      dia do mês, até **30/09/2026** (R$ 393.076,09); simulação mês a mês
      fecha em zero, preserva pagamentos reais e não toca nas despesas de
      outubro. Em outubro o aberto volta a refletir as compras do mês.
19. ~~Faturas continuavam abertas/diferença widget × detalhe (feedback)~~ —
    **concluído**:
    - **Janela FIFO**: `buildCardInvoices` só processava as 6 faturas exibidas;
      pagamentos antigos sobravam e quitavam a corrente errada. Agora processa
      desde o primeiro lançamento e só limita a lista na UI.
    - **Vínculos Nubank**: dois pagamentos (R$ 3.349,58 e R$ 3.374,96) tinham
      `invoice_close` em 01/04 e 01/06, mas os ciclos fechavam 30/03 e 30/05;
      o widget descontava, a fatura ignorava. Vínculos corrigidos; os dois
      backfills duplicados removidos.
    - **Excedente**: pagamentos vinculados maiores que uma fatura (Nomand)
      agora carregam o excedente para o ciclo seguinte; estornos líquidos
      também carregam crédito.
    - **Uma régua**: `EM ABERTO`/`DISPONÍVEL` do widget agora somam as mesmas
      faturas (fechadas + corrente), incluindo parcelas, estornos e parciais.
       SQL pós-correção: **zero saldo positivo em todos os meses até set/2026**;
       agosto e setembro: todas as faturas = **R$ 0,00 em aberto**; outubro
       continua refletindo novas compras (Nubank R$ 2.575,30 pendente em 07/10).
    - **Testes**: janela FIFO inteira, excedente vinculado, fechamento mensal;
      regressão histórica atualizada. **Validação**: ESLint 0,
      **55 arquivos/358 testes**, E2E **40/40** (`--workers=1`).
20. ~~Menu "+" aprovado (FAB + menus contextuais)~~ — **concluído**:
    - `MFAddMenu.jsx` novo: portal + ancoragem (mesmo motivo do `MFSelect`),
      gatilho botão com rótulo (`mf-new-tx` no cabeçalho/estado vazio e
      `mf-acct-det-new-tx` no detalhe) e FAB circular fixo só do módulo
      (`mf-fab-add` / `mf-fab-menu`); opções `mf-add-opt-<kind>`.
    - **Ocultação do FAB**: `MFTransacaoScreen` despacha `mf-tx-screen`
      {open} e `MFAccountDetail` despacha `mf-detail-context`
      {contas|cartão|null}; o container esconde o FAB em qualquer 2ª tela e
      o reexibe ao fechar.
    - **Ações**: transferência abre `MFTransferModal` direto (FAB,
      Lançamentos e detalhe); os demais tipos abrem a tela de criação
      sobreposta com `defaultType` + `accountScope` (`contas`/`cartao`).
    - **Regras**: Lançamentos = 4 opções; detalhe de conta = despesa ·
      receita · transferência; detalhe do cartão = despesa de cartão ·
      estorno. Escopo de cartão esconde a linha de tipo (receita e
      transferência só nascem em contas).
    - **Estorno** (`mode="estorno"`): réplica da tela "Novo estorno" —
      valor digitado positivo gravado **negativo**, status fixo PAGO,
      sem parcelas/recorrência/status, campo **Fatura** (ciclos de
      `cardCycles`; escolher ciclo move a data de lançamento para dentro
      do ciclo), categoria "Estornos" pré-selecionada e selo
      **Estornada** no detalhe.
    - **Pintura**: lista da fatura com despesa − vermelha, estorno + verde,
      categoria visível na linha e linha total **Fatura** (líquido);
      Extrato com transferência neutra no escopo geral e vermelha ao sair
      / verde ao entrar na conta filtrada.
    - i18n: 9 chaves ×3 (`add_*`, `tx_title_estorno`, `tx_invoice_label`,
      `tx_estornada`, `inv_total`).
    - **Testes**: novos `MFAddMenu.test.jsx` e `MFExtrato.test.jsx`; FAB,
      menus contextuais, estorno, selo e pintura em `MinhasFinancas`,
      `MFTransacoes`, `MFAccountDetail` e `MFCartoes`; E2E atualizado para
      o fluxo do menu + novo teste do FAB.
       **Validação**: ESLint 0, **57 arquivos/374 testes**, E2E **41/41**
       (`--workers=1`). Nota: corrigido no E2E o "hoje" da compra de fatura
       (UTC vs local — quebrava após as 21:00).
21. ~~Recarga dos dados do módulo MF (backup → limpeza → CSV)~~ — **concluído**:
    - **Backup**: 15 tabelas `mf_*` → JSON em `backup/mf-data-2026-10-08/`
      (+ `manifest.txt`) via Management API (`docs/Extratos/mf-backup.ps1`,
      contagens conferidas e JSON revalidado); schema coberto por
      `supabase/migrations` (pg_dump remoto descartado: o host do banco é
      IPv6-only e o container sem rota).
    - **Limpeza**: `TRUNCATE` das 15 tabelas `mf_*` num único statement
      (`docs/Extratos/wipe_all_mf.sql`; todas as FKs são internas ao módulo).
    - **Carga**: `gen-mf-migration.mjs` regenerado do zero (13.318 tx;
      cadastros 72 contas / 245 categorias / 19 tags / 85 links) + **213
      transferências** que só existiam no banco (pagamentos de fatura do
      backfill + vinculados; R$ 425.443,26, 31 com `invoice_close`) +
      restore de campos de cadastro que o gerador não emite
      (`closing_day`/`due_day` de 4 cartões, limites/marcas, cores/ícones)
      via `docs/Extratos/gen-mf-extra.mjs`.
    - **Verificação**: contagens e somas idênticas ao backup (D
      973.646,07 · R 1.109.504,60 · T 2.047.191,78 · 13.531 tx · 31
      `invoice_close`) e **0 referências órfãs**; única diferença: 1
      status (13.426 PAGO vs 13.427 — pagamento registrado em teste,
      venc 05–07/10, agora segue o CSV).
22. ~~Feedback de UI do módulo MF (4 itens, 08/10)~~ — **concluído (aguarda
    validação no app com Ctrl+Shift+R)**:
    - **Abas removidas do editor**: tela de criação não tem mais
      Despesa/Receita/Transferência — o tipo é escolhido antes (menu "+")
      e vira um **selo fixo** `mf-tx-type-badge` no cabeçalho
      (add_expense | add_card_expense | add_income | add_estorno |
      add_transfer). Transferência segue só pelo menu (modal dedicado).
    - **Modal no padrão "Criar conta"**: `MFTransacaoScreen` agora é
      `modal-overlay` + `modal-content` (X no cabeçalho, ações embaixo),
      montado via **portal no body** (igual `MFTransferModal` — o
      `backdrop-filter` do `.glass-card` criaria containing block e prenderia
      o `position: fixed`); a lista/detalhe de baixo fica montado atrás.
    - **Coluna "Descrição" removida** das tabelas de Contas (MFContas) e do
      Resumo: primeira coluna sem rótulo (é o nome da conta); chave i18n
      `accounts_table_description` removida dos 3 idiomas.
    - **Ícone do tipo novo de conta**: o input emoji virou botão que abre
      grade scrollável (`mf-new-type-icon-picker`) com os ícones dos tipos
      padrão + grade curada das categorias; escolher grava o emoji e fecha.
    - Testes: abas/aria-pressed migrados para selo, transferência via menu,
      novos testes de modal-sobre-lista e do picker de ícone; gates verdes
      (ESLint 0 · Vitest 57/375 · E2E 41/41 `--workers=1`).
23. **Commit** de todo o trabalho pendente — após validação do usuário
    (inclui os itens 26–27 abaixo).
24. **Secret do Felix** — `npx supabase secrets set GEMINI_API_KEY=<chave> --project-ref
    xfcehxyhhmuscodilfha` (bloqueado no usuário).
25. **Modo mobile** — aguardar prints do usuário.
26. ~~Lançamento fixo mensal + agrupamento hierárquico de contas (08/10)~~ —
    **concluído (aguarda validação no app com Ctrl+Shift+R)**:

    **a) Série fixa mensal** (`is_fixed` + `parent_transaction_id`):
    - Editor com 3 modos de repetição (radio `mf-tx-repeat-none/open/fixed`):
      Não recorrente · **Parcelar ou repetir** (abre `MFRepeatModal`
      "Configurar Repetição": parcela inicial + quantidade + periodicidade
      MONTHLY/WEEKLY/YEARLY com resumo `mf-tx-repeat-summary`) ·
      **Fixa mensal** (12 meses na criação, `FIXED_SERIES_COUNT=12`,
      sem numeração de parcelas, dica `tx_fixed_hint`).
    - **Extensão automática**: mantém ~6 meses futuros
      (`FIXED_EXTEND_MIN_MONTHS=6`) clonando a última ocorrência da série
      (`planFixedExtensions` puro + throttle 24 h em localStorage,
      `useMFExtendFixedSeries` no mount do módulo).
    - **Badge "Fixa"** (`mf-tx-fixed-badge`) no lugar do ícone de recorrência.
    - **Exclusão com escopo** (`MFChoiceDialog` "O que você deseja?"):
      apenas este mês (se for a cabeça, promove a 1ª filha — reparenta
      irmãs e apaga a cabeça sem depender de cascade) · a partir deste mês
      (cabeça sai da fixa `is_fixed=false`, apaga ≥ data) · definitivamente
      (ids explícitos) — `useDeleteMFFixedSeries`.
    - **Efetivação em mês futuro** ("Contabilizar no mês da efetivação?"):
      só para fixa cujo mês de `payment_date` ≠ mês de hoje; opções
      "Contabilizar no vencimento" (effective = vencimento, `payment_date`
      intacto) ou "Contabilizar em {Mês}" (`payment_date`/`effective` =
      hoje → a ocorrência sai do mês do vencimento e vira transação no
      mês atual).
    - i18n pt/en/es (`tx_repeat_*`, `tx_fixed_*`, `tx_delete_fixed_*`,
      `settle_*`).

    **b) Grupos hierárquicos de contas**:
    - Tabela **`mf_account_groups`** (self-FK `parent_id` com guarda de
      ciclo, `show_in_summary`, `sum_totals`) + `mf_accounts.group_id`
      (`ON DELETE SET NULL`) — migração
      `20261008000001_mf_account_groups_and_fixed.sql` **aplicada**;
      Dexie **v6**, tabelas offline/snapshot/restore atualizadas.
    - **`MFGroupModal`** (novo): nome + ícone, flags "Exibir na tela de
      Resumo" e **"Somar todas as contas agrupadas"**, seletor de grupo
      pai com guarda de ciclo (exclui self + descendentes) e lista de
      contas com checkboxes — vínculos gravados só no Salvar; salvar não
      toca em contas de outros grupos.
    - **Entradas de criação**: botão "Novo grupo" no cabeçalho de Contas
      (`mf-new-group`), "+" na seção do Resumo (`mf-groups-new`),
      "Criar grupo de contas" dentro do modal de conta
      (`mf-new-group-toggle`, seleciona o grupo criado) e no drill.
    - **Resumo**: widget `groups` (`dash_widget_groups`) mostra só grupos
      raiz com `show_in_summary`; clicar abre **`MFGroupDrill`**
      (breadcrumb Resumo/raiz/filho, avatar gradiente, total do subgrupo
      quando `sum_totals`, subgrupos clicáveis e contas diretas que abrem
      o detalhe da conta).
    - Testes: `MFFixed.test.jsx` (14) + `MFAccountGroups.test.jsx` (8) +
      ajustes em MFTransacoes/MFResumo/mfDashboard/MFContas; gates verdes
      (ESLint 0 · Vitest 59/398 · E2E 41/41 `--workers=1`).

27. ~~Refinamentos pós-validação do item 26 (feedback 08/10, rodada 2)~~ —
    **concluído (aguarda validação no app com Ctrl+Shift+R)**:
    - **Ícones de banco no grupo**: o picker ganhou abas **Emojis**
      (padrão) × **Bancos e cartões** (`mf-group-tab-emoji` /
      `mf-group-tab-banks`) com busca (`mf-group-brand-search`, estado
      vazio `mf-group-brand-empty`, opções `mf-group-brand-opt-<marca>`);
      novo helper **`MFGroupIcon`** (`brand:…`/`glyph:…` → `MFAccountIcon`,
      emoji puro → texto) aplicado ao botão do ícone, seletor de grupo
      pai, seletor de grupo na conta, avatar/cards do drill e card raiz
      do widget. Chave i18n `group_icon_emojis` (pt/en/es); reaproveita
      `icon_brands`/`icon_search`.
    - **Grupo só com contas comuns**: lista do `MFGroupModal` filtra
      `CARTAO` e arquivadas; `MFAccountModal` esconde o campo Grupo para
      cartão e grava `group_id: null`; `handleSave` só mexe em contas com
      override clicado ou já no grupo (criar/editar não desvincula contas
      de outros grupos).
    - **`brand:…` cru na linha de conta do modal** ("brand:ifood") →
      `MFAccountIcon` (logo da marca); asserção no teste (`img` presente,
      sem texto `brand:`).
    - **Widget `groups` "não aparecia" no Resumo**: dados e RLS
      confirmados no servidor (ambos os grupos gravados); a preferência
      do painel salva por versões antigas **anexava widget novo no fim**
      da página — `MF_DASHBOARD_WIDGETS` agora traz **`groups` ACIMA de
      `accounts`** (logo abaixo de KPIs, a pedido do usuário) e
      `normalizeWidgetPref` insere o widget novo na posição do vizinho
      da ordem padrão (pref salvo sem `groups` → Grupos entre KPIs e
      Contas).
    - **Loading das tabelas**: 3 linhas "Carregando…" → **linha única
      centralizada** com `Loader2` + texto em MFContas e MFTransacoes;
      **`.animate-spin` global** em `index.css` (não existia — os 28
      spinners `className="animate-spin"` do app estavam estáticos).
    - **Ações no drill do grupo**: botões **"Novo subgrupo"**
      (`mf-drill-new-subgroup`, no cabeçalho ao lado do total) e
      **"Nova conta"** (`mf-drill-new-account`, na seção "Contas do
      grupo") com o grupo atual pré-selecionado — `MFGroupModal` ganhou
      `defaultParentId` e `MFAccountModal` `defaultGroupId`; `MFResumo`
      agora gerencia os dois modais (o slot morto `onNewGroup` do drill
      foi substituído por esses).
    - **Gestão de tipos de conta fora dos modais**: o badge com ✕ que
      aparecia em todo modal de criação/edição de conta (excluir o tipo
      de qualquer tela) foi removido — o modal mantém só o seletor
      "Tipo de conta" e o **"+ Novo tipo"** (criação rápida). A remoção
      migrou para os **Ajustes do MF → seção "Tipos de conta"**
      (`mf-cfg-section-types`), com criação (nome + grade de ícones
      `mf-cfg-type-*`), lista (`mf-cfg-type-row`) e exclusão com
      confirmação (`mf-cfg-type-del-<id>`); chaves i18n `cfg_types`,
      `cfg_types_desc` e `cfg_empty_types` (pt/en/es).
    - **Contas agrupadas na tela Contas**: toggle **"Ver agrupadas"**
      (`mf-group-toggle`, só aparece quando existe grupo, ao lado de
      "Mostrar arquivadas") reorganiza a tabela em cascata — cabeçalho
      de grupo (`mf-group-header-<id>`: `MFGroupIcon` + nome +
      contagem `mf-group-count-<id>` + total das contas diretas
      `mf-group-total-<id>`) com as contas membros indentadas abaixo,
      subgrupos aninhados por `parent_id`, grupos sem contas visíveis
      ocultos e **"Sem grupo"** (`mf-ungrouped-header`) fechando a
      lista; guarda de ciclo em `subtreeHas`; i18n
      `accounts_group_view`/`group_ungrouped`/`group_count_one|other`
      (pt/en/es).
    - **Menu "+" do FAB centralizado**: a variante `variant="fab"` do
      `MFAddMenu` agora abre no **meio exato da tela** (`left/top 50% +
      translate(-50%,-50%)`) — antes ancorava no wrapper em fluxo e
      aparecia sobreposto no canto superior direito; a variante botão
      (Lançamentos/detalhe) continua ancorada no gatilho.
    - **Ícones Tesouro Direto e Bolsa de valores**: marca
      **`tesourodireto`** com o **logotipo oficial SVG** baixado do
      site (`public/mf-brands/tesourodireto.svg`, verde `#008750` +
      amarelo `#FFC914`; quadradinho de fallback `td`) e glifo
      **`bolsa`** (`ChartCandlestick`) no painel de ícones das contas;
      emojis **🏛️** e **📊** somando às grades de ícone de
      tipo/categoria (ao lado de 📈 do tipo Investimento).
    - **Visão agrupada é o padrão + sanfona (rodada 09/10)**:
      `groupedView` começa ligado (o toggle "Ver agrupadas" continua
      alternando para a lista plana) e cada cabeçalho de grupo — e o de
      "Sem grupo" — ganhou um chevron (`mf-group-fold-<id>` /
      `mf-ungrouped-fold`, `aria-expanded`) que recolhe/expande as
      contas sob ele; o cabeçalho sempre fica com contagem e total.
      Itens guardam a cadeia `ancestors` e o filtro `folded` esconde só
      os descendentes (nunca o próprio cabeçalho).
    - **"Ignorar nos totais" (rodada 09/10)**: coluna nova
      `mf_accounts.ignore_in_totals` (migração
      `20261009000000_add_ignore_in_totals_to_mf_accounts.sql`,
      aplicada remoto) + toggle no modal de conta
      (`mf-account-ignore-totals`, antes dos botões) + helper
      `countableRows()` que tira a conta de **todas** as somas
      agregadas: KPIs do Resumo, rodapé da tabela Contas, totais dos
      cabeçalhos de grupo, cards/drill de grupos e rodapé do widget
      Contas — a linha continua listada normalmente.
    - **Ações no detalhe da conta (rodada 09/10)**: cabeçalho do
      `MFAccountDetail` ganhou **Editar** (`mf-acct-det-edit`, só
      renderiza com `onEdit` — ligado em Contas, Cartões e Resumo),
      **Arquivar/Restaurar** (`mf-acct-det-archive`) e **Excluir**
      (`mf-acct-det-delete`, com confirmação; fecha o detalhe após
      excluir) — antes só era possível pelo menu da tabela.
    - **Correção do drill "0 contas" no Resumo (rodada 09/10)**: dois
      defeitos no `MFGroupDrill`/widget de grupos — (a) recebiam
      `visibleRows`, e o filtro **"Contas visíveis"** do Personalizar
      painel também escondia contas da árvore de grupos (o pref é
      visual: tabela/gráficos); agora cards e drill usam `activeRows`
      (sem arquivadas, por moeda). (b) contagem/listagem
      eram só de contas diretas, então o pai mostrava "0 contas /
      Nenhuma conta" mesmo com subgrupo cheio: contagem do cabeçalho e
      do cartão do filho passou a ser da **subárvore** e "Contas do
      grupo" lista as contas dos subgrupos com **chip do grupo**
      (`mf-drill-group-chip-<id>`) depois das diretas — entrar no pai
      já mostra o conteúdo.
    - **Regra dos KPIs — saldo total = todas as contas ativas (rodada
      09/10, decisão do usuário)**: "Saldo nas contas" e os demais
      KPIs do Resumo somam `activeRows` = **todas** as contas não
      arquivadas da moeda selecionada, **inclusive as ocultas** em
      "Personalizar painel"; "Ignorar nos totais" continua de fora e
      moedas nunca se misturam (totais agrupados por moeda). O filtro
      "Contas visíveis" ficou **só na lista de contas da tela** — KPIs
      **e gráficos** consideram todas as contas ativas — e a dica do
      painel (pt/en/es) foi atualizada para dizer isso. Antes os KPIs
      seguiam o filtro: no dados do usuário
      o saldo mostrava R$ 24.014,69 enquanto só o grupo Nubank já
      tinha R$ 36.226,68 (total real das contas ativas: R$ 178.735,08).
    - **Efetivar pendente no detalhe + avatar da categoria (rodada
      09/10)**: o botão **Efetivar** (PENDENTE → PAGO, mesma mutação do
      Extrato) agora existe também nas linhas do detalhe da conta
      (`mf-acct-det-settle-<id>`, só para pendentes); e as linhas do
      detalhe e do Extrato mostram a **bolha da categoria**
      (`MFCategoryAvatar`, `mf-acct-det-avatar-<id>` /
      `mf-statement-avatar`) — transferência ganha bolha ⇅, sem
      categoria mostra "?" — como no Minhas Finanças original.
    - Testes: `mfDashboard` +1 (posição do widget novo), asserções em
      `MFAccountGroups` (linha com marca, aba de bancos) +1 (drill cria
      subgrupo/conta pré-selecionados); o teste de exclusão de tipo saiu
      de `MFAccountTypes` (chip não existe mais no modal) e virou teste
      da seção em `MFConfig` (lista/cria/remove); `MFContas` +2
      (busca "tesouro" no painel, toggle "Ignorar nos totais" salva) e o
      da visão agrupada reescrito (padrão ligado, ordem das linhas,
      sanfona recolhe/expande grupo e "Sem grupo"), `MFAddMenu` +1 (FAB
      centralizado), `MFAccountIcon` +3 (logo Tesouro Direto, glifo
      `bolsa` e guarda de que **todos** os SVGs de marca existem em
      `public/mf-brands`), `MFAccountGroups` +1 (regressão: conta
      oculta no painel continua no widget/drill de grupos), a
      asserção do drill atualizada (conta do filho visível no pai, com
      chip), 2 testes de `MFResumo` atualizados para a regra dos KPIs
      (ocultas somem da tabela/seção mas permanecem nos totais),
      `MFAccountDetail` +1 (ações editar/arquivar/excluir) +2 (Efetivar
      pendente na linha, avatar da categoria) +5 (abrir Reajustar,
      manual abre formulário, transfer abre modal, ajuste em mês
      passado, excluir lançamento) +3 (MOVIMENTAÇÃO, aviso/banner,
      abas+timeline) +1 (fatura quitada mostra total + PAGA) −5 (listas
      agendado/realizado saem do Resumo — duplicavam a timeline; saem
      DetailRow, estorno/antecipar/Efetivar e avatar da linha do detalhe),
      `MFExtrato` +1 (avatar da categoria),
      arquivo novo `MFAdjustBalanceModal.test.jsx` +8 (diferença,
      RECEITA/DESPESA com categoria, saldo inicial, manual/transfer,
      modo fatura, reuso do Ajuste, otimista),
      arquivo novo `MFCardInvoices.test.jsx` +2 (abrir Reajustar na
      fatura sem saldo inicial, callbacks manual/transfer), `MFCategoriesScreen` +1 (busca de
      ícone) e
      arquivo novo `useMinhasFinancas.test.js` +2 (`countableRows`)
      +2 (`computeMovementSplit`),
      arquivo novo `MFStatementTimeline.test.jsx` +6 (grupos desc com
      saldos/abertura, busca, Efetivar, loading, erro+retry,
      pré-carregado sem fetch),
      arquivo novo `mfViewState.test.js` +4, `MFContas` +2 (restaura,
      ignora, limpa), `MFCartoes` +2, `MinhasFinancas` +1 (mês),
      arquivo novo `MFRepeatModal.test.jsx` +3 (toggle, preview,
      payload), `MFTransacoes` +5 (total divide, parcela mantém,
      escopo from, one+renumera, form) +2 (envio direto, modal de
      destinatário), `MFStatementTimeline` +2 (envio direto, modal de
      destinatário) +1 (sem botão aninhado), arquivo novo `MFEmailModal.test.jsx` +1,
      `useMinhasFinancas.test.js`
      +3 (`mfInstallmentSuffix`, `installmentHeadId`/`orderSeries`);
    - **CORS fantasma ao salvar tag (rodada 09/10, diagnóstico com
      logs)**: `mf_tags` saudável no remoto (policies/grants idênticos
      aos das tabelas que funcionam; edge logs só com 200). O erro era
      thread do PostgREST morta por sobrecarga ("Thread killed by
      timeout manager" + "statement timeout" nos logs de hoje) — a
      conexão morre sem headers CORS e o Firefox acusa CORS com status
      null. Causa no app: cada mutação fazia `invalidateQueries()` sem
      filtro e refazia os pulls paginados de 13k linhas em ondas de 8
      paralelas (~6k hits/dia só em `mf_transactions`). Fix: trailing
      de 750ms no `useInvalidateAll` (rajadas viram 1 tempestade;
      igual para saves isolados);
    - **Transferência recorrente (Fase D, rodada 10/10)**: o modal de
      transferência ganhou o mesmo botão **Repetir** do lançamento
      (`MFRepeatModal` reusado, sem o alternador total/parcela):
      mensal cria série numerada (cabeça 1/N `PAGO` + filhas
      `PENDENTE` com `parent_transaction_id`, datas via
      `addMonthsISO`) e semanal/anual repete sem numeração
      (`recurrence` + filhas vinculadas, datas via
      `shiftRecurrenceDate` — helper movido para
      `useMinhasFinancas.js` como fonte única, importado de volta
      pela `MFTransacaoScreen`); avulsa continua com 1 insert;
      exclusão em série cobre as filhas mensais (`installments_*` +
      `parent_transaction_id`; semanal segue o mesmo comportamento das
      recorrências do lançamento);
      arquivo novo `MFTransferModal.test.jsx` +3 (avulsa, mensal 1/3,
      semanal);
    - **F5 mantém a página (Fase C, rodada 10/10)**: a aba já
      persistia via router; faltavam mês + drill. `mfViewState.js`
      (`mf_month_key` validado, `mf_detail_drill` {tab, id} com
      restaura-uma-vez/limpa-ao-fechar/ignora-inexistente); mês no
      container e nos Cartões; drill em Contas e Cartões; higiene de
      storage nos testes;
    - **E-mail de comprovante no MF, manual (Fase A, rodada 10/10)**:
      botão ✉️ na linha de Transações e na timeline, mesmo formato do
      Finance (assunto tipo+descrição, corpo via `send-finance-email`
      com nome da categoria; mesmo destinatário de
      `notification_settings`); migration `email_sent` em
      `mf_transactions` (aplicada remoto); helper
      `useMFSendReceiptEmail`; sem auto-envio;
    - **Modal de destinatário + restyle do detalhe (Fase A, rodada
      10/10)**: `MFEmailModal` replica o do Finance (responsáveis,
      PRINCIPAL, envio direto com `skip_email_modal`); detalhe no
      padrão do mockup (fluxo em cards % do previsto, fatura vinculada
      com Pagar full-width, dias em maiúsculas, avião na linha do
      valor; bottom-nav é do shell do app, fora do MF); abas mobile
      funcionam (layout saiu do inline para as classes); linha da
      timeline sem botão aninhado (div role+teclado); rodapés dos
      modais fixos (`modal-footer`);
    - **Parcelamento completo (rodada 10/10)**: modal Repetição
      redesenhado + alternador **Valor total | Valor parcela** (total
      divide, parcela repete; preview "Em Nx de R$ Y"); sufixo **N/M**
      nas listas (timeline/extrato/transações, `mfInstallmentSuffix`);
      exclusão com escopo em série parcelada — lista e formulário
      ("só esta / esta e as próximas / todas" + renumerar 1..N,
      `fetchInstallmentSeries`/`useInstallmentDelete`, checkbox no
      `MFChoiceDialog`);
    - **Extrato rápido: sem re-baixar o histórico (rodada 10/10)**:
      a timeline baixava tudo (`lte(end)` sem início, ~14 páginas) a
      cada troca de mês — e o detalhe fazia isso 3× em paralelo.
      Lógica extraída para `computeStatement` puro; a timeline reusa
      o `allTx` já carregado (troca de mês instantânea) com loading/
      erro+retry próprios; `useMFStatement` (tela Extrato) sem mudança
      de comportamento (+ flag `enabled`); E2E do pagamento com
      `closing_day` dinâmico (flake quando hoje é o dia do fechamento);
    - **Fatura vinculada mostra o total (rodada 09/10)**: a linha
      exibia o em aberto (`R$ 0,00 PAGA` em quitada) — agora mostra o
      **valor da fatura** com a tag (botão Pagar só com em aberto);
      seleção: em aberto mais antiga → corrente com movimento → última
      fechada com valor (quitada mostra total + PAGA em vez de zero);
    - **Detalhe 2 colunas + timeline + abas mobile (Fase 1, rodada
      09/10, a partir dos prints desktop do original)**: grade
      responsiva (resumo | extrato no desktop, abas Transações
      (primeiro) | Resumo no mobile — sem hamburger); cabeçalho com
      tipo da conta; bloco MOVIMENTAÇÃO (efetivadas × pendentes por
      tipo/direção, `computeMovementSplit`, sanfona); Saldo atual/
      previsto/sem-inicial; aviso de inicial customizado (fecha mês
      anterior via `allTx`); ações Extrato (vai à timeline) +
      Reajustar; `MFStatementTimeline` (grupos por dia desc, trilho,
      avatar, Efetivar, Saldo por dia/inicial, busca);
    - **Ajuste no mês visado + Excluir lançamento (rodada 09/10)**: o
      Reajustar da conta usa `monthRefISO` (hoje no mês atual, último
      dia nos demais — o modal mostra a data em `mf-adjust-date`) em
      vez de sempre hoje; e o formulário de lançamento ganhou
      **Excluir** (`mf-tx-delete`, com confirmação, vínculos de tag
      caem por cascade) — antes só existia na lista de Transações;
    - **Ícones: Nomad oficial + leva nova (Fase B, rodada 10/10)**:
      `nomad.svg` amarelo oficial (marca do site; entrada passa a
      fundo amarelo/texto escuro) + 28 na grade (🐼🦁🍽️🌊🏞️🪕
      👨👩🧒👧 bandeiras BR/US/EU/PT/AR/UY/CL/PY/ES/IT/JP/CN,
      `R$`/`US$`/`€` como texto, 🍳 p/ fogão) com keywords; sem emoji
      de fogão/cachoeira/cavaquinho/sanduíche-novo (🥪🍵💧🎸 já
      existiam); 1 teste funcional (busca), guarda de SVGs cobre o
      arquivo;
    - **Ícones de categoria: +60 e busca (rodada 09/10)**: a grade era
      curadoria própria de emojis (`MFCategoryIcons.js`, como no
      original) — a bomba ⛽ já existia, mas era inachável sem busca.
      Grade foi de 120 para 180 ícones (acréscimo no fim para não
      quebrar índices dos testes) + `MF_ICON_KEYWORDS` (pt, sem
      acento) e campo de busca no modal (`mf-cat-modal-icon-search`,
      `mf-cat-modal-icon-empty`).
    - **Reajustar saldo em conta e fatura (rodada 09/10)**: modal
      `MFAdjustBalanceModal` replica o original — informa o saldo
      desejado, mostra a diferença e escolhe: app cria a transação
      ("Receita/Despesa de ajuste", categoria Outros → Ajuste criada
      se não existir; cartão/fatura usa DESPESA com sinal dentro da
      fatura), eu mesmo crio (abre o formulário de receita/despesa/
      despesa-cartão conforme o saldo final), criar transferência
      (abre a tela; na fatura também) ou alterar saldo inicial (só
      contas). Entradas: linha de ações do detalhe
      (`mf-acct-det-adjust`) e na fatura ativa (`mf-invoice-adjust`,
      sem saldo inicial). Correções da rodada: portal no body
      (fixed recortava no glass-card → scroll), máscara monetária no
      alvo, trava de duplo save e **otimista no cache** (salvar
      parecia "não fazer nada" quando o refetch morria na
      tempestade); trava de Save enquanto categorias carregam
      (evita duplicar Outros/Ajuste);
    - **Fatura paga aparecia em aberto no mês passado (rodada 11/10,
      bug reportado com prints)**: pagamento PAGO em 20/08 vinculado
      ao ciclo que fecha em 14/09 era ignorado ao navegar agosto
      (`invoice_close > refISO`), e a conta mostrava "Fatura corrente
      R$ 311,76 CORRENTE" + Pagar com o dinheiro já saído na timeline.
      A régua de época agora conta o vinculado quando o dinheiro já
      saiu (`PAGO` com `payment_date <= refISO`); agendado futuro
      (PENDENTE) continua fora. Compra de 16/06 com fechamento dia 14
      sempre caiu na fatura que vence 20/07 (regra do emissor, ciclo
      15/06–14/07) — o que confundia era o rótulo "Fatura corrente"
      sem mês ao navegar junho: corrente agora exibe "· Vence
      {data}" (chips, título do detalhe, etiqueta de Reajustar e
      painel de cartões vinculados); compra de 20/07 (após o
      fechamento de 14/07) pertence à fatura que vence 20/08, como o
      app já calculava; `mfCardPayments.test.js` +3 (PAGO conta no
      mês da saída, PENDENTE futuro não, 16/06 → vence 20/07);
      gates verdes (ESLint 0 · Vitest 67/471 · E2E 41/41 `--workers=1`).
    - **Despesa de cartão sempre paga + picker de Fatura ~2 anos
      (rodada 11/10, prints do app original)**: despesa de cartão não
      tem mais Status (entra sempre `PAGO`, como no original — o
      limite já caía com pendente; o que segurava a 2/10 era a data
      futura 20/10, que entra na fatura/limite ao chegar); filhas de
      parcelado no cartão também nascem `PAGO` (nas contas seguem
      `PENDENTE`); backfill das 101 pendentes de cartão → `PAGO`.
      Repetição aparece na edição salvo se já recorrente
      (`isRecurrentTx`: fixa/recorrência/parcelado) — editar avulso
      para parcelar/repetir/fixar cria as filhas com a aberta de
      cabeça. Campo **Fatura** na despesa de cartão ("Mês, ano · vence
      dd/mm", 26 opções set/2025–out/2027 como no original, padrão =
      ciclo natural da data): grava `invoice_close` independente da
      data; motor atribui a despesa ao ciclo escolhido (fechada,
      corrente ou futura `upcomingInvoices`, que entra no em aberto
      sem virar "ativa" e só aceita pagamento vinculado); chips das
      futuras na fatura; "Despesas no mês" virou "Despesas na fatura"
      (a corrente 15/09–14/10 mostra as de 20/09 — mesma fatura).
      Testes +10 (`mfCardPayments` +4 vínculo/futura, `useMinhasFinancas`
      +2 `isRecurrentTx`, `MFTransacoes` +4 picker 26/PAGO+`invoice_close`/
      mostra-esconde/conversão);
      gates verdes (ESLint 0 · Vitest 67/481 · E2E 41/41 `--workers=1`).
    - **Fatura de outubro PAGA indevida + picker abre em 2025 (rodada
      11/10, prints)**: a corrente de outubro (490,70) marcava PAGA
      por sobra de FIFO (pagamento de 30/09 pensado p/ setembro
      escorreu p/ a corrente) — conta fechada nos dados reais
      (pagamentos = meses das compras: 198,69/311,76/1073,41; outubro
      582,71 sem pagamento). Vinculadas as 9 de setembro → 09-14 e a
      2/10 → 10-14 (SQL, reversível limpando `invoice_close`): corrente
      de outubro = 582,71 em aberto + Pagar; setembro 1385,17 PAGA
      (311,76 de agosto fecha 14/09 pela mesma regra do 16/06 +
      1073,41 de setembro). Vínculo gravado foi Setembro/2026 (banco),
      não 2025; cabeça aparece no chip "Vence 20/09". Janela de época
      p/ vinculada passa a valer o MÊS (parcela futura do mês entra na
      fatura do mês vivo sem vazar p/ trás); janela cobre o menor
      vínculo (2025 não some) + vinculadas antigas entram na lista;
      dropdown abre rolado na selecionada (`MFSelect`).
      Testes +3 (`mfCardPayments` mês/futura-antiga, `MFSelect` scroll);
      gates verdes (ESLint 0 · Vitest 67/484 · E2E 41/41 `--workers=1`).
    - **Fatura manda no cartão (rodada 11/10, prints do app original)**:
      despesa de cartão agora só tem Data de lançamento + Fatura (sem
      Competência/Vencimento/Efetivação); salvar em fatura fechada
      pede confirmação ("Fatura fechada! ... setembro/2026 ...",
      com "não perguntar novamente"); extrato/movimento/saldo do
      cartão seguem a fatura (`cardExpenseMonth`: vinculada vale o
      mês do fechamento, agrupada pela data de lançamento — a de
      novembro mostra a de 11/10 e a de outubro não; transferência
      continua pela data); Testes +5 (`computeStatement` 2,
      `computeMovementSplit` 1, diálogo 1, timeline 1);
      gates verdes (ESLint 0 · Vitest 67/489 · E2E 41/41 `--workers=1`).
    - **Pagar em fatura paga (rodada 11/10, print Nubank)**: o botão do
      widget mirava a fechada antiga em aberto sem dizer qual — 5
      pagamentos de 06–07/10 foram parar em ciclos 2020–2023 (dia de
      fechamento certo, ano errado) e um deles duplicou com agendado
      11-07. Dinheiro não se perdeu (cascateia p/ as antigas; soma
      bate: 278k−261k = 17.066,28 de dívida real). Reparos: órfão
      06/10 → `2026-10-30` + agendado duplicado excluído; botão agora
      nomeia o alvo (`Pagar fatura · 20/03/23`); detalhe já era
      paga→só-Reabrir. Teste do rótulo no widget;
      gates verdes (ESLint 0 · Vitest 67/489 · E2E 41/41 `--workers=1`).
    - **F5 dentro da fatura voltava ao menu (rodada 11/10)**: o drill
      restaurava o cartão, mas a fatura selecionada zerava (sempre
      "corrente"). Seleção agora persiste por cartão
      (`mf_invoice_sel_<id>`, vale em Cartões/detalhe/Resumo;
      inválida ou sem movimento volta à corrente); higiene de storage
      nos testes que montam faturas. Testes +4 (`mfViewState` 3,
      F5-na-fatura no componente);
      gates verdes (ESLint 0 · Vitest 67/493 · E2E 41/41 `--workers=1`).
    - **Saldo negativo do Nubank era dívida real faltando (rodada
      11/10)**: auditoria mês a mês: 70 meses batem pago×gasto no
      centavo; o buraco (20.021,01) = só 3 pontos sem pagamento
      (ago–dez/2020: 13.296,47; mar/2023: 3.349,58; mai/2023:
      3.374,96). Usuário confirmou que pagou tudo → registrados os 7
      pagamentos (Nuconta→Nubank, PAGO, fim do mês, sem vínculo/FIFO
      como os outros 70 meses; resta −31,27 de crédito de jun/2020,
      absorvido na exibição). Sem mudança de código (sem gates).
    - **Cartão não é conta (rodada 11/10, prints do usuário)**: detalhe
      do cartão deixou de exibir Saldo inicial, Saldo/Previsão,
      "sem inicial", aviso de inicial customizado e o botão
      "Reajustar saldo" — cartão só fatura/limite; "Reajustar saldo"
      na fatura virou **"Reajustar fatura"** (`inv_adjust_title`,
      pt/en/es). Teste novo: cartão sem bloco de saldo;
      gates verdes (ESLint 0 · Vitest 67/498 · E2E 41/41 `--workers=1`).
    - **Mês da fatura = mês do VENCIMENTO (rodada 11/10, regra do
      usuário: "todos os gastos da fatura de outubro são pagos em
      07/10, vale para todos os cartões")**: o picker nomeava pelo
      fechamento — para fecha-30/vence-7 (Nubank) "Novembro" era a
      fatura que fecha em novembro, não a que vence 07/11. Identidade
      unificada pelo vencimento em picker, chips, título do detalhe,
      rótulo do Reajustar e widget de Cartões; testes de
      `cardCycles` (30/7 e 14/20) + chip com nome do mês;
    - **Anti-duplicada em série fixa/repetida (rodada 11/10, HBO Max
      criado duplicado)**: fixa criada sobre mês já importado virava
      cabeça nova jogada para o mês seguinte (out tinha a importada,
      nov ficou com 2). Criação de fixa/parcelada/repetida agora
      consulta os meses planejados e, havendo mesmo nome no mês,
      pede confirmação ("Lançamento repetido?" com os meses,
      `mf-tx-dupe`); dados reparados (cabeça de nov virou cabeça da
      série; FK `parent_transaction_id` é `ON DELETE CASCADE` — apagar
      a cabeça leva as filhas, por isso a recriação da série inteira);
      Testes +2 (diálogo + MFFixed com guarda);
      gates verdes (ESLint 0 · Vitest 67/498 · E2E 41/41 `--workers=1`).
    - **Pagar fatura = despesa na conta vinculada, sem transação no
      cartão (fila 12/10, modelo DECIDIDO e IMPLEMENTADO — ver item
      "Fatura corrente" abaixo)**: sem crédito no cartão; Reabrir
      mantém a conta vinculada; pagar de outra conta é transferência
      feita PELO USUÁRIO.
    - **Correção do meu erro de conceito — "Fatura corrente" e
      membership por ESCOLHA (rodada 12/10, modelo do usuário
      IMPLEMENTADO)**: 1. **Despesa de cartão só olha a fatura.**
      Membro = escolha no picker (`invoice_close`); data é rótulo
      (12/10 na fatura de novembro mostra "12/10/2026 - segunda" em
      novembro). Default = fatura do mês (`invoiceCloseForDueMonth`).
      Escolher fatura NÃO move a data; aviso de fechada só abaixo do
      mês atual. Filhas de série levam a fatura do seu mês. 2.
      **"Fatura corrente" = fatura do mês calendário** (vence no mês):
      em outubro, corrente = Outubro (fecha 30/09, vence 07/10) — pode
      estar PAGA. 3. **Detalhe mostra Fechamento** (`card_closing` +
      `card_due_label`), não período. 4. **Pagamento = DESPESA na
      conta vinculada** (`buildCardPaymentTx`), sem transação no
      cartão (só "paga + valor pago" via vínculo); TRANSFERENCIA
      antiga segue contada; Reabrir exclui o vínculo (conta mantida).
      Cartão sem Transf. na movimentação/extrato (só compras) e sem
      linhas de Saldo na timeline. Reparos: pagamento 06/10
      (2.954,73) → DESPESA vinculada a 2026-09-30 (era
      TRANSFERENCIA em 2026-10-30, impossível); HBO nov → fatura
      nov (2026-10-30). Testes atualizados ao modelo (corrente do
      mês, fallback por mês, DESPESA) +3 novos;
      gates verdes (ESLint 0 · Vitest 67/501 · E2E 41/41 `--workers=1`).
    - **Fase E — modal Detalhes + antecipar parcelas de cartão (rodada
      12/10, IMPLEMENTADO, sem commit)**: clique na despesa abre
      `MFTxDetailModal` (resumo, edição rápida com o mesmo seletor de
      tags da criação — criar nova tag incluso, toggle Pendente,
      lápis/lixeira/⋮); vale para QUALQUER transação (Transações,
      timeline do detalhe, fatura e Extrato — linhas do Extrato
      clicáveis); menu ⋮ com Editar/Excluir/Alterar Valor/Duplicar
      (submenu só em DESPESA: como Despesa de cartão/Transferência/
      Compensação-espelho, com destino + escopo)/Visualizar parcelas/
      Antecipar (só se parcelada)/Transformar em débito/Mover p/
      próxima fatura/Estornar (só cartão)/Efetivada-toggle (só
      transferência); transferência mostra Situação, Data de
      Efetivação e bloco de→para; escopo só-esta/daqui-em-diante/
      todas; `Antecipar` abre `MFCardAnticipateModal` (N + desconto +
      fatura destino, `planCardAnticipation` com shift reverso,
      parcelas mantêm o valor, desconto vira estorno separado) ou o
      genérico fora do cartão; atalho antecipar da lista roteia p/ o
      modal do cartão; Visualizar parcelas em modal dedicado (N/M,
      data, fatura, status, valor; avisa "X de N" em série órfã);
      timeline com data completa no cabeçalho do dia ("13/08/26 •
      quinta-feira"); filhas mensais ancoradas na fatura da cabeça
      (cabeça à frente não colide: 1/10 em set, 2/10 em out — antes a
      2/10 caía no mês dela e duplicava na fatura; reparo Vacinas
      2–10/10 +1 mês);
      testes +22 (`planCardAnticipation` 4, modais 17, E2E 1);
      gates verdes (ESLint 0 · Vitest 69/523 · E2E 42/42 `--workers=1`).
      Detalhes do plano original e respostas do usuário (12/10):
      parcela mantém o valor, desconto vira estorno separado na
      fatura destino; Alterar/Duplicar/Mover/Transformar com escopo
      só-esta/daqui-em-diante/todas; Antecipar só se parcelada.
    - **Busca com X + ícones de categoria (rodada 12/10, rodada 3,
      IMPLEMENTADO, sem commit)**: (a) **X para limpar filtro** em 6
      campos de busca do MF — cronologia
      (`mf-statement-search-clear`), tela de categorias
      (`mf-cat-search-clear`), seletor de categoria
      (`mf-tx-category-search-clear`), busca de ícone do modal
      (`mf-cat-modal-icon-search-clear`), Transações
      (`mf-tx-search-clear`) e Contas (`mf-accounts-search-clear`);
      chave i18n `search_clear` (pt/en/es). (b) **Ícones de categoria
      expandidos**: emojis novos na grade `MF_CATEGORY_ICONS` — calça
      👖, bermuda 🩳, terno 🤵, gravata 👔, blusa 👚, família
      👪👨‍👩‍👧‍👦👨‍👩‍👦👩‍👧‍👦👨‍👧‍👦 + 👦🧓👴👵 — com palavras-chave em
      `MF_ICON_KEYWORDS`. (c) **Glifos novo-especial**: `washer`
      (`WashingMachine`) e `fridge` (`Refrigerator`) no
      `MF_GLYPH_ICONS` + mapa `MF_GLYPH_KEYWORDS` (busca em pt,
      ex.: "geladeira" acha `glyph:fridge`). (d) **Marcas de banco
      como ícone de categoria** (pedido do usuário): o seletor do
      modal ganhou seções de marcas (`mf-cat-modal-brand-<marca>`) e
      glifos (`mf-cat-modal-glyph-<chave>`) além dos emojis, tudo
      filtrado pela mesma busca; `MFCategoryAvatar` renderiza
      `brand:`/`glyph:` delegando ao `MFAccountIcon` (logotipo SVG
      embutido, como contas/grupos já faziam).
      Testes +4 (`MFCategoriesScreen` 3: busca de novos ícones,
      marca de banco salva, X da busca de ícone; `MFCategorySelect` 1:
      X limpa o filtro); gates parciais verdes (ESLint 0 · categorias
      16/16 · seletor 6/6 · transações/contas/extrato/timeline/config
      verdes).
28. **Fatura marcada como vencida antes do vencimento** (task do usuário
    12/10): investigar por que uma fatura aparece **VENCIDA** mesmo
    quando a data de vencimento ainda não chegou — provável confusão
    entre `invoice_close`/`due_day` e o status calculado (antes do
    vencimento o status deveria ser "em aberto/aguardando", não
    vencida). Corrigir a regra + teste de regressão.
29. **Calculadora no valor** (melhoria pedida 12/10): (a) clicar no
    valor nos Detalhes abre uma calculadora (C, %, ÷ × − +, backspace,
    00, vírgula ✓); ao confirmar altera o valor e, se a transação for
    de série, pergunta o escopo ("Alterar apenas esta" / "Alterar esta
    e as próximas" / "todas"); (b) o editor de novo lançamento ganha
    botão de calculadora ao lado do campo Valor (e Encargos/Desconto).
