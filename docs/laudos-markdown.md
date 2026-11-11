# Markdown nos laudos

O campo `health_exams.report` continua armazenando o texto original. Não há mudança de schema, API, autorização ou formato de dados compartilhado com outros clientes.

Para testar com o banco local atualizado, use `npm run dev:local`: aplica as migrations locais pendentes e inicia o app somente se elas terminarem com sucesso. O Supabase local precisa estar em execução e o `.env.local` deve apontar para ele. `npm run db:migrate:local` executa apenas a primeira etapa. A CLI está fixada na mesma versão da pipeline; nenhum desses comandos usa banco remoto ou reset.

Nos detalhes do exame, a aba Laudo apresenta títulos, ênfase, listas, código e tabelas. No formulário, Editar Markdown e Visualizar alternam entre o texto e a prévia do rascunho. Alternar o modo não salva; somente Salvar usa o fluxo existente. O limite permanece em 100.000 caracteres. Textos simples continuam sendo exibidos.

O parser de Notas Markdown foi extraído para `src/lib/markdown.js` e o componente para `src/components/MarkdownRenderer.jsx`. Notas e laudos usam a mesma implementação. As tabelas reconhecem separadores de alinhamento e pipes escapados. Os checkboxes das notas preservam o callback existente.

## Segurança e interface

O renderizador escapa HTML, valida protocolos de links e sanitiza o HTML gerado com DOMPurify, com versão fixa no lockfile. Links externos recebem `noopener noreferrer` e `no-referrer`. O conteúdo não carrega imagens remotas ou scripts; imagens e documentos médicos continuam no fluxo privado existente. O conteúdo não é enviado a serviços de Markdown nem gravado durante a prévia.

As tabelas dos laudos viram pares de rótulo/valor em telas estreitas; os cabeçalhos permanecem no DOM para acessibilidade. Código longo quebra em linhas. As novas strings têm traduções pt/en/es.

## Validação local desta proposta

- Lint e build aprovados.
- 1.716 testes unitários aprovados em 148 arquivos; 695 casos foram acrescentados para fechar a lacuna global e proteger as regressões encontradas.
- Cobertura global: 83,60% de linhas, 81,52% de instruções, 78,33% de funções e 75,34% de branches. Os quatro limites de 75% foram atendidos sem reduzir thresholds ou excluir código de produção.
- Cobertura do código alterado contra a base de `develop`: 100% nas quatro métricas.
- Navegador: 80 casos aprovados na suíte completa; o caso de recuperação de senha que falhou foi corrigido e aprovado em reexecução específica. Os sete casos de push global passaram. A suíte inclui exames/laudos, pt/en/es, persistência do texto original, prévia sem salvar e layouts mobile/tablet/desktop.
- Scanner de segredos aprovado no snapshot dos arquivos versionáveis. A configuração permite somente o JWT público exato do exemplo local; tokens diferentes ou privilegiados não são liberados por essa exceção.

## Integração

A implementação está na branch `feature/medical-report-markdown`, destinada a `develop` pelo PR 111. A cobertura global deixou de ser um bloqueio na validação local. A pipeline deve validar o SHA enviado e publicar seus próprios relatórios; os checks exigidos pelo [AGENTS.md](../AGENTS.md) continuam obrigatórios para integração. Merge e publicação em produção dependem de autorização específica.

Os casos adicionais e as correções encontradas durante essa ampliação estão descritos em [Cobertura global e regressões](cobertura.md). Não há migration nova nesta proposta.
