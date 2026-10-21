import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatMonthNavLabel, shiftMonth, currentMonthKey } from '../../hooks/useMinhasFinancas';
import MFSelect from './MFSelect';

const HOLD_MS = 500; // clique e segure → abre o filtro (padrão do app MF)

const capitalize = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

/**
 * Modal "Filtrar" — vai direto para um mês/ano sem ficar clicando setinha
 * (replica o clique e segure do Minhas Finanças original).
 */
function MFMonthFilterModal({ monthKey, onApply, onClose }) {
  const { t, i18n } = useTranslation();
  const [month, setMonth] = useState(() => Number(monthKey.slice(5, 7)));
  const [year, setYear] = useState(() => Number(monthKey.slice(0, 4)));

  const monthNames = Array.from({ length: 12 }, (_, i) =>
    capitalize(new Intl.DateTimeFormat(i18n.language, { month: 'long' }).format(new Date(2001, i, 1)))
  );
  const thisYear = new Date().getFullYear();
  // Anos do mais recente para o mais velho (ano atual + 1 no topo → −10).
  const years = [];
  for (let y = thisYear + 1; y >= thisYear - 10; y -= 1) years.push(y);
  if (!years.includes(year)) {
    // mantém o ano visualizado mesmo fora da faixa, sem quebrar a ordem
    years.push(year);
    years.sort((a, b) => b - a);
  }

  const apply = () => {
    onApply(`${year}-${String(month).padStart(2, '0')}`);
    onClose();
  };

  // Portal no body: a `.glass-card` (backdrop-filter) do cabeçalho cria
  // containing block e stacking context — montado dentro dela, o overlay
  // `position: fixed` ficava recortado na altura do card e atrás do conteúdo.
  return createPortal(
    <div className="modal-overlay" data-testid="mf-month-filter" onClick={onClose}>
      <div
        className="glass-card modal-content"
        onClick={(event) => event.stopPropagation()}
        style={{ maxWidth: '360px' }}
      >
        <h3 style={{ margin: '0 0 1rem', fontSize: '1.15rem', fontWeight: 800 }}>
          {t('minhasfinancas.filter_title')}
        </h3>

        <div className="input-group" style={{ marginBottom: '0.9rem' }}>
          <label htmlFor="mf-filter-month">{t('minhasfinancas.filter_month')}</label>
          <MFSelect
            id="mf-filter-month"
            testId="mf-month-filter-month"
            value={month}
            onChange={setMonth}
            searchable={false}
            options={monthNames.map((name, index) => ({ value: index + 1, label: name }))}
          />
        </div>

        <div className="input-group" style={{ marginBottom: 0 }}>
          <label htmlFor="mf-filter-year">{t('minhasfinancas.filter_year')}</label>
          <MFSelect
            id="mf-filter-year"
            testId="mf-month-filter-year"
            value={year}
            onChange={setYear}
            searchable={false}
            options={years.map((y) => ({ value: y, label: String(y) }))}
          />
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.6rem',
            marginTop: '1.25rem',
          }}
        >
          <button
            type="button"
            className="btn-cancel"
            data-testid="mf-month-filter-cancel"
            onClick={onClose}
            style={{ padding: '0.55rem 1rem', fontSize: '0.85rem' }}
          >
            {t('minhasfinancas.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary"
            data-testid="mf-month-filter-ok"
            onClick={apply}
            style={{ padding: '0.55rem 1rem', fontSize: '0.85rem' }}
          >
            {t('minhasfinancas.filter_ok')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Navegador de mês compartilhado pelas telas do módulo Minhas Finanças.
 * `monthKey` tem fallback para o mês atual (protege contra render sem props).
 *
 * - setas: mês anterior/próximo;
 * - clique no rótulo: volta para o mês vigente;
 * - clique e segure (ou botão direito): abre o modal "Filtrar" (mês + ano),
 *   igual ao app Minhas Finanças original.
 */
export default function MFMonthNav({ monthKey, onChange }) {
  const { t, i18n } = useTranslation();
  const key = monthKey || currentMonthKey();
  const [filterOpen, setFilterOpen] = useState(false);
  const holdTimer = useRef(null);
  const longPressed = useRef(false);

  useEffect(
    () => () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    },
    []
  );

  const go = (delta) => {
    if (typeof onChange === 'function') onChange(shiftMonth(key, delta));
  };

  const startHold = () => {
    longPressed.current = false;
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => {
      longPressed.current = true;
      setFilterOpen(true);
    }, HOLD_MS);
  };
  const cancelHold = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };
  const handleLabelClick = () => {
    // O clique que fecha um clique-e-segure não pode pular para "hoje".
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    if (typeof onChange === 'function') onChange(currentMonthKey());
  };

  return (
    <div
      data-testid="mf-month-nav"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.25rem',
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid var(--glass-border)',
        borderRadius: '12px',
        padding: '0.25rem',
      }}
    >
      <button
        type="button"
        className="icon-btn"
        data-testid="mf-month-prev"
        aria-label={t('minhasfinancas.month_prev')}
        onClick={() => go(-1)}
      >
        <ChevronLeft size={18} />
      </button>
      <button
        type="button"
        data-testid="mf-month-label"
        title={t('minhasfinancas.month_nav_hint')}
        aria-label={t('minhasfinancas.month_nav_hint')}
        onClick={handleLabelClick}
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
        onContextMenu={(event) => {
          event.preventDefault();
          cancelHold();
          longPressed.current = false;
          setFilterOpen(true);
        }}
        style={{
          minWidth: '150px',
          minHeight: '32px',
          textAlign: 'center',
          fontWeight: 700,
          fontSize: '0.82rem',
          textTransform: 'capitalize',
          background: 'transparent',
          border: 'none',
          borderRadius: 8,
          color: 'inherit',
          cursor: 'pointer',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          touchAction: 'manipulation',
        }}
      >
        {formatMonthNavLabel(key, i18n.language)}
      </button>
      <button
        type="button"
        className="icon-btn"
        data-testid="mf-month-next"
        aria-label={t('minhasfinancas.month_next')}
        onClick={() => go(1)}
      >
        <ChevronRight size={18} />
      </button>

      {filterOpen && (
        <MFMonthFilterModal
          monthKey={key}
          onApply={(nextKey) => {
            if (typeof onChange === 'function') onChange(nextKey);
          }}
          onClose={() => setFilterOpen(false)}
        />
      )}
    </div>
  );
}
