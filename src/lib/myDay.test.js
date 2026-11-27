import { beforeEach, it, expect, vi } from 'vitest';
import {
  loadMyDay,
  requireMyDaySession,
  dayISO,
  splitMyDay,
  itemRoute,
  myDayItems,
} from './myDay';
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  rpc: vi.fn(),
  abort: vi.fn(),
}));
vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: mocks.session }, rpc: mocks.rpc },
}));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({
    data: { session: { access_token: 'synthetic', user: { id: 'owner' } } },
  });
  mocks.abort.mockResolvedValue({ data: { sections: {} }, error: null });
  mocks.rpc.mockReturnValue({ abortSignal: mocks.abort });
});
it.each([null, 'foreign'])(
  'does not make a data request without a matching session (%s)',
  async (id) => {
    await expect(loadMyDay(id, 'UTC', ['health'])).rejects.toThrow(
      'AUTH_REQUIRED'
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  }
);
it.each([
  { data: { session: null } },
  { error: new Error('expired') },
  { data: { session: { user: { id: 'owner' } } } },
])('blocks missing or failed local sessions', async (value) => {
  mocks.session.mockResolvedValue(value);
  await expect(loadMyDay('owner', 'UTC', ['health'])).rejects.toThrow(
    'AUTH_REQUIRED'
  );
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('cancels before a request and after session validation', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(requireMyDaySession('owner', controller.signal)).rejects.toThrow(
    'AUTH_REQUIRED'
  );
  expect(mocks.session).not.toHaveBeenCalled();
  const late = new AbortController();
  mocks.session.mockImplementation(async () => {
    late.abort();
    return {
      data: { session: { access_token: 'synthetic', user: { id: 'owner' } } },
    };
  });
  await expect(
    loadMyDay('owner', 'UTC', ['health'], late.signal)
  ).rejects.toThrow('AUTH_REQUIRED');
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('uses one bounded RPC and propagates its abort signal', async () => {
  const signal = new AbortController().signal;
  await expect(
    loadMyDay('owner', 'America/Fortaleza', ['health'], signal)
  ).resolves.toEqual({ sections: {} });
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('my_day_summary', {
    p_timezone: 'America/Fortaleza',
    p_modules: ['health'],
  });
  expect(mocks.abort).toHaveBeenCalledWith(signal);
});
it('rejects invalid modules and hides raw backend errors', async () => {
  await expect(loadMyDay('owner', 'UTC', [])).rejects.toThrow(
    'INVALID_MODULES'
  );
  await expect(loadMyDay('owner', 'UTC', ['wrong'])).rejects.toThrow(
    'INVALID_MODULES'
  );
  expect(mocks.rpc).not.toHaveBeenCalled();
  mocks.abort.mockResolvedValue({ error: { message: 'private details' } });
  await expect(loadMyDay('owner', 'UTC', ['health'])).rejects.toThrow(
    'MY_DAY_UNAVAILABLE'
  );
});
it('groups by device calendar day, orders across modules and uses stable keys', () => {
  const summary = {
    day: '2026-11-27',
    sections: {
      doses: { rows: [{ id: 'same', scheduled_at: '2026-11-27T09:00:00Z' }] },
      appointments: {
        rows: [{ id: 'same', scheduled_at: '2026-11-28T01:00:00Z' }],
      },
      payments: { rows: [{ id: 'p', day: '2026-11-26' }] },
      itinerary: {
        rows: [
          { id: 'i', day: '2026-11-27', time: '08:00' },
          { id: 'j', day: '2026-11-27', time: '08:00' },
        ],
      },
      trips: { rows: [{ id: 't', day: '2026-11-29' }] },
    },
  };
  const groups = splitMyDay(summary, 'America/Fortaleza');
  expect(groups.today.map((i) => i.key)).toEqual([
    'doses:same',
    'itinerary:i',
    'itinerary:j',
    'appointments:same',
  ]);
  expect(groups.attention[0].id).toBe('p');
  expect(groups.upcoming[0].id).toBe('t');
  expect(myDayItems(null)).toEqual([]);
  expect(splitMyDay(null, 'UTC')).toEqual({
    today: [],
    attention: [],
    upcoming: [],
  });
  expect(dayISO(new Date(2026, 0, 2))).toBe('2026-01-02');
});
it.each([
  ['doses', 'health/medications/m'],
  ['appointments', 'health/appointments/x'],
  ['exams', 'health/exams/x'],
  ['payments', 'minhasfinancas/accounts/a'],
  ['invoices', 'minhasfinancas/cards/a'],
  ['itinerary', 'trips/itinerary/t'],
  ['trips', 'trips/itinerary/t'],
])('opens %s in its existing module', (kind, route) =>
  expect(
    itemRoute({
      kind,
      id: 'x',
      medication_id: 'm',
      account_id: 'a',
      trip_id: 't',
    })
  ).toBe(route)
);
