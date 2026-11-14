import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  treatmentKeys,
  useTreatmentList,
  useTreatmentDashboard,
  useTreatmentDetail,
  useTreatmentCalendar,
  useTreatmentHistory,
  useSaveTreatment,
  useTreatmentState,
  useRecordDose,
  useUndoDose,
  useTreatmentRefresh,
} from './useTreatments';
import * as treatmentsModule from '../lib/treatments';

vi.mock('../lib/treatments', () => ({
  saveTreatment: vi.fn(),
  treatmentState: vi.fn(),
  recordDose: vi.fn(),
  undoDose: vi.fn(),
  listTreatments: vi.fn(),
  treatmentDashboard: vi.fn(),
  treatmentDetail: vi.fn(),
  treatmentCalendar: vi.fn(),
  treatmentHistory: vi.fn(),
  refreshReminders: vi.fn(),
  TREATMENT_PAGE_SIZE: 20,
}));

const OWNER = '11111111-1111-4111-4111-111111111111';

function wrapperFactory(client) {
  return ({ children }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('treatmentKeys', () => {
  it('includes the user in every key', () => {
    expect(treatmentKeys.all(OWNER)).toEqual(['treatments', OWNER]);
    expect(treatmentKeys.list(OWNER, { group: 'active' })).toEqual([
      'treatments',
      OWNER,
      'list',
      { group: 'active' },
    ]);
    expect(treatmentKeys.detail(OWNER, 'm1')).toEqual([
      'treatments',
      OWNER,
      'detail',
      'm1',
    ]);
    expect(treatmentKeys.dashboard(OWNER, 'UTC')).toEqual([
      'treatments',
      OWNER,
      'dashboard',
      'UTC',
    ]);
    expect(treatmentKeys.history(OWNER, 'm1', { filter: 'taken' })).toEqual([
      'treatments',
      OWNER,
      'history',
      'm1',
      { filter: 'taken' },
    ]);
  });
});

describe('read hooks', () => {
  const setup = (hook, args) => {
    const client = new QueryClient();
    const { result } = renderHook(() => hook(...args), {
      wrapper: wrapperFactory(client),
    });
    return { client, result };
  };

  it('useTreatmentList queries and disables without user', async () => {
    treatmentsModule.listTreatments.mockResolvedValue({
      data: { rows: [], has_more: false },
      error: null,
    });
    const { client, result } = setup(useTreatmentList, [OWNER, { group: 'active' }]);
    expect(result.current.isLoading).toBe(true);
    await act(async () => {
      await client.flushSync?.() || Promise.resolve();
    });
    expect(treatmentsModule.listTreatments).toHaveBeenCalledWith(OWNER, {
      group: 'active',
    });
    const { result: disabled } = setup(useTreatmentList, [null, {}]);
    expect(disabled.current.isLoading).toBe(false);
  });

  it('useTreatmentDashboard queries', async () => {
    treatmentsModule.treatmentDashboard.mockResolvedValue({
      data: { timezone: 'UTC' },
      error: null,
    });
    const { result } = setup(useTreatmentDashboard, [OWNER, 'UTC']);
    expect(result.current.isLoading).toBe(true);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(treatmentsModule.treatmentDashboard).toHaveBeenCalledWith(OWNER, 'UTC');
  });

  it('useTreatmentDetail queries', async () => {
    treatmentsModule.treatmentDetail.mockResolvedValue({
      data: { medication: { id: 'm1' } },
      error: null,
    });
    const { result } = setup(useTreatmentDetail, [OWNER, 'm1']);
    expect(result.current.isLoading).toBe(true);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(treatmentsModule.treatmentDetail).toHaveBeenCalledWith(OWNER, 'm1');
  });

  it('useTreatmentCalendar queries', async () => {
    treatmentsModule.treatmentCalendar.mockResolvedValue({
      data: { days: [] },
      error: null,
    });
    const { result } = setup(useTreatmentCalendar, [
      OWNER,
      'm1',
      '2027-03-15',
      '2027-03-21',
    ]);
    expect(result.current.isLoading).toBe(true);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const cal = treatmentsModule.treatmentCalendar.mock.calls[0];
    expect(cal[0]).toBe(OWNER);
    expect(cal[1]).toBe('m1');
    expect(cal[2]).toBe('2027-03-15');
    expect(cal[3]).toBe('2027-03-21');
  });

  it('useTreatmentHistory queries', async () => {
    treatmentsModule.treatmentHistory.mockResolvedValue({
      data: { rows: [] },
      error: null,
    });
    const { result } = setup(useTreatmentHistory, [OWNER, 'm1', { filter: 'taken' }]);
    expect(result.current.isLoading).toBe(true);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(treatmentsModule.treatmentHistory).toHaveBeenCalledWith(OWNER, 'm1', {
      filter: 'taken',
    });
  });
});

describe('mutations invalidate on success', () => {
  it('useSaveTreatment cancels and invalidates', async () => {
    treatmentsModule.saveTreatment.mockResolvedValue({
      data: { id: 'med-1' },
      error: null,
    });
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const cancel = vi.spyOn(client, 'cancelQueries');
    const { result } = renderHook(() => useSaveTreatment(OWNER), {
      wrapper: wrapperFactory(client),
    });
    await act(async () => {
      await result.current.mutateAsync({ name: 'X', dose: '1' });
    });
    expect(cancel).toHaveBeenCalledWith({ queryKey: ['treatments', OWNER] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['health', OWNER] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['treatments', OWNER] });
  });

  it('useTreatmentState invalidates on success', async () => {
    treatmentsModule.treatmentState.mockResolvedValue({
      data: { status: 'paused' },
      error: null,
    });
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useTreatmentState(OWNER), {
      wrapper: wrapperFactory(client),
    });
    await act(async () => {
      await result.current.mutateAsync({
        medicationId: 'm1',
        action: 'pause',
        options: { reason: '', effectiveAt: '2027-03-15T10:00:00Z' },
      });
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['health', OWNER] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['treatments', OWNER] });
  });

  it('useRecordDose invalidates on success', async () => {
    treatmentsModule.recordDose.mockResolvedValue({
      data: { status: 'taken' },
      error: null,
    });
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useRecordDose(OWNER), {
      wrapper: wrapperFactory(client),
    });
    await act(async () => {
      await result.current.mutateAsync({
        medicationId: 'm1',
        scheduledAt: '2027-03-15T10:00:00Z',
        status: 'taken',
        options: {},
      });
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['health', OWNER] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['treatments', OWNER] });
  });

  it('useUndoDose invalidates on success', async () => {
    treatmentsModule.undoDose.mockResolvedValue({
      data: { undone: true },
      error: null,
    });
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useUndoDose(OWNER), {
      wrapper: wrapperFactory(client),
    });
    await act(async () => {
      await result.current.mutateAsync({
        medicationId: 'm1',
        scheduledAt: '2027-03-15T10:00:00Z',
        expectedVersion: 1,
      });
    });
    expect(treatmentsModule.undoDose).toHaveBeenCalledWith(OWNER, 'm1', '2027-03-15T10:00:00Z', 1, expect.any(String));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['health', OWNER] });
  });

  it('useTreatmentRefresh invalidates on success', async () => {
    treatmentsModule.refreshReminders.mockResolvedValue({ error: null });
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useTreatmentRefresh(OWNER), {
      wrapper: wrapperFactory(client),
    });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(treatmentsModule.refreshReminders).toHaveBeenCalledWith(OWNER);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['health', OWNER] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['treatments', OWNER] });
  });
});

it('reuses one request ID after a lost response and does not treat a domain error as success', async () => {
  treatmentsModule.saveTreatment.mockRejectedValueOnce(new Error('Failed to fetch')).mockResolvedValueOnce({data:{id:'same-med'},error:null});
  const client=new QueryClient();
  const {result}=renderHook(()=>useSaveTreatment(OWNER),{wrapper:wrapperFactory(client)});
  await act(async()=>{await expect(result.current.mutateAsync({name:'Synthetic'})).resolves.toEqual({id:'same-med'});});
  expect(treatmentsModule.saveTreatment.mock.calls[0][2]).toBe(treatmentsModule.saveTreatment.mock.calls[1][2]);
  treatmentsModule.saveTreatment.mockResolvedValue({error:'version_conflict'});
  await act(async()=>{await expect(result.current.mutateAsync({name:'Synthetic'})).rejects.toThrow('version_conflict');});
});
