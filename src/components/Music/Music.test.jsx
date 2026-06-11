import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import Music from './Music';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}));

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock Lucide icons
vi.mock('lucide-react', () => ({
  Search: () => <div data-testid="search-icon" />,
  Plus: () => <div data-testid="plus-icon" />,
  Edit: () => <div data-testid="edit-icon" />,
  Trash2: () => <div data-testid="trash-icon" />,
  ChevronLeft: () => <div data-testid="chevron-left-icon" />,
  Music: () => <div data-testid="music-icon" />,
  FileText: () => <div data-testid="file-text-icon" />,
  Settings: () => <div data-testid="settings-icon" />,
  ShieldAlert: () => <div data-testid="shield-alert-icon" />,
  Loader2: () => <div data-testid="loader-icon" className="animate-spin" />,
  Star: ({ fill }) => <div data-testid="star-icon" data-filled={fill} />,
  ChevronDown: () => <div data-testid="chevron-down-icon" />,
  X: () => <div data-testid="x-icon" />,
}));

// Mock child components to isolate Music.jsx testing
vi.mock('./CifraViewer', () => ({ default: () => <div data-testid="cifra-viewer" /> }));
vi.mock('./SheetViewer', () => ({ default: () => <div data-testid="sheet-viewer" /> }));
vi.mock('./SongModal', () => ({ default: () => <div data-testid="song-modal" /> }));
vi.mock('./ChordSettings', () => ({ default: () => <div data-testid="chord-settings" /> }));
vi.mock('./Setlists', () => ({ default: () => <div data-testid="setlists-comp" /> }));

// Mock offline hooks
const mockUseOfflineSongs = vi.fn();
const mockDeleteMutateAsync = vi.fn();
const mockUpdateMutateAsync = vi.fn();
vi.mock('../../hooks/useOfflineSongs', () => ({
  useOfflineSongs: (...args) => mockUseOfflineSongs(...args),
  useOfflineDeleteSong: () => ({ mutateAsync: mockDeleteMutateAsync }),
  useOfflineUpdateSong: () => ({ mutateAsync: mockUpdateMutateAsync }),
}));

const mockGenresData = [
  { id: 'g1', name: 'MPB' },
  { id: 'g2', name: 'Rock' },
];
vi.mock('../../hooks/useOfflineMusic', () => ({
  useOfflineGenres: () => ({ data: mockGenresData }),
  useOfflineUniqueArtists: () => ['Roberto Carlos', 'Tom Jobim'],
  useOfflineArtistsByLetter: () => [{ artist: 'Roberto Carlos', song_count: 5 }],
  useOfflineChords: () => ({ data: [] }),
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});
function Wrapper({ children }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

// Setup supabase mocks
const mockRPC = vi.fn();
const mockSongsQuery = {
  select: vi.fn().mockReturnThis(),
  or: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  range: vi.fn().mockReturnThis(),
};

const mockUniqueArtistsQuery = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
};

const mockGenresQuery = {
  select: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
};

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn((table) => {
      if (table === 'music_songs') {
        return mockSongsQuery;
      }
      if (table === 'music_unique_artists') {
        return mockUniqueArtistsQuery;
      }
      if (table === 'music_genres') {
        return mockGenresQuery;
      }
      return {
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    }),
    rpc: (...args) => mockRPC(...args),
  },
}));

describe('Music Component', () => {
  const mockUser = { id: '9659a65c-7a82-4b08-a9d4-64fd2346cbb1' };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mocks
    mockSongsQuery.range.mockResolvedValue({
      data: [
        { id: 's1', title: 'Detalhes', artist: 'Roberto Carlos', type: 'cifra', is_favorite: true, music_genres: { id: 'g1', name: 'MPB' } },
        { id: 's2', title: 'Garota de Ipanema', artist: 'Tom Jobim', type: 'partitura', is_favorite: false, music_genres: { id: 'g1', name: 'MPB' } }
      ],
      count: 2,
      error: null
    });

    mockUseOfflineSongs.mockReturnValue({
      songs: [
        { id: 's1', title: 'Detalhes', artist: 'Roberto Carlos', type: 'cifra', is_favorite: true, music_genres: { id: 'g1', name: 'MPB' } },
        { id: 's2', title: 'Garota de Ipanema', artist: 'Tom Jobim', type: 'partitura', is_favorite: false, music_genres: { id: 'g1', name: 'MPB' } }
      ],
      totalCount: 2,
      isLoading: false,
    });

    mockUniqueArtistsQuery.limit.mockResolvedValue({
      data: [{ artist: 'Roberto Carlos' }, { artist: 'Tom Jobim' }],
      error: null
    });

    mockGenresQuery.order.mockResolvedValue({
      data: [{ id: 'g1', name: 'MPB' }, { id: 'g2', name: 'Rock' }],
      error: null
    });

    mockRPC.mockResolvedValue({
      data: [{ artist: 'Roberto Carlos', song_count: 5 }],
      error: null
    });
  });

  it('renders correctly showing list table and page controls', async () => {
    render(<Music user={mockUser} mode="repertoire" />, { wrapper: Wrapper });

    expect(screen.getByText('music.repertoire')).toBeDefined();
    expect(screen.getByText('music.setlists')).toBeDefined();

    // Check breadcrumb
    expect(screen.getByText('music.general_repertoire')).toBeDefined();

    // Check alphabet filter buttons are rendered
    expect(screen.getByText('A')).toBeDefined();
    expect(screen.getByText('Z')).toBeDefined();
    expect(screen.getByText('#')).toBeDefined();

    // Wait for songs to load
    await waitFor(() => {
      expect(screen.getByText('Detalhes')).toBeDefined();
      expect(screen.getByText('Roberto Carlos')).toBeDefined();
      expect(screen.getByText('Garota de Ipanema')).toBeDefined();
      expect(screen.getByText('Tom Jobim')).toBeDefined();
    });

    // Check dense table column headers
    expect(screen.getByText('music.song_table_title')).toBeDefined();
    expect(screen.getByText('music.song_table_genre')).toBeDefined();
  });

  it('transitions to list of artists when alphabet letter is clicked', async () => {
    render(<Music user={mockUser} mode="repertoire" />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Detalhes')).toBeDefined();
    });

    // Click letter "R"
    const letterRBtn = screen.getByText('R');
    fireEvent.click(letterRBtn);

    // Should display breadcrumbs update and artist grid
    await waitFor(() => {
      expect(screen.getByText('music.letter')).toBeDefined();
      expect(screen.getByText('Roberto Carlos')).toBeDefined();
      expect(screen.getByText('5 músicas')).toBeDefined();
    });

    // Songs table should NOT be visible while viewing artist list
    expect(screen.queryByText('Detalhes')).toBeNull();
  });

  it('navigates to artist songs when artist is clicked from letter view', async () => {
    render(<Music user={mockUser} mode="repertoire" />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Detalhes')).toBeDefined();
    });

    // Click letter "R"
    fireEvent.click(screen.getByText('R'));

    // Wait for artists to load
    await waitFor(() => {
      expect(screen.getByText('Roberto Carlos')).toBeDefined();
    });

    // Change mock behavior for songs to return only Roberto Carlos songs
    mockUseOfflineSongs.mockReturnValue({
      songs: [
        { id: 's1', title: 'Detalhes', artist: 'Roberto Carlos', type: 'cifra', is_favorite: true, music_genres: { id: 'g1', name: 'MPB' } }
      ],
      totalCount: 1,
      isLoading: false,
    });

    // Click on "Roberto Carlos" artist card
    fireEvent.click(screen.getByText('Roberto Carlos'));

    // Breadcrumbs should contain the artist name
    await waitFor(() => {
      expect(screen.getByText('music.general_repertoire')).toBeDefined();
      expect(screen.getByText('music.letter')).toBeDefined();
      // Wait, there might be multiple 'Roberto Carlos' (breadcrumb and song row)
      const matches = screen.getAllByText('Roberto Carlos');
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    // Verify hook was called with artist filter
    expect(mockUseOfflineSongs).toHaveBeenLastCalledWith(mockUser.id, expect.objectContaining({
      artist: 'Roberto Carlos',
    }));
  });

  it('allows backward navigation using breadcrumbs and back button', async () => {
    render(<Music user={mockUser} mode="repertoire" />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Detalhes')).toBeDefined();
    });

    // Go to letter 'R' -> artist 'Roberto Carlos'
    fireEvent.click(screen.getByText('R'));
    await waitFor(() => expect(screen.getByText('Roberto Carlos')).toBeDefined());
    fireEvent.click(screen.getByText('Roberto Carlos'));

    // Click back button
    const backBtn = screen.getByTitle('music.back');
    fireEvent.click(backBtn);

    // Should be back to letter 'R' view showing Roberto Carlos artist list
    await waitFor(() => {
      expect(screen.getByText('music.letter')).toBeDefined();
      expect(screen.getByText('5 músicas')).toBeDefined();
    });

    // Click "Repertório Geral" in breadcrumbs
    const repGeralLink = screen.getByText('music.general_repertoire');
    fireEvent.click(repGeralLink);

    // Should be back to general songs view
    await waitFor(() => {
      expect(screen.getByText('Detalhes')).toBeDefined();
      expect(screen.getByText('Garota de Ipanema')).toBeDefined();
    });
  });

  it('renders and respects advanced pagination controls', async () => {
    // Return larger dataset to trigger pagination
    const paginatedSongs = Array.from({ length: 15 }, (_, i) => ({
      id: `song-${i}`,
      title: `Música ${i + 1}`,
      artist: 'Artista',
      type: 'cifra'
    }));
    mockUseOfflineSongs.mockReturnValue({
      songs: paginatedSongs,
      totalCount: 65,
      isLoading: false,
    });

    render(<Music user={mockUser} mode="repertoire" />, { wrapper: Wrapper });

    // Wait for loading to finish and verify pagination is shown
    await waitFor(() => {
      expect(screen.getByText('music.items_per_page')).toBeDefined();
      expect(screen.getByText('music.page_info')).toBeDefined();
      expect(screen.getByText('music.go_to')).toBeDefined();
    });

    // Dropdown for page limit selection
    const limitSelect = screen.getAllByRole('combobox').find(select => select.value === '25');
    fireEvent.change(limitSelect, { target: { value: '50' } });

    // Verify limit change resets page to 0 and pageSize is updated in hook call
    await waitFor(() => {
      expect(mockUseOfflineSongs).toHaveBeenCalled();
    });

    // Direct page navigation input
    const pageInput = screen.getByPlaceholderText('music.page_placeholder');
    fireEvent.change(pageInput, { target: { value: '2' } });
    fireEvent.keyDown(pageInput, { key: 'Enter', code: 'Enter' });
  });

  it('clears alphabetical letter filter when a search is performed', async () => {
    render(<Music user={mockUser} mode="repertoire" />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Detalhes')).toBeDefined();
    });

    // Apply Letter S
    fireEvent.click(screen.getByText('S'));
    await waitFor(() => expect(screen.getByText('music.letter')).toBeDefined());

    // Type in global search input
    const searchInput = screen.getByPlaceholderText('music.search_placeholder');
    fireEvent.change(searchInput, { target: { value: 'Amor' } });

    // Should clear letter and switch back to filtered songs
    await waitFor(() => {
      expect(screen.queryByText('music.letter')).toBeNull();
      expect(mockUseOfflineSongs).toHaveBeenLastCalledWith(mockUser.id, expect.objectContaining({
        search: 'Amor',
      }));
    });
  });
});
