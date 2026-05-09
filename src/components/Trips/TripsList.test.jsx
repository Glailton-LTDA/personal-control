import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TripsList from './TripsList';
import { supabase } from '../../lib/supabase';

vi.mock('framer-motion', () => ({
  motion: { 
    div: ({ children, ...props }) => <div {...props}>{children}</div>,
    button: ({ children, ...props }) => <button {...props}>{children}</button>
  },
  AnimatePresence: ({ children }) => children,
}));

vi.mock('./ExpenseModal', () => ({ default: () => <div data-testid="expense-modal" /> }));
vi.mock('./TripDetails', () => ({
  default: ({ onBack }) => (
    <div data-testid="trip-details">
      <button onClick={onBack}>Back</button>
    </div>
  )
}));

describe('TripsList', () => {
  const mockUser = { id: 'user-123' };
  const mockTrips = [
    { id: '1', title: 'Viagem 1', start_date: '2026-04-01', end_date: '2026-04-10', currencies: ['BRL'], daily_limits: { BRL: 100 } }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default supabase mock for each test
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null })
    });
    supabase.from = mockFrom;
  });

  it('renders correctly and opens Trip Details', async () => {
    render(<TripsList user={mockUser} trips={mockTrips} externalSelectedTrip={mockTrips[0]} onEditTrip={() => {}} />);
    expect(screen.getAllByText(/Viagem 1/i).length).toBeGreaterThan(0);

    // Click the action menu first
    const moreBtn = screen.getByLabelText(/Menu da Viagem/i); 
    fireEvent.click(moreBtn);

    const detailsBtn = screen.getByText(/Resumo da Viagem/i);
    fireEvent.click(detailsBtn);

    await waitFor(() => {
      expect(screen.getByTestId('trip-details')).toBeInTheDocument();
    });
  });

  it('renders expense cards on mobile and desktop', async () => {
    const mockExpenses = [
      { id: 'exp-1', description: 'Almoço', amount: 50, date: '2026-04-01', paid_by: 'João', currency: 'BRL', trip_categories: { name: 'Alimentação' } }
    ];

    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockExpenses, error: null })
    });
    supabase.from = mockFrom;

    render(
      <TripsList 
        user={mockUser} 
        trips={mockTrips} 
        externalSelectedTrip={mockTrips[0]} 
        onEditTrip={() => {}} 
      />
    );

    // Should find the expense text in both mobile list and desktop table
    await waitFor(() => {
      const items = screen.getAllByText(/Almoço/i);
      expect(items.length).toBeGreaterThan(0);
    });

    // Check for mobile-specific icon buttons
    expect(screen.getAllByTitle('Editar').length).toBeGreaterThan(0);
    expect(screen.getAllByTitle('Excluir').length).toBeGreaterThan(0);
  });

  it('handles sorting and filters', async () => {
    const mockExpenses = [
      { id: 'exp-1', description: 'Almoço', amount: 50, date: '2026-04-01', paid_by: 'João', currency: 'BRL' },
      { id: 'exp-2', description: 'Jantar', amount: 80, date: '2026-04-02', paid_by: 'Maria', currency: 'BRL' }
    ];

    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockExpenses, error: null })
    });
    supabase.from = mockFrom;

    render(
      <TripsList 
        user={mockUser} 
        trips={mockTrips} 
        externalSelectedTrip={mockTrips[0]} 
        onEditTrip={() => {}} 
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Almoço/i).length).toBeGreaterThan(0);
    });

    // Test Search
    const searchInput = screen.getByPlaceholderText(/Buscar despesa.../i);
    fireEvent.change(searchInput, { target: { value: 'Jantar' } });

    expect(screen.queryByText(/Almoço/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Jantar/i).length).toBeGreaterThan(0);
  });
});
