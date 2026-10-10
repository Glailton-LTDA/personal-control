import React, { useEffect, useState } from 'react';
import { X, Target } from 'lucide-react';
import MFSelect from './MFSelect';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  useMFAccounts,
  useCreateMFGoal,
  useUpdateMFGoal,
  parseMoney,
  maskAmount,
} from '../../hooks/useMinhasFinancas';

const emptyForm = {
  name: '',
  icon: '🎯',
  color: '#6366f1',
  target_amount: '',
  initial_amount: '',
  target_date: '',
  account_id: '',
};

/** Modal de criação/edição de objetivo (mf_goals). */
export default function MFGoalModal({ isOpen, onClose, goal = null, user }) {
  const { t } = useTranslation();
  const { data: accounts = [] } = useMFAccounts(user);
  const createMutation = useCreateMFGoal();
  const updateMutation = useUpdateMFGoal();

  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const isEdit = !!goal;

  useEffect(() => {
    if (!isOpen) return;
    if (goal) {
      setForm({
        name: goal.name ?? '',
        icon: goal.icon ?? '🎯',
        color: goal.color ?? '#6366f1',
        target_amount: (Number(goal.target_amount) || 0).toFixed(2).replace('.', ','),
        initial_amount: (Number(goal.initial_amount) || 0).toFixed(2).replace('.', ','),
        target_date: goal.target_date ?? '',
        account_id: goal.account_id ?? '',
      });
    } else {
      setForm(emptyForm);
    }
  }, [isOpen, goal]);

  const set = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) {
      toast.error(t('minhasfinancas.cfg_name_required'));
      return;
    }
    const target = parseMoney(form.target_amount);
    if (!(target > 0)) {
      toast.error(t('minhasfinancas.gl_target_required'));
      return;
    }
    const initial = parseMoney(form.initial_amount) || 0;

    const payload = {
      user_id: user.id,
      name,
      icon: form.icon.trim() || '🎯',
      color: form.color,
      target_amount: target,
      initial_amount: initial,
      target_date: form.target_date || null,
      account_id: form.account_id || null,
    };

    setSaving(true);
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ id: goal.id, ...payload });
        toast.success(t('minhasfinancas.gl_updated'));
      } else {
        await createMutation.mutateAsync(payload);
        toast.success(t('minhasfinancas.gl_saved'));
      }
      onClose();
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" data-testid="mf-goal-modal" onClick={onClose}>
      <div className="glass-card modal-content" onClick={(event) => event.stopPropagation()}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem',
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
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
                {t(isEdit ? 'minhasfinancas.gl_title_edit' : 'minhasfinancas.gl_title_new')}
              </h3>
              <p
                style={{
                  margin: '0.2rem 0 0',
                  fontSize: '0.85rem',
                  color: 'var(--text-muted)',
                }}
              >
                {t('minhasfinancas.gl_form_desc')}
              </p>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            <X size={22} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="input-group">
              <label>{t('minhasfinancas.cfg_name')}</label>
              <input
                type="text"
                value={form.name}
                onChange={set('name')}
                placeholder={t('minhasfinancas.gl_name_placeholder')}
                data-testid="mf-goal-name"
                required
              />
            </div>
            <div className="input-group" style={{ maxWidth: 110 }}>
              <label>{t('minhasfinancas.gl_icon')}</label>
              <input
                type="text"
                value={form.icon}
                onChange={set('icon')}
                data-testid="mf-goal-icon"
                maxLength={4}
                style={{ textAlign: 'center' }}
              />
            </div>
          </div>

          <div className="form-grid">
            <div className="input-group">
              <label>{t('minhasfinancas.gl_target')}</label>
              <input
                type="text"
                inputMode="numeric"
                value={form.target_amount}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, target_amount: maskAmount(event.target.value) }))
                }
                placeholder="0,00"
                data-testid="mf-goal-target-input"
              />
            </div>
            <div className="input-group">
              <label>{t('minhasfinancas.gl_initial')}</label>
              <input
                type="text"
                inputMode="numeric"
                value={form.initial_amount}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, initial_amount: maskAmount(event.target.value) }))
                }
                placeholder="0,00"
                data-testid="mf-goal-initial"
              />
            </div>
          </div>

          <div className="form-grid">
            <div className="input-group">
              <label>{t('minhasfinancas.gl_date')}</label>
              <input
                type="date"
                value={form.target_date}
                onChange={set('target_date')}
                data-testid="mf-goal-date"
              />
            </div>
            <div className="input-group">
              <label>{t('minhasfinancas.gl_account')}</label>
            <MFSelect
              testId="mf-goal-account"
              value={form.account_id}
              onChange={(next) => set('account_id')({ target: { value: next } })}
              placeholder={t('minhasfinancas.gl_account_none')}
              options={[
                { value: '', label: t('minhasfinancas.gl_account_none') },
                ...accounts.map((account) => ({
                  value: account.id,
                  label: account.name,
                  meta: `(${account.currency || 'BRL'})`,
                  color: account.color,
                })),
              ]}
            />
            </div>
          </div>

          <div className="input-group" style={{ maxWidth: 160 }}>
            <label>{t('minhasfinancas.cfg_color')}</label>
            <input
              type="color"
              value={form.color}
              onChange={set('color')}
              data-testid="mf-goal-color"
              style={{
                width: 44,
                height: 34,
                padding: 2,
                border: '1px solid var(--glass-border)',
                borderRadius: 10,
                background: 'transparent',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button type="button" className="btn-cancel" onClick={onClose} style={{ flex: 1 }}>
              {t('minhasfinancas.cancel')}
            </button>
            <button
              type="submit"
              className="btn-primary"
              data-testid="mf-goal-save"
              disabled={saving}
              style={{ flex: 2 }}
            >
              {saving ? '…' : t('minhasfinancas.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
