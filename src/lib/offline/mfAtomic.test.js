import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { db } from './db';
import { setOfflineIdentity } from './owner';
import { applyMfAtomicResult, executeMfAtomicOperation, prepareCardPaymentOperation, MF_ATOMIC_QUEUE } from './mfAtomic';
import { SyncEngine, MfSyncProvider } from './SyncEngine';
import { supabase } from '../supabase';

vi.mock('../supabase', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));
const online = (value) => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
const income = () => ({ p_operation_id: 'op', p_tx: { id: 'op', user_id: 'u1', type: 'RECEITA', amount: 100 },
  p_goal_contribution: { id: 'op', user_id: 'u1', goal_id: 'g1', kind: 'DEPOSIT', amount: 100 } });
const payment = () => prepareCardPaymentOperation({
  operationId: 'pay', card: { id: 'card', linked_account_id: 'bank' }, invoice: { closeISO: '2026-10-10' },
  payload: { user_id: 'u1', account_id: 'bank', amount: 100, status: 'PAGO' },
  extraRows: [{ user_id: 'u1', account_id: 'card', amount: -100 }],
});
beforeEach(async () => {
  vi.clearAllMocks(); online(true); setOfflineIdentity('u1');
  await Promise.all([db.mf_transactions.clear(), db.mf_goal_contributions.clear(), db.sync_queue.clear()]);
  supabase.rpc.mockResolvedValue({ data: {}, error: null });
});
afterEach(() => online(true));

describe('atomic financial outbox and cache', () => {
  it('rolls back the local income AND outbox if contribution storage fails', async () => {
    online(false);
    const fail = () => { throw new Error('storage failed'); };
    db.mf_goal_contributions.hook('creating', fail);
    try {
      await expect(executeMfAtomicOperation('mf_save_tx_with_goal', income())).rejects.toThrow('storage failed');
      expect(await db.mf_transactions.count()).toBe(0);
      expect(await db.sync_queue.count()).toBe(0);
    } finally { db.mf_goal_contributions.hook('creating').unsubscribe(fail); }
  });
  it('queues one immutable RPC, retries it after reconnect and retains failures', async () => {
    online(false);
    await executeMfAtomicOperation('mf_save_tx_with_goal', income());
    await executeMfAtomicOperation('mf_save_tx_with_goal', income());
    expect(await db.sync_queue.count()).toBe(1);
    expect(await db.mf_goal_contributions.get('op')).toMatchObject({ transaction_id: 'op' });
    online(true);
    const engine = new SyncEngine('u1', { providers: [] });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      supabase.rpc.mockResolvedValueOnce({ data: null, error: new Error('lost response') });
      expect(await engine.drainQueue()).toBe(0);
      expect((await db.sync_queue.toArray())[0].attempts).toBe(1);
      expect(await engine.drainQueue()).toBe(1);
      expect(supabase.rpc.mock.calls[0]).toEqual(supabase.rpc.mock.calls[1]);
      expect(supabase.rpc).toHaveBeenCalledWith('mf_save_tx_with_goal', income());
      expect(supabase.from).not.toHaveBeenCalled();
    } finally { engine.destroy(); vi.restoreAllMocks(); }
  });
  it('updates and deletes a goal contribution in the same local transaction', async () => {
    online(false);
    await db.mf_goal_contributions.put({ id: 'old', user_id: 'u1', transaction_id: 'op', amount: 50 });
    await executeMfAtomicOperation('mf_save_tx_with_goal', income());
    expect(await db.mf_goal_contributions.count()).toBe(1);
    expect(await db.mf_goal_contributions.get('old')).toMatchObject({ amount: 100 });
    await db.sync_queue.clear();
    await executeMfAtomicOperation('mf_save_tx_with_goal', { ...income(), p_goal_contribution: null, p_delete_contribution: true });
    expect(await db.mf_goal_contributions.count()).toBe(0);
  });
  it('projects invoice payments and removes duplicate mirrors offline', async () => {
    online(false);
    const pending = { user_id: 'u1', account_id: 'bank', type: 'DESPESA', invoice_close: '2026-10-10', status: 'PENDENTE', notes: 'Agendado automaticamente (fatura)' };
    await db.mf_transactions.bulkPut([{ ...pending, id: 'latest', payment_date: '2026-10-20' }, { ...pending, id: 'older', payment_date: '2026-10-19' }]);
    const args = payment();
    await executeMfAtomicOperation('mf_pay_card_invoice', args);
    expect(await db.mf_transactions.get('latest')).toMatchObject({ status: 'PAGO', amount: 100 });
    expect(await db.mf_transactions.get('older')).toBeUndefined();
    expect((await db.sync_queue.toArray())[0]).toMatchObject({ table_name: MF_ATOMIC_QUEUE, action: 'rpc' });
    await db.sync_queue.clear();
    await db.mf_transactions.put({ ...pending, id: 'another' });
    await executeMfAtomicOperation('mf_pay_card_invoice', { ...args, p_operation_id: 'pay2', p_payment: null, p_replace_all: true });
    expect(await db.mf_transactions.get('another')).toBeUndefined();
  });
  it('applies authoritative server rows and tombstones together, preserving other owners', async () => {
    await db.mf_transactions.bulkPut([{ id: 'old', user_id: 'u1' }, { id: 'foreign', user_id: 'u2' }]);
    await db.mf_goal_contributions.put({ id: 'shadow', user_id: 'u1', transaction_id: 'op' });
    const data = { tables: {
      mf_transactions: { rows: [{ id: 'new', user_id: 'u1', amount: 100 }], deleted_ids: ['old', 'foreign'] },
      mf_goal_contributions: { rows: [{ id: 'contribution', user_id: 'u1', transaction_id: 'op' }] },
    } };
    supabase.rpc.mockResolvedValueOnce({ data, error: null });
    await executeMfAtomicOperation('mf_save_tx_with_goal', income());
    expect(await db.mf_transactions.get('old')).toBeUndefined();
    expect(await db.mf_transactions.get('foreign')).toBeDefined();
    expect(await db.mf_transactions.get('new')).toMatchObject({ amount: 100 });
    expect(await db.mf_goal_contributions.get('contribution')).toBeDefined();
    expect(await db.mf_goal_contributions.get('shadow')).toBeUndefined();
  });
  it('rejects foreign cache writes atomically and ignores results after logout', async () => {
    await db.mf_transactions.put({ id: 'foreign', user_id: 'u2' });
    const delta = { tables: { mf_transactions: { rows: [{ id: 'new', user_id: 'u1' }, { id: 'foreign', user_id: 'u1' }] } } };
    await expect(applyMfAtomicResult(delta, 'u1')).rejects.toThrow('offline_owner_mismatch');
    expect(await db.mf_transactions.get('new')).toBeUndefined();
    await expect(applyMfAtomicResult({ tables: { mf_transactions: { rows: [{ id: 'x', user_id: 'u2' }] } } }, 'u1')).rejects.toThrow('offline_owner_mismatch');
    setOfflineIdentity(null);
    await applyMfAtomicResult(delta, 'u1');
    expect(await db.mf_transactions.count()).toBe(1);
  });
  it('does not fail a committed write when the cache is unavailable', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: { tables: { mf_transactions: { rows: [{ id: 'x', user_id: 'u2' }] } } }, error: null });
    await expect(executeMfAtomicOperation('mf_save_tx_with_goal', income())).resolves.toBeDefined();
  });
  it('rejects unsupported RPCs, missing operation IDs and foreign local data', async () => {
    await expect(executeMfAtomicOperation('other', {})).rejects.toThrow('mf_atomic_rpc_invalid');
    online(false);
    await expect(executeMfAtomicOperation('mf_save_tx_with_goal', {})).rejects.toThrow('mf_atomic_operation_required');
    await expect(executeMfAtomicOperation('mf_save_tx_with_goal', { ...income(), p_tx: { user_id: 'u2' } })).rejects.toThrow('offline_owner_mismatch');
    await db.mf_transactions.put({ id: 'op', user_id: 'u2' });
    await expect(executeMfAtomicOperation('mf_save_tx_with_goal', income())).rejects.toThrow('offline_owner_mismatch');
  });
  it('does not replace cache while a financial RPC is pending in the outbox', async () => {
    await db.mf_transactions.put({ id: 'op', user_id: 'u1' });
    await db.sync_queue.add({ owner_id: 'u1', table_name: MF_ATOMIC_QUEUE, action: 'rpc' });
    const chain = { select: () => chain, eq: () => chain, order: () => chain, then: (resolve) => resolve({ data: [], error: null }) };
    supabase.from.mockReturnValue(chain);
    await new MfSyncProvider('u1').pull();
    expect(await db.mf_transactions.get('op')).toBeDefined();
  });
});
