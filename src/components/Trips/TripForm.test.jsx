import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TripForm from './TripForm';

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

vi.mock('framer-motion', () => ({
  motion: { div: ({ children, ...props }) => <div {...props}>{children}</div> },
  AnimatePresence: ({ children }) => children,
}));

vi.mock('./BadgeInput', () => ({ default: () => <div data-testid="badge-input" /> }));
vi.mock('./AttachmentManager', () => ({ default: () => <div data-testid="attachment-manager" /> }));
vi.mock('./CurrencySelector', () => ({ default: () => <div data-testid="currency-selector" /> }));

// Mock offline hooks
const mockMutateAsync = vi.fn().mockResolvedValue({ id: 'new-trip-id' });
vi.mock('../../hooks/useOfflineTrips', () => ({
  useOfflineCreateTrip: () => ({
    mutateAsync: mockMutateAsync,
  }),
  useOfflineUpdateTrip: () => ({
    mutateAsync: mockMutateAsync,
  }),
}));

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

describe('TripForm', () => {
  const mockUser = { id: 'user-123' };

  it('renders correctly for new trip', () => {
    render(<TripForm user={mockUser} onBack={() => {}} onSave={() => {}} />, { wrapper: Wrapper });
    // Use regex for more flexibility
    expect(screen.getByText(/trips.new_trip/i)).toBeInTheDocument();
  });

  it('calls onSave when form is submitted', async () => {
    const onSave = vi.fn();
    render(<TripForm user={mockUser} onBack={() => {}} onSave={onSave} />, { wrapper: Wrapper });

    // Fix placeholder to match component
    const titleInput = screen.getByPlaceholderText('trips.placeholders.trip_title');
    fireEvent.change(titleInput, { target: { value: 'Nova Viagem' } });

    const submitBtn = screen.getByText(/trips.create_trip/i);
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });
  });
});
