import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TripForm from './TripForm';

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
    expect(screen.getByText(/Nova Viagem/i)).toBeInTheDocument();
  });

  it('calls onSave when form is submitted', async () => {
    const onSave = vi.fn();
    render(<TripForm user={mockUser} onBack={() => {}} onSave={onSave} />);

    // Fix placeholder to match component: "Ex: Férias no Peru"
    const titleInput = screen.getByPlaceholderText(/Ex: Férias no Peru/i);
    fireEvent.change(titleInput, { target: { value: 'Nova Viagem' } });

    const submitBtn = screen.getByText(/Criar Viagem/i);
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });
  });
});
