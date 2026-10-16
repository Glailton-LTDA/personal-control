import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Pencil, Trash2, MoreVertical, Check, Tag, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { confirmToast } from '../../lib/toast';
import { supabase } from '../../lib/supabase';
import { mfMutate } from '../../lib/offline/mfOffline';
import {
  useMFAccounts,
  useMFCategories,
  useMFTags,
  useCreateMFTag,
  useCreateMFCategory,
  useMFAccountTransactions,
  useCreateMFTransaction,
  useUpdateMFTransaction,
  useDeleteMFTransaction,
  useBulkMFTransactions,
  useInstallmentDelete,
  useDeleteMFFixedSeries,
  useMFSetTransactionStatus,
  buildCardInvoices,
  buildEstornoTx,
  cardCycles,
  fetchInstallmentSeries,
  installmentHeadId,
  isParceladaTx,
  isRecurrentTx,
  orderSeries,
  formatMoney,
  parseMoney,
  toISODate,
  monthRefISO,
  currentMonthKey,
  invoiceCloseForDueMonth,
  shiftMonth,
  cardExpenseMonth,
} from '../../hooks/useMinhasFinancas';
import MFChoiceDialog from './MFChoiceDialog';
import MFCalculator from './MFCalculator';
import MFCategorySelect from './MFCategorySelect';
import { mfNormalize, MF_CATEGORY_COLORS } from './MFCategoryIcons';
import MFAccountIcon from './MFAccountIcon';
import MFAccountSelect from './MFAccountSelect';
import MFSelect from './MFSelect';
import MFCardAnticipateModal from './MFCardAnticipateModal';
import MFAnticipateModal from './MFAnticipateModal';

const INV_STATUS = {
  PAGA: { key: 'minhasfinancas.card_status_paid', color: '#10b981' },
  AGENDADA: { key: 'minhasfinancas.card_status_scheduled', color: 'var(--primary)' },
  EM_ABERTO: { key: 'minhasfinancas.card_status_open', color: '#f59e0b' },
  VENCIDA: { key: 'minhasfinancas.card_status_overdue', color: '#ef4444' },
  CORRENTE: { key: 'minhasfinancas.card_status_current', color: 'var(--primary)' },
};

const rowLabel = {
  fontSize: '0.85rem',
  color: 'var(--text-muted)',
};

const rowValue = {
  fontSize: '0.85rem',
  fontWeight: 700,
  textAlign: 'right',
};

const sectionTitle = {
  margin: '1rem 0 0.5rem',
  fontSize: '0.78rem',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--text-muted)',
};

const block = {
  background: 'rgba(255, 255, 255, 0.03)',
  border: '1px solid var(--glass-border)',
  borderRadius: 12,
  padding: '0.8rem 1rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.45rem',
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = String(iso).split('-');
  return `${d}/${m}/${y}`;
};

const fmtTime = (iso) => {
  if (!iso || !String(iso).includes('T')) return '';
  const time = String(iso).split('T')[1] || '';
  return time.slice(0, 5);
};

/**
 * Modal "Detalhes" do lançamento (padrão do app original): resumo, edição
 * rápida (lápis ao lado da descrição), ações (editar completo, excluir) e
 * menu ⋮ com as operações da despesa — Alterar Valor, Duplicar, Visualizar
 * parcelas, Antecipar parcelas (só se parcelada), Transformar em débito,
 * Mover para a próxima fatura e Estornar (só cartão).
 */
export default function MFTxDetailModal({ tx, tagIds = [], user, onClose, onEditFull }) {
  const { t } = useTranslation();
  const { data: accounts = [] } = useMFAccounts(user);
  const { data: categories = [] } = useMFCategories(user);
  const { data: tags = [] } = useMFTags(user);
  const createMutation = useCreateMFTransaction();
  const updateMutation = useUpdateMFTransaction();
  const deleteMutation = useDeleteMFTransaction();
  const bulkMutation = useBulkMFTransactions();
  const instDelete = useInstallmentDelete();
  const deleteFixedMutation = useDeleteMFFixedSeries();
  const setStatusMutation = useMFSetTransactionStatus();
  const createTagMutation = useCreateMFTag();
  const createCategoryMutation = useCreateMFCategory();

  const [menuOpen, setMenuOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [showParcels, setShowParcels] = useState(false);
  const [scopeAction, setScopeAction] = useState(null); // { action }
  const [calcOpen, setCalcOpen] = useState(false); // calculadora de valor
  const [pendingValue, setPendingValue] = useState(''); // valor confirmado aguardando escopo
  // Duplicar como outra natureza: 'card' | 'transfer' | 'comp'.
  const [dupeSub, setDupeSub] = useState(false);
  const [dupeScopeKind, setDupeScopeKind] = useState(null); // kind aguardando escopo (comp)
  const [dupeForm, setDupeForm] = useState(null); // { kind, scope } + destino
  const [dupeTarget, setDupeTarget] = useState(''); // conta/cartão destino
  const [dupeClose, setDupeClose] = useState(''); // fatura destino (cartão)
  const [anticipateOpen, setAnticipateOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edição rápida (descrição, observações, categoria, tags).
  const [quickDesc, setQuickDesc] = useState(tx?.description ?? '');
  const [quickNotes, setQuickNotes] = useState(tx?.notes ?? '');
  const [quickCategory, setQuickCategory] = useState(tx?.category_id ?? '');
  const [quickTags, setQuickTags] = useState(Array.isArray(tagIds) ? tagIds : []);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [quickTagSearch, setQuickTagSearch] = useState('');
  useEffect(() => {
    setQuickDesc(tx?.description ?? '');
    setQuickNotes(tx?.notes ?? '');
    setQuickCategory(tx?.category_id ?? '');
    setQuickTags(Array.isArray(tagIds) ? tagIds : []);
    setTagsOpen(false);
    setNewTag('');
    setQuickTagSearch('');
    setMenuOpen(false);
    setDupeSub(false);
    setQuickOpen(false);
    setShowParcels(false);
    setScopeAction(null);
    setCalcOpen(false);
    setPendingValue('');
    setLocalTx(null);
    setDupeScopeKind(null);
    setDupeForm(null);
    setDupeTarget('');
    setDupeClose('');
    setAnticipateOpen(false);
  }, [tx?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const accountById = useMemo(
    () => Object.fromEntries(accounts.map((acc) => [acc.id, acc])),
    [accounts]
  );
  const categoryById = useMemo(
    () => Object.fromEntries(categories.map((cat) => [cat.id, cat])),
    [categories]
  );
  const account = tx ? (accountById[tx.account_id] ?? null) : null;
  // Escopo enxuto: conta do lançamento + contrapartes (vinculada e
  // cartões ligados) em vez das ~13 mil linhas. Cobre a série (mesma
  // conta), as fixas e a fatura do cartão; séries hipotéticas em outra
  // conta caem nos fallbacks graceful já existentes.
  const txScopeIds = useMemo(() => {
    if (!tx) return [];
    const ids = new Set([tx.account_id, tx.transfer_account_id]);
    const acc = accountById[tx.account_id];
    if (acc?.linked_account_id) ids.add(acc.linked_account_id);
    accounts.forEach((row) => {
      if (row.account_type === 'CARTAO' && row.linked_account_id === tx.account_id) {
        ids.add(row.id);
      }
    });
    return [...ids].filter(Boolean);
  }, [tx, accounts, accountById]);
  const { data: allTx = [] } = useMFAccountTransactions(user, null, txScopeIds);
  const isCard = account?.account_type === 'CARTAO';
  const isTransfer = tx?.type === 'TRANSFERENCIA';
  const parcelada = isParceladaTx(tx);
  const headId = installmentHeadId(tx);

  /** Série da parcela (cabeça + filhas) para totais e escopo. */
  const series = useMemo(() => {
    if (!tx) return [];
    if (!headId) return [tx];
    const found = orderSeries(
      allTx.filter((row) => row.id === headId || row.parent_transaction_id === headId)
    );
    // Cabeça órfã (diz N/M mas sem filhas no banco): mostra ao menos ela.
    return found.length > 0 ? found : [tx];
  }, [allTx, headId, tx]);
  /** Série incompleta: o total N/M promete mais membros que o banco tem. */
  const seriesComplete =
    series.length >= (Number(tx?.installments_total) || series.length);

  /** Série fixa (cabeça + filhas) para escopo de valor/duplicar.
   * Cobre também repetição com vínculo (semanais/anuais têm
   * parent_transaction_id sem is_fixed nem parcelas). */
  const fixedSeries = useMemo(() => {
    if (!tx) return [];
    const linked =
      tx.is_fixed || tx.parent_transaction_id || (tx.recurrence && tx.recurrence !== 'NONE');
    if (!linked) return [tx];
    const headIdFixed = tx.parent_transaction_id ?? tx.id;
    const head = tx.parent_transaction_id
      ? allTx.find((row) => row.id === tx.parent_transaction_id)
      : tx;
    const children = allTx.filter(
      (row) => row.parent_transaction_id === (head?.id ?? headIdFixed)
    );
    const list = [...(head ? [head] : []), ...children].sort((a, b) =>
      String(a.payment_date).localeCompare(String(b.payment_date))
    );
    return list.length > 0 ? list : [tx];
  }, [allTx, tx]);

  /** Fatura da despesa de cartão (situação + vencimento). */
  const invoice = useMemo(() => {
    if (!tx || !isCard || isTransfer) return null;
    const refISO = monthRefISO(currentMonthKey());
    // Com vínculo futuro (fixas criadas à frente), a fatura só existe
    // com a flag — sem ela caía no fallback da corrente.
    const built = buildCardInvoices({ card: account, transactions: allTx, refISO, includeFutureBound: true });
    const all = [built.current, ...built.invoices, ...(built.upcomingInvoices ?? [])];
    return (
      all.find((inv) => inv.closeISO === tx.invoice_close) ??
      all.find((inv) => inv.closeISO === built.current?.closeISO) ??
      null
    );
  }, [tx, isCard, isTransfer, account, allTx]);

  const money = (value, currency) => formatMoney(value, currency || account?.currency || 'BRL');
  const seriesPaid = series
    .filter((row) => row.status === 'PAGO')
    .reduce((sum, row) => sum + Math.abs(Number(row.amount) || 0), 0);
  const seriesTotal = series.reduce((sum, row) => sum + Math.abs(Number(row.amount) || 0), 0);
  const seriesPending = Math.max(0, Math.round((seriesTotal - seriesPaid) * 100) / 100);
  const progress = seriesTotal > 0 ? Math.round((seriesPaid / seriesTotal) * 100) : 0;

  const recurrenceKey = !tx
    ? 'minhasfinancas.tx_detail_rec_none'
    : tx.is_fixed
      ? 'minhasfinancas.tx_detail_rec_fixed'
      : parcelada
        ? 'minhasfinancas.tx_detail_rec_split'
        : isRecurrentTx(tx)
          ? 'minhasfinancas.tx_detail_rec_repeat'
          : 'minhasfinancas.tx_detail_rec_none';

  const cat = tx?.category_id ? categoryById[tx.category_id] : null;
  const catParent = cat?.parent_id ? categoryById[cat.parent_id] : null;

  const titleKey =
    !tx || isTransfer
      ? 'minhasfinancas.tx_detail_transfer'
      : tx.type === 'RECEITA'
        ? 'minhasfinancas.tx_detail_income'
        : 'minhasfinancas.tx_detail_expense';

  /** Membros do escopo escolhido (só esta / esta e próximas / todas). */
  const scopeMembers = (scope) => {
    const list = headId ? series : fixedSeries.length > 1 ? fixedSeries : [tx];
    if (scope === 'all' || list.length <= 1) return list;
    if (scope === 'from') {
      return list.filter((row) => String(row.payment_date) >= String(tx.payment_date));
    }
    return list.filter((row) => row.id === tx.id);
  };
  const needsScope = headId || fixedSeries.length > 1;
  // Espelho local do lançamento (edição rápida / valor): o `tx` vindo do
  // pai é um snapshot da abertura — sem isso o modal seguia mostrando o
  // valor/nome antigo após salvar, até fechar e reabrir.
  const [localTx, setLocalTx] = useState(null);
  const viewTx = localTx && localTx.id === tx?.id ? { ...tx, ...localTx } : tx;

  const askScopeOrRun = (action) => {
    setMenuOpen(false);
    if (action === 'value') {
      // Calculadora primeiro; o escopo da série é perguntado depois do ✓.
      setCalcOpen(true);
      return;
    }
    if (needsScope && action !== 'anticipate') {
      setScopeAction({ action });
      return;
    }
    runAction(action, 'one');
  };

  const onScopeOption = (key) => {
    const action = scopeAction?.action;
    setScopeAction(null);
    if (!action) return;
    if (action === 'value') {
      runAction('value', key, pendingValue);
      return;
    }
    if (action === 'quick') {
      runQuickSave(key);
      return;
    }
    runAction(action, key);
  };

  /** ✓ da calculadora: série pergunta escopo; avulso aplica na hora. */
  const onValueConfirm = (value) => {
    setCalcOpen(false);
    setPendingValue(value);
    if (needsScope) {
      setScopeAction({ action: 'value' });
      return;
    }
    runAction('value', 'one', value);
  };

  /** "Outubro, 2026" no idioma do app (rótulos de fatura). */
  const dupeMonthYear = (iso) => {
    if (!iso) return '—';
    const [y, m] = iso.split('-').map(Number);
    try {
      const month = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(
        new Date(y, m - 1, 1)
      );
      return `${month.charAt(0).toUpperCase() + month.slice(1)}, ${y}`;
    } catch {
      return `${String(m).padStart(2, '0')}/${y}`;
    }
  };

  /** Mês/ano da fatura de uma parcela (vencimento) ou do lançamento. */
  const parcelInvoiceMonth = (row) => {
    const acc = row?.account_id ? accountById[row.account_id] : null;
    if (row?.invoice_close && acc?.account_type === 'CARTAO') {
      const C = Number(acc.closing_day) || 1;
      const D = Number(acc.due_day) || 10;
      const dueKey = shiftMonth(String(row.invoice_close).slice(0, 7), D >= C ? 0 : 1);
      return dupeMonthYear(`${dueKey}-01`);
    }
    return dupeMonthYear(row?.payment_date);
  };

  /** Duplicar como outra natureza: submenu → escopo → destino. */
  const dupeCards = useMemo(
    () => accounts.filter((acc) => acc.account_type === 'CARTAO' && !acc.archived_at),
    [accounts]
  );
  const dupeAccounts = useMemo(
    () => accounts.filter((acc) => acc.account_type !== 'CARTAO' && !acc.archived_at),
    [accounts]
  );
  const dupeTargetCard = dupeCards.find((acc) => acc.id === dupeTarget) ?? null;
  const dupeCycles = useMemo(() => {
    if (!dupeTargetCard) return [];
    return cardCycles(dupeTargetCard, toISODate(new Date()), 13, 12)
      .slice()
      .sort((a, b) => a.closeISO.localeCompare(b.closeISO));
  }, [dupeTargetCard]);

  const onDupeKind = (kind) => {
    setDupeSub(false);
    setMenuOpen(false);
    if (needsScope) {
      setDupeScopeKind(kind);
      return;
    }
    openDupeForm(kind, 'one');
  };

  const openDupeForm = (kind, scope) => {
    setDupeScopeKind(null);
    if (kind === 'comp') {
      runDuplicateAs(kind, scope, {});
      return;
    }
    if (kind === 'card') {
      const first = dupeCards[0] ?? null;
      setDupeTarget(first?.id ?? '');
      setDupeClose(
        first ? invoiceCloseForDueMonth(first, toISODate(new Date()).slice(0, 7)) : ''
      );
    } else {
      const effectiveOrigin =
        accountById[tx?.account_id]?.account_type === 'CARTAO'
          ? accountById[tx?.account_id]?.linked_account_id
          : tx?.account_id;
      const first =
        dupeAccounts.find((acc) => acc.id !== effectiveOrigin) ?? dupeAccounts[0] ?? null;
      setDupeTarget(first?.id ?? '');
      setDupeClose('');
    }
    setDupeForm({ kind, scope });
  };

  const runDuplicateAs = async (kind, scope, target) => {
    const members = scopeMembers(scope);
    if (members.length === 0) return;
    setSaving(true);
    try {
      let copies = [];
      if (kind === 'card') {
        const cardId = target.accountId;
        const close = target.close;
        if (!cardId || !close) {
          toast.error(t('minhasfinancas.tx_account_required'));
          return;
        }
        copies = members.map((row) => ({
          user_id: row.user_id,
          account_id: cardId,
          type: 'DESPESA',
          description: row.description,
          amount: row.amount,
          payment_date: row.payment_date,
          due_date: null,
          effective_date: row.payment_date,
          status: 'PAGO',
          category_id: row.category_id ?? null,
          notes: row.notes ?? null,
          attachment_path: null,
          recurrence: 'NONE',
          is_fixed: false,
          parent_transaction_id: null,
          installments_current: null,
          installments_total: null,
          invoice_close: close,
        }));
      } else if (kind === 'transfer') {
        const destId = target.accountId;
        if (!destId) {
          toast.error(t('minhasfinancas.tx_account_required'));
          return;
        }
        copies = [];
        for (const row of members) {
          const originId =
            row.type === 'TRANSFERENCIA'
              ? row.account_id
              : accountById[row.account_id]?.account_type === 'CARTAO'
                ? accountById[row.account_id]?.linked_account_id
                : row.account_id;
          if (!originId) {
            toast.error(t('minhasfinancas.card_link_required'));
            return;
          }
          copies.push({
            user_id: row.user_id,
            account_id: originId,
            transfer_account_id: destId,
            type: 'TRANSFERENCIA',
            description: row.description,
            amount: Math.abs(Number(row.amount) || 0),
            payment_date: row.payment_date,
            due_date: row.due_date ?? null,
            effective_date: row.status === 'PAGO' ? row.payment_date : null,
            status: row.status,
            category_id: row.category_id ?? null,
            notes: row.notes ?? null,
            attachment_path: null,
            recurrence: 'NONE',
          });
        }
      } else {
        // Compensação: espelho que zera o efeito financeiro.
        copies = members.map((row) => {
          const base = {
            user_id: row.user_id,
            description: row.description,
            amount: row.amount,
            payment_date: row.payment_date,
            due_date: row.due_date ?? null,
            effective_date: row.status === 'PAGO' ? row.payment_date : null,
            status: row.status,
            category_id: row.category_id ?? null,
            notes: row.notes ?? null,
            attachment_path: null,
            recurrence: 'NONE',
            is_fixed: false,
            parent_transaction_id: null,
            installments_current: null,
            installments_total: null,
          };
          if (row.type === 'TRANSFERENCIA') {
            return {
              ...base,
              type: 'TRANSFERENCIA',
              account_id: row.transfer_account_id,
              transfer_account_id: row.account_id,
              amount: Math.abs(Number(row.amount) || 0),
            };
          }
          if (row.type === 'RECEITA') {
            return { ...base, type: 'DESPESA', account_id: row.account_id };
          }
          if (accountById[row.account_id]?.account_type === 'CARTAO') {
            return {
              ...base,
              type: 'DESPESA',
              account_id: row.account_id,
              amount: -Math.abs(Number(row.amount) || 0),
              invoice_close: row.invoice_close ?? null,
            };
          }
          return { ...base, type: 'RECEITA', account_id: row.account_id };
        });
      }
      await createMutation.mutateAsync(copies);
      toast.success(t('minhasfinancas.tx_detail_duplicated'));
      setDupeForm(null);
      onClose();
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (action, scope, valueOverride) => {
    if (action === 'delete') {
      if (tx.is_fixed) {
        try {
          await deleteFixedMutation.mutateAsync({ tx, mode: scope });
          toast.success(t('minhasfinancas.tx_deleted'));
          onClose();
        } catch {
          toast.error(t('minhasfinancas.save_error'));
        }
        return;
      }
      if (headId) {
        try {
          const full = await fetchInstallmentSeries(tx);
          if (full.length > 1) {
            await instDelete({ tx, scope, renumber: false });
            toast.success(t('minhasfinancas.tx_deleted'));
            onClose();
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
            onClose();
          } catch {
            toast.error(t('minhasfinancas.save_error'));
          }
        },
        { danger: true, confirmText: t('minhasfinancas.delete') }
      );
      return;
    }

    if (action === 'anticipate') {
      setAnticipateOpen(true);
      return;
    }

    if (action === 'parcels') {
      setShowParcels((prev) => !prev);
      return;
    }

    setSaving(true);
    try {
      if (action === 'value') {
        const amount = parseMoney(valueOverride ?? '');
        if (!(amount > 0)) {
          toast.error(t('minhasfinancas.tx_amount_required'));
          return;
        }
        const signed = Number(tx.amount) < 0 ? -amount : amount;
        const members = scopeMembers(scope);
        await bulkMutation.mutateAsync({
          ids: members.map((row) => row.id),
          patch: { amount: signed },
        });
        toast.success(t('minhasfinancas.tx_detail_value_updated'));
        setLocalTx({ id: tx.id, amount: signed });
        setPendingValue('');
      } else if (action === 'duplicate') {
        // Legado: substituído pelo submenu (como cartão/transferência/
        // compensação). Mantido por segurança: copia avulsa na origem.
        const members = scopeMembers(scope);
        const copies = members.map((row) => ({
          user_id: row.user_id,
          account_id: row.account_id,
          type: row.type,
          description: row.description,
          amount: row.amount,
          payment_date: row.payment_date,
          due_date: row.due_date ?? null,
          effective_date: row.status === 'PAGO' ? row.payment_date : null,
          status: row.status,
          category_id: row.category_id ?? null,
          notes: row.notes ?? null,
          attachment_path: null,
          recurrence: 'NONE',
          is_fixed: false,
          parent_transaction_id: null,
          installments_current: null,
          installments_total: null,
          invoice_close: row.invoice_close ?? null,
        }));
        await createMutation.mutateAsync(copies);
        toast.success(t('minhasfinancas.tx_detail_duplicated'));
      } else if (action === 'move') {
        const members = scopeMembers(scope);
        const byId = new Map(accounts.map((acc) => [acc.id, acc]));
        const dueMonth = cardExpenseMonth(tx, byId);
        const nextClose = invoiceCloseForDueMonth(account, shiftMonth(dueMonth, 1));
        await bulkMutation.mutateAsync({
          ids: members.map((row) => row.id),
          patch: { invoice_close: nextClose },
        });
        toast.success(t('minhasfinancas.tx_detail_moved'));
      } else if (action === 'debit') {
        if (!account?.linked_account_id) {
          toast.error(t('minhasfinancas.card_link_required'));
          return;
        }
        const members = scopeMembers(scope);
        await bulkMutation.mutateAsync({
          ids: members.map((row) => row.id),
          patch: { account_id: account.linked_account_id, invoice_close: null },
        });
        toast.success(t('minhasfinancas.tx_detail_to_debit_done'));
      } else if (action === 'estornar') {
        const members = scopeMembers(scope);
        const payloads = members.map((row) => ({
          ...buildEstornoTx({
            userId: user.id,
            tx: row,
            description: t('minhasfinancas.tx_estorno_of', { name: row.description }),
            notes: t('minhasfinancas.tx_estorno_notes', { name: row.description }),
          }),
          invoice_close: row.invoice_close ?? null,
        }));
        await createMutation.mutateAsync(payloads);
        toast.success(t('minhasfinancas.tx_detail_estornado'));
      }
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    } finally {
      setSaving(false);
    }
  };

  const handleQuickSave = async () => {
    if (!quickDesc.trim()) {
      toast.error(t('minhasfinancas.tx_desc_required'));
      return;
    }
    // Série com 2+ ocorrências: pergunta o escopo antes de gravar
    // (igual à exclusão/valor — antes salvava só esta em silêncio).
    // Parcelada (headId) pergunta de imediato; fixa/vinculada aguarda a
    // série carregada (length>1) — o usuário leva segundos digitando.
    if (needsScope && (headId || scopeMembers('all').length > 1)) {
      setQuickOpen(false);
      setScopeAction({ action: 'quick' });
      return;
    }
    await runQuickSave('one');
  };

  const runQuickSave = async (scope) => {
    const description = quickDesc.trim();
    const notes = quickNotes.trim() || null;
    const categoryId = quickCategory || null;
    setSaving(true);
    try {
      const members = scopeMembers(scope);
      const others = members.filter((row) => row.id !== tx.id);
      await updateMutation.mutateAsync({
        id: tx.id,
        description,
        notes,
        category_id: categoryId,
      });
      if (others.length > 0) {
        // Demais ocorrências: só conteúdo (datas/faturas de cada mês ficam).
        await bulkMutation.mutateAsync({
          ids: others.map((row) => row.id),
          patch: { description, notes, category_id: categoryId },
        });
      }
      const memberIds = members.map((row) => row.id);
      await mfMutate({
        table: 'mf_transaction_tags',
        action: 'deleteLinks',
        ids: memberIds,
        run: async () => {
          const { error } = await supabase
            .from('mf_transaction_tags')
            .delete()
            .in('transaction_id', memberIds);
          if (error) throw error;
          return memberIds;
        },
      });
      if (quickTags.length > 0) {
        const rows = memberIds.flatMap((transactionId) =>
          quickTags.map((tagId) => ({
            transaction_id: transactionId,
            tag_id: tagId,
            user_id: user.id,
          }))
        );
        await mfMutate({
          table: 'mf_transaction_tags',
          action: 'insert',
          payload: rows,
          run: async () => {
            const { error } = await supabase.from('mf_transaction_tags').insert(rows);
            if (error) throw error;
            return rows;
          },
        });
      }
      toast.success(t('minhasfinancas.tx_detail_saved'));
      setLocalTx({ id: tx.id, description, notes, category_id: categoryId });
      setQuickOpen(false);
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    } finally {
      setSaving(false);
    }
  };

  /** Cria tag nova na edição rápida (mesmo fluxo da tela de criação). */
  const handleAddTag = async () => {
    const name = newTag.trim();
    if (!name) return;
    if (tags.some((tag) => tag.name.toLowerCase() === name.toLowerCase())) {
      toast.error(t('minhasfinancas.tx_tag_exists'));
      return;
    }
    try {
      const created = await createTagMutation.mutateAsync({ user_id: user.id, name });
      if (created?.id) setQuickTags((prev) => [...prev, created.id]);
      setNewTag('');
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    }
  };

  /** Cria a categoria digitada na busca da edição rápida e já seleciona. */
  const handleQuickCreateCategory = async (name) => {
    const trimmed = String(name ?? '').trim();
    if (!trimmed) return;
    const txType = tx?.type ?? 'DESPESA';
    const needle = mfNormalize(trimmed);
    const dupe = categories.some(
      (cat) =>
        !cat.is_archived &&
        (cat.type === txType || cat.type === 'AMBAS') &&
        (cat.parent_id ?? null) === null &&
        mfNormalize(cat.name) === needle
    );
    if (dupe) {
      toast.error(t('minhasfinancas.cfg_duplicate_category'));
      return;
    }
    try {
      const created = await createCategoryMutation.mutateAsync({
        user_id: user.id,
        name: trimmed,
        type: txType,
        parent_id: null,
        color: MF_CATEGORY_COLORS[0],
        icon: '🏷️',
      });
      const createdRow = Array.isArray(created) ? created[0] : created;
      if (createdRow?.id) setQuickCategory(createdRow.id);
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    }
  };

  const handleTogglePaid = async () => {    try {
      if (tx.status === 'PAGO') {
        await setStatusMutation.mutateAsync({ id: tx.id, status: 'PENDENTE', effective_date: null });
      } else {
        await setStatusMutation.mutateAsync({
          id: tx.id,
          status: 'PAGO',
          effective_date: tx.effective_date || toISODate(new Date()),
        });
      }
      toast.success(t('minhasfinancas.tx_marked_paid'));
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    }
  };

  const invStatus = invoice ? (INV_STATUS[invoice.status] ?? INV_STATUS.CORRENTE) : null;
  const visibleCategories = useMemo(() => {
    const txType = tx?.type ?? 'DESPESA';
    const byType = categories.filter(
      (cat) => !cat.is_archived && (cat.type === txType || cat.type === 'AMBAS')
    );
    const parents = byType.filter((cat) => !cat.parent_id);
    const ordered = [];
    parents.forEach((parent) => {
      ordered.push(parent);
      byType.filter((cat) => cat.parent_id === parent.id).forEach((child) => ordered.push(child));
    });
    byType
      .filter((cat) => cat.parent_id && !parents.some((p) => p.id === cat.parent_id))
      .forEach((cat) => ordered.push(cat));
    return ordered;
  }, [categories, tx]);

  if (!tx) return null;

  const menuItems = [
    { key: 'edit', label: t('minhasfinancas.tx_detail_menu_edit'), testId: 'mf-tx-detail-menu-edit' },
    { key: 'delete', label: t('minhasfinancas.tx_detail_menu_delete'), testId: 'mf-tx-detail-menu-delete', danger: true },
    { key: 'value', label: t('minhasfinancas.tx_detail_menu_change_value'), testId: 'mf-tx-detail-menu-value' },
    // Duplicar (como outra natureza) só em DESPESA — receita e
    // transferência não têm essa opção.
    ...(!isTransfer && tx?.type === 'DESPESA'
      ? [{ key: 'duplicate', label: t('minhasfinancas.tx_detail_menu_duplicate'), testId: 'mf-tx-detail-menu-duplicate', arrow: true }]
      : []),
    ...(parcelada
      ? [{ key: 'parcels', label: t('minhasfinancas.tx_detail_menu_view_parcels'), testId: 'mf-tx-detail-menu-parcels' }]
      : []),
    // Antecipar parcelas só existe se a despesa for parcelada.
    ...(parcelada && isCard && !isTransfer
      ? [{ key: 'anticipate', label: t('minhasfinancas.tx_detail_menu_anticipate'), testId: 'mf-tx-detail-menu-anticipate' }]
      : []),
    ...(isCard && !isTransfer
      ? [
          { key: 'debit', label: t('minhasfinancas.tx_detail_menu_to_debit'), testId: 'mf-tx-detail-menu-debit' },
          { key: 'move', label: t('minhasfinancas.tx_detail_menu_move_next'), testId: 'mf-tx-detail-menu-move' },
          { key: 'estornar', label: t('minhasfinancas.tx_detail_menu_estornar'), testId: 'mf-tx-detail-menu-estornar' },
        ]
      : []),
    // Transferência: item Efetivada com checkbox (alterna o status).
    ...(isTransfer
      ? [{ key: 'settled', label: t('minhasfinancas.tx_detail_menu_settled'), testId: 'mf-tx-detail-menu-settled', check: tx?.status === 'PAGO' }]
      : []),
  ];

  const onMenuOption = (key) => {
    if (key === 'edit') {
      setMenuOpen(false);
      onEditFull?.({ ...tx, tagIds });
      return;
    }
    if (key === 'parcels') {
      setMenuOpen(false);
      setShowParcels((prev) => !prev);
      return;
    }
    if (key === 'duplicate') {
      // Submenu: Despesa de cartão / Transferência / Compensação.
      setDupeSub((prev) => !prev);
      return;
    }
    if (key === 'settled') {
      setMenuOpen(false);
      handleTogglePaid();
      return;
    }
    askScopeOrRun(key);
  };

  return createPortal(
    <div className="modal-overlay" data-testid="mf-tx-detail" onClick={onClose}>
      <div
        className="glass-card modal-content"
        onClick={(event) => event.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: 560 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            className="icon-btn"
            data-testid="mf-tx-detail-close"
            aria-label={t('minhasfinancas.close')}
            onClick={onClose}
          >
            <X size={22} />
          </button>
          <h3 data-testid="mf-tx-detail-title" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, flex: 1 }}>
            {t(titleKey)}
          </h3>
          <button
            type="button"
            className="icon-btn"
            data-testid="mf-tx-detail-edit"
            aria-label={t('minhasfinancas.tx_detail_menu_edit')}
            title={t('minhasfinancas.tx_detail_menu_edit')}
            onClick={() => onEditFull?.({ ...tx, tagIds })}
            style={{ color: 'var(--primary)' }}
          >
            <Pencil size={18} />
          </button>
          <button
            type="button"
            className="icon-btn"
            data-testid="mf-tx-detail-delete"
            aria-label={t('minhasfinancas.tx_detail_menu_delete')}
            title={t('minhasfinancas.tx_detail_menu_delete')}
            onClick={() => askScopeOrRun('delete')}
          >
            <Trash2 size={18} />
          </button>
          <span style={{ position: 'relative' }}>
            <button
              type="button"
              className="icon-btn"
              data-testid="mf-tx-detail-menu"
              aria-label="⋮"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((prev) => !prev)}
            >
              <MoreVertical size={18} />
            </button>
            {menuOpen && (
              <span
                data-testid="mf-tx-detail-menu-popover"
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 0.4rem)',
                  zIndex: 60,
                  minWidth: 220,
                  background: 'var(--glass-bg, #1e293b)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 12,
                  padding: '0.4rem',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
                }}
              >
                {menuItems.map((item) => (
                  <span key={item.key}>
                    <button
                      type="button"
                      data-testid={item.testId}
                      onClick={() => onMenuOption(item.key)}
                      style={{
                        background: 'none',
                        border: 'none',
                        textAlign: 'left',
                        padding: '0.55rem 0.75rem',
                        borderRadius: 8,
                        cursor: 'pointer',
                        font: 'inherit',
                        fontSize: '0.88rem',
                        color: item.danger ? '#ef4444' : 'var(--text-main)',
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.5rem',
                      }}
                    >
                      <span>
                        {item.check != null ? (item.check ? '☑ ' : '☐ ') : ''}
                        {item.label}
                      </span>
                      {item.arrow && <span aria-hidden>▸</span>}
                    </button>
                    {item.key === 'duplicate' && dupeSub && (
                      <span
                        data-testid="mf-tx-detail-dupe-submenu"
                        style={{ display: 'flex', flexDirection: 'column', paddingLeft: '0.9rem' }}
                      >
                        {[
                          { kind: 'card', label: t('minhasfinancas.tx_detail_menu_dupe_card'), testId: 'mf-tx-detail-dupe-card' },
                          { kind: 'transfer', label: t('minhasfinancas.tx_detail_menu_dupe_transfer'), testId: 'mf-tx-detail-dupe-transfer' },
                          { kind: 'comp', label: t('minhasfinancas.tx_detail_menu_dupe_comp'), testId: 'mf-tx-detail-dupe-comp' },
                        ].map((sub) => (
                          <button
                            key={sub.kind}
                            type="button"
                            data-testid={sub.testId}
                            onClick={() => onDupeKind(sub.kind)}
                            style={{
                              background: 'none',
                              border: 'none',
                              textAlign: 'left',
                              padding: '0.5rem 0.75rem',
                              borderRadius: 8,
                              cursor: 'pointer',
                              font: 'inherit',
                              fontSize: '0.85rem',
                              color: 'var(--text-main)',
                            }}
                          >
                            {sub.label}
                          </button>
                        ))}
                      </span>
                    )}
                  </span>
                ))}
              </span>
            )}
          </span>
        </div>

        {/* Descrição + valor com lápis de edição rápida */}
        <div style={{ ...block, flexDirection: 'row', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              data-testid="mf-tx-detail-desc"
              style={{ fontWeight: 800, fontSize: '1rem', overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              {viewTx.description}
            </div>
            <button
              type="button"
              data-testid="mf-tx-detail-amount"
              aria-label={t('minhasfinancas.calc_edit_value')}
              title={t('minhasfinancas.calc_edit_value')}
              onClick={() => {
                setMenuOpen(false);
                setCalcOpen(true);
              }}
              style={{
                display: 'block',
                width: '100%',
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                font: 'inherit',
                fontWeight: 800,
                fontSize: '1.25rem',
                color: viewTx.type === 'RECEITA' ? '#10b981' : '#ef4444',
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {money(Math.abs(Number(viewTx.amount) || 0))}
            </button>
          </div>
          <button
            type="button"
            className="icon-btn"
            data-testid="mf-tx-detail-quick"
            aria-label={t('minhasfinancas.tx_detail_quick')}
            title={t('minhasfinancas.tx_detail_quick')}
            onClick={() => setQuickOpen(true)}
          >
            <Pencil size={16} />
          </button>
        </div>

        <h4 style={sectionTitle}>{t('minhasfinancas.tx_detail_section_details')}</h4>
        <div style={block}>
          {isCard && !isTransfer && invoice ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
              <span style={rowLabel}>{t('minhasfinancas.tx_detail_invoice_status')}</span>
              <span data-testid="mf-tx-detail-invoice-status" style={{ ...rowValue, color: invStatus.color }}>
                {t(invStatus.key)}
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
              <span style={rowLabel}>{t('minhasfinancas.tx_detail_status')}</span>
              <span
                data-testid="mf-tx-detail-status"
                style={{ ...rowValue, color: tx.status === 'PAGO' ? '#10b981' : 'var(--text-muted)' }}
              >
                {tx.status === 'PAGO' ? `✓ ${t('minhasfinancas.tx_detail_settled')}` : t('minhasfinancas.tx_detail_pending')}
              </span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
            <span style={rowLabel}>{t('minhasfinancas.tx_detail_recurrence')}</span>
            <span data-testid="mf-tx-detail-recurrence" style={rowValue}>
              {t(recurrenceKey)}
              {parcelada ? ` ${tx.installments_current}/${tx.installments_total}` : ''}
            </span>
          </div>
          {isCard && !isTransfer ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                <span style={rowLabel}>{t('minhasfinancas.tx_detail_card')}</span>
                <span data-testid="mf-tx-detail-card" style={rowValue}>
                  {account?.name ?? '—'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                <span style={rowLabel}>{t('minhasfinancas.tx_detail_account')}</span>
                <span data-testid="mf-tx-detail-account" style={rowValue}>
                  {accountById[account?.linked_account_id]?.name ?? '—'}
                </span>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
              <span style={rowLabel}>{t('minhasfinancas.tx_detail_account')}</span>
              <span data-testid="mf-tx-detail-account" style={rowValue}>
                {account?.name ?? '—'}
              </span>
            </div>
          )}
        </div>

        {parcelada && (
          <>
            <h4 style={sectionTitle}>{t('minhasfinancas.tx_detail_section_parcels')}</h4>
            <div style={block}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                <span style={rowLabel}>{t('minhasfinancas.tx_detail_parcels')}</span>
                <span data-testid="mf-tx-detail-parcels-n" style={rowValue}>
                  {tx.installments_current}/{tx.installments_total}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                <span style={rowLabel}>{t('minhasfinancas.tx_detail_parcels_total')}</span>
                <span style={rowValue}>{money(seriesTotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                <span style={rowLabel}>{t('minhasfinancas.tx_detail_paid_pending')}</span>
                <span data-testid="mf-tx-detail-paid-pending" style={rowValue}>
                  {money(seriesPaid)} / {money(seriesPending)}
                </span>
              </div>
              <div aria-hidden style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <div style={{ width: `${progress}%`, height: '100%', background: 'var(--primary)' }} />
              </div>
            </div>
          </>
        )}

        {showParcels && parcelada && (
          <div className="modal-overlay" data-testid="mf-tx-detail-parcels-modal" onClick={() => setShowParcels(false)}>
            <div className="glass-card modal-content" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 480 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <button type="button" className="icon-btn" data-testid="mf-tx-detail-parcels-close" aria-label={t('minhasfinancas.close')} onClick={() => setShowParcels(false)}>
                  <X size={20} />
                </button>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, flex: 1 }}>
                  {t('minhasfinancas.tx_detail_parcels_title')}
                </h3>
              </div>
              {!seriesComplete && (
                <p data-testid="mf-tx-detail-parcels-partial" style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', color: '#f59e0b' }}>
                  {t('minhasfinancas.tx_detail_parcels_found', {
                    found: series.length,
                    total: tx.installments_total,
                  })}
                </p>
              )}
              <div data-testid="mf-tx-detail-parcels-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 320, overflowY: 'auto' }}>
                {series.map((row) => (
                  <div
                    key={row.id}
                    data-testid={`mf-tx-detail-parcel-${row.id}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.65rem 0.85rem',
                      border: '1px solid var(--glass-border)',
                      borderRadius: 12,
                      background: 'rgba(255, 255, 255, 0.02)',
                    }}
                  >
                    <span
                      style={{
                        minWidth: 44,
                        textAlign: 'center',
                        fontWeight: 800,
                        fontSize: '0.85rem',
                        padding: '0.2rem 0.4rem',
                        borderRadius: 8,
                        background: 'color-mix(in srgb, var(--primary) 14%, transparent)',
                        color: 'var(--primary)',
                      }}
                    >
                      {row.installments_current}/{row.installments_total}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700 }}>
                        {fmtDate(row.payment_date)}
                      </span>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {parcelInvoiceMonth(row)}
                      </span>
                    </span>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        color: row.status === 'PAGO' ? '#10b981' : '#f59e0b',
                      }}
                    >
                      {row.status === 'PAGO' ? t('minhasfinancas.status_pago') : t('minhasfinancas.tx_detail_pending')}
                    </span>
                    <strong style={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.9rem' }}>
                      {money(Math.abs(Number(row.amount) || 0))}
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <h4 style={sectionTitle}>{t('minhasfinancas.tx_detail_section_dates')}</h4>
        <div style={block}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
            <span style={rowLabel}>{t('minhasfinancas.tx_detail_launch_date')}</span>
            <span data-testid="mf-tx-detail-launch" style={rowValue}>
              {fmtDate(tx.payment_date)}
              {fmtTime(tx.created_at) ? ` ${fmtTime(tx.created_at)}` : ''}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
            <span style={rowLabel}>{t('minhasfinancas.tx_detail_due_date')}</span>
            <span data-testid="mf-tx-detail-due" style={rowValue}>
              {isCard && !isTransfer && invoice?.dueISO ? fmtDate(invoice.dueISO) : fmtDate(tx.due_date)}
            </span>
          </div>
          {!isCard && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
              <span style={rowLabel}>{t('minhasfinancas.tx_detail_effective_date')}</span>
              <span data-testid="mf-tx-detail-effective" style={rowValue}>
                {fmtDate(tx.effective_date)}
              </span>
            </div>
          )}
        </div>

        <h4 style={sectionTitle}>{t('minhasfinancas.tx_detail_section_more')}</h4>
        <div style={block}>
          {isTransfer ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div
                data-testid="mf-tx-detail-from"
                style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}
              >
                <MFAccountIcon account={accountById[tx.account_id] ?? account} size={30} />
                <strong style={{ fontSize: '0.9rem' }}>
                  {accountById[tx.account_id]?.name ?? '—'}
                </strong>
              </div>
              <span aria-hidden style={{ color: 'var(--text-muted)', fontSize: '1rem', marginLeft: '0.6rem' }}>
                ⇩
              </span>
              <div
                data-testid="mf-tx-detail-to"
                style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}
              >
                <MFAccountIcon account={accountById[tx.transfer_account_id] ?? null} size={30} />
                <strong style={{ fontSize: '0.9rem' }}>
                  {accountById[tx.transfer_account_id]?.name ?? '—'}
                </strong>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
              <span style={rowLabel}>{t('minhasfinancas.tx_detail_sum_totals')}</span>
              <span style={rowValue}>{tx.ignore_in_totals ? t('common.no') : t('common.yes')}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
            <span style={rowLabel}>{t('minhasfinancas.tx_detail_category')}</span>
            <span
              data-testid="mf-tx-detail-category"
              style={{
                fontSize: '0.75rem',
                fontWeight: 800,
                padding: '0.2rem 0.7rem',
                borderRadius: 999,
                background: (catParent ?? cat)?.color || 'var(--primary)',
                color: '#fff',
                maxWidth: '60%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {(catParent ?? cat)?.name ?? '—'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
            <span style={rowLabel}>{t('minhasfinancas.tx_detail_subcategory')}</span>
            <span
              data-testid="mf-tx-detail-subcategory"
              style={{
                fontSize: '0.75rem',
                fontWeight: 800,
                padding: '0.2rem 0.7rem',
                borderRadius: 999,
                background: catParent ? cat.color || 'var(--primary)' : 'transparent',
                color: catParent ? '#fff' : 'var(--text-muted)',
                border: catParent ? 'none' : '1px solid var(--glass-border)',
                maxWidth: '60%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {catParent ? cat.name : '—'}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={rowLabel}>{t('minhasfinancas.tx_detail_quick_tags')}</span>
            <div data-testid="mf-tx-detail-tags" style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {tagIds.length === 0 && (
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>—</span>
              )}
              {tagIds
                .map((id) => tags.find((tag) => tag.id === id))
                .filter(Boolean)
                .map((tag) => (
                  <span
                    key={tag.id}
                    data-testid={`mf-tx-detail-tag-${tag.id}`}
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      padding: '0.25rem 0.65rem',
                      borderRadius: 999,
                      background: tag.color || 'var(--primary)',
                      color: '#fff',
                    }}
                  >
                    {tag.name}
                  </span>
                ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={rowLabel}>{t('minhasfinancas.tx_detail_notes')}</span>
            <span data-testid="mf-tx-detail-notes" style={{ fontSize: '0.85rem' }}>
              {tx.notes?.trim() || t('minhasfinancas.tx_detail_notes_none')}
            </span>
          </div>
        </div>

        <h4 style={sectionTitle}>{t('minhasfinancas.tx_detail_section_actions')}</h4>
        <div style={{ ...block, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>
            {tx.status === 'PAGO' ? t('minhasfinancas.status_pago') : t('minhasfinancas.tx_detail_pending')}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={tx.status === 'PAGO'}
            data-testid="mf-tx-detail-toggle-paid"
            onClick={handleTogglePaid}
            style={{
              width: 46,
              height: 26,
              borderRadius: 999,
              border: '1px solid var(--glass-border)',
              background: tx.status === 'PAGO' ? 'var(--primary)' : 'rgba(255,255,255,0.08)',
              cursor: 'pointer',
              position: 'relative',
            }}
          >
            <span
              aria-hidden
              style={{
                position: 'absolute',
                top: 2,
                left: tx.status === 'PAGO' ? 22 : 2,
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: '#fff',
                transition: 'left 0.15s',
              }}
            />
          </button>
        </div>
        {tx.updated_at && (
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'right' }}>
            {t('minhasfinancas.tx_detail_last_modified', {
              date: `${fmtDate(String(tx.updated_at).slice(0, 10))}${fmtTime(tx.updated_at) ? ` ${fmtTime(tx.updated_at)}` : ''}`,
            })}
          </p>
        )}

        {/* Edição rápida */}
        {quickOpen && (
          <div className="modal-overlay" data-testid="mf-tx-detail-quick" onClick={() => setQuickOpen(false)}>
            <div className="glass-card modal-content" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 480 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <button type="button" className="icon-btn" data-testid="mf-tx-detail-quick-close" aria-label={t('minhasfinancas.close')} onClick={() => setQuickOpen(false)}>
                  <X size={20} />
                </button>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, flex: 1 }}>
                  {t('minhasfinancas.tx_detail_quick')}
                </h3>
                <button
                  type="button"
                  className="btn-primary"
                  data-testid="mf-tx-detail-quick-save"
                  disabled={saving}
                  onClick={handleQuickSave}
                  style={{ padding: '0.5rem 0.9rem', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <Check size={14} />
                  {t('minhasfinancas.save')}
                </button>
              </div>
              <div className="input-group" style={{ marginBottom: '0.8rem' }}>
                <label>{t('minhasfinancas.tx_detail_quick_desc')}</label>
                <input
                  type="text"
                  value={quickDesc}
                  data-testid="mf-tx-detail-quick-desc"
                  onChange={(event) => setQuickDesc(event.target.value)}
                />
              </div>
              <div className="input-group" style={{ marginBottom: '0.8rem' }}>
                <label>{t('minhasfinancas.tx_detail_notes')}</label>
                <input
                  type="text"
                  value={quickNotes}
                  data-testid="mf-tx-detail-quick-notes"
                  onChange={(event) => setQuickNotes(event.target.value)}
                  placeholder={t('minhasfinancas.tx_detail_notes_none')}
                />
              </div>
              <div className="input-group" style={{ marginBottom: '0.8rem' }}>
                <label>{t('minhasfinancas.tx_detail_category')}</label>
                <MFCategorySelect
                  testId="mf-tx-detail-quick-category"
                  value={quickCategory}
                  onChange={setQuickCategory}
                  categories={visibleCategories}
                  placeholder={t('minhasfinancas.tx_category_none')}
                  onCreate={handleQuickCreateCategory}
                />
              </div>
              <div className="input-group">
                <label>{t('minhasfinancas.tx_detail_quick_tags')}</label>
                <div data-testid="mf-tx-detail-quick-tags" style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.55rem' }}>
                  {quickTags.length === 0 && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {t('minhasfinancas.tx_tags_selected_none')}
                    </span>
                  )}
                  {quickTags
                    .map((id) => tags.find((tag) => tag.id === id))
                    .filter(Boolean)
                    .map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        data-testid={`mf-tx-detail-quick-tag-sel-${tag.id}`}
                        aria-label={t('minhasfinancas.tx_tags_remove')}
                        onClick={() => setQuickTags((prev) => prev.filter((id) => id !== tag.id))}
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '0.25rem 0.65rem',
                          borderRadius: 999,
                          cursor: 'pointer',
                          border: '1px solid var(--glass-border)',
                          background: tag.color || 'var(--primary)',
                          color: '#fff',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                        }}
                      >
                        # {tag.name} <X size={11} aria-hidden />
                      </button>
                    ))}
                </div>
                <button
                  type="button"
                  className="btn-cancel"
                  data-testid="mf-tx-detail-quick-tags-toggle"
                  aria-expanded={tagsOpen}
                  onClick={() => setTagsOpen((prev) => !prev)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.45rem 0.85rem',
                    fontSize: '0.8rem',
                  }}
                >
                  <Tag size={13} />
                  {t('minhasfinancas.tx_tags_add')}
                </button>
                {tagsOpen && (
                  <div
                    data-testid="mf-tx-detail-quick-tags-picker"
                    style={{
                      marginTop: '0.6rem',
                      padding: '0.8rem',
                      border: '1px solid var(--glass-border)',
                      borderRadius: 12,
                      background: 'rgba(255, 255, 255, 0.02)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.7rem',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {tags.length === 0 && (
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          {t('minhasfinancas.tx_no_tags')}
                        </span>
                      )}
                      {tags.length > 0 && (
                        <input
                          type="text"
                          className="glass-input"
                          data-testid="mf-tx-detail-quick-tags-search"
                          value={quickTagSearch}
                          onChange={(event) => setQuickTagSearch(event.target.value)}
                          placeholder={t('minhasfinancas.tag_search_placeholder')}
                          style={{ width: '100%', fontSize: '0.8rem', padding: '0.45rem 0.7rem', marginBottom: '0.3rem' }}
                        />
                      )}
                      {tags
                        .filter((tag) => tag.name.toLowerCase().includes(quickTagSearch.trim().toLowerCase()))
                        .map((tag) => {
                        const active = quickTags.includes(tag.id);
                        return (
                          <button
                            key={tag.id}
                            type="button"
                            data-testid={`mf-tx-detail-quick-tag-${tag.id}`}
                            aria-pressed={active}
                            onClick={() =>
                              setQuickTags((prev) =>
                                prev.includes(tag.id) ? prev.filter((id) => id !== tag.id) : [...prev, tag.id]
                              )
                            }
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              padding: '0.25rem 0.65rem',
                              borderRadius: 999,
                              cursor: 'pointer',
                              border: '1px solid var(--glass-border)',
                              background: active ? tag.color || 'var(--primary)' : 'transparent',
                              color: active ? '#fff' : 'var(--text-muted)',
                            }}
                          >
                            # {tag.name}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        type="text"
                        value={newTag}
                        onChange={(event) => setNewTag(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            handleAddTag();
                          }
                        }}
                        placeholder={t('minhasfinancas.tx_new_tag_placeholder')}
                        data-testid="mf-tx-detail-quick-new-tag"
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        className="btn-cancel"
                        data-testid="mf-tx-detail-quick-add-tag"
                        onClick={handleAddTag}
                        style={{ padding: '0.5rem 0.8rem' }}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Escopo da série (só esta / esta e próximas / todas) */}
        {scopeAction && (
          <MFChoiceDialog
            testId="mf-tx-detail-scope"
            title={t('minhasfinancas.tx_delete_fixed_title')}
            body={t('minhasfinancas.tx_delete_fixed_body')}
            options={[
              { key: 'one', label: t('minhasfinancas.tx_delete_scope_one'), testId: 'mf-tx-detail-scope-one' },
              { key: 'from', label: t('minhasfinancas.tx_delete_scope_from'), testId: 'mf-tx-detail-scope-from' },
              { key: 'all', label: t('minhasfinancas.tx_delete_scope_all'), testId: 'mf-tx-detail-scope-all' },
            ]}
            onOption={onScopeOption}
            onClose={() => setScopeAction(null)}
          />
        )}

        {/* Duplicar como: escopo da série */}
        {dupeScopeKind && (
          <MFChoiceDialog
            testId="mf-tx-detail-dupe-scope"
            title={t('minhasfinancas.tx_delete_fixed_title')}
            body={t('minhasfinancas.tx_delete_fixed_body')}
            options={[
              { key: 'one', label: t('minhasfinancas.tx_delete_scope_one'), testId: 'mf-tx-detail-dupe-scope-one' },
              { key: 'from', label: t('minhasfinancas.tx_delete_scope_from'), testId: 'mf-tx-detail-dupe-scope-from' },
              { key: 'all', label: t('minhasfinancas.tx_delete_scope_all'), testId: 'mf-tx-detail-dupe-scope-all' },
            ]}
            onOption={(key) => openDupeForm(dupeScopeKind, key)}
            onClose={() => setDupeScopeKind(null)}
          />
        )}

        {/* Duplicar como: destino (cartão + fatura ou conta) */}
        {dupeForm && dupeForm.kind !== 'comp' && (
          <div className="modal-overlay" data-testid="mf-tx-detail-dupe-target" onClick={() => setDupeForm(null)}>
            <div className="glass-card modal-content" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 420 }}>
              <h3 style={{ margin: '0 0 1rem', fontSize: '1.05rem', fontWeight: 800 }}>
                {dupeForm.kind === 'card'
                  ? t('minhasfinancas.tx_detail_menu_dupe_card')
                  : t('minhasfinancas.tx_detail_menu_dupe_transfer')}
              </h3>
              <div className="input-group" style={{ marginBottom: '0.8rem' }}>
                <label>
                  {dupeForm.kind === 'card'
                    ? t('minhasfinancas.tx_detail_dupe_card_label')
                    : t('minhasfinancas.tx_detail_dupe_account_label')}
                </label>
                <MFAccountSelect
                  value={dupeTarget}
                  onChange={(id) => {
                    setDupeTarget(id);
                    if (dupeForm.kind === 'card') {
                      const picked = dupeCards.find((acc) => acc.id === id) ?? null;
                      setDupeClose(
                        picked ? invoiceCloseForDueMonth(picked, toISODate(new Date()).slice(0, 7)) : ''
                      );
                    }
                  }}
                  accounts={dupeForm.kind === 'card' ? dupeCards : dupeAccounts}
                  placeholder={t('minhasfinancas.tx_account_placeholder')}
                  testId="mf-tx-detail-dupe-target-account"
                />
              </div>
              {dupeForm.kind === 'card' && dupeCycles.length > 0 && (
                <div className="input-group" style={{ marginBottom: '0.8rem' }}>
                  <label>{t('minhasfinancas.tx_detail_dupe_invoice_label')}</label>
                  <MFSelect
                    testId="mf-tx-detail-dupe-target-invoice"
                    value={dupeClose}
                    onChange={setDupeClose}
                    searchable={false}
                    options={dupeCycles.map((cycle) => ({
                      value: cycle.closeISO,
                      label: dupeMonthYear(cycle.dueISO),
                    }))}
                  />
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
                <button type="button" className="btn-cancel" data-testid="mf-tx-detail-dupe-cancel" onClick={() => setDupeForm(null)} style={{ padding: '0.6rem 1rem', fontSize: '0.85rem' }}>
                  {t('minhasfinancas.cancel')}
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  data-testid="mf-tx-detail-dupe-confirm"
                  disabled={saving || !dupeTarget || (dupeForm.kind === 'card' && !dupeClose)}
                  onClick={() =>
                    runDuplicateAs(dupeForm.kind, dupeForm.scope, {
                      accountId: dupeTarget,
                      close: dupeClose,
                    })
                  }
                  style={{ padding: '0.6rem 1rem', fontSize: '0.85rem' }}
                >
                  {t('minhasfinancas.card_pay_continue')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Alterar valor: calculadora (escopo da série vem depois do ✓) */}
        {calcOpen && (
          <MFCalculator
            testId="mf-tx-detail-calc"
            title={t('minhasfinancas.calc_current_value', {
              value: money(Math.abs(Number(viewTx.amount) || 0)),
            })}
            initial={Math.abs(Number(viewTx.amount) || 0).toFixed(2).replace('.', ',')}
            onConfirm={onValueConfirm}
            onClose={() => setCalcOpen(false)}
          />
        )}

        {/* Antecipar parcelas (cartão parcelado; genérico nas demais) */}
        {anticipateOpen && isCard && !isTransfer && (
          <MFCardAnticipateModal tx={tx} card={account} user={user} onClose={() => setAnticipateOpen(false)} />
        )}
        {anticipateOpen && (!isCard || isTransfer) && (
          <MFAnticipateModal tx={tx} user={user} currency={account?.currency || 'BRL'} onClose={() => setAnticipateOpen(false)} />
        )}
      </div>
    </div>,
    document.body
  );
}
