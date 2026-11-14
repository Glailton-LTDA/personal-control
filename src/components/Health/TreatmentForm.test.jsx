import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TreatmentForm from './TreatmentForm';
import { saveTreatment } from '../../lib/treatments';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key, options) => key === 'health.predicted_doses' ? `${key}:${options.count}` : key === 'health.last_dose' ? `${key}:${options.date}` : key === 'health.dose_description' ? `${options.quantity} ${options.unit}` : key, i18n: { language: 'en' } }) }));
vi.mock('../../lib/treatments', () => ({ saveTreatment: vi.fn() }));
vi.mock('./HealthUI', async original => ({ ...await original(), HealthLinkSelect: ({ field, value, onChange }) => <label>{field}<select aria-label={field} value={value || ''} onChange={e => onChange(e.target.value)}><option value="" /><option value="link-1">Linked</option></select></label> }));
const wrapper = ({ children }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
const start = Date.UTC(2026, 10, 12, 9);
const setup = (record) => { const saved = vi.fn(), close = vi.fn(); render(<TreatmentForm userId="owner" record={record} onSaved={saved} onClose={close} />, { wrapper }); return { saved, close }; };
const fill = () => { fireEvent.change(screen.getByLabelText('health.treatment_name'), { target: { value: 'Synthetic' } }); fireEvent.change(screen.getByLabelText('health.treatment_dose_quantity'), { target: { value: '1' } }); fireEvent.change(screen.getByLabelText('health.treatment_dose_unit_code'), { target: { value: 'tablet' } }); };
beforeEach(() => { vi.clearAllMocks(); vi.spyOn(Date, 'now').mockReturnValue(start); saveTreatment.mockResolvedValue({ data: { id: 'med-1' }, error: null }); });
describe('treatment form with real mutation hook', () => {
  it('awaits server success, calculates 21 doses and does not expose a technical timezone input', async () => {
    const { saved } = setup(); fill();
    fireEvent.change(screen.getByLabelText('health.treatment_anchor_time'), {target:{value:'06:00'}});
    expect(screen.getByText('health.predicted_doses:21')).toBeVisible();
    expect(screen.getByText(/health.last_dose:.*Nov 18, 2026/)).toBeVisible();
    expect(screen.queryByRole('textbox', { name: /timezone/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('health.treatment_dose', { exact: true })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'health.save' }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith('med-1'));
    expect(saveTreatment).toHaveBeenCalledWith('owner', expect.objectContaining({ interval_minutes: 480, duration_days: 7, dose: '1 tablet', dose_quantity: '1', dose_unit_code: 'tablet' }), expect.any(String));
  });
  it('keeps values and command ID after an error, then retries the same intent', async () => {
    saveTreatment.mockResolvedValueOnce({ data: null, error: 'version_conflict' });
    const { saved } = setup(); fill();
    fireEvent.click(screen.getByRole('button', { name: 'health.save' }));
    await screen.findByRole('alert');
    expect(saved).not.toHaveBeenCalled();
    expect(screen.getByLabelText('health.treatment_name')).toHaveValue('Synthetic');
    fireEvent.click(screen.getByRole('button', { name: 'health.save' }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith('med-1'));
    expect(saveTreatment.mock.calls[0][2]).toBe(saveTreatment.mock.calls[1][2]);
  });
  it('preserves interval, local anchor, duration and relationships while editing metadata', async () => {
    setup({ id: 'med-1', name: 'Existing', dose: '1', timezone: 'America/Fortaleza', row_version: 7, condition_id: 'link-1', appointment_id: 'link-1', schedule: { mode: 'interval', anchor_at: '2026-11-12T09:00:00Z', interval_minutes: 480, duration_kind: 'finite', duration_days: 7 } });
    expect(screen.getByLabelText('health.treatment_anchor_time')).toHaveValue('06:00');
    fireEvent.change(screen.getByLabelText('health.treatment_name'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'health.save' }));
    await waitFor(() => expect(saveTreatment).toHaveBeenCalled());
    expect(saveTreatment.mock.calls[0][1]).toMatchObject({ mode: 'interval', anchor_time: '06:00', duration_days: 7, expected_version: 7, condition_id: 'link-1', appointment_id: 'link-1' });
  });
  it('supports custom daily times, continuous use, offsets and optional information', async () => {
    setup(); fill();
    fireEvent.click(screen.getByRole('radio', { name: 'health.treatment_mode_daily_times' }));
    fireEvent.click(screen.getByRole('button', { name: 'health.add_time' }));
    fireEvent.change(screen.getAllByLabelText('health.treatment_local_times')[1], { target: { value: '20:00' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'health.remove_time' })[0]);
    fireEvent.click(screen.getByLabelText('health.treatment_duration_continuous'));
    fireEvent.click(screen.getByText('health.additional_information'));
    for (const key of ['professional_name', 'indication', 'pharmacy', 'batch']) fireEvent.change(screen.getByLabelText(`health.treatment_${key}`), { target: { value: 'Synthetic' } });
    fireEvent.change(screen.getByLabelText('health.treatment_notes'), { target: { value: 'Private note' } });
    fireEvent.change(screen.getByLabelText('condition_id'), { target: { value: 'link-1' } });
    fireEvent.change(screen.getByLabelText('appointment_id'), { target: { value: 'link-1' } });
    fireEvent.change(screen.getByLabelText('health.treatment_reminder_offset_minutes'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('health.presentation'), { target: { value: 'tablet' } });
    fireEvent.change(screen.getByLabelText('health.treatment_dose_quantity'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('health.treatment_dose_unit_code'), { target: { value: 'tablet' } });
    fireEvent.change(screen.getByLabelText('health.treatment_local_start_date'), { target: { value: '2026-11-12' } });
    expect([...document.querySelector('form').elements].filter(e => e.willValidate && !e.checkValidity()).map(e => [e.name, e.value, e.validationMessage])).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'health.save' }));
    await waitFor(() => expect(saveTreatment).toHaveBeenCalled());
    expect(saveTreatment.mock.calls[0][1]).toMatchObject({ local_times: ['20:00'], duration_kind: 'continuous', reminder_offset_minutes: 30, presentation_code: 'tablet' });
  });
  it('validates duplicates, supports presets and custom hours, and guards dirty close', async () => {
    const { close } = setup(); fill();
    fireEvent.click(screen.getAllByRole('button', { name: 'health.every_hours' })[0]);
    fireEvent.change(screen.getByLabelText('health.interval_hours'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('health.treatment_anchor_date'), { target: { value: '2026-11-13' } });
    fireEvent.change(screen.getByLabelText('health.treatment_anchor_time'), { target: { value: '06:00' } });
    fireEvent.change(screen.getByLabelText('health.treatment_duration_days'), { target: { value: '2' } });
    fireEvent.click(screen.getByLabelText('health.treatment_reminders_enabled'));
    fireEvent.click(screen.getByRole('radio', { name: 'health.treatment_mode_daily_times' }));
    fireEvent.click(screen.getByRole('button', { name: 'health.add_time' }));
    fireEvent.change(screen.getAllByLabelText('health.treatment_local_times')[1], { target: { value: '08:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'health.save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('health.invalid_times');
    vi.stubGlobal('confirm', vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true));
    fireEvent.click(screen.getByRole('button', { name: 'health.cancel' })); expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'health.cancel' })); expect(close).toHaveBeenCalled();
  });
});


it('preserves a legacy free-text dose without parsing or inventing quantity/unit', async () => {
  setup({ id:'legacy',name:'Existing',dose:'Apply a thin layer',row_version:3 });
  expect(screen.queryByLabelText('health.treatment_dose',{exact:true})).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('health.treatment_notes'),{target:{value:'Notes'}});
  fireEvent.click(screen.getByRole('button',{name:'health.save'}));
  await waitFor(()=>expect(saveTreatment).toHaveBeenCalled());
  expect(saveTreatment.mock.calls[0][1]).toMatchObject({dose:'Apply a thin layer',dose_quantity:'',dose_unit_code:''});
});
it('replaces the legacy dose only when quantity/unit are explicitly edited', async () => {
  setup({id:'legacy',name:'Existing',dose:'old dose',row_version:3,dose_quantity:1,dose_unit_code:'tablet'});
  fireEvent.change(screen.getByLabelText('health.treatment_dose_quantity'),{target:{value:'0.5'}});
  fireEvent.click(screen.getByRole('button',{name:'health.save'}));
  await waitFor(()=>expect(saveTreatment).toHaveBeenCalled());
  expect(saveTreatment.mock.calls[0][1]).toMatchObject({dose:'0.5 tablet',dose_quantity:'0.5',dose_unit_code:'tablet'});
});
it.each([['1','   '],['0','mL'],['1.2345','mL']])('rejects incomplete or over-precise doses (%s %s)', async (quantity,unit) => {
  setup();fill();
  fireEvent.change(screen.getByLabelText('health.treatment_dose_quantity'),{target:{value:quantity}});
  fireEvent.change(screen.getByLabelText('health.treatment_dose_unit_code'),{target:{value:unit}});
  fireEvent.submit(document.querySelector('form'));
  expect(await screen.findByRole('alert')).toHaveTextContent('health.invalid_dose');
  expect(saveTreatment).not.toHaveBeenCalled();
});
