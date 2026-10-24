import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import toast from 'react-hot-toast';
import { db } from '../../lib/offline/db';
import SongEditor from './SongEditor';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../../hooks/useOfflineMusic', () => ({
  useOfflineGenres: () => ({ data: [] }),
  useOfflineSetlists: () => ({ data: [] }),
}));

vi.mock('../../lib/offline/SyncEngine', () => ({
  SyncEngine: class {
    constructor() {
      this.isOnline = true;
    }
    enqueue() {
      return Promise.resolve();
    }
    destroy() {}
  },
}));

const insertSingle = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({ single: insertSingle })),
      })),
    })),
  },
}));

function renderEditor() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SongEditor user={{ id: 'u1' }} onClose={vi.fn()} />
    </QueryClientProvider>
  );
}

describe('SongEditor — criação de música', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await db.music_songs.clear();
  });

  it('mostra erro e não deixa música fantasma quando o insert é recusado', async () => {
    insertSingle.mockResolvedValue({
      data: null,
      error: { code: '23503', message: 'violates foreign key constraint' },
    });

    renderEditor();
    fireEvent.change(screen.getByPlaceholderText('music.title_placeholder'), {
      target: { value: 'Música nova' },
    });
    fireEvent.click(screen.getByText('music.save_song'));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
    expect(await db.music_songs.count()).toBe(0);
  });

  it('limpa a cópia temporária e guarda a música quando o insert funciona', async () => {
    insertSingle.mockResolvedValue({
      data: {
        id: '11111111-1111-4111-8111-111111111111',
        user_id: 'u1',
        title: 'Música nova',
        type: 'cifra',
        content: 'C G',
      },
      error: null,
    });

    renderEditor();
    fireEvent.change(screen.getByPlaceholderText('music.title_placeholder'), {
      target: { value: 'Música nova' },
    });
    fireEvent.click(screen.getByText('music.save_song'));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('music.song_created'));
    const rows = await db.music_songs.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('11111111-1111-4111-8111-111111111111');
  });
});
