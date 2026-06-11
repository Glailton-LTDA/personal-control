import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TripsItinerary from './TripsItinerary';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

function Wrapper({ children }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

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

// Mock ItineraryManager to simplify the test surface
vi.mock('./ItineraryManager', () => ({
  default: ({ trip }) => <div data-testid="itinerary-manager">Manager for {trip.title}</div>
}));

// Mock offline hooks
const mockTrips = [
  { id: 'trip-1', title: 'Viagem 1', start_date: '2024-01-01', end_date: '2024-01-05', itinerary: [] },
  { id: 'trip-2', title: 'Viagem 2', start_date: '2024-02-01', end_date: '2024-02-05', itinerary: [] }
];
const mockUseOfflineTrips = vi.fn();
const mockUseOfflineItinerary = vi.fn();

vi.mock('../../hooks/useOfflineTrips', () => ({
  useOfflineTrips: () => mockUseOfflineTrips(),
  useOfflineItinerary: () => mockUseOfflineItinerary(),
  useOfflineCreateItineraryItem: () => ({ mutateAsync: vi.fn() }),
  useOfflineUpdateItineraryItem: () => ({ mutateAsync: vi.fn() }),
  useOfflineDeleteItineraryItem: () => ({ mutateAsync: vi.fn() }),
  useOfflineUpdateTrip: () => ({ mutateAsync: vi.fn() }),
}));

describe('TripsItinerary Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    queryClient.clear();

    mockUseOfflineTrips.mockReturnValue({
      data: mockTrips,
      isLoading: false,
    });

    mockUseOfflineItinerary.mockReturnValue({
      data: [],
      isLoading: false,
    });
  });

  it('renders and fetches trips', async () => {
    render(<TripsItinerary user={{ id: 'u1' }} />, { wrapper: Wrapper });
    
    expect(screen.getByText('trips.itineraries')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText('Viagem 1')).toBeInTheDocument();
      expect(screen.getByText('Viagem 2')).toBeInTheDocument();
    });
  });

  it('selects trip from initialTripId', async () => {
    render(<TripsItinerary user={{ id: 'u1' }} initialTripId="trip-2" />, { wrapper: Wrapper });
    
    await waitFor(() => {
      expect(screen.getByTestId('itinerary-manager')).toHaveTextContent('Manager for Viagem 2');
    });
  });

  it('selects trip from localStorage if no initialTripId', async () => {
    localStorage.setItem('pc_selected_trip_v1', 'trip-1');
    render(<TripsItinerary user={{ id: 'u1' }} />, { wrapper: Wrapper });
    
    await waitFor(() => {
      expect(screen.getByTestId('itinerary-manager')).toHaveTextContent('Manager for Viagem 1');
    });
  });

  it('calls onBack when back button is clicked', async () => {
    const onBackMock = vi.fn();
    render(<TripsItinerary user={{ id: 'u1' }} onBack={onBackMock} />, { wrapper: Wrapper });
    
    const backBtn = await screen.findByTestId('back-button');
    fireEvent.click(backBtn);
    expect(onBackMock).toHaveBeenCalled();
  });

  it('filters trips based on search query', async () => {
    render(<TripsItinerary user={{ id: 'u1' }} />, { wrapper: Wrapper });
    
    await screen.findByText('Viagem 1');
    
    const searchInput = screen.getByPlaceholderText('trips.search_trip_placeholder');
    fireEvent.change(searchInput, { target: { value: 'Viagem 2' } });
    
    await waitFor(() => {
      expect(screen.queryByText('Viagem 1')).not.toBeInTheDocument();
      expect(screen.getByText('Viagem 2')).toBeInTheDocument();
    });
  });
});
