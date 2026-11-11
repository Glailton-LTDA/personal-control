# Cobertura global e regressões

A medição usa o código de produção em `src`, inclusive arquivos que nenhum teste importa. Os limites continuam em 75% para linhas, instruções, funções e branches; não foram alteradas as exclusões, a configuração da pipeline ou a definição das métricas nesta correção.

A ampliação cobre hooks de finanças, viagens e música; notas e campos Markdown; investimentos; consultas e lembretes médicos; veículos e manutenção; anexos, roteiros e estatísticas de viagens; navegação da aplicação. Os casos verificam resultados, transições, cancelamento, erros de leitura/gravação, filtros, perfis, datas, valores monetários e filas offline.

Os testes usam dados sintéticos. O adaptador de API em `src/tests/queryServer.js` mantém tabelas em memória, registra os filtros solicitados e permite simular erros. Testes offline usam IndexedDB em memória. Esses testes não acessam contas reais, não enviam e-mails, não publicam notificações e não substituem os testes de RLS existentes.

## Falhas encontradas pelos novos testes

- Em Investimentos, a variável de um tipo de conta tinha o mesmo nome da função `t` de tradução. Excluir o tipo gerava `t is not a function`; a variável agora se chama `accountType`.
- Em Viagens, o formulário de despesa acessava `trip.id` antes de validar se existia viagem. O acesso opcional permite que a validação já existente seja exibida.
- Em Minhas Finanças, os três caminhos de consulta dos lançamentos passavam um predicado de linha para `local.filter`, que recebe uma lista. A execução offline podia produzir `rows is not iterable`. As três chamadas agora aplicam `rows.filter(matches)`. Os testes verificam o mesmo resultado com filtros por conta, moeda, status, categoria, tag, descrição e valor, além de paginação e totais completos.
- Em estatísticas de viagens, o mapa do país agora tolera viagens sem lista de países, assim como a agregação principal. O teste aguarda o carregamento dos pontos antes de abrir o mapa para reproduzir essa combinação de forma determinística.
- O teste de navegador de recuperação de senha agora recarrega o documento ao simular a abertura do link. Uma troca apenas de fragmento pode manter a aplicação montada e não executar a detecção inicial de recuperação.

As mudanças não alteram schema, migrations, políticas de acesso ou traduções.

## Resultado local

Foram aprovados 1.716 testes em 148 arquivos. A cobertura global passou de 62,97% para 83,60% de linhas; de 61,04% para 81,52% de instruções; de 59,03% para 78,33% de funções; e de 57,87% para 75,34% de branches. O código alterado contra a base de `develop` atingiu 100% nas quatro métricas.

Lint, build e scanner de segredos passaram. No navegador, 80 casos passaram na execução completa; o caso de recuperação de senha foi corrigido e aprovado na reexecução específica. Os sete casos de push global também passaram. Os resultados remotos devem ser conferidos nos checks do SHA do PR antes de qualquer integração.

## Reproduzir

```bash
npm ci
npm run lint
npm run test:coverage -- --maxWorkers=2
COVERAGE_BASE=origin/develop node scripts/check-changed-coverage.mjs
npm run build
npm run test:e2e
```

O relatório fica em `coverage/index.html`, com resumo em `coverage/coverage-summary.json`. No CI, os relatórios são publicados no artifact `unit-coverage`. Para validar somente a diferença de um PR, `COVERAGE_BASE` deve apontar para o SHA da base usado pela pipeline.

As regras obrigatórias estão no [AGENTS.md](../AGENTS.md). A funcionalidade de laudos e os detalhes de segurança estão em [Markdown nos laudos](laudos-markdown.md).
