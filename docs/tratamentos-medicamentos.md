# Tratamentos de medicamentos — ADR e contrato

Status: **aceito para implementação na branch `feature/medication-treatments`**
Data: 2026-11-13
Escopo: evoluir o cadastro de medicamentos do Guia médico para agenda de
tratamento (intervalo ou horários locais), ocorrências, registro/desfazer de
dose, calendário, histórico, revisões, pausa/retomada/conclusão e lembretes.
Web e Android compartilham o mesmo schema Supabase canônico.

## 1. Reconhecimento (Fase 0)

Schema vigente (migrations até `20261113004919_mf_review_consistency.sql`):

| Objeto | Situação encontrada | Impacto |
| --- | --- | --- |
| `health_medications` | `dose` textual, `starts_on/ends_on`, `times time[]`, `timezone`, `status` active/paused/finished, `reminders_enabled` | Não representa intervalo, quantidade estruturada, revisão nem fim exclusivo. |
| `health_doses` | único `(user_id, medication_id, scheduled_at)`; `taken_at`, `status taken/skipped`, `amount` | Serve como registro atual, mas não tem vínculo de ocorrência, versão nem auditoria. |
| `health_reminders` | fila com `scheduled_at`, `offset_minutes`, `remind_at`, `dismissed_at`, `delivered_at`, `claimed_until`; único de medicamento sem offset | Comporta um offset por ocorrência. Scheduler atual deriva de `times/timezone` e horizonte de 14 dias. |
| `health_private.schedule_record()` | trigger que materializa lembretes a partir de horários fixos | Precisa passar a derivar de ocorrências elegíveis, mantendo ponte para clientes antigos. |
| `health-reminders` | worker com `health_prepare_reminders`, claim por lease de 5 min, rechecagem, payload neutro | Reutilizado; a rechecagem passa a validar ocorrência/revisão/registro. |
| `src/lib/health.js`, `useHealth.js`, `HealthGuide.jsx`, `HealthForm.jsx` | projeções explícitas, páginas de 20, cache por usuário, formulário genérico de medicamento | Base preservada; medicamentos ganham serviço, hooks e componentes próprios. |
| Android (`personal-control-app`) | apenas fundação de autenticação/UI; nenhuma tabela ou módulo de saúde | Consome o mesmo contrato no futuro; nenhuma migração paralela. |

Não existe preferência global de fuso no repositório. Não há Docker obrigatório
para o desenvolvimento web, mas o stack local Supabase (PostgreSQL 17 + Auth +
Storage + Kong) é usado para validar SQL real. O repositório já usa PGlite para
testes SQL isolados e mantém scripts `supabase/tests/*.sql` executáveis em
Postgres descartável.

## 2. Decisão (ADR)

### AD-01 — `health_doses` é a projeção do registro atual; auditoria separada

**Decisão:** `health_doses` continua sendo a única fonte do registro atual
(taken/skipped). Desfazer executa, em uma transação:

1. calcula o hash/idempotência do comando;
2. apaga **somente** a linha atual de `health_doses` via RPC;
3. grava `health_dose_events` com ação `undone`, snapshot anterior e
   `request_id` (trigger `BEFORE DELETE`, portanto vale também para exclusões
   feitas por clientes antigos);
4. preserva a ocorrência e todos os eventos.

**Alternativa rejeitada:** `voided_at` (tombstone). Clientes antigos não filtram
`voided_at` e continuariam exibindo a dose como tomada. A projeção atual +
DELETE auditado mantém a semântica antiga (sem linha = sem registro) sem
esconder o passado.

**Consequência:** a unique existente `(user_id, medication_id, scheduled_at)`
permite reinserir depois de desfazer; o evento preserva a evidência.

### AD-02 — Revisões imutáveis com vigência [início, fim)

**Decisão:** `health_medication_schedules` guarda revisões. Cada revisão tem
`mode` (`interval` ou `daily_times`), `timezone` (snapshot IANA), `anchor_at`
(intervalo) ou `local_start_date`/`local_times` (horários locais),
`duration_kind` (`finite`/`continuous`), `duration_days`, `end_exclusive_at`,
`effective_from`, `effective_until` (nulo = atual) e snapshots de dose.

Revisões passadas nunca são editadas. Editar agenda fecha a revisão vigente em
`effective_from` e cria outra. Não há sobreposição: trigger sob
`pg_advisory_xact_lock(hash(medication_id))` + checagem de intervalo, além de
`FOR UPDATE` no medicamento nas RPCs.

Pausa fecha a revisão vigente em `paused_at` e marca o medicamento `paused`;
retomada cria nova revisão com a mesma âncora, `effective_from = resumed_at`.
Conclusão fecha em `finished_at` e cancela ocorrências/lembretes futuros.
O passado permanece no intervalo das revisões antigas.

### AD-03 — Identidade de ocorrência

**Decisão:** `health_medication_occurrences` tem
`unique(user_id, medication_id, scheduled_at)` e `unique(user_id, id)`,
FKs compostas `(user_id, medication_id)` e `(user_id, schedule_id,
medication_id)`. `canceled_at` + `cancellation_reason`
(`schedule_changed`, `paused`, `finished`) marcam inelegibilidade; não existe
status taken/skipped na ocorrência.

Ocorrências são **materializadas por janela limitada** quando há mutação ou
pelo scheduler. Leitura de lista/resumo/calendário/histórico usa projeção
aritmética das revisões (`health_private.schedule_slots`), portanto uma dose
vencida existe sem depender de abrir a tela.

Ao registrar uma dose, o servidor valida que `scheduled_at` é um slot da
revisão vigente naquele instante, garante a ocorrência por upsert
(`on conflict (user_id, medication_id, scheduled_at) do nothing`) e grava a dose.
Revisão que encontre ocorrência futura já registrada é rejeitada com
`SCHEDULE_HAS_RECORDED_OCCURRENCES`; registros nunca são reatribuídos.

### AD-04 — Tempo: instantes UTC, relógio local declarado

**Decisão:**

- `scheduled_at`, `taken_at`, `anchor_at`, `end_exclusive_at` são `timestamptz`.
- Intervalo: ocorrência `n = anchor_at + n * interval_minutes`, sem módulo de 24h.
  Duração finita de N dias = `anchor_at + N × 24h` (limite exclusivo).
- Horários locais: para cada data local de `local_start_date` a
  `local_start_date + N - 1`, resolve cada horário no fuso da revisão.
  Fim exclusivo = meia-noite local do dia `local_start_date + N`.
- Hora local inexistente (avanço DST): a ocorrência é **omitida**, nunca
  deslocada em silêncio. Hora ambígua (retrocesso): usa o **offset mais cedo**
  (primeira passagem), uma única ocorrência por slot.
- Âncora inexistente no cadastro: erro `INVALID_LOCAL_TIME` (não ajusta).
- `<= server_now` é vencida (igualdade conta como vencida).
- Fuso é detectado do dispositivo (`Intl.DateTimeFormat().resolvedOptions()`),
  validado contra `pg_timezone_names` e persistido como snapshot. Não há campo
  técnico no formulário nem preferência global obrigatória. Se a detecção
  falhar, o formulário pede confirmação/seleção; nunca grava UTC silencioso.
  Editar em outro fuso não reinterpreta a agenda.

Paridade JS/SQL: a resolução local→UTC é implementada em
`src/lib/treatmentEngine.js` e em `health_private.local_instant`, com os mesmos
casos de teste (America/New_York 2026-03-08 02:30 e 2026-11-01 01:30).

### AD-05 — Geração limitada e paginação

**Decisão:** máximo de **1.000 ocorrências por chamada** e **42 dias por
consulta de calendário**; páginas de 20. Lista, resumo e “próxima dose” usam
janelas curtas (hoje + até 8 dias, pois o intervalo máximo é 168h). Histórico usa
cursor `(scheduled_at desc, id desc)` e projeta somente a janela da página.
Scheduler materializa horizonte de 14 dias, em lote e de forma retomável. Nunca
gerar tratamento contínuo até “ano 9999”. O servidor devolve
`WINDOW_TOO_LARGE` em vez de truncar.

### AD-06 — Idempotência

**Decisão:** `health_private.commands(user_id, request_id)`, com operação, hash
do payload normalizado e resposta mínima. Mesmo `request_id` + mesmo hash
retorna a resposta; hash diferente → `IDEMPOTENCY_CONFLICT`. Retenção de 7 dias,
limpeza por job operacional (sem dados clínicos na chave/resposta). O cliente
gera `crypto.randomUUID()` por intenção de escrita e reutiliza no retry.

### AD-07 — Segurança e privilégios

**Decisão:**

- RLS de proprietário em todas as tabelas novas; `anon` sem acesso.
- `health_dose_events` e `health_medication_occurrences`: `authenticated` só
  lê; escrita apenas por RPC/trigger.
- RPCs mutadoras são `SECURITY DEFINER`, dono `health_scheduler`
  (`NOLOGIN NOINHERIT NOBYPASSRLS`), `search_path=''`, nomes qualificados,
  `auth.uid()` validado, `EXECUTE` revogado de PUBLIC/anon.
- Funções de leitura são `SECURITY INVOKER` e dependem de RLS.
- FKs compostas impedem referência entre donos e entre medicamentos distintos.
- Payload/erros nunca incluem nome de medicamento, dose, diagnóstico, nota,
  anexo ou URL assinada. Anexos usam o bucket privado existente.
- Testes com usuários A, B e anon no Postgres real (stack local Supabase).

### AD-08 — Lembretes e push

**Decisão:** um lembrete por ocorrência elegível, com um offset por tratamento
(`reminder_offset_minutes`, padrão 0). `remind_at = scheduled_at - offset`.
Reutiliza `push_subscriptions`, preferências globais dos Ajustes, worker e
`_shared/push.ts`. O worker revalida owner, ocorrência não cancelada, status do
tratamento e ausência de registro após o claim. Payload neutro
(“Você tem um lembrete de saúde”); deep link `/health/today`. Sem cron/push, a
agenda continua funcionando. Não se promete entrega exatamente uma vez.

### AD-09 — Compatibilidade, migração e rollback

**Decisão:** migração **aditiva** e idempotente:

1. Adiciona colunas nullable e tabelas novas; nada é removido.
2. Backfill converte `times/timezone/starts_on/ends_on` em revisão
   `daily_times`, preservando `ends_on` **inclusivo** como limite exclusivo no
   dia seguinte local. Fuso inválido é preservado e marcado como pendência
   (`schedule_pending = true`), sem bloquear leitura.
3. Doses antigas que casam com slot da revisão ganham `occurrence_id`; as demais
   permanecem avulsas. Não se inventam faltas retroativas.
4. Ponte de compatibilidade: trigger em `health_medications` traduz alterações
   de `times/starts_on/ends_on/timezone` feitas por clientes antigos em revisão
   futura; trigger em `health_doses` audita insert/update/delete legados. As
   RPCs novas sinalizam `health.schedule_api=1` para não duplicar.
5. Rollback inicial: desativar a UI nova e o scheduler novo mantendo tabelas e
   dados. O scheduler antigo não entende intervalo, portanto o fallback seguro
   mantém o adaptador novo ou pausa envios com aviso operacional — nunca converte
   5h em horários diários. Restauração de backup é último recurso.

Campos legados permanecem durante a release; a remoção exige versão mínima
declarada e nova migração.

## 3. Contrato de dados (v1)

### `health_medications` (colunas novas, todas nullable)

`presentation_code`, `dose_quantity numeric(12,3)`, `dose_unit_code`,
`professional_name`, `indication`, `pharmacy`, `batch`, `finished_at`,
`finish_reason`, `row_version bigint not null default 0`,
`reminder_offset_minutes integer not null default 0`,
`schedule_pending boolean not null default false`.

`dose` textual permanece obrigatório para compatibilidade; novos clientes
preenchem quantidade/unidade e mantêm `dose` como texto derivado legível
(“1 comprimido”) para clientes antigos e notificações neutras.

### `health_medication_schedules`

`id`, `user_id`, `medication_id`, `revision`, `mode`, `timezone`, `anchor_at`,
`interval_minutes`, `local_start_date`, `local_times`, `duration_kind`,
`duration_days`, `end_exclusive_at`, `effective_from`, `effective_until`,
`dose_text_snapshot`, `quantity_snapshot`, `unit_snapshot`,
`created_at`, `created_by_request_id`.

### `health_medication_occurrences`

`id`, `user_id`, `medication_id`, `schedule_id`, `scheduled_at`,
`canceled_at`, `cancellation_reason`, `created_at`.
Únicos: `(user_id, medication_id, scheduled_at)`, `(user_id, id)`.

### `health_doses` (colunas novas)

`occurrence_id uuid`, `row_version bigint not null default 0`,
`reason text not null default ''`, `updated_at timestamptz`.
Único parcial `(user_id, occurrence_id) where occurrence_id is not null`.

### `health_dose_events`

`id`, `user_id`, `occurrence_id`, `medication_id`, `action`
(`taken`, `skipped`, `updated`, `undone`), `status`, `scheduled_at`,
`taken_at`, `amount`, `reason`, `actor_user_id`, `request_id`, `created_at`.
Somente SELECT para `authenticated`.

### RPCs públicas

| RPC | Tipo | Retorno |
| --- | --- | --- |
| `health_treatment_save(p_payload jsonb, p_request_id uuid)` | definer | `{id,row_version,revision,impact}` |
| `health_treatment_state(p_medication_id, p_action, p_effective_at, p_expected_version, p_reason, p_request_id)` | definer | `{id,status,row_version,canceled_occurrences}` |
| `health_dose_record(p_medication_id, p_scheduled_at, p_status, p_taken_at, p_amount, p_reason, p_expected_version, p_request_id)` | definer | `{dose_id,status,row_version,server_now}` |
| `health_dose_undo(p_medication_id, p_scheduled_at, p_expected_version, p_request_id)` | definer | `{undone:true,server_now}` |
| `health_treatment_list(p_group, p_prefix, p_limit, p_offset)` | invoker | cards + `has_more` |
| `health_treatment_dashboard(p_timezone)` | invoker | hoje/vencidas/próxima |
| `health_treatment_detail(p_medication_id)` | invoker | cadastro + revisão + resumo |
| `health_treatment_calendar(p_medication_id, p_from, p_to)` | invoker | dias + slots |
| `health_treatment_history(p_medication_id, p_filter, p_cursor_at, p_cursor_id, p_limit)` | invoker | ocorrências + registro |

Erros de domínio (SQLSTATE `P0001` com código estável em `message`):
`AUTH_REQUIRED`, `NOT_FOUND_OR_FORBIDDEN`, `INVALID_SCHEDULE`,
`INVALID_TIMEZONE`, `INVALID_LOCAL_TIME`, `INVALID_DURATION`,
`INVALID_INTERVAL`, `FUTURE_TAKEN_AT`, `FUTURE_OCCURRENCE`, `VERSION_CONFLICT`,
`IDEMPOTENCY_CONFLICT`, `WINDOW_TOO_LARGE`, `SCHEDULE_HAS_RECORDED_OCCURRENCES`,
`OCCURRENCE_NOT_SCHEDULED`, `RESUME_EXPIRED`. O cliente traduz por código.

## 4. Limites de produto

- Intervalo: 60 a 10.080 minutos (1h a 168h), inteiro, múltiplo de 1 minuto.
- Horários locais: 1 a 24 horários distintos; `local_start_date` obrigatória.
- Duração finita: 1 a 365 dias; contínuo sem fim fictício.
- Calendário: até 42 dias por chamada; página de histórico/lista: 20.
- Ocorrências por chamada: até 1.000.

## 5. Testes que comprovam as decisões

- F01/F02/T01–T22: engine pura, incluindo 5h/2 dias, 36h/7 dias, 48h/1 dia,
  fim exclusivo, 29/02, DST NY (inexistente/ambíguo), janela antiga em contínuo.
- M01–M15: registro atrasado, skipped, desfazer auditado, retry idempotente,
  conflito de versão, corrida com conclusão/revisão, cache por usuário.
- S01–S14: RLS/FKs/grants/RPCs, storage, backfill idempotente, planos.
- N01–N10: offsets, backlog, claim concorrente, rechecagem, payload neutro.
- Browser: criação F01, contínuo, dose atrasada + desfazer, não tomada,
  revisão, conclusão, calendário/histórico, troca de usuário, sem push,
  erro/vazio, larguras 320/390/768/1024/1440, pt/en/es, temas.

## 6. Riscos e mitigações

| Risco | Mitigação |
| --- | --- |
| Divergência JS/SQL em DST | testes de paridade com os mesmos fixtures; política explícita (omitir inexistente, offset mais cedo no ambíguo). |
| Sobreposição de revisões concorrente | advisory lock por medicamento + `FOR UPDATE` + constraint de exclusão lógica validada. |
| Leitura ampla em contínuo antigo | aritmética de índice direto na janela; orçamento de 1.000/42 dias. |
| Cliente antigo lendo desfazer | sem tombstone; DELETE auditado. |
| Cliente antigo editando `times` | trigger de compatibilidade cria revisão; RPC sinaliza para não duplicar. |
| Push duplicado | claim com lease, unique por ocorrência, tag estável; sem promessa de exatamente uma entrega. |
| Android divergente | schema único no repositório web; contrato documentado; nenhuma tabela paralela. |
