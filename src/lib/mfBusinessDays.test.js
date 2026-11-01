import { describe, it, expect } from 'vitest';
import {
  easterSunday,
  brazilianNationalHolidays,
  isNationalHoliday,
  isWeekend,
  isBusinessDay,
  nextBusinessDay,
} from './mfBusinessDays';

describe('mfBusinessDays — calendário e próximo dia útil', () => {
  it('calcula a Páscoa e a Sexta-feira Santa', () => {
    expect(easterSunday(2024)).toBe('2024-03-31');
    expect(easterSunday(2025)).toBe('2025-04-20');
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(isNationalHoliday('2026-04-03')).toBe(true); // Sexta-feira Santa
    expect(brazilianNationalHolidays(2026).has('2026-04-03')).toBe(true);
  });

  it('reconhece feriados nacionais fixos e o 20/11', () => {
    expect(isNationalHoliday('2026-01-01')).toBe(true);
    expect(isNationalHoliday('2026-09-07')).toBe(true);
    expect(isNationalHoliday('2026-11-02')).toBe(true);
    expect(isNationalHoliday('2026-11-15')).toBe(true);
    expect(isNationalHoliday('2026-11-20')).toBe(true);
    expect(isNationalHoliday('2026-12-25')).toBe(true);
    expect(isNationalHoliday('2026-11-21')).toBe(false);
    // Antes de 2024 o 20/11 não era feriado nacional.
    expect(isNationalHoliday('2023-11-20')).toBe(false);
  });

  it('identifica fins de semana', () => {
    expect(isWeekend('2026-10-31')).toBe(true); // sábado
    expect(isWeekend('2026-11-01')).toBe(true); // domingo
    expect(isWeekend('2026-11-02')).toBe(false); // segunda (feriado)
    expect(isWeekend('2026-11-09')).toBe(false);
  });

  it('move para o próximo dia útil, pulando feriados', () => {
    // 07/11/2026 é sábado -> segunda 09/11.
    expect(nextBusinessDay('2026-11-07')).toBe('2026-11-09');
    // 31/10/2026 é sábado; 01/11 domingo; 02/11 Finados -> terça 03/11.
    expect(nextBusinessDay('2026-10-31')).toBe('2026-11-03');
    // Já é dia útil: devolve a própria data.
    expect(nextBusinessDay('2026-11-09')).toBe('2026-11-09');
    // Natal (sexta) -> segunda 28/12.
    expect(nextBusinessDay('2026-12-25')).toBe('2026-12-28');
  });

  it('isBusinessDay combina fim de semana e feriado', () => {
    expect(isBusinessDay('2026-11-09')).toBe(true);
    expect(isBusinessDay('2026-11-07')).toBe(false);
    expect(isBusinessDay('2026-11-02')).toBe(false);
    expect(isBusinessDay('invalida')).toBe(false);
  });
});
