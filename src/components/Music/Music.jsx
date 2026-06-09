import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, Plus, Edit, Trash2, ChevronLeft, Music as MusicIcon, FileText, Settings, ShieldAlert, Loader2, Star, ChevronDown, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

import CifraViewer from './CifraViewer';
import SheetViewer from './SheetViewer';
import SongModal from './SongModal';
import ChordSettings from './ChordSettings';
import Setlists from './Setlists';

export default function Music({ user, refreshKey, mode = 'repertoire', navigate }) {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'cifra' | 'partitura'

  // Sub-aba — inicializada a partir do mode para suportar rota /music-setlists
  const [subTab, setSubTab] = useState(() => mode === 'setlists' ? 'setlists' : 'repertoire');
  const [selectedArtist, setSelectedArtist] = useState(() => {
    if (mode && mode.startsWith('repertoire-artist-')) {
      return decodeURIComponent(mode.replace('repertoire-artist-', ''));
    }
    return 'all';
  });
  const [selectedGenre, setSelectedGenre] = useState('all');
  const [genres, setGenres] = useState([]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSong, setEditingSong] = useState(null);

  // Leitor Ativo
  const [selectedSong, setSelectedSong] = useState(null);

  // Map de acordes personalizados do usuário
  const [customChords, setCustomChords] = useState({});

  // Paginação e filtros
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [uniqueArtists, setUniqueArtists] = useState([]);
  const [pageSize, setPageSize] = useState(25);
  const [pageInput, setPageInput] = useState('');

  // Estados de navegação hierárquica A-Z
  const [activeLetter, setActiveLetter] = useState(() => {
    if (mode && mode.startsWith('repertoire-letter-')) {
      const charCode = mode.replace('repertoire-letter-', '');
      return charCode === 'num' ? '#' : charCode.toUpperCase();
    }
    return null;
  });
  const [artistsList, setArtistsList] = useState([]);
  const [artistsLoading, setArtistsLoading] = useState(false);

  // Dropdown de artista pesquisável
  const [artistSearch, setArtistSearch] = useState('');
  const [artistDropdownOpen, setArtistDropdownOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const artistButtonRef = useRef(null);
  const artistPanelRef = useRef(null);

  // Bug 1: ref para evitar fetch desnecessário quando música já está em memória
  const selectedSongRef = useRef(null);
  useEffect(() => { selectedSongRef.current = selectedSong; }, [selectedSong]);

  // Bug 2: ref para ler selectedArtist em fetchUniqueArtists sem colocá-lo nas deps
  const selectedArtistRef = useRef(selectedArtist);
  useEffect(() => { selectedArtistRef.current = selectedArtist; }, [selectedArtist]);

  // Bug 3: flag para Efeito 2 não resetar estados já inicializados pelo useState lazy
  const isFirstModeMount = useRef(true);

  // Bug 2: selectedArtist lido via ref — evita recriar o callback e disparar efeitos encadeados
  const fetchUniqueArtists = useCallback(async (searchQuery = '') => {
    if (!user?.id) return;
    try {
      let query = supabase
        .from('music_unique_artists')
        .select('artist')
        .eq('user_id', user.id)
        .order('artist', { ascending: true })
        .limit(100);

      if (searchQuery.trim()) {
        query = query.ilike('artist', `%${searchQuery.trim()}%`);
      }

      const { data, error } = await query;

      if (!error && data) {
        const artists = data.map(d => d.artist);
        const current = selectedArtistRef.current;
        if (current !== 'all' && !artists.includes(current) && (!searchQuery.trim() || current.toLowerCase().includes(searchQuery.toLowerCase()))) {
          artists.unshift(current);
        }
        setUniqueArtists(artists);
      }
    } catch (e) {
      console.error('Erro ao buscar artistas únicos:', e);
    }
  }, [user?.id]); // sem selectedArtist — lido via ref

  // Abre o dropdown calculando a posição absoluta do botão no viewport
  const handleOpenArtistDropdown = () => {
    if (artistButtonRef.current) {
      const rect = artistButtonRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + window.scrollY + 6,
        left: rect.left + window.scrollX,
        width: Math.max(rect.width, 220)
      });
    }
    setArtistDropdownOpen(prev => !prev);
    setArtistSearch('');
  };

  // Fecha dropdown ao clicar fora (trigger ou painel)
  useEffect(() => {
    const handleClickOutside = (e) => {
      const clickedButton = artistButtonRef.current?.contains(e.target);
      const clickedPanel = artistPanelRef.current?.contains(e.target);
      if (!clickedButton && !clickedPanel) {
        setArtistDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Bug 6: mode removido das deps — chords e genres são estáticos durante a sessão
  useEffect(() => {
    fetchCustomChords();
    fetchGenres();
    fetchUniqueArtists();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, user?.id, fetchUniqueArtists]);

  useEffect(() => {
    if (artistDropdownOpen) {
      const delayDebounceFn = setTimeout(() => {
        fetchUniqueArtists(artistSearch);
      }, 300);
      return () => clearTimeout(delayDebounceFn);
    } else {
      fetchUniqueArtists('');
    }
  }, [artistSearch, artistDropdownOpen, fetchUniqueArtists]);

  const fetchSongs = useCallback(async () => {
    if (!user?.id) return;
    if (activeLetter && selectedArtist === 'all') {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let query = supabase
        .from('music_songs')
        .select(`
          *,
          music_genres (
            id,
            name
          )
        `, { count: 'exact' })
        .eq('user_id', user.id); // Bug 4: filtro explícito de usuário (defesa além do RLS)

      // Filtro de pesquisa
      if (search.trim()) {
        query = query.or(`title.ilike.%${search.trim()}%,artist.ilike.%${search.trim()}%`);
      }

      // Filtro por tipo de documento
      if (filterType !== 'all') {
        query = query.eq('type', filterType);
      }

      // Filtro por artista
      if (selectedArtist !== 'all') {
        query = query.eq('artist', selectedArtist);
      }

      // Filtro por gênero
      if (selectedGenre !== 'all') {
        query = query.eq('genre_id', selectedGenre);
      }

      // Ordenação: favoritos primeiro, depois título ascendente
      query = query
        .order('is_favorite', { ascending: false })
        .order('title', { ascending: true });

      // Paginação
      const from = page * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;
      setSongs(data || []);
      setTotalCount(count || 0);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao buscar repertório.');
    } finally {
      setLoading(false);
    }
  }, [page, search, filterType, selectedArtist, selectedGenre, pageSize, activeLetter, user?.id]);

  useEffect(() => {
    fetchSongs();
  }, [fetchSongs, refreshKey]);

  const fetchArtistsByLetter = useCallback(async (letter) => {
    if (!user?.id || !letter) return;
    setArtistsLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_artists_by_letter', {
        p_user_id: user.id,
        p_letter: letter
      });
      if (error) throw error;
      setArtistsList(data || []);
    } catch (err) {
      console.error('Erro ao buscar artistas por letra:', err);
      toast.error('Erro ao carregar artistas.');
    } finally {
      setArtistsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (activeLetter) {
      fetchArtistsByLetter(activeLetter);
    }
  }, [activeLetter, refreshKey, fetchArtistsByLetter]);

  const handleLetterClick = (letter) => {
    const charCode = letter === '#' ? 'num' : letter.toLowerCase();
    if (navigate) {
      navigate(`music-repertoire-letter-${charCode}`);
    } else {
      setActiveLetter(letter);
      setSelectedArtist('all');
      setPage(0);
      setSearch('');
    }
  };

  const handleArtistClick = (artist) => {
    if (navigate) {
      navigate(`music-repertoire-artist-${encodeURIComponent(artist)}`);
    } else {
      setSelectedArtist(artist);
      setPage(0);
    }
  };

  const clearLetterFilter = () => {
    if (navigate) {
      navigate('music-repertoire');
    } else {
      setActiveLetter(null);
      setSelectedArtist('all');
      setPage(0);
    }
  };

  const goBackToArtists = () => {
    if (navigate) {
      if (activeLetter) {
        const charCode = activeLetter === '#' ? 'num' : activeLetter.toLowerCase();
        navigate(`music-repertoire-letter-${charCode}`);
      } else {
        navigate('music-repertoire');
      }
    } else {
      setSelectedArtist('all');
      setPage(0);
    }
  };

  const resetNavigation = () => {
    if (navigate) {
      navigate('music-repertoire');
    } else {
      setActiveLetter(null);
      setSelectedArtist('all');
      setPage(0);
    }
  };

  const songRouteId = mode.startsWith('song-') ? mode.replace('song-', '') : null;

  // Efeito 1: Carregar música pelo ID da URL
  // Bug 1: usa selectedSongRef para evitar fetch quando a música já está em memória
  useEffect(() => {
    if (!songRouteId || !user?.id) return;
    if (selectedSongRef.current?.id === songRouteId) return; // cache hit — sem fetch
    supabase
      .from('music_songs')
      .select('*, music_genres(id, name)')
      .eq('id', songRouteId)
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          const songObj = Array.isArray(data) ? data[0] : data;
          setSelectedSong(songObj);
        } else {
          toast.error('Música não encontrada.');
          if (navigate) navigate('music-repertoire');
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songRouteId, user?.id]);

  // Efeito 2: Sincronizar estados de navegação com a URL
  // Bug 3: pula o mount inicial — estados já inicializados pelo useState lazy
  // Bug 5: inclui mode 'setlists' para subTab ser roteável
  useEffect(() => {
    if (isFirstModeMount.current) {
      isFirstModeMount.current = false;
      return;
    }
    if (mode === 'setlists') {
      setSubTab('setlists');
      return;
    }
    setSubTab('repertoire');
    if (songRouteId) return; // modo de música — tratado pelo Efeito 1
    if (mode.startsWith('repertoire-letter-')) {
      const charCode = mode.replace('repertoire-letter-', '');
      const char = charCode === 'num' ? '#' : charCode.toUpperCase();
      setActiveLetter(char);
      setSelectedArtist('all');
      setPage(0);
      setSearch('');
      setSelectedSong(null);
    } else if (mode.startsWith('repertoire-artist-')) {
      const artist = decodeURIComponent(mode.replace('repertoire-artist-', ''));
      setSelectedArtist(artist);
      setPage(0);
      setSelectedSong(null);
    } else if (mode === 'repertoire') {
      setActiveLetter(null);
      setSelectedArtist('all');
      setSelectedSong(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const fetchGenres = async () => {
    try {
      const { data, error } = await supabase
        .from('music_genres')
        .select('id, name')
        .order('name', { ascending: true });
      if (!error && data) {
        setGenres(data);
      }
    } catch (e) {
      console.error('Erro ao carregar gêneros:', e);
    }
  };



  // Carrega acordes cadastrados e monta o mapeamento
  const fetchCustomChords = async () => {
    try {
      const { data, error } = await supabase
        .from('music_chords')
        .select(`
          chord_name,
          music_instruments ( name ),
          music_chord_variations (
            frets,
            fingers,
            start_fret
          )
        `);

      if (!error && data) {
        const chordMap = {};
        data.forEach(chord => {
          const instName = chord.music_instruments?.name;
          const name = chord.chord_name.toUpperCase();
          const variation = chord.music_chord_variations?.[0];

          if (instName && variation) {
            if (!chordMap[instName]) chordMap[instName] = {};
            chordMap[instName][name] = {
              frets: variation.frets,
              fingers: variation.fingers,
              startFret: variation.start_fret
            };
          }
        });
        setCustomChords(chordMap);
      }
    } catch (e) {
      console.error('Erro ao mapear acordes customizados:', e);
    }
  };

  const handleDeleteSong = async (e, id) => {
    e.stopPropagation(); // Evita abrir a música
    if (!window.confirm('Tem certeza que deseja excluir esta música do seu repertório? Todos os arquivos e anotações vinculados serão removidos.')) {
      return;
    }

    try {
      // Se for partitura em nuvem, remove do Supabase Storage também
      const songToDelete = songs.find(s => s.id === id);
      if (songToDelete?.type === 'partitura' && songToDelete.storage_type === 'cloud') {
        await supabase.storage
          .from('music_sheets')
          .remove([songToDelete.file_path]);
      }

      const { error } = await supabase
        .from('music_songs')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      toast.success('Música removida do repertório!');
      if (selectedSong?.id === id) {
        setSelectedSong(null);
      }
      fetchSongs();
      fetchUniqueArtists();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao excluir música.');
    }
  };

  const handleEditSong = (e, song) => {
    e.stopPropagation();
    setEditingSong(song);
    setIsModalOpen(true);
  };

  const toggleFavorite = async (e, song) => {
    e.stopPropagation();
    try {
      const { error } = await supabase
        .from('music_songs')
        .update({ is_favorite: !song.is_favorite })
        .eq('id', song.id);

      if (error) throw error;
      fetchSongs();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao atualizar favorito.');
    }
  };

  // Funções de manipulação de filtros que resetam página
  const handleSearchChange = (val) => {
    setSearch(val);
    setPage(0);
    if (val.trim()) {
      setActiveLetter(null);
      setSelectedArtist('all');
    }
  };

  const handleFilterTypeChange = (val) => {
    setFilterType(val);
    setPage(0);
  };

  const handleSelectedArtistChange = (val) => {
    setSelectedArtist(val);
    setPage(0);
  };

  const handleSelectedGenreChange = (val) => {
    setSelectedGenre(val);
    setPage(0);
  };

  // Se o usuário selecionou uma música, abre o visualizador correspondente
  if (selectedSong) {
    const handleEditFromViewer = (song) => {
      setEditingSong(song);
      setIsModalOpen(true);
    };

    const handleSavedFromViewer = (updatedSong) => {
      setSelectedSong(updatedSong);
      fetchSongs();
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
        {/* Back header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <a
            href="/music-repertoire"
            className="icon-btn"
            onClick={(e) => {
              e.preventDefault();
              if (navigate) navigate('music-repertoire');
              else setSelectedSong(null);
            }}
            style={{ padding: '8px', display: 'flex', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}
            title="Voltar ao Repertório"
          >
            <ChevronLeft size={18} />
          </a>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>
            REPERTÓRIO / {selectedSong.type.toUpperCase()}
          </span>
        </div>

        {selectedSong.type === 'cifra' ? (
          <CifraViewer song={selectedSong} customChords={customChords} onEdit={handleEditFromViewer} />
        ) : (
          <SheetViewer song={selectedSong} user={user} onEdit={handleEditFromViewer} />
        )}

        {/* Modal de edição inline (sem sair do viewer) */}
        <SongModal
          isOpen={isModalOpen}
          onClose={() => { setIsModalOpen(false); setEditingSong(null); }}
          onRefresh={() => { /* lista será atualizada via onSaved */ }}
          user={user}
          initialData={editingSong}
          onSaved={handleSavedFromViewer}
        />
      </div>
    );
  }

  // Visualização de Ajustes de Acordes
  if (mode === 'settings') {
    return <ChordSettings user={user} />;
  }

  const isFiltered = search.trim() || filterType !== 'all' || selectedArtist !== 'all' || selectedGenre !== 'all';
  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
      {/* ── Sub-Tab Switcher — Bug 5: links semânticos para suportar abertura em nova aba ── */}
      <div style={{ display: 'flex', gap: '1.5rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.75rem' }}>
        <a
          href="/music-repertoire"
          onClick={(e) => {
            if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
              e.preventDefault();
              if (navigate) navigate('music-repertoire');
              else setSubTab('repertoire');
            }
          }}
          style={{
            background: 'transparent',
            border: 'none',
            color: subTab === 'repertoire' ? 'var(--primary)' : 'var(--text-muted)',
            fontSize: '1rem',
            fontWeight: 800,
            cursor: 'pointer',
            paddingBottom: '0.5rem',
            borderBottom: subTab === 'repertoire' ? '2px solid var(--primary)' : '2px solid transparent',
            transition: 'all 0.2s',
            textDecoration: 'none'
          }}
        >
          Repertório
        </a>
        <a
          href="/music-setlists"
          onClick={(e) => {
            if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
              e.preventDefault();
              if (navigate) navigate('music-setlists');
              else setSubTab('setlists');
            }
          }}
          style={{
            background: 'transparent',
            border: 'none',
            color: subTab === 'setlists' ? 'var(--primary)' : 'var(--text-muted)',
            fontSize: '1rem',
            fontWeight: 800,
            cursor: 'pointer',
            paddingBottom: '0.5rem',
            borderBottom: subTab === 'setlists' ? '2px solid var(--primary)' : '2px solid transparent',
            transition: 'all 0.2s',
            textDecoration: 'none'
          }}
        >
          Setlists
        </a>
      </div>

      {subTab === 'setlists' ? (
        <Setlists
          user={user}
          onSelectSong={(song) => {
            if (navigate) navigate(`music-song-${song.id}`);
            else setSelectedSong(song);
          }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
          
          {/* Breadcrumbs & Botão de Voltar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {(activeLetter || selectedArtist !== 'all') && (
              <button
                className="icon-btn"
                onClick={() => {
                  if (selectedArtist !== 'all') {
                    goBackToArtists();
                  } else {
                    resetNavigation();
                  }
                }}
                style={{ padding: '6px' }}
                title="Voltar"
              >
                <ChevronLeft size={16} />
              </button>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
              <span
                onClick={resetNavigation}
                style={{
                  cursor: 'pointer',
                  color: activeLetter ? 'var(--primary)' : 'var(--text-main)',
                  fontWeight: activeLetter ? 500 : 700
                }}
              >
                Repertório Geral
              </span>
              {activeLetter && (
                <>
                  <span style={{ color: 'var(--text-muted)' }}>/</span>
                  <span
                    onClick={goBackToArtists}
                    style={{
                      cursor: 'pointer',
                      color: selectedArtist !== 'all' ? 'var(--primary)' : 'var(--text-main)',
                      fontWeight: selectedArtist !== 'all' ? 500 : 700
                    }}
                  >
                    Letra {activeLetter}
                  </span>
                </>
              )}
              {selectedArtist !== 'all' && (
                <>
                  <span style={{ color: 'var(--text-muted)' }}>/</span>
                  <span style={{ color: 'var(--text-main)', fontWeight: 700 }}>
                    {selectedArtist}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Barra de Filtro Alfabético */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center', background: 'rgba(255, 255, 255, 0.01)', padding: '0.5rem', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
            {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '#'].map((char) => {
              const targetPath = `music-repertoire-letter-${char === '#' ? 'num' : char.toLowerCase()}`;
              return (
                <a
                  key={char}
                  href={`/${targetPath}`}
                  onClick={(e) => {
                    if (!e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                      e.preventDefault();
                      handleLetterClick(char);
                    }
                  }}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    background: activeLetter === char ? 'var(--primary)' : 'transparent',
                    color: activeLetter === char ? '#ffffff' : 'var(--text-muted)',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    textDecoration: 'none'
                  }}
                  className="alphabet-btn"
                  onMouseEnter={e => { if (activeLetter !== char) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; }}
                  onMouseLeave={e => { if (activeLetter !== char) e.currentTarget.style.background = 'transparent'; }}
                >
                  {char}
                </a>
              );
            })}
            {activeLetter && (
              <button
                onClick={clearLetterFilter}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--danger)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '0.25rem 0.5rem',
                  marginLeft: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.2rem'
                }}
              >
                <X size={14} /> Limpar
              </button>
            )}
          </div>

          {/* ── Barra de Busca e Filtros ── */}
          <div className="glass-card" style={{
            padding: '1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            {/* Busca */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: '250px', position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="glass-input"
                placeholder="Pesquisar por título, artista ou banda..."
                value={search}
                onChange={e => handleSearchChange(e.target.value)}
                style={{ paddingLeft: '2.5rem' }}
              />
            </div>

            {/* Painel de Ações */}
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Tipo de Documento */}
              <select
                className="select-filter"
                value={filterType}
                onChange={e => handleFilterTypeChange(e.target.value)}
              >
                <option value="all">Todas Músicas</option>
                <option value="cifra">Cifras & Tablaturas (TXT)</option>
                <option value="partitura">Partituras (PDF)</option>
              </select>

              {/* Filtro Artista – Dropdown Pesquisável via Portal */}
              <div style={{ position: 'relative' }}>
                <button
                  ref={artistButtonRef}
                  onClick={handleOpenArtistDropdown}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.45rem 0.9rem',
                    background: selectedArtist !== 'all' ? 'rgba(99,102,241,0.12)' : 'var(--input-bg)',
                    border: '1px solid',
                    borderColor: selectedArtist !== 'all' ? 'rgba(99,102,241,0.4)' : 'var(--glass-border)',
                    borderRadius: '8px',
                    color: selectedArtist !== 'all' ? 'var(--primary)' : 'var(--text-muted)',
                    fontSize: '0.82rem',
                    fontWeight: selectedArtist !== 'all' ? 700 : 500,
                    cursor: 'pointer',
                    minWidth: '145px',
                    maxWidth: '200px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {selectedArtist === 'all' ? 'Todos Artistas' : selectedArtist}
                  </span>
                  {selectedArtist !== 'all' ? (
                    <X
                      size={13}
                      onClick={(e) => { e.stopPropagation(); handleSelectedArtistChange('all'); setArtistDropdownOpen(false); }}
                      style={{ flexShrink: 0, color: 'var(--primary)' }}
                    />
                  ) : (
                    <ChevronDown size={13} style={{ flexShrink: 0 }} />
                  )}
                </button>

                {/* Painel renderizado via Portal no document.body — escapa qualquer stacking context */}
                {artistDropdownOpen && createPortal(
                  <div
                    ref={artistPanelRef}
                    style={{
                      position: 'absolute',
                      top: dropdownPos.top,
                      left: dropdownPos.left,
                      zIndex: 9999,
                      background: 'var(--bg-card)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: '10px',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
                      minWidth: dropdownPos.width,
                      maxHeight: '280px',
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden'
                    }}
                  >
                    {/* Campo de busca */}
                    <div style={{ padding: '0.6rem', borderBottom: '1px solid var(--glass-border)', flexShrink: 0 }}>
                      <div style={{ position: 'relative' }}>
                        <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                          autoFocus
                          type="text"
                          placeholder="Buscar artista..."
                          value={artistSearch}
                          onChange={e => setArtistSearch(e.target.value)}
                          style={{
                            width: '100%',
                            background: 'var(--input-bg)',
                            border: '1px solid var(--glass-border)',
                            borderRadius: '6px',
                            padding: '5px 8px 5px 26px',
                            color: 'var(--text-main)',
                            fontSize: '0.8rem',
                            outline: 'none',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                    </div>

                    {/* Lista de artistas */}
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                      <div
                        onClick={() => { handleSelectedArtistChange('all'); setArtistDropdownOpen(false); }}
                        style={{
                          padding: '0.5rem 0.9rem',
                          cursor: 'pointer',
                          fontSize: '0.82rem',
                          fontWeight: selectedArtist === 'all' ? 700 : 400,
                          color: selectedArtist === 'all' ? 'var(--primary)' : 'var(--text-muted)',
                          background: selectedArtist === 'all' ? 'rgba(99,102,241,0.08)' : 'transparent',
                          borderBottom: '1px solid var(--glass-border)'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                        onMouseLeave={e => e.currentTarget.style.background = selectedArtist === 'all' ? 'rgba(99,102,241,0.08)' : 'transparent'}
                      >
                        Todos os Artistas
                      </div>

                      {uniqueArtists
                        .filter(a => a.toLowerCase().includes(artistSearch.toLowerCase()))
                        .map(artist => (
                          <div
                            key={artist}
                            onClick={() => { handleSelectedArtistChange(artist); setArtistDropdownOpen(false); }}
                            style={{
                              padding: '0.5rem 0.9rem',
                              cursor: 'pointer',
                              fontSize: '0.82rem',
                              fontWeight: selectedArtist === artist ? 700 : 400,
                              color: selectedArtist === artist ? 'var(--primary)' : 'var(--text-main)',
                              background: selectedArtist === artist ? 'rgba(99,102,241,0.08)' : 'transparent',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}
                            onMouseEnter={e => { if (selectedArtist !== artist) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = selectedArtist === artist ? 'rgba(99,102,241,0.08)' : 'transparent'; }}
                          >
                            {artist}
                          </div>
                        ))
                      }

                      {uniqueArtists.filter(a => a.toLowerCase().includes(artistSearch.toLowerCase())).length === 0 && (
                        <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          Nenhum artista encontrado
                        </div>
                      )}
                    </div>
                  </div>,
                  document.body
                )}
              </div>

              {/* Filtro Gênero */}
              <select
                className="select-filter"
                value={selectedGenre}
                onChange={e => handleSelectedGenreChange(e.target.value)}
              >
                <option value="all">Todos Gêneros</option>
                {genres.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>

              {/* Adicionar Nova */}
              <button
                className="btn-primary"
                onClick={() => { setEditingSong(null); setIsModalOpen(true); }}
                style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Plus size={14} />
                <span>Nova Música</span>
              </button>
            </div>
          </div>

          {/* Renderização Condicional do Conteúdo */}
          {activeLetter && selectedArtist === 'all' ? (
            /* ── TELA 1: Grid de Artistas Filtrados por Letra ── */
            artistsLoading ? (
              <div style={{ textAlign: 'center', padding: '4rem' }}>
                <Loader2 className="animate-spin" style={{ margin: '0 auto 1rem', color: 'var(--primary)' }} />
                <span>Carregando artistas...</span>
              </div>
            ) : artistsList.length === 0 ? (
              <div className="glass-card" style={{ padding: '4rem 2rem', textAlign: 'center', border: '1px dashed var(--glass-border)', background: 'rgba(255,255,255,0.01)' }}>
                <MusicIcon size={32} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem' }} />
                <h4 style={{ margin: 0 }}>Nenhum artista encontrado</h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.25rem 0' }}>Não há artistas cadastrados que começam com a letra "{activeLetter}".</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1.5rem' }}>
                {artistsList.map(({ artist, song_count }) => (
                  <a
                    key={artist}
                    href={`/music-repertoire-artist-${encodeURIComponent(artist)}`}
                    onClick={(e) => {
                      if (!e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                        e.preventDefault();
                        handleArtistClick(artist);
                      }
                    }}
                    className="glass-card"
                    style={{
                      padding: '1.5rem',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textAlign: 'center',
                      cursor: 'pointer',
                      border: '1px solid var(--glass-border)',
                      transition: 'all 0.2s',
                      textDecoration: 'none',
                      color: 'inherit'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = 'translateY(-3px)';
                      e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.borderColor = 'var(--glass-border)';
                    }}
                  >
                    <div style={{
                      width: '56px',
                      height: '56px',
                      borderRadius: '50%',
                      background: 'rgba(99, 102, 241, 0.08)',
                      color: 'var(--primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: '1.4rem',
                      marginBottom: '1rem'
                    }}>
                      {artist.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', whiteSpace: 'nowrap' }}>
                      {artist}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                      {song_count} {song_count === 1 ? 'música' : 'músicas'}
                    </div>
                  </a>
                ))}
              </div>
            )
          ) : (
            /* ── TELA 2: Tabela Densa de Músicas (Geral ou Artista Selecionado) ── */
            loading ? (
              <div style={{ textAlign: 'center', padding: '4rem' }}>
                <Loader2 className="animate-spin" style={{ margin: '0 auto 1rem', color: 'var(--primary)' }} />
                <span>Carregando repertório...</span>
              </div>
            ) : songs.length === 0 ? (
              isFiltered ? (
                <div className="glass-card" style={{ padding: '4rem 2rem', textAlign: 'center', border: '1px dashed var(--glass-border)', background: 'rgba(255,255,255,0.01)' }}>
                  <MusicIcon size={32} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem' }} />
                  <h4 style={{ margin: 0 }}>Nenhuma música encontrada</h4>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.25rem 0 1.25rem 0' }}>Tente ajustar os termos de pesquisa ou remover alguns filtros.</p>
                  <button className="btn-secondary" onClick={() => { setSearch(''); setFilterType('all'); setSelectedArtist('all'); setSelectedGenre('all'); setPage(0); }} style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}>Limpar Filtros</button>
                </div>
              ) : (
                <div className="glass-card" style={{ padding: '5rem 2rem', textAlign: 'center', border: '1px dashed var(--glass-border)', background: 'rgba(255,255,255,0.01)' }}>
                  <MusicIcon size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 1.5rem' }} />
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>Seu repertório está vazio</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '400px', margin: '0.5rem auto 1.5rem', lineHeight: 1.5 }}>
                    Cadastre novas cifras manualmente ou use o script de importação para carregar seus arquivos locais de partitura.
                  </p>
                  <button className="btn-primary" onClick={() => { setEditingSong(null); setIsModalOpen(true); }} style={{ padding: '0.6rem 1.5rem' }}>
                    Cadastrar Primeira Música
                  </button>
                </div>
              )
            ) : (
              <>
                <div className="table-responsive" style={{ overflowX: 'auto', width: '100%' }}>
                  <table className="dense-table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px', padding: '0.75rem 0.5rem' }}></th>
                        <th>Título</th>
                        <th>Artista</th>
                        <th>Gênero</th>
                        <th style={{ width: '120px' }}>Tipo</th>
                        <th style={{ width: '100px', textAlign: 'right' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {songs.map(song => {
                        const isSheet = song.type === 'partitura';
                        return (
                          <tr
                            key={song.id}
                            onClick={(e) => {
                              if (e.metaKey || e.ctrlKey) {
                                return;
                              }
                              e.preventDefault();
                              if (navigate) navigate(`music-song-${song.id}`);
                              else setSelectedSong(song);
                            }}
                            className="table-row-hover"
                            style={{ cursor: 'pointer' }}
                          >
                            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                              <button
                                onClick={(e) => toggleFavorite(e, song)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  color: song.is_favorite ? '#fbbf24' : 'var(--text-muted)',
                                  padding: 0,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                                title={song.is_favorite ? "Remover dos favoritos" : "Marcar como favorito"}
                              >
                                <Star size={16} fill={song.is_favorite ? "#fbbf24" : "transparent"} />
                              </button>
                            </td>
                            <td style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ color: isSheet ? 'var(--success)' : 'var(--primary)', display: 'flex', alignItems: 'center' }}>
                                  {isSheet ? <FileText size={16} /> : <MusicIcon size={16} />}
                                </span>
                                <a
                                  href={`/music-song-${song.id}`}
                                  onClick={(e) => {
                                    if (!e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                                      e.preventDefault();
                                      if (navigate) navigate(`music-song-${song.id}`);
                                      else setSelectedSong(song);
                                    }
                                  }}
                                  style={{ color: 'inherit', textDecoration: 'none' }}
                                >
                                  {song.title}
                                </a>
                              </div>
                            </td>
                            <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                              {song.artist || 'Artista Desconhecido'}
                            </td>
                            <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                              {song.music_genres?.name ? (
                                <span style={{
                                  background: 'rgba(255, 255, 255, 0.04)',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontSize: '0.75rem'
                                }}>
                                  {song.music_genres.name}
                                </span>
                              ) : '-'}
                            </td>
                            <td>
                              <span style={{
                                fontSize: '0.65rem',
                                fontWeight: 800,
                                padding: '2px 8px',
                                borderRadius: '4px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                background: isSheet ? 'rgba(16, 185, 129, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                                color: isSheet ? '#34d399' : '#818cf8',
                                display: 'inline-block'
                              }}>
                                {song.type}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                              <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                                <button
                                  className="icon-btn"
                                  onClick={(e) => handleEditSong(e, song)}
                                  style={{ padding: '6px' }}
                                  title="Editar Música"
                                >
                                  <Edit size={14} />
                                </button>
                                <button
                                  className="icon-btn"
                                  onClick={(e) => handleDeleteSong(e, song.id)}
                                  style={{ padding: '6px', color: 'var(--danger)' }}
                                  title="Excluir Música"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* ── Paginação Avançada ── */}
                {totalPages > 1 && (
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '1rem',
                    marginTop: '2.5rem',
                    borderTop: '1px solid var(--glass-border)',
                    paddingTop: '1.5rem',
                    flexWrap: 'wrap'
                  }}>
                    {/* Items por Página */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      <span>Itens por página:</span>
                      <select
                        value={pageSize}
                        onChange={(e) => {
                          setPageSize(Number(e.target.value));
                          setPage(0);
                        }}
                        className="select-filter"
                        style={{ padding: '0.25rem 0.5rem', minWidth: '75px' }}
                      >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </div>

                    {/* Controles */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <button
                        className="btn-secondary"
                        onClick={() => setPage(0)}
                        disabled={page === 0}
                        style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}
                        title="Primeira Página"
                      >
                        &lt;&lt;
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                        disabled={page === 0}
                        style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}
                      >
                        Anterior
                      </button>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0.5rem' }}>
                        Página <b>{page + 1}</b> de <b>{totalPages}</b> ({totalCount} músicas)
                      </span>
                      <button
                        className="btn-secondary"
                        onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={page >= totalPages - 1}
                        style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}
                      >
                        Próxima
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={() => setPage(totalPages - 1)}
                        disabled={page >= totalPages - 1}
                        style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}
                        title="Última Página"
                      >
                        &gt;&gt;
                      </button>
                    </div>

                    {/* Ir Para Página */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      <span>Ir para:</span>
                      <input
                        type="number"
                        value={pageInput}
                        onChange={(e) => setPageInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = parseInt(pageInput, 10);
                            if (!isNaN(val) && val >= 1 && val <= totalPages) {
                              setPage(val - 1);
                              setPageInput('');
                            } else {
                              toast.error(`Página inválida. Escolha entre 1 e ${totalPages}.`);
                            }
                          }
                        }}
                        placeholder="Nº"
                        className="glass-input"
                        style={{ width: '60px', padding: '0.25rem 0.5rem', textAlign: 'center', fontSize: '0.85rem' }}
                      />
                    </div>
                  </div>
                )}
              </>
            )
          )}

          {/* Song Modal Form */}
          <SongModal
            isOpen={isModalOpen}
            onClose={() => { setIsModalOpen(false); setEditingSong(null); }}
            onRefresh={() => { fetchSongs(); fetchUniqueArtists(); if (activeLetter) fetchArtistsByLetter(activeLetter); }}
            user={user}
            initialData={editingSong}
          />

        </div>
      )}
    </div>
  );
}
