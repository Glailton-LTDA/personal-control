# Teste local desta sessão

Supabase local em Docker, sem criar projeto/branch pago e sem acessar produção.

- Aplicativo no browser do ambiente: `http://127.0.0.1:5173/health`
- API local: `http://127.0.0.1:54421`
- Banco local: porta `54422`
- E-mails de teste capturados no Mailpit: `http://127.0.0.1:54424`
- Login de teste do seed: `dev@local.test`
- Senha de teste do seed: `dev123456`

Esses endereços pertencem ao ambiente remoto da sessão. No browser do celular, `127.0.0.1` aponta para o celular e não permite acessar este servidor. O uso interativo depende do browser/aba Desktop do ambiente. Nenhum link público foi criado.

Os serviços ativos são PostgreSQL, Auth, PostgREST, Storage, Kong e Mailpit. O app está configurado pelo `.env.local` para a API local. A inicialização usou `supabase start` sem qualquer opção remota, com as migrações completas e os dados fictícios do seed. Studio, Realtime e o runtime de Edge Functions não foram iniciados.

A saúde dos containers Auth/Storage exigiu um ajuste local no comando wget para não encaminhar sondas de loopback ao proxy externo. O wrapper mantém o comportamento original para destinos externos. O ajuste foi feito somente nos containers desta sessão, sem alterar imagens ou a rede de produção.

O cadastro, os históricos, os laudos, os resultados, os anexos privados e os lembretes dentro do app foram verificados com a API real. Há registros identificados como fictícios para facilitar o teste. O envio real de Web Push em segundo plano não foi ativado neste ambiente; depende das chaves, runtime/agendamento e acesso aos serviços externos de push.

O teste automatizado de navegador verificou login, leitura de laudo, abertura de PDF privado e criação de registro. O teste da API verificou bloqueio de leitura/alteração/arquivos entre duas contas e bloqueio anônimo.

Os containers foram mantidos em execução para o teste manual. Os volumes são locais ao ambiente; isso não é uma publicação permanente.
