# Central de notificações do aplicativo

A versão 2.5.0 reúne os avisos no sino da toolbar do `Dashboard`, acima dos
módulos. Não há mais sino próprio no Resumo de Minhas Finanças nem um sino no
Guia Médico. O painel abre em portal no `body`, com foco contido, Escape,
restauração de foco e rolagem interna; funciona em desktop, tablet e celular.
As preferências de push continuam nos Ajustes do aplicativo.

## Fontes e contrato

`src/components/Notifications/registry.js` registra as fontes. Cada registro tem
`id`, `labelKey` e um componente `Source`. Novos módulos adicionam um adaptador e
seu registro, sem modificar a toolbar ou a renderização da central. Os Hooks são
chamados dentro de cada componente de fonte, nunca condicionalmente em um loop.

A fonte recebe `user`, `publish`, `navigate`, `client`, `today` e `now`. Publica
com `publish(id, feed)` um objeto memoizado com os campos:

- `items`: lista de avisos normalizados, com `id` estável e único por fonte,
  `title` (conteúdo do usuário) ou `titleKey`/`titleParams` (i18n), `at` (instante
  ISO), `statusKey` traduzível e `onOpen` para o destino conhecido do módulo.
- `dateOnly`: opcional **do item**, para vencimentos sem horário. `amount` também
  é opcional do item e contém `{ value, currency }`; a central respeita a opção
  global de ocultar valores. Um `onDismiss` opcional permite dispensar o aviso.
- `count`: quantidade conhecida; `lowerBound` avisa que a contagem é parcial.
  O badge só aparece após o carregamento das fontes e usa `+` quando necessário,
  com limite visual de `99+`. Falha de uma fonte não transforma contagens
  parciais em um total exato nem esconde a fonte que funcionou.
- `loading`, `error` e `refresh`: estados e recuperação independentes por fonte.
- `hasMore`, `loadMore` e `fetching`: paginação da fonte. `moreInModule` informa
  que é necessário consultar o módulo para a lista completa, sem fingir que uma
  listagem limitada é completa.

O registro atual reúne Minhas Finanças e Guia Médico, inclusive fora desses
módulos. Ocultar um módulo no menu não equivale a cancelar seus avisos. As
consultas e o estado são separados por usuário; o componente da toolbar recebe
uma `key` com o ID autenticado, e as fontes não persistem avisos no localStorage.
A central não constitui um novo ledger ou outra fonte de verdade financeira.

## Dados, segurança e custo

Não há novas tabelas, permissões ou migrations. As fontes usam o schema existente,
RLS e projeções explícitas. As leituras diretas incluem o filtro `user_id`; a RPC
financeira existente resolve o proprietário pelo `auth.uid()` do servidor.

A fonte médica reutiliza `health_reminders` e `health_refresh_reminders`. As
páginas retornam até 20 registros e consultam 21 para detectar continuação, com
ordenação estável por `remind_at,id`. A contagem exata é solicitada somente para
a central; o índice parcial existente `(user_id,remind_at,id) WHERE dismissed_at
IS NULL` atende o filtro e a ordenação. Os nomes relacionados e a informação de
push enviado usam somente as colunas necessárias. Dispensar reutiliza a operação
existente e invalida as consultas do dono. Sair do Guia Médico remove apenas as
consultas médicas inativas, preservando a fonte global ainda montada.

A fonte financeira preserva as janelas do planejador existente: vence em três
dias, vence hoje ou venceu há três dias; transferências e pagos/cancelados ficam
fora. Busca candidatos por vencimento, data de pagamento ou fechamento escolhido,
sem baixar todo o histórico para a toolbar. Todas as leituras diretas usam lotes
de 200, projeções explícitas, filtro do dono e um teto de 2.000 registros por
leitura paginada. A fonte limita avisos de lançamentos a 50 e de fechamento a 10,
indicando resultados parciais. O filtro de candidatos é conservador para cartões;
o planejador canônico aplica a data efetiva e descarta falsos positivos.

Para faturas que fecham hoje, a fonte usa `mf_card_cycle_totals` e o motor
`buildCardInvoices`, sem baixar transações históricas. As configurações dos
cartões e os cabeçalhos oficiais são lidos com campos explícitos e escopo do dono.
`applyCardInvoiceRecords` impede avisos de faturas já pagas manualmente. Não há
cálculo financeiro novo: moeda, ciclos, feriados, pagamentos e arredondamentos
continuam pertencendo aos motores existentes. Navegar pelo aviso seleciona o mês
correspondente antes de abrir Cartões ou Lançamentos. A central financeira mostra
os avisos do proprietário em todos os perfis, independentemente do perfil que
estava selecionado dentro de uma tela do módulo.

As fontes usam cache e atualização periódica; não geram push ao abrir o painel.
Abrir o Guia Médico e preparar seus lembretes continua usando a RPC existente.
Falhas são traduzidas; mensagens brutas de backend não são mostradas.

## Destaque das contas

A regra de CSS dos rótulos de subgrupos foi restringida aos filhos diretos para
não sobrescrever os números de `MFTotalsStack`. Os valores aumentaram de tamanho;
saldo e previsão usam cor individual por moeda/sinal. O saldo inicial mantém
uma cor de destaque e negativos em vermelho. Em telas estreitas os três
indicadores viram linhas para não causar rolagem horizontal. O tema claro usa
verde/vermelho mais escuros para manter contraste. Desktop mantém o destaque
nos subtotais da tabela, sem alterar contas, moedas, somas ou valores ocultos.

## Verificação

Testes unitários cobrem isolamento de fontes, terceiro módulo registrado, valores
ocultos, estados de erro/carregamento, paginação, dispensa, navegação e foco.
Os testes do adaptador financeiro verificam projeções, filtros do dono, limites,
janelas, moedas, erros e fatura paga. Os fluxos de navegador verificam desktop,
tablet e celular (320/768/1440 px), temas claro/escuro, ausência de overflow,
traduções pt/en/es, acesso por toolbar e inexistência do sino antigo.
