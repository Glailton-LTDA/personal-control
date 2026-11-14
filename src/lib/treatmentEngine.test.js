import { describe, expect, it } from 'vitest';
import {
  MAX_SLOTS,
  pastDoseCount,
  MAX_DAYS,
  MIN_INTERVAL_MINUTES,
  MAX_INTERVAL_MINUTES,
  MAX_DURATION_DAYS,
  MAX_TIMES,
  TIME_PATTERN,
  DATE_PATTERN,
  isValidTimeZone,
  deviceTimeZone,
  localInstant,
  formatLocalDate,
  formatLocalTime,
  addDays,
  parseTime,
  formatMinutes,
  buildSlots,
  SlotLimitError,
  countSlots,
  nextSlots,
  previewTreatment,
  validateTreatment,
  scheduleFromTreatment,
  treatmentPayload,
  scheduleLabel,
  slotsByLocalDate,
} from './treatmentEngine';

const NOW = Date.UTC(2027, 2, 15, 10, 0, 0); // 2027-03-15T10:00:00Z

describe('treatmentEngine validation helpers', () => {
  it('accepts valid IANA timezones and rejects invalid ones', () => {
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('Europe/Lisbon')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
  });

  it('deviceTimeZone falls back to UTC when unavailable', () => {
    expect(isValidTimeZone(deviceTimeZone())).toBe(true);
  });

  it('TIME_PATTERN and DATE_PATTERN match valid values', () => {
    expect(TIME_PATTERN.test('08:00')).toBe(true);
    expect(TIME_PATTERN.test('23:59')).toBe(true);
    expect(TIME_PATTERN.test('24:00')).toBe(false);
    expect(TIME_PATTERN.test('8:00')).toBe(false);
    expect(DATE_PATTERN.test('2027-03-15')).toBe(true);
    expect(DATE_PATTERN.test('27-03-15')).toBe(false);
  });

  it('parseTime converts hh:mm to minutes', () => {
    expect(parseTime('08:00')).toBe(480);
    expect(parseTime('23:59')).toBe(1439);
    expect(parseTime('')).toBeNull();
  });

  it('formatMinutes normalizes to hh:mm', () => {
    expect(formatMinutes(0)).toBe('00:00');
    expect(formatMinutes(60)).toBe('01:00');
    expect(formatMinutes(1500)).toBe('01:00'); // wraps midnight
    expect(formatMinutes(-30)).toBe('23:30');
  });

  it('addDays shifts calendar dates', () => {
    expect(addDays('2027-01-30', 1)).toBe('2027-01-31');
    expect(addDays('2027-01-31', 1)).toBe('2027-02-01');
    expect(addDays('2027-12-31', 1)).toBe('2028-01-01');
    expect(addDays('not-a-date', 1)).toBeNull();
  });
});

describe('treatmentEngine localInstant DST parity', () => {
  // America/New_York spring forward 2027-03-14 02:00 -> 03:00
  it('omits nonexistent local time in a DST gap', () => {
    expect(localInstant('2027-03-14', '02:30', 'America/New_York')).toBeNull();
  });

  it('resolves ambiguous local time to the earlier instant', () => {
    // 2027-11-07 01:30 occurs twice: 05:30Z (EDT -04:00) and 06:30Z (EST -05:00)
    const instant = localInstant('2027-11-07', '01:30', 'America/New_York');
    const expected = Date.UTC(2027, 10, 7, 5, 30, 0);
    expect(instant).toBe(expected);
  });

  it('returns the instant for a normal local time', () => {
    const instant = localInstant('2027-03-15', '10:00', 'America/New_York');
    const expected = Date.UTC(2027, 2, 15, 14, 0, 0); // EDT = UTC-4
    expect(instant).toBe(expected);
  });

  it('round-trips instant to local wall time', () => {
    const instant = localInstant('2027-03-15', '10:00', 'America/New_York');
    expect(formatLocalDate(instant, 'America/New_York')).toBe('2027-03-15');
    expect(formatLocalTime(instant, 'America/New_York')).toBe('10:00');
  });

  it('returns null for missing or invalid inputs', () => {
    expect(localInstant('', '10:00', 'America/New_York')).toBeNull();
    expect(localInstant('2027-03-15', '', 'America/New_York')).toBeNull();
    expect(localInstant('2027-03-15', '10:00', '')).toBeNull();
    expect(localInstant('2027-03-15', '25:00', 'America/New_York')).toBeNull();
  });
});

describe('treatmentEngine buildSlots interval mode', () => {
  const intervalSchedule = {
    mode: 'interval',
    timezone: 'UTC',
    anchor_at: '2027-03-15T08:00:00Z',
    interval_minutes: 120,
    duration_kind: 'continuous',
  };

  it('generates anchor + n*interval slots within [from, to)', () => {
    const slots = buildSlots(
      intervalSchedule,
      '2027-03-15T08:00:00Z',
      '2027-03-15T14:00:00Z',
    );
    expect(slots).toEqual([
      Date.UTC(2027, 2, 15, 8, 0, 0),
      Date.UTC(2027, 2, 15, 10, 0, 0),
      Date.UTC(2027, 2, 15, 12, 0, 0),
    ]);
  });

  it('respects effective_from/effective_until', () => {
    const schedule = {
      ...intervalSchedule,
      effective_from: '2027-03-15T09:00:00Z',
      effective_until: '2027-03-15T12:30:00Z',
    };
    const slots = buildSlots(
      schedule,
      '2027-03-15T08:00:00Z',
      '2027-03-15T14:00:00Z',
    );
    expect(slots).toEqual([
      Date.UTC(2027, 2, 15, 10, 0, 0),
      Date.UTC(2027, 2, 15, 12, 0, 0),
    ]);
  });

  it('is bounded and throws SlotLimitError over the cap', () => {
    const schedule = { ...intervalSchedule, interval_minutes: 1 };
    expect(() =>
      buildSlots(
        schedule,
        '2027-03-15T00:00:00Z',
        '2027-03-16T00:00:00Z',
        { limit: 5 },
      ),
    ).toThrow(SlotLimitError);
  });

  it('returns empty when window is inverted or empty', () => {
    expect(
      buildSlots(intervalSchedule, '2027-03-16T00:00:00Z', '2027-03-15T00:00:00Z'),
    ).toEqual([]);
    expect(
      buildSlots(intervalSchedule, '2027-03-16T00:00:00Z', '2027-03-16T00:00:00Z'),
    ).toEqual([]);
  });
});

describe('treatmentEngine buildSlots daily_times mode', () => {
  const dailySchedule = {
    mode: 'daily_times',
    timezone: 'America/New_York',
    local_start_date: '2027-03-15',
    local_times: ['08:00', '20:00'],
    duration_kind: 'continuous',
  };

  it('projects local wall times into instants', () => {
    // EDT = UTC-4, so 08:00 local = 12:00Z
    const slots = buildSlots(
      dailySchedule,
      '2027-03-15T00:00:00Z',
      '2027-03-17T00:00:00Z',
    );
    expect(slots).toEqual([
      Date.UTC(2027, 2, 15, 12, 0, 0),
      Date.UTC(2027, 2, 16, 0, 0, 0),
      Date.UTC(2027, 2, 16, 12, 0, 0),
    ]);
  });

  it('omits nonexistent local times (DST gap)', () => {
    const schedule = {
      ...dailySchedule,
      local_start_date: '2027-03-14',
      local_times: ['02:30'],
    };
    const slots = buildSlots(
      schedule,
      '2027-03-14T00:00:00Z',
      '2027-03-15T00:00:00Z',
    );
    expect(slots).toEqual([]);
  });

  it('uses earlier instant for ambiguous local times', () => {
    const schedule = {
      ...dailySchedule,
      local_start_date: '2027-11-07',
      local_times: ['01:30'],
    };
    const slots = buildSlots(
      schedule,
      '2027-11-07T00:00:00Z',
      '2027-11-08T00:00:00Z',
    );
    // 01:30 ambiguous -> earlier instant 05:30Z
    expect(slots).toEqual([Date.UTC(2027, 10, 7, 5, 30, 0)]);
  });

  it('respects effective_until and end_exclusive_at', () => {
    const schedule = {
      ...dailySchedule,
      end_exclusive_at: '2027-03-16T10:00:00Z',
    };
    const slots = buildSlots(
      schedule,
      '2027-03-15T00:00:00Z',
      '2027-03-17T00:00:00Z',
    );
    expect(slots).toEqual([
      Date.UTC(2027, 2, 15, 12, 0, 0),
      Date.UTC(2027, 2, 16, 0, 0, 0),
    ]);
  });

  it('rejects invalid local_start_date', () => {
    const schedule = { ...dailySchedule, local_start_date: 'not-a-date' };
    expect(buildSlots(schedule, '2027-03-15T00:00:00Z', '2027-03-16T00:00:00Z')).toEqual([]);
  });
});

describe('treatmentEngine counts and previews', () => {
  const finiteInterval = {
    mode: 'interval',
    timezone: 'UTC',
    anchor_at: '2027-03-15T08:00:00Z',
    interval_minutes: 120,
    duration_kind: 'finite',
    duration_days: 2,
    end_exclusive_at: '2027-03-17T08:00:00Z',
    effective_from: '2027-03-15T08:00:00Z',
    effective_until: null,
  };

  it('countSlots returns finite total for finite schedules', () => {
    expect(countSlots(finiteInterval)).toBe(24);
    expect(countSlots(finiteInterval, { from: '2027-03-15T08:00:00Z', to: '2027-03-16T08:00:00Z' })).toBe(12);
  });

  it('countSlots returns null for continuous without window', () => {
    expect(countSlots({ ...finiteInterval, duration_kind: 'continuous', end_exclusive_at: null })).toBeNull();
  });

  it('nextSlots returns upcoming bounded slots', () => {
    const slots = nextSlots(finiteInterval, 3, NOW);
    expect(Array.isArray(slots)).toBe(true);
    expect(slots.length).toBeLessThanOrEqual(3);
  });

  it('previewTreatment returns up to 50 slots', () => {
    const slots = previewTreatment(finiteInterval, NOW, 14);
    expect(Array.isArray(slots)).toBe(true);
    expect(slots.length).toBeLessThanOrEqual(50);
  });
});

describe('treatmentEngine slotsByLocalDate', () => {
  it('groups instants by local calendar date', () => {
    const slots = [
      Date.UTC(2027, 2, 15, 12, 0, 0), // 08:00 EDT
      Date.UTC(2027, 2, 15, 20, 0, 0), // 20:00 EDT
      Date.UTC(2027, 2, 16, 12, 0, 0), // 08:00 EDT next day
    ];
    const groups = slotsByLocalDate(slots, 'America/New_York');
    expect(groups).toEqual([
      { date: '2027-03-15', slots: [slots[0], slots[1]] },
      { date: '2027-03-16', slots: [slots[2]] },
    ]);
  });

  it('returns empty for invalid timezone or non-array', () => {
    expect(slotsByLocalDate([], 'Not/AZone')).toEqual([]);
    expect(slotsByLocalDate(null, 'UTC')).toEqual([]);
  });
});

describe('treatmentEngine validateTreatment', () => {
  const base = {
    name: 'Tratamento',
    dose: '1 comprimido',
    timezone: 'America/New_York',
    mode: 'daily_times',
    local_start_date: '2027-03-15',
    local_times: ['08:00'],
    duration_kind: 'continuous',
    reminders_enabled: true,
    reminder_offset_minutes: 0,
  };

  it('accepts a valid daily_times continuous treatment', () => {
    expect(validateTreatment(base)).toEqual([]);
  });

  it('accepts a valid interval finite treatment', () => {
    expect(
      validateTreatment({
        ...base,
        mode: 'interval',
        anchor_date: '2027-03-15',
        anchor_time: '08:00',
        interval_minutes: 120,
        duration_kind: 'finite',
        duration_days: 7,
      }),
    ).toEqual([]);
  });

  it('rejects missing name, dose, timezone', () => {
    expect(validateTreatment({ ...base, name: '' })).toContain('invalid_name');
    expect(validateTreatment({ ...base, dose: '' })).toContain('invalid_dose');
    expect(validateTreatment({ ...base, timezone: 'Bad/Zone' })).toContain('invalid_timezone');
  });

  it('rejects invalid interval and duplicate times', () => {
    expect(
      validateTreatment({
        ...base,
        mode: 'interval',
        anchor_date: '2027-03-15',
        anchor_time: '08:00',
        interval_minutes: 30,
        duration_kind: 'continuous',
      }),
    ).toContain('invalid_interval');
    expect(
      validateTreatment({
        ...base,
        local_times: ['08:00', '08:00'],
      }),
    ).toContain('invalid_times');
  });

  it('rejects nonexistent anchor local time', () => {
    expect(
      validateTreatment({
        ...base,
        mode: 'interval',
        anchor_date: '2027-03-14',
        anchor_time: '02:30',
        interval_minutes: 120,
        duration_kind: 'continuous',
      }),
    ).toContain('invalid_local_time');
  });

  it('rejects duration_days out of range', () => {
    expect(
      validateTreatment({ ...base, duration_kind: 'finite', duration_days: 0 }),
    ).toContain('invalid_duration');
    expect(
      validateTreatment({ ...base, duration_kind: 'finite', duration_days: 400 }),
    ).toContain('invalid_duration');
  });
});

describe('treatmentEngine scheduleFromTreatment and payload', () => {
  it('builds an interval schedule with exclusive end', () => {
    const schedule = scheduleFromTreatment({
      name: 'X',
      dose: '1',
      timezone: 'UTC',
      mode: 'interval',
      anchor_date: '2027-03-15',
      anchor_time: '08:00',
      interval_minutes: 120,
      duration_kind: 'finite',
      duration_days: 2,
    });
    expect(schedule.mode).toBe('interval');
    expect(schedule.anchor_at).toBe('2027-03-15T08:00:00.000Z');
    expect(schedule.end_exclusive_at).toBe('2027-03-17T08:00:00.000Z');
    expect(schedule.duration_days).toBe(2);
    expect(schedule.duration_kind).toBe('finite');
  });

  it('builds a daily_times schedule with exclusive end', () => {
    const schedule = scheduleFromTreatment({
      name: 'X',
      dose: '1',
      timezone: 'America/New_York',
      mode: 'daily_times',
      local_start_date: '2027-03-15',
      local_times: ['08:00', '20:00'],
      duration_kind: 'finite',
      duration_days: 2,
    });
    expect(schedule.mode).toBe('daily_times');
    expect(schedule.local_times).toEqual(['08:00', '20:00']);
    expect(schedule.end_exclusive_at).toBe('2027-03-17T04:00:00.000Z'); // 00:00 EDT = 04:00Z
  });

  it('returns null for invalid anchor', () => {
    expect(
      scheduleFromTreatment({
        name: 'X',
        dose: '1',
        timezone: 'America/New_York',
        mode: 'interval',
        anchor_date: '2027-03-14',
        anchor_time: '02:30',
        interval_minutes: 120,
        duration_kind: 'continuous',
      }),
    ).toBeNull();
  });

  it('treatmentPayload carries id and expected_version for edits', () => {
    const payload = treatmentPayload(
      {
        id: 'med-1',
        row_version: 3,
        name: 'X',
        dose: '1',
        timezone: 'UTC',
        mode: 'interval',
        anchor_date: '2027-03-15',
        anchor_time: '08:00',
        interval_minutes: 120,
        duration_kind: 'continuous',
      },
      {
        mode: 'interval',
        end_exclusive_at: null,
      },
    );
    expect(payload.id).toBe('med-1');
    expect(payload.expected_version).toBe(3);
  });
});

describe('treatmentEngine scheduleLabel', () => {
  it('labels interval in hours when whole', () => {
    const t = (key, opts) => key === 'health.every_hours' ? `every ${opts.count} hours` : `every ${opts.count} minutes`;
    expect(scheduleLabel({ mode: 'interval', interval_minutes: 120 }, t)).toBe('every 2 hours');
    expect(scheduleLabel({ mode: 'interval', interval_minutes: 90 }, t)).toBe('every 90 minutes');
  });

  it('labels daily_times as comma separated times', () => {
    const t = (key) => key;
    expect(scheduleLabel({ mode: 'daily_times', local_times: ['08:00', '20:00'] }, t)).toBe('08:00, 20:00');
  });
});

describe('treatmentEngine limits', () => {
  it('exports the documented limits', () => {
    expect(MAX_SLOTS).toBe(1000);
    expect(MAX_DAYS).toBe(42);
    expect(MIN_INTERVAL_MINUTES).toBe(60);
    expect(MAX_INTERVAL_MINUTES).toBe(10080);
    expect(MAX_DURATION_DAYS).toBe(365);
    expect(MAX_TIMES).toBe(24);
  });
});

it('returns the requested next interval slots using minutes converted to milliseconds', () => {
  const schedule = { mode:'interval',anchor_at:'2026-11-12T06:00:00Z',interval_minutes:480 };
  expect(nextSlots(schedule,3,Date.parse('2026-11-12T07:00:00Z')).map(n=>new Date(n).toISOString())).toEqual(['2026-11-12T14:00:00.000Z','2026-11-12T22:00:00.000Z','2026-11-13T06:00:00.000Z']);
});
it('does not crash the preview while partially editing invalid inputs', () => {
  const base={mode:'interval',timezone:'UTC',anchor_date:'2026-11-12',anchor_time:'06:00',interval_minutes:480,duration_kind:'finite',duration_days:7};
  for (const change of [{timezone:''},{mode:'other'},{duration_days:''},{interval_minutes:0},{anchor_time:''},{mode:'daily_times',local_start_date:'',local_times:[]},{mode:'daily_times',local_start_date:'2026-11-12',local_times:['']}]) expect(scheduleFromTreatment({...base,...change})).toBeNull();
  const schedule=scheduleFromTreatment(base);
  expect(countSlots(schedule)).toBe(21);
  expect(buildSlots(schedule,schedule.effective_from,schedule.end_exclusive_at).at(-1)).toBe(Date.parse('2026-11-18T22:00:00Z'));
});

describe('past dose preview', () => {
  const now = Date.parse('2026-11-12T14:00:00Z');
  const schedule = { mode: 'interval', timezone: 'UTC', anchor_at: '2026-11-11T06:00:00Z', effective_from: '2026-11-11T06:00:00Z', interval_minutes: 480, duration_kind: 'continuous' };
  it('excludes the exact cutoff and future slots', () => {
    expect(pastDoseCount(schedule, now)).toBe(4);
    expect(pastDoseCount(schedule, now + 1)).toBe(5);
    expect(pastDoseCount(null, now)).toBe(0);
    expect(pastDoseCount({ ...schedule, effective_from: 'bad' }, now)).toBe(0);
    expect(pastDoseCount(schedule, Date.parse(schedule.effective_from))).toBe(0);
  });
  it('respects the finite end even when the whole treatment is past', () => {
    expect(pastDoseCount({ ...schedule, end_exclusive_at: '2026-11-12T06:00:00Z' }, now)).toBe(3);
  });
  it('counts local daily times and omits DST gaps', () => {
    const daily = { mode: 'daily_times', timezone: 'America/New_York', local_start_date: '2026-03-08', local_times: ['02:30', '08:00'], effective_from: '2026-03-08T05:00:00Z' };
    expect(pastDoseCount(daily, Date.parse('2026-03-09T04:00:00Z'))).toBe(1);
  });
  it('bounds large imports and allows exactly 10,000 doses', () => {
    const hourly = { ...schedule, interval_minutes: 60 };
    const start = Date.parse(schedule.effective_from);
    expect(pastDoseCount(hourly, start + 10000 * 3600000)).toBe(10000);
    expect(pastDoseCount(hourly, start + 10001 * 3600000)).toBeNull();
    expect(pastDoseCount(schedule, start + 3651 * 86400000)).toBeNull();
  });
});
