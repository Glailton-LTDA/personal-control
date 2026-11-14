import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock('./supabase', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  return {
    supabase: createClient('https://health.test', 'test-key', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fetchMock },
    }),
  };
});
import {
  saveTreatment,
  treatmentState,
  recordDose,
  undoDose,
  listTreatments,
  treatmentDashboard,
  treatmentDetail,
  treatmentCalendar,
  treatmentHistory,
  refreshReminders,
} from './treatments';

const OWNER = '11111111-1111-4111-4111-111111111111';
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const rpcError = (message, status = 400) =>
  new Response(JSON.stringify({ message, code: 'P0001', details: null, hint: null }), {
    status,
    headers: { 'content-type': 'application/json' },
  });

beforeEach(() => {
  fetchMock.mockReset();
});

function lastRpc() {
  const call = fetchMock.mock.calls.at(-1);
  const url = new URL(call[0]);
  const body = JSON.parse(call[1].body);
  return { url, body };
}

describe('treatments service', () => {
  it('saveTreatment sends the payload and a fresh request id', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 'med-1', row_version: 1 }));
    const { data } = await saveTreatment(OWNER, { name: 'X', dose: '1' });
    expect(data.id).toBe('med-1');
    const { url, body } = lastRpc();
    expect(url.pathname).toBe('/rest/v1/rpc/health_treatment_save');
    expect(body.p_payload.name).toBe('X');
    expect(body.p_request_id).toBeDefined();
    expect(typeof body.p_request_id).toBe('string');
  });

  it('saveTreatment maps P0001 errors to UI keys', async () => {
    fetchMock.mockResolvedValueOnce(rpcError('VERSION_CONFLICT'));
    const { error, data } = await saveTreatment(OWNER, { name: 'X', dose: '1' });
    expect(error).toBe('version_conflict');
    expect(data).toBeNull();
  });

  it('saveTreatment maps unknown errors to generic key', async () => {
    fetchMock.mockResolvedValueOnce(rpcError('WEIRD_ERROR'));
    const { error } = await saveTreatment(OWNER, { name: 'X', dose: '1' });
    expect(error).toBe('error');
  });

  it('treatmentState pause sends action and effective_at', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ id: 'med-1', status: 'paused', row_version: 2 }),
    );
    const { data } = await treatmentState(OWNER, 'med-1', 'pause', {
      effectiveAt: '2027-03-15T10:00:00Z',
      expectedVersion: 1,
      reason: 'viajem',
    });
    expect(data.status).toBe('paused');
    const { url, body } = lastRpc();
    expect(url.pathname).toBe('/rest/v1/rpc/health_treatment_state');
    expect(body.p_action).toBe('pause');
    expect(body.p_effective_at).toBe('2027-03-15T10:00:00.000Z');
    expect(body.p_expected_version).toBe(1);
    expect(body.p_reason).toBe('viajem');
  });

  it('treatmentState resume maps RESUME_EXPIRED', async () => {
    fetchMock.mockResolvedValueOnce(rpcError('RESUME_EXPIRED'));
    const { error } = await treatmentState(OWNER, 'med-1', 'resume');
    expect(error).toBe('resume_expired');
  });

  it('treatmentState finish maps SCHEDULE_HAS_RECORDED_OCCURRENCES', async () => {
    fetchMock.mockResolvedValueOnce(
      rpcError('SCHEDULE_HAS_RECORDED_OCCURRENCES'),
    );
    const { error } = await treatmentState(OWNER, 'med-1', 'finish');
    expect(error).toBe('schedule_has_recorded_occurrences');
  });

  it('recordDose sends taken status with taken_at', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ dose_id: 'd-1', occurrence_id: 'o-1', status: 'taken', row_version: 1 }),
    );
    const { data } = await recordDose(OWNER, 'med-1', '2027-03-15T10:00:00Z', 'taken', {
      takenAt: '2027-03-15T10:05:00Z',
      amount: '1',
      expectedVersion: 0,
    });
    expect(data.status).toBe('taken');
    const { url, body } = lastRpc();
    expect(url.pathname).toBe('/rest/v1/rpc/health_dose_record');
    expect(body.p_status).toBe('taken');
    expect(body.p_taken_at).toBe('2027-03-15T10:05:00.000Z');
    expect(body.p_amount).toBe('1');
  });

  it('recordDose maps FUTURE_TAKEN_AT and OCCURRENCE_NOT_SCHEDULED', async () => {
    fetchMock.mockResolvedValueOnce(rpcError('FUTURE_TAKEN_AT'));
    let { error } = await recordDose(
      OWNER,
      'med-1',
      '2027-03-15T10:00:00Z',
      'taken',
      { takenAt: '2099-01-01T10:00:00Z' },
    );
    expect(error).toBe('future_taken_at');

    fetchMock.mockResolvedValueOnce(rpcError('OCCURRENCE_NOT_SCHEDULED'));
    ({ error } = await recordDose(
      OWNER,
      'med-1',
      '2027-03-15T10:00:00Z',
      'taken',
      { takenAt: '2027-03-15T10:00:00Z' },
    ));
    expect(error).toBe('occurrence_not_scheduled');
  });

  it('undoDose sends expected version and maps VERSION_CONFLICT', async () => {
    fetchMock.mockResolvedValueOnce(json({ undone: true, occurrence_id: 'o-1' }));
    const { data } = await undoDose(OWNER, 'med-1', '2027-03-15T10:00:00Z', 1);
    expect(data.undone).toBe(true);
    const { body } = lastRpc();
    expect(body.p_expected_version).toBe(1);

    fetchMock.mockResolvedValueOnce(rpcError('VERSION_CONFLICT'));
    const { error } = await undoDose(OWNER, 'med-1', '2027-03-15T10:00:00Z', 9);
    expect(error).toBe('version_conflict');
  });

  it('listTreatments paginates and groups', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ rows: [{ id: 'm1', name: 'A', status: 'active' }], has_more: false }),
    );
    const { data } = await listTreatments(OWNER, {
      group: 'active',
      prefix: 'a',
      limit: 10,
      offset: 0,
    });
    expect(data.rows[0].name).toBe('A');
    const { url, body } = lastRpc();
    expect(url.pathname).toBe('/rest/v1/rpc/health_treatment_list');
    expect(body.p_group).toBe('active');
    expect(body.p_prefix).toBe('a');
    expect(body.p_limit).toBe(10);
    expect(body.p_offset).toBe(0);
  });

  it('treatmentDashboard validates timezone', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ timezone: 'UTC', today: { planned: 2, taken: 1 } }),
    );
    const { data } = await treatmentDashboard(OWNER, 'America/Sao_Paulo');
    expect(data.timezone).toBe('UTC');

    fetchMock.mockResolvedValueOnce(rpcError('INVALID_TIMEZONE'));
    const { error } = await treatmentDashboard(OWNER, 'Bad/Zone');
    expect(error).toBe('invalid_timezone');
  });

  it('treatmentDetail returns not found when forbidden', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ medication: { id: 'm1', name: 'A', status: 'active', dose: '1' } }),
    );
    const { data } = await treatmentDetail(OWNER, 'm1');
    expect(data.medication.name).toBe('A');

    fetchMock.mockResolvedValueOnce(rpcError('NOT_FOUND_OR_FORBIDDEN'));
    const { error } = await treatmentDetail(OWNER, 'missing');
    expect(error).toBe('not_found_or_forbidden');
  });

  it('treatmentCalendar bounds window to 42 days', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        timezone: 'UTC',
        from: '2027-03-15',
        to: '2027-03-21',
        slots: 0,
        days: [],
      }),
    );
    const { data } = await treatmentCalendar(
      OWNER,
      'm1',
      '2027-03-15',
      '2027-03-21',
    );
    expect(data.slots).toBe(0);
    const { body } = lastRpc();
    expect(body.p_from).toBe('2027-03-15');
    expect(body.p_to).toBe('2027-03-21');

    fetchMock.mockResolvedValueOnce(rpcError('WINDOW_TOO_LARGE'));
    const { error } = await treatmentCalendar(
      OWNER,
      'm1',
      '2027-03-15',
      '2027-06-01',
    );
    expect(error).toBe('window_too_large');
  });

  it('treatmentHistory paginates with cursor and returns events', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        rows: [{ scheduled_at: '2027-03-15T10:00:00Z', status: 'taken' }],
        has_more: false,
        events: [],
      }),
    );
    const { data } = await treatmentHistory(OWNER, 'm1', { filter: 'taken', limit: 5 });
    expect(data.rows[0].status).toBe('taken');
    const { url, body } = lastRpc();
    expect(url.pathname).toBe('/rest/v1/rpc/health_treatment_history');
    expect(body.p_filter).toBe('taken');
    expect(body.p_limit).toBe(5);
  });

  it('refreshReminders calls the owner-scoped RPC', async () => {
    fetchMock.mockResolvedValueOnce(json(null));
    const { error } = await refreshReminders(OWNER);
    expect(error).toBeNull();
    const { url } = lastRpc();
    expect(url.pathname).toBe('/rest/v1/rpc/health_refresh_reminders');
  });

  it('rejects calls without a user id', async () => {
    await expect(saveTreatment(null, { name: 'X', dose: '1' })).rejects.toThrow(
      'auth_required',
    );
    await expect(treatmentDetail(null, 'm1')).rejects.toThrow('auth_required');
  });
});
