# Checklist de Melhorias e Novas Funcionalidades - Personal Control

Este checklist organiza as melhorias arquiteturais, funcionais e novas features para evolução do sistema.

## 🚨 Tarefas Ativas (02/11/2026)

- [x] **Cartões — fechamento 31 × 30, fechamento dinâmico e vencimento em dias úteis** — entregue no PR #81.
- [x] **Cartões — card da fatura corrente (total × agendado × zerado)** — entregue no PR #82.
- [x] **Cartões — lista de faturas limitada a ±1 mês** — entregue no PR #82.
- [x] **Lançamentos — editar valor de parcelada mostrava diálogo de exclusão** — entregue no PR #85 (diálogo “Alterar”).
- [x] **Extrato — indicador de lançamento fixo mensal** — entregue no PR #85.
- [x] **Cartões — fatura marcada como VENCIDA antes do vencimento** — corrigido nos PRs #83/#84.
- [x] **Mobile — Extrato/timeline: fonte grande e descrição longa truncada** — entregue no PR #85.
- [ ] **Aviso de fatura fechada** — sino in-app + push (`mf-reminders`), uma vez por fatura, com total e vencimento.
- [ ] **Vigência por mês** — mudanças de fechamento/vencimento/limite/conta vinculada a partir do mês da edição (`effective_from`/snapshot).
- [ ] **Felix — configurar `GEMINI_API_KEY`** (bloqueado no usuário).
- [ ] **Mobile — validação final** (aguardando prints/varredura restante).
- [ ] **Calculadora — acesso global, saldo da conta e teclado** (item 6 da fila atual; detalhes na seção 9 de `docs/plano-minhas-financas.md`).

## 🚀 Novas Tarefas em Andamento

- [x] Banco de Dados: Adicionar coluna `currency` em `investment_accounts` via migração
- [x] Investimentos: Suporte a qualquer moeda nos Ajustes de Conta (usando `CurrencySelector` e badges com bandeiras)
- [x] Investimentos: Filtrar e formatar dinamicamente o dashboard e tabela de investimentos com base na moeda ativa
- [x] Investimentos: Auto-preenchimento do Saldo Inicial com base no Saldo Final do mês anterior no cadastro
- [x] Música: Adicionar Modo Tela Cheia (Full Screen) para cifras em `CifraViewer`
- [x] Música: Adicionar Modo Tela Cheia (Full Screen) para partituras em `SheetViewer`

## 🛠️ Arquitetura & Performance Concluídas

- [x] Migração de Estado Assíncrono para React Query (`@tanstack/react-query`)
  - [x] Instalar e configurar o `QueryClientProvider` no entrypoint (`src/main.jsx`)
  - [x] Implementar custom hooks para o módulo Finance (`useFinances`, `useFinanceCategories`)
  - [x] Refatorar os componentes `FinanceList` e `SummaryDashboard` para eliminar `refreshKey` e `useEffect` imperativos
  - [x] Adicionar suporte a Optimistic Updates na criação/edição de transações
- [x] Otimização e Virtualização de Listas
  - [x] Instalar `react-window` ou similar (Utilizado `@tanstack/react-virtual` para React 19)
  - [x] Implementar a virtualização de linhas em `FinanceList` para suportar grandes volumes de registros
  - [x] Replicar virtualização para `InvestmentList` e `TripsList`

## 📈 Melhorias nos Módulos Existentes Concluídas

- [x] Música
  - [x] Implementar funcionalidade de Rolagem Automática (Auto-Scroll) no visualizador de partituras e cifras
  - [x] Desenvolver transpositor de tons dinâmico para acordes de texto cifrado
  - [x] Permitir reposicionar anotações salvas (arrastar/mover) no visualizador de partituras (tanto realces quanto textos)
- [x] Listas Personalizadas (Custom Lists)
  - [x] Criar editor/leitor de anotações Markdown integrado ao módulo de listas (estilo Simplenote)
