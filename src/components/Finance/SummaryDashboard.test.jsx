import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SummaryDashboard from './SummaryDashboard';
import { supabase } from '../../lib/supabase';

describe('SummaryDashboard', () => {
  const mockUser = { id: 'user-123' };

  it('renders stats cards correctly with mocked data', async () => {
    // Override the global mock specifically for this test's data needs
    vi.mocked(supabase.from).mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { name: 'Principal' }, error: null }),
      then: vi.fn(cb => Promise.resolve({ 
        data: [
          { type: 'RECEITA', amount: 5000, payment_date: '2026-04-01', category: 'Salário' },
          { type: 'DESPESA', amount: 2000, payment_date: '2026-04-05', category: 'Aluguel' }
        ], 
        error: null 
      }).then(cb)),
    }));

    render(<SummaryDashboard user={mockUser} showValues={true} showGeneralView={true} selectedYear={2026} />);
    
    await waitFor(() => {
      expect(screen.getByText(/Receita Mensal/i)).toBeInTheDocument();
      expect(screen.getByText(/5\.000/)).toBeInTheDocument();
      expect(screen.getByText(/2\.000/)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('masks values when showValues is false (Privacy Mode)', async () => {
    render(<SummaryDashboard user={mockUser} showValues={false} showGeneralView={true} selectedYear={2026} />);
    
    await waitFor(() => {
      // Check for masked pattern R$ •••
      const maskedElements = screen.getAllByText(/R\$ •+/);
      expect(maskedElements.length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });
});
