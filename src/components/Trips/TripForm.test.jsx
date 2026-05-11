import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
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

describe('TripForm', () => {
  const mockUser = { id: 'user-123' };

  it('renders correctly for new trip', () => {
    render(<TripForm user={mockUser} onBack={() => {}} onSave={() => {}} />);
    // Use regex for more flexibility
    expect(screen.getByText(/trips.new_trip/i)).toBeInTheDocument();
  });

  it('calls onSave when form is submitted', async () => {
    const onSave = vi.fn();
    render(<TripForm user={mockUser} onBack={() => {}} onSave={onSave} />);

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
