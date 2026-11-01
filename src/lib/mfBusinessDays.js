/**
 * Dias úteis para os ciclos de cartão.
 *
 * Regra confirmada: quando o fechamento/vencimento cai em fim de semana ou
 * feriado nacional, move para o PRÓXIMO dia útil. O calendário cobre os
 * feriados nacionais fixos + Sexta-feira Santa (Páscoa) e o Dia da
 * Consciência Negra (nacional desde 2024). Feriados estaduais/municipais e
 * pontos facultativos (Carnaval/Corpus Christi) ficam de fora.
 */

const pad = (n) => String(n).padStart(2, '0');

const FIXED_HOLIDAYS = [
  '01-01', // Confraternização Universal
  '04-21', // Tiradentes
  '05-01', // Dia do Trabalho
  '09-07', // Independência
  '10-12', // Nossa Senhora Aparecida
  '11-02', // Finados
  '11-15', // Proclamação da República
  '12-25', // Natal
];

const holidayCache = new Map();

/** Páscoa no calendário gregoriano (algoritmo de Meeus/Jones/Butcher). */
export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

const addDaysISO = (iso, days) => {
  const [year, month, day] = String(iso).slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return iso;
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate()
  )}`;
};

const isValidISO = (iso) => /^\d{4}-\d{2}-\d{2}/.test(String(iso ?? ''));

/** Conjunto de feriados nacionais do ano (ISO YYYY-MM-DD). */
export function brazilianNationalHolidays(year) {
  if (holidayCache.has(year)) return holidayCache.get(year);
  const set = new Set(FIXED_HOLIDAYS.map((md) => `${year}-${md}`));
  // Sexta-feira Santa.
  set.add(addDaysISO(easterSunday(year), -2));
  // Consciência Negra é feriado nacional desde a Lei 14.759/2023.
  if (year >= 2024) set.add(`${year}-11-20`);
  holidayCache.set(year, set);
  return set;
}

export function isNationalHoliday(iso) {
  if (!isValidISO(iso)) return false;
  const year = Number(String(iso).slice(0, 4));
  return brazilianNationalHolidays(year).has(String(iso).slice(0, 10));
}

export function isWeekend(iso) {
  if (!isValidISO(iso)) return false;
  const [year, month, day] = String(iso).slice(0, 10).split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

export function isBusinessDay(iso) {
  return isValidISO(iso) && !isWeekend(iso) && !isNationalHoliday(iso);
}

/**
 * Próximo dia útil (inclui a própria data quando ela já é útil).
 * Datas inválidas são devolvidas como vieram.
 */
export function nextBusinessDay(iso) {
  if (!isValidISO(iso)) return iso;
  let current = String(iso).slice(0, 10);
  for (let attempts = 0; attempts < 14; attempts += 1) {
    if (isBusinessDay(current)) return current;
    current = addDaysISO(current, 1);
  }
  return current;
}
