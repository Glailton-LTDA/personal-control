import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Target,
  Plus,
  Pencil,
  Trash2,
  ArrowDownToLine,
  ArrowUpFromLine,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { confirmToast } from '../../lib/toast';
import {
  useMFGoals,
  useMFGoalContributions,
  useAddMFGoalContribution,
  useDeleteMFGoalContribution,
  useUpdateMFGoal,
  useDeleteMFGoal,
  useMFAccounts,
  useMFAccountBalances,
  goalCurrentAmount,
  parseMoney,
  maskAmount,
  toISODate,
  formatMoney,
} from '../../hooks/useMinhasFinancas';
import MFGoalModal from './MFGoalModal';
import MFSelect from './MFSelect';

const emptyContribution = { kind: 'DEPOSIT', amount: '', contribution_date: '', notes: '' };

const progressBar = () => ({
  height: 10,
  borderRadius: 999,
  background: 'var(--input-bg)',
  overflow: 'hidden',
});

/**
 * Tela de Objetivos (Fase 5): metas com progresso, aportes e retiradas.
 * Objetivo vinculado a conta tem progresso automático (saldo da conta);
 * sem vínculo, o progresso vem de initial + aportes − retiradas.
 */
export default function MFObjetivos({ user, showValues = true }) {
  const { t } = useTranslation();
  const { data: goals = [] } = useMFGoals(user);
  const { data: contributions = [] } = useMFGoalContributions(user);
  const { data: accounts = [] } = useMFAccounts(user);
  const { data: balances = {} } = useMFAccountBalances(user);
  const addContribution = useAddMFGoalContribution();
  const deleteContribution = useDeleteMFGoalContribution();
  const updateGoal = useUpdateMFGoal();
  const deleteGoal = useDeleteMFGoal();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [contribFor, setContribFor] = useState(null);
  const [contrib, setContrib] = useState(emptyContribution);

  const accountsById = useMemo(
    () => Object.fromEntries(accounts.map((acc) => [acc.id, acc])),
    [accounts]
  );

  const money = (value) => (showValues ? formatMoney(value) : '•••');

  const formatDate = (iso) => {
    if (!iso) return null;
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y.slice(2)}`;
  };

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (goal) => {
    setEditing(goal);
    setModalOpen(true);
  };

  const handleDelete = (goal) => {
    confirmToast(
      t('minhasfinancas.gl_delete_confirm', { name: goal.name }),
      async () => {
        try {
          await deleteGoal.mutateAsync(goal.id);
          toast.success(t('minhasfinancas.gl_deleted'));
        } catch {
          toast.error(t('minhasfinancas.save_error'));
        }
      },
      { danger: true, confirmText: t('minhasfinancas.delete') }
    );
  };

  const openContribution = (goal, kind) => {
    setContribFor(goal);
    setContrib({
      kind,
      amount: '',
      contribution_date: toISODate(new Date()),
      notes: '',
    });
  };

  const handleContribution = async (event) => {
    event.preventDefault();
    const amount = parseMoney(contrib.amount);
    if (!(amount > 0)) {
      toast.error(t('minhasfinancas.tx_amount_required'));
      return;
    }
    try {
      await addContribution.mutateAsync({
        user_id: user.id,
        goal_id: contribFor.id,
        kind: contrib.kind,
        amount,
        contribution_date: contrib.contribution_date || toISODate(new Date()),
        notes: contrib.notes.trim() || null,
      });
      // atinge a meta → marca como concluída
      const nextCurrent = goalCurrentAmount(
        contribFor,
        [
          ...contributions,
          { goal_id: contribFor.id, kind: contrib.kind, amount },
        ],
        balances[contribFor.account_id]
      );
      if (
        contribFor.status === 'ACTIVE' &&
        nextCurrent >= (Number(contribFor.target_amount) || 0)
      ) {
        await updateGoal.mutateAsync({ id: contribFor.id, status: 'COMPLETED' });
        toast.success(t('minhasfinancas.gl_target_reached'));
      } else {
        toast.success(t('minhasfinancas.gl_mov_saved'));
      }
      setContribFor(null);
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    }
  };

  const handleDeleteContribution = (item) => {
    confirmToast(t('minhasfinancas.gl_mov_delete_confirm'), async () => {
      try {
        await deleteContribution.mutateAsync(item.id);
        toast.success(t('minhasfinancas.cfg_deleted'));
      } catch {
        toast.error(t('minhasfinancas.save_error'));
      }
    }, { danger: true, confirmText: t('minhasfinancas.delete') });
  };

  return (
    <div data-testid="mf-objetivos" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
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
            <Target size={22} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>
              {t('nav.sub.minhasfinancas.goals')}
            </h2>
            <p style={{ margin: '0.15rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {t('minhasfinancas.goals_desc')}
            </p>
          </div>
        </div>

        <button
          type="button"
          className="btn-primary"
          data-testid="mf-new-goal"
          onClick={openNew}
          style={{ padding: '0.65rem 1rem', fontSize: '0.85rem' }}
        >
          <Plus size={16} />
          {t('minhasfinancas.goal_new')}
        </button>
      </div>

      {/* Vazio */}
      {goals.length === 0 && (
        <div className="glass-card" data-testid="mf-goals-empty" style={{ padding: '3rem 2rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', margin: '0 0 1.25rem' }}>
            {t('minhasfinancas.gl_empty')}
          </p>
          <button type="button" className="btn-primary" onClick={openNew} style={{ display: 'inline-flex' }}>
            <Plus size={16} />
            {t('minhasfinancas.goal_new')}
          </button>
        </div>
      )}

      {/* Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))',
          gap: '1rem',
        }}
      >
        {goals.map((goal) => {
          const current = goalCurrentAmount(
            goal,
            contributions,
            balances[goal.account_id]
          );
          const target = Number(goal.target_amount) || 0;
          const pct = target > 0 ? (current / target) * 100 : 0;
          const reached = current >= target;
          const archived = goal.status === 'ARCHIVED';
          const barColor = archived
            ? '#94a3b8'
            : reached
            ? '#10b981'
            : goal.color || 'var(--primary)';
          const linkedAccount = goal.account_id ? accountsById[goal.account_id] : null;
          const goalContributions = contributions.filter((item) => item.goal_id === goal.id);

          return (
            <div
              key={goal.id}
              className="glass-card"
              data-testid="mf-goal-card"
              style={{ padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
                  <span
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 12,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.1rem',
                      background: `color-mix(in srgb, ${goal.color || 'var(--primary)'} 16%, transparent)`,
                    }}
                  >
                    {goal.icon || '🎯'}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ fontSize: '0.98rem', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {goal.name}
                    </strong>
                    {goal.target_date && (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {t('minhasfinancas.gl_due')} {formatDate(goal.target_date)}
                      </span>
                    )}
                  </div>
                </div>
                <span style={{ display: 'inline-flex', gap: '0.25rem', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="icon-btn"
                    data-testid={`mf-goal-edit-${goal.id}`}
                    aria-label={t('minhasfinancas.edit')}
                    onClick={() => openEdit(goal)}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    data-testid={`mf-goal-del-${goal.id}`}
                    aria-label={t('minhasfinancas.delete')}
                    onClick={() => handleDelete(goal)}
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 800, color: barColor }} data-testid="mf-goal-current">
                  {money(current)}
                </span>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  {t('minhasfinancas.bdg_of')} <span data-testid="mf-goal-target">{money(target)}</span>
                </span>
              </div>

              <div style={progressBar()}>
                <div
                  data-testid="mf-goal-progress"
                  style={{
                    width: `${Math.min(100, pct)}%`,
                    height: '100%',
                    background: barColor,
                    transition: 'width 0.3s',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: barColor }} data-testid="mf-goal-pct">
                  {t('minhasfinancas.bdg_pct', { pct: Math.round(pct) })}
                </span>
                <span>
                  {archived ? (
                    <span style={statusChip('#94a3b8')}>{t('minhasfinancas.gl_archived')}</span>
                  ) : reached ? (
                    <span data-testid="mf-goal-badge-completed" style={statusChip('#10b981')}>
                      {t('minhasfinancas.gl_completed')}
                    </span>
                  ) : (
                    <span style={statusChip('var(--primary)')}>{t('minhasfinancas.gl_active')}</span>
                  )}
                </span>
              </div>

              {linkedAccount && (
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  🔄 {t('minhasfinancas.gl_linked_hint', { name: linkedAccount.name })}
                </div>
              )}

              {/* Ações de aporte */}
              {!linkedAccount && !archived && (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn-primary"
                    data-testid={`mf-goal-deposit-${goal.id}`}
                    onClick={() => openContribution(goal, 'DEPOSIT')}
                    style={{ flex: 1, padding: '0.5rem', fontSize: '0.8rem' }}
                  >
                    <ArrowDownToLine size={14} /> {t('minhasfinancas.gl_deposit')}
                  </button>
                  <button
                    type="button"
                    className="btn-cancel"
                    data-testid={`mf-goal-withdraw-${goal.id}`}
                    onClick={() => openContribution(goal, 'WITHDRAW')}
                    style={{ flex: 1, padding: '0.5rem', fontSize: '0.8rem' }}
                  >
                    <ArrowUpFromLine size={14} /> {t('minhasfinancas.gl_withdraw')}
                  </button>
                </div>
              )}

              {/* Movimentos recentes */}
              {goalContributions.length > 0 && (
                <div data-testid="mf-goal-movements" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.2rem' }}>
                  <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', fontWeight: 800 }}>
                    {t('minhasfinancas.gl_movements')}
                  </span>
                  {goalContributions.slice(0, 3).map((item) => (
                    <div
                      key={item.id}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}
                    >
                      {item.kind === 'WITHDRAW' ? (
                        <ArrowUpFromLine size={13} style={{ color: '#ef4444' }} />
                      ) : (
                        <ArrowDownToLine size={13} style={{ color: '#10b981' }} />
                      )}
                      <span style={{ color: item.kind === 'WITHDRAW' ? '#ef4444' : '#10b981', fontWeight: 700 }}>
                        {item.kind === 'WITHDRAW' ? '−' : '+'}
                        {showValues ? formatMoney(Number(item.amount) || 0) : '•••'}
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>{formatDate(item.contribution_date)}</span>
                      <button
                        type="button"
                        className="icon-btn"
                        data-testid={`mf-contrib-del-${item.id}`}
                        aria-label={t('minhasfinancas.delete')}
                        onClick={() => handleDeleteContribution(item)}
                        style={{ marginLeft: 'auto' }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal de objetivo */}
      <MFGoalModal
        isOpen={modalOpen}
        goal={editing}
        user={user}
        onClose={() => setModalOpen(false)}
      />

      {/* Modal de movimento */}
      {contribFor && (
        <div className="modal-overlay" data-testid="mf-goal-contrib" onClick={() => setContribFor(null)}>
          <div
            className="glass-card modal-content"
            onClick={(event) => event.stopPropagation()}
            style={{ maxWidth: 430 }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1.25rem',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>
                {contribFor.icon} {contribFor.name} ·{' '}
                {contrib.kind === 'DEPOSIT'
                  ? t('minhasfinancas.gl_deposit')
                  : t('minhasfinancas.gl_withdraw')}
              </h3>
              <button
                type="button"
                className="icon-btn"
                aria-label="Fechar"
                onClick={() => setContribFor(null)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleContribution}>
              <div className="form-grid">
                <div className="input-group">
                  <label>{t('minhasfinancas.gl_kind')}</label>
                  <MFSelect
                    testId="mf-contrib-kind"
                    value={contrib.kind}
                    onChange={(next) => setContrib((prev) => ({ ...prev, kind: next }))}
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
                    value={contrib.amount}
                    onChange={(event) =>
                      setContrib((prev) => ({ ...prev, amount: maskAmount(event.target.value) }))
                    }
                    placeholder="0,00"
                    data-testid="mf-contrib-amount"
                  />
                </div>
              </div>

              <div className="input-group">
                <label>{t('minhasfinancas.tx_date')}</label>
                <input
                  type="date"
                  value={contrib.contribution_date}
                  onChange={(event) =>
                    setContrib((prev) => ({ ...prev, contribution_date: event.target.value }))
                  }
                  data-testid="mf-contrib-date"
                />
              </div>

              <div className="input-group">
                <label>{t('minhasfinancas.tx_notes')}</label>
                <input
                  type="text"
                  value={contrib.notes}
                  onChange={(event) =>
                    setContrib((prev) => ({ ...prev, notes: event.target.value }))
                  }
                  data-testid="mf-contrib-notes"
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setContribFor(null)}
                  style={{ flex: 1 }}
                >
                  {t('minhasfinancas.cancel')}
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  data-testid="mf-contrib-save"
                  style={{ flex: 2 }}
                >
                  {t('minhasfinancas.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const statusChip = (color) => ({
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
