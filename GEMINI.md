# Diretrizes do Projeto: PersonalControl

Este arquivo contém regras mandatórias para a Inteligência Artificial ao manipular este repositório.

## 🛡️ Regra de Ouro: Build-First Delivery
- **VALIDAÇÃO OBRIGATÓRIA**: Após cada modificação significativa em arquivos de código (`.jsx`, `.js`, `.ts`, `.css`), você **DEVE** rodar o comando `npm run build` para garantir que não existam erros de sintaxe ou tags órfãs.
- **NAO ENTREGUE CÓDIGO QUEBRADO**: Se o build falhar, você deve corrigir o erro antes de finalizar a tarefa ou reportar o progresso ao usuário.
- **TESTES OBRIGATÓRIOS**: Sempre que houver implementação ou mudanças de código, você **DEVE** rodar a suíte de testes (`npm run test` e E2E) para garantir que nada foi quebrado. Além disso, se criar novas funcionalidades, **ADICIONE** testes unitários e E2E cobrindo a nova implementação.

## 🎨 Padrão de Design: Clean Business
- Mantenha a estética original em Slate (#0f172a).
- Foco total em usabilidade de Desktop para gestão financeira.
- Evite elementos puramente estéticos que ocupem espaço útil de dados (como cards excessivamente grandes).

## 📧 Sistema de E-mail
- O sistema utiliza **Supabase Edge Functions** integradas com **Google Apps Script**.
- Nunca altere a lógica de substituição de variáveis no template de e-mail sem validar no provedor.
