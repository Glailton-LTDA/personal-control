import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Trips from './Trips';

// Mock child components to keep tests focused on orchestration
vi.mock('./TripsList', () => ({
  default: ({ onTripSelect, onEditTrip }) => (
    <div data-testid="trips-list">
      <button onClick={() => onTripSelect({ id: 'trip-1' })}>Select Trip</button>
      <button onClick={() => onEditTrip({ id: 'trip-1' })}>Edit Trip</button>
    </div>
  )
}));

vi.mock('./TripsItinerary', () => ({
  default: ({ onBack }) => (
    <div data-testid="trips-itinerary">
      <button onClick={onBack}>Back to List</button>
    </div>
  )
}));

vi.mock('./TripsSettings', () => ({
  default: () => <div data-testid="trips-settings">Settings</div>
}));

vi.mock('./TripForm', () => ({
  default: ({ onBack }) => (
    <div data-testid="trip-form">
      <button onClick={onBack}>Cancel Form</button>
    </div>
  )
}));

describe('Trips Component', () => {
  const mockUser = { id: 'user-123' };

  it('renders TripsList by default (mode="list")', () => {
    render(<Trips user={mockUser} mode="list" />);
    expect(screen.getByTestId('trips-list')).toBeInTheDocument();
  });

  it('switches to itinerary view when mode="itinerary"', () => {
    render(<Trips user={mockUser} mode="itinerary" />);
    expect(screen.getByTestId('trips-itinerary')).toBeInTheDocument();
  });

  it('switches to settings view when mode="settings"', () => {
    render(<Trips user={mockUser} mode="settings" />);
    expect(screen.getByTestId('trips-settings')).toBeInTheDocument();
  });

  it('switches to form view internally when onEditTrip is called', () => {
    render(<Trips user={mockUser} mode="list" />);
    fireEvent.click(screen.getByText('Edit Trip'));
    expect(screen.getByTestId('trip-form')).toBeInTheDocument();
  });

  it('dispatches set-active-tab event when backing out of itinerary', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    render(<Trips user={mockUser} mode="itinerary" />);
    
    fireEvent.click(screen.getByText('Back to List'));
    
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'set-active-tab',
        detail: { tab: 'trips-list' }
      })
    );
    expect(screen.getByTestId('trips-list')).toBeInTheDocument();
  });
});
