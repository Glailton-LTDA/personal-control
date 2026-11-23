# Cartões de doses e privacidade das notificações — 2.6.0

## Comportamento

A lista de medicamentos mantém busca, filtros e paginação. Cada cartão apresenta nome, posologia, progresso de tratamentos finitos, término, última dose tomada, próxima dose e horários de hoje. O dia e os horários usam o fuso do tratamento. A lista e os indicadores são atualizados a cada minuto enquanto a tela está ativa e após as mutações.

Os horários distinguem tomada, atrasada, agendada e omitida com texto e ícones, além de cor. Uma dose futura não pode ser registrada antecipadamente. Tocar numa dose disponível abre confirmação, exibindo medicamento, horário previsto e quantidade. Confirmar registra a tomada agora; para informar um horário diferente ou omitir a dose, os detalhes continuam oferecendo o formulário completo. Tocar numa dose tomada/omitida permite desfazer após confirmação. Não há escrita ao apenas abrir ou fechar o diálogo.

Os comandos reutilizam `health_dose_record`, `health_dose_undo` e `health_treatment_state`: proprietário autenticado, versão esperada e ID idempotente. O ID e o horário real da tomada são preservados ao repetir uma confirmação que falhou; uma nova tentativa deliberada após fechar e reabrir cria outro comando. Conflitos não são sobrescritos silenciosamente. Encerrar preserva o histórico.

A edição carrega os detalhes completos **somente ao clicar** no ícone. Isso preserva notas, vínculos e demais campos sem trazê-los em todos os cartões ou salvar valores vazios por acidente. Os caches de consultas incluem usuário e são invalidados pelas mutações existentes.

## Preferência global de privacidade

Em **Ajustes → Notificações do aplicativo**, “Mostrar detalhes dos medicamentos nas notificações” é uma preferência da conta, independente da ativação do push em cada aparelho. Fica desativada por padrão. A interface só confirma a mudança após a resposta do servidor; falhas mantêm o valor anterior e exibem erro traduzido.

- Desativada, ausente ou indisponível: aviso genérico, sem nome, quantidade ou horário do medicamento.
- Ativada explicitamente: título com nome e corpo com horário local e quantidade. O toque abre o tratamento pelo fluxo normal de autenticação do aplicativo; não registra a tomada automaticamente.
- Consultas e exames permanecem com mensagens discretas.
- Nome, horário e quantidade podem aparecer na tela bloqueada e nos serviços de entrega de push. Notificações já entregues não são removidas pela troca da preferência.
- A central de notificações dentro do aplicativo autenticado continua mostrando os registros normalmente.

O worker consulta a preferência pelo proprietário da linha reivindicada. Somente se `show_medication_details === true` carrega `name,dose,timezone`, filtrando **usuário e medicamento**. Erros de leitura e registros ausentes retornam ao texto genérico. A preferência é conferida novamente antes de cada lote de até quatro aparelhos; revogar a opção durante o processamento troca os próximos lotes para conteúdo genérico. Mensagens pt/en/es usam o idioma da inscrição e o fuso do medicamento; nomes/quantidades têm limite de tamanho no payload. Não há logs de dados médicos.

## Migration e consultas

Aplicar a migration `20261123021950_medication_dose_cards_and_push_privacy.sql` antes de publicar o frontend e a função `health-reminders`. O workflow existente aplica migrations e publica as funções no fluxo de entrega. Nenhuma ação em produção foi executada durante o desenvolvimento.

A migration adiciona `notification_settings.show_medication_details boolean not null default false`. Reutiliza a tabela da conta, sua chave única por `user_id` e a política existente por proprietário, explicitando o `WITH CHECK` e usando `(select auth.uid())` para resolver o usuário uma vez por consulta. Não cria tabelas ou contratos paralelos para Android. Clientes antigos continuam compatíveis: campo adicional e opt-in falso; o contrato da lista é ampliado sem remover campos.

`health_treatment_list` continua como `SECURITY INVOKER`, com `search_path` fixo, usuário obrigatório, filtros de usuário e paginação máxima de 20. Acrescenta `today.slots` (horário, estado, versão do registro, tomada real e quantidade prevista) e `last_taken_at`. Contagens e horários usam a mesma chamada ao gerador canônico de ocorrências, limitada ao dia local de cada tratamento. Não há download do histórico nem chamadas cliente por cartão. Os limites de frequência já existentes limitam a quantidade diária de horários.

O índice parcial `health_doses_last_taken(user_id,medication_id,taken_at desc) where status='taken'` atende a leitura da última dose, com `LIMIT 1`, sem ordenar todo o histórico. Não há `SELECT *` novo. Agregações `count(*)` contam linhas, sem projetar todas as colunas.

Os testes SQL executam a atualização em banco descartável e verificam valores padrão, slots e contagens consistentes, ausência de registros de outro proprietário e rejeição de escrita cruzada. O harness de upgrade mantém as regressões e duas sessões concorrentes para o mesmo registro de dose. Testes de navegador cobrem celulares/tablets/desktop e persistência da preferência após recarregar.
