import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TripsStats from './TripsStats';
import React from 'react';

// Mock components and libraries
vi.mock('react-simple-maps', () => ({
  ComposableMap: ({ children }) => <div data-testid="map">{children}</div>,
  Geographies: ({ children }) => <div>{children({ geographies: [] })}</div>,
  Geography: () => <div />,
  Marker: () => <div />,
  ZoomableGroup: ({ children }) => <div>{children}</div>
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        in: vi.fn(() => Promise.resolve({ data: [], error: null }))
      }))
    }))
  }
}));

const mockTrips = [
  {
    id: '1',
    countries: ['Brasil'],
    cities: ['São Paulo', 'Rio de Janeiro'],
    start_date: '2023-01-01',
    end_date: '2023-01-10'
  }
];

describe('TripsStats Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly with trip data', () => {
    render(<TripsStats trips={mockTrips} />);
    
    expect(screen.getAllByText('Países Visitados')[0]).toBeDefined();
    expect(screen.getAllByText('Cidades Visitadas')[0]).toBeDefined();
    expect(screen.getByText('Km Percorridos')).toBeDefined();
  });

  it('groups locations correctly and avoids duplicate countries as cities', () => {
    const tripsWithDuplicates = [
      {
        id: '1',
        countries: ['Portugal'],
        cities: [
          'Lisboa, Portugal', 
          'lisboa, portugal', 
          'Porto, Portugal',
          'Portugal' // Should be ignored as a city
        ],
        start_date: '2023-01-01',
        end_date: '2023-01-10'
      }
    ];
    render(<TripsStats trips={tripsWithDuplicates} />);
    
    // Total cities should be 2 (Lisboa and Porto)
    const citiesLabel = screen.getAllByText('Cidades Visitadas')[0];
    const summaryCard = citiesLabel.closest('.summary-card');
    expect(summaryCard.textContent).toContain('02');
    
    // Country chip should show "2 cidades"
    expect(screen.getByText(/2 cidades/i)).toBeDefined();
  });
});
