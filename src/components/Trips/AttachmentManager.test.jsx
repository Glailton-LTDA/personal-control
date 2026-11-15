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

  it('adds a new item when clicking on Add New', () => {
    render(
      <AttachmentManager 
        label="Hospedagem" 
        items={mockItems} 
        onItemsChange={onItemsChange} 
        tripId="trip-1" 
      />
    );

    const addBtn = screen.getByText(/trips\.labels\.add_new_item/i);
    fireEvent.click(addBtn);

    expect(onItemsChange).toHaveBeenCalled();
  });
});
