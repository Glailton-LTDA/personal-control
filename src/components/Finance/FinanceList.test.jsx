import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FinanceList from './FinanceList';
import { supabase } from '../../lib/supabase';

// Mock TanStack Virtual useVirtualizer hook for unit tests
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options) => {
    return {
      getTotalSize: () => options.count * 100,
      getVirtualItems: () => Array.from({ length: options.count }).map((_, index) => ({
        index,
        start: index * 100,
        size: 100,
        key: index,
        measureElement: () => {},
      })),
      measureElement: () => {},
    };
  },
}));

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

// Mock SummaryDashboard
vi.mock('./SummaryDashboard', () => ({
  __esModule: true,
  default: () => <div data-testid="summary-dashboard">Summary Dashboard</div>
}));

// Mock Recharts
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  PieChart: ({ children }) => <div>{children}</div>,
  Pie: () => <div>Pie</div>,
  Cell: () => <div>Cell</div>,
  Tooltip: () => <div>Tooltip</div>,
  Legend: () => <div>Legend</div>,
}));

// Mock Lucide Icons
vi.mock('lucide-react', () => ({
  Search: () => <div data-testid="search-icon" />,
  ChevronLeft: () => <div />,
  ChevronRight: () => <div />,
  CheckCircle: () => <div />,
  XCircle: () => <div />,
  CreditCard: () => <div />,
  MoreVertical: () => <div />,
  Trash2: () => <div />,
  Edit2: () => <div />,
  Send: () => <div />,
  ArrowUp: () => <div />,
  ArrowDown: () => <div />,
  Mail: () => <div />,
  User: () => <div />,
  X: () => <div />,
  Copy: () => <div />,
  Eye: () => <div />,
  EyeOff: () => <div />,
  ShoppingCart: () => <div />,
  Home: () => <div />,
  Car: () => <div />,
  Utensils: () => <div />,
  Zap: () => <div />,
  Heart: () => <div />,
  GraduationCap: () => <div />,
  Plane: () => <div />,
  TrendingUp: () => <div />,
  Smartphone: () => <div />,
  Coffee: () => <div />,
  Package: () => <div />,
  DollarSign: () => <div />,
  Repeat: () => <div />,
  ArrowUpDown: () => <div />,
}));

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
    then: vi.fn(cb => cb({ data: [], error: null })),
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

const mockFinances = [
  { id: '1', description: 'Mercado', amount: 150.5, category: 'Alimentação', payment_date: '2026-04-10', status: 'PAGO', type: 'DESPESA' },
  { id: '2', description: 'Salário', amount: 5000, category: 'Salário', payment_date: '2026-04-01', status: 'PAGO', type: 'RECEITA' },
  { id: '3', description: 'Internet', amount: 99.9, category: 'Lazer', payment_date: '2026-04-12', status: 'PENDENTE', type: 'DESPESA' },
];

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const createTestQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

describe('FinanceList', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-04-15'));
    localStorage.clear();
    vi.clearAllMocks();
    
    // Default mock implementation
    vi.mocked(supabase.from).mockImplementation((tableName) => {
      let chainState = { type: null };
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn((field, val) => { 
          if(field === 'type') chainState.type = val; 
          return chain; 
        }),
        gte: vi.fn(() => chain),
        lte: vi.fn(() => chain),
        order: vi.fn(() => chain),
        single: vi.fn().mockResolvedValue({ data: {}, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        then: (onSuccess) => {
          let data = [];
          if (tableName === 'finances') {
            data = mockFinances.filter(f => !chainState.type || f.type === chainState.type);
          } else if (tableName === 'finance_responsibles') {
            data = [{ name: 'João', email: 'joao@test.com' }];
          } else if (tableName === 'notification_settings') {
            data = { recipient_email: 'test@example.com' };
          }
          return Promise.resolve({ data, error: null }).then(onSuccess);
        }
      };
      return chain;
    });
  });

  it('renders and shows data', async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <FinanceList user={{ id: '123' }} />
      </QueryClientProvider>
    );
    await waitFor(() => {
      expect(screen.getByText(/Mercado/i)).toBeInTheDocument();
    });
  });

  it('switches between tabs', async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <FinanceList user={{ id: '123' }} />
      </QueryClientProvider>
    );
    
    // Wait for initial data
    await screen.findByTestId('finance-row-Mercado');
    
    // Click Receitas
    const revenueTab = screen.getByRole('button', { name: /finances.revenues/i });
    fireEvent.click(revenueTab);
    
    // Wait for Salário to appear
    await screen.findByTestId('finance-row-Salário', {}, { timeout: 10000 });
    
    // Wait for Mercado to disappear
    await waitFor(() => {
      expect(screen.queryByTestId('finance-row-Mercado')).not.toBeInTheDocument();
    }, { timeout: 10000 });
  }, 20000);

  it('displays the Total a Pagar card in DESPESA tab and hides it in RECEITA tab', async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <FinanceList user={{ id: '123' }} />
      </QueryClientProvider>
    );
    
    // Wait for the data to load
    await screen.findByTestId('finance-row-Mercado');
    await screen.findByTestId('finance-row-Internet');

    // Total a Pagar should be visible and have value 99.90
    const pendingCard = screen.getByTestId('pending-total-card');
    expect(pendingCard).toBeInTheDocument();
    expect(within(pendingCard).getByText(/finances.to_pay/i)).toBeInTheDocument();
    expect(within(pendingCard).getByText(/99,90/i)).toBeInTheDocument();

    // Click Receitas
    const revenueTab = screen.getByRole('button', { name: /finances.revenues/i });
    fireEvent.click(revenueTab);

    // Wait for Salário to appear
    await screen.findByTestId('finance-row-Salário');

    // Total a Pagar should not be in document
    expect(screen.queryByTestId('pending-total-card')).not.toBeInTheDocument();
  });
});
