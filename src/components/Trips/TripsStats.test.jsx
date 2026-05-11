import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TripsStats from './TripsStats';
import React from 'react';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: {
      changeLanguage: vi.fn(),
      language: 'pt-BR',
    },
  }),
}));

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
        in: vi.fn(() => Promise.resolve({ data: [], error: null })),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
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

  it('renders correctly with trip data', async () => {
    await act(async () => {
      render(<TripsStats trips={mockTrips} />);
    });
    
    expect(screen.getAllByText('trips.countries_visited')[0]).toBeDefined();
    expect(screen.getAllByText('trips.cities_visited')[0]).toBeDefined();
    expect(screen.getByText('trips.km_traveled')).toBeDefined();
  });

  it('groups locations correctly and avoids duplicate countries as cities', async () => {
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
    await act(async () => {
      render(<TripsStats trips={tripsWithDuplicates} />);
    });
    
    // Total cities should be 2 (Lisboa and Porto)
    const citiesLabel = screen.getAllByText('trips.cities_visited')[0];
    const summaryCard = citiesLabel.closest('.summary-card');
    expect(summaryCard.textContent).toContain('02');
    
    // Country chip should show "2 cidades"
    // Since we used {country.cityCount} {country.cityCount === 1 ? t('finances.entry') : t('finances.entries')}
    // In our mock t(key) returns key, so it will be "2 finances.entries"
    expect(screen.getByText(/2 finances.entries/i)).toBeDefined();
  });
});
