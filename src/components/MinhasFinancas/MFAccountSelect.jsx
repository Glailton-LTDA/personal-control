import React from 'react';
import { useTranslation } from 'react-i18next';
import MFSelect from './MFSelect';

/**
 * Seletor de contas — wrapper do MFSelect genérico com o mapeamento de
 * `accounts` para opções (cor + nome + moeda). Mantém a mesma API e os
 * mesmos testids (`<testId>`, `-popover`, `-search`, `-option-<id>`,
 * `-none`) usados pelo editor de lançamentos e pelos testes.
 */
export default function MFAccountSelect({
  value = '',
  onChange,
  accounts = [],
  placeholder,
  testId = 'mf-account-select',
  style,
}) {
  const { t } = useTranslation();

  const options = accounts.map((account) => ({
    value: account.id,
    label: account.name,
    meta: `(${account.currency || 'BRL'})`,
    color: account.color,
  }));

  return (
    <MFSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      emptyLabel={t('minhasfinancas.account_no_results')}
      ariaLabel={placeholder ?? t('minhasfinancas.tx_account_label')}
      testId={testId}
      style={style}
    />
  );
}
