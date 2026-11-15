import { describe, it, expect } from 'vitest';
import {
  DOSE_UNITS,
  PRESENTATION_DEFAULT_UNIT,
  formatDose,
  isDoseUnit,
  normalizeDoseUnit,
  presentationDefaultUnit,
} from './doseUnits';
import pt from '../locales/health-pt.json';
import en from '../locales/health-en.json';
import es from '../locales/health-es.json';

describe('controlled dose units', () => {
  it('exposes only stable codes and recognizes each one', () => {
    expect(DOSE_UNITS).toEqual([
      'tablet',
      'capsule',
      'drop',
      'ml',
      'mg',
      'g',
      'iu',
      'application',
      'other',
    ]);
    for (const unit of DOSE_UNITS) expect(isDoseUnit(unit)).toBe(true);
    for (const value of ['', 'ml ', 'Comprimido', undefined, null]) {
      expect(isDoseUnit(value)).toBe(false);
    }
  });

  it('normalizes legacy free text, casing and accents into a controlled code', () => {
    const cases = {
      Comprimido: 'tablet',
      COMPRIMIDOS: 'tablet',
      cp: 'tablet',
      Cápsula: 'capsule',
      capsulas: 'capsule',
      gotas: 'drop',
      'Drops ': 'drop',
      mL: 'ml',
      mililitros: 'ml',
      MG: 'mg',
      gramas: 'g',
      UI: 'iu',
      'unidade internacional': 'iu',
      'Aplicação': 'application',
      pomada: 'application',
      Outro: 'other',
    };
    for (const [input, expected] of Object.entries(cases)) {
      expect(normalizeDoseUnit(input), input).toBe(expected);
    }
  });

  it('returns an empty string for empty or unrecognized values', () => {
    expect(normalizeDoseUnit(null)).toBe('');
    expect(normalizeDoseUnit(undefined)).toBe('');
    expect(normalizeDoseUnit('')).toBe('');
    expect(normalizeDoseUnit('   ')).toBe('');
    expect(normalizeDoseUnit('sachê')).toBe('');
    expect(normalizeDoseUnit('1 xícara')).toBe('');
  });

  it('derives a sensible default unit from the presentation', () => {
    expect(PRESENTATION_DEFAULT_UNIT).toEqual({
      tablet: 'tablet',
      drops: 'drop',
      syrup: 'ml',
      ointment: 'application',
      other: '',
    });
    expect(presentationDefaultUnit('tablet')).toBe('tablet');
    expect(presentationDefaultUnit('drops')).toBe('drop');
    expect(presentationDefaultUnit('syrup')).toBe('ml');
    expect(presentationDefaultUnit('ointment')).toBe('application');
    expect(presentationDefaultUnit('other')).toBe('');
    expect(presentationDefaultUnit('')).toBe('');
    expect(presentationDefaultUnit('unknown')).toBe('');
  });
});

describe('dose snapshot formatting', () => {
  const t = (key, options) => {
    const label = key.replace('health.dose_unit_', '');
    return options?.count === 1 ? label : `${label}s`;
  };

  it('formats numbers per locale and pluralizes the unit', () => {
    expect(formatDose(1, 'tablet', t, 'en')).toBe('1 tablet');
    expect(formatDose(1, 'tablet', t, 'pt-BR')).toBe('1 tablet');
    expect(formatDose(2, 'tablet', t, 'en')).toBe('2 tablets');
    expect(formatDose(0.5, 'drop', t, 'en')).toBe('0.5 drops');
    expect(formatDose(1000, 'mg', t, 'en')).toBe('1,000 mgs');
  });

  it('honours decimal separators of the active language', () => {
    expect(formatDose(1.5, 'ml', t, 'pt-BR')).toBe('1,5 mls');
    expect(formatDose(1.5, 'ml', t, 'es')).toBe('1,5 mls');
  });

  it('keeps a legacy unit verbatim when it is not controlled', () => {
    expect(formatDose(1, 'sachê', t, 'en')).toBe('1 sachê');
    expect(formatDose(2.25, '', t, 'en')).toBe('2.25 ');
  });
});

describe('dose unit translations', () => {
  it('provides a label and both plural forms in portuguese, english and spanish', () => {
    for (const locale of [pt, en, es]) {
      for (const unit of DOSE_UNITS) {
        expect(locale.health[`dose_unit_${unit}`]).toEqual(expect.any(String));
        expect(locale.health[`dose_unit_${unit}`].trim()).not.toBe('');
      }
      for (const unit of ['tablet', 'capsule', 'drop', 'application']) {
        expect(locale.health[`dose_unit_${unit}_one`]).toEqual(expect.any(String));
        expect(locale.health[`dose_unit_${unit}_other`]).toEqual(expect.any(String));
      }
      expect(locale.health.dose_unit_choose).toEqual(expect.any(String));
    }
  });
});
