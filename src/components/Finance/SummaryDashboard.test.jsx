import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SummaryDashboard from './SummaryDashboard';
import { supabase } from '../../lib/supabase';

// Mock Supabase
vi.mock('../../lib/supabase', () => {
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: {}, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: {}, error: null }),
    then: vi.fn(cb => Promise.resolve({ data: [], error: null }).then(cb)),
  };
  return {
    supabase: {
      from: vi.fn(() => mockChain),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
        getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'test-user' } } }, error: null }),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      },
      functions: {
        invoke: vi.fn().mockResolvedValue({ data: {}, error: null }),
      }
    }
  };
});

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: {
      changeLanguage: vi.fn(),
      language: 'pt-BR',
    },
  }),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }) => children,
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const createTestQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

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

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <SummaryDashboard user={mockUser} showValues={true} isGeneral={true} selectedYear={2026} />
      </QueryClientProvider>
    );
    
    await waitFor(() => {
      // With the mock, t('finances.annual_revenue') returns the key
      expect(screen.getByText(/finances\.annual_revenue/i)).toBeInTheDocument();
      expect(screen.getByText(/5\.000/)).toBeInTheDocument();
      expect(screen.getByText(/2\.000/)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('masks values when showValues is false (Privacy Mode)', async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <SummaryDashboard user={mockUser} showValues={false} isGeneral={true} selectedYear={2026} />
      </QueryClientProvider>
    );
    
    await waitFor(() => {
      // Check for masked pattern
      const maskedElements = screen.getAllByText(/common\.currency_symbol •+/);
      expect(maskedElements.length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });
});
