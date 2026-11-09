import { describe, it, expect } from 'vitest';
import { appointmentFollowUp, appointmentMapUrl, MEDICAL_SPECIALTIES } from './medicalSpecialties';
import pt from '../locales/health-pt.json';
import en from '../locales/health-en.json';
import es from '../locales/health-es.json';

describe('appointment follow-ups', () => {
  it('keeps the original link and logistics, requiring a new date without copying clinical notes or identity', () => {
    const original = { id: 'original', user_id: 'private-owner', status: 'completed', starts_at: '2026-11-01', name: 'Consulta', notes: 'private clinical note', professional: 'Doctor', specialty: 'Custom specialty', address: 'Rua A, 10', reminder_minutes: [120], condition_id: 'condition' };
    const result = appointmentFollowUp(original);
    expect(result).toMatchObject({ follow_up_of: 'original', status: 'scheduled', starts_at: '', notes: '', address: 'Rua A, 10', specialty: 'Custom specialty', condition_id: 'condition' });
    expect(result).not.toHaveProperty('id');
    expect(result).not.toHaveProperty('user_id');
    result.reminder_minutes.push(0);
    expect(original.reminder_minutes).toEqual([120]);
  });
  it('encodes only the address into a fixed HTTPS maps destination', () => {
    const address = 'Rua A, 10 & sala 2 # São Paulo';
    const url = new URL(appointmentMapUrl(address));
    expect(url.origin).toBe('https://www.google.com');
    expect(url.searchParams.get('query')).toBe(address);
    expect([...url.searchParams.keys()]).toEqual(['api', 'query']);
  });
  it('has translated specialty suggestions in all supported languages', () => {
    for (const locale of [pt, en, es]) {
      expect(Object.keys(locale.health.specialties).sort()).toEqual([...MEDICAL_SPECIALTIES].sort());
      for (const key of MEDICAL_SPECIALTIES) expect(locale.health.specialties[key]).toEqual(expect.any(String));
    }
  });
});
