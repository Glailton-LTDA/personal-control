import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, ChevronLeft, ChevronUp, ChevronDown, Play, X, Loader2, ListPlus, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

const MODAL_PAGE_SIZE = 30;

export default function Setlists({ user, onSelectSong }) {
  const [setlists, setSetlists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSetlist, setActiveSetlist] = useState(null);
  const [setlistSongs, setSetlistSongs] = useState([]);
  const [songsLoading, setSongsLoading] = useState(false);

  // Setlist Form Modal
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [editingId, setEditingId] = useState(null);

  // Add Songs Modal — busca server-side com filtros e load-more
  const [isAddSongsOpen, setIsAddSongsOpen] = useState(false);
  const [modalSongs, setModalSongs] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalSearch, setModalSearch] = useState('');
  const [modalType, setModalType] = useState('all'); // 'all' | 'cifra' | 'partitura'
  const [modalOffset, setModalOffset] = useState(0);
  const [modalHasMore, setModalHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const debounceRef = useRef(null);

  const fetchSetlists = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('music_setlists')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSetlists(data || []);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar setlists.');
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    fetchSetlists();
  }, [fetchSetlists]);

  const fetchSetlistSongs = useCallback(async (setlistId) => {
    setSongsLoading(true);
    try {
      const { data, error } = await supabase
        .from('music_setlist_songs')
        .select(`
          setlist_id,
          song_id,
          order_index,
          music_songs (
            id,
            title,
            artist,
            type,
            content,
            storage_type,
            file_path,
            music_link,
            is_favorite
          )
        `)
        .eq('setlist_id', setlistId)
        .order('order_index', { ascending: true });

      if (error) throw error;
      setSetlistSongs(data || []);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar músicas do setlist.');
    } finally {
      setSongsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeSetlist) {
      fetchSetlistSongs(activeSetlist.id);
    }
  }, [activeSetlist, fetchSetlistSongs]);

  const handleSaveSetlist = async (e) => {
    e.preventDefault();
    if (!formName.trim()) {
      toast.error('Informe o nome do setlist.');
      return;
    }

    try {
      const payload = {
        user_id: user.id,
        name: formName.trim(),
        description: formDesc.trim()
      };

      if (editingId) {
        const { error } = await supabase
          .from('music_setlists')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;
        toast.success('Setlist atualizado!');
      } else {
        const { error } = await supabase
          .from('music_setlists')
          .insert(payload);
        if (error) throw error;
        toast.success('Setlist criado com sucesso!');
      }

      setFormName('');
      setFormDesc('');
      setEditingId(null);
      setIsFormOpen(false);
      fetchSetlists();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao salvar setlist.');
    }
  };

  const handleDeleteSetlist = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('Tem certeza que deseja excluir este setlist?')) return;
    try {
      const { error } = await supabase
        .from('music_setlists')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast.success('Setlist excluído!');
      if (activeSetlist?.id === id) {
        setActiveSetlist(null);
      }
      fetchSetlists();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao excluir setlist.');
    }
  };

  const handleRemoveSong = async (songId) => {
    if (!window.confirm('Remover esta música do setlist?')) return;
    try {
      const { error } = await supabase
        .from('music_setlist_songs')
        .delete()
        .eq('setlist_id', activeSetlist.id)
        .eq('song_id', songId);

      if (error) throw error;
      toast.success('Música removida do setlist.');
      fetchSetlistSongs(activeSetlist.id);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao remover música do setlist.');
    }
  };

  const handleMoveSong = async (index, direction) => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= setlistSongs.length) return;

    const itemA = setlistSongs[index];
    const itemB = setlistSongs[newIndex];

    try {
      // Swapping order indices
      const { error: errA } = await supabase
        .from('music_setlist_songs')
        .update({ order_index: itemB.order_index })
        .eq('setlist_id', activeSetlist.id)
        .eq('song_id', itemA.song_id);

      if (errA) throw errA;

      const { error: errB } = await supabase
        .from('music_setlist_songs')
        .update({ order_index: itemA.order_index })
        .eq('setlist_id', activeSetlist.id)
        .eq('song_id', itemB.song_id);

      if (errB) throw errB;

      // Update local state temporarily for smooth rendering or refetch
      fetchSetlistSongs(activeSetlist.id);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao reordenar músicas.');
    }
  };

  // Busca server-side no modal com filtros e paginacao load-more
  const fetchModalSongs = useCallback(async ({ search, type, offset, append = false }) => {
    if (append) setLoadingMore(true);
    else setModalLoading(true);

    try {
      const existingIds = new Set(setlistSongs.map(s => s.song_id));

      let query = supabase
        .from('music_songs')
        .select('id, title, artist, type', { count: 'exact' })
        .eq('user_id', user.id)
        .order('title', { ascending: true })
        .range(offset, offset + MODAL_PAGE_SIZE - 1);

      if (search.trim()) {
        query = query.or(`title.ilike.%${search.trim()}%,artist.ilike.%${search.trim()}%`);
      }
      if (type !== 'all') {
        query = query.eq('type', type);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      const filtered = (data || []).filter(s => !existingIds.has(s.id));
      setModalSongs(prev => append ? [...prev, ...filtered] : filtered);
      setModalHasMore((offset + MODAL_PAGE_SIZE) < (count || 0));
      setModalOffset(offset + MODAL_PAGE_SIZE);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar repertório.');
    } finally {
      setModalLoading(false);
      setLoadingMore(false);
    }
  }, [user.id, setlistSongs]);

  const openAddSongsModal = () => {
    setModalSearch('');
    setModalType('all');
    setModalOffset(0);
    setModalSongs([]);
    setIsAddSongsOpen(true);
    fetchModalSongs({ search: '', type: 'all', offset: 0 });
  };

  const handleModalSearchChange = (value) => {
    setModalSearch(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setModalOffset(0);
      fetchModalSongs({ search: value, type: modalType, offset: 0 });
    }, 300);
  };

  const handleModalTypeChange = (value) => {
    setModalType(value);
    setModalOffset(0);
    fetchModalSongs({ search: modalSearch, type: value, offset: 0 });
  };

  const handleLoadMore = () => {
    fetchModalSongs({ search: modalSearch, type: modalType, offset: modalOffset, append: true });
  };

  const handleAddSongToSetlist = async (song) => {
    try {
      const maxOrderIndex = setlistSongs.reduce((max, s) => Math.max(max, s.order_index ?? 0), 0);
      const { error } = await supabase
        .from('music_setlist_songs')
        .insert({
          setlist_id: activeSetlist.id,
          song_id: song.id,
          order_index: maxOrderIndex + 1
        });

      if (error) throw error;
      toast.success(`${song.title} adicionada!`);
      // Remove imediatamente da lista do modal
      setModalSongs(prev => prev.filter(s => s.id !== song.id));
      fetchSetlistSongs(activeSetlist.id);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao adicionar música.');
    }
  };

  // Detail View of a Setlist
  if (activeSetlist) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
        {/* Back and title bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="icon-btn" onClick={() => setActiveSetlist(null)} style={{ padding: '8px' }}>
              <ChevronLeft size={18} />
            </button>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 900, margin: 0, color: 'var(--text-main)' }}>
                {activeSetlist.name}
              </h3>
              {activeSetlist.description && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
                  {activeSetlist.description}
                </p>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              className="btn-primary"
              onClick={openAddSongsModal}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1.25rem', fontSize: '0.8rem' }}
            >
              <Plus size={14} />
              <span>Adicionar Música</span>
            </button>
          </div>
        </div>

        {/* Songs List */}
        {songsLoading ? (
          <div style={{ textAlign: 'center', padding: '4rem' }}>
            <Loader2 className="animate-spin" style={{ margin: '0 auto 1rem', color: 'var(--primary)' }} />
            <span>Carregando músicas do setlist...</span>
          </div>
        ) : setlistSongs.length === 0 ? (
          <div className="glass-card" style={{ padding: '4rem', textAlign: 'center', border: '1px dashed var(--glass-border)' }}>
            <ListPlus size={36} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem' }} />
            <h4>Este setlist está vazio</h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.25rem 0 1.25rem 0' }}>
              Adicione músicas do seu repertório a este setlist para começar.
            </p>
            <button className="btn-primary" onClick={openAddSongsModal} style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}>
              Adicionar Música
            </button>
          </div>
        ) : (
          <div className="glass-card" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.01)' }}>
                    <th style={{ padding: '1rem', width: '60px' }}>Ordem</th>
                    <th style={{ padding: '1rem' }}>Música</th>
                    <th style={{ padding: '1rem' }}>Artista / Banda</th>
                    <th style={{ padding: '1rem', width: '100px' }}>Tipo</th>
                    <th style={{ padding: '1rem', width: '180px', textAlign: 'center' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {setlistSongs.map((item, idx) => {
                    const song = item.music_songs;
                    if (!song) return null;
                    return (
                      <tr
                        key={song.id}
                        style={{
                          borderBottom: '1px solid var(--glass-border)',
                          cursor: 'pointer',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        onClick={() => {
                          onSelectSong(song);
                        }}
                      >
                        <td style={{ padding: '1rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                          {idx + 1}
                        </td>
                        <td style={{ padding: '1rem', fontWeight: 600, color: 'var(--text-main)' }}>
                          {song.title}
                        </td>
                        <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>
                          {song.artist || '--'}
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <span style={{
                            fontSize: '0.65rem',
                            fontWeight: 800,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            textTransform: 'uppercase',
                            background: song.type === 'partitura' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                            color: song.type === 'partitura' ? '#34d399' : '#818cf8'
                          }}>
                            {song.type}
                          </span>
                        </td>
                        <td style={{ padding: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
                          <button
                            className="icon-btn"
                            disabled={idx === 0}
                            onClick={() => handleMoveSong(idx, 'up')}
                            style={{ padding: '6px' }}
                            title="Mover para cima"
                          >
                            <ChevronUp size={14} />
                          </button>
                          <button
                            className="icon-btn"
                            disabled={idx === setlistSongs.length - 1}
                            onClick={() => handleMoveSong(idx, 'down')}
                            style={{ padding: '6px' }}
                            title="Mover para baixo"
                          >
                            <ChevronDown size={14} />
                          </button>
                          <button
                            className="icon-btn"
                            onClick={() => {
                              onSelectSong(song);
                            }}
                            style={{ padding: '6px', color: 'var(--primary)' }}
                            title="Executar / Visualizar"
                          >
                            <Play size={14} />
                          </button>
                          <button
                            className="icon-btn"
                            onClick={() => handleRemoveSong(song.id)}
                            style={{ padding: '6px', color: 'var(--danger)' }}
                            title="Remover do Setlist"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal: Add Songs com filtros */}
        {isAddSongsOpen && (
          <div className="modal-overlay">
            <div className="modal-content glass-card" style={{ maxWidth: '620px', maxHeight: '82vh', display: 'flex', flexDirection: 'column' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 900, margin: 0 }}>Vincular Músicas</h3>
                <button className="icon-btn" onClick={() => setIsAddSongsOpen(false)} style={{ padding: '6px' }}><X size={18} /></button>
              </div>

              {/* Filtros */}
              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    placeholder="Buscar título ou artista..."
                    value={modalSearch}
                    onChange={e => handleModalSearchChange(e.target.value)}
                    style={{
                      width: '100%',
                      paddingLeft: '34px',
                      background: 'var(--input-bg)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: '8px',
                      padding: '8px 12px 8px 34px',
                      color: 'var(--text-main)',
                      outline: 'none',
                      fontSize: '0.875rem'
                    }}
                  />
                </div>
                <select
                  className="select-filter"
                  value={modalType}
                  onChange={e => handleModalTypeChange(e.target.value)}
                  style={{ minWidth: '130px', fontSize: '0.875rem' }}
                >
                  <option value="all">Todos os tipos</option>
                  <option value="cifra">Cifra</option>
                  <option value="partitura">Partitura</option>
                </select>
              </div>

              {/* Lista */}
              <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {modalLoading ? (
                  <div style={{ textAlign: 'center', padding: '3rem' }}>
                    <Loader2 className="animate-spin" style={{ margin: '0 auto 0.75rem', color: 'var(--primary)' }} />
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Carregando repertório...</span>
                  </div>
                ) : modalSongs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    {modalSearch || modalType !== 'all'
                      ? 'Nenhuma música encontrada para os filtros aplicados.'
                      : 'Todas as músicas já estão neste setlist ou não há músicas cadastradas.'}
                  </div>
                ) : (
                  <>
                    {modalSongs.map(song => (
                      <div
                        key={song.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.65rem 1rem',
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid var(--glass-border)',
                          borderRadius: '8px',
                          gap: '0.75rem'
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</h4>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{song.artist || 'Artista desconhecido'}</span>
                        </div>
                        <span style={{
                          fontSize: '0.65rem',
                          fontWeight: 800,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          textTransform: 'uppercase',
                          flexShrink: 0,
                          background: song.type === 'partitura' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                          color: song.type === 'partitura' ? '#34d399' : '#818cf8'
                        }}>
                          {song.type}
                        </span>
                        <button
                          className="btn-primary"
                          onClick={() => handleAddSongToSetlist(song)}
                          style={{ padding: '0.35rem 0.85rem', fontSize: '0.75rem', flexShrink: 0 }}
                        >
                          Vincular
                        </button>
                      </div>
                    ))}

                    {/* Load more */}
                    {modalHasMore && (
                      <button
                        onClick={handleLoadMore}
                        disabled={loadingMore}
                        style={{
                          width: '100%',
                          padding: '0.6rem',
                          background: 'transparent',
                          border: '1px dashed var(--glass-border)',
                          borderRadius: '8px',
                          color: 'var(--primary)',
                          fontWeight: 700,
                          fontSize: '0.8rem',
                          cursor: loadingMore ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.5rem'
                        }}
                      >
                        {loadingMore ? <><Loader2 size={14} className="animate-spin" /> Carregando...</> : 'Carregar mais'}
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* Footer */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1rem' }}>
                <button className="btn-secondary" onClick={() => setIsAddSongsOpen(false)} style={{ padding: '0.5rem 1rem' }}>
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    );
  }

  // List View of Setlists
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', width: '100%' }}>
      {/* List Toolbar */}
      <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 900, margin: 0, color: 'var(--text-main)' }}>Seus Setlists</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>Crie e ordene listas de músicas para shows ou ensaios.</p>
        </div>

        <button
          className="btn-primary"
          onClick={() => {
            setEditingId(null);
            setFormName('');
            setFormDesc('');
            setIsFormOpen(true);
          }}
          style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <Plus size={14} />
          <span>Novo Setlist</span>
        </button>
      </div>

      {/* Grid of Setlists */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          <Loader2 className="animate-spin" style={{ margin: '0 auto 1rem', color: 'var(--primary)' }} />
          <span>Carregando setlists...</span>
        </div>
      ) : setlists.length === 0 ? (
        <div className="glass-card" style={{ padding: '5rem 2rem', textAlign: 'center', border: '1px dashed var(--glass-border)' }}>
          <ListPlus size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 1.5rem' }} />
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Nenhum setlist criado</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '400px', margin: '0.5rem auto 1.5rem', lineHeight: 1.5 }}>
            Organize suas cifras e partituras em sequências de execução rápidas.
          </p>
          <button className="btn-primary" onClick={() => setIsFormOpen(true)} style={{ padding: '0.6rem 1.5rem' }}>
            Criar Primeiro Setlist
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
          {setlists.map(setlist => (
            <div
              key={setlist.id}
              onClick={() => setActiveSetlist(setlist)}
              className="glass-card"
              style={{
                padding: '1.5rem',
                minHeight: '140px',
                cursor: 'pointer',
                border: '1px solid var(--glass-border)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.2s'
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
              <div>
                <h4 style={{ fontSize: '1.1rem', fontWeight: 800, margin: '0 0 0.25rem 0', color: 'var(--text-main)' }}>
                  {setlist.name}
                </h4>
                {setlist.description && (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {setlist.description}
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 'bold' }}>
                  Ver Setlist →
                </span>
                <button
                  className="icon-btn"
                  onClick={(e) => handleDeleteSetlist(e, setlist.id)}
                  style={{ padding: '6px', color: 'var(--danger)' }}
                  title="Excluir Setlist"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Form: Create / Edit Setlist */}
      {isFormOpen && (
        <div className="modal-overlay">
          <div className="modal-content glass-card" style={{ maxWidth: '450px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 900, margin: 0 }}>
                {editingId ? 'Editar Setlist' : 'Novo Setlist'}
              </h3>
              <button className="icon-btn" onClick={() => setIsFormOpen(false)} style={{ padding: '6px' }}><X size={18} /></button>
            </div>

            <form onSubmit={handleSaveSetlist} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="input-group">
                <label>Nome do Setlist *</label>
                <input
                  type="text"
                  placeholder="Ex: Show Acústico 2026"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  required
                />
              </div>

              <div className="input-group">
                <label>Descrição (Opcional)</label>
                <textarea
                  rows="3"
                  placeholder="Ex: Repertório para o show de sexta no pub."
                  value={formDesc}
                  onChange={e => setFormDesc(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    color: 'var(--text-main)',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1.25rem' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsFormOpen(false)} style={{ padding: '0.5rem 1rem' }}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" style={{ padding: '0.5rem 1rem' }}>
                  Salvar Setlist
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
