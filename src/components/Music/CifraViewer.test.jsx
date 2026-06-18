import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import CifraViewer from './CifraViewer';

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

const mockSong = {
  id: 'song-123',
  title: 'Love of My Life',
  artist: 'Queen',
  type: 'cifra',
  content: `A                         F#m
Love of my life you've hurt me
Bm
You've broken my heart

E|-----------------------------|
B|-------------3---------------|
G|-------2-------2-------------|
D|-----0---0-------0-----------|
A|---0-------------------------|
E|-3---------------------------|`
};

describe('CifraViewer Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders song title and artist correctly', () => {
    render(<CifraViewer song={mockSong} />);
    
    expect(screen.getByText('Love of My Life')).toBeDefined();
    expect(screen.getByText('Queen')).toBeDefined();
  });

  it('identifies and displays chords and lyrics lines', () => {
    render(<CifraViewer song={mockSong} />);
    
    // Check if chords are rendered
    expect(screen.getAllByText('A').length).toBeGreaterThan(0);
    expect(screen.getAllByText('F#m').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bm').length).toBeGreaterThan(0);
    
    // Check if lyric lines are rendered
    expect(screen.getAllByText("Love of my life you've hurt me").length).toBeGreaterThan(0);
    expect(screen.getAllByText("You've broken my heart").length).toBeGreaterThan(0);
  });

  it('identifies and groups tablature blocks', () => {
    const { container } = render(<CifraViewer song={mockSong} />);
    
    // Check for pre tags which render tabs
    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre.textContent).toContain('E|-----------------------------|');
    expect(pre.textContent).toContain('E|-3---------------------------|');
  });

  it('transposes chords correctly when clicking tom controls', () => {
    render(<CifraViewer song={mockSong} />);
    
    // Find key display indicator (initially 0)
    const tomDisplay = screen.getByText('0');
    expect(tomDisplay).toBeDefined();
    
    // Find the increase half tone button (Aumentar Meio Tom)
    const incBtn = screen.getByTitle('Aumentar Meio Tom');
    fireEvent.click(incBtn);
    
    // The tom display should change to +1
    expect(screen.getByText('+1')).toBeDefined();
    
    // The chord A transposed +1 is A#
    expect(screen.getAllByText('A#').length).toBeGreaterThan(0);
    
    // The chord F#m transposed +1 is Gm
    expect(screen.getAllByText('Gm').length).toBeGreaterThan(0);
  });

  it('highlights and transposes slash extension chords like C7/9 and A7/4 correctly', () => {
    const songWithExtensions = {
      id: 'song-ext-123',
      title: 'Disritmia',
      artist: 'Martinho da Vila',
      type: 'cifra',
      content: `Gm C7/9 Gm
Eu quero me esconder debaixo
A7/4 D7/9
Dessa tua saia`
    };

    render(<CifraViewer song={songWithExtensions} />);

    // Check if chords are highlighted (rendered as chord-highlight spans)
    expect(screen.getAllByText('Gm').length).toBeGreaterThan(0);
    expect(screen.getAllByText('C7/9').length).toBeGreaterThan(0);
    expect(screen.getAllByText('A7/4').length).toBeGreaterThan(0);
    expect(screen.getAllByText('D7/9').length).toBeGreaterThan(0);

    // Transpose +1 half tone
    const incBtn = screen.getByTitle('Aumentar Meio Tom');
    fireEvent.click(incBtn);

    // Gm -> G#m, C7/9 -> C#7/9, A7/4 -> A#7/4, D7/9 -> D#7/9
    expect(screen.getAllByText('G#m').length).toBeGreaterThan(0);
    expect(screen.getAllByText('C#7/9').length).toBeGreaterThan(0);
    expect(screen.getAllByText('A#7/4').length).toBeGreaterThan(0);
    expect(screen.getAllByText('D#7/9').length).toBeGreaterThan(0);
  });

  it('filters tablature blocks based on instrument specific tags', () => {
    const songWithTags = {
      id: 'song-tag-123',
      title: 'Multinstrument Song',
      artist: 'Artist',
      type: 'cifra',
      content: `[violao]
E|--guitar-tab--|
[ukulele]
A|--ukulele-tab--|
[geral]
Common Lyric Line`
    };

    render(<CifraViewer song={songWithTags} />);

    // Active instrument is default (violao)
    expect(screen.queryAllByText('E|--guitar-tab--|').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('A|--ukulele-tab--|').length).toBe(0);
    expect(screen.getAllByText('Common Lyric Line').length).toBeGreaterThan(0);

    // Select Ukulele instrument
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'ukulele' } });

    // Now ukulele tab is visible, guitar tab is hidden
    expect(screen.queryAllByText('E|--guitar-tab--|').length).toBe(0);
    expect(screen.queryAllByText('A|--ukulele-tab--|').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Common Lyric Line').length).toBeGreaterThan(0);
  });

  it('shows Edit button when onEdit prop is provided and fires callback on click', () => {
    const onEdit = vi.fn();
    render(<CifraViewer song={mockSong} onEdit={onEdit} />);

    const editBtn = screen.getByTitle('Editar música');
    expect(editBtn).toBeDefined();
    fireEvent.click(editBtn);
    expect(onEdit).toHaveBeenCalledWith(mockSong);
  });

  it('does not show Edit button when onEdit prop is not provided', () => {
    render(<CifraViewer song={mockSong} />);
    expect(screen.queryByTitle('Editar música')).toBeNull();
  });

  it('renders music_link badge when song has a link', () => {
    const songWithLink = { ...mockSong, music_link: 'https://youtube.com/watch?v=abc' };
    render(<CifraViewer song={songWithLink} />);

    const linkBadge = screen.getByText('Abrir Link de Referência');
    expect(linkBadge).toBeDefined();
    expect(linkBadge.closest('a').getAttribute('href')).toBe('https://youtube.com/watch?v=abc');
    expect(linkBadge.closest('a').getAttribute('target')).toBe('_blank');
  });

  it('does not render music_link badge when song has no link', () => {
    render(<CifraViewer song={mockSong} />);
    expect(screen.queryByText('Abrir Link de Referência')).toBeNull();
  });

  it('toggles fullscreen mode when clicking the fullscreen button', () => {
    render(<CifraViewer song={mockSong} />);
    
    const fullscreenBtn = screen.getByTitle('Tela Cheia');
    expect(fullscreenBtn).toBeDefined();
    
    fireEvent.click(fullscreenBtn);
    expect(screen.getByTitle('Sair de Tela Cheia')).toBeDefined();
    
    fireEvent.click(screen.getByTitle('Sair de Tela Cheia'));
    expect(screen.getByTitle('Tela Cheia')).toBeDefined();
  });

  it('highlights and transposes complex chords correctly', () => {
    const complexSong = {
      id: 'song-complex-123',
      title: 'Complex Chords',
      artist: 'Artist',
      type: 'cifra',
      content: 'F#m7(5-)       C(add9)       G#m7(b5)\nLyrics line'
    };

    render(<CifraViewer song={complexSong} />);

    // Check if complex chords are detected and highlighted
    expect(screen.getAllByText('F#m7(5-)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('C(add9)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('G#m7(b5)').length).toBeGreaterThan(0);

    // Transpose +1
    const incBtn = screen.getByTitle('Aumentar Meio Tom');
    fireEvent.click(incBtn);

    // Transposed +1:
    // F#m7(5-) -> Gm7(5-)
    // C(add9) -> C#(add9)
    // G#m7(b5) -> Am7(b5)
    expect(screen.getAllByText('Gm7(5-)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('C#(add9)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Am7(b5)').length).toBeGreaterThan(0);
  });

  it('shows tooltip on chord hover and hides it on mouseOut after delay', async () => {
    vi.useFakeTimers();
    render(<CifraViewer song={mockSong} />);
    
    // Find the chord 'A'
    const chordA = screen.getAllByText('A').find(el => el.classList.contains('chord-highlight'));
    expect(chordA).toBeDefined();

    const initialCount = screen.getAllByText('A').length;

    // Trigger mouseOver
    fireEvent.mouseOver(chordA);
    
    // Tooltip should be visible
    expect(screen.getAllByText('A').length).toBeGreaterThan(initialCount);

    // Find the chord 'A' again (the original became detached because of dangerouslySetInnerHTML re-render)
    const activeChordA = screen.getAllByText('A').find(el => el.classList.contains('chord-highlight') && document.body.contains(el));
    expect(activeChordA).toBeDefined();

    // Trigger mouseOut
    fireEvent.mouseOut(activeChordA);
    
    // Advance timers by 300ms
    act(() => {
      vi.runAllTimers();
    });
    
    // Tooltip should be hidden
    expect(screen.getAllByText('A').length).toBe(initialCount);
    
    vi.useRealTimers();
  });

  it('shows tooltip on chord click and stays visible until clicking elsewhere', () => {
    render(<CifraViewer song={mockSong} />);
    
    const chordA = screen.getAllByText('A').find(el => el.classList.contains('chord-highlight'));
    expect(chordA).toBeDefined();

    const initialCount = screen.getAllByText('A').length;

    // Click on chord
    fireEvent.click(chordA);
    
    // Tooltip should be visible
    expect(screen.getAllByText('A').length).toBeGreaterThan(initialCount);

    // Click elsewhere (window)
    fireEvent.click(window);
    
    // Tooltip should be hidden
    expect(screen.getAllByText('A').length).toBe(initialCount);
  });
});

