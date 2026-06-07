import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import SheetViewer from './SheetViewer';

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock Lucide icons to avoid render issues
vi.mock('lucide-react', () => ({
  ChevronLeft: () => <div data-testid="chevron-left" />,
  ChevronRight: () => <div data-testid="chevron-right" />,
  ZoomIn: () => <div data-testid="zoom-in" />,
  ZoomOut: () => <div data-testid="zoom-out" />,
  Highlighter: () => <div data-testid="highlighter" />,
  Type: () => <div data-testid="type" />,
  Save: () => <div data-testid="save" />,
  Trash2: () => <div data-testid="trash" />,
  Bookmark: () => <div data-testid="bookmark" />,
  AlertCircle: () => <div data-testid="alert-circle" />,
  Upload: () => <div data-testid="upload" />,
  Play: () => <div data-testid="play" />,
  Pause: () => <div data-testid="pause" />,
  X: () => <div data-testid="x" />,
  Maximize2: () => <div data-testid="maximize" />,
  Minimize2: () => <div data-testid="minimize" />,
}));

// Mock supabase
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
    })),
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn(() => Promise.resolve({ data: { signedUrl: 'mock-signed-url' }, error: null })),
      })),
    },
  },
}));

const mockSongCloud = {
  id: 'song-cloud-123',
  title: 'Cloud Song',
  artist: 'Cloud Artist',
  storage_type: 'cloud',
  file_path: 'sheets/cloud_song.pdf',
};

const mockSongLocal = {
  id: 'song-local-123',
  title: 'Local Song',
  artist: 'Local Artist',
  storage_type: 'local',
  file_path: 'sheets/local_song.pdf',
};

describe('SheetViewer Component', () => {
  let mockPdfDoc;
  let mockPage;
  let mockRequest;
  let mockStore;
  let mockOpenRequest;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPage = {
      getViewport: vi.fn(() => ({ width: 600, height: 800 })),
      render: vi.fn(() => ({
        promise: Promise.resolve(),
        cancel: vi.fn(),
      })),
    };

    mockPdfDoc = {
      numPages: 3,
      getPage: vi.fn(() => Promise.resolve(mockPage)),
    };

    window.pdfjsLib = {
      GlobalWorkerOptions: {
        workerSrc: '',
      },
      getDocument: vi.fn(() => ({
        promise: Promise.resolve(mockPdfDoc),
      })),
    };

    // Mock HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      drawImage: vi.fn(),
      fillRect: vi.fn(),
    }));

    // Mock IndexedDB
    mockRequest = {
      onsuccess: null,
      onerror: null,
    };

    mockStore = {
      get: vi.fn(() => {
        setTimeout(() => {
          if (mockRequest.onsuccess) {
            mockRequest.onsuccess({ target: { result: null } });
          }
        }, 0);
        return mockRequest;
      }),
      put: vi.fn(() => {
        setTimeout(() => {
          if (mockRequest.onsuccess) {
            mockRequest.onsuccess({});
          }
        }, 0);
        return mockRequest;
      }),
      delete: vi.fn(() => {
        setTimeout(() => {
          if (mockRequest.onsuccess) {
            mockRequest.onsuccess({});
          }
        }, 0);
        return mockRequest;
      }),
    };

    const mockTransaction = {
      objectStore: vi.fn(() => mockStore),
    };

    const mockDb = {
      objectStoreNames: {
        contains: vi.fn(() => true),
      },
      transaction: vi.fn(() => mockTransaction),
    };

    mockOpenRequest = {
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
    };

    globalThis.indexedDB = {
      open: vi.fn(() => {
        setTimeout(() => {
          if (mockOpenRequest.onsuccess) {
            mockOpenRequest.onsuccess({ target: { result: mockDb } });
          }
        }, 0);
        return mockOpenRequest;
      }),
    };
  });

  it('renders loading state by default', () => {
    render(<SheetViewer song={mockSongCloud} user={{ id: 'user-123' }} />);
    expect(screen.getByText('Renderizando partitura...')).toBeDefined();
  });

  it('loads cloud PDF automatically using signed URL', async () => {
    render(<SheetViewer song={mockSongCloud} user={{ id: 'user-123' }} />);
    
    await waitFor(() => {
      expect(window.pdfjsLib.getDocument).toHaveBeenCalledWith('mock-signed-url');
    });

    await waitFor(() => {
      expect(screen.getByText(/1 de 3/)).toBeDefined();
    });
  });

  it('displays placeholder for local storage type when not cached', async () => {
    render(<SheetViewer song={mockSongLocal} user={{ id: 'user-123' }} />);
    
    await waitFor(() => {
      expect(screen.getByText('Partitura Local Pendente')).toBeDefined();
      expect(screen.getByText(/Arraste ou clique para selecionar o arquivo PDF original/)).toBeDefined();
    });
  });

  it('toggles fullscreen mode when clicking the fullscreen button', async () => {
    render(<SheetViewer song={mockSongCloud} user={{ id: 'user-123' }} />);
    
    await waitFor(() => {
      expect(screen.getByTitle('Tela Cheia')).toBeDefined();
    });
    
    const fullscreenBtn = screen.getByTitle('Tela Cheia');
    fireEvent.click(fullscreenBtn);
    
    expect(screen.getByTitle('Sair de Tela Cheia')).toBeDefined();
    
    fireEvent.click(screen.getByTitle('Sair de Tela Cheia'));
    expect(screen.getByTitle('Tela Cheia')).toBeDefined();
  });
});
