import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key, i18n: { language: 'en' } }),
}));
vi.mock('../../lib/treatments', () => ({
  saveTreatment: vi.fn(),
}));
import { saveTreatment } from '../../lib/treatments';
import TreatmentForm from './TreatmentForm';

const OWNER = '11111111-1111-4111-4111-111111111111';

const Wrapper = ({ children }) => {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  vi.clearAllMocks();
  saveTreatment.mockReset();
  saveTreatment.mockResolvedValue({
    data: { id: 'med-1', row_version: 1 },
    error: null,
  });
});

describe('TreatmentForm', () => {
  it('renders main fields and submits a new treatment', async () => {
    const onSaved = vi.fn();
    render(
      <TreatmentForm userId={OWNER} onClose={vi.fn()} onSaved={onSaved} />,
      { wrapper: Wrapper },
    );
    await screen.findByLabelText('health.treatment_name');
    fireEvent.change(screen.getByLabelText('health.treatment_name'), {
      target: { value: 'Tratamento Teste' },
    });
    fireEvent.change(
      screen.getByRole('textbox', { name: /dose/i }),
      { target: { value: '1 comprimido' } },
    );
    fireEvent.change(screen.getByLabelText(/timezone/i), {
      target: { value: 'America/Sao_Paulo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'health.treatment_saved' }));
    await waitFor(() => expect(saveTreatment).toHaveBeenCalled());
    expect(saveTreatment).toHaveBeenCalledWith(OWNER, expect.objectContaining({
      name: 'Tratamento Teste',
      dose: '1 comprimido',
    }));
  });

  it('switches to interval mode and shows anchor fields', async () => {
    render(
      <TreatmentForm userId={OWNER} onClose={vi.fn()} onSaved={vi.fn()} />,
      { wrapper: Wrapper },
    );
    await screen.findByLabelText('health.treatment_name');
    fireEvent.click(screen.getByRole('radio', { name: /treatment_mode_interval/i }));
    expect(screen.getByLabelText('health.treatment_anchor_date')).toBeInTheDocument();
    expect(screen.getByLabelText('health.treatment_anchor_time')).toBeInTheDocument();
    expect(screen.getByLabelText(/treatment_interval_minutes/i)).toBeInTheDocument();
  });

  it('adds and removes a daily time', async () => {
    render(
      <TreatmentForm userId={OWNER} onClose={vi.fn()} onSaved={vi.fn()} />,
      { wrapper: Wrapper },
    );
    await screen.findByLabelText('health.treatment_name');
    fireEvent.click(screen.getByRole('button', { name: 'health.add_time' }));
    fireEvent.click(
      screen.getAllByRole('button', { name: 'health.remove_time' })[0],
    );
    expect(saveTreatment).not.toHaveBeenCalled();
  });

  it('renders edit mode with record values', async () => {
    const record = {
      id: 'med-1',
      name: 'Existente',
      dose: '2 comprimidos',
      mode: 'interval',
      duration_kind: 'finite',
      duration_days: 7,
      timezone: 'America/Sao_Paulo',
      anchor_date: '2027-03-15',
      anchor_time: '08:00',
      interval_minutes: 120,
      row_version: 2,
    };
    const onSaved = vi.fn();
    render(
      <TreatmentForm
        userId={OWNER}
        record={record}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
      { wrapper: Wrapper },
    );
    await screen.findByLabelText('health.treatment_name');
    expect(screen.getByDisplayValue('Existente')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2 comprimidos')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'health.treatment_updated' }));
    await waitFor(() => expect(saveTreatment).toHaveBeenCalled());
    expect(saveTreatment).toHaveBeenCalledWith(OWNER, expect.objectContaining({
      id: 'med-1',
      expected_version: 2,
    }));
  });
});
