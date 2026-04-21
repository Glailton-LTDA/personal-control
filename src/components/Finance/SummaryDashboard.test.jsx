import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SummaryDashboard from './SummaryDashboard';
import { supabase } from '../../lib/supabase';

// Helper to mock Supabase responses
const mockSupabaseResponse = (data, mainResp = { name: 'João' }) => {
  vi.mocked(supabase.from).mockImplementation((table) => {
    if (table === 'finance_responsibles') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: mainResp, error: null })
      };
    }
    return {
      select: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: vi.fn(cb => Promise.resolve({ data, error: null }).then(cb))
    };
  });
};

describe('SummaryDashboard', () => {
  it('renders stats cards correctly with mocked data', async () => {
    const mockFinances = [
      { amount: 1000, type: 'RECEITA', category: 'Salário', payment_date: '2026-04-01', status: 'PAGO' },
      { amount: 500, type: 'DESPESA', category: 'Aluguel', payment_date: '2026-04-05', status: 'PENDENTE' },
    ];

    mockSupabaseResponse(mockFinances);

    render(<SummaryDashboard isGeneral={true} selectedYear={2026} />);

    // Check if cards are present after loading
    await waitFor(() => {
      expect(screen.getByText(/Receita Anual/i)).toBeInTheDocument();
    });

    // Use regex to be flexible with spaces (toLocaleString might use non-breaking spaces)
    expect(screen.getByText(/R\$.*1\.000,00/i)).toBeInTheDocument();
    
    // There might be two 500,00 values (Despesa and Saldo)
    const fiveHundredElements = screen.getAllByText(/R\$.*500,00/i);
    expect(fiveHundredElements.length).toBeGreaterThanOrEqual(1);

    expect(screen.getByText(/Saldo Final/i)).toBeInTheDocument();
    expect(screen.getByText(/Receita Anual/i)).toBeInTheDocument();
  });

  it('filters by year correctly in general view', async () => {
    mockSupabaseResponse([]);
    render(<SummaryDashboard isGeneral={true} />);
    
    expect(screen.getByText(/Filtrar Ano Fiscal/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });
});
