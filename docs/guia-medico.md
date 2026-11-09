# Guia médico

Implementação local do módulo `/health`, integrado à navegação, à personalização de módulos e ao Orbit Design System. Os temas claro/escuro e a navegação existente em desktop, tablet e mobile são preservados. A implementação não publica o aplicativo, não aplica migrations hospedadas e não agenda serviços de produção.

## Funcionalidades

- **Hoje:** doses e avisos do dia, registro da tomada ou da não tomada, correção do horário real/quantidade, adiamento do aviso e próximos eventos.
- **Medicamentos:** tratamentos com dose descritiva, início, término opcional, horários fixos, fuso IANA, pausa e encerramento. Uso eventual pode ser registrado sem habilitar lembretes para o tratamento.
- **Consultas:** data/hora, profissional, especialidade, local/link, observações, condição relacionada e avisos configuráveis.
- **Condições:** diagnóstico, situação, observações, consultas, tratamentos e exames relacionados.
- **Exames:** uma linha por realização, com laboratório, solicitante, preparo, situação, vínculos, laudo em texto, resultados estruturados e documentos. O histórico reúne realizações com o mesmo nome.
- **Documentos:** biblioteca geral ou anexos de um registro. PDF, JPEG, PNG, WebP e DICOM; até 20 MiB por arquivo. Visualização de PDF/imagens; DICOM é armazenado e disponibilizado para download, sem interpretação ou visualizador clínico especializado.
- **Resultados:** nome do indicador, valor textual, unidade e referência original do laboratório. Sem diagnóstico ou classificação automática.

Horários por intervalo, dias alternados, gráficos de evolução, OCR e integração externa com calendário não fazem parte desta primeira versão.

## Segurança e propriedade

Cada tabela clínica tem `user_id NOT NULL`, referenciando `auth.users`, com RLS habilitada e privilégios explícitos. Usuários anônimos não recebem privilégios nessas tabelas.

As políticas de SELECT/DELETE usam `user_id = (select auth.uid())`. INSERT tem `WITH CHECK`; UPDATE tem **tanto USING quanto WITH CHECK**. Isso bloqueia leitura, alteração, exclusão, inserção forjada e transferência de propriedade para outro usuário. A autorização usa o identificador autenticado; nenhum dado editável de `user_metadata` decide acesso.

Os filtros `user_id` no cliente ajudam o plano de consulta e a defesa em profundidade. A segurança não depende deles: os testes de banco fazem consultas sem esses filtros e comprovam a separação dos dados.

Os relacionamentos usam FKs compostas `(user_id, registro_id) → (user_id, id)`. Assim, conhecer o UUID de um exame, condição ou consulta de outra conta não permite associá-lo a um registro próprio. Condições e consultas com vínculos precisam ter esses vínculos removidos antes da exclusão. Doses e resultados são removidos com o respectivo tratamento/exame; documentos bloqueiam a exclusão do registro enquanto estiverem vinculados.

### Anexos

O bucket `health-documents` é privado. O caminho é validado no banco e segue `user_id/document_id.ext`; nomes originais não aparecem no caminho de armazenamento.

O Storage verifica o dono no caminho e a existência dos metadados correspondentes sob RLS. Além das políticas permissivas específicas, uma política **restritiva** protege esse bucket mesmo se já existir outra política permissiva ampla em `storage.objects`. O teste simula exatamente esse caso.

O aplicativo usa download autenticado, não `getPublicUrl`, URLs assinadas compartilháveis ou fallback público. A visualização usa Blob URLs temporárias, revogadas ao fechar ou desmontar a tela. O upload grava os metadados antes do objeto e tenta removê-los se o envio falhar. A exclusão remove primeiro o objeto e depois os metadados. Uma falha de rede pode exigir repetir a operação; não há transação distribuída entre banco e Storage.

MIME e tamanho são limitados tanto no cliente quanto no bucket. Isso não equivale a análise antimalware ou validação clínica do conteúdo.

### Sessão e memória

As consultas React Query incluem o proprietário na chave, não persistem o conteúdo clínico em localStorage/IndexedDB e são removidas ao sair do módulo. A árvore do Dashboard é remontada ao trocar de conta. APIs externas e Blob URLs não são adicionadas ao cache de assets do service worker.

As restrições valem para usuários da aplicação. Administradores da infraestrutura e credenciais privilegiadas de servidor continuam tendo os poderes administrativos normais; não se trata de criptografia ponta a ponta. A service role permanece exclusivamente na Edge Function e não aparece no bundle React.

## Consultas e desempenho

As listas e históricos usam ordem cronológica decrescente: consultas pela data do atendimento, medicamentos pelo início do tratamento, exames pela realização, doses pelo horário previsto, documentos/resultados/condições pelo cadastro. A busca por nome mantém essa ordem, com desempate por ID e ordenação no servidor antes da paginação. Exames sem data ficam por último. Na área Hoje, próximos compromissos e avisos preservam a ordem do mais próximo para o mais distante.

Consultas vinculadas por `follow_up_of` exibem o badge traduzido **Retorno** nos cards e detalhes, sem buscar a consulta original para identificar o vínculo. A projeção da lista inclui somente esse identificador adicional.

A migração `20261109021510_health_recent_lists_indexes.sql` acrescenta índices por dono/data para medicamentos e condições e ajusta os índices de exames para `NULLS LAST`. Consultas e retornos podem usar a leitura inversa dos índices de data já existentes. A busca por nome continua filtrando pelo intervalo indexado; seus resultados são ordenados por data. Os planos de listas, histórico, busca e novos índices são verificados em banco descartável com RLS ativa. Não há alteração de dados, políticas ou privilégios nessa migração.

### Conclusão, retornos e endereços de consultas

A ação **Concluir consulta** atualiza somente a situação do registro, com filtros de proprietário e ID. O trigger existente dispensa os lembretes da consulta concluída. Em caso de falha, a tela preserva a situação anterior e permite repetir.

**Agendar retorno** cria outra consulta com `follow_up_of` apontando para a original. Profissional, especialidade, local, endereço, condição e opções de lembretes são preenchidos; data e observações precisam ser definidas para o novo atendimento. A consulta original permanece intacta. O retorno mostra um link para a original, e o histórico da original lista os retornos com a mesma paginação das demais listas.

A migração `20261109000149_health_appointment_followups.sql` acrescenta endereço e vínculo de retorno à tabela existente, preservando suas políticas RLS. A FK composta `(user_id, follow_up_of)` impede vínculos entre contas; uma restrição impede a autorreferência. O índice `(user_id, follow_up_of, starts_at, id)` atende o histórico paginado e a FK. Excluir uma consulta com retornos vinculados é bloqueado para preservar a referência histórica.

As sugestões de especialidades ficam nas traduções pt/en/es; o campo aceita texto livre. O endereço reutiliza `Trips/AddressInput` e a API Nominatim já usada em Viagens. A busca envia apenas o texto do endereço e o idioma, nunca nome da consulta, profissional, especialidade ou observações. Respostas antigas são canceladas/descartadas, e o preenchimento manual funciona sem a API. O GPS abre a busca do Google Maps com apenas o endereço codificado e sem enviar o referer. A função de coordenadas de Viagens permanece compatível; o Guia médico armazena o endereço textual, incluindo número/complemento.

**Nenhum SELECT curinga foi introduzido. Não há exceção a justificar.**

- Projeções de lista e detalhe são separadas em `src/lib/health.js`. Laudos, preparo e observações são consultados no detalhe. INSERT/UPDATE/DELETE retornam somente `id` quando necessário.
- Listas carregam 20 linhas e uma linha extra para detectar a próxima página, sem contagem exata de toda a tabela. Opções de vínculos, documentos, resultados e históricos também são paginados.
- Busca com debounce de 300 ms, filtros no servidor, ordenação determinística com desempate por `id` e consulta de relacionamentos apenas quando necessária.
- Índices compostos começam pelo proprietário e cobrem ordenação, relações e histórico de exames. A fila tem índices parciais para avisos pendentes.
- A busca usa o **início do nome**, sem diferenciar maiúsculas e minúsculas, preservando acentos. Esse comportamento está descrito no campo de busca nos três idiomas.

A busca merece explicação: um teste com `ILIKE '%trecho%'` sob RLS percorreu os exames do proprietário apesar do índice de texto. A solução usa uma coluna gerada `name_search`, collation `C` e comparações de intervalo sobre um índice `(user_id, name_search, id)`. Isso permite que as comparações sejam aplicadas abaixo da barreira de segurança sem relaxar o RLS. Não foi usada função que bypassa RLS para acelerar buscas.

`health_query_plans.sql` mede 10 mil exames fictícios. No teste local, listagem, histórico e busca usaram respectivamente `health_exams_owner_sort`, `health_exams_history` e `health_exams_name_search`. A busca percorreu apenas o intervalo correspondente e utilizou três buffers. Tempos locais não representam latência da API ou desempenho de produção. Paginação por offset pode ficar mais cara em páginas muito profundas; keyset pagination pode ser adotada se o volume real justificar.

## Doses e lembretes

Dose prevista, dose registrada e horário do aviso são dados diferentes. Adiar um aviso altera `remind_at`, preservando `scheduled_at`. Registrar uma tomada ou não tomada dispensa o aviso correspondente. Uma restrição única evita duas confirmações da mesma dose. A edição corrige o registro real, preservando o medicamento e horário previsto da ocorrência.

Triggers criam avisos ao cadastrar ou alterar tratamentos, consultas e exames. Cancelamento, pausa, encerramento e reagendamento removem/dispensam avisos pendentes. Avisos de consulta/exame podem ser configurados para o horário do evento, duas horas antes e/ou um dia antes.

Ao abrir Hoje, `health_refresh_reminders()` repõe as próximas doses do proprietário, independentemente de push. A atualização se repete a cada minuto enquanto a tela está aberta. Isso evita depender de uma janela fixa de agendamento para o uso dentro do aplicativo.

Os triggers e essa função precisam escrever na fila, mas o cliente não recebe permissão de INSERT/DELETE nem de alteração de campos de entrega. As funções `SECURITY DEFINER` necessárias pertencem a `health_scheduler`, um papel **NOLOGIN, NOINHERIT e NOBYPASSRLS**, com privilégios mínimos. Elas validam `auth.uid()`, têm `search_path` vazio e permanecem sujeitas às políticas do dono. Funções internas ficam em schema privado; a única função exposta ao cliente atualiza apenas as doses do próprio usuário e não recebe um `user_id` arbitrário. EXECUTE para PUBLIC/anon é revogado.

O worker `health-reminders` usa funções `SECURITY INVOKER` acessíveis apenas à service role para repor a fila e reservar até 20 avisos por execução, com `FOR UPDATE SKIP LOCKED` e lease de cinco minutos. Ele não consulta nomes, laudos, condições ou resultados. O payload é discreto e traduzido. Endpoints de push são limitados a serviços conhecidos para evitar SSRF. Inscrições expiradas são removidas; falhas transitórias são reprocessadas. A entrega de Web Push é best effort: não há garantia de exatamente uma entrega por aparelho. A tag estável reduz duplicação visual, sem repetir o som ao substituir um aviso do guia.

### Preparação para publicar

A configuração de push agora é **global, nos Ajustes do aplicativo**. Consulte `notificacoes-push.md` para a migração das inscrições e a publicação coordenada. Não existe ativação por módulo.


1. Aplicar as migrações `20261107112044_health_guide.sql` e `20261107121840_global_push_notifications.sql`, nessa ordem, pelo fluxo existente do projeto, antes do frontend.
2. Publicar a Edge Function `health-reminders`. O `verify_jwt=false` está configurado porque o acesso é servidor a servidor; a função exige POST e **Bearer CRON_SECRET**. Requisições sem esse segredo são recusadas antes de acessar o banco.
3. Configurar no servidor `CRON_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `MF_VAPID_MAILTO`. A chave pública correspondente é `VITE_VAPID_PUBLIC_KEY`, com fallback para `VITE_MF_VAPID_PUBLIC_KEY`, reutilizando a infraestrutura existente. Chaves privadas nunca vão ao frontend.
4. Habilitar `pg_cron` e `pg_net`; cadastrar no Vault `health_reminders_url` e `health_cron_secret`. Executar o script operacional `supabase/scripts/schedule-health-reminders.sql` no projeto correto para uma chamada por minuto. O script não contém valores de segredo e não é executado pelas migrations.
5. Ativar notificações nos Ajustes do aplicativo, no aparelho e em HTTPS, e testar entrega com o app fechado no dispositivo real. Permissões e limitações de PWA variam por navegador/sistema. O botão informa quando o suporte ou a configuração pública está ausente.

O aplicativo já apresenta lembretes dentro do módulo. Push com o aplicativo fechado só estará operacional após essas etapas. Sem cron, a reposição da fila ocorre quando Hoje é aberto.

## Traduções e layout

Todos os textos novos de interface, mensagens, rótulos acessíveis e situações estão nos recursos `health-pt.json`, `health-en.json` e `health-es.json`. Datas e tamanhos usam Intl com o idioma ativo. Notificações têm cópia própria nos mesmos três idiomas, conforme a inscrição do aparelho.

O módulo reutiliza tokens do Orbit e classes de botões/cards, com CSS isolado. Abas quebram em linhas, grids usam colunas com mínimo zero e formulários tornam-se uma coluna em telas estreitas. Os testes verificam overflow dos componentes; não se baseiam apenas em esconder o overflow horizontal do body.

## Verificação e limites

- PostgreSQL 17 da imagem Supabase em container descartável: aplicação da migração e testes reais de RLS, FKs, Storage, funções e agendamento. O bootstrap simula os schemas mínimos de Auth/Storage; não substitui uma homologação do stack Supabase hospedado.
- `health_security.sql`: dois usuários, acesso anônimo, tentativa de forjar/transferir dono, vínculos indevidos, política antiga de Storage permissiva, dose duplicada, cancelamento, reagendamento, lease e adiamento após entrega.
- `health_query_plans.sql`: planos com 10 mil exames fictícios, sob o papel authenticated e com RLS ativa. Os dados são descartados via ROLLBACK.
- Vitest: fronteira de dados com o query builder real do supabase-js e fetch controlado; projeções, paginação, filtros, arquivos, falhas e paridade das traduções. Também foram executados os testes existentes de navegação afetados.
- Playwright/Chromium: telas e formulários entre 320 e 1440 px, idiomas pt/en/es, cadastro/edição de exame, laudo/histórico, resultados e upload/visualização/exclusão de documentos. Os endpoints usam dados fictícios interceptados; os testes de autorização são feitos separadamente no PostgreSQL.
- Checagem Deno da Edge Function, lint e build.

Não foram usados dados clínicos reais, chaves privadas de produção ou chamadas de push reais. A entrega em aparelhos e a integração completa com o Supabase hospedado ainda precisam da homologação de publicação descrita acima.

### Resultado desta execução

Lint e build aprovados; 26 testes Vitest, 12 testes Playwright e um teste Deno do handler real aprovados. A migração final foi aplicada do início em banco vazio e os testes SQL passaram. O build continua emitindo avisos sobre os chunks grandes e imports dinâmicos da estrutura existente, sem erro de compilação.


## Validação posterior com Supabase completo

O ambiente local completo foi iniciado com PostgreSQL, Auth, PostgREST, Storage, Kong e Mailpit. A aplicação das migrations identificou duas diferenças que o bootstrap PostgreSQL isolado não simulava:

- O migrador gerenciado precisa de membership no papel interno para transferir a propriedade das funções. A criação do módulo concede esse membership somente ao migrador, nunca a anon/authenticated.
- O schema `auth` não permite ao migrador repassar USAGE a papéis personalizados. A migração `20261107161433_health_scheduler_auth_resolution.sql` resolve `auth.uid()` através de uma função SQL invoker privada, com corpo SQL-standard resolvido na definição. Isso preserva o uso do identificador autenticado oficial sem conceder ao scheduler acesso amplo a `auth` ou herança de `authenticated`.

Foram verificados: login real, cadastros clínicos, resultados, atualização de lembretes, joins PostgREST, upload/download privado de PDF e isolamento entre duas contas e acesso anônimo. No navegador, login, laudo, preview Blob de PDF e criação de registro passaram com respostas reais da API, sem mocks. Todas as chamadas Auth/REST/Storage observadas ficaram em `127.0.0.1`.

A verificação dos privilégios confirmou que `authenticated` não tem acesso ao schema privado, não é membro de `health_scheduler` e que esse papel não possui BYPASSRLS. Os advisors locais foram executados; não apontaram avisos nas tabelas ativas do Guia médico/push global. Permanecem avisos em objetos legados de outros módulos e nas políticas preservadas do backup financeiro.
