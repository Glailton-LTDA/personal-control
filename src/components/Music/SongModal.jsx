import React, { useState, useEffect } from 'react';
import { X, Save, FileText, Upload, Link, ExternalLink, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

export default function SongModal({ isOpen, onClose, onRefresh, user, initialData = null, onSaved = null }) {
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

  // Gêneros
  const [genres, setGenres] = useState([]);
  const [genreId, setGenreId] = useState('');

  // Carrega gêneros pré-definidos
  const fetchGenres = async () => {
    try {
      const { data, error } = await supabase
        .from('music_genres')
        .select('*')
        .order('name', { ascending: true });
      if (!error && data) {
        setGenres(data);
      }
    } catch (err) {
      console.error('Erro ao buscar gêneros:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchGenres();
    }
  }, [isOpen]);

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
      toast.error('O título da música é obrigatório.');
      return;
    }

    setSaving(true);
    let filePath = initialData?.file_path || '';

    try {
      // Se for partitura em nuvem e tiver arquivo novo para subir
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
          toast.error('Informe o nome do arquivo PDF local de referência.');
          setSaving(false);
          return;
        }
      }

      const songPayload = {
        user_id: user.id,
        title: title.trim(),
        artist: artist.trim(),
        type,
        genre_id: genreId || null,
        music_link: musicLink.trim() || null,
        content: type === 'cifra' ? content : null,
        storage_type: type === 'partitura' ? storageType : 'local',
        file_path: type === 'partitura' ? filePath : null
      };

      if (initialData?.id) {
        // Modo Edição
        const { data: updatedRows, error } = await supabase
          .from('music_songs')
          .update(songPayload)
          .eq('id', initialData.id)
          .select(`*, music_genres(id, name)`);

        if (error) throw error;
        toast.success('Música atualizada com sucesso!');
        if (onSaved && updatedRows?.[0]) onSaved(updatedRows[0]);
      } else {
        // Modo Criação
        const { error } = await supabase
          .from('music_songs')
          .insert(songPayload);

        if (error) throw error;
        toast.success('Música cadastrada com sucesso!');
      }

      onRefresh();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao salvar música: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content glass-card" style={{ maxWidth: '650px' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 900, margin: 0, color: 'var(--text-main)' }}>
            {initialData ? 'Editar Música' : 'Nova Música'}
          </h3>
          <button className="icon-btn" onClick={onClose} style={{ padding: '6px' }}><X size={18} /></button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          <div className="form-grid">
            <div className="input-group">
              <label>Título da Música *</label>
              <input
                type="text"
                placeholder="Ex: Love of My Life"
                value={title}
                onChange={e => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="input-group">
              <label>Artista / Banda</label>
              <input
                type="text"
                placeholder="Ex: Queen"
                value={artist}
                onChange={e => setArtist(e.target.value)}
              />
            </div>
          </div>

          {/* Campo Link da Música */}
          <div className="input-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <ExternalLink size={13} />
              Link de Referência
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>(YouTube, Spotify, tutorial...)</span>
            </label>
            <input
              type="url"
              placeholder="https://youtube.com/watch?v=..."
              value={musicLink}
              onChange={e => setMusicLink(e.target.value)}
            />
          </div>

          <div className="input-group">
            <label>Gênero / Estilo Musical <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>(Gerencie em Ajustes &gt; Gêneros)</span></label>
            <select
              className="select-filter"
              value={genreId}
              onChange={e => setGenreId(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="">-- Sem Gênero --</option>
              {genres.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          <div className="input-group">
            <label>Tipo de Documento</label>
            <select className="select-filter" value={type} onChange={e => setType(e.target.value)} style={{ width: '100%' }}>
              <option value="cifra">Cifra & Tablatura (Texto)</option>
              <option value="partitura">Partitura (PDF)</option>
            </select>
          </div>

          {/* Seção de Cifra */}
          {type === 'cifra' && (
            <div className="input-group">
              <label>Conteúdo da Cifra / Tablatura</label>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '-0.25rem 0 0.5rem 0' }}>
                Dica: Cole as cifras com os acordes alinhados por cima da letra. Use linhas como `|---` para tablaturas.
              </p>
              <textarea
                rows="12"
                placeholder="Cole sua cifra aqui..."
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
                <label>Hospedagem do PDF</label>
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
                    Link Local (IndexedDB)
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
                    Sincronizar Nuvem
                  </button>
                </div>
              </div>

              {storageType === 'local' ? (
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label>Nome de Referência do Arquivo Local</label>
                  <input
                    type="text"
                    placeholder="Ex: Queen - Love of My Life.pdf"
                    value={localFilename}
                    onChange={e => setLocalFilename(e.target.value)}
                    required
                  />
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                    Indique o nome exato do arquivo. Ao abrir a música, o sistema solicitará o arquivo local uma única vez para salvar no cache.
                  </span>
                </div>
              ) : (
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label>Arquivo PDF (Upload Cloud)</label>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={e => setUploadFile(e.target.files[0])}
                    style={{ padding: '8px 12px' }}
                  />
                  {initialData?.storage_type === 'cloud' && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                      Arquivo atual cadastrado: <b>{initialData.file_path.split('/').pop()}</b>. Selecione outro somente se desejar alterar.
                    </span>
                  )}
                </div>
              )}

            </div>
          )}

          {/* Footer Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1.25rem' }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving} style={{ padding: '0.6rem 1.5rem', borderRadius: '8px', fontSize: '0.85rem' }}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={saving} style={{ padding: '0.6rem 1.5rem', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              <span>Salvar Música</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
