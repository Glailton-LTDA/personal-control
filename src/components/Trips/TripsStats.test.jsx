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
    
    expect(screen.getByText('COUNTRIES')).toBeDefined();
    expect(screen.getByText('CITIES')).toBeDefined();
    expect(screen.getByText('KM TRAVELLED')).toBeDefined();
    expect(screen.getByText('Mapa de Aventuras')).toBeDefined();
    expect(screen.getByText('EXPLORAÇÃO POR CONTINENTE')).toBeDefined();
  });

  it('calculates summary statistics correctly', () => {
    render(<TripsStats trips={mockTrips} />);
    
    // Check using more specific criteria if possible, or just expect it to be present
    // Countries: 01, Cities: 02
    const countriesValue = screen.getAllByText('01');
    expect(countriesValue.length).toBeGreaterThanOrEqual(1);
    
    const citiesValue = screen.getAllByText('02');
    expect(citiesValue.length).toBeGreaterThanOrEqual(1);
  });

  it('shows empty state when no trips are provided', () => {
    render(<TripsStats trips={[]} />);
    expect(screen.getByText('Nenhuma viagem registrada')).toBeDefined();
  });
});
