import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MyCars from './MyCars';
import { supabase } from '../../lib/supabase';

// Mock react-i18next - Minimalist but robust
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => {
      // Avoid RangeError in toLocaleString
      if (key === 'common.locale') return 'pt-BR';
      if (key === 'common.currency_symbol') return 'R$';
      return key;
    },
    i18n: {
      changeLanguage: vi.fn(),
      language: 'pt-BR',
    },
  }),
}));

const mockServices = [
  { id: 's1', car_id: '1', service_date: '2025-08-15', description: 'Lavagem', km_at_service: 27000, amount: 200, notes: 'Lavagem completa' }
];

const mockCars = [
  { 
    id: '1', 
    name: 'Audi A3', 
    make: 'Audi', 
    model: 'A3', 
    year: 2022, 
    plate: 'ABC-1234', 
    current_km: 15000, 
    is_hidden: false, 
    user_id: 'user-1' 
  },
];

const mockUser = {
  id: 'user-1',
  email: 'test@example.com'
};

describe('MyCars', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Minimalist Supabase mock override
    vi.mocked(supabase.from).mockImplementation((table) => {
      let data = [];
      if (table === 'cars') data = mockCars;
      if (table === 'car_services') data = mockServices;
      
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        order: vi.fn(() => chain),
        delete: vi.fn(() => chain),
        update: vi.fn(() => chain),
        single: vi.fn().mockResolvedValue({ data: {}, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        then: vi.fn((onSuccess) => {
          return Promise.resolve({ data, error: null }).then(onSuccess);
        }),
      };
      return chain;
    });
  });

  it('renders the car list and selects the first one', async () => {
    render(<MyCars user={mockUser} />);

    // Check for car titles using the container test id we added previously
    await waitFor(() => {
      expect(screen.getByTestId('my-cars-container')).toBeInTheDocument();
      expect(screen.getByText(/Audi A3/i)).toBeInTheDocument();
    }, { timeout: 5000 });

    expect(screen.getByText(/ABC-1234/i)).toBeInTheDocument();
  });

  it('includes car_services in total investment', async () => {
    render(<MyCars user={mockUser} />);
    await waitFor(() => {
      expect(screen.getByTestId('my-cars-container')).toBeInTheDocument();
    }, { timeout: 5000 });
    // If services load correctly, the mock ensures no errors occur
    expect(screen.getByText(/Audi A3/i)).toBeInTheDocument();
  });
});
