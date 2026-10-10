import { db, generateUUID, MF_OFFLINE_TABLES } from './db';

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

const enqueue = (table, recordId, action, payload) =>
  db.sync_queue.add({
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
    let rows = tableDb ? await tableDb.toArray() : [];
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
const WAVE_SIZE = 8; // requisições de página em paralelo (14 sequenciais ≈ 14 idas e voltas)

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
 * As páginas avançam em ONDAS paralelas (`WAVE_SIZE`): a primeira é
 * sequencial (mede se existe mais dado — tabela pequena não gasta nada
 * extra); se cheia, o resto voa em ondas de 8. 13.318 linhas = 14 páginas,
 * que em sequência custavam 14 idas e vindas (~segundos) — agora 4 rodadas.
 * O avanço é pelo tamanho REAL de cada resposta (compatível com `max_rows`
 * menor que a página) e uma resposta curta aborta o resto da onda (as
 * páginas especulativas seguintes teriam offsets inválidos).
 *
 * `buildQuery` deve criar uma query NOVA a cada chamada e ordenar de forma
 * estável (ex.: `.order('payment_date').order('id')`) para que as páginas
 * sejam determinísticas. Builders sem `.range()` (mocks legados de teste)
 * caem numa única requisição.
 */
export async function mfSelectAll(table, buildQuery, local = {}) {
  const tableDb = db[table];
  if (isOffline()) {
    let rows = tableDb ? await tableDb.toArray() : [];
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
  let done = false;
  let wave = 1; // 1ª página é sequencial (mede o resto); depois, ondas de 8
  for (let page = 0; page < MAX_PAGES && !done; ) {
    const size = Math.min(wave, MAX_PAGES - page);
    const results = await Promise.all(
      Array.from({ length: size }, (_, k) =>
        buildQuery().range(from + k * PAGE_SIZE, from + k * PAGE_SIZE + PAGE_SIZE - 1)
      )
    );
    wave = WAVE_SIZE;
    for (let k = 0; k < results.length; k += 1) {
      const { data, error } = results[k];
      if (error) throw error;
      const chunk = Array.isArray(data) ? data : [];
      if (chunk.length === 0) {
        // Página vazia = fim dos dados.
        done = true;
        break;
      }
      let added = 0;
      chunk.forEach((row) => {
        if (row.id !== undefined && row.id !== null) {
          if (seen.has(row.id)) return;
          seen.add(row.id);
        }
        rows.push(row);
        added += 1;
      });
      // Página só de repetições = o ambiente ignorou o range; encerra sem
      // repetir o trabalho (dedupe acima garante dados corretos de qualquer forma).
      if (added === 0) {
        done = true;
        break;
      }
      from += chunk.length;
      page += 1;
      if (chunk.length < PAGE_SIZE) {
        // Resposta curta: fim dos dados ou clip do servidor. Abandona as
        // páginas especulativas da onda e sonda a próxima contínua de 1 em 1.
        wave = 1;
        break;
      }
    }
  }
  cacheRows(tableDb, rows, local);
  return { data: rows, error: null };
}

const putRow = async (table, row) => {
  const local = { ...row, created_at: row.created_at || nowIso() };
  if (!isJunction(table)) local.updated_at = nowIso();
  await db[table].put(local);
};

const takeOffline = async ({ table, action, id, ids, payload }) => {
  if (action === 'delete') {
    await db[table].delete(id);
    await enqueue(table, id, 'delete', null);
    return id;
  }
  if (action === 'deleteLinks') {
    // Junção: apaga todos os vínculos de tag das transações informadas
    // (record_id da fila = id da transação; drain apaga por transaction_id).
    for (const txId of ids) {
      await db[table].where('transaction_id').equals(txId).delete();
      await enqueue(table, txId, 'delete', null);
    }
    return ids;
  }
  if (action === 'deleteMany') {
    for (const oneId of ids) {
      await db[table].delete(oneId);
      await enqueue(table, oneId, 'delete', null);
    }
    return ids;
  }
  if (action === 'updateMany') {
    for (const oneId of ids) {
      const old = (await db[table].get(oneId)) || {};
      const row = { ...old, ...payload, id: oneId, updated_at: nowIso() };
      await putRow(table, row);
      await enqueue(table, oneId, 'update', row);
    }
    return ids;
  }
  if (action === 'update') {
    const old = (await db[table].get(id)) || {};
    const row = { ...old, ...payload, id, updated_at: nowIso() };
    await putRow(table, row);
    await enqueue(table, id, 'update', row);
    return row;
  }
  // insert (aceita objeto ou array — parcelas/recorrência)
  const rows = (Array.isArray(payload) ? payload : [payload]).map((raw) => {
    const row = { ...raw, created_at: raw.created_at || nowIso() };
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
    await enqueue(table, recordId, 'insert', row);
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
  return takeOffline(args);
}

/** Zera o cache local do Minhas Finanças (troca de usuário, etc.). */
export function clearMfCache() {
  return Promise.all(MF_OFFLINE_TABLES.map((table) => db[table].clear()));
}
