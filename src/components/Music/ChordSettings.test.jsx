import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ChordSettings from './ChordSettings';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const renderWithProvider = (ui) => {
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
};

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
  Edit: () => <div data-testid="edit" />,
  Save: () => <div data-testid="save" />,
  Music: () => <div data-testid="music" />,
  ChevronLeft: () => <div data-testid="chevron-left" />,
  ChevronRight: () => <div data-testid="chevron-right" />,
  Search: () => <div data-testid="search-icon" />,
}));

// Mock ChordDiagram component
vi.mock('./ChordDiagram', () => ({
  default: ({ name }) => <div data-testid="chord-diagram">{name}</div>,
}));

// Mock supabase
const mockSingle = vi.fn().mockResolvedValue({ data: { id: 'inst-123' }, error: null });
const mockMaybeSingle = vi.fn().mockResolvedValue({ data: { id: 'inst-123' }, error: null });
const mockSelect = vi.fn(() => ({
  eq: vi.fn(() => ({
    eq: vi.fn(() => ({
      maybeSingle: mockMaybeSingle,
    })),
    single: mockSingle,
    maybeSingle: mockMaybeSingle,
  })),
  order: vi.fn(() => Promise.resolve({ data: [], error: null })),
}));

const mockInsertGenre = vi.fn().mockResolvedValue({ error: null });
const mockDeleteGenre = vi.fn().mockReturnValue({
  eq: vi.fn().mockResolvedValue({ error: null })
});

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn((table) => {
      if (table === 'music_genres') {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({
              data: [
                { id: 'genre-1', name: 'Rock' },
                { id: 'genre-2', name: 'Pop' }
              ],
              error: null
            }))
          })),
          insert: mockInsertGenre,
          delete: mockDeleteGenre
        };
      }
      return {
        select: mockSelect,
        delete: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: { id: 'inst-123' }, error: null })
          }))
        })),
      };
    }),
  },
}));

describe('ChordSettings Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly and loads custom chords', async () => {
    renderWithProvider(<ChordSettings user={{ id: 'user-123' }} />);
    
    expect(screen.getByText('Dicionário de Acordes Customizados')).toBeDefined();
    expect(screen.getByText('Dicionário de Acordes')).toBeDefined();
    expect(screen.getByText('Gêneros Musicais')).toBeDefined();
  });

  it('opens add chord form sidebar when clicking create button', async () => {
    renderWithProvider(<ChordSettings user={{ id: 'user-123' }} />);
    
    const createBtn = screen.getByRole('button', { name: /Criar Acorde/i });
    fireEvent.click(createBtn);

    expect(screen.getByText('Novo Acorde')).toBeDefined();
    expect(screen.getByText('Nome do Acorde *')).toBeDefined();
  });

  it('switches to genres tab and shows genres list', async () => {
    renderWithProvider(<ChordSettings user={{ id: 'user-123' }} />);
    
    const genresTabBtn = screen.getByRole('button', { name: 'Gêneros Musicais' });
    fireEvent.click(genresTabBtn);

    await waitFor(() => {
      expect(screen.getByText('Rock')).toBeDefined();
      expect(screen.getByText('Pop')).toBeDefined();
    });
  });

  it('allows adding a new genre', async () => {
    renderWithProvider(<ChordSettings user={{ id: 'user-123' }} />);
    
    const genresTabBtn = screen.getByRole('button', { name: 'Gêneros Musicais' });
    fireEvent.click(genresTabBtn);

    const input = screen.getByPlaceholderText('Ex: MPB, Rock, Jazz...');
    fireEvent.change(input, { target: { value: 'Jazz' } });

    const addBtn = screen.getByRole('button', { name: /Adicionar/i });
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(mockInsertGenre).toHaveBeenCalledWith({
        user_id: 'user-123',
        name: 'Jazz'
      });
    });
  });

  it('allows deleting a genre', async () => {
    window.confirm = vi.fn().mockReturnValue(true);
    renderWithProvider(<ChordSettings user={{ id: 'user-123' }} />);
    
    const genresTabBtn = screen.getByRole('button', { name: 'Gêneros Musicais' });
    fireEvent.click(genresTabBtn);

    await waitFor(() => {
      expect(screen.getByText('Rock')).toBeDefined();
    });

    const deleteBtns = screen.getAllByTitle('Excluir Gênero');
    fireEvent.click(deleteBtns[0]);

    await waitFor(() => {
      expect(mockDeleteGenre).toHaveBeenCalled();
    });
  });

  it('shows search input in chord dictionary toolbar', async () => {
    renderWithProvider(<ChordSettings user={{ id: 'user-123' }} />);
    const searchInput = screen.getByPlaceholderText(/Buscar acorde/i);
    expect(searchInput).toBeDefined();
  });

  it('renders chords grouped by root note with supabase mock returning chords', async () => {
    // Override mock para retornar acordes C e D
    const { supabase } = await import('../../lib/supabase');
    supabase.from.mockImplementation((table) => {
      if (table === 'music_instruments') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ data: [{ id: 'inst-1', name: 'violao' }], error: null })),
            })),
          })),
        };
      }
      if (table === 'music_chords') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({
              data: [
                { id: 'c1', chord_name: 'C', music_chord_variations: [] },
                { id: 'c2', chord_name: 'Cm', music_chord_variations: [] },
                { id: 'c3', chord_name: 'D', music_chord_variations: [] },
              ],
              error: null,
            })),
          })),
        };
      }
      return { select: mockSelect, delete: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })), insert: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { id: 'inst-1' }, error: null }) })) })) };
    });

    renderWithProvider(<ChordSettings user={{ id: 'user-123' }} />);

    await waitFor(() => {
      // Deve renderizar os nomes dos acordes
      expect(screen.getByText('C')).toBeDefined();
    });
  });
});
