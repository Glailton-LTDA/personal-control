import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FinanceSettings from './FinanceSettings';
import { supabase } from '../../lib/supabase';

// Mock Lucide Icons
vi.mock('lucide-react', () => ({
  Plus: () => <div data-testid="icon-plus" />,
  Trash2: () => <div />,
  User: () => <div />,
  Tag: () => <div />,
  Star: () => <div />,
  ShieldCheck: () => <div />,
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

// Mock Supabase
vi.mock('../../lib/supabase', () => {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { name: 'João' }, error: null }),
    single: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    then: vi.fn((onFulfilled) => Promise.resolve({ data: [], error: null }).then(onFulfilled)),
  };

  return {
    supabase: {
      from: vi.fn(() => chain),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user', email: 'test@example.com' } }, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    }
  };
});

const mockCategories = [
  { id: '1', name: 'Netflix', type: 'DESPESA' },
  { id: '2', name: 'Investimento', type: 'RECEITA' },
];

const mockResponsibles = [
  { id: '1', name: 'Maria', email: 'maria@example.com', is_main: true },
  { id: '2', name: 'José', email: 'jose@example.com', is_main: false },
];

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const createTestQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

describe('FinanceSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    vi.mocked(supabase.from).mockImplementation((table) => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { name: 'João' }, error: null }),
        single: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        upsert: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        then: vi.fn(),
      };

      if (table === 'finance_categories') {
          chain.order = vi.fn().mockResolvedValue({ data: mockCategories, error: null });
      } else if (table === 'finance_responsibles') {
          chain.order = vi.fn().mockResolvedValue({ data: mockResponsibles, error: null });
      } else if (table === 'finance_config') {
          chain.single = vi.fn().mockResolvedValue({ data: { value: 'Template test' }, error: null });
      }
      return chain;
    });
  });

  it('renders categories and responsibles', async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <FinanceSettings />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Netflix')).toBeInTheDocument();
      expect(screen.getByText('Maria')).toBeInTheDocument();
    });

    expect(screen.getByText('finances.settings.main_label')).toBeInTheDocument();
  });

  it('adds a new category', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <FinanceSettings />
      </QueryClientProvider>
    );
    
    const input = screen.getByPlaceholderText('finances.settings.category_name_placeholder');
    await user.type(input, 'Comida');
    
    // Find the add button near this input
    const addButton = screen.getAllByRole('button').find(b => b.querySelector('div[data-testid="icon-plus"]'));
    await user.click(addButton);

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith('finance_categories');
    });
  });

  it('adds a new responsible', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <FinanceSettings />
      </QueryClientProvider>
    );
    
    // FILL NAME
    const nameInput = screen.getByPlaceholderText('finances.settings.name_placeholder');
    await user.type(nameInput, 'Carlos');

    // FILL EMAIL
    const emailInput = screen.getByPlaceholderText('finances.settings.email_placeholder');
    await user.type(emailInput, 'carlos@example.com');
    
    // CLICK ADD
    const addButton = screen.getAllByRole('button').filter(b => b.querySelector('div[data-testid="icon-plus"]'))[1];
    await user.click(addButton);

    // WAIT FOR CALL
    await waitFor(() => {
      const resCalls = vi.mocked(supabase.from).mock.calls.filter(args => args[0] === 'finance_responsibles');
      expect(resCalls.length).toBeGreaterThan(0);
    });
  });
});
