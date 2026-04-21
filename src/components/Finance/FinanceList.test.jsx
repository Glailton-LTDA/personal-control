import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FinanceList from './FinanceList';
import { supabase } from '../../lib/supabase';

vi.mock('../../lib/supabase', () => {
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { name: 'João' }, error: null }),
    then: vi.fn((onSuccess) => {
      // Return a dummy data by default that will be overridden in beforeEach
      return Promise.resolve({ data: [], error: null }).then(onSuccess);
    }),
  };

  return {
    supabase: {
      from: vi.fn(() => mockChain),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
      },
    }
  };
});

vi.mock('./SummaryDashboard', () => ({
  __esModule: true,
  default: () => <div data-testid="summary-dashboard">Summary Dashboard</div>
}));

const mockFinances = [
  { id: '1', description: 'Mercado', amount: 150.5, category: 'Alimentação', payment_date: '2026-04-10', status: 'PAGO', type: 'DESPESA' },
  { id: '2', description: 'Salário', amount: 5000, category: 'Salário', payment_date: '2026-04-01', status: 'PAGO', type: 'RECEITA' },
];

describe('FinanceList', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('personal-control-selected-month', '3');
    localStorage.setItem('personal-control-selected-year', '2026');
    localStorage.setItem('personal-control-finance-tab', 'DESPESA');
    
    vi.clearAllMocks();

    supabase.from.mockImplementation((tableName) => {
      let currentType = null;
      
      const chainObj = {
        select: vi.fn(() => chainObj),
        gte: vi.fn(() => chainObj),
        lte: vi.fn(() => chainObj),
        order: vi.fn(() => chainObj),
        eq: vi.fn((field, value) => {
          if (field === 'type') {
            currentType = value;
          }
          return chainObj;
        }),
        maybeSingle: vi.fn(() => {
          if (tableName === 'finance_responsibles') {
            return Promise.resolve({ data: { name: 'João' }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };

      chainObj.then = function(resolve, reject) {
        if (tableName === 'finance_responsibles') {
          return Promise.resolve({ data: [{ name: 'João' }], error: null }).then(resolve, reject);
        }
        
        let filtered = mockFinances;
        if (currentType) {
          filtered = mockFinances.filter(f => f.type === currentType);
        }
        return Promise.resolve({ data: filtered, error: null }).then(resolve, reject);
      };

      return chainObj;
    });
  });

  it('renders and switches tabs correctly', async () => {
    const mockUser = { id: '123', email: 'test@example.com' };
    render(<FinanceList refreshKey={0} onEdit={() => {}} user={mockUser} />);

    // Wait for initial load
    await screen.findByText(/Mercado/i, {}, { timeout: 3000 });

    // Find and click Receitas tab
    const revenueTab = screen.getByRole('button', { name: /^Receitas$/i });
    fireEvent.click(revenueTab);

// verify tab becomes active

    // Should show Salário
    const items = await screen.findAllByText(/Salário/i, {}, { timeout: 3000 });
    expect(items.length).toBeGreaterThan(0);
  });
});
