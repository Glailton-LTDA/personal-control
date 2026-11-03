import React, { useEffect, useMemo, useState } from 'react';
import { Calculator } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useMFAccountBalances } from '../../hooks/useMinhasFinancas';
import MFCalculator from './MFCalculator';

/**
 * Calculadora global do Minhas Finanças: abre de qualquer tela do módulo,
 * sem precisar entrar em um lançamento. O seletor de conta permite inserir
 * o saldo corrente (PAGO até hoje) na expressão. O resultado é copiado ao
 * confirmar.
 */
export default function MFGlobalCalculator({ user, accounts = [], buttonStyle = null }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState('');

  const options = useMemo(
    () =>
      (accounts ?? []).filter(
        (account) => !account.archived_at && account.account_type !== 'CARTAO'
      ),
    [accounts]
  );

  useEffect(() => {
    if (!open) return;
    if (!options.some((account) => account.id === accountId)) {
      setAccountId(options[0]?.id ?? '');
    }
  }, [open, options, accountId]);

  // Só busca o saldo quando a calculadora está aberta e há conta escolhida.
  const { data: balances = {} } = useMFAccountBalances(
    user,
    open && accountId ? [accountId] : []
  );

  const close = () => setOpen(false);

  const confirm = async (value) => {
    try {
      await navigator.clipboard?.writeText?.(value);
      toast.success(t('minhasfinancas.calc_copied'));
    } catch {
      toast.success(value);
    }
    close();
  };

  return (
    <>
      <button
        type="button"
        className="icon-btn"
        data-testid="mf-global-calc-open"
        aria-label={t('minhasfinancas.calc_title')}
        title={t('minhasfinancas.calc_title')}
        onClick={() => setOpen(true)}
        style={buttonStyle}
      >
        <Calculator size={18} />
      </button>

      {open && (
        <MFCalculator
          testId="mf-global-calc"
          title={t('minhasfinancas.calc_title')}
          accounts={options}
          balances={balances}
          selectedAccountId={accountId}
          onSelectAccount={setAccountId}
          onConfirm={confirm}
          onClose={close}
        />
      )}
    </>
  );
}
