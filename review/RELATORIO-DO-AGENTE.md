# Relatório do Agente — Tratamentos Medicamentos (agendamento completo)

## Escopo da entrega
Refatorar os medicamentos do Guia Médico para um agendamento de tratamento completo:
intervalos e horários locais, duração finita/contínua, pré-visualização, listas ativas/encerradas,
resumo/calendário/histórico, registro/desfazer de dose, revisões, pausa/retomada/encerramento,
anexos privados e push global, compartilhando um único schema Supabase canônico entre web e Android.

## Branch e integração
- Branch: `feature/medication-treatments` (a partir de `origin/develop` `29b2c26`).
- Sem commits/push diretos em `main` ou `develop`.
- Migração aditiva apenas, idempotente; nunca editar migrações aplicadas.
- Não há tabelas ou regras de negócio divergentes entre web e Android.

## Decisões de projeto (ADR em `docs/tratamentos-medicamentos.md`)
- `health_doses`: projeção do registro atual; desfazer = RPC DELETE auditado + append-only
  `health_dose_events`; sem lógicos de exclusão (tombstones).
- Revisões de agenda em `health_medication_schedules` com `effective_from`/`effective_until`;
  sobreposição evitada com advisory lock + `FOR UPDATE`; pausa encerra revisão, retoma clona
  com mesmo âncora, encerramento encerra no corte.
- `health_medication_occurrences` único em `(user_id, medication_id, scheduled_at)`;
  `canceled_at` + motivo; sem status; materialização em janela limitada (scheduler 14 dias,
  leitura/mutação 14–42 dias, ≤1000 por chamada).
- Tempo: intervalo = âncora + n*intervalo; finito exclusivo em âncora + N*24h;
  diário = datas locais no fuso do snapshot; horário inexistente omitido (`null`),
  ambíguo usa o instante anterior; paridade JS/SQL.
- Fuso detectado via `Intl` do aparelho e persistido como snapshot; validado no banco;
  nunca reinterpretado na edição.
- Idempotência via `health_private.commands(user_id, request_id)` com operação + hash md5 do
  payload; mesma chave/payload diferente → `IDEMPOTENCY_CONFLICT`; poda de 7 dias.
- Gravação/registro/desfazer/estado são `SECURITY DEFINER` de `health_scheduler`,
  `search_path=''`; listagem/detalhe/calendário/histórico são RPCs do invocador.
- Erros com mensagens estáveis P0001 (AUTH_REQUIRED, INVALID_TIMEZONE, INVALID_LOCAL_TIME,
  VERSION_CONFLICT, WINDOW_TOO_LARGE, INVALID_SCHEDULE, INVALID_INTERVAL, INVALID_DURATION,
  OCCURRENCE_NOT_SCHEDULED, SCHEDULE_HAS_RECORDED_OCCURRENCES, RESUME_EXPIRED,
  FUTURE_TAKEN_AT, FUTURE_OCCURRENCE, NOT_FOUND_OR_FORBIDDEN).
- Compatibilidade legado: trigger traduz gravações antigas (`times/starts_on/ends_on/timezone`)
  em revisão diária; gatilhos de dose vinculam ocorrências e auditam; RPCs definem GUC
  `health.schedule_api=1` para evitar trabalho duplicado.
- Push: reutiliza `push_subscriptions`, Settings global push, worker/caminho compartilhado,
  payload neutro, revalida elegibilidade/dono após a reclamação, entrega pelo menos-uma-vez.

## O que foi implementado
### Banco de dados (Supabase)
- Migração canônica `supabase/migrations/20261113120000_medication_treatments.sql`:
  esquema, índices, RLS, concessões mínimas, funções auxiliares (`local_instant`,
  `schedule_slots`, `assert_budget`, `ensure_occurrences`, `revision_total`, `slot_schedule`,
  ledger de idempotência), gatilhos (revisão, versão da linha, ponte legado, auditoria de dose,
  agendador) e RPCs (`health_treatment_save`, `health_treatment_state`, `health_dose_record`,
  `health_dose_undo`, `health_treatment_list`, `health_treatment_dashboard`,
  `health_treatment_detail`, `health_treatment_calendar`, `health_treatment_history`,
  `health_prepare_reminders`, `health_claim_reminders`, `health_refresh_reminders`,
  backfill legado idempotente).
- Teste de aceitação/segurança `supabase/tests/medication_treatments.sql`: PASS.
- Teste de segurança existente `supabase/tests/health_security.sql`: PASS.
- Validação de migração do zero: `supabase db reset --local` aplicou `20261113120000` sem erros.

### Web (camada pura)
- `src/lib/treatmentEngine.js`: validação, geração de slots (intervalo/diário), paridade DST,
  pré-visualização, contagens, construtor de payload, rótulo de agenda, `slotsByLocalDate`.
  Limites: 1000 slots/chamada, 42 dias, intervalo 60–10080 min, duração ≤365 dias, 24 horários.
- `src/lib/treatments.js`: wrappers de RPC com IDs de requisição idempotentes e mapeamento de
  erros P0001 → chaves de i18n (nunca expoe texto bruto do servidor).
- `src/hooks/useTreatments.js`: chaves de query sempre incluem o usuário (cache isolado por conta
  e limpo na troca de sessão), mutações idempotentes, invalida `['health', userId]` e
  `['treatments', userId]` após gravações.
- Componentes: `TreatmentForm` (criar/editar com prévia de doses), `TreatmentList` (listagem
  paginada por grupo de status), `TreatmentDetail` (resumo/calendário/histórico, registrar e
  desfazer dose, pausa/retomada/encerramento).
- `src/components/Health/HealthGuide.jsx`: rota `medications` agora usa os componentes de
  tratamento; navegação `/health/treatments/<id>`.
- CSS: prévia de doses, agrupamento por dia, responsivo 320/390/768/1024/1440, sem overflow
  horizontal, claro/escuro.
- i18n (pt/en/es): chaves de tratamento, dose, agenda, duração, pausa/retomada/encerramento,
  registro/desfazer de dose, calendário/histórico e mensagens de erro estáveis.
- `supabase/functions/health-reminders/index.ts`: já inclui revalidação pós-reclamação
  (dismissed_at/delivered_at/remind_at, dono) e payload neutro (não promete entrega exatamente-uma-vez).

## Testes
- `src/lib/treatmentEngine.test.js`: 39 testes (F01/F02, T01–T22, DST, validação, limites, prévia).
- `src/lib/treatments.test.js`: wrappers de RPC, mapeamento de erros, rejeição sem usuário.
- `src/hooks/useTreatments.test.jsx`: chaves de query, hooks de leitura, invalidação de mutações.
- `src/components/Health/HealthGuide.flows.test.jsx`: atualizado para rotas de tratamento.
- `tests-e2e/health.spec.js`: mock do RPC `health_treatment_save` + teste de criação de tratamento.
- Cobertura do código novo/alterado (arquivos carregados nos testes): ≥75% em linhas, ramos,
  funções e instruções (`treatmentEngine.js`, `treatments.js`, `useTreatments.js`).
- Lint: limpo (`npx eslint`). Build: `npm run build` concluído.

## Validação
- `npm run lint`: sem erros nos arquivos alterados.
- `npm run build`: concluído com sucesso (avisos prévios de tamanho de chunk, não relacionados).
- Testes de unidade relacionados: 107 aprovados.
- Testes SQL no banco local real (usuários A/B/anon): `medication_treatments.sql` PASS,
  `health_security.sql` PASS.
- Migração aplicada do zero via `supabase db reset --local` sem erros.

## Itens não implementados / não testados (declarados)
- Repo Android (`personal-control-app`): não há módulo de saúde; apenas documentação do contrato
  compartilhado; não foi possível validar no Android.
- Teste do worker (`supabase/functions/health-reminders/index.test.ts`): usa Deno, não
  disponível neste ambiente; não executado. O worker já contém a revalidação pós-reclamação.
- Testes de componente/navegador das novas peças `TreatmentForm`, `TreatmentList`,
  `TreatmentDetail`: cobertos por fluxo (`HealthGuide.flows.test.jsx`) com os componentes
  simulados; testes unitários dedicados não foram escritos.
- Testes E2E (Playwright): exigem navegadores instalados; não executados neste ambiente.
- Captura de capturas de tela do relatório: não executada (depende de navegador/Playwright).

## Riscos
- Cobertura global do repositório depende da suíte completa (sucessos pré-existentes em
  `MinhasFinancas` têm timeouts curtos nesta máquina e não estão relacionados a esta mudança).
- Os componentes de tratamento são exercidos por testes de fluxo com simulação; comportamento
  visual detalhado depende de teste E2E com navegador.
- Não há validação cruzada no Android (sem módulo de saúde no repo nativo).

## Próximos passos (após autorização de merge)
- Executar suíte completa de testes, cobertura global (≥75% linhas/ramos/funções/instruções)
  e lint no CI.
- Executar testes E2E/Playwright com navegadores.
- Revisar e aprovar o PR de `feature/medication-treatments` para `develop` (não fazer merge
  direto).
- Enviar documentação correspondente ao repo Android via PR com referência cruzada.
