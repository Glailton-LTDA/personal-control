import React, { useEffect, useMemo, useRef, useState } from 'react';
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
export default function MFGlobalCalculator({
  user,
  accounts = [],
  defaultAccountId = null,
  buttonStyle = null,
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState('');
  // A conta contextual (detalhe da conta/cartão) vale na ABERTURA. Depois
  // disso o usuário manda: trocar no seletor não pode ser desfeito pelo
  // efeito a cada render.
  const openAppliedRef = useRef(false);

  const options = useMemo(
    () =>
      (accounts ?? []).filter(
        (account) => !account.archived_at && account.account_type !== 'CARTAO'
      ),
    [accounts]
  );

  useEffect(() => {
    if (!open) {
      openAppliedRef.current = false;
      return;
    }
    const preferred =
      options.find((account) => account.id === defaultAccountId)?.id ??
      options.find((account) => account.id === accountId)?.id ??
      options[0]?.id ??
      '';
    if (!preferred) return;
    if (!openAppliedRef.current) {
      openAppliedRef.current = true;
      setAccountId(preferred);
    }
  }, [open, options, defaultAccountId, accountId]);

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
