import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MyCars from './MyCars';
import { supabase } from '../../lib/supabase';
import { EncryptionProvider } from '../../contexts/EncryptionContext';

const mockCars = [
  { id: '1', name: 'Audi A3', make: 'Audi', model: 'A3', year: 2022, plate: 'ABC-1234', current_km: 15000, is_hidden: false, user_id: 'user-1' },
];

describe('MyCars', () => {
  const mockUser = { id: 'user-1', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Set bypass for E2E/Test mode in EncryptionContext
    window.localStorage.setItem('pc_e2e_test', 'true');

    // Setup specific mock for this test using the global supabase mock structure
    vi.mocked(supabase.from).mockImplementation((table) => {
      let data = [];
      if (table === 'cars') data = mockCars;
      
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

  it('renders the car list and selects the first one', async () => {
    render(
      <EncryptionProvider user={mockUser}>
        <MyCars user={mockUser} />
      </EncryptionProvider>
    );

    // Wait for the car name to appear in a heading or button
    const carHeadings = await screen.findAllByText(/Audi A3/i);
    expect(carHeadings.length).toBeGreaterThan(0);

    // Verify detail view appeared
    const plates = await screen.findAllByText(/ABC-1234/i);
    expect(plates.length).toBeGreaterThan(0);
    
    const kms = await screen.findAllByText(/15/);
    expect(kms.length).toBeGreaterThan(0);
  });
});
