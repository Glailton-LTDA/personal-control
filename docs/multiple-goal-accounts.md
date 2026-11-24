# Objetivos com várias contas — versão 2.7.0

## Comportamento

Um objetivo pode selecionar nenhuma, uma ou várias contas do próprio usuário.
Com contas, o valor atual é a soma dos saldos integrais: A = 5.000 e B = 3.000
resultam em 8.000. Não há percentuais, valores reservados nem aportes manuais
misturados aos saldos. Todas as contas selecionadas devem usar a mesma moeda;
não existe conversão cambial nesta entrega.

Sem contas, continuam valendo o valor inicial, os depósitos e as retiradas
manuais. Vincular contas preserva o valor inicial e o histórico manual, mas
ambos deixam de compor o progresso enquanto houver vínculos. Desvincular todas
as contas recupera o cálculo manual anterior. Uma conta pode participar de
mais de um objetivo; os objetivos não reservam nem transferem dinheiro.

A lista, os detalhes e o Resumo somam todas as contas. Se faltar o saldo de uma
conta, o valor fica indisponível, sem mostrar uma soma parcial. Transferências
entre contas vinculadas não duplicam valores. Os saldos consideram lançamentos
pagos até hoje, além do saldo inicial, conforme a regra existente.

## Contrato compartilhado e compatibilidade

A migração [multiple_goal_accounts.sql](../supabase/migrations/20261124174140_multiple_goal_accounts.sql)
adiciona `mf_goals.account_ids uuid[]` à tabela existente. A seleção é uma lista
limitada a 1.000 referências; o banco remove duplicatas preservando a ordem.
O array permite salvar o agregado em uma operação atômica e manter o contrato
de cache e snapshots existente, sem outra tabela ou gravações intermediárias.
O índice GIN atende às verificações por conta (`@>`).

`account_ids` é a fonte de verdade. `account_id` permanece como espelho do
primeiro vínculo para compatibilidade com clientes anteriores. A migração
converte vínculos antigos válidos; referências antigas de outro proprietário
são desvinculadas, preservando o objetivo e seu histórico. Inserções antigas
que só enviam `account_id` continuam funcionando. Um array explicitamente vazio
significa modo manual. Alterações de metadados não removem vínculos adicionais.
Clientes antigos não podem alterar o vínculo principal de um objetivo múltiplo:
o banco rejeita essa operação para impedir perda silenciosa de dados. Eles
podem mostrar apenas a primeira conta até serem atualizados.

Foi inspecionado o repositório nativo `personal-control-app`, branch `main`:
a entrada de Finanças ainda é uma tela de apresentação, sem modelo ativo de
objetivos. Não é necessária uma segunda migração; uma futura implementação
nativa deve consumir este mesmo contrato canônico.

## Autorização e concorrência

As políticas RLS existentes continuam aplicadas por proprietário. O trigger de
objetivos verifica o proprietário de cada conta e a moeda no banco; validação
na interface também informa a incompatibilidade sem expor mensagens SQL.
As funções novas usam `SECURITY INVOKER`, `search_path` vazio e execução direta
revogada. Apenas a restauração existente mantém `SECURITY DEFINER`, necessário
para o snapshot protegido, com autenticação e validação de proprietário.

A validação bloqueia as contas em ordem de ID para serializar com exclusões e
mudanças de moeda. Moeda/proprietário de conta vinculada não podem mudar sem
primeiro remover o vínculo. Excluir uma conta remove somente sua referência;
o objetivo e as outras contas permanecem. Excluir a última retorna ao modo
manual. Os bloqueios podem abortar uma operação em caso de deadlock entre
edição e exclusão simultâneas; não há confirmação parcial.

Novos aportes e alterações de aportes bloqueiam a linha do objetivo antes de
verificar o modo. Uma edição concorrente do vínculo termina antes dessa
verificação, impedindo que aportes escapem da regra por RPC ou escrita direta.
O histórico anterior não é apagado. A restauração completa temporariamente
desvincula apenas os objetivos daquele snapshot, restaura o histórico e repõe
os vínculos dentro da mesma transação, sem desativar triggers. Snapshots antigos
com apenas `account_id` também são aceitos. Falhas fazem rollback integral.

## Consultas, precisão e perfis

As leituras alteradas usam colunas explícitas e filtro de usuário. Objetivos,
saldos e lançamentos usam a paginação existente; os lançamentos têm filtro
servidor de status e data. Saldos são calculados apenas para os IDs vinculados,
com deduplicação dos lançamentos de transferência. Projeções parciais de saldo
não sobrescrevem as linhas completas no cache offline (`cache: false`).

O cálculo de saldos e sua soma usam centavos inteiros e `BigInt`. Antes de
converter para o formato numérico da interface, é verificado o limite inteiro
seguro. Saldos negativos são preservados. Um perfil mostra objetivos avulsos
ou com pelo menos uma conta daquele perfil, mas o progresso sempre soma todos
os vínculos do objetivo, inclusive contas de outros perfis do mesmo dono.

## Aplicação e validação

Aplicar primeiro a migração canônica e depois publicar a versão web 2.7.0.
Localmente, `npm run dev:local` aplica as migrações locais antes do Vite.
Não executar reset do banco para atualizar ambientes com dados.

Asserções SQL em `src/tests/mfSecurity.database.test.js` cobrem autorização,
compatibilidade, moedas, exclusão e restauração. O script
`scripts/test-mf-goal-accounts.py` aplica a migração sobre um banco PostgreSQL
vazio e testa upgrade e duas sessões concorrentes; a pipeline o executa em
um banco descartável separado. Os testes de navegador criam um objetivo com
A = 5.000 e B = 3.000 e verificam 8.000 na lista e nos detalhes em larguras
320, 768 e 1440, nos temas claro e escuro, sem overflow horizontal.
