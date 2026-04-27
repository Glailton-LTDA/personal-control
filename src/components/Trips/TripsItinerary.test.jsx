import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import TripsItinerary from './TripsItinerary';
import { supabase } from '../../lib/supabase';

// Mock ItineraryManager to simplify the test surface
vi.mock('./ItineraryManager', () => ({
  default: ({ trip }) => <div data-testid="itinerary-manager">Manager for {trip.title}</div>
}));

describe('TripsItinerary Component', () => {
  const mockUser = { id: 'user-123' };
  const mockTrips = [
    { id: 'trip-1', title: 'Viagem 1', start_date: '2024-01-01', end_date: '2024-01-05', itinerary: [] },
    { id: 'trip-2', title: 'Viagem 2', start_date: '2024-02-01', end_date: '2024-02-05', itinerary: [] }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    
    // Setup the global supabase mock to return our data
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: vi.fn((cb) => Promise.resolve({ data: mockTrips, error: null }).then(cb)),
    });
  });

  it('renders and fetches trips', async () => {
    await act(async () => {
      render(<TripsItinerary user={mockUser} />);
    });
    
    expect(screen.getByText('Roteiros')).toBeInTheDocument();
    expect(await screen.findByText('Viagem 1')).toBeInTheDocument();
    expect(await screen.findByText('Viagem 2')).toBeInTheDocument();
  });

  it('selects trip from initialTripId', async () => {
    await act(async () => {
      render(<TripsItinerary user={mockUser} initialTripId="trip-2" />);
    });
    
    expect(await screen.findByTestId('itinerary-manager')).toHaveTextContent('Manager for Viagem 2');
  });

  it('selects trip from localStorage if no initialTripId', async () => {
    localStorage.setItem('pc_selected_trip_v1', 'trip-1');
    await act(async () => {
      render(<TripsItinerary user={mockUser} />);
    });
    
    expect(await screen.findByTestId('itinerary-manager')).toHaveTextContent('Manager for Viagem 1');
  });

  it('calls onBack when back button is clicked', async () => {
    const onBackMock = vi.fn();
    render(<TripsItinerary user={mockUser} onBack={onBackMock} />);
    
    const backBtn = await screen.findByTestId('back-button');
    fireEvent.click(backBtn);
    expect(onBackMock).toHaveBeenCalled();
  });

  it('filters trips based on search query', async () => {
    await act(async () => {
      render(<TripsItinerary user={mockUser} />);
    });
    
    await screen.findByText('Viagem 1');
    
    const searchInput = screen.getByPlaceholderText('Buscar viagem...');
    fireEvent.change(searchInput, { target: { value: 'Viagem 2' } });
    
    expect(screen.queryByText('Viagem 1')).not.toBeInTheDocument();
    expect(screen.getByText('Viagem 2')).toBeInTheDocument();
  });
});
