import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db, MF_OFFLINE_TABLES } from './db';
import { mfSelect, mfSelectAll, mfMutate, isOffline } from './mfOffline';
import { MfSyncProvider, SyncEngine } from './SyncEngine';

// Mock do Supabase para o MfSyncProvider (pull em bloco) e o drain da fila
vi.mock('../supabase', () => {
  const serverData = {
    mf_accounts: [{ id: 'srv-1', name: 'Conta do servidor', user_id: 'u1' }],
  };
  const chains = {};
  const makeChain = (table) => ({
    select: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: vi.fn((onFulfilled, onRejected) =>
      Promise.resolve({ data: serverData[table] || [], error: null }).then(
        onFulfilled,
        onRejected
      )
    ),
  });
  return {
    supabase: {
      from: vi.fn((table) => {
        if (!chains[table]) chains[table] = makeChain(table);
        return chains[table];
      }),
      __chains: chains,
    },
  };
});

const goOffline = () =>
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => false,
  });
const goOnline = () =>
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => true,
  });

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('mfOffline (Fase 9 — offline do Minhas Finanças)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    goOnline();
    await Promise.all(MF_OFFLINE_TABLES.map((table) => db[table].clear()));
    await db.sync_queue.clear();
  });

  afterEach(() => {
    goOnline();
  });

  it('isOffline reflete navigator.onLine', () => {
    goOnline();
    expect(isOffline()).toBe(false);
    goOffline();
    expect(isOffline()).toBe(true);
  });

  /* ── mfSelect (leitura com cache) ──────────────────────── */

  it('online: roda a query, devolve os dados e cacheia no Dexie', async () => {
    const buildQuery = vi
      .fn()
      .mockResolvedValue({ data: [{ id: 'a1', name: 'Nubank' }], error: null });

    const { data, error } = await mfSelect('mf_accounts', buildQuery);

    expect(buildQuery).toHaveBeenCalledTimes(1);
    expect(error).toBeNull();
    expect(data).toEqual([{ id: 'a1', name: 'Nubank' }]);

    await vi.waitFor(async () => {
      expect(await db.mf_accounts.get('a1')).toMatchObject({ name: 'Nubank' });
    });
  });

  it('online: erro da query é lançado (mantém estado de erro)', async () => {
    const buildQuery = vi
      .fn()
      .mockResolvedValue({ data: null, error: new Error('boom') });
    await expect(mfSelect('mf_accounts', buildQuery)).rejects.toThrow('boom');
  });

  it('offline: não toca na rede e lê o cache com filtro/ordem locais', async () => {
    goOffline();
    await db.mf_accounts.bulkPut([
      { id: 'a1', name: 'A', sort_order: 1, profile_id: 'p1' },
      { id: 'a2', name: 'B', sort_order: 0, profile_id: 'p2' },
    ]);
    const buildQuery = vi.fn();

    const { data } = await mfSelect('mf_accounts', buildQuery, {
      filter: (rows) => rows.filter((row) => row.profile_id === 'p1'),
      sort: (rows) => [...rows].sort((a, b) => a.sort_order - b.sort_order),
    });

    expect(buildQuery).not.toHaveBeenCalled();
    expect(data.map((row) => row.id)).toEqual(['a1']);
  });

  it('cache:false: select parcial não sobrescreve o cache completo', async () => {
    await db.mf_accounts.put({ id: 'a1', name: 'Completa', currency: 'BRL' });
    const buildQuery = vi.fn().mockResolvedValue({ data: [{ id: 'a1' }], error: null });

    await mfSelect('mf_accounts', buildQuery, { cache: false });
    await settle();

    expect(await db.mf_accounts.get('a1')).toMatchObject({
      name: 'Completa',
      currency: 'BRL',
    });
  });

  /* ── mfSelectAll (leitura paginada — a REST corta em 1000 linhas) ── */

  /** Servidor paginável: `.range(from, to)` devolve a fatia exata da lista. */
  const pagedServer = (allRows) =>
    vi.fn(() => {
      let range = [0, 999];
      const chain = {
        range: vi.fn((from, to) => {
          range = [from, to];
          return chain;
        }),
        then: vi.fn((onFulfilled, onRejected) => {
          const [from, to] = range;
          return Promise.resolve({
            data: allRows.slice(from, to + 1),
            error: null,
          }).then(onFulfilled, onRejected);
        }),
      };
      return chain;
    });

  it('online: pagina com .range() até a página vazia (não corta em 1000)', async () => {
    const allRows = Array.from({ length: 2500 }, (_, i) => ({ id: `tx-${i}` }));
    const buildQuery = pagedServer(allRows);

    const { data, error } = await mfSelectAll('mf_transactions', buildQuery);

    expect(error).toBeNull();
    expect(data).toHaveLength(2500);
    // 1ª chamada sonda o `.range` (sem rede) + 1ª página sequencial (cheia)
    // + onda paralela de 8 (2ª cheia, 3ª curta aborta o resto) + sonda final
    // vazia que encerra = 11 chamadas — antes eram 14 sequenciais em prod.
    expect(buildQuery).toHaveBeenCalledTimes(11);
  });

  it('online: deduplica por id e termina mesmo com servidor que nunca devolve página vazia', async () => {
    const rows = [{ id: 'tx-1' }, { id: 'tx-2' }, { id: 'tx-3' }];
    const buildQuery = vi.fn(() => {
      const chain = {
        range: vi.fn(() => chain),
        then: vi.fn((onFulfilled, onRejected) =>
          Promise.resolve({ data: [...rows], error: null }).then(onFulfilled, onRejected)
        ),
      };
      return chain;
    });

    const { data } = await mfSelectAll('mf_transactions', buildQuery);

    // Mesmas linhas repetidas em toda página → sem duplicatas e com término
    // garantido (trava de segurança), sem travar a tela.
    expect(data).toHaveLength(3);
  });

  it('online: builder sem .range (mock legado) faz uma única requisição', async () => {
    const buildQuery = vi
      .fn()
      .mockResolvedValue({ data: [{ id: 'tx-1' }], error: null });

    const { data, error } = await mfSelectAll('mf_transactions', buildQuery);

    expect(error).toBeNull();
    expect(data).toEqual([{ id: 'tx-1' }]);
    expect(buildQuery).toHaveBeenCalledTimes(1);
  });

  it('offline: não toca na rede e lê o cache com filtro local', async () => {
    goOffline();
    await db.mf_transactions.bulkPut([
      { id: 't1', payment_date: '2026-04-10' },
      { id: 't2', payment_date: '2026-10-10' },
    ]);
    const buildQuery = vi.fn();

    const { data } = await mfSelectAll('mf_transactions', buildQuery, {
      filter: (rows) => rows.filter((row) => row.payment_date <= '2026-04-30'),
    });

    expect(buildQuery).not.toHaveBeenCalled();
    expect(data.map((row) => row.id)).toEqual(['t1']);
  });

  /* ── mfMutate (escrita) ────────────────────────────────── */

  it('offline: insert grava no Dexie e enfileira para sincronizar', async () => {
    goOffline();
    const run = vi.fn();

    const row = await mfMutate({
      table: 'mf_accounts',
      action: 'insert',
      payload: { name: 'Nova conta', user_id: 'u1' },
      run,
    });

    expect(run).not.toHaveBeenCalled();
    expect(row.id).toBeTruthy();
    expect(await db.mf_accounts.get(row.id)).toMatchObject({ name: 'Nova conta' });

    const queue = await db.sync_queue.toArray();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      table_name: 'mf_accounts',
      record_id: row.id,
      action: 'insert',
    });
    expect(queue[0].payload.name).toBe('Nova conta');
  });

  it('offline: insert de array (parcelas) cria várias linhas e entradas', async () => {
    goOffline();
    const rows = await mfMutate({
      table: 'mf_transactions',
      action: 'insert',
      payload: [
        { description: 'Parcela 1', user_id: 'u1' },
        { description: 'Parcela 2', user_id: 'u1' },
      ],
      run: vi.fn(),
    });

    expect(rows).toHaveLength(2);
    expect(await db.mf_transactions.count()).toBe(2);
    expect(await db.sync_queue.count()).toBe(2);
  });

  it('offline: update mescla o patch sobre a linha em cache', async () => {
    goOffline();
    await db.mf_accounts.put({ id: 'a1', name: 'Antiga', color: '#fff' });

    const out = await mfMutate({
      table: 'mf_accounts',
      action: 'update',
      id: 'a1',
      payload: { name: 'Nova' },
      run: vi.fn(),
    });

    expect(out).toMatchObject({ id: 'a1', name: 'Nova', color: '#fff' });
    expect(await db.mf_accounts.get('a1')).toMatchObject({
      name: 'Nova',
      color: '#fff',
    });

    const queue = await db.sync_queue.toArray();
    expect(queue[0]).toMatchObject({ action: 'update', record_id: 'a1' });
    expect(queue[0].payload.name).toBe('Nova');
  });

  it('offline: deleteMany remove do cache e enfileira cada id', async () => {
    goOffline();
    await db.mf_transactions.bulkPut([
      { id: 't1', description: 'A' },
      { id: 't2', description: 'B' },
    ]);

    const out = await mfMutate({
      table: 'mf_transactions',
      action: 'deleteMany',
      ids: ['t1', 't2'],
      run: vi.fn(),
    });

    expect(out).toEqual(['t1', 't2']);
    expect(await db.mf_transactions.count()).toBe(0);
    const queue = await db.sync_queue.toArray();
    expect(queue).toHaveLength(2);
    expect(queue.every((entry) => entry.action === 'delete')).toBe(true);
  });

  it('online: roda a mutation, não enfileira e mantém o cache coerente', async () => {
    const run = vi.fn().mockResolvedValue({ id: 'n1', name: 'Servidor' });

    const out = await mfMutate({
      table: 'mf_accounts',
      action: 'insert',
      payload: { name: 'qualquer' },
      run,
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ id: 'n1', name: 'Servidor' });
    expect(await db.sync_queue.count()).toBe(0);
    await vi.waitFor(async () => {
      expect(await db.mf_accounts.get('n1')).toMatchObject({ name: 'Servidor' });
    });
  });

  it('online: delete remove também do cache local', async () => {
    await db.mf_accounts.put({ id: 'a1', name: 'Remover' });
    const run = vi.fn().mockResolvedValue('a1');

    await mfMutate({ table: 'mf_accounts', action: 'delete', id: 'a1', run });
    await settle();

    expect(await db.mf_accounts.get('a1')).toBeUndefined();
  });

  /* ── Junção mf_transaction_tags (PK composto) ──────────── */

  it('offline: insert na junção não gera id/updated_at e usa record_id composto', async () => {
    goOffline();
    const rows = await mfMutate({
      table: 'mf_transaction_tags',
      action: 'insert',
      payload: [
        { transaction_id: 'tx-1', tag_id: 'tag-1', user_id: 'u1' },
        { transaction_id: 'tx-1', tag_id: 'tag-2', user_id: 'u1' },
      ],
      run: vi.fn(),
    });

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).not.toHaveProperty('id');
      expect(row).not.toHaveProperty('updated_at');
      expect(row.created_at).toBeTruthy();
    }
    expect(await db.mf_transaction_tags.get(['tx-1', 'tag-1'])).toMatchObject({
      tag_id: 'tag-1',
    });

    const queue = await db.sync_queue.toArray();
    expect(queue.map((entry) => entry.record_id)).toEqual([
      'tx-1:tag-1',
      'tx-1:tag-2',
    ]);
    expect(queue[0].payload).not.toHaveProperty('updated_at');
  });

  it('offline: deleteLinks apaga só os vínculos da transação e enfileira por transaction_id', async () => {
    goOffline();
    await db.mf_transaction_tags.bulkPut([
      { transaction_id: 'tx-1', tag_id: 'tag-1', user_id: 'u1' },
      { transaction_id: 'tx-1', tag_id: 'tag-2', user_id: 'u1' },
      { transaction_id: 'tx-2', tag_id: 'tag-1', user_id: 'u1' },
    ]);

    const out = await mfMutate({
      table: 'mf_transaction_tags',
      action: 'deleteLinks',
      ids: ['tx-1'],
      run: vi.fn(),
    });

    expect(out).toEqual(['tx-1']);
    expect(await db.mf_transaction_tags.count()).toBe(1);
    const queue = await db.sync_queue.toArray();
    expect(queue[0]).toMatchObject({
      table_name: 'mf_transaction_tags',
      record_id: 'tx-1',
      action: 'delete',
    });
  });

  it('online: deleteLinks roda a query e limpa o cache sem enfileirar', async () => {
    await db.mf_transaction_tags.bulkPut([
      { transaction_id: 'tx-1', tag_id: 'tag-1', user_id: 'u1' },
      { transaction_id: 'tx-2', tag_id: 'tag-1', user_id: 'u1' },
    ]);
    const run = vi.fn().mockResolvedValue(['tx-1']);

    await mfMutate({
      table: 'mf_transaction_tags',
      action: 'deleteLinks',
      ids: ['tx-1'],
      run,
    });

    expect(run).toHaveBeenCalledTimes(1);
    await vi.waitFor(async () => {
      expect(await db.mf_transaction_tags.count()).toBe(1);
    });
    expect(await db.mf_transaction_tags.get(['tx-2', 'tag-1'])).toBeTruthy();
    expect(await db.sync_queue.count()).toBe(0);
  });

  it('cada módulo registra só o provider dele (o MF não baixa as 38 mil músicas)', () => {
    const soMf = new SyncEngine('u1', { providers: ['mf'] });
    const soMusica = new SyncEngine('u1', { providers: ['music'] });
    const soViagens = new SyncEngine('u1', { providers: ['trips'] });
    const todos = new SyncEngine('u1');

    const nomes = (engine) => engine.providers.map((p) => p.constructor.name);
    expect(nomes(soMf)).toEqual(['MfSyncProvider']);
    expect(nomes(soMusica)).toEqual(['MusicSyncProvider']);
    expect(nomes(soViagens)).toEqual(['TripsSyncProvider']);
    expect(nomes(todos)).toHaveLength(3);
  });

  it('drain da fila: junção upserta só colunas reais e apaga por transaction_id', async () => {
    const { supabase } = await import('../supabase');
    const engine = new SyncEngine(null);

    await engine._processQueueEntry({
      table_name: 'mf_transaction_tags',
      record_id: 'tx-1:tag-1',
      action: 'insert',
      payload: {
        transaction_id: 'tx-1',
        tag_id: 'tag-1',
        user_id: 'u1',
        created_at: '2026-10-04T00:00:00.000Z',
      },
    });
    const junction = supabase.from('mf_transaction_tags');
    const upserted = junction.upsert.mock.calls[0][0];
    expect(upserted).not.toHaveProperty('id');
    expect(upserted).not.toHaveProperty('updated_at');
    expect(upserted.tag_id).toBe('tag-1');

    await engine._processQueueEntry({
      table_name: 'mf_transaction_tags',
      record_id: 'tx-1',
      action: 'delete',
      payload: null,
    });
    expect(junction.eq).toHaveBeenCalledWith('transaction_id', 'tx-1');

    engine.destroy();
  });

  /* ── MfSyncProvider (pull em bloco) ────────────────────── */

  it('MfSyncProvider: baixa as tabelas e substitui o cache (clear + put)', async () => {
    await db.mf_accounts.put({ id: 'old-1', name: 'Removida no servidor' });

    const provider = new MfSyncProvider('u1');
    const results = await provider.pull({});

    expect(results.mf_accounts).toEqual([
      { id: 'srv-1', name: 'Conta do servidor', user_id: 'u1' },
    ]);
    expect(await db.mf_accounts.get('old-1')).toBeUndefined();
    expect(await db.mf_accounts.get('srv-1')).toMatchObject({
      name: 'Conta do servidor',
    });
    expect(results).not.toHaveProperty('mf_restore_points');
  });
});
