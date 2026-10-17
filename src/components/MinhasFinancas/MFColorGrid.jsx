import React from 'react';
import { Check } from 'lucide-react';
import { MF_CATEGORY_COLORS } from './MFCategoryIcons';

/**
 * Fileira de cores do seletor (MF_CATEGORY_COLORS, 19 tons): círculos com a
 * selecionada marcada por ✓. Mesma paleta do app original — sem a grade de
 * 54 tons.
 */
export default function MFColorGrid({
  value,
  onChange,
  testId = 'mf-color',
  columns = 10,
  size = 30,
}) {
  return (
    <div
      role="radiogroup"
      data-testid={testId}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, ${size}px)`,
        gap: '0.6rem',
        justifyContent: 'start',
      }}
    >
      {MF_CATEGORY_COLORS.map((swatch, index) => {
        const active = value === swatch;
        return (
          <button
            key={swatch}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={swatch}
            title={swatch}
            data-testid={`${testId}-${index}`}
            onClick={() => onChange?.(swatch)}
            style={{
              width: size,
              height: size,
              borderRadius: '50%',
              border: 'none',
              outline: active ? '2px solid var(--text-main)' : '2px solid transparent',
              outlineOffset: 2,
              background: swatch,
              color: '#fff',
              cursor: 'pointer',
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {active && <Check size={Math.round(size * 0.45)} />}
          </button>
        );
      })}
    </div>
  );
}
