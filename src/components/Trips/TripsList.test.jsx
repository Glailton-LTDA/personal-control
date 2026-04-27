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
    render(<TripsList user={mockUser} trips={mockTrips} externalSelectedTrip={mockTrips[0]} onEditTrip={() => {}} />);
    expect(screen.getByText(/Viagem 1/i)).toBeInTheDocument();

    // Click the action menu first
    const moreBtn = screen.getByRole('button', { name: '' }); // The MoreVertical button
    fireEvent.click(moreBtn);

    const detailsBtn = screen.getByText(/Detalhes da Viagem/i);
    fireEvent.click(detailsBtn);

    await waitFor(() => {
      expect(screen.getByTestId('trip-details')).toBeInTheDocument();
    });
  });

  it('renders expense cards with text buttons on mobile', async () => {
    // Mock mobile width
    window.innerWidth = 400;
    window.dispatchEvent(new Event('resize'));

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

  it('renders correctly and handles actions in menu', async () => {
    // Mock desktop width
    window.innerWidth = 1024;
    window.dispatchEvent(new Event('resize'));

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

    // In desktop, the action buttons are inside a menu
    // Initially they shouldn't be visible
    expect(screen.queryByText(/Editar Viagem/i)).not.toBeInTheDocument();
    
    // Open menu
    const moreBtn = screen.getAllByRole('button')[0]; // The first button is the trip selector, second is more
    // Actually better to be specific
    fireEvent.click(moreBtn);

    // Now actions should be visible
    expect(screen.getByText(/Editar Viagem/i)).toBeInTheDocument();
    expect(screen.getByText(/Roteiro da Viagem/i)).toBeInTheDocument();
  });
});
