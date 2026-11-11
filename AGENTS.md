# Regras obrigatórias de desenvolvimento

Estas regras aplicam-se a humanos e agentes neste repositório. O mesmo contrato
é adotado nos repositórios web `personal-control` e Android `personal-control-app`.

## 1. Branches e integração

- Antes de editar arquivos, criar uma branch de trabalho: `feature/<nome>`,
  `fix/<nome>`, `docs/<nome>` ou outro prefixo que descreva a tarefa.
- É estritamente proibido fazer commits ou pushes diretos em `main` ou `develop`.
- Android: criar branches a partir de `develop`; integrar por PR para `develop`.
  Releases chegam a `main` por PR de `develop` para `main`.
- Web: usar `develop` como base se essa branch existir; caso contrário, criar a
  branch a partir de `main` e abrir PR para `main`. Nunca escrever direto nela.
- Só integrar após os checks exigidos passarem. Não ignorar checks ou proteções.
- Preservar alterações pendentes de outras tarefas e manter PRs com escopo claro.

## 2. Strings e traduções

- É proibido hardcode de textos exibidos ao usuário, inclusive validações,
  erros, acessibilidade, notificações e conteúdo de exemplo em telas.
- Usar o mecanismo de internacionalização da plataforma: recursos Android
  `strings.xml`/plurals e `stringResource`, ou i18n na web.
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
- Antes da primeira entrega de código Android, configurar ferramenta de cobertura
  compatível com Kotlin/Compose, relatório e verificação de thresholds no CI.
  Na web, configurar e executar a coleta/thresholds do Vitest no CI.
- Este documento é um requisito; não afirmar que a cobertura está garantida sem
  executar a medição e implementar o bloqueio na pipeline.

## 4. Testes

- Unitários devem ser detalhados: sucesso, erro, limites, entradas inválidas,
  transições de estado, condições, cancelamento e concorrência quando aplicáveis.
- Testar regras financeiras, datas de faturas, arredondamento, duplicidade,
  autorização e isolamento entre usuários com cenários relevantes.
- Manter testes em emulador Android para os happy paths dos fluxos principais.
  Não é necessário repetir no emulador todas as combinações dos unitários.
- Na web, manter testes de navegador dos fluxos principais.
- Usar dados sintéticos e infraestrutura isolada. Nunca modificar dados reais
  de usuários para testar. Não usar pausas fixas como sincronização de UI.

## 5. Kotlin e Compose

- Seguir as recomendações oficiais atuais de Android, Kotlin e Jetpack Compose.
- Usar fluxo unidirecional: UI observa estado imutável e envia eventos ao
  ViewModel; repositórios coordenam dados; regras de negócio não ficam em Composables.
- Coletar flows com respeito ao lifecycle; usar coroutines e cancelamento
  estruturado. Não fazer I/O bloqueante na main thread ou usar GlobalScope.
- Manter estado restaurável, acessibilidade, suporte a tema e layouts adaptáveis.
- Base acordada: Kotlin, Compose/Material 3, ViewModel/StateFlow, Hilt, Room e
  WorkManager. Validar compatibilidade das versões antes de adicionar dependências.
- Guardar valores monetários com representação decimal exata ou unidades menores
  explícitas, nunca Float/Double para cálculo financeiro.

## 6. Lint antes de cada commit

- Executar o lint antes de cada commit, inclusive alterações pequenas.
- Web: `npm run lint`. Android: executar Android Lint e os verificadores Kotlin
  definidos pelo projeto; consultar as tasks disponíveis no Gradle Wrapper.
- Enquanto o Android contiver somente documentação, validar Markdown (links
  locais, whitespace e estrutura). Não declarar Android Lint aprovado sem projeto.
- A pipeline também deve executar lint e falhar em erros; warnings e baselines
  novos devem ser avaliados, não adicionados para ocultar problemas.

## 7. Supabase e banco de dados

- Ler a skill Supabase disponível ao trabalhar em autenticação, cliente ou banco;
  seguir práticas atuais de Postgres e verificar documentação relevante.
- Compartilhar o backend existente com permissões por usuário: RLS nas tabelas
  expostas, políticas por proprietário e validação de referências entre usuários.
- Não confiar em user_metadata para autorização ou em validação só no cliente.
- Mudanças de schema devem ter migração versionada, revisão e teste de regressão.
  Não editar migrações já aplicadas. Preferir mudanças compatíveis com a web.
- Usar transações para operações atômicas, idempotência na sincronização,
  índices conforme consultas e paginação. Evitar consultas sem limite.
- Usar SECURITY DEFINER apenas com necessidade demonstrada, search_path fixo,
  autorização explícita e privilégios mínimos. Revisar planos quando pertinente.

## 8. Revisão de segurança antes de cada commit

- Revisar o diff staged procurando segredos, dados pessoais, logs sensíveis,
  falhas de autorização, permissões excessivas e alterações inseguras.
- Nunca versionar senhas, tokens, chaves privadas, service_role/secret keys,
  keystores de assinatura ou configurações locais com credenciais.
- Chaves publishable públicas do Supabase não substituem RLS. Configurá-las por
  ambiente; credenciais privilegiadas ficam apenas no servidor.
- Não registrar senhas, tokens de sessão ou conteúdo financeiro em logs.
- Usar armazenamento protegido para sessão, transporte TLS e separação de dados
  locais/filas por usuário. Limpar acesso local no logout e troca de conta.
- Automatizar detecção de segredos no CI e manter dependências fixadas com
  lockfiles/verificação compatível com a ferramenta. Falhas devem bloquear merge.
- Registrar no PR o lint, testes, cobertura medida e revisão de segurança,
  incluindo qualquer verificação ainda bloqueada. Não afirmar resultado não medido.
