import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MyCars from './MyCars';
import { supabase } from '../../lib/supabase';

const mockCars = [
  { id: '1', name: 'Audi A3', make: 'Audi', model: 'A3', year: 2022, plate: 'ABC-1234', current_km: 15000, is_hidden: false },
];

describe('MyCars', () => {
  const mockUser = { id: 'user-1', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup specific mock for this test using the global supabase mock structure
    vi.mocked(supabase.from).mockImplementation((table) => {
      const data = table === 'cars' ? mockCars : [];
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        then: vi.fn(cb => Promise.resolve({ data, error: null }).then(cb)),
      };
    });
  });

  it('renders the car list correctly', async () => {
    render(<MyCars user={mockUser} />);

    // Wait for the car to appear in the list
    const carBtn = await screen.findByText(/Audi A3/i);
    expect(carBtn).toBeInTheDocument();

    // Verify detail view appeared (ABC-1234 and 15.000)
    await waitFor(() => {
      expect(screen.getByText(/ABC-1234/i)).toBeInTheDocument();
      // KM is formatted with locale, so we use regex
      expect(screen.getByText(/15/)).toBeInTheDocument();
    });
  });
});
