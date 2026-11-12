import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarDays,
  Link2,
  Pencil,
  Plus,
  Target,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { confirmToast } from '../../lib/toast';
import {
  useAddMFGoalContribution,
  useDeleteMFGoalContribution,
  useUpdateMFGoal,
  goalCurrentAmount,
  parseMoney,
  maskAmount,
  toISODate,
  formatMoney,
} from '../../hooks/useMinhasFinancas';
import MFAccountIcon from './MFAccountIcon';
import MFSelect from './MFSelect';

const todayISO = () => toISODate(new Date());

const fmtDate = (iso) => {
  if (!iso) return null;
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!y || !m || !d) return null;
  return `${d}/${m}/${y}`;
};

const monthsUntil = (iso) => {
  if (!iso) return null;
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(y, m - 1, d);
  if (Number.isNaN(target.getTime())) return null;
  let months = (target.getFullYear() - today.getFullYear()) * 12 +
    (target.getMonth() - today.getMonth());
  if (target.getDate() > today.getDate()) months += 1;
  return months;
};

const statusChip = (color) => ({
  fontSize: '0.68rem',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color,
  background: `color-mix(in srgb, ${color} 14%, transparent)`,
  border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
  borderRadius: 999,
  padding: '0.12rem 0.55rem',
});

/**
 * Detalhe de um objetivo: abas "Detalhes" e "Depósitos", anel de
 * progresso, prazo, valor mensal ideal e a lista de aportes (com inclusão
 * e exclusão). Objetivo vinculado a conta tem progresso automático pelo
 * saldo; sem vínculo, os aportes manuais alimentam o progresso.
 */
export default function MFGoalDetail({
  goal,
  contributions = [],
  balance,
  balanceKnown = true,
  accountsById = {},
  user,
  showValues = true,
  onClose,
  onEdit,
}) {
  const { t } = useTranslation();
  const addContribution = useAddMFGoalContribution();
  const deleteContribution = useDeleteMFGoalContribution();
  const updateGoal = useUpdateMFGoal();
  const [tab, setTab] = useState('details');
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    kind: 'DEPOSIT',
    amount: '',
    contribution_date: todayISO(),
    notes: '',
  });

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const linkedAccount = goal?.account_id ? accountsById[goal.account_id] : null;
  const currency = linkedAccount?.currency || 'BRL';
  const money = (value) => (showValues ? formatMoney(value, currency) : '•••');
  const target = Number(goal?.target_amount) || 0;
  const isLinked = Boolean(goal?.account_id);
  const current = balanceKnown
    ? goalCurrentAmount(goal, contributions, balance)
    : null;
  const pct = current === null || target <= 0 ? 0 : Math.min(100, (current / target) * 100);
  const reached = current !== null && target > 0 && current >= target;
  const remaining = current === null ? null : Math.max(0, target - current);
  const monthsLeft = monthsUntil(goal?.target_date);
  const idealMonthly =
    remaining === null || monthsLeft === null
      ? null
      : remaining <= 0
        ? 0
        : monthsLeft > 0
          ? remaining / monthsLeft
          : remaining;
  const color = reached ? '#10b981' : goal?.color || 'var(--primary)';

  const movements = useMemo(
    () =>
      [...contributions]
        .filter((item) => item.goal_id === goal?.id)
        .sort((a, b) =>
          String(b.contribution_date || '').localeCompare(String(a.contribution_date || ''))
        ),
    [contributions, goal?.id]
  );

  if (!goal) return null;

  const resetForm = () => {
    setForm({
      kind: 'DEPOSIT',
      amount: '',
      contribution_date: todayISO(),
      notes: '',
    });
  };

  const handleAdd = async (event) => {
    event.preventDefault();
    const amount = parseMoney(form.amount);
    if (!(amount > 0)) {
      toast.error(t('minhasfinancas.tx_amount_required'));
      return;
    }
    setSaving(true);
    try {
      await addContribution.mutateAsync({
        user_id: user.id,
        goal_id: goal.id,
        kind: form.kind,
        amount,
        contribution_date: form.contribution_date || todayISO(),
        notes: form.notes.trim() || null,
      });
      const nextCurrent = goalCurrentAmount(
        goal,
        [
          ...contributions,
          { goal_id: goal.id, kind: form.kind, amount },
        ],
        balance
      );
      if (goal.status === 'ACTIVE' && nextCurrent >= target) {
        await updateGoal.mutateAsync({ id: goal.id, status: 'COMPLETED' });
        toast.success(t('minhasfinancas.gl_target_reached'));
      } else {
        toast.success(t('minhasfinancas.gl_mov_saved'));
      }
      resetForm();
      setAdding(false);
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (item) => {
    confirmToast(
      t('minhasfinancas.gl_mov_delete_confirm'),
      async () => {
        try {
          await deleteContribution.mutateAsync(item.id);
          toast.success(t('minhasfinancas.cfg_deleted'));
        } catch {
          toast.error(t('minhasfinancas.save_error'));
        }
      },
      { danger: true, confirmText: t('minhasfinancas.delete') }
    );
  };

  const radius = 62;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);
  const simulation = (() => {
    if (current === null) return t('minhasfinancas.gl_simulation_calc');
    if (reached) return t('minhasfinancas.gl_simulation_reached');
    if (!goal.target_date) return t('minhasfinancas.gl_simulation_no_date');
    if (monthsLeft !== null && monthsLeft <= 0) {
      return t('minhasfinancas.gl_simulation_late', { remaining: money(remaining) });
    }
    return t('minhasfinancas.gl_simulation_text', {
      remaining: money(remaining),
      monthly: money(idealMonthly),
      date: fmtDate(goal.target_date),
    });
  })();

  const infoCard = (label, value, testId, icon) => (
    <div
      key={label}
      style={{
        background: 'var(--input-bg)',
        border: '1px solid var(--glass-border)',
        borderRadius: 14,
        padding: '0.8rem 0.9rem',
        minWidth: 0,
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          fontSize: '0.7rem',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--text-muted)',
          fontWeight: 800,
        }}
      >
        {icon}
        {label}
      </span>
      <strong
        data-testid={testId}
        style={{
          display: 'block',
          marginTop: '0.25rem',
          fontSize: '0.95rem',
          fontWeight: 800,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </strong>
    </div>
  );

  return (
    <div className="modal-overlay" data-testid="mf-goal-detail" onClick={onClose}>
      <div
        className="glass-card modal-content"
        onClick={(event) => event.stopPropagation()}
        style={{ maxWidth: 620, width: '100%' }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '0.75rem',
            marginBottom: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
            <span
              style={{
                width: 46,
                height: 46,
                borderRadius: 14,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontSize: '1.35rem',
                background: `color-mix(in srgb, ${goal.color || 'var(--primary)'} 16%, transparent)`,
              }}
            >
              {String(goal.icon || '').includes(':') ? (
                <MFAccountIcon
                  account={{ icon: goal.icon, name: goal.name, color: goal.color }}
                  size={26}
                />
              ) : (
                goal.icon || '🎯'
              )}
            </span>
            <div style={{ minWidth: 0 }}>
              <h3
                style={{
                  margin: 0,
                  fontSize: '1.2rem',
                  fontWeight: 800,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {goal.name}
              </h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {goal.status === 'ARCHIVED'
                  ? t('minhasfinancas.gl_archived')
                  : reached
                    ? t('minhasfinancas.gl_completed')
                    : t('minhasfinancas.gl_active')}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            {onEdit && (
              <button
                type="button"
                className="icon-btn"
                data-testid="mf-goal-detail-edit"
                aria-label={t('minhasfinancas.edit')}
                onClick={onEdit}
              >
                <Pencil size={18} />
              </button>
            )}
            <button
              type="button"
              className="icon-btn"
              data-testid="mf-goal-detail-close"
              aria-label={t('minhasfinancas.close')}
              onClick={onClose}
            >
              <X size={22} />
            </button>
          </div>
        </div>

        <div className="mf-det-tabs" role="tablist" aria-label={goal.name}>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'details'}
            className={`mf-det-tab${tab === 'details' ? ' mf-det-tab-active' : ''}`}
            data-testid="mf-goal-detail-tab-details"
            onClick={() => setTab('details')}
          >
            {t('minhasfinancas.gl_tab_details')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'deposits'}
            className={`mf-det-tab${tab === 'deposits' ? ' mf-det-tab-active' : ''}`}
            data-testid="mf-goal-detail-tab-deposits"
            onClick={() => setTab('deposits')}
          >
            {t('minhasfinancas.gl_tab_deposits')}
            {movements.length > 0 ? ` (${movements.length})` : ''}
          </button>
        </div>

        {tab === 'details' ? (
          <div data-testid="mf-goal-detail-panel-details">
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '1.25rem',
                padding: '0.5rem 0 1rem',
              }}
            >
              <svg
                width="160"
                height="160"
                viewBox="0 0 160 160"
                data-testid="mf-goal-detail-ring"
                data-pct={Math.round(pct)}
                role="img"
                aria-label={t('minhasfinancas.gl_progress')}
                style={{ flexShrink: 0 }}
              >
                <circle
                  cx="80"
                  cy="80"
                  r={radius}
                  fill="none"
                  stroke="var(--input-bg)"
                  strokeWidth="14"
                />
                <circle
                  cx="80"
                  cy="80"
                  r={radius}
                  fill="none"
                  stroke={color}
                  strokeWidth="14"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  transform="rotate(-90 80 80)"
                  style={{ transition: 'stroke-dashoffset 0.35s' }}
                />
                <text
                  x="80"
                  y="78"
                  textAnchor="middle"
                  fill="var(--text-main)"
                  fontSize="30"
                  fontWeight="800"
                >
                  {current === null ? '…' : `${Math.round(pct)}%`}
                </text>
                <text
                  x="80"
                  y="100"
                  textAnchor="middle"
                  fill="var(--text-muted)"
                  fontSize="11"
                  fontWeight="700"
                  style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}
                >
                  {t('minhasfinancas.gl_progress')}
                </text>
              </svg>

              <div style={{ minWidth: 180, flex: 1 }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                  {t('minhasfinancas.gl_saved_amount')}
                </span>
                <div
                  data-testid="mf-goal-detail-current"
                  style={{ fontSize: '1.7rem', fontWeight: 800, color, lineHeight: 1.15 }}
                >
                  {current === null ? '…' : money(current)}
                </div>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  {t('minhasfinancas.gl_of_target', { target: money(target) })}
                </span>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    marginTop: '0.6rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={statusChip(color)} data-testid="mf-goal-detail-pct">
                    {current === null ? '…' : `${Math.round(pct)}%`}
                  </span>
                  {reached && (
                    <span style={statusChip('#10b981')}>
                      {t('minhasfinancas.gl_completed')}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '0.6rem',
                marginBottom: '0.8rem',
              }}
            >
              {infoCard(
                t('minhasfinancas.gl_target'),
                money(target),
                'mf-goal-detail-target',
                <Target size={13} />
              )}
              {infoCard(
                t('minhasfinancas.gl_target_date'),
                goal.target_date ? fmtDate(goal.target_date) : t('minhasfinancas.gl_no_date'),
                'mf-goal-detail-date',
                <CalendarDays size={13} />
              )}
              {infoCard(
                t('minhasfinancas.gl_ideal_monthly'),
                idealMonthly === null ? '—' : money(idealMonthly),
                'mf-goal-detail-monthly',
                <Wallet size={13} />
              )}
              {infoCard(
                t('minhasfinancas.gl_remaining'),
                remaining === null ? '…' : money(remaining),
                'mf-goal-detail-remaining',
                <ArrowUpFromLine size={13} />
              )}
            </div>

            {linkedAccount && (
              <p
                style={{
                  margin: '0 0 0.6rem',
                  fontSize: '0.78rem',
                  color: 'var(--text-muted)',
                  lineHeight: 1.5,
                }}
              >
                🔄 {t('minhasfinancas.gl_linked_hint', { name: linkedAccount.name })}
              </p>
            )}

            <div
              style={{
                background: 'var(--input-bg)',
                border: '1px solid var(--glass-border)',
                borderRadius: 14,
                padding: '0.85rem 0.95rem',
              }}
            >
              <span
                style={{
                  display: 'block',
                  fontSize: '0.7rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: 'var(--text-muted)',
                  fontWeight: 800,
                  marginBottom: '0.25rem',
                }}
              >
                {t('minhasfinancas.gl_simulation')}
              </span>
              <p
                data-testid="mf-goal-detail-simulation"
                style={{ margin: 0, fontSize: '0.84rem', lineHeight: 1.55 }}
              >
                {simulation}
              </p>
            </div>
          </div>
        ) : (
          <div data-testid="mf-goal-detail-panel-deposits">
            {isLinked ? (
              <p
                data-testid="mf-goal-detail-linked-hint"
                style={{
                  margin: '0 0 0.8rem',
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  lineHeight: 1.55,
                }}
              >
                {t('minhasfinancas.gl_deposit_linked_hint', { name: linkedAccount?.name || '' })}
              </p>
            ) : (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.8rem',
                }}
              >
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {t('minhasfinancas.gl_deposit_manual_hint')}
                </p>
                <button
                  type="button"
                  className="btn-primary"
                  data-testid="mf-goal-detail-add"
                  onClick={() => setAdding((prev) => !prev)}
                  style={{ padding: '0.48rem 0.8rem', fontSize: '0.8rem', flexShrink: 0 }}
                >
                  <Plus size={14} />
                  {t('minhasfinancas.gl_deposit_new')}
                </button>
              </div>
            )}

            {!isLinked && adding && (
              <form
                onSubmit={handleAdd}
                data-testid="mf-goal-detail-contrib-form"
                style={{
                  background: 'var(--input-bg)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 14,
                  padding: '0.85rem',
                  marginBottom: '0.8rem',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                  <div className="input-group">
                    <label>{t('minhasfinancas.gl_kind')}</label>
                    <MFSelect
                      testId="mf-goal-detail-kind"
                      value={form.kind}
                      onChange={(next) => setForm((prev) => ({ ...prev, kind: next }))}
                      searchable={false}
                      options={[
                        { value: 'DEPOSIT', label: t('minhasfinancas.gl_kind_deposit') },
                        { value: 'WITHDRAW', label: t('minhasfinancas.gl_kind_withdraw') },
                      ]}
                    />
                  </div>
                  <div className="input-group">
                    <label>{t('minhasfinancas.tx_amount_label')}</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={form.amount}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, amount: maskAmount(event.target.value) }))
                      }
                      placeholder="0,00"
                      data-testid="mf-goal-detail-amount"
                    />
                  </div>
                </div>
                <div className="input-group">
                  <label>{t('minhasfinancas.tx_date')}</label>
                  <input
                    type="date"
                    value={form.contribution_date}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, contribution_date: event.target.value }))
                    }
                    data-testid="mf-goal-detail-date-input"
                  />
                </div>
                <div className="input-group">
                  <label>{t('minhasfinancas.tx_notes')}</label>
                  <input
                    type="text"
                    value={form.notes}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, notes: event.target.value }))
                    }
                    data-testid="mf-goal-detail-notes"
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.6rem' }}>
                  <button
                    type="button"
                    className="btn-cancel"
                    onClick={() => {
                      setAdding(false);
                      resetForm();
                    }}
                    style={{ flex: 1 }}
                  >
                    {t('minhasfinancas.cancel')}
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    data-testid="mf-goal-detail-save"
                    disabled={saving}
                    style={{ flex: 2 }}
                  >
                    {saving ? '…' : t('minhasfinancas.save')}
                  </button>
                </div>
              </form>
            )}

            {movements.length === 0 ? (
              <p
                data-testid="mf-goal-detail-deposits-empty"
                style={{
                  margin: 0,
                  padding: '1.5rem 1rem',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '0.85rem',
                }}
              >
                {t('minhasfinancas.gl_deposits_empty')}
              </p>
            ) : (
              <div
                data-testid="mf-goal-detail-deposits"
                style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}
              >
                {movements.map((item) => {
                  const withdraw = item.kind === 'WITHDRAW';
                  return (
                    <div
                      key={item.id}
                      data-testid={`mf-goal-detail-deposit-${item.id}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                        background: 'var(--input-bg)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: 12,
                        padding: '0.55rem 0.7rem',
                      }}
                    >
                      <span
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 9,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          color: withdraw ? '#ef4444' : '#10b981',
                          background: `color-mix(in srgb, ${withdraw ? '#ef4444' : '#10b981'} 14%, transparent)`,
                        }}
                      >
                        {withdraw ? <ArrowUpFromLine size={15} /> : <ArrowDownToLine size={15} />}
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <strong
                          style={{
                            display: 'block',
                            fontSize: '0.9rem',
                            color: withdraw ? '#ef4444' : '#10b981',
                          }}
                        >
                          {withdraw ? '−' : '+'}
                          {money(Number(item.amount) || 0)}
                        </strong>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          {fmtDate(item.contribution_date)}
                          {item.notes ? ` · ${item.notes}` : ''}
                        </span>
                      </div>
                      {item.transaction_id && (
                        <span
                          title={t('minhasfinancas.gl_deposit_from_tx')}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.2rem',
                            fontSize: '0.68rem',
                            color: 'var(--text-muted)',
                            flexShrink: 0,
                          }}
                        >
                          <Link2 size={12} />
                        </span>
                      )}
                      <button
                        type="button"
                        className="icon-btn"
                        data-testid={`mf-goal-detail-deposit-del-${item.id}`}
                        aria-label={t('minhasfinancas.delete')}
                        onClick={() => handleDelete(item)}
                        style={{ flexShrink: 0 }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
