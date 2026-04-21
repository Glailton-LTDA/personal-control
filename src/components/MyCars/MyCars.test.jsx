import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MyCars from './MyCars';
import { supabase } from '../../lib/supabase';

// Mock Supabase
vi.mock('../../lib/supabase', () => {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    then: vi.fn((onFulfilled) => Promise.resolve({ data: [], error: null }).then(onFulfilled)),
  };

  return {
    supabase: {
      from: vi.fn(() => chain),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
      }
    }
  };
});

const mockCars = [
  { id: '1', name: 'Audi A3', make: 'Audi', model: 'A3', year: 2022, plate: 'ABC-1234', current_km: 15000 },
];

describe('MyCars', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    vi.mocked(supabase.from).mockImplementation((table) => {
      const chain = {
         select: vi.fn().mockReturnThis(),
         eq: vi.fn().mockReturnThis(),
         order: vi.fn().mockReturnThis(),
         delete: vi.fn().mockReturnThis(),
         insert: vi.fn().mockReturnThis(),
         update: vi.fn().mockReturnThis(),
         then: vi.fn(cb => Promise.resolve({ data: [], error: null }).then(cb)),
      };

      if (table === 'cars') {
        chain.order = vi.fn().mockResolvedValue({ data: mockCars, error: null });
      }

      return chain;
    });
  });

  it('renders the car list correctly', async () => {
    const mockUser = { id: 'user-1', email: 'test@example.com' };
    render(<MyCars user={mockUser} />);

    // Wait for the car to appear in the list (as a button)
    const carBtn = await screen.findByText(/Audi A3/i);
    expect(carBtn).toBeInTheDocument();

    // Verify detail view appeared
    await waitFor(() => {
      expect(screen.getByText(/ABC-1234/i)).toBeInTheDocument();
      expect(screen.getByText(/15.000/i)).toBeInTheDocument();
    });
  });
});
