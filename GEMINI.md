# Diretrizes do Projeto: PersonalControl

Este arquivo contém regras mandatórias para a Inteligência Artificial ao manipular este repositório.

## 🛡️ Regra de Ouro: Build-First Delivery
- **COMUNICAÇÃO TÉCNICA OBRIGATÓRIA**: O usuário é um Desenvolvedor Sênior (15+ anos). Utilize estritamente linguagem técnica, precisa e profissional. Evite termos coloquiais, explicações genéricas ou tom informal. Foco em arquitetura, padrões de projeto (Design Patterns) e performance.
- **VALIDAÇÃO OBRIGATÓRIA**: Após cada modificação significativa em arquivos de código (`.jsx`, `.js`, `.ts`, `.css`), você **DEVE** rodar o comando `npm run build` para garantir que não existam erros de sintaxe ou tags órfãs. **DEVE** rodar o comando `npm run lint` para garantir que o código siga o padrão de linting. **DEVE** rodar o comando `npm run test` para garantir que não existam erros de sintaxe ou tags órfãs e testes falhando. **DEVE** rodar o comando `npm run test:e2e` para garantir que não existam erros de sintaxe ou tags órfãs e testes falhando.
- **NAO ENTREGUE CÓDIGO QUEBRADO**: Se o build falhar, você deve corrigir o erro antes de finalizar a tarefa ou reportar o progresso ao usuário.
- **TESTES OBRIGATÓRIOS**: Sempre que houver implementação ou mudanças de código, você **DEVE** rodar a suíte de testes (`npm run test` e `npm run test:e2e`) para garantir que nada foi quebrado.
- **NOVA FUNCIONALIDADE = NOVOS TESTES**: Se criar ou modificar funcionalidades, você **DEVE ADICIONAR** obrigatoriamente testes unitários e E2E cobrindo a nova lógica/UI imediatamente após a implementação. Nunca considere uma tarefa finalizada sem os testes correspondentes registrados no repositório.

## 🎨 Padrão de Design: Clean Business
- Mantenha a estética original em Slate (#0f172a).
- Foco total em usabilidade de Desktop para gestão financeira.
- Evite elementos puramente estéticos que ocupem espaço útil de dados (como cards excessivamente grandes).

## 📧 Sistema de E-mail
- O sistema utiliza **Supabase Edge Functions** integradas com **Google Apps Script**.
- Nunca altere a lógica de substituição de variáveis no template de e-mail sem validar no provedor.
