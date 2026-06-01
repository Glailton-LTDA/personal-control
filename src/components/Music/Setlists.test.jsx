import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import Setlists from './Setlists';

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock Lucide icons to avoid render issues
vi.mock('lucide-react', () => ({
  Plus: () => <div data-testid="plus" />,
  Trash2: () => <div data-testid="trash" />,
  ChevronLeft: () => <div data-testid="chevron-left" />,
  ChevronUp: () => <div data-testid="chevron-up" />,
  ChevronDown: () => <div data-testid="chevron-down" />,
  Play: () => <div data-testid="play" />,
  X: () => <div data-testid="x" />,
  Loader2: () => <div data-testid="loader" />,
  ListPlus: () => <div data-testid="list-plus" />,
}));

const mockInsertSetlist = vi.fn().mockResolvedValue({ error: null });
const mockDeleteSetlist = vi.fn().mockReturnValue({
  eq: vi.fn().mockResolvedValue({ error: null })
});

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn((table) => {
      if (table === 'music_setlists') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({
                data: [
                  { id: 'setlist-1', name: 'Show Rock', description: 'Repertório acústico' }
                ],
                error: null
              }))
            }))
          })),
          insert: mockInsertSetlist,
          delete: mockDeleteSetlist
        };
      }
      if (table === 'music_setlist_songs') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({
                data: [
                  {
                    setlist_id: 'setlist-1',
                    song_id: 'song-1',
                    order_index: 1,
                    music_songs: {
                      id: 'song-1',
                      title: 'Bohemian Rhapsody',
                      artist: 'Queen',
                      type: 'cifra'
                    }
                  }
                ],
                error: null
              }))
            }))
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ error: null })
            }))
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ error: null })
            }))
          }))
        };
      }
      return {
        select: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: [], error: null }))
        }))
      };
    })
  }
}));

describe('Setlists Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders setlists correctly', async () => {
    render(<Setlists user={{ id: 'user-123' }} onSelectSong={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Seus Setlists')).toBeDefined();
      expect(screen.getByText('Show Rock')).toBeDefined();
      expect(screen.getByText('Repertório acústico')).toBeDefined();
    });
  });

  it('opens new setlist modal when clicking button', async () => {
    render(<Setlists user={{ id: 'user-123' }} onSelectSong={vi.fn()} />);

    const createBtn = screen.getByRole('button', { name: /Novo Setlist/i });
    fireEvent.click(createBtn);

    expect(screen.getAllByText('Novo Setlist').length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText('Ex: Show Acústico 2026')).toBeDefined();
  });

  it('navigates to details when clicking setlist card', async () => {
    const mockSelectSong = vi.fn();
    render(<Setlists user={{ id: 'user-123' }} onSelectSong={mockSelectSong} />);

    await waitFor(() => {
      const setlistCard = screen.getByText('Show Rock');
      fireEvent.click(setlistCard);
    });

    await waitFor(() => {
      expect(screen.getByText('Bohemian Rhapsody')).toBeDefined();
      expect(screen.getByText('Queen')).toBeDefined();
    });
  });
});
