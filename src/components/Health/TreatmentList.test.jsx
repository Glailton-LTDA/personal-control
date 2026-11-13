import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key, i18n: { language: 'en' } }),
}));
vi.mock('../../hooks/useTreatments', () => ({
  useTreatmentList: vi.fn(),
}));
import { useTreatmentList } from '../../hooks/useTreatments';
import TreatmentList from './TreatmentList';

const OWNER = '11111111-1111-4111-4111-111111111111';

const Wrapper = ({ children }) => {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  vi.clearAllMocks();
  useTreatmentList.mockReturnValue({
    data: { rows: [], has_more: false },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
});

describe('TreatmentList', () => {
  it('renders treatment rows and navigates to detail on click', () => {
    useTreatmentList.mockReturnValue({
      data: {
        rows: [
          {
            id: 'm1',
            name: 'Tratamento A',
            status: 'active',
            dose: '1 comprimido',
            timezone: 'America/Sao_Paulo',
            taken_total: 3,
            next_at: '2027-03-16T10:00:00Z',
          },
        ],
        has_more: false,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    const navigate = vi.fn();
    render(
      <TreatmentList userId={OWNER} navigate={navigate} group="active" />,
      { wrapper: Wrapper },
    );
    expect(screen.getByText('Tratamento A')).toBeInTheDocument();
    expect(screen.getByText('health.status_active')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Tratamento A'));
    expect(navigate).toHaveBeenCalledWith('health/treatments/m1');
  });

  it('shows empty state when there are no treatments', () => {
    render(
      <TreatmentList userId={OWNER} navigate={vi.fn()} group="active" />,
      { wrapper: Wrapper },
    );
    expect(screen.getByText('health.empty')).toBeInTheDocument();
  });

  it('paginates when there are more pages', () => {
    useTreatmentList.mockReturnValue({
      data: {
        rows: [
          { id: 'm1', name: 'A', status: 'active', dose: '1', timezone: 'UTC', taken_total: 0 },
          { id: 'm2', name: 'B', status: 'active', dose: '2', timezone: 'UTC', taken_total: 0 },
        ],
        has_more: true,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(
      <TreatmentList userId={OWNER} navigate={vi.fn()} group="active" />,
      { wrapper: Wrapper },
    );
    expect(screen.getByText('health.next')).toBeInTheDocument();
    fireEvent.click(screen.getByText('health.next'));
    expect(useTreatmentList).toHaveBeenLastCalledWith(OWNER, {
      group: 'active',
      prefix: '',
      page: 1,
    });
  });

  it('updates search prefix and status group filters', () => {
    useTreatmentList.mockReturnValue({
      data: {
        rows: [
          { id: 'm1', name: 'A', status: 'active', dose: '1', timezone: 'UTC', taken_total: 0 },
        ],
        has_more: false,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(
      <TreatmentList userId={OWNER} navigate={vi.fn()} group="active" />,
      { wrapper: Wrapper },
    );
    fireEvent.change(screen.getByLabelText('health.search'), {
      target: { value: 'pressao' },
    });
    expect(useTreatmentList).toHaveBeenLastCalledWith(OWNER, {
      group: 'active',
      prefix: 'pressao',
      page: 0,
    });
    fireEvent.change(screen.getByLabelText('health.status'), {
      target: { value: 'finished' },
    });
    expect(useTreatmentList).toHaveBeenLastCalledWith(OWNER, {
      group: 'finished',
      prefix: 'pressao',
      page: 0,
    });
  });
});
