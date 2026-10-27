import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Link2, Plane, TrendingUp } from 'lucide-react';
import MFSelect from './MFSelect';
import { useMFLinkInvestments, useMFLinkTrips } from '../../hooks/useMFIntegrationOptions';
import { formatMoney, formatMonthLabel } from '../../hooks/useMinhasFinancas';

const fmtDate = (iso) =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—';

const tripPeriod = (trip) =>
  trip?.start_date || trip?.end_date
    ? `${fmtDate(trip.start_date)} – ${fmtDate(trip.end_date)}`
    : '';

/**
 * Bloco "Integrar com outros módulos" da tela de lançamento.
 *
 * Não grava nada: devolve as escolhas (`tripEnabled`/`tripId` e
 * `investmentEnabled`/`investmentAccountId`). A gravação atômica fica na
 * RPC `mf_save_tx_linked`, chamada pela tela.
 */
export default function MFIntegrationPanel({
  user,
  account,
  type,
  amount = 0,
  mirrorAmount = 0,
  installmentCount = 0,
  paymentDate = '',
  status,
  disabledReason = null,
  tripDisabledReason = undefined,
  investmentDisabledReason = undefined,
  offline = false,
  linked = false,
  value = {},
  onChange = () => {},
}) {
  const { t, i18n } = useTranslation();
  const tripEnabled = Boolean(value.tripEnabled);
  const tripId = value.tripId ?? '';
  const investmentEnabled = Boolean(value.investmentEnabled);
  const investmentAccountId = value.investmentAccountId ?? '';

  const isCard = account?.account_type === 'CARTAO';
  // Motivo base vem pronto da tela; os fallbacks cobrem uso isolado do painel.
  const baseReason =
    disabledReason ||
    (offline
      ? linked
        ? 'offline_linked'
        : 'offline'
      : type === 'TRANSFERENCIA'
        ? 'transfer'
        : (status ?? 'PAGO') !== 'PAGO'
          ? 'pending'
          : !account
            ? 'account'
            : null);
  // Receita só vai para investimento; cartão só vai para viagem.
  const tripReason =
    tripDisabledReason !== undefined
      ? tripDisabledReason
      : baseReason || (type === 'RECEITA' ? 'income' : null);
  const investmentReason =
    investmentDisabledReason !== undefined
      ? investmentDisabledReason
      : baseReason || (isCard ? 'card' : null);

  const { data: trips = [], isLoading } = useMFLinkTrips(
    user,
    tripEnabled || Boolean(tripId)
  );
  const { data: investments = [], isLoading: invLoading } = useMFLinkInvestments(
    user,
    investmentEnabled || Boolean(investmentAccountId)
  );
  const trip = trips.find((row) => row.id === tripId) ?? null;
  const currency = account?.currency || 'BRL';
  const money = (val) => formatMoney(Number(val) || 0, currency);

  // Só contas de investimento na MESMA moeda da conta do lançamento
  // (sem conversão): as outras nem aparecem na lista.
  const investmentOptions = investments
    .filter((row) => (row.currency || 'BRL') === currency)
    .map((row) => ({
      value: row.id,
      label: row.name,
      meta: row.institution?.name || '',
      group: row.institution?.name || t('minhasfinancas.integration_investment_no_institution'),
      icon: <TrendingUp size={14} />,
    }));
  const investment = investments.find((row) => row.id === investmentAccountId) ?? null;

  const lastKey = `mf_investment_last_${currency}`;
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const prefilled = useRef(false);

  // "Última usada": quando o bloco de investimento liga e a conta ainda não
  // foi escolhida, tenta a última da moeda (ou a única disponível).
  useEffect(() => {
    if (!investmentEnabled || investmentAccountId || invLoading) return;
    if (prefilled.current) return;
    prefilled.current = true;
    let saved = '';
    try {
      saved = localStorage.getItem(lastKey) || '';
    } catch {
      saved = '';
    }
    const pick =
      investmentOptions.some((row) => row.value === saved)
        ? saved
        : investmentOptions.length === 1
          ? investmentOptions[0].value
          : '';
    if (pick) {
      const { value: current, onChange: emit } = latest.current;
      emit({ ...current, investmentAccountId: pick });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [investmentEnabled, investmentAccountId, invLoading, investmentOptions.length, lastKey]);

  const outOfRange =
    trip &&
    paymentDate &&
    ((trip.start_date && paymentDate < trip.start_date) ||
      (trip.end_date && paymentDate > trip.end_date));
  const missingCurrency =
    trip &&
    Array.isArray(trip.currencies) &&
    trip.currencies.length > 0 &&
    !trip.currencies.includes(currency);

  const toggle = () => {
    if (tripReason) return;
    onChange({
      ...value,
      tripEnabled: !tripEnabled,
      tripId: tripEnabled ? '' : tripId,
    });
  };

  const toggleInvestment = () => {
    if (investmentReason) return;
    if (investmentEnabled) {
      prefilled.current = false;
      onChange({ ...value, investmentEnabled: false, investmentAccountId: '' });
      return;
    }
    prefilled.current = false;
    onChange({ ...value, investmentEnabled: true, investmentAccountId: '' });
  };

  const selectInvestment = (next) => {
    try {
      localStorage.setItem(lastKey, next);
    } catch {
      /* sem localStorage: segue sem lembrar */
    }
    onChange({ ...value, investmentAccountId: next });
  };

  const tripReasonText = tripReason
    ? t(`minhasfinancas.integration_disabled_${tripReason}`)
    : null;
  const investmentReasonText = investmentReason
    ? t(`minhasfinancas.integration_disabled_${investmentReason}`)
    : null;
  const investmentDelta =
    (Number(mirrorAmount) || 0) * (type === 'RECEITA' ? 1 : -1);
  const investmentMonth = paymentDate
    ? formatMonthLabel(paymentDate.slice(0, 7), i18n.language)
    : '';

  return (
    <section
      data-testid="mf-integration"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem',
        border: '1px solid var(--glass-border)',
        borderRadius: 14,
        padding: '1rem',
        background: 'color-mix(in srgb, var(--primary) 4%, transparent)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800 }}>
        <Link2 size={16} />
        <span>{t('minhasfinancas.integration_title')}</span>
      </div>

      {/* Viagem */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {tripReason && (
          <p
            data-testid="mf-integration-disabled"
            style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}
          >
            {tripReasonText}
          </p>
        )}

        {tripReason && tripEnabled && trip && (
          <p
            data-testid="mf-integration-linked-trip"
            style={{ margin: 0, color: 'var(--text-main)', fontSize: '0.85rem', fontWeight: 600 }}
          >
            {t('minhasfinancas.integration_linked_trip', { trip: trip.title })}
          </p>
        )}

        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
          <input
            type="checkbox"
            data-testid="mf-integration-trip-toggle"
            aria-label={t('minhasfinancas.integration_trip_title')}
            checked={tripEnabled}
            disabled={Boolean(tripReason)}
            onChange={toggle}
            style={{ marginTop: 3 }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
              {t('minhasfinancas.integration_trip_title')}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              {isCard
                ? t('minhasfinancas.integration_trip_desc_card')
                : t('minhasfinancas.integration_trip_desc')}
            </span>
          </div>
        </div>

        {tripEnabled && !tripReason && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <MFSelect
              testId="mf-integration-trip-select"
              value={tripId}
              onChange={(next) => onChange({ ...value, tripId: next })}
              options={trips.map((row) => ({
                value: row.id,
                label: row.title,
                meta: tripPeriod(row),
                icon: <Plane size={14} />,
              }))}
              placeholder={
                isLoading
                  ? t('common.loading')
                  : t('minhasfinancas.integration_trip_placeholder')
              }
              searchable
              emptyLabel={t('minhasfinancas.integration_trip_empty')}
              ariaLabel={t('minhasfinancas.integration_trip_select')}
            />

            {!tripId && (
              <span
                data-testid="mf-integration-trip-required"
                style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}
              >
                {t('minhasfinancas.integration_trip_required')}
              </span>
            )}

            {tripId && (
              <div
                data-testid="mf-integration-preview"
                style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontSize: '0.82rem' }}
              >
                <span>
                  {t('minhasfinancas.integration_trip_preview', {
                    trip: trip?.title ?? '',
                    date: fmtDate(paymentDate),
                    value: money(mirrorAmount || amount),
                  })}
                </span>
                {installmentCount > 1 && (
                  <span style={{ color: 'var(--text-muted)' }}>
                    {t('minhasfinancas.integration_trip_installments', {
                      total: money(mirrorAmount || amount),
                      count: installmentCount,
                      each: money(amount),
                    })}
                  </span>
                )}
              </div>
            )}

            {tripId && outOfRange && (
              <span
                data-testid="mf-integration-trip-warning"
                style={{ display: 'flex', gap: '0.4rem', color: '#f59e0b', fontSize: '0.82rem' }}
              >
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  {t('minhasfinancas.integration_trip_out_of_range', {
                    date: fmtDate(paymentDate),
                    period: tripPeriod(trip),
                  })}
                </span>
              </span>
            )}

            {tripId && missingCurrency && (
              <span
                data-testid="mf-integration-trip-currency"
                style={{ display: 'flex', gap: '0.4rem', color: '#f59e0b', fontSize: '0.82rem' }}
              >
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  {t('minhasfinancas.integration_trip_currency', {
                    currency,
                    trip: trip?.title ?? '',
                  })}
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Investimento */}
      <div
        data-testid="mf-integration-investment"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem',
          borderTop: '1px dashed var(--glass-border)',
          paddingTop: '0.75rem',
        }}
      >
        {investmentReason && (
          <p
            data-testid="mf-integration-investment-disabled"
            style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}
          >
            {investmentReasonText}
          </p>
        )}

        {investmentReason && investmentEnabled && investment && (
          <p
            data-testid="mf-integration-linked-investment"
            style={{ margin: 0, color: 'var(--text-main)', fontSize: '0.85rem', fontWeight: 600 }}
          >
            {t('minhasfinancas.integration_linked_investment', {
              account: investment.name,
            })}
          </p>
        )}

        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
          <input
            type="checkbox"
            data-testid="mf-integration-investment-toggle"
            aria-label={t('minhasfinancas.integration_investment_title')}
            checked={investmentEnabled}
            disabled={Boolean(investmentReason)}
            onChange={toggleInvestment}
            style={{ marginTop: 3 }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
              {t('minhasfinancas.integration_investment_title')}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              {t('minhasfinancas.integration_investment_desc')}
            </span>
          </div>
        </div>

        {investmentEnabled && !investmentReason && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <MFSelect
              testId="mf-integration-investment-select"
              value={investmentAccountId}
              onChange={selectInvestment}
              options={investmentOptions}
              placeholder={
                invLoading
                  ? t('common.loading')
                  : t('minhasfinancas.integration_investment_placeholder')
              }
              searchable
              emptyLabel={t('minhasfinancas.integration_investment_empty', { currency })}
              ariaLabel={t('minhasfinancas.integration_investment_select')}
            />

            {investmentOptions.length === 0 && !invLoading && (
              <span
                data-testid="mf-integration-investment-empty"
                style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}
              >
                {t('minhasfinancas.integration_investment_empty', { currency })}
              </span>
            )}

            {!investmentAccountId && investmentOptions.length > 0 && (
              <span
                data-testid="mf-integration-investment-required"
                style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}
              >
                {t('minhasfinancas.integration_investment_required')}
              </span>
            )}

            {investmentAccountId && (
              <div
                data-testid="mf-integration-investment-preview"
                style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontSize: '0.82rem' }}
              >
                <span>
                  {t('minhasfinancas.integration_investment_preview', {
                    value: money(investmentDelta),
                    account: investment?.name ?? '',
                    month: investmentMonth,
                  })}
                </span>
                {installmentCount > 1 && (
                  <span style={{ color: 'var(--text-muted)' }}>
                    {t('minhasfinancas.integration_investment_installments', {
                      total: money(investmentDelta),
                      count: installmentCount,
                    })}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
