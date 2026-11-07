# Segurança do Minhas Finanças — versão 1.36.0

As migrations desta alteração não removem nem reescrevem lançamentos, contas, faturas, investimentos ou despesas de viagens. Alteram permissões e funções, adicionam validações para gravações futuras e criam o contador de uso do Felix. Referências legadas não são “corrigidas” automaticamente.

## Produção

1. Validar as migrations em PostgreSQL isolado com `npm run test:security`, a suíte completa (`npx vitest run`), build e auditoria npm.
2. Consultar referências entre usuários e registrar contagens/hashes antes da aplicação. Se houver registros inválidos, não apagar ou reassociar automaticamente.
3. Aplicar as duas migrations em ordem, com transação e limite de espera por lock. Confirmar histórico e permissões, além das contagens/hashes. Não executar scripts de reset ou seed.
4. Publicar a Edge Function `finance-ai` depois da função SQL de limite. Manter `verify_jwt=true` e a validação adicional com `getUser()`.
5. Publicar o frontend. O service worker renova somente o shell da aplicação; não exclui IndexedDB nem caches de outros aplicativos.

O workflow de migrations roda no merge na `main`. Se as migrations já tiverem sido aplicadas pelo conector Supabase, os arquivos devem usar os mesmos identificadores registrados no histórico remoto para evitar reaplicação.

## Dev existente — sem perda dos dados locais

- Use Node 24 LTS e `npm ci` depois de atualizar a branch.
- Confirme que o alvo é o Supabase local do projeto (portas 544xx), nunca uma conexão de produção.
- Com o stack local já disponível, execute `npx supabase migration up --local` para aplicar apenas as migrations pendentes. Confira antes `npx supabase migration up --help` na versão instalada.
- Se o histórico local divergir, pare e revise o histórico; não utilize `db reset`, `migration repair`, exclusão de volumes ou importação de seed para forçar a atualização.
- Para as funções locais, use o comando de serve apropriado do Supabase, com seus secrets locais. Os limites de IA são os mesmos de produção.

Dev recebe a mesma estrutura e as mesmas regras por migration. Isso não copia dados nem credenciais de produção. Se o banco de Dev estiver em outra máquina, a aplicação das migrations deve acontecer lá.

## Preservação do offline

O cache não é apagado no logout ou em erros de upgrade. Leituras e alterações financeiras são limitadas ao usuário da sessão. Cache sem `user_id` verificável não é exibido por outra conta. Fila nova registra o autor, e o sincronizador interrompe envios ao mudar a sessão.

Filas financeiras legadas que já têm `payload.user_id` mantêm esse dono. Entradas sem identificação ficam em quarentena e são sinalizadas na interface, sem envio ou descarte. A recuperação de entradas sem dono exige revisão específica; não as atribua à conta que estiver conectada por conveniência. Tentativas esgotadas da própria conta podem ser retomadas pela interface.

Essas medidas isolam o acesso pela aplicação. Dados locais não são um cofre criptografado contra alguém com acesso ao perfil do navegador ou ao sistema operacional.

## Pontos de restauração

Snapshots versão 2 são criados no servidor com todos os registros financeiros, sem o limite de linhas da REST. Incluem faturas oficiais, configurações históricas e metadados de integrações. Não são backup dos arquivos binários no Storage nem de outros módulos.

A restauração é um merge não destrutivo: restaura os registros do ponto, mantém registros posteriores e cria um backup automático antes. Qualquer erro reverte a operação inteira. Os IDs de conflito são conferidos para impedir sobrescrita de registros de terceiros.

Pontos legados ficam preservados, mas não podem disparar restauração automática porque não há garantia de completude. Se uma integração externa mudou desde o ponto, a restauração é bloqueada para não desalinhar viagens/investimentos; nenhum dado é alterado nesse caso. Escritas offline pendentes devem ser sincronizadas antes de criar ou restaurar um ponto.

## Felix e dependências

Felix aceita até 64 KiB de corpo, 40 mensagens (8.000 caracteres cada, 48.000 no total), 10 solicitações por minuto e 100 por dia por usuário. O contador é atômico e não pode ser alterado diretamente pelo cliente. A indisponibilidade do controle bloqueia a chamada ao modelo. A saída de cada chamada é limitada a 2.048 tokens.

A atualização de dependências inclui migrações de versões maiores das ferramentas de build/testes e dos mapas. Validar os fluxos de relatórios PDF, gráficos, mapas, autenticação e integração antes de publicar. O lockfile faz parte da entrega; não usar `npm audit fix --force` em produção.

## Reversão

As mudanças de autorização não apagam registros. Se o frontend precisar de rollback, preservar o banco endurecido e revisar eventuais incompatibilidades; não reabrir permissões de escrita direta só para esconder erros. Se o Felix apresentar problemas, interromper temporariamente o recurso ou restaurar a versão anterior da função mantendo autenticação. Nunca remover a limitação do banco para “resolver” falhas de consumo.
