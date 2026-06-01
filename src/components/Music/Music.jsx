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

export default function Music({ user, refreshKey, mode = 'repertoire' }) {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'cifra' | 'partitura'

  // Sub-aba
  const [subTab, setSubTab] = useState('repertoire'); // 'repertoire' | 'setlists'
  const [selectedArtist, setSelectedArtist] = useState('all');
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
  const PAGE_SIZE = 12;

  // Dropdown de artista pesquisável
  const [artistSearch, setArtistSearch] = useState('');
  const [artistDropdownOpen, setArtistDropdownOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const artistButtonRef = useRef(null);
  const artistPanelRef = useRef(null);

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
        if (selectedArtist !== 'all' && !artists.includes(selectedArtist) && (!searchQuery.trim() || selectedArtist.toLowerCase().includes(searchQuery.toLowerCase()))) {
          artists.unshift(selectedArtist);
        }
        setUniqueArtists(artists);
      }
    } catch (e) {
      console.error('Erro ao buscar artistas únicos:', e);
    }
  }, [user?.id, selectedArtist]);

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

  useEffect(() => {
    fetchCustomChords();
    fetchGenres();
    fetchUniqueArtists();
  }, [refreshKey, mode, user?.id, fetchUniqueArtists]);

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
        `, { count: 'exact' });

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
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
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
  }, [page, search, filterType, selectedArtist, selectedGenre, PAGE_SIZE]);

  useEffect(() => {
    fetchSongs();
  }, [fetchSongs, refreshKey, mode]);

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
          <button
            className="icon-btn"
            onClick={() => setSelectedSong(null)}
            style={{ padding: '8px' }}
            title="Voltar ao Repertório"
          >
            <ChevronLeft size={18} />
          </button>
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
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
      {/* ── Sub-Tab Switcher ── */}
      <div style={{ display: 'flex', gap: '1.5rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.75rem' }}>
        <button
          onClick={() => setSubTab('repertoire')}
          style={{
            background: 'transparent',
            border: 'none',
            color: subTab === 'repertoire' ? 'var(--primary)' : 'var(--text-muted)',
            fontSize: '1rem',
            fontWeight: 800,
            cursor: 'pointer',
            paddingBottom: '0.5rem',
            borderBottom: subTab === 'repertoire' ? '2px solid var(--primary)' : '2px solid transparent',
            transition: 'all 0.2s'
          }}
        >
          Repertório
        </button>
        <button
          onClick={() => setSubTab('setlists')}
          style={{
            background: 'transparent',
            border: 'none',
            color: subTab === 'setlists' ? 'var(--primary)' : 'var(--text-muted)',
            fontSize: '1rem',
            fontWeight: 800,
            cursor: 'pointer',
            paddingBottom: '0.5rem',
            borderBottom: subTab === 'setlists' ? '2px solid var(--primary)' : '2px solid transparent',
            transition: 'all 0.2s'
          }}
        >
          Setlists
        </button>
      </div>

      {subTab === 'setlists' ? (
        <Setlists user={user} onSelectSong={setSelectedSong} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', width: '100%' }}>
          
          {/* ── Filter & Search Toolbar ── */}
          <div className="glass-card" style={{
            padding: '1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            {/* Search */}
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

            {/* Action Panel */}
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

          {/* ── Repertoire Grid ── */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '4rem' }}>
              <Loader2 className="animate-spin" style={{ margin: '0 auto 1rem', color: 'var(--primary)' }} />
              <span>Carregando seu repertório...</span>
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
                {songs.map(song => {
                  const isSheet = song.type === 'partitura';
                  return (
                    <div
                      key={song.id}
                      onClick={() => setSelectedSong(song)}
                      className="glass-card"
                      style={{
                        padding: '1.5rem',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        minHeight: '180px',
                        cursor: 'pointer',
                        border: '1px solid var(--glass-border)',
                        position: 'relative',
                        overflow: 'hidden',
                        transition: 'transform 0.2s, border-color 0.2s'
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
                      {/* Visual Background Glow */}
                      <div style={{
                        position: 'absolute',
                        top: '-20%',
                        right: '-10%',
                        width: '100px',
                        height: '100px',
                        background: isSheet ? 'var(--success)' : 'var(--primary)',
                        filter: 'blur(50px)',
                        opacity: 0.08,
                        zIndex: 0
                      }} />

                      {/* Top Info */}
                      <div style={{ position: 'relative', zIndex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                          <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            background: isSheet ? 'rgba(16, 185, 129, 0.08)' : 'rgba(99, 102, 241, 0.08)',
                            color: isSheet ? 'var(--success)' : 'var(--primary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            {isSheet ? <FileText size={18} /> : <MusicIcon size={18} />}
                          </div>
                          
                          {/* Badge */}
                          <span style={{
                            fontSize: '0.65rem',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            background: isSheet ? 'rgba(16, 185, 129, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                            color: isSheet ? '#34d399' : '#818cf8'
                          }}>
                            {song.type}
                          </span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <h4 style={{ fontSize: '1.1rem', fontWeight: 800, margin: '0 0 0.25rem 0', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                            {song.title}
                          </h4>
                          <button
                            onClick={(e) => toggleFavorite(e, song)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              color: song.is_favorite ? '#fbbf24' : 'var(--text-muted)',
                              padding: '2px',
                              marginLeft: '8px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                            title={song.is_favorite ? "Remover dos favoritos" : "Marcar como favorito"}
                          >
                            <Star size={16} fill={song.is_favorite ? "#fbbf24" : "transparent"} />
                          </button>
                        </div>

                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {song.artist || 'Artista Desconhecido'}
                        </p>

                        {song.music_genres?.name && (
                          <span style={{
                            fontSize: '0.7rem',
                            color: 'var(--text-muted)',
                            background: 'rgba(255,255,255,0.04)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            marginTop: '6px',
                            display: 'inline-block'
                          }}>
                            🏷️ {song.music_genres.name}
                          </span>
                        )}
                      </div>

                      {/* Footer and edit/delete actions */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', position: 'relative', zIndex: 1 }}>
                        
                        {/* Storage Type for PDFs */}
                        {isSheet ? (
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                            {song.storage_type === 'cloud' ? '☁️ Sincronizado' : '💻 Local'}
                          </span>
                        ) : (
                          <span />
                        )}

                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button
                            className="icon-btn"
                            onClick={(e) => handleEditSong(e, song)}
                            style={{ padding: '6px' }}
                            title="Editar Música"
                          >
                            <Edit size={12} />
                          </button>
                          <button
                            className="icon-btn"
                            onClick={(e) => handleDeleteSong(e, song.id)}
                            style={{ padding: '6px', color: 'var(--danger)' }}
                            title="Excluir Música"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>

              {/* ── Pagination Footer ── */}
              {totalPages > 1 && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '1rem',
                  marginTop: '2.5rem',
                  borderTop: '1px solid var(--glass-border)',
                  paddingTop: '1.5rem'
                }}>
                  <button
                    className="btn-secondary"
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                  >
                    Anterior
                  </button>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Página <b>{page + 1}</b> de <b>{totalPages}</b> ({totalCount} músicas)
                  </span>
                  <button
                    className="btn-secondary"
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                  >
                    Próxima
                  </button>
                </div>
              )}
            </>
          )}

          {/* Song Modal Form */}
          <SongModal
            isOpen={isModalOpen}
            onClose={() => { setIsModalOpen(false); setEditingSong(null); }}
            onRefresh={() => { fetchSongs(); fetchUniqueArtists(); }}
            user={user}
            initialData={editingSong}
          />

        </div>
      )}
    </div>
  );
}
