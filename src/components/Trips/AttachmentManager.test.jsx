import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AttachmentManager from './AttachmentManager';

vi.mock('framer-motion', () => ({
  motion: { div: ({ children, ...props }) => <div {...props}>{children}</div> },
  AnimatePresence: ({ children }) => children,
}));

describe('AttachmentManager', () => {
  const mockItems = [
    { id: '1', name: 'Hotel 1', confirmation: 'CONF1' }
  ];
  const onItemsChange = vi.fn();

  it('renders correctly and toggles expansion', () => {
    render(
      <AttachmentManager 
        label="Hospedagem" 
        items={mockItems} 
        onItemsChange={onItemsChange} 
        tripId="trip-1" 
      />
    );

    expect(screen.getAllByText(/Hospedagem/i).length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue(/Hotel 1/i)).toBeInTheDocument();
    // Correct text is "+ Adicionar novo..."
    expect(screen.getByText(/\+ Adicionar novo/i)).toBeInTheDocument();
  });

  it('adds a new item when clicking on Add New', () => {
    render(
      <AttachmentManager 
        label="Hospedagem" 
        items={mockItems} 
        onItemsChange={onItemsChange} 
        tripId="trip-1" 
      />
    );

    const addBtn = screen.getByText(/\+ Adicionar novo/i);
    fireEvent.click(addBtn);

    expect(onItemsChange).toHaveBeenCalled();
  });
});
