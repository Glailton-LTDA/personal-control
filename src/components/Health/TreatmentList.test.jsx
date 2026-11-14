import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TreatmentList from './TreatmentList';
import { listTreatments, treatmentDashboard } from '../../lib/treatments';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key, i18n: { language: 'pt' } }) }));
vi.mock('../../lib/treatments', () => ({ listTreatments: vi.fn(), treatmentDashboard: vi.fn(), TREATMENT_PAGE_SIZE: 20 }));
const wrapper = ({ children }) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
const row = { id: 'm1', name: 'Synthetic', dose: '1', status: 'active', total_predicted: 21, taken_total: 3, next_at: '2026-11-20T09:00:00Z', schedule: { mode: 'interval', interval_minutes: 480 }, today: { taken: 1, planned: 3 } };
beforeEach(() => { vi.clearAllMocks(); listTreatments.mockResolvedValue({ data: { rows: [row], has_more: false }, error: null }); treatmentDashboard.mockResolvedValue({ data: { active_count: 2, continuous_count: 1, today: { taken: 2, planned: 5, overdue: 1 }, next: { name: 'Next', scheduled_at: '2026-11-20T09:00:00Z' } }, error: null }); });
describe('treatment list with real hooks and service envelope', () => {
  it('shows server data, dashboard and navigates through canonical routes', async () => {
    const navigate = vi.fn(); render(<TreatmentList userId="owner" navigate={navigate} />, { wrapper });
    fireEvent.click(await screen.findByRole('button', { name: 'Synthetic' }));
    expect(navigate).toHaveBeenCalledWith('health/medications/m1');
    fireEvent.click(screen.getByRole('button', { name: 'health.view_treatment' }));
    expect(screen.getByRole('progressbar')).toHaveAttribute('max', '21');
    expect(screen.getByText('health.active_treatments')).toBeVisible();
  });
  it('passes next page to the service and can return to the first page', async () => {
    listTreatments.mockResolvedValue({ data: { rows: [row], has_more: true }, error: null });
    render(<TreatmentList userId="owner" navigate={vi.fn()} />, { wrapper }); await screen.findByText('Synthetic');
    fireEvent.click(screen.getByRole('button', { name: 'health.next' }));
    await waitFor(() => expect(listTreatments).toHaveBeenLastCalledWith('owner', expect.objectContaining({ page: 1 })));
    fireEvent.click(screen.getByRole('button', { name: 'health.previous' }));
    await waitFor(() => expect(listTreatments).toHaveBeenLastCalledWith('owner', expect.objectContaining({ page: 0 })));
  });
  it('keeps search and tabs available when results are empty', async () => {
    listTreatments.mockResolvedValue({ data: { rows: [], has_more: false }, error: null });
    render(<TreatmentList userId="owner" navigate={vi.fn()} />, { wrapper });
    await screen.findByText('health.empty');
    fireEvent.change(screen.getByRole('textbox', { name: 'health.search' }), { target: { value: 'Missing' } });
    await waitFor(() => expect(listTreatments).toHaveBeenLastCalledWith('owner', expect.objectContaining({ prefix: 'Missing' })));
    fireEvent.click(screen.getByRole('button', { name: 'health.treatment_status_finished' }));
    await waitFor(() => expect(listTreatments).toHaveBeenLastCalledWith('owner', expect.objectContaining({ group: 'finished' })));
    fireEvent.click(screen.getByRole('button', { name: 'health.all' }));
    expect(screen.getByRole('textbox', { name: 'health.search' })).toHaveValue('Missing');
  });
  it('represents continuous schedules without a completion percentage', async () => {
    listTreatments.mockResolvedValue({ data: { rows: [{ ...row, schedule: null, today: null, total_predicted: null, next_at: null }], has_more: false }, error: null });
    render(<TreatmentList userId="owner" navigate={vi.fn()} />, { wrapper });
    await screen.findByText('Synthetic'); expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByText('health.treatment_duration_continuous')).toBeVisible();
  });
  it('renders recovery controls for a server domain error', async () => {
    listTreatments.mockResolvedValue({ error: 'not_found_or_forbidden' });
    treatmentDashboard.mockResolvedValue({ error: 'invalid_timezone' });
    render(<TreatmentList userId="owner" navigate={vi.fn()} />, { wrapper });
    expect(await screen.findAllByRole('alert', {}, { timeout: 4000 })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'health.retry' })[0]);
  });
});
