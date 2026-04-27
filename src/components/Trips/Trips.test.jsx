import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders TripsList by default (mode="list")', async () => {
    render(<Trips user={mockUser} mode="list" />);
    expect(await screen.findByTestId('trips-list')).toBeInTheDocument();
  });

  it('switches to itinerary view when mode="itinerary"', async () => {
    render(<Trips user={mockUser} mode="itinerary" />);
    expect(await screen.findByTestId('trips-itinerary')).toBeInTheDocument();
  });

  it('switches to settings view when mode="settings"', async () => {
    render(<Trips user={mockUser} mode="settings" />);
    expect(await screen.findByTestId('trips-settings')).toBeInTheDocument();
  });

  it('switches to form view internally when onEditTrip is called', async () => {
    const user = userEvent.setup();
    render(<Trips user={mockUser} mode="list" />);
    
    const editBtn = await screen.findByText('Edit Trip');
    await user.click(editBtn);
    
    expect(await screen.findByTestId('trip-form')).toBeInTheDocument();
  });

  it('dispatches set-active-tab event when backing out of itinerary', async () => {
    const user = userEvent.setup();
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    render(<Trips user={mockUser} mode="itinerary" />);
    
    const backBtn = await screen.findByText('Back to List');
    await user.click(backBtn);
    
    await waitFor(() => {
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'set-active-tab',
          detail: { tab: 'trips-list' }
        })
      );
    });
    
    expect(await screen.findByTestId('trips-list')).toBeInTheDocument();
  });
});
