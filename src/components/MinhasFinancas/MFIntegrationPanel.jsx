import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Link2, Plane } from 'lucide-react';
import MFSelect from './MFSelect';
import { useMFLinkTrips } from '../../hooks/useMFIntegrationOptions';
import { formatMoney } from '../../hooks/useMinhasFinancas';

const fmtDate = (iso) =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—';

const tripPeriod = (trip) =>
  trip?.start_date || trip?.end_date
    ? `${fmtDate(trip.start_date)} – ${fmtDate(trip.end_date)}`
    : '';

/**
 * Bloco "Integrar com outros módulos" da tela de lançamento.
 *
 * Não grava nada: devolve a escolha (`value.tripEnabled` / `value.tripId`).
 * A gravação atômica fica na RPC `mf_save_tx_linked`, chamada pela tela.
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
  offline = false,
  linked = false,
  value = {},
  onChange = () => {},
}) {
  const { t } = useTranslation();
  const tripEnabled = Boolean(value.tripEnabled);
  const tripId = value.tripId ?? '';

  const isCard = account?.account_type === 'CARTAO';
  // Motivo vem pronto da tela; os fallbacks cobrem uso isolado do painel.
  const reason =
    disabledReason ||
    (offline
      ? linked
        ? 'offline_linked'
        : 'offline'
      : type === 'TRANSFERENCIA'
        ? 'transfer'
        : (status ?? 'PAGO') !== 'PAGO'
          ? 'pending'
          : type === 'RECEITA'
            ? 'income'
            : !account
              ? 'account'
              : null);
  const reasonText = reason ? t(`minhasfinancas.integration_disabled_${reason}`) : null;
  const disabled = Boolean(reason);

  const { data: trips = [], isLoading } = useMFLinkTrips(
    user,
    tripEnabled || Boolean(tripId)
  );
  const trip = trips.find((row) => row.id === tripId) ?? null;
  const currency = account?.currency || 'BRL';
  const money = (val) => formatMoney(Number(val) || 0, currency);

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
    if (disabled) return;
    onChange({
      ...value,
      tripEnabled: !tripEnabled,
      tripId: tripEnabled ? '' : tripId,
    });
  };

  return (
    <section
      data-testid="mf-integration"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
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

      {disabled && (
        <p
          data-testid="mf-integration-disabled"
          style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}
        >
          {reasonText}
        </p>
      )}

      {disabled && tripEnabled && trip && (
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
          disabled={disabled}
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

      {tripEnabled && !disabled && (
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
    </section>
  );
}
