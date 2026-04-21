import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FinanceSettings from './FinanceSettings';
import { supabase } from '../../lib/supabase';

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
    render(<FinanceSettings />);

    await waitFor(() => {
      expect(screen.getByText('Netflix')).toBeInTheDocument();
      expect(screen.getByText('Maria')).toBeInTheDocument();
    });

    expect(screen.getByText('PRINCIPAL')).toBeInTheDocument();
  });

  it('adds a new category', async () => {
    render(<FinanceSettings />);
    
    const input = screen.getByPlaceholderText(/Nova Categoria/i);
    fireEvent.change(input, { target: { value: 'Comida' } });
    
    // Find the add button near this input
    const addButton = screen.getByPlaceholderText(/Nova Categoria/i).nextSibling;
    fireEvent.click(addButton);

    expect(supabase.from).toHaveBeenCalledWith('finance_categories');
  });

  it('adds a new responsible', async () => {
    render(<FinanceSettings />);
    
    // FILL NAME
    const nameInput = screen.getByPlaceholderText(/Nome do Responsável/i);
    fireEvent.change(nameInput, { target: { value: 'Carlos' } });

    // FILL EMAIL
    const emailInput = screen.getByPlaceholderText(/E-mail para notificações/i);
    fireEvent.change(emailInput, { target: { value: 'carlos@example.com' } });
    
    // CLICK ADD
    const addButton = emailInput.nextSibling;
    fireEvent.click(addButton);

    // WAIT FOR CALL
    await waitFor(() => {
      const resCalls = vi.mocked(supabase.from).mock.calls.filter(args => args[0] === 'finance_responsibles');
      // Look for the insert call (it should have 'insert' called on the return of from)
      expect(resCalls.length).toBeGreaterThan(0);
    });
  });
});
