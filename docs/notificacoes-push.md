# Notificações globais

A ativação de push fica em **Ajustes → Geral → Notificações do aplicativo**. Um único consentimento vale para todos os módulos naquele navegador/aparelho. Desativar esse controle interrompe os pushes de todos os módulos nesse aparelho; os outros aparelhos mantêm suas próprias inscrições. Os lembretes dentro dos módulos continuam disponíveis.

O sino do Minhas Finanças e o painel do Guia médico oferecem apenas links para os Ajustes. Nenhum deles solicita permissão, registra ou cancela inscrições.

## Reutilização da infraestrutura

- O mesmo service worker e as mesmas chaves VAPID existentes continuam sendo usados. Não é necessário gerar outro par de chaves.
- O frontend prefere `VITE_VAPID_PUBLIC_KEY`, com fallback para o nome existente `VITE_MF_VAPID_PUBLIC_KEY`.
- O servidor mantém `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `CRON_SECRET`. O contato prefere `VAPID_MAILTO`, com fallback para `MF_VAPID_MAILTO`.
- `supabase/functions/_shared/push.ts` concentra a configuração VAPID, leitura de inscrições, verificação do consentimento, validação do endpoint, envio e limpeza de inscrições expiradas.
- As funções `mf-reminders` e `health-reminders` continuam separadas pelas regras e frequências de execução. Ambas usam esse helper e a mesma tabela global. O cron financeiro atual é preservado; o cron médico continua sendo preparado separadamente por minuto.
- Mensagens financeiras e médicas são traduzidas em português, inglês e espanhol conforme o idioma da inscrição do aparelho. Os avisos médicos permanecem discretos, sem nomes de medicamentos, condições ou resultados.

## Banco, migração e compatibilidade

A migração `20261107121840_global_push_notifications.sql` cria `public.push_subscriptions`, com `endpoint` único, proprietário obrigatório, idioma e indicador global `enabled`.

As inscrições antigas de Finanças e Saúde são copiadas e deduplicadas. Para o mesmo endpoint e mesmo proprietário, prevalecem os dados mais recentes. Se o mesmo endpoint estiver ligado a proprietários diferentes, ele não é ativado automaticamente: será necessário ativá-lo nos Ajustes. Isso evita escolher silenciosamente a conta que receberá notificações em um navegador compartilhado.

As tabelas antigas são renomeadas para `*_legacy` e têm o acesso revogado para PUBLIC, anon, authenticated e service_role. Permanecem disponíveis ao administrador para rollback operacional. Não são consultadas pela aplicação ou pelos novos workers.

Os nomes antigos passam a ser views com `security_invoker=true` sobre as inscrições globais ativas. Isso faz workers antigos respeitarem `enabled=false` durante uma atualização gradual. Clientes antigos não podem gravar nessas views. Após publicar, clientes já abertos precisam recarregar para remover os botões antigos e usar o controle global; código antigo em uma aba ainda pode chamar a API local de cancelamento do próprio navegador.

A tabela global tem RLS com `(select auth.uid()) = user_id`. UPDATE usa USING e WITH CHECK; registros de outra conta não podem ser lidos, desativados ou assumidos por um upsert com endpoint conhecido. Usuários anônimos não têm acesso. Índices cobrem o proprietário e as inscrições ativas.

## Ativação, desativação e sessão

A permissão do navegador só é pedida pelo clique de ativação. Leitura de estado, entrada nos módulos e login não mostram prompts nem ativam push automaticamente.

Na desativação, o aplicativo grava primeiro `enabled=false` no banco e depois cancela a inscrição no navegador. Se a gravação falhar, ele informa o erro e mantém a inscrição, evitando exibir sucesso falso. Mesmo se o cancelamento local falhar, o servidor já passa a ignorar a inscrição desativada.

O envio compartilhado revalida o consentimento imediatamente antes de cada push. Assim, um job financeiro que carregou suas inscrições no início também observa uma desativação feita durante o cálculo. A entrega externa continua sendo best effort: um push já entregue ao serviço do navegador não pode ser recolhido.

Ao trocar de conta, o aplicativo confere a propriedade da inscrição existente. Um endpoint de outra conta ou sem consentimento ativo é desassociado do navegador; uma nova ativação cria um endpoint novo, sem transferir o registro de outra conta. No logout, a inscrição local também é cancelada. Inscrições expiradas no servidor são removidas quando os serviços de push retornam 404/410. O idioma de uma inscrição ativa é atualizado ao mudar o idioma do aplicativo.

## Consultas e envio

Não foi introduzido SELECT curinga. Também foram substituídos os curingas encontrados nas leituras de Ajustes e de contas da função financeira por campos explícitos, com filtro por proprietário. As consultas financeiras relacionadas a contas/cartões também receberam o filtro explícito de `user_id`.

A leitura global de inscrições usa páginas de até 200 registros com cursor por `id`, evitando truncamento no limite padrão da API. A leitura médica é limitada às inscrições ativas do proprietário. Endpoints são aceitos apenas para os serviços conhecidos de Web Push, evitando usar o worker privilegiado para enviar requisições a servidores arbitrários.

## Publicação e verificação

1. Aplicar a migração do Guia médico e depois a migração global, pelo fluxo existente do projeto.
2. Publicar as duas funções com o helper compartilhado e os recursos de tradução.
3. Publicar o frontend e o service worker atualizados. Não há outro par de chaves nem outro botão de ativação por módulo.
4. Preservar o cron financeiro; configurar o cron médico conforme `guia-medico.md`.
5. Homologar ativação, entrega real, desativação e logout em cada navegador/aparelho utilizado.

A implementação foi testada com PostgreSQL descartável, inscrições fictícias e transporte de push simulado. Os testes cobrem preservação e deduplicação na migração, conflitos de dono, views de compatibilidade, RLS, falha de gravação, consentimento revogado durante processamento, limpeza de inscrições expiradas, idiomas, troca de conta e layout responsivo. Não houve envio de push real nem alteração em produção.

Para repetir os testes de navegador, use `npm run test:e2e:push`. A configuração versionada `playwright.push.config.js` sobe um servidor isolado na porta 5174 com chave pública fictícia e sem envio real. O script `npm run test:e2e` executa os testes gerais e depois essa suíte específica. A chave de teste não é adicionada aos arquivos de ambiente do aplicativo.

### Resultado da validação

Passaram lint sem avisos, build, 56 testes Vitest, 19 testes Playwright (12 de regressão do Guia médico e 7 dos Ajustes globais) e 7 testes Deno. Os testes SQL de migração/consentimento global e de segurança do Guia médico também passaram. Foram verificadas as larguras de 320, 768 e 1440 pixels nos Ajustes, incluindo seus contêineres. O build mantém os avisos de chunks grandes/imports dinâmicos já existentes no projeto.
