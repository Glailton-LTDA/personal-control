import { db, generateUUID, MF_OFFLINE_TABLES } from './db';
import { requireOfflineIdentity, offlineIdentity, queueOwner } from './owner';

/**
 * Offline do módulo Minhas Finanças (Fase 9).
 *
 * - `mfSelect`: leitura com cache local — offline lê o Dexie; online roda a
 *   query, grava as linhas no cache e devolve os dados (formato `{ data,
 *   error }` compatível com as queries existentes). Erro online é repassado
 *   como exceção (mantém o comportamento atual de estado de erro).
 * - `mfMutate`: escrita offline — grava no Dexie e enfileira em `sync_queue`
 *   para o `SyncEngine.drainQueue()` sincronizar quando a conexão voltar.
 */

/** True quando o navegador está offline. */
export const isOffline = () =>
  typeof navigator !== 'undefined' && navigator.onLine === false;

const nowIso = () => new Date().toISOString();

/**
 * Junção de tags: PK composto (transaction_id, tag_id), sem coluna `id` nem
 * `updated_at` — os payloads enfileirados/devolvidos não podem tê-las.
 */
const isJunction = (table) => table === 'mf_transaction_tags';

const enqueue = async (table, recordId, action, payload, owner) =>
  db.sync_queue.add({
    owner_id: owner,
    table_name: table,
    record_id: recordId,
    action,
    payload: payload ? JSON.parse(JSON.stringify(payload)) : null,
    created_at: nowIso(),
    attempts: 0,
  });

/**
 * Lê uma tabela com cache local.
 * @param {string} table nome da tabela mf_*
 * @param {() => Promise<{data: any, error: any}>} buildQuery monta a query Supabase
 * @param {{ filter?: (rows: any[]) => any[], sort?: (rows: any[]) => any[] }} [local]
 *   reaplica filtro/ordenação do servidor sobre os dados do cache (offline)
 */
export async function mfSelect(table, buildQuery, local = {}) {
  const tableDb = db[table];
  if (isOffline()) {
    const owner = await requireOfflineIdentity();
    let rows = tableDb ? await tableDb.where('user_id').equals(owner).toArray() : [];
    if (await offlineIdentity() !== owner) throw new Error('offline_session_changed');
    if (typeof local.filter === 'function') rows = local.filter(rows);
    if (typeof local.sort === 'function') rows = local.sort(rows);
    return { data: rows, error: null };
  }
  const { data, error } = await buildQuery();
  if (error) throw error;
  cacheRows(tableDb, data, local);
  return { data, error: null };
}

/** Cache em melhor esforço (Dexie) das leituras online. */
function cacheRows(tableDb, data, local) {
  if (local.cache !== false && tableDb && Array.isArray(data)) {
    tableDb
      .bulkPut(
        data.map((row) => ({
          ...row,
          updated_at: row.updated_at || row.created_at || nowIso(),
        }))
      )
      .catch(() => {
        /* cache é melhor esforço */
      });
  }
}

const PAGE_SIZE = 1000; // db.max_rows da REST do Supabase (medido em produção: 1000)
const MAX_PAGES = 500; // trava de segurança (500k linhas) — nunca pendurar a tela

/**
 * Leitura paginada da REST do Supabase.
 *
 * A REST devolve no máximo `db.max_rows` (=1000) linhas por requisição, mesmo
 * com `Range` explícito (também medido: `0-4999` é cortado para `0-999`).
 * Consultas abertas como `lte('payment_date')` truncavam SEMPRE nas mesmas
 * 1000 primeiras linhas — todo mês montava os mesmos valores. Aqui pagina com
 * `.range()` até a página VAZIA (funciona com qualquer `max_rows` do
 * servidor) e deduplica por `id` entre páginas.
 *
 * Busca uma página por vez para não transferir páginas especulativas.
 * Avança pelo tamanho REAL da resposta e confirma o fim com uma página
 * vazia: uma resposta curta também pode ser o limite do servidor.
 *
 * `buildQuery` deve criar uma query NOVA a cada chamada e ordenar de forma
 * estável (ex.: `.order('payment_date').order('id')`) para que as páginas
 * sejam determinísticas. Builders sem `.range()` (mocks legados de teste)
 * caem numa única requisição.
 */
export async function mfSelectAll(table, buildQuery, local = {}) {
  const tableDb = db[table];
  if (isOffline()) {
    const owner = await requireOfflineIdentity();
    let rows = tableDb ? await tableDb.where('user_id').equals(owner).toArray() : [];
    if (await offlineIdentity() !== owner) throw new Error('offline_session_changed');
    if (typeof local.filter === 'function') rows = local.filter(rows);
    if (typeof local.sort === 'function') rows = local.sort(rows);
    return { data: rows, error: null };
  }

  const probe = buildQuery();
  if (typeof probe.range !== 'function') {
    const { data, error } = await probe;
    if (error) throw error;
    cacheRows(tableDb, data, local);
    return { data, error: null };
  }

  const rows = [];
  const seen = new Set();
  let from = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const chunk = Array.isArray(data) ? data : [];
    if (chunk.length === 0) break;
    let added = 0;
    for (const row of chunk) {
      if (row.id !== undefined && row.id !== null) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
      }
      rows.push(row);
      added += 1;
    }
    // Protege contra servidores que ignoram Range.
    if (added === 0) break;
    from += chunk.length;
    // Nunca entregar totais silenciosamente incompletos ao atingir a trava.
    if (page === MAX_PAGES - 1) throw new Error('Limite de paginação financeira atingido');
  }
  cacheRows(tableDb, rows, local);
  return { data: rows, error: null };
}

const putRow = async (table, row) => {
  const local = { ...row, created_at: row.created_at || nowIso() };
  if (!isJunction(table)) local.updated_at = nowIso();
  await db[table].put(local);
};

const takeOffline = async ({ table, action, id, ids, payload, owner }) => {
  for (const row of (Array.isArray(payload) ? payload : [payload]).filter(Boolean)) {
    if (row.user_id && row.user_id !== owner) throw new Error('offline_owner_mismatch');
  }
  if (action !== 'insert') {
    const keys = ids || [id];
    for (const key of keys) {
      const rows = action === 'deleteLinks'
        ? await db[table].where('transaction_id').equals(key).toArray()
        : [await db[table].get(key)];
      if (rows.some((row) => !row || row.user_id !== owner)) throw new Error('offline_owner_mismatch');
    }
  }
  if (action === 'delete') {
    await db[table].delete(id);
    await enqueue(table, id, 'delete', null, owner);
    return id;
  }
  if (action === 'deleteLinks') {
    // Junção: apaga todos os vínculos de tag das transações informadas
    // (record_id da fila = id da transação; drain apaga por transaction_id).
    for (const txId of ids) {
      await db[table].where('transaction_id').equals(txId).delete();
      await enqueue(table, txId, 'delete', null, owner);
    }
    return ids;
  }
  if (action === 'deleteMany') {
    for (const oneId of ids) {
      await db[table].delete(oneId);
      await enqueue(table, oneId, 'delete', null, owner);
    }
    return ids;
  }
  if (action === 'updateMany') {
    for (const oneId of ids) {
      const old = (await db[table].get(oneId)) || {};
      const row = { ...old, ...payload, id: oneId, updated_at: nowIso() };
      await putRow(table, row);
      await enqueue(table, oneId, 'update', row, owner);
    }
    return ids;
  }
  if (action === 'update') {
    const old = (await db[table].get(id)) || {};
    const row = { ...old, ...payload, id, updated_at: nowIso() };
    await putRow(table, row);
    await enqueue(table, id, 'update', row, owner);
    return row;
  }
  // insert (aceita objeto ou array — parcelas/recorrência)
  const rows = (Array.isArray(payload) ? payload : [payload]).map((raw) => {
    const row = { ...raw, user_id: owner, created_at: raw.created_at || nowIso() };
    if (!isJunction(table)) {
      row.id = raw.id || generateUUID();
      row.updated_at = nowIso();
    }
    return row;
  });
  for (const row of rows) {
    await putRow(table, row);
    const recordId = isJunction(table)
      ? `${row.transaction_id}:${row.tag_id}`
      : row.id;
    await enqueue(table, recordId, 'insert', row, owner);
  }
  return Array.isArray(payload) ? rows : rows[0];
};

const keepCacheCoherent = async ({ table, action, id, ids, payload, result }) => {
  if (action === 'delete') {
    await db[table].delete(id);
    return;
  }
  if (action === 'deleteLinks') {
    for (const txId of ids) {
      await db[table].where('transaction_id').equals(txId).delete();
    }
    return;
  }
  if (action === 'deleteMany') {
    for (const oneId of ids) await db[table].delete(oneId);
    return;
  }
  if (action === 'updateMany') {
    for (const oneId of ids) {
      const old = (await db[table].get(oneId)) || {};
      await putRow(table, { ...old, ...payload, id: oneId });
    }
    return;
  }
  if (action === 'update') {
    const old = (await db[table].get(id)) || {};
    await putRow(table, { ...old, ...payload, id });
    return;
  }
  // insert: o resultado da query (linha ou linhas) vira o cache
  const rows = Array.isArray(result)
    ? result
    : result && result.id
      ? [result]
      : [];
  for (const row of rows) {
    if (row && row.id) await putRow(table, row);
  }
};

/**
 * Executa uma mutation com suporte a offline.
 * Online: roda `run()` e mantém o cache local coerente.
 * Offline: grava no Dexie + enfileira para sincronizar depois.
 */
export async function mfMutate({ table, action, id = null, ids = null, payload = null, run }) {
  const args = { table, action, id, ids, payload };
  if (!isOffline()) {
    const result = await run();
    // melhor esforço e sem await: não atrasa o onSuccess da mutation
    keepCacheCoherent({ ...args, result }).catch(() => {
      /* cache é melhor esforço */
    });
    return result;
  }
  if (!MF_OFFLINE_TABLES.includes(table)) {
    // Tabela fora do cache (ex.: import): exige conexão.
    return run();
  }
  const owner = await requireOfflineIdentity();
  return db.transaction('rw', db[table], db.sync_queue, () => takeOffline({ ...args, owner }));
}

/** Zera o cache local do Minhas Finanças (troca de usuário, etc.). */
export async function clearMfCache() {
  const owner = await requireOfflineIdentity();
  const pending = await db.sync_queue.toArray();
  if (pending.some((entry) => queueOwner(entry) === owner)) throw new Error('mf_pending_offline_changes');
  return Promise.all(MF_OFFLINE_TABLES.map((table) => db[table].where('user_id').equals(owner).delete()));
}

/** Backups representam dados confirmados no servidor, nunca uma fila local pendente. */
export async function assertNoPendingMfWrites() {
  if (isOffline()) throw new Error('mf_online_required');
  const owner = await requireOfflineIdentity();
  const pending = await db.sync_queue.toArray();
  if (pending.some((entry) => entry.table_name?.startsWith('mf_') && queueOwner(entry) === owner)) {
    throw new Error('mf_pending_offline_changes');
  }
}
