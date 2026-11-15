// Controlled dose units. The stable code is persisted in health_medications
// .dose_unit_code; the translated label is only used to build the human
// readable `dose` snapshot for legacy clients and neutral notifications.
export const DOSE_UNITS = [
  'tablet',
  'capsule',
  'drop',
  'ml',
  'mg',
  'g',
  'iu',
  'application',
  'other',
];

// Presentation -> default unit. Keeps the form coherent so users do not have
// to repeat "comprimido" in both fields.
export const PRESENTATION_DEFAULT_UNIT = {
  tablet: 'tablet',
  drops: 'drop',
  syrup: 'ml',
  ointment: 'application',
  other: '',
};

const UNIT_ALIASES = new Map([
  ['comprimido', 'tablet'],
  ['comprimidos', 'tablet'],
  ['tablet', 'tablet'],
  ['tablets', 'tablet'],
  ['comp', 'tablet'],
  ['cp', 'tablet'],
  ['capsula', 'capsule'],
  ['capsulas', 'capsule'],
  ['capsule', 'capsule'],
  ['capsules', 'capsule'],
  ['cap', 'capsule'],
  ['gota', 'drop'],
  ['gotas', 'drop'],
  ['drop', 'drop'],
  ['drops', 'drop'],
  ['ml', 'ml'],
  ['mililitro', 'ml'],
  ['mililitros', 'ml'],
  ['milliliter', 'ml'],
  ['millilitre', 'ml'],
  ['mg', 'mg'],
  ['miligrama', 'mg'],
  ['miligramas', 'mg'],
  ['milligram', 'mg'],
  ['g', 'g'],
  ['grama', 'g'],
  ['gramas', 'g'],
  ['gram', 'g'],
  ['ui', 'iu'],
  ['iu', 'iu'],
  ['unidade internacional', 'iu'],
  ['international unit', 'iu'],
  ['aplicacao', 'application'],
  ['aplicacoes', 'application'],
  ['application', 'application'],
  ['applications', 'application'],
  ['pomada', 'application'],
  ['ointment', 'application'],
  ['outro', 'other'],
  ['outra', 'other'],
  ['other', 'other'],
]);

export function isDoseUnit(value) {
  return DOSE_UNITS.includes(value);
}

// Accepts legacy free-text values ("Comprimido", "gotas", "mL") and maps them
// to the controlled code. Unknown values are preserved by the caller so no
// information is silently discarded.
export function normalizeDoseUnit(value) {
  if (value == null) return '';
  const key = String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
  return UNIT_ALIASES.get(key) || '';
}

export function presentationDefaultUnit(presentation) {
  return PRESENTATION_DEFAULT_UNIT[presentation] || '';
}

// Builds the readable dose snapshot. Uses the translated, pluralized unit
// when the code is controlled; legacy unknown units are kept verbatim.
export function formatDose(quantity, unit, t, language) {
  const formatted = new Intl.NumberFormat(language, {
    maximumFractionDigits: 3,
  }).format(quantity);
  const label = isDoseUnit(unit)
    ? t(`health.dose_unit_${unit}`, { count: quantity })
    : unit;
  return `${formatted} ${label}`;
}
