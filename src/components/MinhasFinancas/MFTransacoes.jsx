import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DollarSign,
  Search,
  Pencil,
  Trash2,
  CheckCircle,
  RotateCcw,
  Paperclip,
  Repeat,
  FastForward,
  Loader2,
  Send,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { confirmToast } from '../../lib/toast';
import { useNotificationSettings } from '../../hooks/useFinance';
import {
  useMFLancamentos,
  useMFAccounts,
  useMFCategories,
  useMFTags,
  useMFSetTransactionStatus,
  useDeleteMFTransaction,
  useDeleteMFFixedSeries,
  useCreateMFTransaction,
  useBulkMFTransactions,
  useBulkDeleteMFTransactions,
  useInstallmentDelete,
  useMFSendReceiptEmail,
  buildEstornoTx,
  formatMoney,
  mfInstallmentSuffix,
  fetchInstallmentSeries,
  installmentHeadId,
  groupTotalsByCurrency,
  formatTotals,
  currentMonthKey,
  toISODate,
} from '../../hooks/useMinhasFinancas';
import MFMonthNav from './MFMonthNav';
import MFCurrencyFilter from './MFCurrencyFilter';
import MFTransacaoScreen from './MFTransacaoScreen';
import MFAnticipateModal from './MFAnticipateModal';
import MFSelect from './MFSelect';
import MFAddMenu from './MFAddMenu';
import MFTransferModal from './MFTransferModal';
import MFChoiceDialog from './MFChoiceDialog';
import MFEmailModal from './MFEmailModal';

const cellBase = {
  padding: '0.8rem 0.9rem',
  fontSize: '0.88rem',
  whiteSpace: 'nowrap',
};

const badge = (color) => ({
  fontSize: '0.68rem',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color,
  background: `color-mix(in srgb, ${color} 14%, transparent)`,
  border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
  borderRadius: 999,
  padding: '0.1rem 0.55rem',
});

/** Nome do mês corrente capitalizado ("Outubro") — diálogo de efetivação. */
const currentMonthLabel = (i18n) => {
  const name = new Intl.DateTimeFormat(i18n?.language || 'pt-BR', {
    month: 'long',
  }).format(new Date());
  return name.charAt(0).toUpperCase() + name.slice(1);
};

/**
 * Tela de Lançamentos: lista do mês com filtros (busca, status, tipo,
 * conta, categoria, tag), pagar/estornar, edição em lote e CRUD
 * via MFTransacaoScreen (parcelas, recorrência, anexos, 3 datas).
 */
export default function MFTransacoes({
  user,
  monthKey = currentMonthKey(),
  onChangeMonth = () => {},
  showValues = true,
}) {
  const { t, i18n } = useTranslation();
  const { data: txData, isLoading, isError } = useMFLancamentos(user, monthKey);
  const { data: accounts = [] } = useMFAccounts(user);
  const { data: categories = [] } = useMFCategories(user);
  const { data: tags = [] } = useMFTags(user);

  const setStatusMutation = useMFSetTransactionStatus();
  const deleteMutation = useDeleteMFTransaction();
  const deleteFixedMutation = useDeleteMFFixedSeries();
  const instDelete = useInstallmentDelete();
  const sendReceipt = useMFSendReceiptEmail();
  const { data: notificationSettings } = useNotificationSettings();
  const [emailTarget, setEmailTarget] = useState(null);

  /** Enviar comprovante: direto se pula o modal, senão abre a escolha. */
  const openEmail = (tx, categoryName) => {
    if (notificationSettings?.skip_email_modal && notificationSettings?.recipient_email) {
      sendReceipt({ tx, categoryName });
    } else {
      setEmailTarget({ tx, categoryName });
    }
  };
  const createMutation = useCreateMFTransaction();
  const bulkMutation = useBulkMFTransactions();
  const bulkDeleteMutation = useBulkDeleteMFTransactions();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [currency, setCurrency] = useState('all');
  const [selection, setSelection] = useState([]);
  const [screenOpen, setScreenOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  // Opção escolhida no menu "+" (expense | cardExpense | income)
  const [newKind, setNewKind] = useState(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [anticipateTx, setAnticipateTx] = useState(null);
  // Diálogo de escolha da série fixa (excluir escopo / contabilizar mês)
  const [choice, setChoice] = useState(null);

  const transactions = useMemo(
    () => txData?.transactions ?? [],
    [txData]
  );
  const tagIdsByTx = useMemo(() => txData?.tagIdsByTx ?? {}, [txData]);

  const accountById = useMemo(
    () => Object.fromEntries(accounts.map((acc) => [acc.id, acc])),
    [accounts]
  );
  const categoryById = useMemo(
    () => Object.fromEntries(categories.map((cat) => [cat.id, cat])),
    [categories]
  );
  const tagById = useMemo(() => Object.fromEntries(tags.map((tag) => [tag.id, tag])), [tags]);

  const currencyOptions = useMemo(
    () => [...new Set(accounts.map((acc) => acc.currency || 'BRL'))],
    [accounts]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    // categoria pai inclui os filhos no filtro
    const categoryIds =
      categoryFilter === 'all'
        ? null
        : new Set([
            categoryFilter,
            ...categories.filter((cat) => cat.parent_id === categoryFilter).map((cat) => cat.id),
          ]);

    return transactions
      .filter((tx) => {
        const acc = accountById[tx.account_id];
        const txCurrency = acc?.currency || 'BRL';
        if (currency !== 'all' && txCurrency !== currency) return false;
        if (accountFilter !== 'all' && tx.account_id !== accountFilter) return false;
        if (status !== 'all' && tx.status !== status) return false;
        if (type !== 'all' && tx.type !== type) return false;
        if (categoryIds && !categoryIds.has(tx.category_id)) return false;
        if (tagFilter !== 'all' && !(tagIdsByTx[tx.id] || []).includes(tagFilter)) return false;
        if (term && !String(tx.description).toLowerCase().includes(term)) return false;
        return true;
      })
      .sort((a, b) => String(a.payment_date).localeCompare(String(b.payment_date)));
  }, [
    transactions,
    accountById,
    currency,
    accountFilter,
    status,
    type,
    categoryFilter,
    categories,
    tagFilter,
    tagIdsByTx,
    search,
  ]);

  const selected = useMemo(
    () => selection.filter((id) => filtered.some((tx) => tx.id === id)),
    [selection, filtered]
  );

  const totals = useMemo(() => {
    const income = filtered.filter(
      (tx) => tx.type === 'RECEITA' && tx.status !== 'CANCELADO'
    );
    const expense = filtered.filter(
      (tx) => tx.type === 'DESPESA' && tx.status !== 'CANCELADO'
    );
    const accCurrencyOf = (tx) => accountById[tx.account_id]?.currency || 'BRL';
    const withCurrency = (rows) =>
      rows.map((tx) => ({ ...tx, currency: accCurrencyOf(tx) }));
    return {
      receitas: formatTotals(groupTotalsByCurrency(withCurrency(income), 'amount'), showValues),
      despesas: formatTotals(groupTotalsByCurrency(withCurrency(expense), 'amount'), showValues),
    };
  }, [filtered, accountById, showValues]);

  const statusColor = {
    PAGO: '#10b981',
    PENDENTE: '#f59e0b',
    CANCELADO: '#94a3b8',
  };

  const formatDate = (iso) => {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y.slice(2)}`;
  };

  const deltaOf = (tx) => {
    if (tx.type === 'TRANSFERENCIA') return null;
    const amount = Number(tx.amount) || 0;
    return tx.type === 'RECEITA' ? amount : -amount;
  };

  const toggleSelect = (id) => {
    setSelection((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    const visibleIds = filtered.map((tx) => tx.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));
    setSelection(allSelected ? [] : visibleIds);
  };

  /** Paga/despaga de fato (PAGO ↔ PENDENTE). */
  const applyTogglePaid = async (tx, overrides = {}) => {
    const paying = tx.status !== 'PAGO';
    try {
      await setStatusMutation.mutateAsync({
        id: tx.id,
        status: paying ? 'PAGO' : 'PENDENTE',
        effective_date: paying
          ? (overrides.effective_date ?? tx.effective_date ?? toISODate(new Date()))
          : null,
        ...(paying && overrides.payment_date ? { payment_date: overrides.payment_date } : {}),
      });
      toast.success(t(paying ? 'minhasfinancas.tx_marked_paid' : 'minhasfinancas.tx_marked_pending'));
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    }
  };

  const handleTogglePaid = (tx) => {
    const paying = tx.status !== 'PAGO';
    const todayISO = toISODate(new Date());
    // Série fixa paga em outro mês → pergunta onde contabilizar
    // (no vencimento ou no mês da efetivação).
    if (
      paying &&
      tx.is_fixed &&
      String(tx.payment_date).slice(0, 7) !== todayISO.slice(0, 7)
    ) {
      setChoice({ kind: 'settle', tx });
      return;
    }
    applyTogglePaid(tx);
  };

  const handleEstorno = (tx) => {
    confirmToast(
      t('minhasfinancas.tx_estorno_confirm', { name: tx.description }),
      async () => {
        try {
          await createMutation.mutateAsync(
            buildEstornoTx({
              userId: user.id,
              tx,
              description: t('minhasfinancas.tx_estorno_of', { name: tx.description }),
              notes: t('minhasfinancas.tx_estorno_notes', { name: tx.description }),
            })
          );
          toast.success(t('minhasfinancas.tx_estorno_done'));
        } catch {
          toast.error(t('minhasfinancas.save_error'));
        }
      },
      { danger: true, confirmText: t('minhasfinancas.tx_estorno') }
    );
  };

  const handleDelete = async (tx) => {
    // Série fixa: perguntar o escopo (este mês / a partir daqui / tudo).
    if (tx.is_fixed) {
      setChoice({ kind: 'fixedDelete', tx });
      return;
    }
    // Série parcelada: escopo (só esta / esta e próximas / todas).
    if (installmentHeadId(tx)) {
      try {
        const series = await fetchInstallmentSeries(tx);
        if (series.length > 1) {
          setChoice({ kind: 'instDelete', tx });
          return;
        }
      } catch {
        toast.error(t('minhasfinancas.save_error'));
        return;
      }
    }
    confirmToast(
      t('minhasfinancas.tx_delete_confirm', { name: tx.description }),
      async () => {
        try {
          await deleteMutation.mutateAsync(tx.id);
          toast.success(t('minhasfinancas.tx_deleted'));
        } catch {
          toast.error(t('minhasfinancas.save_error'));
        }
      },
      { danger: true, confirmText: t('minhasfinancas.delete') }
    );
  };

  /** Escolha do diálogo "O que você deseja?" da série parcelada. */
  const onInstDeleteChoice = async (key, renumber) => {
    const tx = choice?.tx;
    setChoice(null);
    if (!tx) return;
    try {
      await instDelete({ tx, scope: key, renumber });
      toast.success(t('minhasfinancas.tx_deleted'));
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    }
  };

  /** Escolha do diálogo "O que você deseja?" da série fixa. */
  const onFixedDeleteChoice = async (key) => {
    const tx = choice?.tx;
    setChoice(null);
    if (!tx) return;
    try {
      await deleteFixedMutation.mutateAsync({ tx, mode: key });
      toast.success(t('minhasfinancas.tx_deleted'));
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    }
  };

  /** Escolha do diálogo "Contabilizar no mês da efetivação?". */
  const onSettleChoice = async (key) => {
    const tx = choice?.tx;
    setChoice(null);
    if (!tx) return;
    if (key === 'due') {
      // Conta no mês do vencimento: efetivação na data de vencimento
      // e a competência (payment_date) permanece onde está.
      await applyTogglePaid(tx, { effective_date: tx.due_date || tx.payment_date });
      return;
    }
    // Conta no mês da efetivação: move a competência para hoje —
    // o mês de origem perde a ocorrência (mesmo efeito do print).
    const todayISO = toISODate(new Date());
    await applyTogglePaid(tx, { effective_date: todayISO, payment_date: todayISO });
  };

  const handleBulkPay = async () => {
    try {
      await bulkMutation.mutateAsync({
        ids: selected,
        patch: { status: 'PAGO', effective_date: toISODate(new Date()) },
      });
      toast.success(t('minhasfinancas.tx_bulk_done'));
      setSelection([]);
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    }
  };

  const handleBulkCategory = async (categoryId) => {
    if (!categoryId) return;
    try {
      await bulkMutation.mutateAsync({ ids: selected, patch: { category_id: categoryId } });
      toast.success(t('minhasfinancas.tx_bulk_done'));
      setSelection([]);
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    }
  };

  const handleBulkDelete = () => {
    confirmToast(
      t('minhasfinancas.tx_bulk_delete_confirm', { count: selected.length }),
      async () => {
        try {
          await bulkDeleteMutation.mutateAsync(selected);
          toast.success(t('minhasfinancas.tx_deleted'));
          setSelection([]);
        } catch {
          toast.error(t('minhasfinancas.save_error'));
        }
      },
      { danger: true, confirmText: t('minhasfinancas.delete') }
    );
  };

  /** Menu "+" (4 opções): transferência abre o modal, o resto a tela. */
  const handleAdd = (kind) => {
    if (kind === 'transfer') {
      setTransferOpen(true);
      return;
    }
    setEditing(null);
    setNewKind(kind);
    setScreenOpen(true);
  };

  const openEdit = (tx) => {
    setEditing({ ...tx, tagIds: tagIdsByTx[tx.id] || [] });
    setNewKind(null);
    setScreenOpen(true);
  };

  const headers = [
    { label: t('minhasfinancas.tx_date'), align: 'left' },
    { label: t('minhasfinancas.tx_description'), align: 'left' },
    { label: t('minhasfinancas.tx_account'), align: 'left' },
    { label: t('minhasfinancas.tx_status'), align: 'left' },
    { label: t('minhasfinancas.tx_amount'), align: 'right' },
    { label: t('minhasfinancas.tx_actions'), align: 'right' },
  ];

  return (
    <div data-testid="mf-transacoes" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Modal de criação/edição de lançamento (padrão do modal de conta) */}
      {screenOpen && (
        <MFTransacaoScreen
          tx={editing}
          user={user}
          defaultType={!editing && newKind === 'income' ? 'RECEITA' : 'DESPESA'}
          accountScope={
            editing ? 'all' : newKind === 'cardExpense' ? 'cartao' : 'contas'
          }
          onClose={() => setScreenOpen(false)}
        />
      )}

      {/* Cabeçalho */}
      <div
        className="glass-card"
        style={{
          padding: '1.25rem 1.5rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              padding: '0.6rem',
              borderRadius: 14,
              background: 'color-mix(in srgb, var(--primary) 14%, transparent)',
              color: 'var(--primary)',
            }}
          >
            <DollarSign size={22} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>
              {t('nav.sub.minhasfinancas.transactions')}
            </h2>
            <p style={{ margin: '0.15rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {t('minhasfinancas.transactions_desc')}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <MFCurrencyFilter
            currencies={currencyOptions}
            value={currency}
            onChange={(value) => {
              setCurrency(value);
              setAccountFilter('all');
            }}
          />
          <MFMonthNav monthKey={monthKey} onChange={onChangeMonth} />
          <MFAddMenu
            items={['expense', 'cardExpense', 'income', 'transfer']}
            onSelect={handleAdd}
            label={t('minhasfinancas.tx_new')}
            triggerTestId="mf-new-tx"
            testId="mf-new-tx-menu"
            triggerStyle={{ padding: '0.65rem 1rem', fontSize: '0.85rem' }}
          />
        </div>
      </div>

      {/* Filtros */}
      <div
        style={{
          display: 'flex',
          gap: '0.6rem',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 320 }}>
          <Search
            size={15}
            style={{
              position: 'absolute',
              left: '0.8rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <input
            type="text"
            className="glass-input"
            data-testid="mf-tx-search"
            placeholder={t('minhasfinancas.tx_search_placeholder')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={{ width: '100%', padding: '0.6rem 0.8rem 0.6rem 2.3rem' }}
          />
        </div>
        <MFSelect
          testId="mf-tx-filter-status"
          value={status}
          onChange={setStatus}
          searchable={false}
          placeholder={t('minhasfinancas.tx_status_any')}
          options={[
            { value: 'all', label: t('minhasfinancas.tx_status_any') },
            { value: 'PAGO', label: t('minhasfinancas.status_pago') },
            { value: 'PENDENTE', label: t('minhasfinancas.status_pendente') },
            { value: 'CANCELADO', label: t('minhasfinancas.status_cancelado') },
          ]}
          style={{ width: 'auto', padding: '0.6rem 0.8rem' }}
        />
        <MFSelect
          testId="mf-tx-filter-type"
          value={type}
          onChange={setType}
          searchable={false}
          placeholder={t('minhasfinancas.tx_type_any')}
          options={[
            { value: 'all', label: t('minhasfinancas.tx_type_any') },
            { value: 'RECEITA', label: t('minhasfinancas.type_receita') },
            { value: 'DESPESA', label: t('minhasfinancas.type_despesa') },
            { value: 'TRANSFERENCIA', label: t('minhasfinancas.statement_transfer') },
          ]}
          style={{ width: 'auto', padding: '0.6rem 0.8rem' }}
        />
        <MFSelect
          testId="mf-tx-filter-account"
          value={accountFilter}
          onChange={setAccountFilter}
          placeholder={t('minhasfinancas.statement_all_accounts')}
          options={[
            { value: 'all', label: t('minhasfinancas.statement_all_accounts') },
            ...accounts
              .filter((account) => !account.archived_at || account.id === accountFilter)
              .map((account) => ({
                value: account.id,
                label: account.name,
                color: account.color,
              })),
          ]}
          style={{ width: 'auto', padding: '0.6rem 0.8rem' }}
        />
        <MFSelect
          testId="mf-tx-filter-category"
          value={categoryFilter}
          onChange={setCategoryFilter}
          placeholder={t('minhasfinancas.tx_category_any')}
          options={[
            { value: 'all', label: t('minhasfinancas.tx_category_any') },
            ...categories.map((cat) => ({
              value: cat.id,
              label: cat.parent_id ? `└ ${cat.name}` : cat.name,
            })),
          ]}
          style={{ width: 'auto', padding: '0.6rem 0.8rem' }}
        />
        <MFSelect
          testId="mf-tx-filter-tag"
          value={tagFilter}
          onChange={setTagFilter}
          placeholder={t('minhasfinancas.tx_tag_any')}
          options={[
            { value: 'all', label: t('minhasfinancas.tx_tag_any') },
            ...tags.map((tag) => ({ value: tag.id, label: `# ${tag.name}` })),
          ]}
          style={{ width: 'auto', padding: '0.6rem 0.8rem' }}
        />
      </div>

      {/* Barra de edição em lote */}
      {selected.length > 0 && (
        <div
          className="glass-card"
          data-testid="mf-tx-bulk-bar"
          style={{
            padding: '0.8rem 1rem',
            display: 'flex',
            gap: '0.6rem',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <strong style={{ fontSize: '0.85rem' }}>
            {t('minhasfinancas.tx_selected', { count: selected.length })}
          </strong>
          <button
            type="button"
            className="btn-secondary"
            data-testid="mf-tx-bulk-pay"
            onClick={handleBulkPay}
            style={{ padding: '0.45rem 0.8rem', fontSize: '0.8rem' }}
          >
            <CheckCircle size={14} /> {t('minhasfinancas.tx_bulk_pay')}
          </button>
          <MFSelect
            testId="mf-tx-bulk-category"
            value=""
            onChange={handleBulkCategory}
            placeholder={t('minhasfinancas.tx_bulk_category')}
            options={[
              { value: '', label: t('minhasfinancas.tx_bulk_category') },
              ...categories.map((cat) => ({
                value: cat.id,
                label: cat.parent_id ? `└ ${cat.name}` : cat.name,
              })),
            ]}
            style={{ width: 'auto', padding: '0.45rem 0.7rem', fontSize: '0.8rem' }}
          />
          <button
            type="button"
            className="btn-secondary"
            data-testid="mf-tx-bulk-delete"
            onClick={handleBulkDelete}
            style={{ padding: '0.45rem 0.8rem', fontSize: '0.8rem', color: 'var(--danger)' }}
          >
            <Trash2 size={14} /> {t('minhasfinancas.delete')}
          </button>
          <button
            type="button"
            className="btn-cancel"
            onClick={() => setSelection([])}
            style={{ padding: '0.45rem 0.8rem', fontSize: '0.8rem' }}
          >
            {t('minhasfinancas.tx_clear_selection')}
          </button>
        </div>
      )}

      {/* Estados */}
      {isError && (
        <div className="glass-card" data-testid="mf-txs-error" style={{ padding: '2rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--danger)', margin: 0 }}>{t('minhasfinancas.load_error')}</p>
        </div>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="glass-card" data-testid="mf-txs-empty" style={{ padding: '3rem 2rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', margin: '0 0 1.25rem' }}>
            {t('minhasfinancas.tx_empty')}
          </p>
          <MFAddMenu
            items={['expense', 'cardExpense', 'income', 'transfer']}
            onSelect={handleAdd}
            label={t('minhasfinancas.tx_new')}
            triggerTestId="mf-new-tx-empty"
            testId="mf-new-tx-empty-menu"
            triggerStyle={{ padding: '0.65rem 1rem', fontSize: '0.85rem' }}
          />
        </div>
      )}

      {/* Tabela */}
      {(isLoading || filtered.length > 0) && (
        <div className="glass-card" style={{ padding: '0.5rem', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 940 }}>
            <thead>
              <tr>
                <th
                  style={{
                    ...cellBase,
                    textAlign: 'left',
                    width: 34,
                    borderBottom: '1px solid var(--glass-border)',
                  }}
                >
                  <input
                    type="checkbox"
                    data-testid="mf-tx-select-all"
                    aria-label={t('minhasfinancas.tx_select_all')}
                    checked={
                      filtered.length > 0 && filtered.every((tx) => selected.includes(tx.id))
                    }
                    onChange={toggleAll}
                  />
                </th>
                {headers.map((header) => (
                  <th
                    key={header.label}
                    style={{
                      ...cellBase,
                      textAlign: header.align,
                      fontSize: '0.72rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: 'var(--text-muted)',
                      borderBottom: '1px solid var(--glass-border)',
                    }}
                  >
                    {header.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody data-testid="mf-txs-body">
              {isLoading && (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      ...cellBase,
                      borderBottom: '1px solid var(--glass-border)',
                      textAlign: 'center',
                      padding: '2rem 1rem',
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                        color: 'var(--text-muted)',
                        fontSize: '0.9rem',
                      }}
                    >
                      <Loader2 size={18} className="animate-spin" />
                      {t('minhasfinancas.loading')}
                    </span>
                  </td>
                </tr>
              )}

              {!isLoading &&
                filtered.map((tx) => {
                  const account = accountById[tx.account_id];
                  const category = tx.category_id ? categoryById[tx.category_id] : null;
                  const txTagIds = tagIdsByTx[tx.id] || [];
                  const delta = deltaOf(tx);
                  const isTransfer = tx.type === 'TRANSFERENCIA';
                  const canEstorno =
                    tx.type === 'DESPESA' && tx.status === 'PAGO' && Number(tx.amount) > 0;
                  return (
                    <tr key={tx.id} data-testid="mf-tx-row" className="table-row-hover">
                      <td
                        style={{
                          ...cellBase,
                          borderBottom: '1px solid var(--glass-border)',
                          textAlign: 'left',
                        }}
                      >
                        <input
                          type="checkbox"
                          data-testid={`mf-tx-select-${tx.id}`}
                          aria-label={tx.description}
                          checked={selected.includes(tx.id)}
                          onChange={() => toggleSelect(tx.id)}
                        />
                      </td>
                      <td
                        style={{
                          ...cellBase,
                          textAlign: 'right',
                          borderBottom: '1px solid var(--glass-border)',
                          color: 'var(--text-muted)',
                          fontSize: '0.8rem',
                        }}
                      >
                        {formatDate(tx.payment_date)}
                      </td>
                      <td
                        style={{
                          ...cellBase,
                          textAlign: 'left',
                          borderBottom: '1px solid var(--glass-border)',
                          fontWeight: 700,
                          maxWidth: 340,
                          whiteSpace: 'normal',
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                          {`${tx.description}${mfInstallmentSuffix(tx)}`}
                          {category && (
                            <span
                              data-testid="mf-tx-category-badge"
                              style={{
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                color: category.color || 'var(--text-muted)',
                                border: '1px solid var(--glass-border)',
                                borderRadius: 6,
                                padding: '0.05rem 0.4rem',
                              }}
                            >
                              {category.name}
                            </span>
                          )}
                          {txTagIds.map((tagId) => (
                            <span
                              key={tagId}
                              data-testid="mf-tx-tag-badge"
                              style={{
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                color: tagById[tagId]?.color || 'var(--primary)',
                                border: '1px solid var(--glass-border)',
                                borderRadius: 6,
                                padding: '0.05rem 0.4rem',
                              }}
                            >
                              # {tagById[tagId]?.name ?? '—'}
                            </span>
                          ))}
                          {tx.installments_total > 1 && (
                            <span
                              data-testid="mf-tx-installment-badge"
                              style={{
                                fontSize: '0.66rem',
                                fontWeight: 800,
                                color: 'var(--text-muted)',
                                border: '1px solid var(--glass-border)',
                                borderRadius: 6,
                                padding: '0.05rem 0.35rem',
                              }}
                            >
                              {tx.installments_current}/{tx.installments_total}
                            </span>
                          )}
                          {tx.is_fixed ? (
                            <span
                              data-testid="mf-tx-fixed-badge"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.2rem',
                                fontSize: '0.66rem',
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                letterSpacing: '0.04em',
                                color: '#8b5cf6',
                                background: 'color-mix(in srgb, #8b5cf6 12%, transparent)',
                                border: '1px solid color-mix(in srgb, #8b5cf6 35%, transparent)',
                                borderRadius: 6,
                                padding: '0.05rem 0.4rem',
                              }}
                            >
                              <Repeat size={11} />
                              {t('minhasfinancas.tx_fixed_badge')}
                            </span>
                          ) : (
                            tx.recurrence &&
                            tx.recurrence !== 'NONE' && (
                              <Repeat size={12} style={{ color: 'var(--text-muted)' }} />
                            )
                          )}
                          {tx.attachment_path && (
                            <Paperclip size={12} style={{ color: 'var(--text-muted)' }} />
                          )}
                        </span>
                      </td>
                      <td
                        style={{
                          ...cellBase,
                          textAlign: 'left',
                          borderBottom: '1px solid var(--glass-border)',
                          color: 'var(--text-muted)',
                          fontSize: '0.8rem',
                        }}
                      >
                        {account?.name ?? '—'}
                        {account?.currency && account.currency !== 'BRL'
                          ? ` (${account.currency})`
                          : ''}
                      </td>
                      <td
                        style={{
                          ...cellBase,
                          textAlign: 'right',
                          borderBottom: '1px solid var(--glass-border)',
                        }}
                      >
                        <span style={badge(statusColor[tx.status] || 'var(--text-muted)')} data-testid="mf-tx-status-badge">
                          {t(`minhasfinancas.status_${String(tx.status).toLowerCase()}`)}
                        </span>
                      </td>
                      <td
                        style={{
                          ...cellBase,
                          textAlign: 'right',
                          borderBottom: '1px solid var(--glass-border)',
                          fontWeight: 800,
                          color:
                            tx.status === 'CANCELADO'
                              ? 'var(--text-muted)'
                              : isTransfer
                                ? 'var(--text-main)'
                                : (delta ?? 0) > 0
                                ? '#10b981'
                                : '#ef4444',
                          textDecoration:
                            tx.status === 'CANCELADO' ? 'line-through' : undefined,
                        }}
                      >
                        <span data-testid="mf-tx-row-amount">
                          {tx.status === 'CANCELADO'
                            ? ''
                            : isTransfer
                              ? '⇄ '
                              : (delta ?? 0) > 0
                                ? '+ '
                                : '− '}
                          {showValues
                            ? formatMoney(Math.abs(Number(tx.amount) || 0), account?.currency || 'BRL')
                            : '•••'}
                        </span>
                      </td>
                      <td
                        style={{
                          ...cellBase,
                          textAlign: 'right',
                          borderBottom: '1px solid var(--glass-border)',
                        }}
                      >
                        <span style={{ display: 'inline-flex', gap: '0.3rem' }}>
                          <button
                            type="button"
                            className="icon-btn"
                            data-testid={`mf-tx-pay-${tx.id}`}
                            aria-label={tx.status === 'PAGO' ? t('minhasfinancas.tx_unpay') : t('minhasfinancas.tx_pay')}
                            title={tx.status === 'PAGO' ? t('minhasfinancas.tx_unpay') : t('minhasfinancas.tx_pay')}
                            onClick={() => handleTogglePaid(tx)}
                          >
                            <CheckCircle
                              size={15}
                              style={{ color: tx.status === 'PAGO' ? '#10b981' : 'var(--text-muted)' }}
                            />
                          </button>
                          {canEstorno && (
                            <button
                              type="button"
                              className="icon-btn"
                              data-testid={`mf-tx-estorno-${tx.id}`}
                              aria-label={t('minhasfinancas.tx_estorno')}
                              title={t('minhasfinancas.tx_estorno')}
                              onClick={() => handleEstorno(tx)}
                            >
                              <RotateCcw size={15} />
                            </button>
                          )}
                          {tx.installments_total > 1 && tx.status !== 'CANCELADO' && (
                            <button
                              type="button"
                              className="icon-btn"
                              data-testid={`mf-tx-anticipate-${tx.id}`}
                              aria-label={t('minhasfinancas.anticipate_action')}
                              title={t('minhasfinancas.anticipate_action')}
                              onClick={() => setAnticipateTx(tx)}
                            >
                              <FastForward size={15} />
                            </button>
                          )}
                          <button
                            type="button"
                            className="icon-btn"
                            data-testid={`mf-tx-edit-${tx.id}`}
                            aria-label={t('minhasfinancas.edit')}
                            onClick={() => openEdit(tx)}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            data-testid={`mf-tx-email-${tx.id}`}
                            aria-label={t('minhasfinancas.email_send')}
                            title={t('minhasfinancas.email_send')}
                            onClick={() =>
                              openEmail(tx, category?.name ?? '')
                            }
                            style={{ color: tx.email_sent ? 'var(--primary)' : 'var(--text-muted)' }}
                          >
                            <Send size={15} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            data-testid={`mf-tx-delete-${tx.id}`}
                            aria-label={t('minhasfinancas.delete')}
                            onClick={() => handleDelete(tx)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
            {!isLoading && filtered.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={2} style={{ ...cellBase, textAlign: 'left', fontWeight: 800, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    {t('minhasfinancas.tx_totals', { count: filtered.length })}
                  </td>
                  <td
                    colSpan={3}
                    style={{ ...cellBase, textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.8rem' }}
                  >
                    {t('minhasfinancas.tx_total_income')}: <strong style={{ color: '#10b981' }}>{totals.receitas}</strong>{' '}
                    · {t('minhasfinancas.tx_total_expense')}: <strong style={{ color: '#ef4444' }}>{totals.despesas}</strong>
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Antecipação de parcelas: escolher quantas + desconto */}
      {anticipateTx && (
        <MFAnticipateModal
          tx={anticipateTx}
          user={user}
          currency={accountById[anticipateTx.account_id]?.currency || 'BRL'}
          onClose={() => setAnticipateTx(null)}
        />
      )}

      {/* Série fixa: escopo da exclusão (este mês / daqui em diante / tudo) */}
      {choice?.kind === 'fixedDelete' && (
        <MFChoiceDialog
          testId="mf-fixed-delete-dialog"
          title={t('minhasfinancas.tx_delete_fixed_title')}
          body={t('minhasfinancas.tx_delete_fixed_body')}
          options={[
            {
              key: 'one',
              label: t('minhasfinancas.tx_delete_fixed_one'),
              testId: 'mf-fixed-delete-one',
            },
            {
              key: 'from',
              label: t('minhasfinancas.tx_delete_fixed_from'),
              testId: 'mf-fixed-delete-from',
            },
            {
              key: 'all',
              label: t('minhasfinancas.tx_delete_fixed_all'),
              testId: 'mf-fixed-delete-all',
            },
          ]}
          onOption={onFixedDeleteChoice}
          onClose={() => setChoice(null)}
        />
      )}

      {/* Série parcelada: escopo da exclusão + renumerar restantes */}
      {choice?.kind === 'instDelete' && (
        <MFChoiceDialog
          testId="mf-inst-delete-dialog"
          title={t('minhasfinancas.tx_delete_fixed_title')}
          body={t('minhasfinancas.tx_delete_fixed_body')}
          options={[
            {
              key: 'one',
              label: t('minhasfinancas.tx_delete_scope_one'),
              testId: 'mf-inst-delete-one',
            },
            {
              key: 'from',
              label: t('minhasfinancas.tx_delete_scope_from'),
              testId: 'mf-inst-delete-from',
            },
            {
              key: 'all',
              label: t('minhasfinancas.tx_delete_scope_all'),
              testId: 'mf-inst-delete-all',
            },
          ]}
          checkbox={{
            label: t('minhasfinancas.tx_delete_renumber'),
            testId: 'mf-inst-delete-renumber',
          }}
          onOption={onInstDeleteChoice}
          onClose={() => setChoice(null)}
        />
      )}

      {/* Enviar comprovante: escolha do destinatário */}
      {emailTarget && (
        <MFEmailModal
          tx={emailTarget.tx}
          categoryName={emailTarget.categoryName}
          onClose={() => setEmailTarget(null)}
        />
      )}

      {/* Série fixa: onde contabilizar a efetivação feita em outro mês */}
      {choice?.kind === 'settle' && (
        <MFChoiceDialog
          testId="mf-settle-dialog"
          title={t('minhasfinancas.settle_title')}
          body={[t('minhasfinancas.settle_body1'), t('minhasfinancas.settle_body2')]}
          options={[
            { key: 'due', label: t('minhasfinancas.settle_due'), testId: 'mf-settle-due' },
            {
              key: 'now',
              label: t('minhasfinancas.settle_now', { month: currentMonthLabel(i18n) }),
              testId: 'mf-settle-now',
              variant: 'primary',
            },
          ]}
          onOption={onSettleChoice}
          onClose={() => setChoice(null)}
        />
      )}

      {/* Transferência pelo menu "+" (só contas: origem → destino) */}
      <MFTransferModal
        isOpen={transferOpen}
        accounts={accounts.filter(
          (row) => !row.archived_at && row.account_type !== 'CARTAO'
        )}
        user={user}
        onClose={() => setTransferOpen(false)}
      />
    </div>
  );
}
