import { test, expect } from '@playwright/test';

/**
 * Fase 9 — E2E do módulo Minhas Finanças.
 *
 * Padrão dos specs existentes: auth mockada (endpoints de /auth/v1),
 * storageState com `pc_e2e_test` e unlock da senha mestre. As tabelas
 * `mf_*` usam um store em memória criado no `beforeEach`: GET devolve o
 * seed + linhas criadas e POST acrescenta — assim os testes de escrita
 * enxergam o que foi criado após o refetch do React Query.
 */
test.describe('Minhas Finanças — E2E (Fase 9)', () => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, apikey, x-client-info, api-version',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  };

  const SEED_ACCOUNT = {
    id: 'acc-e2e',
    name: 'Nubank',
    account_type: 'CORRENTE',
    currency: 'BRL',
    initial_balance: 1000,
    sort_order: 1,
  };

  /**
   * Emula a RPC mf_month_summary sobre o store em memória — mesma
   * semântica do computeAccountRows (somas do mês/anterior, saldos
   * correntes, chart de 6 meses). Exercita o caminho real do hook
   * (RPC → forma { rows, chartTxs } → UI) sem o banco.
   */
  function computeMonthSummaryRPC(store, monthKey) {
    const [y, m] = String(monthKey || '').split('-').map(Number);
    const pad = (n) => String(n).padStart(2, '0');
    const lastDay = new Date(y, m, 0).getDate();
    const start = `${monthKey}-01`;
    const end = `${monthKey}-${pad(lastDay)}`;
    const prevDate = new Date(y, m - 2, 1);
    const prevKey = `${prevDate.getFullYear()}-${pad(prevDate.getMonth() + 1)}`;
    const prevLast = new Date(prevDate.getFullYear(), prevDate.getMonth() + 1, 0).getDate();
    const prevStart = `${prevKey}-01`;
    const prevEnd = `${prevKey}-${pad(prevLast)}`;
    const flowDate = new Date(y, m - 6, 1);
    const flowStart = `${flowDate.getFullYear()}-${pad(flowDate.getMonth() + 1)}-01`;

    const accounts = [...(store.mf_accounts || [])].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
    );
    const txs = store.mf_transactions || [];
    const rows = accounts.map((acc) => {
      let receitas = 0;
      let despesas = 0;
      let despesasFatura = 0;
      let receitasPrev = 0;
      let despesasPrev = 0;
      let transfCredito = 0;
      let transfDebito = 0;
      let saldoMov = 0;
      let saldoMovPrev = 0;
      let pendenteMov = 0;
      txs.forEach((tx) => {
        if (tx.status === 'CANCELADO') return;
        const amount = Number(tx.amount) || 0;
        const inMonth = tx.payment_date >= start && tx.payment_date <= end;
        const inPrev = tx.payment_date >= prevStart && tx.payment_date <= prevEnd;
        const untilEnd = tx.payment_date <= end;
        const untilPrevEnd = tx.payment_date <= prevEnd;
        if (tx.type === 'TRANSFERENCIA') {
          if (tx.account_id === acc.id) {
            if (inMonth) transfDebito += amount;
            if (untilEnd) (tx.status === 'PAGO' ? (saldoMov -= amount) : (pendenteMov -= amount));
            if (untilPrevEnd && tx.status === 'PAGO') saldoMovPrev -= amount;
          }
          if (tx.transfer_account_id === acc.id) {
            if (inMonth) transfCredito += amount;
            if (untilEnd) (tx.status === 'PAGO' ? (saldoMov += amount) : (pendenteMov += amount));
            if (untilPrevEnd && tx.status === 'PAGO') saldoMovPrev += amount;
          }
          return;
        }
        if (tx.account_id !== acc.id) return;
        const delta = tx.type === 'RECEITA' ? amount : -amount;
        if (inMonth) {
          if (tx.type === 'RECEITA') receitas += amount;
          else {
            despesas += amount;
            // Pagamento de fatura: DESPESA com invoice_close em conta
            // não-cartão (paridade com a RPC/fallback — migração
            // mf_month_summary_despesas_fatura).
            if (tx.invoice_close && acc.account_type !== 'CARTAO') despesasFatura += amount;
          }
        }
        if (inPrev) {
          if (tx.type === 'RECEITA') receitasPrev += amount;
          else despesasPrev += amount;
        }
        if (untilEnd) (tx.status === 'PAGO' ? (saldoMov += delta) : (pendenteMov += delta));
        if (untilPrevEnd && tx.status === 'PAGO') saldoMovPrev += delta;
      });
      const saldo = (Number(acc.initial_balance) || 0) + saldoMov;
      const saldoPrev = (Number(acc.initial_balance) || 0) + saldoMovPrev;
      return {
        ...acc,
        currency: acc.currency || 'BRL',
        receitas,
        despesas,
        despesasFatura,
        receitasPrev,
        despesasPrev,
        transfCredito,
        transfDebito,
        saldo,
        saldoPrev,
        previsto: saldo + pendenteMov,
      };
    });
    const currencyByAccount = Object.fromEntries(
      accounts.map((acc) => [acc.id, acc.currency || 'BRL'])
    );
    const chartTxs = [];
    txs.forEach((tx) => {
      if (tx.status === 'CANCELADO' || tx.status !== 'PAGO') return;
      if (tx.type !== 'RECEITA' && tx.type !== 'DESPESA') return;
      const paymentDate = String(tx.payment_date || '');
      if (paymentDate < flowStart || paymentDate > end) return;
      chartTxs.push({
        m: paymentDate.slice(0, 7),
        a: tx.account_id,
        c: currencyByAccount[tx.account_id] || 'BRL',
        t: tx.type,
        v: Number(tx.amount) || 0,
        cat: tx.category_id ?? null,
      });
    });
    return { rows, chartTxs };
  }

  /**
   * Emula a RPC mf_statement — mesma semântica do computeStatement
   * (mês da fatura para despesa de cartão vinculada, abertura com o
   * histórico, saldo corrente por item). Escopo = p_account_ids.
   */
  function shiftMonthKey(monthKey, delta) {
    const [y, m] = String(monthKey || '').split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const pad2 = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  }

  function computeStatementRPC(store, monthKey, accountIds) {
    const [y, m] = String(monthKey || '').split('-').map(Number);
    const pad2 = (n) => String(n).padStart(2, '0');
    const lastDay = new Date(y, m, 0).getDate();
    const start = `${monthKey}-01`;
    const end = `${monthKey}-${pad2(lastDay)}`;
    const viewMonth = String(monthKey || '').slice(0, 7);

    const allAccounts = store.mf_accounts || [];
    const byId = new Map(allAccounts.map((acc) => [acc.id, acc]));
    const scoped = allAccounts.filter(
      (acc) => !accountIds || accountIds.includes(acc.id)
    );
    const scopeIds = new Set(scoped.map((acc) => acc.id));
    const inScope = (tx) =>
      scopeIds.has(tx.account_id) || scopeIds.has(tx.transfer_account_id);
    const scopeIsCard =
      Array.isArray(accountIds) &&
      accountIds.length === 1 &&
      byId.get(accountIds[0])?.account_type === 'CARTAO';

    const cardMonth = (tx) => {
      const acc = byId.get(tx?.account_id);
      if (tx?.type === 'DESPESA' && tx.invoice_close && acc?.account_type === 'CARTAO') {
        const C = Number(acc.closing_day) || 1;
        const D = Number(acc.due_day) || 10;
        return shiftMonthKey(String(tx.invoice_close).slice(0, 7), D >= C ? 0 : 1);
      }
      return String(tx?.payment_date || '').slice(0, 7);
    };
    const scopeDelta = (tx) => {
      const amount = Number(tx.amount) || 0;
      if (tx.type === 'TRANSFERENCIA') {
        let delta = 0;
        if (scopeIds.has(tx.account_id)) delta -= amount;
        if (scopeIds.has(tx.transfer_account_id)) delta += amount;
        return delta;
      }
      if (!scopeIds.has(tx.account_id)) return null;
      return tx.type === 'RECEITA' ? amount : -amount;
    };

    const txs = store.mf_transactions || [];
    let opening = scoped.reduce((sum, acc) => sum + (Number(acc.initial_balance) || 0), 0);
    txs.forEach((tx) => {
      if (tx.status === 'CANCELADO' || tx.status !== 'PAGO') return;
      if (scopeIsCard && tx.type === 'TRANSFERENCIA') return;
      if (cardMonth(tx) >= viewMonth) return;
      const delta = scopeDelta(tx);
      if (delta !== null) opening += delta;
    });

    const monthTxs = txs
      .filter((tx) => {
        if (tx.status === 'CANCELADO' || !inScope(tx)) return false;
        if (scopeIsCard && tx.type === 'TRANSFERENCIA') return false;
        if (tx.type === 'DESPESA' && tx.invoice_close) {
          return cardMonth(tx) === viewMonth;
        }
        return tx.payment_date >= start && tx.payment_date <= end;
      })
      .sort((a, b) =>
        a.payment_date === b.payment_date
          ? String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
          : a.payment_date.localeCompare(b.payment_date)
      );

    let running = opening;
    const groups = [];
    monthTxs.forEach((tx) => {
      const delta = tx.status === 'PAGO' ? scopeDelta(tx) : 0;
      if (delta !== null && delta !== 0) running += delta;
      const last = groups[groups.length - 1];
      const item = {
        tx,
        delta: delta ?? 0,
        balance: running,
        currency: byId.get(tx.account_id)?.currency || 'BRL',
        accountName: byId.get(tx.account_id)?.name ?? '—',
        transferAccountName:
          tx.type === 'TRANSFERENCIA'
            ? byId.get(tx.transfer_account_id)?.name ?? '—'
            : null,
      };
      if (last && last.date === tx.payment_date) last.items.push(item);
      else groups.push({ date: tx.payment_date, items: [item] });
    });
    return { groups, opening };
  }

  /** Desbloqueia o app com a senha mestre padrão para testes. */
  async function unlockApp(page) {
    const unlockModal = page.getByText('Acesso Seguro');
    if (await unlockModal.isVisible()) {
      await page.getByTestId('master-password-input').fill('password123');
      await page.getByRole('button', { name: 'Desbloquear Dados' }).click();
      await expect(unlockModal).not.toBeVisible();
    }
  }

  async function login(page) {
    await page.goto('/');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button:has-text("Entrar")');
    await unlockApp(page);
    await page.waitForLoadState('networkidle');
  }

  /** Abre o módulo via Launchpad. */
  async function openMinhasFinancas(page) {
    await page.getByTestId('launchpad-item-minhasfinancas').click();
    await expect(page.getByTestId('mf-resumo')).toBeVisible();
  }

  test.beforeEach(async ({ page }) => {
    const authUser = { id: 'user-e2e', email: 'test@example.com' };
    const tokenBody = JSON.stringify({
      access_token: 'mock-token',
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: 'mock-refresh',
      user: authUser,
    });

    await page.route('**/auth/v1/token*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: CORS,
        body: tokenBody,
      });
    });

    await page.route('**/auth/v1/user*', async (route) => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: CORS });
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: CORS,
        body: JSON.stringify(authUser),
      });
    });

    // Store em memória por tabela mf_* (seed + inserções).
    // `page.mfStore` permite ao teste semear linhas extras antes de navegar.
    const store = { mf_accounts: [SEED_ACCOUNT] };
    page.mfStore = store;
    const wantsObject = (request) =>
      String(request.headers()['accept'] || '').includes('vnd.pgrst.object');

    // RPC mf_month_summary (resumo agregado no servidor) — emulada
    // sobre o store para exercitar o caminho real do hook.
    await page.route('**/rest/v1/rpc/*', async (route, request) => {
      if (request.method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: CORS });
      }
      const fn = new URL(request.url()).pathname.split('/').pop();
      if (request.method() === 'POST' && fn === 'mf_month_summary') {
        page.mfRpcHits = (page.mfRpcHits || 0) + 1;
        let body = {};
        try {
          body = JSON.parse(request.postData() || '{}');
        } catch {
          body = {};
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: CORS,
          body: JSON.stringify(computeMonthSummaryRPC(store, body.p_month)),
        });
      }
      if (request.method() === 'POST' && fn === 'mf_statement') {
        page.mfStatementRpcHits = (page.mfStatementRpcHits || 0) + 1;
        let body = {};
        try {
          body = JSON.parse(request.postData() || '{}');
        } catch {
          body = {};
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: CORS,
          body: JSON.stringify(
            computeStatementRPC(store, body.p_month, body.p_account_ids)
          ),
        });
      }
      if (request.method() === 'POST' && fn === 'mf_save_tx_linked') {
        let body = {};
        try {
          body = JSON.parse(request.postData() || '{}');
        } catch {
          body = {};
        }
        page.mfLinkedRpcCalls = [...(page.mfLinkedRpcCalls || []), body];
        const txId = body.p_tx_id || body.p_tx?.id || `tx-linked-${Date.now()}`;
        // Emula a RPC: grava/atualiza o lançamento, as filhas, o espelho
        // em trip_expenses e o vínculo em mf_tx_links.
        const upsertTx = (row) => {
          if (!row) return;
          const next = { user_id: authUser.id, ...row };
          const list = store.mf_transactions || [];
          const index = list.findIndex((item) => item.id === next.id);
          if (index >= 0) list[index] = { ...list[index], ...next };
          else list.push(next);
          store.mf_transactions = list;
        };
        upsertTx({ ...body.p_tx, id: txId });
        (body.p_children || []).forEach((row) => upsertTx(row));

        const previous = (store.mf_tx_links || []).find(
          (row) => row.transaction_id === txId
        );
        if (previous?.trip_expense_id) {
          store.trip_expenses = (store.trip_expenses || []).filter(
            (row) => row.id !== previous.trip_expense_id
          );
        }
        let nextLink = null;
        if (body.p_trip_id) {
          const expenseId = `exp-e2e-${Date.now()}`;
          store.trip_expenses = [
            ...(store.trip_expenses || []),
            {
              id: expenseId,
              trip_id: body.p_trip_id,
              user_id: authUser.id,
              amount: body.p_mirror_amount,
              currency: 'BRL',
              date: body.p_tx?.payment_date,
              description: body.p_tx?.description,
              paid_by: body.p_paid_by,
              status: 'PAGO',
            },
          ];
          nextLink = {
            transaction_id: txId,
            user_id: authUser.id,
            trip_id: body.p_trip_id,
            trip_expense_id: expenseId,
          };
        }
        store.mf_tx_links = [
          ...(store.mf_tx_links || []).filter((row) => row.transaction_id !== txId),
          ...(nextLink ? [nextLink] : []),
        ];
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: CORS,
          body: JSON.stringify(txId),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: CORS,
        body: '{}',
      });
    });

    await page.route('**/rest/v1/mf_*', async (route, request) => {
      const method = request.method();
      if (method === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: CORS });
      }

      const table = new URL(request.url()).pathname.split('/').pop();

      if (method === 'GET') {
        const rows = store[table] || [];
        const body = wantsObject(request) ? rows[0] ?? {} : rows;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: CORS,
          body: JSON.stringify(body),
        });
      }

      let payload = {};
      try {
        payload = JSON.parse(request.postData() || '{}');
      } catch {
        payload = {};
      }
      const incoming = (Array.isArray(payload) ? payload : [payload]).filter(
        (row) => row && typeof row === 'object' && Object.keys(row).length > 0
      );

      if (method === 'POST') {
        const rows = incoming.map((row, index) => ({
          id: `${table}-e2e-${Date.now()}-${index}`,
          user_id: authUser.id,
          ...row,
        }));
        store[table] = [...(store[table] || []), ...rows];
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          headers: CORS,
          body: JSON.stringify(wantsObject(request) ? rows[0] : rows),
        });
      }

      if (method === 'PATCH') {
        // PostgREST identifica as linhas por filtros na query (?id=eq.x).
        // Sem isto, todo update devolvia 200 sem mudar a store — o item 30
        // depende do PATCH (reajuste do espelho) de verdade no E2E.
        const params = new URL(request.url()).searchParams;
        const filters = [...params.entries()]
          .filter(([, value]) => value.startsWith('eq.'))
          .map(([key, value]) => [key, value.slice(3)]);
        const matches = (row) =>
          filters.every(([key, value]) => String(row[key] ?? '') === value);
        const updated = [];
        store[table] = (store[table] || []).map((row) => {
          if (!matches(row)) return row;
          const next = { ...row, ...payload };
          updated.push(next);
          return next;
        });
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: CORS,
          body: JSON.stringify(wantsObject(request) ? updated[0] ?? {} : updated),
        });
      }

      if (method === 'DELETE' && incoming.length > 0) {
        const ids = new Set(incoming.map((row) => row.id).filter(Boolean));
        if (ids.size > 0) {
          store[table] = (store[table] || []).filter((row) => !ids.has(row.id));
        }
      }

      if (method === 'DELETE') {
        // supabase-js filtra na query string (?id=eq.x), sem body.
        const params = new URL(request.url()).searchParams;
        const filters = [...params.entries()]
          .filter(([, value]) => value.startsWith('eq.'))
          .map(([key, value]) => [key, value.slice(3)]);
        if (filters.length > 0) {
          store[table] = (store[table] || []).filter(
            (row) => !filters.every(([key, value]) => String(row[key] ?? '') === value)
          );
        }
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: CORS,
        body: JSON.stringify(wantsObject(request) ? {} : []),
      });
    });

    // Viagens para o dropdown da integração (não é tabela mf_*).
    page.tripE2E = {
      id: 'trip-e2e',
      title: 'Gramado E2E',
      start_date: '2026-05-01',
      end_date: '2026-05-10',
      currencies: ['BRL'],
    };
    await page.route('**/rest/v1/trips*', async (route, request) => {
      if (request.method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: CORS });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: CORS,
        body: JSON.stringify([page.tripE2E]),
      });
    });

    // Edge Function finance-ai (Felix) — responde sempre com sucesso.
    await page.route('**/functions/v1/*', async (route, request) => {
      if (request.method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: CORS });
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: CORS,
        body: JSON.stringify({
          reply: 'Você gastou R$ 0,00 neste mês — sem lançamentos ainda. 🐱',
          configured: true,
          toolsUsed: ['resumo_mes'],
        }),
      });
    });
  });

  test('resumo com dados semeados e navegação por todas as telas', async ({ page }) => {
    await login(page);
    await openMinhasFinancas(page);

    // Resumo mostra a conta semead
    await expect(page.getByTestId('mf-resumo-account-row')).toHaveCount(1);
    await expect(page.getByText('Nubank')).toBeVisible();
    // Resumo veio da RPC agregada (não do full scan client-side)
    expect(page.mfRpcHits || 0).toBeGreaterThan(0);

    const screens = [
      ['transactions', 'mf-transacoes'],
      ['accounts', 'mf-contas'],
      ['statement', 'mf-extrato'],
      ['import', 'mf-importar'],
      ['cards', 'mf-cartoes'],
      ['budgets', 'mf-orcamentos'],
      ['goals', 'mf-objetivos'],
      ['reports', 'mf-relatorios'],
      ['felix', 'felix-screen'],
      ['settings', 'mf-config'],
    ];

    for (const [tab, testid] of screens) {
      await page.getByTestId(`sidebar-sub-item-minhasfinancas-${tab}`).click();
      await expect(page).toHaveURL(new RegExp(`/minhasfinancas/${tab}$`));
      await expect(page.getByTestId(testid)).toBeVisible();
    }
  });

  test('detalhe de conta e cartão abre por URL e sobrevive ao refresh', async ({ page }) => {
    // São 6 carregamentos completos do app (URLs diretas + refresh); no dev
    // cada um custa ~3-4 s, então 30 s de timeout não bastam.
    test.slow();
    await login(page);
    page.mfStore.mf_accounts.push({
      id: 'card-route-e2e',
      user_id: 'user-e2e',
      name: 'Cartão rota',
      account_type: 'CARTAO',
      initial_balance: 0,
      currency: 'BRL',
      closing_day: 20,
      due_day: 27,
      sort_order: 1,
      is_active: true,
    });

    for (const [path, name] of [
      ['/minhasfinancas/accounts/acc-e2e', 'Nubank'],
      ['/minhasfinancas/cards/card-route-e2e', 'Cartão rota'],
    ]) {
      await page.goto(path);
      await expect(page.getByTestId('mf-account-detail')).toBeVisible();
      await expect(page.getByRole('heading', { name: new RegExp(name) })).toBeVisible();
      await page.reload();
      await expect(page.getByTestId('mf-account-detail')).toBeVisible();
      await expect(page.getByRole('heading', { name: new RegExp(name) })).toBeVisible();
    }

    await page.goto('/minhasfinancas/accounts');
    await page.getByTestId('mf-open-account-acc-e2e').click();
    await expect(page).toHaveURL('/minhasfinancas/accounts/acc-e2e');
    await page.goBack();
    await expect(page).toHaveURL('/minhasfinancas/accounts');
    await expect(page.getByTestId('mf-contas')).toBeVisible();
  });

  test('cria um lançamento pela tela de edição', async ({ page }) => {
    await login(page);
    await openMinhasFinancas(page);

    await page.getByTestId('sidebar-sub-item-minhasfinancas-transactions').click();
    await expect(page.getByTestId('mf-transacoes')).toBeVisible();
    await expect(page.getByTestId('mf-txs-empty')).toBeVisible();

    await page.getByTestId('mf-new-tx').click();
    await expect(page.getByTestId('mf-new-tx-menu')).toBeVisible();
    await page.getByTestId('mf-add-opt-expense').click();
    await expect(page.getByTestId('mf-tx-screen')).toBeVisible();

    await page.getByTestId('mf-tx-description').fill('Almoço E2E');
    await page.getByTestId('mf-tx-amount').fill('4590'); // máscara → 45,90
    await page.getByTestId('mf-tx-account').click();
    await page.getByTestId('mf-tx-account-option-acc-e2e').click();
    await page.getByTestId('mf-tx-save').click();

    await expect(page.getByTestId('mf-tx-screen')).toBeHidden();
    const row = page.getByTestId('mf-tx-row');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Almoço E2E');
    await expect(row).toContainText('45,90');
  });

  test('integração: despesa vinculada à viagem grava o espelho pela RPC', async ({ page }) => {
    await login(page);
    await openMinhasFinancas(page);

    await page.getByTestId('sidebar-sub-item-minhasfinancas-transactions').click();
    await expect(page.getByTestId('mf-transacoes')).toBeVisible();
    await expect(page.getByTestId('mf-txs-empty')).toBeVisible();

    await page.getByTestId('mf-new-tx').click();
    await page.getByTestId('mf-add-opt-expense').click();
    await expect(page.getByTestId('mf-tx-screen')).toBeVisible();

    await page.getByTestId('mf-tx-description').fill('Hospedagem E2E');
    await page.getByTestId('mf-tx-amount').fill('10000'); // máscara → 100,00
    await page.getByTestId('mf-tx-account').click();
    await page.getByTestId('mf-tx-account-option-acc-e2e').click();
    await page.getByTestId('mf-tx-payment-date').fill('2026-05-02');

    // Bloco "Integrar com outros módulos": liga e escolhe a viagem.
    await page.getByTestId('mf-integration-trip-toggle').check();
    await page.getByTestId('mf-integration-trip-select').click();
    await page.getByTestId('mf-integration-trip-select-option-trip-e2e').click();
    await expect(page.getByTestId('mf-integration-preview')).toBeVisible();

    await page.getByTestId('mf-tx-save').click();
    await expect(page.getByTestId('mf-tx-screen')).toBeHidden();

    // A RPC atômica recebeu o lançamento e o valor do espelho…
    const calls = page.mfLinkedRpcCalls ?? [];
    expect(calls).toHaveLength(1);
    expect(calls[0].p_trip_id).toBe('trip-e2e');
    expect(calls[0].p_mirror_amount).toBe(100);
    expect(calls[0].p_tx).toMatchObject({
      description: 'Hospedagem E2E',
      amount: 100,
      payment_date: '2026-05-02',
      status: 'PAGO',
    });
    expect(calls[0].p_tx_id).toBeNull();

    // …e o gasto espelho nasceu na viagem, com data da competência.
    expect(page.mfStore.trip_expenses).toHaveLength(1);
    expect(page.mfStore.trip_expenses[0]).toMatchObject({
      trip_id: 'trip-e2e',
      amount: 100,
      date: '2026-05-02',
      description: 'Hospedagem E2E',
      status: 'PAGO',
    });
    expect(page.mfStore.mf_tx_links).toHaveLength(1);

    // O lançamento aparece na lista (não foi gravado duas vezes).
    await expect(page.getByTestId('mf-tx-row')).toHaveCount(1);
    await expect(page.getByTestId('mf-tx-row')).toContainText('Hospedagem E2E');
  });

  test('transferência pelo menu de Novo lançamento (4 opções)', async ({ page }) => {
    // 2ª conta BRL para permitir origem → destino na mesma moeda
    page.mfStore.mf_accounts.push({
      id: 'acc-e2e-2',
      name: 'Inter E2E',
      account_type: 'CORRENTE',
      currency: 'BRL',
      initial_balance: 250,
      sort_order: 2,
    });

    await login(page);
    await openMinhasFinancas(page);

    await page.getByTestId('sidebar-sub-item-minhasfinancas-transactions').click();
    await page.getByTestId('mf-new-tx').click();
    await page.getByTestId('mf-add-opt-transfer').click();

    // Transferência pelo menu abre o modal direto (sem tela de criação)
    await expect(page.getByTestId('mf-transfer-modal')).toBeVisible();
    await expect(page.getByTestId('mf-tx-screen')).toBeHidden();

    await page.getByTestId('mf-transfer-amount').fill('3000'); // máscara → 30,00
    await page.getByTestId('mf-transfer-confirm').click();

    // Sucesso fecha o modal e volta para a lista
    await expect(page.getByTestId('mf-transfer-modal')).toBeHidden();
    await expect(page.getByTestId('mf-tx-screen')).toBeHidden();
  });

  test('FAB "+" global: 5 opções, nova conta em outra aba e modal de lançamento', async ({ page }) => {
    await login(page);
    await openMinhasFinancas(page);

    // FAB presente no Resumo → menu com as 5 opções (estorno é só do cartão)
    await expect(page.getByTestId('mf-fab-add')).toBeVisible();
    await page.getByTestId('mf-fab-add').click();
    await expect(page.getByTestId('mf-fab-menu')).toBeVisible();
    await expect(page.getByTestId('mf-add-opt-account')).toBeVisible();
    await expect(page.getByTestId('mf-add-opt-expense')).toBeVisible();
    await expect(page.getByTestId('mf-add-opt-cardExpense')).toBeVisible();
    await expect(page.getByTestId('mf-add-opt-income')).toBeVisible();
    await expect(page.getByTestId('mf-add-opt-transfer')).toBeVisible();
    await expect(page.getByTestId('mf-add-opt-estorno')).toBeHidden();

    // Modal por cima (Resumo segue montado atrás) → FAB some enquanto abre
    await page.getByTestId('mf-add-opt-expense').click();
    await expect(page.getByTestId('mf-tx-screen')).toBeVisible();
    await expect(page.getByTestId('mf-resumo')).toBeVisible();
    await expect(page.getByTestId('mf-fab-add')).toBeHidden();

    await page.getByTestId('mf-tx-cancel').click();
    await expect(page.getByTestId('mf-tx-screen')).toBeHidden();
    await expect(page.getByTestId('mf-fab-add')).toBeVisible();

    // "Nova conta" leva para a aba Contas com o modal já aberto
    await page.getByTestId('mf-fab-add').click();
    await page.getByTestId('mf-add-opt-account').click();
    await expect(page.getByTestId('mf-contas')).toBeVisible();
    await expect(page.getByTestId('mf-account-modal')).toBeVisible();
    await page.getByTestId('mf-account-modal').click({ position: { x: 5, y: 5 } });
    await expect(page.getByTestId('mf-account-modal')).toBeHidden();
    await expect(page.getByTestId('mf-fab-add')).toBeVisible();

    // FAB acompanha todas as telas do módulo (Extrato incluso)
    await page.getByTestId('sidebar-sub-item-minhasfinancas-statement').click();
    await expect(page.getByTestId('mf-extrato')).toBeVisible();
    await expect(page.getByTestId('mf-fab-add')).toBeVisible();
  });

  test('autocomplete da descrição: sugere histórico e preenche categoria e tags (sem valor)', async ({ page }) => {
    await login(page);
    // Histórico: despesa "Chocolate" na cat. Supermercado com a tag Casa
    page.mfStore.mf_categories = [
      { id: 'cat-food', name: 'Alimentação', type: 'DESPESA', parent_id: null, color: '#f59e0b', icon: '🍔' },
      { id: 'cat-market', name: 'Supermercado', type: 'DESPESA', parent_id: 'cat-food', color: '#10b981', icon: '🛒' },
    ];
    page.mfStore.mf_tags = [{ id: 'tag-home', name: 'Casa', color: '#a855f7', user_id: 'user-e2e' }];
    page.mfStore.mf_transactions = [
      {
        id: 'tx-h1',
        account_id: 'acc-e2e',
        type: 'DESPESA',
        description: 'Chocolate',
        amount: 10,
        payment_date: '2026-10-01',
        status: 'PAGO',
        category_id: 'cat-market',
      },
    ];
    page.mfStore.mf_transaction_tags = [{ transaction_id: 'tx-h1', tag_id: 'tag-home' }];
    await openMinhasFinancas(page);

    await page.getByTestId('sidebar-sub-item-minhasfinancas-transactions').click();
    await expect(page.getByTestId('mf-transacoes')).toBeVisible();
    await page.getByTestId('mf-new-tx').click();
    await page.getByTestId('mf-add-opt-expense').click();
    await expect(page.getByTestId('mf-tx-screen')).toBeVisible();

    // Digita 2 letras → sugestão do histórico (descrição + categoria)
    await page.getByTestId('mf-tx-description').pressSequentially('Cho');
    const item = page.getByTestId('mf-tx-suggest-item-0');
    await expect(page.getByTestId('mf-tx-suggest')).toBeVisible();
    await expect(item).toBeVisible();
    await expect(item).toContainText('Chocolate');
    await expect(item).toContainText('Supermercado');
    await expect(item).not.toContainText('10');

    // Escolher preenche descrição, categoria e tags — o valor fica vazio
    await item.click();
    await expect(page.getByTestId('mf-tx-description')).toHaveValue('Chocolate');
    await expect(page.getByTestId('mf-tx-category')).toContainText('Supermercado');
    await expect(page.getByTestId('mf-tx-amount')).toHaveValue('');
    await expect(page.getByTestId('mf-tx-tag-sel-tag-home')).toBeVisible();

    await page.getByTestId('mf-tx-cancel').click();
    await expect(page.getByTestId('mf-tx-screen')).toBeHidden();
  });

  test('extrato mostra spinner no ícone do cabeçalho enquanto recarrega', async ({ page }) => {
    await login(page);
    await openMinhasFinancas(page);

    await page.getByTestId('sidebar-sub-item-minhasfinancas-statement').click();
    await expect(page.getByTestId('mf-extrato')).toBeVisible();

    // Salva um lançamento pelo FAB: o Extrato atualiza a lista sozinho.
    // (O spinner do ícone é transitório demais para o polling do E2E;
    // o comportamento dele fica coberto pelos testes unitários.)
    await page.getByTestId('mf-fab-add').click();
    await page.getByTestId('mf-add-opt-expense').click();
    await expect(page.getByTestId('mf-tx-screen')).toBeVisible();
    await page.getByTestId('mf-tx-description').fill('Almoço E2E spinner');
    await page.getByTestId('mf-tx-amount').fill('1000');
    await page.getByTestId('mf-tx-save').click();
    await expect(page.getByTestId('mf-tx-screen')).toBeHidden({ timeout: 10000 });
    await expect(page.getByTestId('mf-statement-item').first()).toContainText(
      'Almoço E2E spinner'
    );
    // Extrato veio da RPC agregada (não do full scan client-side)
    expect(page.mfStatementRpcHits || 0).toBeGreaterThan(0);
  });

  test('cria uma conta na tela de Contas', async ({ page }) => {
    await login(page);
    await openMinhasFinancas(page);

    await page.getByTestId('sidebar-sub-item-minhasfinancas-accounts').click();
    await expect(page.getByTestId('mf-contas')).toBeVisible();

    await page.getByTestId('mf-new-account').click();
    await expect(page.getByTestId('mf-account-modal')).toBeVisible();
    await page.getByTestId('mf-account-name').fill('Carteira E2E');
    await page.getByTestId('mf-account-save').click();

    await expect(page.getByTestId('mf-account-modal')).toBeHidden();
    await expect(page.getByText('Carteira E2E')).toBeVisible();
  });

  test('navegação de mês: setas, clique volta ao vigente e segurar abre o filtro', async ({ page }) => {
    await login(page);
    await openMinhasFinancas(page);

    const label = page.getByTestId('mf-month-label');
    const initial = (await label.textContent()) || '';

    // seta anterior muda o mês
    await page.getByTestId('mf-month-prev').click();
    await expect(label).not.toHaveText(initial);

    // clique no rótulo volta para o mês vigente
    await label.click();
    await expect(label).toHaveText(initial);

    // clique e segure (500ms) abre o modal Filtrar com mês + ano
    await label.dispatchEvent('pointerdown');
    await expect(page.getByTestId('mf-month-filter')).toBeVisible({ timeout: 3000 });
    await page.getByTestId('mf-month-filter-month').click();
    await page.getByTestId('mf-month-filter-month-option-2').click();
    await page.getByTestId('mf-month-filter-year').click();
    await page
      .getByTestId(`mf-month-filter-year-option-${new Date().getFullYear()}`)
      .click();
    await page.getByTestId('mf-month-filter-ok').click();

    await expect(page.getByTestId('mf-month-filter')).toBeHidden();
    await expect(label).toContainText('Fevereiro');
  });

  /** Data local no formato YYYY-MM-DD (mesma semântica do app — usar UTC
   *  aqui quebra após as 21:00 (UTC-3) e a compra cai fora da fatura).
   *  `date` opcional: alimenta o relógio congelado do teste abaixo. */
  const localISO = (date = new Date()) => {
    const d = new Date(date);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  test('pagamento de fatura: modal parcial agenda sem abater — em aberto segue a fatura não paga', async ({ page }) => {
    // Relógio congelado no dia 15 do mês vigente (mesma filosofia do
    // vi.useFakeTimers dos unit): com o relógio real, o vencimento fixo
    // (dia 20) cruza o mês — a partir do dia 20 a corrente vence e o
    // agendador espelha o pagamento como PAGO ("já vencido"), zera o em
    // aberto e esconde o botão de pagar (o cenário só existia até o dia
    // 19). Dia 15 fica sempre antes do fechamento (16) e do vencimento
    // (20); teste e página leem a MESMA data congelada.
    const frozen = new Date();
    frozen.setDate(15);
    frozen.setHours(12, 0, 0, 0);
    await page.clock.install({ time: frozen });

    const today = localISO(frozen);
    // closing_day dinâmico (nunca hoje): no dia do fechamento a compra
    // "de hoje" cairia na fatura recém-fechada e a corrente zeraria.
    const closingDay = (frozen.getDate() % 28) + 1;
    const card = {
      id: 'acc-e2e-card',
      name: 'Visa E2E',
      account_type: 'CARTAO',
      currency: 'BRL',
      closing_day: closingDay,
      due_day: 20,
      credit_limit: 5000,
      linked_account_id: 'acc-e2e',
      sort_order: 2,
    };

    await login(page);
    // Cartão + compra da fatura corrente (data de hoje → sempre na janela atual)
    page.mfStore.mf_accounts.push(card);
    page.mfStore.mf_transactions = [
      {
        id: 'tx-e2e-card',
        account_id: 'acc-e2e-card',
        type: 'DESPESA',
        description: 'Compra E2E',
        amount: 300,
        payment_date: today,
        status: 'PAGO',
      },
    ];
    await openMinhasFinancas(page);

    await page.getByTestId('sidebar-sub-item-minhasfinancas-cards').click();
    await expect(page.getByTestId('mf-cartoes')).toBeVisible();
    await expect(page.getByTestId('mf-card-fatura-acc-e2e-card')).toHaveText('R$ 300,00');

    // Modal "Quanto você quer pagar?" com valor total e dica de parcial
    await page.getByTestId('mf-card-pay-acc-e2e-card').click();
    await expect(page.getByTestId('mf-pay-modal')).toBeVisible();
    await expect(page.getByText('Quanto você quer pagar?')).toBeVisible();
    await expect(page.getByTestId('mf-pay-partial-hint')).toBeVisible();
    await expect(page.getByTestId('mf-pay-amount')).toHaveValue('300,00');

    // Pagamento parcial de R$ 150,00 → fatura corrente reage imediatamente
    await page.getByTestId('mf-pay-amount').fill('15000');
    await expect(page.getByTestId('mf-pay-amount')).toHaveValue('150,00');
    await page.getByTestId('mf-pay-continue').click();

    await expect(page.getByTestId('mf-pay-modal')).toBeHidden();
    // rodapé mantém o VALOR da fatura e o EM ABERTO segue a fatura não
    // paga: agendamento PENDENTE não abate (só PAGO zera) — a régua do
    // usuário vale: em aberto + disponível = limite
    await expect(page.getByTestId('mf-card-fatura-acc-e2e-card')).toHaveText('R$ 300,00');
    await expect(page.getByTestId('mf-card-open-acc-e2e-card')).toHaveText('R$ 300,00');
    await expect(page.getByTestId('mf-card-available-acc-e2e-card')).toHaveText('R$ 4.700,00');
    // a despesa de pagamento entrou no store (PENDENTE, no vencimento,
    // na conta vinculada — sem transação no cartão); valor 150 isola a
    // parcial deste teste de qualquer espelho do agendador
    const paid = page.mfStore.mf_transactions.find(
      (tx) =>
        tx.type === 'DESPESA' &&
        tx.account_id === 'acc-e2e' &&
        tx.amount === 150 &&
        tx.invoice_close
    );
    expect(paid).toBeTruthy();
    expect(paid.amount).toBe(150);
    expect(paid.status).toBe('PENDENTE');
    expect(paid.invoice_close).toBeTruthy();
  });

  test('antecipar parcelas do cartão move as futuras e lança o estorno', async ({ page }) => {
    const today = localISO();
    const plusMonth = (iso, n) => {
      const [y, m, d] = iso.split('-').map(Number);
      const date = new Date(y, m - 1 + n, d);
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${date.getFullYear()}-${mm}-${dd}`;
    };
    const card = {
      id: 'acc-e2e-card',
      name: 'Visa E2E',
      account_type: 'CARTAO',
      currency: 'BRL',
      closing_day: 10,
      due_day: 20,
      credit_limit: 5000,
      linked_account_id: 'acc-e2e',
      sort_order: 2,
    };

    await login(page);
    // Parcelado 4x de 250 a partir de hoje (sem vínculo: cada uma na sua fatura)
    page.mfStore.mf_accounts.push(card);
    page.mfStore.mf_transactions = [1, 2, 3, 4].map((n) => ({
      id: `tx-e2e-${n}`,
      account_id: 'acc-e2e-card',
      type: 'DESPESA',
      description: 'Parcela E2E',
      amount: 250,
      payment_date: plusMonth(today, n - 1),
      status: 'PAGO',
      installments_current: n,
      installments_total: 4,
      parent_transaction_id: n === 1 ? null : 'tx-e2e-1',
    }));
    await openMinhasFinancas(page);

    const patches = [];
    page.on('request', (request) => {
      if (
        request.url().includes('/rest/v1/mf_transactions') &&
        request.method() === 'PATCH'
      ) {
        try {
          patches.push(JSON.parse(request.postData() || '{}'));
        } catch {
          /* ignora */
        }
      }
    });

    await page.getByTestId('sidebar-sub-item-minhasfinancas-cards').click();
    await expect(page.getByTestId('mf-cartoes')).toBeVisible();
    await page.getByTestId('mf-open-card-acc-e2e-card').click();
    await expect(page.getByTestId('mf-acct-det-invoices')).toBeVisible();

    // Linha da 1/4 (fatura corrente) → Detalhes → ⋮ → Antecipar parcelas
    await page.getByTestId('mf-card-tx-row').first().click();
    await expect(page.getByTestId('mf-tx-detail')).toBeVisible();
    await page.getByTestId('mf-tx-detail-menu').click();
    await page.getByTestId('mf-tx-detail-menu-anticipate').click();
    await expect(page.getByTestId('mf-card-anticipate-modal')).toBeVisible();
    await expect(page.getByTestId('mf-card-anticipate-count')).toHaveValue('3');

    // Desconto de R$ 5,00 vira estorno separado na fatura destino
    await page.getByTestId('mf-card-anticipate-discount').fill('500');
    await page.getByTestId('mf-card-anticipate-confirm').click();
    await expect(page.getByTestId('mf-card-anticipate-modal')).toBeHidden();

    // 3 parcelas mudaram para a mesma fatura (a corrente). Só contam os
    // PATCHes de movimento (carregam invoice_close): sincronizações do
    // agendador de fatura (item 30) mandam {amount} e não contam aqui.
    const movePatches = () => patches.filter((body) => body.invoice_close);
    await expect.poll(() => movePatches().length).toBe(3);
    const closes = movePatches().map((body) => body.invoice_close);
    expect(new Set(closes).size).toBe(1);
    expect(closes[0]).toBeTruthy();
    // estorno negativo na fatura destino entrou no store
    const estorno = page.mfStore.mf_transactions.find(
      (tx) => tx.type === 'DESPESA' && Number(tx.amount) === -5
    );
    expect(estorno).toBeTruthy();
    expect(estorno.invoice_close).toBe(closes[0]);
  });

  test('Felix recebe sugestão e responde no chat', async ({ page }) => {
    const sentBodies = [];
    page.on('request', (request) => {
      if (request.url().includes('/functions/v1/finance-ai')) {
        try {
          sentBodies.push(JSON.parse(request.postData() || '{}'));
        } catch {
          /* ignora corpo inválido */
        }
      }
    });

    await login(page);
    await openMinhasFinancas(page);

    await page.getByTestId('sidebar-sub-item-minhasfinancas-felix').click();
    await expect(page.getByTestId('felix-screen')).toBeVisible();
    await expect(page.getByTestId('felix-welcome')).toBeVisible();

    await page.getByTestId('felix-suggestion').first().click();
    await expect(page.getByTestId('felix-msg-assistant')).toContainText('R$ 0,00');

    // O corpo enviado carrega histórico + contexto de IDs reais
    expect(sentBodies.length).toBe(1);
    expect(sentBodies[0].messages[0].role).toBe('user');
    expect(sentBodies[0].context.accounts[0].id).toBe('acc-e2e');
  });
});
