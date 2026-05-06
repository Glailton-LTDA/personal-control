import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import CustomLists from './CustomLists';
import * as EncryptionContextModule from '../../contexts/EncryptionContext';

// Mock supabase
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn((cb) => cb({ data: [], error: null })),
    })),
  }
}));

// Mock useEncryption hook
const mockEncryption = {
  decryptObject: vi.fn(val => Promise.resolve(val)),
  encryptObject: vi.fn(val => Promise.resolve(val)),
  isUnlocked: true,
};

vi.spyOn(EncryptionContextModule, 'useEncryption').mockReturnValue(mockEncryption);

const mockUser = { id: 'user-123', email: 'test@example.com' };

describe('CustomLists Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly and shows empty state', async () => {
    await act(async () => {
      render(<CustomLists user={mockUser} />);
    });

    expect(screen.getByText('Coleções')).toBeDefined();
    expect(screen.getByText('Selecione uma coleção')).toBeDefined();
  });

  it('opens new list modal when clicking add button', async () => {
    await act(async () => {
      render(<CustomLists user={mockUser} />);
    });

    // Find the add button (the one with the Plus icon)
    const buttons = screen.getAllByRole('button');
    const addBtn = buttons.find(btn => btn.querySelector('svg'));
    
    if (addBtn) {
      fireEvent.click(addBtn);
      expect(screen.getByText('Nova Coleção')).toBeDefined();
      expect(screen.getByPlaceholderText('Ex: Inventário de Remédios')).toBeDefined();
    }
  });
});
