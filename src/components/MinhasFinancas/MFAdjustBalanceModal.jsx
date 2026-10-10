import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useCreateMFTransaction,
  useUpdateAccount,
  useMFCategories,
  useCreateMFCategory,
  formatMoney,
  parseMoney,
  maskAmount,
} from '../../hooks/useMinhasFinancas';
import MFAccountIcon from './MFAccountIcon';
import { mfNormalize } from './MFCategoryIcons';

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

/** Data do ajuste em dd/mm/aaaa (determinístico entre locales). */
const formatPayDate = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = String(iso).split('-');
  return `${d}/${m}/${y}`;
};

/** Valor inicial do campo com a máscara monetária (centavos → "0,00"). */
const toMasked = (value) => {
  const cents = Math.round((Number(value) || 0) * 100);
  const masked = maskAmount(String(Math.abs(cents)));
  return `${cents < 0 ? '-' : ''}${masked}`;
};

/**
 * Reajustar saldo (conta ou fatura de cartão) — replica o modal do Minhas
 * Finanças: informa o saldo desejado e escolhe como chegar lá.
 * - auto: o app cria o lançamento de ajuste ("Receita/Despesa de ajuste",
 *   categoria Outros → Ajuste, criada se não existir): conta usa
 *   RECEITA/DESPESA na data informada; cartão/fatura usa DESPESA com sinal
 *   dentro da fatura.
 * - manual: abre o formulário de lançamento (onManual recebe diff; o
 *   chamador escolhe receita/despesa/despesa-cartão).
 * - transfer: abre a tela de transferência (onTransfer) ou só fecha.
 * - initial: soma a diferença no saldo inicial (só contas, nunca fatura).
 *
 * Montado via portal no body (`.modal-overlay` fixed recortaria dentro de
 * `.glass-card`s — backdrop-filter cria containing block). O efeito é
 * aplicado no cache na hora (otimista): o refetch global é debounced e
 * pode morrer na tempestade — sem isso, salvar parecia "não fazer nada".
 */
export default function MFAdjustBalanceModal({
  account,
  user,
  current = 0,
  payDate,
  invoiceLabel = null,
  allowInitial = true,
  onClose = () => {},
  onManual = null,
  onTransfer = null,
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const createTx = useCreateMFTransaction();
  const updateAccount = useUpdateAccount();
  const { data: categories = [], isLoading: catsLoading } = useMFCategories(user);
  const createCategory = useCreateMFCategory();
  const [target, setTarget] = useState(() => toMasked(current));
  const [option, setOption] = useState('auto');
  const [saving, setSaving] = useState(false);

  const currency = account?.currency || 'BRL';
  const money = (value) => formatMoney(value, currency);
  const targetValue = parseMoney(target);
  const targetValid = target.trim() !== '' && target.trim() !== '-' && Number.isFinite(targetValue);
  const diff = targetValid ? round2(targetValue - (Number(current) || 0)) : 0;
  // Cartão/fatura ajusta por DESPESA com sinal; conta ajusta por
  // RECEITA (sobe) / DESPESA (desce).
  const cardLike = !!invoiceLabel || account?.account_type === 'CARTAO';

  const options = [
    {
      id: 'auto',
      label: t('minhasfinancas.adjust_opt_auto'),
      hint: t('minhasfinancas.adjust_hint_auto'),
    },
    {
      id: 'manual',
      label: t('minhasfinancas.adjust_opt_manual'),
      hint: t('minhasfinancas.adjust_hint_manual'),
    },
    {
      id: 'transfer',
      label: t('minhasfinancas.adjust_opt_transfer'),
      hint: t(
        onTransfer
          ? 'minhasfinancas.adjust_hint_transfer_open'
          : 'minhasfinancas.adjust_hint_transfer_manual'
      ),
    },
    ...(allowInitial
      ? [
          {
            id: 'initial',
            label: t('minhasfinancas.adjust_opt_initial'),
            hint: t('minhasfinancas.adjust_hint_initial'),
          },
        ]
      : []),
  ];
  const activeHint = options.find((opt) => opt.id === option)?.hint ?? '';
  const canSave =
    !saving &&
    !catsLoading &&
    targetValid &&
    (option === 'auto' || option === 'initial' ? diff !== 0 : true);

  /**
   * Categoria do ajuste (Outros → Ajuste): reutiliza a subcategoria
   * "Ajuste" se já existir; senão cria o pai "Outros" (se faltar) e a
   * filha. Tipo AMBAS para servir a receita e despesa de ajuste.
   */
  const ensureAdjustCategory = async () => {
    const norm = (value) => mfNormalize(value ?? '');
    const list = Array.isArray(categories) ? categories : [];
    const loose = list.find((cat) => cat.parent_id && norm(cat.name) === 'ajuste');
    if (loose) return loose.id;
    let parent = list.find((cat) => !cat.parent_id && norm(cat.name) === 'outros');
    if (!parent) {
      parent = await createCategory.mutateAsync({
        user_id: user.id,
        name: 'Outros',
        type: 'AMBAS',
        parent_id: null,
        color: '#6b7280',
        icon: null,
      });
    }
    const child = await createCategory.mutateAsync({
      user_id: user.id,
      name: 'Ajuste',
      type: 'AMBAS',
      parent_id: parent?.id ?? null,
      color: '#6b7280',
      icon: '🧾',
    });
    return child?.id ?? null;
  };

  /**
   * Aplica o efeito nas queries mensais na hora, com a mesma semântica do
   * computeAccountRows para um lançamento PAGO (saldo/previsto sempre;
   * colunas do mês só quando payDate cai no mês da chave).
   */
  const applyOptimistic = (created) => {
    const uid = user?.id;
    const payMonth = String(payDate || '').slice(0, 7);
    const abs = Math.abs(diff);
    queryClient
      .getQueriesData({ queryKey: ['mf-month-summary', uid] })
      .forEach(([key, old]) => {
        if (!old?.rows) return;
        const inMonth = payMonth && payMonth === key[2];
        queryClient.setQueryData(key, {
          ...old,
          rows: old.rows.map((row) => {
            if (row.id !== account.id) return row;
            if (option === 'initial') {
              return {
                ...row,
                initial_balance: round2((Number(row.initial_balance) || 0) + diff),
                saldo: round2((Number(row.saldo) || 0) + diff),
                previsto: round2((Number(row.previsto) || 0) + diff),
              };
            }
            const bumped = {
              ...row,
              saldo: round2((Number(row.saldo) || 0) + (cardLike ? -diff : diff)),
              previsto: round2((Number(row.previsto) || 0) + (cardLike ? -diff : diff)),
            };
            if (inMonth) {
              if (!cardLike && diff > 0) {
                bumped.receitas = round2((Number(row.receitas) || 0) + abs);
              } else {
                bumped.despesas = round2(
                  (Number(row.despesas) || 0) + (cardLike ? diff : abs)
                );
              }
            }
            return bumped;
          }),
        });
      });
    const createdRow = Array.isArray(created) ? created[0] : created;
    if (createdRow && option === 'auto') {
      queryClient
        .getQueriesData({ queryKey: ['mf-lancamentos', uid] })
        .forEach(([key, old]) => {
          if (!old || !Array.isArray(old.transactions)) return;
          if (payMonth && payMonth !== key[2]) return;
          queryClient.setQueryData(key, {
            ...old,
            transactions: [...old.transactions, createdRow],
          });
        });
      queryClient
        .getQueriesData({ queryKey: ['mf-all-transactions', uid] })
        .forEach(([key, old]) => {
          if (!Array.isArray(old)) return;
          if (old.some((tx) => tx?.id === createdRow?.id)) return;
          queryClient.setQueryData(key, [...old, createdRow]);
        });
    }
  };

  const handleSave = async () => {
    if (!canSave) return;
    if (option === 'manual') {
      if (onManual) onManual(diff);
      onClose();
      return;
    }
    if (option === 'transfer') {
      if (onTransfer) onTransfer();
      onClose();
      return;
    }
    setSaving(true);
    try {
      if (option === 'initial') {
        await updateAccount.mutateAsync({
          id: account.id,
          initial_balance: round2((Number(account.initial_balance) || 0) + diff),
        });
        applyOptimistic(null);
        toast.success(t('minhasfinancas.account_updated'));
      } else {
        // Cartão/fatura: sempre DESPESA com sinal (negativa abate, como
        // estorno). Conta: RECEITA sobe, DESPESA desce — descrição e
        // categoria "Receita/Despesa de ajuste" (Outros → Ajuste).
        const categoryId = await ensureAdjustCategory();
        const income = !cardLike && diff > 0;
        const created = await createTx.mutateAsync({
          user_id: user.id,
          account_id: account.id,
          type: cardLike ? 'DESPESA' : income ? 'RECEITA' : 'DESPESA',
          description: t(
            income ? 'minhasfinancas.adjust_tx_income' : 'minhasfinancas.adjust_tx_expense'
          ),
          amount: cardLike ? diff : Math.abs(diff),
          payment_date: payDate,
          due_date: payDate,
          effective_date: payDate,
          status: 'PAGO',
          category_id: categoryId,
          recurrence: 'NONE',
        });
        applyOptimistic(created);
        toast.success(t('minhasfinancas.tx_saved'));
      }
      onClose();
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="modal-overlay" data-testid="mf-adjust-modal" onClick={onClose}>
      <div
        className="glass-card modal-content"
        role="dialog"
        aria-modal="true"
        aria-label={t('minhasfinancas.adjust_title')}
        onClick={(event) => event.stopPropagation()}
        style={{ padding: '1.25rem 1.5rem' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            marginBottom: '0.9rem',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, flex: 1 }}>
            {t('minhasfinancas.adjust_title')}
          </h3>
          <button
            type="button"
            className="icon-btn"
            data-testid="mf-adjust-cancel"
            aria-label={t('minhasfinancas.cancel')}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        <div
          style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.9rem' }}
        >
          <MFAccountIcon account={account} size={28} />
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 800 }}>{account?.name}</p>
            {invoiceLabel && (
              <p
                style={{
                  margin: 0,
                  fontSize: '0.78rem',
                  color: 'var(--text-muted)',
                }}
              >
                {invoiceLabel}
              </p>
            )}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            marginBottom: '0.6rem',
          }}
        >
          <span style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
            {t('minhasfinancas.adjust_current')}
          </span>
          <strong data-testid="mf-adjust-current" style={{ fontSize: '1rem' }}>
            {money(current)}
          </strong>
        </div>

        <div className="input-group" style={{ marginBottom: '0.6rem' }}>
          <label>{t('minhasfinancas.adjust_new')}</label>
          <input
            type="text"
            inputMode="decimal"
            className="glass-input"
            data-testid="mf-adjust-target"
            value={target}
            onChange={(event) => {
              const raw = event.target.value;
              const negative = raw.trim().startsWith('-');
              const masked = maskAmount(raw);
              setTarget(masked ? (negative ? `-${masked}` : masked) : negative ? '-' : '');
            }}
            style={{ width: '100%', padding: '0.55rem 0.8rem', fontSize: '0.95rem' }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            marginBottom: '0.9rem',
            fontSize: '0.88rem',
          }}
        >
          <span style={{ color: 'var(--text-muted)' }}>
            {t('minhasfinancas.adjust_difference')}
          </span>
          <strong
            data-testid="mf-adjust-diff"
            style={{ color: diff > 0 ? '#10b981' : diff < 0 ? '#ef4444' : 'var(--text-muted)' }}
          >
            {money(diff)}
          </strong>
        </div>

        <p
          data-testid="mf-adjust-date"
          style={{ margin: '0 0 0.9rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}
        >
          {t('minhasfinancas.adjust_date')}: {formatPayDate(payDate)}
        </p>

        <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={option === opt.id}
              data-testid={`mf-adjust-opt-${opt.id}`}
              onClick={() => setOption(opt.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                textAlign: 'left',
                padding: '0.55rem 0.75rem',
                borderRadius: 10,
                border:
                  option === opt.id
                    ? '2px solid var(--primary)'
                    : '1px solid var(--glass-border)',
                background: 'transparent',
                color: 'inherit',
                font: 'inherit',
                fontSize: '0.88rem',
                cursor: 'pointer',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  border: '2px solid var(--primary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {option === opt.id && (
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: 'var(--primary)',
                    }}
                  />
                )}
              </span>
              {opt.label}
            </button>
          ))}
        </div>

        <p
          data-testid="mf-adjust-hint"
          style={{ margin: '0.7rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}
        >
          {activeHint}
        </p>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.6rem',
            marginTop: '1rem',
          }}
        >
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('minhasfinancas.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary"
            data-testid="mf-adjust-save"
            disabled={!canSave}
            onClick={handleSave}
          >
            {t('minhasfinancas.save')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
