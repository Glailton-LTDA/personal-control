# Validação da redução de requisições financeiras

Branch: `perf/personal-control-egress`

## Mudanças

- `mfSelectAll` lê páginas sob demanda, em vez de disparar ondas especulativas de oito requisições. Mantém o avanço pelo número real de registros, a deduplicação e a confirmação por página vazia, inclusive com limite do servidor inferior a 1.000.
- Ao atingir a trava de paginação, informa erro em vez de entregar totais incompletos silenciosamente.
- Cartões e detalhe da conta compartilham a consulta de configurações no React Query, com chave por usuário e conjunto de cartões, validade de dez minutos e invalidação existente após mutations.

Não há migration nem mudança de regras financeiras. Os agregados de resumo, extrato e ciclos já existem na base desta branch. Esta entrega não reduz a janela de 13 meses dos cartões nem troca a projeção das transações: ambas alimentam cálculos e cache offline que precisam de validação específica antes de um corte adicional.

## Preparação local

1. Faça checkout da branch e execute `npm ci`.
2. Com Docker Desktop disponível, execute `npx supabase start`.
3. Se ainda não existir, copie `.env.local.example` para `.env.local`. Preserve uma configuração local existente. Confira a chave local com `npx supabase status` e não use chaves de produção.
4. Execute `npm run dev`. No Network do navegador, confirme API em `127.0.0.1:54421`.

## Roteiro manual

- Confira saldos de contas, resumo e extrato em pelo menos três meses, incluindo um mês anterior e um futuro.
- Em Cartões, confira compras parceladas, estornos, pagamentos parciais, faturas pagas e futuras. Compare os mesmos dados com a versão anterior.
- Abra o detalhe da conta e volte para Cartões. Com o mesmo conjunto de cartões e dentro de dez minutos, a consulta `mf_card_settings` deve aproveitar o cache. Conjuntos diferentes têm caches próprios.
- Altere fechamento, vencimento ou conta vinculada e confira a atualização das faturas após a invalidação.
- Crie, edite e exclua um lançamento e confira a atualização de saldos e faturas.
- Teste o modo offline depois de carregar os dados online e confirme as operações suportadas.
- Troque de usuário e confirme que não reutiliza configurações do usuário anterior.

## Comparação de tráfego

Use os mesmos dados e ações antes/depois, em sessões novas para a primeira carga. Com o Network aberto e o log limpo, registre quantidade de chamadas, bytes transferidos e duração; separe primeira carga de navegação com cache aquecido. Compare respostas completas, não apenas quantidade de chamadas.

O teste automatizado com 2.500 registros passa de dez chamadas de rede para quatro, sem perder registros. Isso não equivale a uma redução de 60% no egress: chamadas vazias têm respostas pequenas, e o volume útil continua necessário. Leituras grandes podem levar mais tempo porque as páginas agora são sequenciais. Avalie essa duração no seu cenário.

O consumo faturado em GB precisa ser acompanhado no painel Usage do Supabase após uma eventual publicação. Não houve alteração no banco hospedado ou publicação desta branch em produção.
