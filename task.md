# Checklist de Melhorias e Novas Funcionalidades - Personal Control

Este checklist organiza as sugestões de melhorias arquiteturais, funcionais e novas features para evolução incremental do sistema.

## 🛠️ Arquitetura & Performance

- [x] Migração de Estado Assíncrono para React Query (`@tanstack/react-query`)
  - [x] Instalar e configurar o `QueryClientProvider` no entrypoint (`src/main.jsx`)
  - [x] Implementar custom hooks para o módulo Finance (`useFinances`, `useFinanceCategories`)
  - [x] Refatorar os componentes `FinanceList` e `SummaryDashboard` para eliminar `refreshKey` e `useEffect` imperativos
  - [x] Adicionar suporte a Optimistic Updates na criação/edição de transações
- [ ] Otimização e Virtualização de Listas
  - [ ] Instalar `react-window` ou similar
  - [ ] Implementar a virtualização de linhas em `FinanceList` para suportar grandes volumes de registros
  - [ ] Replicar virtualização para `InvestmentList` e `TripsList`
- [ ] Banco de Dados (Supabase/PostgreSQL)
  - [ ] Criar migrações/scripts SQL para índices compostos (ex: `user_id` + `payment_date` em `finances`)
  - [ ] Revisar políticas de RLS nas tabelas de compartilhamento (`car_shares`, `trip_shares`, `custom_list_shares`)
- [ ] Suporte Offline-First
  - [ ] Configurar armazenamento local via IndexedDB / `localForage` como cache de contingência
  - [ ] Implementar fila de sincronização em background (Service Worker) para operações em modo offline

## 📈 Melhorias nos Módulos Existentes

- [ ] Finanças & Automação
  - [ ] Implementar motor heurístico para auto-categorização de transações com base na descrição (ex: "Uber" -> Transporte)
  - [ ] Criar lógica de Transações Recorrentes automáticas via banco de dados (trigger/pg_cron) ou rotina agendada
  - [ ] Adicionar funcionalidade de ações em lote (Batch Actions) na listagem de transações
- [ ] Investimentos
  - [ ] Implementar cálculo de XIRR (Taxa Interna de Retorno Estendida) para análise precisa de rentabilidade da carteira
  - [ ] Integrar API externa de cotações de mercado para atualização dinâmica de ativos de renda variável
- [ ] Frota (My Cars)
  - [ ] Implementar algoritmo de estimativa preditiva para próximas manutenções baseado no consumo médio de KM diário
  - [ ] Criar painel gráfico de evolução de eficiência de combustível (Km/L)
- [ ] Música
  - [ ] Implementar funcionalidade de Rolagem Automática (Auto-Scroll) no visualizador de partituras e cifras
  - [ ] Desenvolver transpositor de tons dinâmico para acordes de texto cifrado
  - [ ] Permitir reposicionar anotações salvas (arrastar/mover) no visualizador de partituras (tanto realces quanto textos)

## 🌌 Novas Funcionalidades (Greenfield)

- [ ] Leitor de Recibos com OCR
  - [ ] Configurar Supabase Edge Function ou serviço serverless com OCR (Tesseract.js/Vision API)
  - [ ] Adicionar botão de câmera/upload no modal de transações para autopreenchimento de dados extraídos do recibo
- [ ] Simulador de Rebalanceamento de Carteira
  - [ ] Criar interface para definição de alocação de ativos alvo (Target Asset Allocation)
  - [ ] Desenvolver calculadora que indica a distribuição exata de novos aportes para retorno ao balanço ideal
- [ ] Projeção de Fluxo de Caixa Futuro
  - [ ] Desenvolver modelo preditivo que cruza receitas recorrentes, despesas fixas, parcelamentos e viagens planejadas
  - [ ] Criar painel visual/gráfico com alertas de quebra de barreira de liquidez mínima (reserva de emergência)
- [ ] Divisão de Despesas em Viagens Compartilhadas
  - [ ] Adicionar suporte a divisão proporcional de custos em trips compartilhadas
  - [ ] Criar painel de reconciliação de dívidas e saldos de acerto entre participantes de uma viagem
