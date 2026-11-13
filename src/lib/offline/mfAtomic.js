import { supabase } from '../supabase';
import { db, generateUUID } from './db';
import { isOffline } from './mfOffline';
import { offlineIdentity, requireOfflineIdentity, queueOwner } from './owner';

const TABLES = ['mf_transactions', 'mf_goal_contributions', 'mf_invoices'];
const RPCS = ['mf_save_tx_with_goal', 'mf_pay_card_invoice'];
export const MF_ATOMIC_QUEUE = 'mf_atomic_operations';

/** Apply server rows and tombstones together; never touch another account's cache. */
export async function applyMfAtomicResult(result, owner) {
  if (!result?.tables || !owner || await offlineIdentity() !== owner) return;
  const names = TABLES.filter((name) => result.tables[name]);
  if (!names.length) return;
  await db.transaction('rw', names.map((name) => db[name]), async () => {
    if (await offlineIdentity() !== owner) throw new Error('offline_session_changed');
    for (const name of names) {
      const delta = result.tables[name];
      for (const id of delta.deleted_ids || []) {
        const existing = await db[name].get(id);
        if (existing?.user_id === owner) await db[name].delete(id);
      }
      for (const row of delta.rows || []) {
        if (row.user_id !== owner) throw new Error('offline_owner_mismatch');
        const existing = await db[name].get(row.id);
        if (existing && existing.user_id !== owner) throw new Error('offline_owner_mismatch');
        if (name === 'mf_goal_contributions' && row.transaction_id) {
          const shadows = await db[name].where('user_id').equals(owner)
            .filter((item) => item.transaction_id === row.transaction_id && item.id !== row.id).toArray();
          for (const shadow of shadows) await db[name].delete(shadow.id);
        }
        await db[name].put(row);
      }
    }
    if (await offlineIdentity() !== owner) throw new Error('offline_session_changed');
  });
}

/** Used both by online mutations and the outbox: one request, one transaction. */
export async function sendMfAtomicOperation(rpc, args, owner) {
  if (!RPCS.includes(rpc)) throw new Error('mf_atomic_rpc_invalid');
  const { data, error } = await supabase.rpc(rpc, args);
  if (error) throw error;
  // A remote pending payment can have a different ID from the optimistic
  // offline placeholder. Remove that placeholder when the server reused a row.
  if (rpc === 'mf_pay_card_invoice' && data?.payment_id && args.p_operation_id &&
      data.payment_id !== args.p_operation_id && data.tables?.mf_transactions) {
    data.tables.mf_transactions.deleted_ids = [
      ...(data.tables.mf_transactions.deleted_ids || []), args.p_operation_id,
    ];
  }
  // A cache failure must not turn a committed server write into a failed write.
  await applyMfAtomicResult(data, owner).catch(() => {});
  return data;
}

export async function executeMfAtomicOperation(rpc, args) {
  if (!RPCS.includes(rpc)) throw new Error('mf_atomic_rpc_invalid');
  if (!isOffline()) {
    const owner = await offlineIdentity().catch(() => null);
    return sendMfAtomicOperation(rpc, args, owner);
  }
  const owner = await requireOfflineIdentity();
  const operationId = args.p_operation_id;
  if (!operationId) throw new Error('mf_atomic_operation_required');
  return db.transaction('rw', ...TABLES.map((name) => db[name]), db.sync_queue, async () => {
    if (await offlineIdentity() !== owner) throw new Error('offline_session_changed');
    const queued = (await db.sync_queue.toArray()).filter((entry) => entry.record_id === operationId);
    if (queued.some((entry) => entry.table_name === MF_ATOMIC_QUEUE && queueOwner(entry) === owner)) return;
    const put = async (table, row) => {
      if (row.user_id && row.user_id !== owner) throw new Error('offline_owner_mismatch');
      const existing = await db[table].get(row.id);
      if (existing && existing.user_id !== owner) throw new Error('offline_owner_mismatch');
      await db[table].put({ ...existing, ...row, user_id: owner, updated_at: new Date().toISOString() });
    };
    if (rpc === 'mf_save_tx_with_goal') {
      await put('mf_transactions', { ...args.p_tx, id: operationId });
      const contributions = await db.mf_goal_contributions.where('user_id').equals(owner)
        .filter((row) => row.transaction_id === operationId).toArray();
      if (args.p_goal_contribution) {
        await put('mf_goal_contributions', {
          ...args.p_goal_contribution,
          id: contributions[0]?.id || args.p_goal_contribution.id || operationId,
          transaction_id: operationId,
        });
      } else if (args.p_delete_contribution) {
        for (const row of contributions) await db.mf_goal_contributions.delete(row.id);
      }
    } else {
      const pending = await db.mf_transactions.where('user_id').equals(owner).filter((row) =>
        row.account_id === args.p_account_id && row.invoice_close === args.p_invoice_close &&
        row.type === 'DESPESA' && row.status === 'PENDENTE').toArray();
      pending.sort((a, b) => String(b.payment_date).localeCompare(String(a.payment_date)));
      const payment = args.p_payment;
      const paymentId = pending[0]?.id || payment?.id || operationId;
      if (payment) await put('mf_transactions', { ...payment, id: paymentId, invoice_close: args.p_invoice_close });
      for (const row of args.p_extras || []) await put('mf_transactions', row);
      for (const row of pending) {
        if (args.p_replace_all || (payment && row.id !== paymentId && row.notes === 'Agendado automaticamente (fatura)')) {
          await db.mf_transactions.delete(row.id);
        }
      }
    }
    await db.sync_queue.add({
      owner_id: owner, table_name: MF_ATOMIC_QUEUE, record_id: operationId,
      action: 'rpc', payload: { rpc, args }, created_at: new Date().toISOString(), attempts: 0,
    });
    return { transaction_id: operationId };
  });
}

/** Freeze all generated IDs in the request so a lost response can be retried. */
export function prepareCardPaymentOperation({ card, invoice, payload, extraRows = [], operationId = generateUUID() }) {
  return {
    p_operation_id: operationId,
    p_card_id: card.id,
    p_account_id: card.linked_account_id,
    p_invoice_close: invoice.closeISO,
    p_payment: payload ? { ...payload, id: payload.id || operationId, notes: null } : null,
    p_extras: (Array.isArray(extraRows) ? extraRows : [extraRows]).filter(Boolean)
      .map((row) => ({ ...row, id: row.id || generateUUID() })),
    p_replace_all: !payload,
    p_open_amount: null,
  };
}
