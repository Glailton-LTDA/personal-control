import React, { useState, useEffect } from 'react';
import { X, Save, FileText, Upload, Link, ExternalLink, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useOfflineGenres, useOfflineSetlists } from '../../hooks/useOfflineMusic';
import toast from 'react-hot-toast';
import MultiSelect from '../ui/MultiSelect';

export default function SongModal({ isOpen, onClose, onRefresh, user, initialData = null, onSaved = null }) {
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

  // Setlists — só no modo edição (initialData existente)
  const [selectedSetlistIds, setSelectedSetlistIds] = useState(new Set());
  const [originalSetlistIds, setOriginalSetlistIds] = useState(new Set());

  const { data: genres = [] } = useOfflineGenres();
  const { data: availableSetlists = [] } = useOfflineSetlists(user?.id);

  useEffect(() => {
    if (!isOpen) return;
    // Setlists só no modo edição
    if (!initialData?.id || !user?.id) return;
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
  }, [isOpen, initialData?.id, user?.id]);

  // Preenche dados ao editar
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
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

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

      if (initialData?.id) {
        const existing = await getMusicSong(initialData.id);
        const updated = { ...existing, ...songPayload, updated_at: new Date().toISOString() };
        await putMusicSong(updated);

        const engine = new SyncEngine(user.id);
        if (engine.isOnline) {
          const { data, error } = await supabase
            .from('music_songs')
            .update(songPayload)
            .eq('id', initialData.id)
            .select()
            .single();
          if (!error && data) {
            await putMusicSong({ ...data, updated_at: new Date().toISOString() });
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
        if (onSaved) onSaved(updated);
      } else {
        const tempId = 'local_' + Date.now();
        const newSong = {
          id: tempId,
          user_id: user.id,
          ...songPayload,
          is_favorite: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        await putMusicSong(newSong);

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
            await putMusicSong({ ...data, updated_at: new Date().toISOString() });
          }
        } else {
          await engine.enqueue('music_songs', tempId, 'insert', { user_id: user.id, ...songPayload });
        }
        engine.destroy();

        toast.success(t('music.song_created'));
      }

      queryClient.invalidateQueries({ queryKey: ['offline_songs', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['offline_setlists', user?.id] });
      onRefresh();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(t('music.error_save_song', { error: err.message }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content glass-card" style={{ maxWidth: '650px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        
        {/* Header — fixed */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexShrink: 0 }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 900, margin: 0, color: 'var(--text-main)' }}>
            {initialData ? t('music.edit_music_title') : t('music.new_music_title')}
          </h3>
          <button className="icon-btn" onClick={onClose} style={{ padding: '6px' }}><X size={18} /></button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 0, flex: 1, minHeight: 0 }}>
          
          {/* Scrollable body */}
          <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', paddingRight: '0.25rem' }}>
            <div className="form-grid">
              <div className="input-group">
                <label>{t('music.title_label')}</label>
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
            </div>

            {/* Campo Link da Música */}
            <div className="input-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <ExternalLink size={13} />
                {t('music.link_label')}
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>{t('music.link_hint')}</span>
              </label>
              <input
                type="url"
                placeholder={t('music.link_placeholder')}
                value={musicLink}
                onChange={e => setMusicLink(e.target.value)}
              />
            </div>

            <div className="input-group">
              <label>{t('music.genre_label')} <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>{t('music.genre_hint')}</span></label>
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

            {/* Setlists — visível apenas no modo edição */}
            {initialData?.id && (
              <div className="input-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                  {t('music.add_to_setlists')}
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>{t('music.optional')}</span>
                </label>
                <MultiSelect
                  options={availableSetlists.map(sl => ({ value: sl.id, label: sl.name }))}
                  selected={[...selectedSetlistIds]}
                  onChange={(ids) => setSelectedSetlistIds(new Set(ids))}
                  placeholder={t('music.select_setlists')}
                  searchPlaceholder={t('music.search_setlist')}
                />
              </div>
            )}

            <div className="input-group">
              <label>{t('music.doc_type')}</label>
              <select className="select-filter" value={type} onChange={e => setType(e.target.value)} style={{ width: '100%' }}>
                <option value="cifra">{t('music.chords_text')}</option>
                <option value="partitura">{t('music.sheet_pdf')}</option>
              </select>
            </div>

            {/* Seção de Cifra */}
            {type === 'cifra' && (
              <div className="input-group">
                <label>{t('music.content_label')}</label>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '-0.25rem 0 0.5rem 0' }}>
                  {t('music.content_hint')}
                </p>
                <textarea
                  rows="12"
                  placeholder={t('music.content_placeholder')}
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    color: 'var(--text-main)',
                    outline: 'none',
                    fontFamily: 'monospace',
                    fontSize: '12px'
                  }}
                />
              </div>
            )}

            {/* Seção de Partitura */}
            {type === 'partitura' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: 'rgba(255,255,255,0.01)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label>{t('music.pdf_hosting')}</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <button
                      type="button"
                      onClick={() => setStorageType('local')}
                      style={{
                        padding: '0.75rem',
                        borderRadius: '8px',
                        border: '1px solid',
                        borderColor: storageType === 'local' ? 'var(--primary)' : 'var(--glass-border)',
                        background: storageType === 'local' ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                        color: storageType === 'local' ? 'var(--primary)' : 'var(--text-muted)',
                        fontWeight: 'bold',
                        fontSize: '0.8rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        cursor: 'pointer'
                      }}
                    >
                      <Link size={14} />
                      {t('music.local_link')}
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => setStorageType('cloud')}
                      style={{
                        padding: '0.75rem',
                        borderRadius: '8px',
                        border: '1px solid',
                        borderColor: storageType === 'cloud' ? 'var(--primary)' : 'var(--glass-border)',
                        background: storageType === 'cloud' ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                        color: storageType === 'cloud' ? 'var(--primary)' : 'var(--text-muted)',
                        fontWeight: 'bold',
                        fontSize: '0.8rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        cursor: 'pointer'
                      }}
                    >
                      <Upload size={14} />
                      {t('music.cloud_sync')}
                    </button>
                  </div>
                </div>

                {storageType === 'local' ? (
                  <div className="input-group" style={{ marginBottom: 0 }}>
                    <label>{t('music.local_filename_label')}</label>
                    <input
                      type="text"
                      placeholder={t('music.local_filename_placeholder')}
                      value={localFilename}
                      onChange={e => setLocalFilename(e.target.value)}
                      required
                    />
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                      {t('music.local_filename_hint')}
                    </span>
                  </div>
                ) : (
                  <div className="input-group" style={{ marginBottom: 0 }}>
                    <label>{t('music.cloud_file_label')}</label>
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={e => setUploadFile(e.target.files[0])}
                      style={{ padding: '8px 12px' }}
                    />
                    {initialData?.storage_type === 'cloud' && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                        {t('music.cloud_file_hint', { filename: initialData.file_path.split('/').pop() })}
                      </span>
                    )}
                  </div>
                )}

              </div>
            )}
          </div>

          {/* Footer Actions — always visible */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1rem', flexShrink: 0 }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving} style={{ padding: '0.6rem 1.5rem', borderRadius: '8px', fontSize: '0.85rem' }}>
              {t('music.cancel')}
            </button>
            <button type="submit" className="btn-primary" disabled={saving} style={{ padding: '0.6rem 1.5rem', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              <span>{t('music.save_song')}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
