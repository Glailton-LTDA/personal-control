import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  XAxis,
  YAxis,
  AreaChart,
  Area,
  ResponsiveContainer,
} from 'recharts';
import {
  ArrowLeft,
  ArrowDown,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowUp,
  ChevronDown,
  Wallet,
  Pencil,
  Archive,
  ArchiveRestore,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { confirmToast } from '../../lib/toast';
import { supabase } from '../../lib/supabase';
import {
  useMFLancamentos,
  useMFAccounts,
  useMFCategories,
  useMFAccountTransactions,
  useUpdateAccount,
  useDeleteAccount,
  buildCardInvoices,
  monthRefISO,
  monthBounds,
  prevMonthKey,
  shiftMonth,
  computeMovementSplit,
  cardExpenseMonth,
  formatMoney,
  formatMonthLabel,
  currentMonthKey,
} from '../../hooks/useMinhasFinancas';
import MFMonthNav from './MFMonthNav';
import MFTransacaoScreen from './MFTransacaoScreen';
import MFTxDetailModal from './MFTxDetailModal';
import MFAccountIcon from './MFAccountIcon';
import MFCategoryAvatar from './MFCategoryAvatar';
import MFCardInvoices from './MFCardInvoices';
import MFPaymentModal from './MFPaymentModal';
import MFAddMenu from './MFAddMenu';
import MFTransferModal from './MFTransferModal';
import MFAdjustBalanceModal from './MFAdjustBalanceModal';
import MFStatementTimeline from './MFStatementTimeline';

/** Status possíveis de fatura (chips de cartões vinculados). */
const INVOICE_STATUS = {
  PAGA: { key: 'minhasfinancas.card_status_paid', color: '#10b981' },
  AGENDADA: { key: 'minhasfinancas.card_status_scheduled', color: 'var(--primary)' },
  EM_ABERTO: { key: 'minhasfinancas.card_status_open', color: '#f59e0b' },
  VENCIDA: { key: 'minhasfinancas.card_status_overdue', color: '#ef4444' },
  CORRENTE: { key: 'minhasfinancas.card_status_current', color: 'var(--primary)' },
};

const sectionTitle = {
  margin: '0 0 0.6rem',
  fontSize: '0.78rem',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--text-muted)',
};

/** Paleta das fatias/categorias (mesma do Resumo) + estilo do tooltip. */
const DET_CHART_COLORS = [
  '#6366f1',
  '#06b6d4',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#84cc16',
];
const chartTooltipStyle = {
  background: 'var(--glass-bg, #1e293b)',
  border: '1px solid var(--glass-border)',
  borderRadius: 8,
  fontSize: 12,
};

const miniBadge = {
  fontSize: '0.66rem',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  border: '1px solid var(--glass-border)',
  borderRadius: '6px',
  padding: '0.05rem 0.4rem',
  color: 'var(--text-muted)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.25rem',
};


/**
 * Drill-down de conta: movimentações do mês selecionado separadas em
 * agendado (PENDENTE) e realizado (PAGO), com navegação mês a mês.
 * O saldo/previsão/receitas/despesas vêm do resumo do mês (mesma fonte
 * da tabela de Contas). Clique num lançamento abre MFTransacaoScreen e o
 * botão "Novo lançamento" cria um lançamento já com esta conta. No
 * cabeçalho, editar (quando o contexto oferece), arquivar e excluir
 * fazem as ações da própria conta.
 */
export default function MFAccountDetail({
  account,
  user,
  monthKey = currentMonthKey(),
  onChangeMonth = () => {},
  showValues = true,
  onClose = () => {},
  onEdit = null,
}) {
  const { t, i18n } = useTranslation();
  const { data: lanc } = useMFLancamentos(user, monthKey);
  const { data: categories = [] } = useMFCategories(user);
  const { data: accounts = [] } = useMFAccounts(user);
  const updateMutation = useUpdateAccount();
  const deleteMutation = useDeleteAccount();
  const [editing, setEditing] = useState(null);
  const [screenOpen, setScreenOpen] = useState(false);
  // Detalhes do lançamento (modal resumo + menu ⋮; editar abre a tela).
  const [detailTx, setDetailTx] = useState(null);
  // Pagamento de fatura de cartão vinculado: { card, invoice } no modal.
  const [paying, setPaying] = useState(null);
  // Opção escolhida no menu "+" contextual (expense | income |
  // cardExpense | estorno) — transferência abre o modal dedicado.
  const [addKind, setAddKind] = useState(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  // Abas mobile (Transações primeiro); no desktop as colunas aparecem juntas.
  const [mobileTab, setMobileTab] = useState('transacoes');
  const [movementOpen, setMovementOpen] = useState(true);

  // FAB global do container: some enquanto o detalhe está aberto
  // (as entradas de criação são o botão local + menu contextual).
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('mf-detail-context', {
        detail: { scope: account.account_type === 'CARTAO' ? 'cartao' : 'contas' },
      })
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent('mf-detail-context', { detail: { scope: null } })
      );
    };
  }, [account.account_type]);

  /** Menu contextual: conta → despesa/receita/transferência; cartão →
   *  despesa no cartão/estorno (regra aprovada). */
  const addItems =
    account.account_type === 'CARTAO'
      ? ['cardExpense', 'estorno']
      : ['expense', 'income', 'transfer'];

  const handleAdd = (kind) => {
    if (kind === 'transfer') {
      setTransferOpen(true);
      return;
    }
    setEditing(null);
    setAddKind(kind);
    setScreenOpen(true);
  };

  /** Ações da conta no detalhe (mesmo comportamento da tabela de Contas). */
  const handleArchive = async () => {
    const archiving = !account.archived_at;
    try {
      await updateMutation.mutateAsync({
        id: account.id,
        archived_at: archiving ? new Date().toISOString() : null,
      });
      toast.success(
        t(archiving ? 'minhasfinancas.archived_done' : 'minhasfinancas.unarchived_done')
      );
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    }
  };

  const handleDelete = () => {
    confirmToast(
      t('minhasfinancas.delete_account_confirm', { name: account.name }),
      async () => {
        try {
          await deleteMutation.mutateAsync(account.id);
          toast.success(t('minhasfinancas.account_deleted'));
          onClose();
        } catch {
          toast.error(t('minhasfinancas.account_in_use'));
        }
      },
      { danger: true, confirmText: t('minhasfinancas.delete') }
    );
  };


  // Cartões vinculados (faturas visíveis na conta) + pagamento de fatura.
  // Escopo enxuto: só esta conta + cartões vinculados (origem ou destino)
  // em vez das ~13 mil linhas de todas — saldos, 12 meses, timeline e
  // faturas usam só esse recorte.
  const linkedCardIds = useMemo(
    () =>
      accounts
        .filter(
          (row) =>
            row.account_type === 'CARTAO' &&
            row.linked_account_id === account.id &&
            !row.archived_at
        )
        .map((row) => row.id),
    [accounts, account.id]
  );
  const {
    data: allTx = [],
    isLoading: allTxLoading,
    isError: allTxError,
    refetch: refetchAllTx,
  } = useMFAccountTransactions(user, account.id, linkedCardIds);

  const refISO = monthRefISO(monthKey);
  const linkedInvoices = useMemo(() => {
    if (account.account_type === 'CARTAO') return [];
    return accounts
      .filter(
        (row) =>
          row.account_type === 'CARTAO' &&
          row.linked_account_id === account.id &&
          !row.archived_at
      )
      .map((card) => {
        const { current, invoices } = buildCardInvoices({
          card,
          transactions: allTx,
          refISO,
          monthKey,
        });
        const active =
          // 1) fatura em aberto mais antiga (é o que falta pagar);
          // 2) corrente com movimento; 3) última fechada com valor
          // (quitada mostra o total + PAGA em vez de zero);
          // 4) corrente vazia.
          invoices.find((inv) => inv.openAmount > 0) ??
          ((Number(current.total) || 0) > 0
            ? current
            : invoices.find((inv) => (Number(inv.total) || 0) > 0) ?? current);
        return { card, active };
      });
  }, [account, accounts, allTx, refISO, monthKey]);

  /** Abre o modal de pagamento (total ou parcial) da fatura do cartão vinculado. */
  const handlePayLinked = (card, invoice) => {
    if (!card.linked_account_id) {
      toast.error(t('minhasfinancas.card_link_required'));
      return;
    }
    setPaying({ card, invoice });
  };


  // Rótulo do tipo ("Conta corrente"): chave i18n p/ códigos padrão,
  // nome cru p/ tipos personalizados (o valor já é o nome).
  const typeKey = `minhasfinancas.type_${String(account.account_type ?? '').toLowerCase()}`;
  const translatedType = t(typeKey);
  const typeLabel = translatedType === typeKey ? account.account_type : translatedType;

  // MOVIMENTAÇÃO do mês: efetivadas (PAGO) × pendentes por tipo/direção.
  const { start: monthStart, end: monthEnd } = monthBounds(monthKey);
  const movement = useMemo(
    // Extrato completo (não o recorte do mês): despesa de cartão conta no
    // mês da fatura, como na timeline.
    () => computeMovementSplit(allTx ?? [], account.id, monthStart, monthEnd, accounts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allTx, accounts, account.id, monthKey]
  );

  // Cartão: Saldo/Previsão pela fatura (despesa de cartão conta no mês da
  // fatura, como no extrato) — usa o allTx completo. Demais contas seguem
  // o saldo do mês (hook).
  const cardBalance = useMemo(() => {
    if (account.account_type !== 'CARTAO') return null;
    const viewMonth = monthKey.slice(0, 7);
    const byId = new Map(accounts.map((row) => [row.id, row]));
    let saldoMov = 0;
    let pendenteMov = 0;
    (allTx ?? []).forEach((tx) => {
      if (tx.status === 'CANCELADO') return;
      const amount = Number(tx.amount) || 0;
      if (tx.type === 'TRANSFERENCIA') {
        if (tx.payment_date > monthEnd) return;
        if (tx.account_id === account.id) {
          if (tx.status === 'PAGO') saldoMov -= amount;
          else pendenteMov -= amount;
        }
        if (tx.transfer_account_id === account.id) {
          if (tx.status === 'PAGO') saldoMov += amount;
          else pendenteMov += amount;
        }
        return;
      }
      if (tx.account_id !== account.id) return;
      const inScope =
        tx.type === 'DESPESA' && tx.invoice_close
          ? cardExpenseMonth(tx, byId) <= viewMonth
          : tx.payment_date <= monthEnd;
      if (!inScope) return;
      const delta = tx.type === 'RECEITA' ? amount : -amount;
      if (tx.status === 'PAGO') saldoMov += delta;
      else pendenteMov += delta;
    });
    const saldo = Math.round(((Number(account.initial_balance) || 0) + saldoMov) * 100) / 100;
    return { saldo, previsto: Math.round((saldo + pendenteMov) * 100) / 100 };
  }, [allTx, accounts, account, monthKey, monthEnd]);

  // Fechamento do mês anterior (inicial + pago até lá): base do aviso de
  // saldo inicial customizado (padrão do app original). Despesa de cartão
  // conta no mês da fatura, como no extrato.
  const prevClose = useMemo(() => {
    const prevEnd = monthBounds(prevMonthKey(monthKey)).end;
    const prevMonth = prevMonthKey(monthKey);
    const byId = new Map(accounts.map((row) => [row.id, row]));
    let close = Number(account.initial_balance) || 0;
    (allTx ?? []).forEach((tx) => {
      if (tx.status !== 'PAGO') return;
      const amount = Number(tx.amount) || 0;
      if (tx.type === 'TRANSFERENCIA') {
        if (tx.account_id === account.id && tx.payment_date <= prevEnd) close -= amount;
        if (tx.transfer_account_id === account.id && tx.payment_date <= prevEnd) close += amount;
        return;
      }
      if (tx.account_id !== account.id) return;
      if (tx.type === 'DESPESA' && tx.invoice_close) {
        if (cardExpenseMonth(tx, byId) > prevMonth) return;
      } else if (tx.payment_date > prevEnd) return;
      close += tx.type === 'RECEITA' ? amount : -amount;
    });
    return Math.round(close * 100) / 100;
  }, [allTx, accounts, account, monthKey]);

  const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
  const categoryById = useMemo(
    () => Object.fromEntries((categories || []).map((row) => [row.id, row])),
    [categories]
  );

  // — Gráficos do detalhe (Fase 2): fluxo de caixa, pizza por categoria,
  //   últimos 12 meses e últimas despesas (padrão do app original). —
  const cashflow = useMemo(() => {
    const entradas = round2(movement.receitas.pago + movement.transfIn.pago);
    const entradasTotal = round2(entradas + movement.receitas.pendente + movement.transfIn.pendente);
    const saidas = round2(movement.despesas.pago + movement.transfOut.pago);
    const saidasTotal = round2(saidas + movement.despesas.pendente + movement.transfOut.pendente);
    return [
      { id: 'in', label: t('minhasfinancas.det_cf_in'), value: entradas, pago: entradas, total: entradasTotal, color: '#10b981' },
      { id: 'out', label: t('minhasfinancas.det_cf_out'), value: saidas, pago: saidas, total: saidasTotal, color: '#ef4444' },
      {
        id: 'balance',
        label: t('minhasfinancas.det_cf_balance'),
        value: round2(Number(account.saldo) || 0),
        pago: 0,
        total: 0,
        color: 'var(--primary)',
      },
    ];
  }, [movement, account, t]);

  const pieData = useMemo(() => {
    const byCat = {};
    (lanc?.transactions ?? []).forEach((tx) => {
      if (tx.account_id !== account.id || tx.type !== 'DESPESA' || tx.status !== 'PAGO') return;
      const amount = Number(tx.amount) || 0;
      if (!(amount > 0)) return;
      const id = tx.category_id || 'none';
      byCat[id] = (byCat[id] || 0) + amount;
    });
    const total = Object.values(byCat).reduce((sum, value) => sum + value, 0);
    const sorted = Object.entries(byCat)
      .map(([id, value]) => ({
        id,
        value: round2(value),
        name:
          id === 'none'
            ? t('minhasfinancas.chart_uncategorized')
            : categoryById[id]?.name ?? t('minhasfinancas.chart_uncategorized'),
      }))
      .sort((a, b) => b.value - a.value);
    const top = sorted.slice(0, 6);
    const rest = sorted.slice(6).reduce((sum, item) => sum + item.value, 0);
    return {
      total: round2(total),
      items:
        rest > 0
          ? [...top, { id: 'other', value: round2(rest), name: t('common.other') }]
          : top,
    };
  }, [lanc, account.id, categoryById, t]);

  const monthShort = (mk) => {
    const [year, month] = mk.split('-').map(Number);
    try {
      return new Intl.DateTimeFormat(i18n.language, { month: 'short' })
        .format(new Date(year, month - 1, 1))
        .replace('.', '');
    } catch {
      return `${month}`.padStart(2, '0');
    }
  };

  const last12 = useMemo(() => {
    const points = [];
    for (let index = 11; index >= 0; index -= 1) {
      const mk = shiftMonth(monthKey, -index);
      const end = monthBounds(mk).end;
      let bal = Number(account.initial_balance) || 0;
      (allTx ?? []).forEach((tx) => {
        if (tx.status !== 'PAGO') return;
        if (tx.payment_date > end) return;
        const amount = Number(tx.amount) || 0;
        if (tx.type === 'TRANSFERENCIA') {
          if (tx.account_id === account.id) bal -= amount;
          if (tx.transfer_account_id === account.id) bal += amount;
        } else if (tx.account_id === account.id) {
          bal += tx.type === 'RECEITA' ? amount : -amount;
        }
      });
      points.push({ key: mk, label: monthShort(mk), saldo: round2(bal) });
    }
    return points;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTx, account, monthKey]);
  const hasHistory =
    (Number(account.initial_balance) || 0) !== 0 ||
    (allTx ?? []).some(
      (tx) =>
        tx.status !== 'CANCELADO' &&
        (tx.account_id === account.id || tx.transfer_account_id === account.id)
    );

  const latest = useMemo(
    () =>
      (lanc?.transactions ?? [])
        .filter(
          (tx) =>
            tx.account_id === account.id &&
            tx.type === 'DESPESA' &&
            tx.status !== 'CANCELADO'
        )
        .sort(
          (a, b) =>
            String(b.payment_date || '').localeCompare(String(a.payment_date || '')) ||
            String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))
        )
        .slice(0, 5),
    [lanc, account.id]
  );
  const shownSaldo =
    account.account_type === 'CARTAO' && cardBalance ? cardBalance.saldo : Number(account.saldo) || 0;
  const shownPrevisto =
    account.account_type === 'CARTAO' && cardBalance
      ? cardBalance.previsto
      : Number(account.previsto) || 0;
  const noInitial = round2(shownSaldo - (Number(account.initial_balance) || 0));
  const initialValue = round2(Number(account.initial_balance) || 0);
  // Cartão com inicial zerado (padrão): a dívida acumulada sempre difere
  // de zero — avisar "customizado" seria falso. Só avisa no cartão com
  // inicial diferente de zero.
  const showInitialWarning =
    initialValue !== prevClose && (account.account_type !== 'CARTAO' || initialValue !== 0);

  /** Vai ao extrato: no mobile troca para a aba Transações. */
  const gotoTimeline = () => {
    setMobileTab('transacoes');
    document.getElementById('mf-det-timeline')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  const money = (value) => (showValues ? formatMoney(value, account.currency) : '•••');


  /**
   * Abre os Detalhes do lançamento (linhas do detalhe e da fatura do
   * cartão). Enquanto os lançamentos do mês não carregam, busca os
   * vínculos direto — senão o salvar apaga as tags (deleteLinks
   * recria os links a partir de tx.tagIds).
   */
  const openTx = async (tx) => {
    let tagIds = lanc ? lanc.tagIdsByTx?.[tx.id] ?? [] : null;
    if (tagIds === null) {
      try {
        const { data } = await supabase
          .from('mf_transaction_tags')
          .select('tag_id')
          .eq('transaction_id', tx.id);
        tagIds = (data ?? []).map((row) => row.tag_id);
      } catch {
        tagIds = [];
      }
    }
    setDetailTx({ ...tx, tagIds });
  };

  /** Do modal Detalhes → tela completa de edição. */
  const openFullEdit = (tx) => {
    setDetailTx(null);
    setEditing(tx);
    setScreenOpen(true);
  };



  // Modal de criação/edição de lançamento (mesmo padrão da conta — montado
  // no body via portal, então o backdrop-filter do glass-card não o prende).
  const creating = !editing;
  const estorno = creating && addKind === 'estorno';
  const scope = creating
    ? estorno || addKind === 'cardExpense'
      ? 'cartao'
      : 'contas'
    : 'all';

  return (
    <div
      className="glass-card"
      data-testid="mf-account-detail"
      style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
    >
      {/* Cabeçalho: voltar + conta + mês */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
          <button
            type="button"
            className="icon-btn"
            data-testid="mf-acct-det-back"
            aria-label={t('minhasfinancas.acct_det_back')}
            title={t('minhasfinancas.acct_det_back')}
            onClick={onClose}
          >
            <ArrowLeft size={18} />
          </button>
          <MFAccountIcon
            account={account}
            size={28}
            data-testid="mf-acct-det-icon"
            style={{ flexShrink: 0 }}
          />
          <div style={{ minWidth: 0 }}>
            <h3
              style={{
                margin: 0,
                fontSize: '1.05rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                flexWrap: 'wrap',
              }}
            >
              {account.name}
              <span style={miniBadge}>{account.currency}</span>
              {typeLabel && (
                <span style={{ ...miniBadge, textTransform: 'none', letterSpacing: 0 }}>
                  {typeLabel}
                </span>
              )}
            </h3>
            <p style={{ margin: '0.15rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              {formatMonthLabel(monthKey, i18n.language)}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Ações da conta: editar (quando o contexto oferece), arquivar e excluir */}
          <div style={{ display: 'flex', gap: '0.3rem' }}>
            {onEdit && (
              <button
                type="button"
                className="icon-btn"
                data-testid="mf-acct-det-edit"
                aria-label={t('minhasfinancas.edit')}
                title={t('minhasfinancas.edit')}
                onClick={() => onEdit(account)}
              >
                <Pencil size={16} />
              </button>
            )}
            <button
              type="button"
              className="icon-btn"
              data-testid="mf-acct-det-archive"
              aria-label={t(
                account.archived_at ? 'minhasfinancas.unarchive' : 'minhasfinancas.archive'
              )}
              title={t(
                account.archived_at ? 'minhasfinancas.unarchive' : 'minhasfinancas.archive'
              )}
              onClick={handleArchive}
            >
              {account.archived_at ? <ArchiveRestore size={16} /> : <Archive size={16} />}
            </button>
            <button
              type="button"
              className="icon-btn"
              data-testid="mf-acct-det-delete"
              aria-label={t('minhasfinancas.delete')}
              title={t('minhasfinancas.delete')}
              onClick={handleDelete}
              style={{ color: 'var(--danger)' }}
            >
              <Trash2 size={16} />
            </button>
          </div>
          <MFAddMenu
            items={addItems}
            onSelect={handleAdd}
            label={t('minhasfinancas.tx_new')}
            triggerTestId="mf-acct-det-new-tx"
            testId="mf-acct-det-add-menu"
            triggerStyle={{ padding: '0.6rem 1rem', fontSize: '0.85rem' }}
          />
          <MFMonthNav monthKey={monthKey} onChange={onChangeMonth} />
        </div>
      </div>

      {/* Abas mobile: Transações primeiro; no desktop ficam ocultas */}
      <div className="mf-det-tabs" role="tablist" aria-label={account.name}>
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === 'transacoes'}
          data-testid="mf-det-tab-transacoes"
          onClick={() => setMobileTab('transacoes')}
          className={`mf-det-tab${mobileTab === 'transacoes' ? ' mf-det-tab-active' : ''}`}
        >
          {t('minhasfinancas.det_tab_transactions')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === 'resumo'}
          data-testid="mf-det-tab-resumo"
          onClick={() => setMobileTab('resumo')}
          className={`mf-det-tab${mobileTab === 'resumo' ? ' mf-det-tab-active' : ''}`}
        >
          {t('minhasfinancas.det_tab_summary')}
        </button>
      </div>

      <div className="mf-det-grid">
        <div
          className={`mf-det-panel${mobileTab === 'resumo' ? ' mf-det-active' : ''}`}
          data-testid="mf-det-panel-resumo"
          data-panel="resumo"
        >
      {/* Resumo do mês: saldo inicial + movimentação + saldos (padrão original) */}
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--glass-border)',
          borderRadius: 12,
          padding: '0.9rem 1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.7rem',
        }}
      >
        {/* Cartão não tem saldo (só fatura/limite): esconde o bloco de
            conta — Saldo inicial, Saldo/Previsão, aviso e Reajustar. */}
        {account.account_type !== 'CARTAO' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
            <span style={{ fontWeight: 800 }}>{t('minhasfinancas.accounts_table_initial')}</span>
            <strong data-testid="mf-acct-det-initial" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {money(account.initial_balance)}
            </strong>
          </div>
        )}

        <section data-testid="mf-det-movement">
          <button
            type="button"
            data-testid="mf-det-movement-toggle"
            aria-expanded={movementOpen}
            onClick={() => setMovementOpen((prev) => !prev)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: 'inherit',
              font: 'inherit',
              fontSize: '0.78rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {t('minhasfinancas.movement_title')}
            <ChevronDown
              size={15}
              aria-hidden
              style={{
                transform: movementOpen ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.15s',
              }}
            />
          </button>
          {movementOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginTop: '0.6rem' }}>
              {[
                {
                  id: 'receitas',
                  label: t('minhasfinancas.movement_income'),
                  Icon: ArrowDown,
                  color: '#10b981',
                  data: movement.receitas,
                },
                // Cartão não tem crédito de pagamento (a fatura é paga por
                // despesa na conta vinculada): esconde as transferências.
                ...(account.account_type === 'CARTAO'
                  ? []
                  : [
                      {
                        id: 'transfIn',
                        label: t('minhasfinancas.movement_transf_in'),
                        Icon: ArrowDownLeft,
                        color: '#10b981',
                        data: movement.transfIn,
                      },
                      {
                        id: 'transfOut',
                        label: t('minhasfinancas.movement_transf_out'),
                        Icon: ArrowUpRight,
                        color: '#ef4444',
                        data: movement.transfOut,
                      },
                    ]),
                {
                  id: 'despesas',
                  label: t('minhasfinancas.movement_expense'),
                  Icon: ArrowUp,
                  color: '#ef4444',
                  data: movement.despesas,
                },
              ].map((row) => (
                <div
                  key={row.id}
                  data-testid={`mf-det-movement-${row.id}`}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      background: `color-mix(in srgb, ${row.color} 14%, transparent)`,
                      color: row.color,
                    }}
                  >
                    <row.Icon size={15} />
                  </span>
                  <span style={{ fontWeight: 700, flex: 1 }}>{row.label}</span>
                  <span style={{ textAlign: 'right', fontSize: '0.82rem' }}>
                    <span style={{ display: 'block', color: 'var(--text-muted)' }}>
                      {t('minhasfinancas.movement_paid')}:{' '}
                      <strong style={{ color: row.color, fontVariantNumeric: 'tabular-nums' }}>
                        {money(row.data.pago)}
                      </strong>
                    </span>
                    <span style={{ display: 'block', color: 'var(--text-muted)' }}>
                      {t('minhasfinancas.movement_pending')}:{' '}
                      <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {money(row.data.pendente)}
                      </strong>
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {account.account_type !== 'CARTAO' && (
          <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '0.7rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
              <span style={{ fontSize: '1rem', fontWeight: 800 }}>{t('minhasfinancas.accounts_table_balance')}</span>
              <strong data-testid="mf-acct-det-chip-balance" style={{ fontSize: '1.15rem', fontVariantNumeric: 'tabular-nums' }}>
                {money(shownSaldo)}
              </strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              <span>{t('minhasfinancas.accounts_table_forecast')}</span>
              <span data-testid="mf-acct-det-chip-forecast" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {money(shownPrevisto)}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              <span>{t('minhasfinancas.balance_no_initial')}</span>
              <span data-testid="mf-acct-det-chip-no-initial" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {money(noInitial)}
              </span>
            </div>
          </div>
        )}

        {account.account_type !== 'CARTAO' && showInitialWarning && (
          <p
            data-testid="mf-det-initial-warning"
            style={{
              margin: 0,
              padding: '0.7rem 0.85rem',
              fontSize: '0.8rem',
              borderRadius: 10,
              background: 'color-mix(in srgb, #f59e0b 12%, transparent)',
              border: '1px solid color-mix(in srgb, #f59e0b 40%, transparent)',
              color: 'var(--text-main)',
            }}
          >
            {t('minhasfinancas.initial_mismatch', { value: money(prevClose) })}
          </p>
        )}

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-secondary"
            data-testid="mf-det-goto-statement"
            onClick={gotoTimeline}
            style={{ padding: '0.6rem 1rem', fontSize: '0.85rem', flex: 1 }}
          >
            {t('nav.sub.minhasfinancas.statement')}
          </button>
          {account.account_type !== 'CARTAO' && (
            <button
              type="button"
              className="btn-secondary"
              data-testid="mf-acct-det-adjust"
              onClick={() => setAdjustOpen(true)}
              style={{ padding: '0.6rem 1rem', fontSize: '0.85rem', flex: 1 }}
            >
              {t('minhasfinancas.adjust_title')}
            </button>
          )}
        </div>
      </div>

      {/* Cartão: faturas (chips, detalhe, pagar/antecipar) */}
      {account.account_type === 'CARTAO' && (
        <section data-testid="mf-acct-det-invoices">
          <h4 style={sectionTitle}>{t('minhasfinancas.acct_det_invoices')}</h4>
          <MFCardInvoices
            card={account}
            user={user}
            showValues={showValues}
            monthKey={monthKey}
            onEditTx={openTx}
            onManualTx={() => handleAdd('cardExpense')}
            onOpenTransfer={() => setTransferOpen(true)}
          />
        </section>
      )}

      {/* Conta: faturas dos cartões vinculados ficam visíveis aqui */}
      {linkedInvoices.length > 0 && (
        <section data-testid="mf-acct-det-linked-cards">
          <h4 style={sectionTitle}>{t('minhasfinancas.cards_linked')}</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {linkedInvoices.map(({ card, active }) => {
              const status = INVOICE_STATUS[active.status] ?? INVOICE_STATUS.CORRENTE;
              // Valor da fatura (bruto); o botão Pagar some quando não há
              // mais o que pagar — em aberto OU agendado (item 30: com o
              // espelho PENDENTE, a confirmação reajusta a MESMA linha).
              const invTotal = Number(active.total) || 0;
              const owed =
                (Number(active.openAmount) || 0) + (Number(active.pendingBound) || 0);
              const fmtShort = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');
              return (
                <div
                  key={card.id}
                  data-testid={`mf-linked-card-${card.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    flexWrap: 'wrap',
                    padding: '0.7rem 0.85rem',
                    border: '1px solid var(--glass-border)',
                    borderRadius: 12,
                    background: 'rgba(255, 255, 255, 0.02)',
                  }}
                >
                  <MFAccountIcon
                    account={card}
                    size={30}
                    data-testid={`mf-linked-card-icon-${card.id}`}
                  />
                  <div style={{ flex: '1 1 130px', minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: '0.92rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {card.name}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {active.status === 'CORRENTE'
                        ? `${t('minhasfinancas.card_current')}${active.dueISO ? ` · ${formatMonthLabel(active.dueISO.slice(0, 7), i18n.language)} · ${t('minhasfinancas.card_due')} ${fmtShort(active.dueISO)}` : ''}`
                        : `${active.dueISO ? `${formatMonthLabel(active.dueISO.slice(0, 7), i18n.language)} · ` : ''}${t('minhasfinancas.card_due')} ${fmtShort(active.dueISO)}`}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div
                      style={{ fontWeight: 800, fontSize: '1.1rem' }}
                      data-testid={`mf-linked-card-amount-${card.id}`}
                    >
                      {showValues ? formatMoney(invTotal, card.currency || 'BRL') : '•••'}
                    </div>
                    <span
                      data-testid={`mf-linked-card-status-${card.id}`}
                      style={{
                        fontSize: '0.66rem',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        color: status.color,
                        background: `color-mix(in srgb, ${status.color} 12%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${status.color} 35%, transparent)`,
                        borderRadius: 999,
                        padding: '0.1rem 0.55rem',
                      }}
                    >
                      {t(status.key)}
                    </span>
                  </div>
                  {owed > 0 && (
                    <button
                      type="button"
                      data-testid={`mf-linked-card-pay-${card.id}`}
                      onClick={() => handlePayLinked(card, active)}
                      style={{
                        flexBasis: '100%',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                        marginTop: '0.35rem',
                        padding: '0.6rem',
                        borderRadius: 10,
                        border: '1px solid var(--danger)',
                        background: 'transparent',
                        color: 'var(--danger)',
                        fontSize: '0.85rem',
                        fontWeight: 800,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                      }}
                    >
                      <Wallet size={14} />
                      {t(
                        active.status === 'CORRENTE'
                          ? 'minhasfinancas.card_anticipate'
                          : 'minhasfinancas.card_pay'
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

        {/* Gráficos do detalhe (Fase 2, padrão do app original) */}
        <section
          data-testid="mf-det-cashflow"
          style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid var(--glass-border)',
            borderRadius: 12,
            padding: '0.9rem 1rem',
          }}
        >
          <h4 style={sectionTitle}>{t('minhasfinancas.det_cashflow')}</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
            {[
              { id: 'in', label: t('minhasfinancas.det_cf_in'), value: cashflow[0].value, pago: cashflow[0].pago, total: cashflow[0].total, color: '#10b981', bg: 'linear-gradient(135deg, #10b981, #059669)' },
              { id: 'out', label: t('minhasfinancas.det_cf_out'), value: cashflow[1].value, pago: cashflow[1].pago, total: cashflow[1].total, color: '#ef4444', bg: 'linear-gradient(135deg, #ef4444, #dc2626)' },
            ].map((card) => {
              const pct = card.total > 0 ? Math.round((card.pago / card.total) * 100) : 100;
              return (
                <div
                  key={card.id}
                  style={{
                    background: card.bg,
                    borderRadius: 16,
                    padding: '0.9rem 1rem',
                    color: '#fff',
                  }}
                >
                  <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.9 }}>
                    {card.label}
                  </div>
                  <div style={{ fontSize: '0.8rem', marginTop: '0.35rem', opacity: 0.9, fontVariantNumeric: 'tabular-nums' }}>
                    {money(card.value)}
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                    {pct}%
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.3)', marginTop: '0.45rem', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: '#fff', borderRadius: 999 }} />
                  </div>
                  <div style={{ fontSize: '0.7rem', marginTop: '0.3rem', opacity: 0.85 }}>
                    {pct}% {t('minhasfinancas.det_cf_of_forecast')}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section
          data-testid="mf-det-categories"
          style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid var(--glass-border)',
            borderRadius: 12,
            padding: '0.9rem 1rem',
          }}
        >
          <h4 style={sectionTitle}>{t('minhasfinancas.chart_categories')}</h4>
          <p style={{ margin: '-0.4rem 0 0.6rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {t('minhasfinancas.det_in_month', { month: formatMonthLabel(monthKey, i18n.language) })}
          </p>
          {pieData.total > 0 ? (
            <>
              <div style={{ position: 'relative', height: 210 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData.items}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={85}
                      paddingAngle={2}
                      isAnimationActive={false}
                    >
                      {pieData.items.map((entry, index) => (
                        <Cell
                          key={entry.id}
                          fill={entry.color || DET_CHART_COLORS[index % DET_CHART_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => money(value)} contentStyle={chartTooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div
                  data-testid="mf-det-categories-total"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                  }}
                >
                  <strong style={{ fontSize: '1.05rem', fontVariantNumeric: 'tabular-nums' }}>
                    {money(pieData.total)}
                  </strong>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Total</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.6rem' }}>
                {pieData.items.map((entry, index) => {
                  const color =
                    entry.color || DET_CHART_COLORS[index % DET_CHART_COLORS.length];
                  const pct = pieData.total > 0 ? Math.round((entry.value / pieData.total) * 100) : 0;
                  const category =
                    entry.id === 'none' || entry.id === 'other'
                      ? null
                      : categoryById[entry.id] ?? null;
                  return (
                    <div key={entry.id} data-testid={`mf-det-cat-row-${entry.id}`} style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', fontSize: '0.82rem' }}>
                      {category ? (
                        <MFCategoryAvatar category={category} size={24} />
                      ) : (
                        <span
                          aria-hidden
                          style={{ width: 24, height: 24, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }}
                        />
                      )}
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.name}
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                        {pct}% · {money(entry.value)}
                      </span>
                      <span style={{ width: 56, height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', flexShrink: 0 }}>
                        <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: color }} />
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p data-testid="mf-det-categories-empty" style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              {t('minhasfinancas.chart_no_data')}
            </p>
          )}
        </section>

        <section
          data-testid="mf-det-12m"
          style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid var(--glass-border)',
            borderRadius: 12,
            padding: '0.9rem 1rem',
          }}
        >
          <h4 style={sectionTitle}>{t('minhasfinancas.det_last12')}</h4>
          {hasHistory ? (
            <div style={{ height: 190 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={last12} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <XAxis dataKey="label" fontSize={10} tickLine={false} axisLine={false} interval={2} />
                  <YAxis hide />
                  <Tooltip formatter={(value) => money(value)} contentStyle={chartTooltipStyle} />
                  <Area
                    type="monotone"
                    dataKey="saldo"
                    stroke="var(--primary)"
                    fill="var(--primary)"
                    fillOpacity={0.18}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p data-testid="mf-det-12m-empty" style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              {t('minhasfinancas.chart_no_data')}
            </p>
          )}
        </section>

        {latest.length > 0 && (
          <section
            data-testid="mf-det-latest"
            style={{
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--glass-border)',
              borderRadius: 12,
              padding: '0.9rem 1rem',
            }}
          >
            <h4 style={sectionTitle}>{t('minhasfinancas.det_latest')}</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              {latest.map((tx) => {
                const value = Number(tx.amount) || 0;
                const refund = value < 0;
                const category = tx.category_id ? categoryById[tx.category_id] ?? null : null;
                const time = typeof tx.created_at === 'string' && tx.created_at.length >= 16
                  ? tx.created_at.slice(11, 16)
                  : null;
                return (
                  <div
                    key={tx.id}
                    data-testid={`mf-det-latest-${tx.id}`}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', fontSize: '0.85rem' }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: refund ? '#10b981' : '#ef4444',
                        flexShrink: 0,
                      }}
                    />
                    {category ? (
                      <MFCategoryAvatar category={category} size={30} />
                    ) : (
                      <MFCategoryAvatar category={null} size={30} />
                    )}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tx.description || '—'}
                      </span>
                      <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {tx.payment_date ? `${tx.payment_date.slice(8, 10)}/${tx.payment_date.slice(5, 7)}` : '—'}
                        {time ? ` · ${time}` : ''}
                      </span>
                    </span>
                    <span style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span style={{ display: 'block', fontWeight: 800, color: refund ? '#10b981' : '#ef4444', fontVariantNumeric: 'tabular-nums' }}>
                        {money(refund ? Math.abs(value) : -Math.abs(value))}
                      </span>
                      {refund && (
                        <span style={{ fontSize: '0.66rem', fontWeight: 800, color: '#10b981', border: '1px solid #10b981', borderRadius: 6, padding: '0.05rem 0.35rem' }}>
                          {t('minhasfinancas.tx_estornada')}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}
        </div>

        <div
          id="mf-det-timeline"
          className={`mf-det-panel${mobileTab === 'transacoes' ? ' mf-det-active' : ''}`}
          data-testid="mf-det-panel-transacoes"
          data-panel="transacoes"
          style={{ minWidth: 0 }}
        >
          <MFStatementTimeline
            account={account}
            user={user}
            monthKey={monthKey}
            showValues={showValues}
            onOpenTx={openTx}
            transactions={allTx}
            accounts={accounts}
            txLoading={allTxLoading}
            txError={allTxError}
            onRetry={() => refetchAllTx()}
          />
        </div>
      </div>


      {/* Pagamento de fatura de cartão vinculado (total ou parcial) */}
      {paying && (
        <MFPaymentModal
          card={paying.card}
          invoice={paying.invoice}
          user={user}
          onClose={() => setPaying(null)}
        />
      )}

      {/* Transferência pelo menu "+" (conta: despesa/receita/transferência) */}
      <MFTransferModal
        isOpen={transferOpen}
        accounts={accounts.filter(
          (row) => !row.archived_at && row.account_type !== 'CARTAO'
        )}
        user={user}
        onClose={() => setTransferOpen(false)}
      />

      {/* Reajustar saldo da conta (no mês visado: hoje no mês atual,
          último dia nos demais — igual ao monthRefISO) */}
      {adjustOpen && (
        <MFAdjustBalanceModal
          account={account}
          user={user}
          current={Number(account.saldo) || 0}
          payDate={monthRefISO(monthKey)}
          allowInitial
          onClose={() => setAdjustOpen(false)}
          onManual={(d) =>
            handleAdd(account.account_type === 'CARTAO' ? 'cardExpense' : d > 0 ? 'income' : 'expense')
          }
          onTransfer={() => setTransferOpen(true)}
        />
      )}

      {/* Modal de criação/edição de lançamento */}
      {screenOpen && (
        <MFTransacaoScreen
          tx={editing}
          user={user}
          defaultAccountId={account.id}
          defaultType={creating && addKind === 'income' ? 'RECEITA' : 'DESPESA'}
          accountScope={scope}
          mode={estorno ? 'estorno' : 'normal'}
          invoiceMonthKey={monthKey}
          onClose={() => {
            setScreenOpen(false);
            setAddKind(null);
          }}
        />
      )}

      {/* Detalhes do lançamento (resumo + menu ⋮) */}
      {detailTx && (
        <MFTxDetailModal
          tx={detailTx}
          tagIds={detailTx.tagIds || []}
          user={user}
          onClose={() => setDetailTx(null)}
          onEditFull={openFullEdit}
        />
      )}
    </div>
  );
}
