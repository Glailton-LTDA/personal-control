# Meu dia — PC-001 / versão 2.8.0

## Escopo

A nova entrada Meu dia reúne uma prévia dos registros do proprietário:

- Doses previstas no dia, com registro e desfazer em um clique.
- Consultas e exames agendados para hoje e os próximos sete dias.
- Despesas pendentes de contas não-cartão e cabeçalhos de faturas em aberto,
  com vencimentos entre sete dias atrás e sete dias à frente.
- Itens não concluídos de roteiros e viagens que começam até sete dias à frente.

A agenda organiza os itens do dia por horário. Vencimentos anteriores ficam em
Precisa de atenção e compromissos futuros em Próximos dias. Datas e moedas usam
o idioma atual; a opção global de ocultar valores também se aplica às quantias.
Consultas oferecem abertura do endereço no mapa. Atalhos médicos abrem o
registro; financeiros abrem a conta ou cartão; viagens abrem o roteiro selecionado.

A tela não substitui os módulos completos. São até 20 itens por categoria,
com indicação explícita quando houver mais. Os números representam **somente a
prévia**, não totais globais. A leitura de doses considera até 20 tratamentos
ativos/pausados mais recentes; excedentes também sinalizam que há mais itens.
Não há seleção de data, edição financeira ou criação de lembretes nesta entrega.
O exemplo de check-in do mockup corresponde a uma atividade cadastrada no roteiro:
não foi inventada uma integração com companhias aéreas.

Finanças usa `mf_transactions` e `mf_invoices`, sem duplicar compras de cartão
como contas individuais. O restante da fatura é calculado em `numeric` no banco:
`greatest(total - paid_total, 0)`. Sem reconstruir faturas ou saldos no navegador.
Faturas sem cabeçalho em `mf_invoices` não são reconstruídas pelo Meu dia.

## Orçamento de chamadas

A tela adiciona **uma RPC `my_day_summary` por carregamento sem cache**, não uma
chamada por cartão ou categoria. Isso não inclui consultas globais que o toolbar
já realiza independentemente da tela. Abrir Meu dia não ativa os hooks completos
de nenhum dos módulos.

- A primeira leitura espera as preferências do menu serem resolvidas, evitando
  uma consulta com todos os módulos seguida de outra com os módulos selecionados.
- O cache é separado por usuário, dia local, fuso e módulos visíveis.
- Resposta recente é compartilhada por cinco minutos; retenção em memória de dez.
- Não há polling de dados, atualização automática ao focar a janela ou retry de
  leitura. O relógio local muda a cada minuto sem acessar o banco.
- A mudança de data cria uma nova chave. Reconectar pode atualizar uma consulta
  desatualizada; Atualizar é uma ação explícita.
- Se todos os módulos-fonte estiverem ocultos, não há consulta do resumo.
- Escritas do aplicativo marcam o cache do resumo como desatualizado, **sem
  buscar uma tela inativa**. Uma nova visita atualiza após essas alterações.
- Registrar/desfazer dose reutiliza as RPCs existentes com ID de comando,
  versão esperada e bloqueio de cliques simultâneos. Uma escrita concluída
  atualiza a única consulta ativa do resumo. Não dispara leituras por medicamento.
- A sessão local é verificada antes de cada leitura e comando de dose; não é
  feita uma requisição adicional `getUser` para cada ação.
- O AbortSignal do React Query é repassado à RPC. Logout/troca de conta preservam
  a limpeza de cache e identidade já existente no App.

Uma atualização em outro aparelho pode aparecer somente na próxima atualização,
reentrada com cache vencido ou reconexão. Esse intervalo é deliberado para
reduzir consumo; a tela informa o horário da última leitura.

## Banco, segurança e performance

A migração [my_day_summary.sql](../supabase/migrations/20261127013308_my_day_summary.sql)
adiciona apenas uma função de leitura e três índices, sem novas tabelas.
O mesmo contrato serve para web e futura implementação Android.

A função usa `SECURITY INVOKER`, `search_path` vazio, `auth.uid()` obrigatório,
revogação de EXECUTE de PUBLIC/anon e concessão somente a authenticated. Não
aceita ID de proprietário do cliente. Toda leitura e junção usa o proprietário
resolvido da sessão, além das políticas RLS das tabelas existentes. Até viagens
compartilhadas ficam fora desta prévia: o escopo aqui é o proprietário.

O fuso é validado contra o catálogo do PostgreSQL. O período vem do relógio do
servidor; não há parâmetro livre para baixar anos de histórico. Os limites são
fixos: 21 candidatos por categoria, retorno de 20 e `has_more`. Os horários de
medicamentos reutilizam `health_private.schedule_slots`, somente na janela de um
dia; não são calculadas estatísticas de adesão ou contagens de todo o tratamento.
A janela diária respeita mudanças de horário de verão. Horários médicos são
mostrados no fuso do aparelho; roteiros mantêm o dia/horário cadastrados na viagem.

As projeções são explícitas, incluindo no JSON gerado; nenhum documento,
laudo, observação clínica ou histórico completo é transferido. Módulos ocultos
não executam seus blocos SQL. Índices novos atendem às despesas pendentes pela
data efetiva de vencimento, ao dia de roteiro e ao início de viagem. Os índices
existentes de proprietário/data dos dados médicos são reutilizados.

## Validação e aplicação

- Unitários verificam sessão ausente/expirada/trocada, cancelamento, erros
  seguros, cache, ausência de polling, mudança de dia e idempotência das ações.
- Testes SQL verificam EXECUTE negado a anon, identidade obrigatória, isolamento
  entre usuários, estados, período, moedas e limites da prévia.
- `scripts/test-my-day-database.py` aplica migrações canônicas em banco vazio e
  executa `supabase/tests/my_day.sql`, incluindo EXPLAIN com 12 mil lançamentos
  antigos para confirmar o índice seletivo de vencimento. A pipeline executa
  essa validação em banco descartável separado.
- Playwright cobre login, uma RPC inicial, uma atualização por ação de dose,
  erro recuperável e larguras 320, 768 e 1440 nos temas claro e escuro.

Aplicar a migração antes do frontend 2.8.0. Para desenvolvimento local,
`npm run dev:local` aplica as migrações antes de iniciar o Vite. Não é necessário
resetar o banco nem alterar tabelas pelo aplicativo nativo.
