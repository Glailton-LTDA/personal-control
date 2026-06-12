import React, { useState, useEffect } from 'react';
import { ChevronLeft, Save, FileText, Upload, Link, ExternalLink, Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useOfflineGenres, useOfflineSetlists } from '../../hooks/useOfflineMusic';
import toast from 'react-hot-toast';
import MultiSelect from '../ui/MultiSelect';

export default function SongEditor({ user, initialData = null, onClose, onSaved }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [type, setType] = useState('cifra'); // 'cifra' | 'partitura'
  const [content, setContent] = useState('');
  const [musicLink, setMusicLink] = useState('');

  // Storage para PDFs
  const [storageType, setStorageType] = useState('local'); // 'local' | 'cloud'
  const [localFilename, setLocalFilename] = useState('');
  const [uploadFile, setUploadFile] = useState(null);

  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  // Gêneros
  const [genreId, setGenreId] = useState('');

  // Setlists — só no modo edição
  const [selectedSetlistIds, setSelectedSetlistIds] = useState(new Set());
  const [originalSetlistIds, setOriginalSetlistIds] = useState(new Set());

  const { data: genres = [] } = useOfflineGenres();
  const { data: availableSetlists = [] } = useOfflineSetlists(user?.id);

  // Preenche dados ao carregar ou editar
  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title || '');
      setArtist(initialData.artist || '');
      setType(initialData.type || 'cifra');
      setContent(initialData.content || '');
      setMusicLink(initialData.music_link || '');
      setStorageType(initialData.storage_type || 'local');
      setGenreId(initialData.genre_id || '');
      if (initialData.storage_type === 'local') {
        setLocalFilename(initialData.file_path || '');
      } else {
        setLocalFilename('');
      }
      setUploadFile(null);

      // Busca setlists vinculadas
      if (initialData.id && user?.id) {
        const fetchLinkedSetlists = async () => {
          try {
            const { db } = await import('../../lib/offline/db');
            const linkedData = await db.music_setlist_songs.where('song_id').equals(initialData.id).toArray();
            const linked = new Set((linkedData || []).map(r => r.setlist_id));
            setSelectedSetlistIds(new Set(linked));
            setOriginalSetlistIds(new Set(linked));
          } catch (err) {
            console.error('Erro ao buscar setlists vinculadas:', err);
          }
        };
        fetchLinkedSetlists();
      }
    } else {
      setTitle('');
      setArtist('');
      setType('cifra');
      setContent('');
      setMusicLink('');
      setStorageType('local');
      setGenreId('');
      setLocalFilename('');
      setUploadFile(null);
      setSelectedSetlistIds(new Set());
      setOriginalSetlistIds(new Set());
    }
  }, [initialData, user?.id]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error(t('music.title_required'));
      return;
    }

    setSaving(true);
    let filePath = initialData?.file_path || '';

    try {
      if (type === 'partitura' && storageType === 'cloud' && uploadFile) {
        const fileExt = uploadFile.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}_sheet.${fileExt}`;

        const { error: uploadErr } = await supabase.storage
          .from('music_sheets')
          .upload(fileName, uploadFile);

        if (uploadErr) throw uploadErr;
        filePath = fileName;
      } else if (type === 'partitura' && storageType === 'local') {
        filePath = localFilename.trim();
        if (!filePath) {
          toast.error(t('music.filename_required'));
          setSaving(false);
          return;
        }
      }

      const songPayload = {
        title: title.trim(),
        artist: artist.trim(),
        type,
        genre_id: genreId || null,
        music_link: musicLink.trim() || null,
        content: type === 'cifra' ? content : null,
        storage_type: type === 'partitura' ? storageType : 'local',
        file_path: type === 'partitura' ? filePath : null
      };

      const { getMusicSong, putMusicSong } = await import('../../lib/offline/db');
      const { SyncEngine } = await import('../../lib/offline/SyncEngine');

      let savedSong = null;

      if (initialData?.id) {
        const existing = await getMusicSong(initialData.id);
        savedSong = { ...existing, ...songPayload, updated_at: new Date().toISOString() };
        await putMusicSong(savedSong);

        const engine = new SyncEngine(user.id);
        if (engine.isOnline) {
          const { data, error } = await supabase
            .from('music_songs')
            .update(songPayload)
            .eq('id', initialData.id)
            .select()
            .single();
          if (!error && data) {
            savedSong = { ...data, updated_at: new Date().toISOString() };
            await putMusicSong(savedSong);
          }
        } else {
          await engine.enqueue('music_songs', initialData.id, 'update', songPayload);
        }
        engine.destroy();

        const toAdd = [...selectedSetlistIds].filter(id => !originalSetlistIds.has(id));
        const toRemove = [...originalSetlistIds].filter(id => !selectedSetlistIds.has(id));

        const { putMusicSetlistSong, removeMusicSetlistSong } = await import('../../lib/offline/db');
        for (let i = 0; i < toAdd.length; i++) {
          await putMusicSetlistSong({ setlist_id: toAdd[i], song_id: initialData.id, order_index: i + 1 });
        }
        for (const slId of toRemove) {
          await removeMusicSetlistSong(slId, initialData.id);
        }

        toast.success(t('music.song_updated'));
      } else {
        const tempId = 'local_' + Date.now();
        savedSong = {
          id: tempId,
          user_id: user.id,
          ...songPayload,
          is_favorite: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        await putMusicSong(savedSong);

        const engine = new SyncEngine(user.id);
        if (engine.isOnline) {
          const { data, error } = await supabase
            .from('music_songs')
            .insert({
              user_id: user.id,
              ...songPayload,
              content: songPayload.content || null,
              music_link: songPayload.music_link || null,
              storage_type: songPayload.storage_type || 'local',
              file_path: songPayload.file_path || null,
            })
            .select()
            .single();
          if (!error && data) {
            const { removeMusicSong } = await import('../../lib/offline/db');
            await removeMusicSong(tempId);
            savedSong = { ...data, updated_at: new Date().toISOString() };
            await putMusicSong(savedSong);
          }
        } else {
          await engine.enqueue('music_songs', tempId, 'insert', { user_id: user.id, ...songPayload });
        }
        engine.destroy();

        toast.success(t('music.song_created'));
      }

      queryClient.invalidateQueries({ queryKey: ['offline_songs', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['offline_setlists', user?.id] });
      
      if (onSaved) {
        onSaved(savedSong);
      } else {
        onClose();
      }
    } catch (err) {
      console.error(err);
      toast.error(t('music.error_save_song', { error: err.message }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', minHeight: '80vh' }}>
      
      {/* Cabeçalho superior */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button className="icon-btn" onClick={onClose} style={{ padding: '8px' }} title={t('music.cancel')}>
            <ChevronLeft size={20} />
          </button>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 900, margin: 0, color: 'var(--text-main)' }}>
              {initialData ? t('music.edit_music_title') : t('music.new_music_title')}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>
              {initialData ? `Editando: ${initialData.title}` : 'Preencha os metadados e digite a cifra da sua música.'}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving} style={{ padding: '0.6rem 1.5rem', borderRadius: '8px', fontSize: '0.85rem' }}>
            {t('music.cancel')}
          </button>
          <button type="button" className="btn-primary" onClick={handleSave} disabled={saving} style={{ padding: '0.6rem 1.5rem', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            <span>{t('music.save_song')}</span>
          </button>
        </div>
      </div>

      {/* Grid Principal de Edição */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.5rem', alignItems: 'start' }}>
        
        {/* Coluna Esquerda: Metadados */}
        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, color: 'var(--text-main)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
            Informações
          </h3>

          <div className="input-group">
            <label>{t('music.title_label')} *</label>
            <input
              type="text"
              placeholder={t('music.title_placeholder')}
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="input-group">
            <label>{t('music.artist_label')}</label>
            <input
              type="text"
              placeholder={t('music.artist_placeholder')}
              value={artist}
              onChange={e => setArtist(e.target.value)}
            />
          </div>

          <div className="input-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <ExternalLink size={13} />
              {t('music.link_label')}
            </label>
            <input
              type="url"
              placeholder={t('music.link_placeholder')}
              value={musicLink}
              onChange={e => setMusicLink(e.target.value)}
            />
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('music.link_hint')}</span>
          </div>

          <div className="input-group">
            <label>{t('music.genre_label')}</label>
            <select
              className="select-filter"
              value={genreId}
              onChange={e => setGenreId(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="">{t('music.no_genre')}</option>
              {genres.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          {/* Setlists */}
          <div className="input-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
              {t('music.add_to_setlists')}
            </label>
            <MultiSelect
              options={availableSetlists.map(sl => ({ value: sl.id, label: sl.name }))}
              selected={[...selectedSetlistIds]}
              onChange={(ids) => setSelectedSetlistIds(new Set(ids))}
              placeholder={t('music.select_setlists')}
              searchPlaceholder={t('music.search_setlist')}
            />
          </div>

          <div className="input-group">
            <label>{t('music.doc_type')}</label>
            <select className="select-filter" value={type} onChange={e => setType(e.target.value)} style={{ width: '100%' }}>
              <option value="cifra">{t('music.chords_text')}</option>
              <option value="partitura">{t('music.sheet_pdf')}</option>
            </select>
          </div>
        </div>

        {/* Coluna Direita: Editor de Cifra / Configuração de Partitura */}
        <div style={{ width: '100%' }}>
          
          {/* Seção Cifra */}
          {type === 'cifra' && (
            <div className="glass-card animate-fadeIn" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>
                  {t('music.content_label')}
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Fonte Monoespaçada
                </span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                {t('music.content_hint')}
              </p>
              
              <textarea
                placeholder={t('music.content_placeholder')}
                value={content}
                onChange={e => setContent(e.target.value)}
                style={{
                  width: '100%',
                  height: 'calc(100vh - 280px)',
                  minHeight: '450px',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '12px',
                  padding: '1.25rem',
                  color: 'var(--text-main)',
                  outline: 'none',
                  fontFamily: 'monospace',
                  fontSize: '14px',
                  lineHeight: '1.6',
                  resize: 'vertical',
                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
                }}
              />
            </div>
          )}

          {/* Seção Partitura */}
          {type === 'partitura' && (
            <div className="glass-card animate-fadeIn" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>
                Hospedagem da Partitura (PDF)
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setStorageType('local')}
                  style={{
                    padding: '1rem',
                    borderRadius: '10px',
                    border: '1px solid',
                    borderColor: storageType === 'local' ? 'var(--primary)' : 'var(--glass-border)',
                    background: storageType === 'local' ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                    color: storageType === 'local' ? 'var(--primary)' : 'var(--text-muted)',
                    fontWeight: 'bold',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <Link size={16} />
                  {t('music.local_link')}
                </button>

                <button
                  type="button"
                  onClick={() => setStorageType('cloud')}
                  style={{
                    padding: '1rem',
                    borderRadius: '10px',
                    border: '1px solid',
                    borderColor: storageType === 'cloud' ? 'var(--primary)' : 'var(--glass-border)',
                    background: storageType === 'cloud' ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                    color: storageType === 'cloud' ? 'var(--primary)' : 'var(--text-muted)',
                    fontWeight: 'bold',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <Upload size={16} />
                  {t('music.cloud_sync')}
                </button>
              </div>

              {storageType === 'local' ? (
                <div className="input-group">
                  <label>{t('music.local_filename_label')} *</label>
                  <input
                    type="text"
                    placeholder={t('music.local_filename_placeholder')}
                    value={localFilename}
                    onChange={e => setLocalFilename(e.target.value)}
                    required
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                    {t('music.local_filename_hint')}
                  </span>
                </div>
              ) : (
                <div className="input-group">
                  <label>{t('music.cloud_file_label')} *</label>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={e => setUploadFile(e.target.files[0])}
                    style={{
                      padding: '10px 14px',
                      background: 'var(--input-bg)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: '8px'
                    }}
                  />
                  {initialData?.storage_type === 'cloud' && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                      {t('music.cloud_file_hint', { filename: initialData.file_path.split('/').pop() })}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
