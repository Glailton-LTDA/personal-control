import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key, i18n: { language: 'en' } }),
}));
vi.mock('../../hooks/useTreatments', () => ({
  useTreatmentDetail: vi.fn(),
  useTreatmentCalendar: vi.fn(),
  useTreatmentHistory: vi.fn(),
  useTreatmentState: vi.fn(),
  useRecordDose: vi.fn(),
  useUndoDose: vi.fn(),
}));
import {
  useTreatmentDetail,
  useTreatmentCalendar,
  useTreatmentHistory,
  useTreatmentState,
  useRecordDose,
  useUndoDose,
} from '../../hooks/useTreatments';
import TreatmentDetail from './TreatmentDetail';

const OWNER = '11111111-1111-4111-4111-111111111111';

const Wrapper = ({ children }) => {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

const baseDetail = {
  medication: {
    id: 'm1',
    name: 'Tratamento A',
    status: 'active',
    dose: '1 comprimido',
  },
  schedule: {
    mode: 'daily_times',
    local_times: ['08:00', '20:00'],
    duration_kind: 'continuous',
    interval_minutes: null,
  },
  stats: { taken_total: 5, overdue: 1, due_recent: 2 },
  today: [
    {
      scheduled_at: '2027-03-15T12:00:00Z',
      status: 'scheduled',
      taken_at: null,
      amount: '',
      record_version: 0,
    },
    {
      scheduled_at: '2027-03-15T10:00:00Z',
      status: 'taken',
      taken_at: '2027-03-15T10:05:00Z',
      amount: '1',
      record_version: 1,
    },
  ],
  next: [{ scheduled_at: '2027-03-16T08:00:00Z' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('confirm', vi.fn(() => true));
  useTreatmentDetail.mockReturnValue({
    data: baseDetail,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
  useTreatmentState.mockReturnValue({ mutate: vi.fn(), isPending: false });
  useRecordDose.mockReturnValue({ mutate: vi.fn(), isPending: false });
  useUndoDose.mockReturnValue({ mutate: vi.fn(), isPending: false });
  useTreatmentCalendar.mockReturnValue({
    data: { timezone: 'UTC', days: [] },
    isLoading: false,
    isError: false,
  });
  useTreatmentHistory.mockReturnValue({
    data: { rows: [] },
    isLoading: false,
    isError: false,
  });
});

describe('TreatmentDetail', () => {
  it('renders summary with medication and stats', () => {
    render(
      <TreatmentDetail userId={OWNER} medicationId='m1' navigate={vi.fn()} />,
      { wrapper: Wrapper },
    );
    expect(screen.getByText('Tratamento A')).toBeInTheDocument();
    expect(screen.getByText(/1 comprimido/)).toBeInTheDocument();
    expect(screen.getByText('health.status_active')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('pauses, resumes and finishes via treatment state', () => {
    const { rerender } = render(
      <TreatmentDetail userId={OWNER} medicationId='m1' navigate={vi.fn()} />,
      { wrapper: Wrapper },
    );
    fireEvent.click(screen.getByRole('button', { name: 'health.treatment_pause' }));
    expect(useTreatmentState().mutate).toHaveBeenCalledWith({
      medicationId: 'm1',
      action: 'pause',
      options: { reason: '', effectiveAt: expect.any(String) },
    });

    useTreatmentDetail.mockReturnValue({
      data: { ...baseDetail, medication: { ...baseDetail.medication, status: 'paused' } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    rerender(
      <TreatmentDetail userId={OWNER} medicationId='m1' navigate={vi.fn()} />,
      { wrapper: Wrapper },
    );
    fireEvent.click(screen.getByRole('button', { name: 'health.treatment_resume' }));
    expect(useTreatmentState().mutate).toHaveBeenCalledWith({
      medicationId: 'm1',
      action: 'resume',
      options: { reason: '', effectiveAt: expect.any(String) },
    });

    useTreatmentDetail.mockReturnValue({
      data: { ...baseDetail, medication: { ...baseDetail.medication, status: 'active' } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    rerender(
      <TreatmentDetail userId={OWNER} medicationId='m1' navigate={vi.fn()} />,
      { wrapper: Wrapper },
    );
    fireEvent.click(screen.getByRole('button', { name: 'health.treatment_finish' }));
    expect(useTreatmentState().mutate).toHaveBeenCalledWith({
      medicationId: 'm1',
      action: 'finish',
      options: { reason: '', effectiveAt: expect.any(String) },
    });
  });

  it('records a dose for a scheduled slot', async () => {
    render(
      <TreatmentDetail userId={OWNER} medicationId='m1' navigate={vi.fn()} />,
      { wrapper: Wrapper },
    );
    fireEvent.click(
      screen.getAllByRole('button', { name: 'health.treatment_record_dose' })[0],
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('health.scheduled_at'), {
      target: { value: '2027-03-15T12:00' },
    });
    fireEvent.change(screen.getByLabelText('health.taken_at'), {
      target: { value: '2027-03-15T12:05' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'health.save' }));
    await waitFor(() => expect(useRecordDose().mutate).toHaveBeenCalled());
    expect(useRecordDose().mutate).toHaveBeenCalledWith({
      medicationId: 'm1',
      scheduledAt: '2027-03-15T12:00',
      status: 'taken',
      options: {
        takenAt: '2027-03-15T12:05',
        amount: '',
        expectedVersion: 0,
      },
    });
  });

  it('undoes a taken dose', () => {
    render(
      <TreatmentDetail userId={OWNER} medicationId='m1' navigate={vi.fn()} />,
      { wrapper: Wrapper },
    );
    fireEvent.click(screen.getByRole('button', { name: 'health.treatment_undo_dose' }));
    expect(useUndoDose().mutate).toHaveBeenCalledWith({
      medicationId: 'm1',
      scheduledAt: '2027-03-15T10:00:00Z',
      expectedVersion: 1,
    });
  });

  it('navigates back and opens edit form', () => {
    const navigate = vi.fn();
    const onForm = vi.fn();
    render(
      <TreatmentDetail
        userId={OWNER}
        medicationId='m1'
        navigate={navigate}
        onForm={onForm}
      />,
      { wrapper: Wrapper },
    );
    fireEvent.click(screen.getByRole('button', { name: 'health.back' }));
    expect(navigate).toHaveBeenCalledWith('health/treatments');
    fireEvent.click(screen.getByRole('button', { name: 'health.edit_treatment' }));
    expect(onForm).toHaveBeenCalledWith({
      kind: 'medications',
      record: baseDetail.medication,
    });
  });

  it('renders calendar and history tabs', () => {
    render(
      <TreatmentDetail userId={OWNER} medicationId='m1' navigate={vi.fn()} />,
      { wrapper: Wrapper },
    );
    fireEvent.click(screen.getByRole('button', { name: 'health.treatment_calendar' }));
    expect(screen.getByText('health.treatment_no_slots')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'health.treatment_history' }));
    expect(screen.getByText('health.empty')).toBeInTheDocument();
  });
});
