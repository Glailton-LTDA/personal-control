# Regras obrigatórias de desenvolvimento

Estas regras aplicam-se a humanos e agentes no repositório web `personal-control`.
As instruções específicas do aplicativo nativo pertencem ao seu próprio repositório.

## 1. Branches e integração

- Antes de editar arquivos, criar uma branch de trabalho: `feature/<nome>`,
  `fix/<nome>`, `docs/<nome>` ou outro prefixo que descreva a tarefa.
- É estritamente proibido fazer commits ou pushes diretos em `main` ou `develop`.
- Usar `develop` como base se essa branch existir; caso contrário, criar a
  branch a partir de `main` e abrir PR para `main`. Nunca escrever direto nela.
- Só integrar após os checks exigidos passarem. Não ignorar checks ou proteções.
- Preservar alterações pendentes de outras tarefas e manter PRs com escopo claro.

## 2. Strings e traduções

- É proibido hardcode de textos exibidos ao usuário, inclusive validações,
  erros, acessibilidade, notificações e conteúdo de exemplo em telas.
- Usar o mecanismo i18n existente na web e seus arquivos de tradução.
- Entregar as traduções correspondentes em português, inglês e espanhol.
- Não concatenar frases traduzidas; usar placeholders e plurais. Formatar
  datas, números e moedas conforme locale, preservando a moeda do lançamento.
- Identificadores técnicos de protocolos, chaves e nomes de tabelas não são
  textos de interface. Nunca expor mensagens brutas do servidor na interface.

## 3. Cobertura e pipeline

- Cada commit de código deve manter cobertura global mínima de 75% em linhas,
  branches, funções e instruções. Cobertura do código novo/alterado também
  deve atingir pelo menos 75%, quando houver código executável alterado.
- Medir sobre o código de produção, não apenas sobre arquivos importados por
  testes. Não excluir código de negócio ou reduzir thresholds para passar.
- Validar a cobertura no build da pipeline: resultado inferior a 75%, relatório
  ausente ou erro na coleta devem falhar o job, sem `continue-on-error`.
- Publicar relatórios de cobertura como artifacts e tornar os checks obrigatórios
  para merge. Validar cada SHA de código enviado para PR, não apenas releases.
- Documentos/configurações sem código executável não têm percentual próprio;
  sua alteração não autoriza desativar os checks existentes.
- Configurar e executar coleta de cobertura e thresholds do Vitest no CI.
- Este documento é um requisito; não afirmar que a cobertura está garantida sem
  executar a medição e implementar o bloqueio na pipeline.

## 4. Testes

- Unitários devem ser detalhados: sucesso, erro, limites, entradas inválidas,
  transições de estado, condições, cancelamento e concorrência quando aplicáveis.
- Testar regras de cada módulo e suas integrações, autorização e isolamento
  entre usuários. Para finanças, cobrir também datas de faturas, arredondamento
  e duplicidade; para os demais módulos, cobrir suas condições específicas.
- Manter testes de navegador dos happy paths dos fluxos principais.
  As combinações detalhadas de regras e erros devem ficar nos testes unitários.
- Usar dados sintéticos e infraestrutura isolada. Nunca modificar dados reais
  de usuários para testar. Não usar pausas fixas como sincronização de UI.

## 5. Desenvolvimento web

- Seguir as boas práticas de React e JavaScript e a arquitetura existente.
- Manter componentes com responsabilidades claras; regras de negócio e acesso
  a dados devem ficar em hooks, serviços e funções apropriadas.
- Tratar carregamento, erro, cancelamento e invalidação de consultas. Evitar
  estado duplicado e efeitos sem limpeza; respeitar as regras de hooks.
- Garantir acessibilidade, navegação por teclado, temas e layouts responsivos.
- Preservar precisão monetária e testar arredondamento; não introduzir cálculos
  financeiros com ponto flutuante sem tratamento explícito e validação.

## 6. Lint antes de cada commit

- Executar o lint antes de cada commit, inclusive alterações pequenas.
- Executar `npm run lint` e validar os documentos alterados (links locais,
  whitespace e estrutura).
- A pipeline também deve executar lint e falhar em erros; warnings e baselines
  novos devem ser avaliados, não adicionados para ocultar problemas.

## 7. Supabase e banco de dados

- Web e Android devem usar o mesmo schema Supabase e as mesmas tabelas,
  colunas, relacionamentos e contratos de dados para a mesma funcionalidade.
  É proibido criar tabelas ou schemas paralelos por plataforma para representar
  a mesma funcionalidade. Os dados devem ser compartilhados entre os clientes.
- Antes de propor nova tabela, consultar o schema e as migrações existentes.
  Evoluir a estrutura compartilhada por uma única migração canônica, mantendo
  compatibilidade com web e Android e validando os impactos nos dois clientes.
  Não manter definições de schema ou históricos de migração divergentes.
- O histórico canônico das migrações Supabase permanece em
  `Glailton-LTDA/personal-control/supabase/migrations`. Mudanças necessárias ao
  Android devem ser feitas ali por branch e PR, com referência cruzada no PR
  Android. Não executar uma segunda migração equivalente pelo outro repositório.
- Armazenamento local/cache pode usar estruturas próprias da plataforma, mas
  deve mapear o contrato compartilhado e nunca criar outra fonte de verdade
  nem justificar tabelas Supabase duplicadas para a mesma funcionalidade.
- Ler a skill Supabase disponível ao trabalhar em autenticação, cliente ou banco;
  seguir práticas atuais de Postgres e verificar documentação relevante.
- Compartilhar o backend existente com permissões por usuário: RLS nas tabelas
  expostas, políticas por proprietário e validação de referências entre usuários.
- Não confiar em user_metadata para autorização ou em validação só no cliente.
- Mudanças de schema devem ter migração versionada, revisão e teste de regressão.
  Não editar migrações já aplicadas. Preservar compatibilidade com os clientes ativos.
- Usar transações para operações atômicas, idempotência na sincronização,
  índices conforme consultas e paginação. Evitar consultas sem limite.
- Usar SECURITY DEFINER apenas com necessidade demonstrada, search_path fixo,
  autorização explícita e privilégios mínimos. Revisar planos quando pertinente.

## 8. Revisão de segurança antes de cada commit

- Revisar o diff staged procurando segredos, dados pessoais, logs sensíveis,
  falhas de autorização, permissões excessivas e alterações inseguras.
- Nunca versionar senhas, tokens, chaves privadas, service_role/secret keys,
  certificados privados ou configurações locais com credenciais.
- Chaves publishable públicas do Supabase não substituem RLS. Configurá-las por
  ambiente; credenciais privilegiadas ficam apenas no servidor.
- Não registrar senhas, tokens de sessão ou conteúdo financeiro em logs.
- Usar armazenamento protegido para sessão, transporte TLS e separação de dados
  locais/filas por usuário. Limpar acesso local no logout e troca de conta.
- Automatizar detecção de segredos no CI e manter dependências fixadas com
  lockfiles/verificação compatível com a ferramenta. Falhas devem bloquear merge.
- Registrar no PR o lint, testes, cobertura medida e revisão de segurança,
  incluindo qualquer verificação ainda bloqueada. Não afirmar resultado não medido.
