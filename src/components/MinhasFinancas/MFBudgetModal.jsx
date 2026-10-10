import React, { useEffect, useState } from 'react';
import { X, PieChart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import MFSelect from './MFSelect';
import {
  useMFAccounts,
  useMFCategories,
  useMFTags,
  useCreateMFBudget,
  useUpdateMFBudget,
  parseMoney,
  maskAmount,
  monthBounds,
} from '../../hooks/useMinhasFinancas';

const emptyForm = (monthKey) => {
  const { start, end } = monthBounds(monthKey);
  return {
    name: '',
    scopeKind: 'global',
    scopeId: '',
    period_start: start,
    period_end: end,
    mode: 'FIXED',
    amount: '',
    percent: '',
  };
};

/**
 * Modal de criação/edição de orçamento (mf_budgets).
 * Escopo: global, categoria (com filhos), tag ou conta.
 * Modo: valor fixo ou % da receita do período.
 */
export default function MFBudgetModal({ isOpen, onClose, budget = null, user, monthKey }) {
  const { t } = useTranslation();
  const { data: accounts = [] } = useMFAccounts(user);
  const { data: categories = [] } = useMFCategories(user);
  const { data: tags = [] } = useMFTags(user);
  const createMutation = useCreateMFBudget();
  const updateMutation = useUpdateMFBudget();

  const [form, setForm] = useState(emptyForm(monthKey));
  const [saving, setSaving] = useState(false);

  const isEdit = !!budget;

  useEffect(() => {
    if (!isOpen) return;
    if (budget) {
      const scopeKind = budget.category_id
        ? 'categoria'
        : budget.tag_id
        ? 'tag'
        : budget.account_id
        ? 'conta'
        : 'global';
      setForm({
        name: budget.name ?? '',
        scopeKind,
        scopeId:
          budget.category_id || budget.tag_id || budget.account_id || '',
        period_start: budget.period_start ?? '',
        period_end: budget.period_end ?? '',
        mode: budget.mode ?? 'FIXED',
        amount:
          budget.amount != null
            ? (Number(budget.amount) || 0).toFixed(2).replace('.', ',')
            : '',
        percent:
          budget.percent_of_income != null ? String(budget.percent_of_income) : '',
      });
    } else {
      setForm(emptyForm(monthKey));
    }
  }, [isOpen, budget, monthKey]);

  const set = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) {
      toast.error(t('minhasfinancas.cfg_name_required'));
      return;
    }
    if (form.period_end < form.period_start) {
      toast.error(t('minhasfinancas.bdg_period_invalid'));
      return;
    }
    if (form.scopeKind !== 'global' && !form.scopeId) {
      toast.error(t('minhasfinancas.bdg_scope_required'));
      return;
    }

    let amount = null;
    let percent = null;
    if (form.mode === 'FIXED') {
      amount = parseMoney(form.amount);
      if (!(amount > 0)) {
        toast.error(t('minhasfinancas.tx_amount_required'));
        return;
      }
    } else {
      percent = Number(String(form.percent).replace(',', '.'));
      if (!(percent > 0) || percent > 100) {
        toast.error(t('minhasfinancas.bdg_percent_invalid'));
        return;
      }
    }

    const payload = {
      user_id: user.id,
      name,
      category_id: form.scopeKind === 'categoria' ? form.scopeId : null,
      tag_id: form.scopeKind === 'tag' ? form.scopeId : null,
      account_id: form.scopeKind === 'conta' ? form.scopeId : null,
      period_start: form.period_start,
      period_end: form.period_end,
      mode: form.mode,
      amount,
      percent_of_income: percent,
    };

    setSaving(true);
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ id: budget.id, ...payload });
        toast.success(t('minhasfinancas.bdg_updated'));
      } else {
        await createMutation.mutateAsync(payload);
        toast.success(t('minhasfinancas.bdg_saved'));
      }
      onClose();
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const scopeOptions =
    form.scopeKind === 'categoria'
      ? categories.map((cat) => ({
          id: cat.id,
          label: cat.parent_id ? `└ ${cat.name}` : cat.name,
        }))
      : form.scopeKind === 'tag'
      ? tags.map((tag) => ({ id: tag.id, label: `# ${tag.name}` }))
      : form.scopeKind === 'conta'
      ? accounts.map((acc) => ({ id: acc.id, label: acc.name }))
      : [];

  return (
    <div className="modal-overlay" data-testid="mf-bdg-modal" onClick={onClose}>
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
              <PieChart size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
                {t(isEdit ? 'minhasfinancas.bdg_title_edit' : 'minhasfinancas.bdg_title_new')}
              </h3>
              <p
                style={{
                  margin: '0.2rem 0 0',
                  fontSize: '0.85rem',
                  color: 'var(--text-muted)',
                }}
              >
                {t('minhasfinancas.bdg_form_desc')}
              </p>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            <X size={22} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label>{t('minhasfinancas.cfg_name')}</label>
            <input
              type="text"
              value={form.name}
              onChange={set('name')}
              placeholder={t('minhasfinancas.bdg_name_placeholder')}
              data-testid="mf-bdg-name"
              required
            />
          </div>

          <div className="form-grid">
            <div className="input-group">
              <label>{t('minhasfinancas.bdg_scope')}</label>
              <MFSelect
                testId="mf-bdg-scope-kind"
                value={form.scopeKind}
                onChange={(next) =>
                  setForm((prev) => ({ ...prev, scopeKind: next, scopeId: '' }))
                }
                searchable={false}
                options={[
                  { value: 'global', label: t('minhasfinancas.bdg_scope_global') },
                  { value: 'categoria', label: t('minhasfinancas.bdg_scope_category') },
                  { value: 'tag', label: t('minhasfinancas.bdg_scope_tag') },
                  { value: 'conta', label: t('minhasfinancas.bdg_scope_account') },
                ]}
              />
            </div>
            <div className="input-group">
              <label>{t('minhasfinancas.bdg_scope_target')}</label>
              <MFSelect
                testId="mf-bdg-scope-id"
                value={form.scopeId}
                onChange={(next) => set('scopeId')({ target: { value: next } })}
                disabled={form.scopeKind === 'global'}
                placeholder={
                  form.scopeKind === 'global'
                    ? '—'
                    : t('minhasfinancas.bdg_scope_select')
                }
                options={[
                  {
                    value: '',
                    label:
                      form.scopeKind === 'global'
                        ? '—'
                        : t('minhasfinancas.bdg_scope_select'),
                  },
                  ...scopeOptions.map((opt) => ({ value: opt.id, label: opt.label })),
                ]}
              />
            </div>
          </div>

          <div className="form-grid">
            <div className="input-group">
              <label>{t('minhasfinancas.bdg_period_start')}</label>
              <input
                type="date"
                value={form.period_start}
                onChange={set('period_start')}
                data-testid="mf-bdg-start"
              />
            </div>
            <div className="input-group">
              <label>{t('minhasfinancas.bdg_period_end')}</label>
              <input
                type="date"
                value={form.period_end}
                onChange={set('period_end')}
                data-testid="mf-bdg-end"
              />
            </div>
          </div>

          <div className="form-grid">
            <div className="input-group">
              <label>{t('minhasfinancas.bdg_mode')}</label>
              <MFSelect
                testId="mf-bdg-mode"
                value={form.mode}
                onChange={(next) => set('mode')({ target: { value: next } })}
                searchable={false}
                options={[
                  { value: 'FIXED', label: t('minhasfinancas.bdg_mode_fixed') },
                  { value: 'PERCENT', label: t('minhasfinancas.bdg_mode_percent') },
                ]}
              />
            </div>
            {form.mode === 'FIXED' ? (
              <div className="input-group">
                <label>{t('minhasfinancas.bdg_amount')}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.amount}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, amount: maskAmount(event.target.value) }))
                  }
                  placeholder="0,00"
                  data-testid="mf-bdg-amount"
                />
              </div>
            ) : (
              <div className="input-group">
                <label>{t('minhasfinancas.bdg_percent')}</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.percent}
                  onChange={set('percent')}
                  placeholder="10"
                  data-testid="mf-bdg-percent"
                />
              </div>
            )}
          </div>

          <div className="modal-footer" style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button type="button" className="btn-cancel" onClick={onClose} style={{ flex: 1 }}>
              {t('minhasfinancas.cancel')}
            </button>
            <button
              type="submit"
              className="btn-primary"
              data-testid="mf-bdg-save"
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
