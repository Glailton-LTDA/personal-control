# Changelog

Este arquivo registra todas as alterações notáveis feitas no projeto **PersonalControl**. O formato é baseado no [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e este projeto adere ao [Versionamento Semântico](https://semver.org/spec/v2.0.0-rc.2.html).

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
