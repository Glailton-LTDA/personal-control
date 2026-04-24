import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TripsList from './TripsList';
import { supabase } from '../../lib/supabase';

vi.mock('framer-motion', () => ({
  motion: { div: ({ children, ...props }) => <div {...props}>{children}</div> },
  AnimatePresence: ({ children }) => children,
}));

vi.mock('./ExpenseModal', () => ({ default: () => <div data-testid="expense-modal" /> }));
vi.mock('./TripDetails', () => ({
  default: ({ onClose }) => (
    <div data-testid="trip-details">
      <button onClick={onClose}>Close</button>
    </div>
  )
}));

describe('TripsList', () => {
  const mockUser = { id: 'user-123' };
  const mockTrips = [
    { id: '1', title: 'Viagem 1', start_date: '2026-04-01', end_date: '2026-04-10', currencies: ['BRL'], daily_limits: { BRL: 100 } }
  ];

  it('renders correctly and opens Trip Details', async () => {
    render(<TripsList user={mockUser} trips={mockTrips} onEditTrip={() => {}} />);
    expect(screen.getByText(/Viagem 1/i)).toBeInTheDocument();

    const detailsBtn = screen.getByText(/Detalhes da Viagem/i);
    fireEvent.click(detailsBtn);

    await waitFor(() => {
      expect(screen.getByTestId('trip-details')).toBeInTheDocument();
    });
  });

  it('renders expense cards with text buttons on mobile', async () => {
    // Mock mobile width
    global.innerWidth = 400;
    global.dispatchEvent(new Event('resize'));

    const mockExpenses = [
      { id: 'exp-1', description: 'Almoço', amount: 50, date: '2026-04-01', paid_by: 'João', currency: 'BRL' }
    ];

    // More flexible Supabase mock
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockImplementation((col) => {
        if (col === 'date') return Promise.resolve({ data: mockExpenses, error: null });
        return Promise.resolve({ data: [], error: null });
      })
    });
    vi.mocked(supabase.from).mockImplementation(mockFrom);

    render(
      <TripsList 
        user={mockUser} 
        trips={mockTrips} 
        externalSelectedTrip={mockTrips[0]} 
        onEditTrip={() => {}} 
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Almoço/i)).toBeInTheDocument();
    });

    // On mobile, the expense item has icon buttons with titles (FinanceList pattern)
    expect(screen.getByTitle('Editar')).toBeInTheDocument();
    expect(screen.getByTitle('Excluir')).toBeInTheDocument();
  });

  it('renders icon-only buttons on desktop', async () => {
    // Mock desktop width
    global.innerWidth = 1024;
    global.dispatchEvent(new Event('resize'));

    const mockExpenses = [
      { id: 'exp-1', description: 'Almoço', amount: 50, date: '2026-04-01', paid_by: 'João', currency: 'BRL' }
    ];

    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockImplementation((col) => {
        if (col === 'date') return Promise.resolve({ data: mockExpenses, error: null });
        return Promise.resolve({ data: [], error: null });
      })
    });
    vi.mocked(supabase.from).mockImplementation(mockFrom);

    render(
      <TripsList 
        user={mockUser} 
        trips={mockTrips} 
        externalSelectedTrip={mockTrips[0]} 
        onEditTrip={() => {}} 
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Almoço/i)).toBeInTheDocument();
    });

    // In desktop, the expense item buttons are icons with no text node "Editar"
    // The only "Editar..." text should be "Editar Viagem" in the header
    expect(screen.queryByText('Editar')).not.toBeInTheDocument();
    expect(screen.getByText(/Editar Viagem/i)).toBeInTheDocument();
  });
});
