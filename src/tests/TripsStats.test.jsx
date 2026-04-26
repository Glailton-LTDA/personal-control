import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import TripsStats from '../components/Trips/TripsStats';

// Mock dependencies
vi.mock('../../data/continents', () => ({
  getContinent: vi.fn((country) => {
    const map = { 'Brasil': 'América do Sul', 'França': 'Europa' };
    return map[country] || 'Outro';
  })
}));

vi.mock('../../lib/geo', () => ({
  estimateItineraryDistance: vi.fn(() => 1200)
}));

const mockTrips = [
  {
    id: '1',
    title: 'Viagem Brasil',
    countries: ['Brasil'],
    cities: ['São Paulo', 'Rio'],
    start_date: '2024-01-01',
    end_date: '2024-01-10',
    itinerary: []
  },
  {
    id: '2',
    title: 'Viagem França',
    countries: ['França'],
    cities: ['Paris'],
    start_date: '2024-02-01',
    end_date: '2024-02-05',
    itinerary: []
  }
];

describe('TripsStats', () => {
  it('renders stats correctly when trips are provided', () => {
    const onBack = vi.fn();
    render(<TripsStats trips={mockTrips} onBack={onBack} />);

    expect(screen.getByText('Minha Jornada')).toBeDefined();
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText('Países Visitados').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Brasil')).toBeDefined();
    expect(screen.getByText('França')).toBeDefined();
    expect(screen.getByText('América do Sul')).toBeDefined();
    expect(screen.getByText('Europa')).toBeDefined();
    
    // Check KM
    expect(screen.getAllByText(/km/i).length).toBeGreaterThanOrEqual(1);
  });

  it('calls onBack when back button is clicked', () => {
    const onBack = vi.fn();
    render(<TripsStats trips={mockTrips} onBack={onBack} />);
    
    const backBtn = screen.getByRole('button');
    fireEvent.click(backBtn);
    expect(onBack).toHaveBeenCalled();
  });

  it('returns null when no trips are provided', () => {
    const { container } = render(<TripsStats trips={[]} onBack={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
});
