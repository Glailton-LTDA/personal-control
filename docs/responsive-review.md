# PC-002 — Revisão de responsividade

Entrega: **2.8.1**, em branch `fix/responsive-main-flows`, baseada em `develop`.

## Escopo

Revisar os fluxos principais no celular e no tablet, preservando a experiência no desktop e os temas claro e escuro. Corrigir cortes de conteúdo, controles fora da tela, campos comprimidos e ações inacessíveis. A revisão usa somente dados sintéticos com autenticação e respostas de rede simuladas.

## Problemas reproduzidos e correções

A primeira auditoria percorreu 23 rotas em quatro larguras (320, 768, 1024 e 1440 px): 92 combinações. Foram reproduzidos cortes no nome da viagem selecionada, nas datas do roteiro, nas abas de viagens e veículos e nos campos de modelos de serviço. O roteiro também ultrapassava a área disponível em 1024 px.

- **Viagens:** o nome selecionado pode quebrar linha sem perder o conteúdo. As datas do roteiro formam uma grade e as abas dos ajustes se reorganizam. O formulário usa as cores do tema e mantém as ações acima da navegação inferior, com espaço reservado no fim do conteúdo.
- **Veículos:** abas se reorganizam; campos de placa, quilometragem e serviços se empilham em telas estreitas. O formulário pode rolar verticalmente e mantém o fechamento acessível.
- **Investimentos:** campos monetários que tinham aproximadamente 64 px no celular passam a ocupar uma linha. Cabeçalho e ações do registro permanecem acessíveis com rolagem vertical. Grades, abas, cabeçalhos de instituições e ações das contas acomodam nomes longos. O campo de moeda dos ajustes ocupa a largura da grade sem criar uma coluna implícita.
- **Grades compartilhadas:** colunas usam `minmax(0, 1fr)` para respeitar a largura disponível. Mantido o empilhamento existente abaixo de 600 px.
- **Acessibilidade:** formulários de veículos e investimentos recebem identificação de diálogo e fechamento com rótulo traduzido em português, inglês e espanhol.

## Regressões automatizadas

O arquivo [responsive.spec.js](../tests-e2e/responsive.spec.js) verifica:

- 25 rotas em 320 e 768 px nos dois temas, incluindo Meu dia, finanças, guia médico, viagens, veículos, investimentos, listas, músicas e ajustes;
- sete rotas mais suscetíveis a cortes em 1024 e 1440 px nos dois temas;
- formulários de veículos e registros de investimentos em 320 × 640, 768 × 900 e 390 × 400 px, incluindo foco, largura dos campos, alcance do envio e fechamento;
- ações do formulário de viagens acima da navegação móvel e contraste no tema claro.

As verificações medem a área principal e os limites dos controles, além da largura do documento: `overflow-x: hidden` no corpo não é suficiente para passar. Elementos decorativos de brilho não são classificados como conteúdo cortado.

O CI executa a matriz em Chromium e WebKit móvel em um job próprio. Localmente, Chromium usa o navegador do ambiente. O download local de WebKit foi bloqueado pelo servidor de distribuição (HTTP 403); sua verificação fica no job com a imagem oficial do Playwright. Testes de navegador não substituem uma conferência em aparelhos físicos, especialmente com teclado virtual e ajustes de acessibilidade do sistema.

## Performance e banco de dados

As mudanças de produção são de apresentação, CSS e acessibilidade. Não há novas consultas, efeitos de busca, assinaturas, polling ou chamadas ao Supabase. Autenticação, cache, projeções, paginação e políticas de proprietário existentes permanecem com os mesmos contratos. **Não há migrations nesta entrega.**

## Limites da revisão

A matriz cobre rotas principais e os formulários descritos, sem pretender cobrir cada estado ou diálogo do aplicativo. Não altera regras financeiras, agendamento de doses nem navegação global. Se surgir um novo corte em outra combinação de dados ou dispositivo, incluir o cenário na regressão antes de corrigir.

## Validação local

- Lint e build aprovados; 172 arquivos e 2.078 testes unitários aprovados.
- Cobertura global: linhas 84,92%, instruções 82,79%, funções 79,96% e branches 76,96%. O verificador de cobertura do diff também passou (branches 75%; demais métricas sem novos trechos executáveis mapeados).
- Chromium: 14 cenários aprovados na matriz principal e o cenário de viagens aprovado após corrigir a espera da animação no próprio teste. Total de 128 verificações de rotas, seis cenários de formulários e um cenário de ações do formulário de viagens.
- Revisão do diff e Gitleaks sem ocorrências de segredos. Resultado de WebKit deve ser consultado no CI do PR.
