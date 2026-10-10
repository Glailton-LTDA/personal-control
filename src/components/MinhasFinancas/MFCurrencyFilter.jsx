import React from 'react';
import { useTranslation } from 'react-i18next';
import MFCurrencySelect from './MFCurrencySelect';

/**
 * Seletor de moeda por tela (decisão de produto: sem cotação —
 * escolher uma moeda filtra as contas daquela moeda; o padrão 'all'
 * mostra tudo com totais separados por moeda).
 * Visual: bandeira + código + nome, com busca no popover.
 */
export default function MFCurrencyFilter({ currencies = [], value = 'all', onChange }) {
  const { t } = useTranslation();

  return (
    <MFCurrencySelect
      value={value}
      onChange={onChange}
      currencies={currencies}
      includeAll
      allLabel={t('minhasfinancas.currency_all')}
      label={t('minhasfinancas.currency_label')}
      testId="mf-currency-filter"
      style={{ minWidth: 185 }}
    />
  );
}
