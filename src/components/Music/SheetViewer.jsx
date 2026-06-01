import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Download, Upload, AlertCircle, Bookmark, Highlighter, Type, Save, Trash2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Edit, ExternalLink } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

// Nome da base de dados IndexedDB
const DB_NAME = 'PersonalControlMusic';
const STORE_NAME = 'local_sheets';

// Inicializa o banco de dados IndexedDB de forma assíncrona
function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'song_id' });
      }
    };
    
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

// Salva arquivo no cache do IndexedDB
async function saveToCache(songId, blob, filename) {
  const db = await openIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put({ song_id: songId, blob, filename, updated_at: new Date().toISOString() });
    
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}

// Recupera arquivo do cache
async function getFromCache(songId) {
  const db = await openIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(songId);
    
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

// Remove arquivo do cache
async function removeFromCache(songId) {
  const db = await openIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(songId);
    
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}

export default function SheetViewer({ song, user, onEdit = null }) {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [zoom, setZoom] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  
  const pdfBlobUrlRef = useRef(null);
  
  // Modos de anotações
  const [activeTool, setActiveTool] = useState('none'); // 'none' | 'highlight' | 'text'
  const [annotations, setAnnotations] = useState([]); // [{ id, page, type, x, y, w, h, text, color }]
  const [highlightColor, setHighlightColor] = useState('rgba(250, 204, 21, 0.4)'); // Amarelo semitransparente

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const renderTaskRef = useRef(null);

  const loadPDFFromUrl = useCallback((url) => {
    const loadingTask = window.pdfjsLib.getDocument(url);
    loadingTask.promise.then(
      (pdf) => {
        setPdfDoc(pdf);
        setTotalPages(pdf.numPages);
        setLoading(false);
      },
      (err) => {
        console.error('Erro de leitura do PDF.js:', err);
        setErrorMsg('Arquivo PDF corrompido ou inacessível.');
        setLoading(false);
      }
    );
  }, []);

  // Carrega o arquivo PDF dependendo de ser Local ou Cloud
  const loadPDFFile = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    setPdfDoc(null);
    setCurrentPage(1);

    if (pdfBlobUrlRef.current) {
      URL.revokeObjectURL(pdfBlobUrlRef.current);
      pdfBlobUrlRef.current = null;
    }

    try {
      if (song.storage_type === 'cloud') {
        // Busca do Supabase Storage
        const { data, error } = await supabase.storage
          .from('music_sheets')
          .createSignedUrl(song.file_path, 3600);

        if (error || !data?.signedUrl) {
          throw new Error('Falha ao gerar URL de acesso ao Storage do Supabase.');
        }
        
        loadPDFFromUrl(data.signedUrl);
      } else {
        // Busca do cache do IndexedDB
        const cached = await getFromCache(song.id);
        if (cached) {
          const blobUrl = URL.createObjectURL(cached.blob);
          pdfBlobUrlRef.current = blobUrl;
          loadPDFFromUrl(blobUrl);
        } else {
          // Arquivo não está em cache. Exige Drag & Drop do arquivo físico
          setLoading(false);
        }
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Erro ao carregar arquivo de partitura.');
      setLoading(false);
    }
  }, [song, loadPDFFromUrl]);

  // Carrega a biblioteca PDF.js dinamicamente do CDN unpkg
  useEffect(() => {
    if (window.pdfjsLib) {
      loadPDFFile();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
      loadPDFFile();
    };
    script.onerror = () => {
      setErrorMsg('Falha ao carregar leitor de PDF (erro de script CDN).');
      setLoading(false);
    };
    document.body.appendChild(script);
  }, [song, loadPDFFile]);

  // Cleanup do blob URL ao desmontar o componente ou mudar de música
  useEffect(() => {
    return () => {
      if (pdfBlobUrlRef.current) {
        URL.revokeObjectURL(pdfBlobUrlRef.current);
        pdfBlobUrlRef.current = null;
      }
    };
  }, [song.id]);

  const fetchAnnotations = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('music_annotations')
        .select('*')
        .eq('song_id', song.id);
      
      if (!error && data) {
        // Mapeia anotações vindas do banco
        const formatted = data.map(ann => ({
          db_id: ann.id,
          page: ann.page_index,
          ...ann.data
        }));
        setAnnotations(formatted);
      }
    } catch (_e) {
      console.error('Erro ao buscar anotações:', _e);
    }
  }, [song.id]);

  // Carrega as anotações do Supabase para esta música
  useEffect(() => {
    if (song?.id) {
      fetchAnnotations();
    }
  }, [song, fetchAnnotations]);

  // Renderiza a página no canvas do HTML5
  useEffect(() => {
    if (!pdfDoc) return;

    pdfDoc.getPage(currentPage).then((page) => {
      const viewport = page.getViewport({ scale: zoom });
      const canvas = canvasRef.current;
      if (!canvas) return;

      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      // Cancela renderização anterior se estiver ativa
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }

      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };

      const renderTask = page.render(renderContext);
      renderTaskRef.current = renderTask;

      renderTask.promise.then(
        () => {
          renderTaskRef.current = null;
        },
        (err) => {
          if (err.name !== 'RenderingCancelledException') {
            console.error('Erro de renderização de página:', err);
          }
        }
      );
    });
  }, [pdfDoc, currentPage, zoom]);

  // Manipulador para Drop do arquivo local
  const handleFileDrop = async (e) => {
    e.preventDefault();
    const files = e.dataTransfer ? e.dataTransfer.files : e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (file.type !== 'application/pdf') {
      toast.error('Por favor, selecione apenas arquivos PDF.');
      return;
    }

    setLoading(true);
    try {
      // Salva no IndexedDB
      await saveToCache(song.id, file, file.name);
      
      // Revoga o blob URL anterior se existir
      if (pdfBlobUrlRef.current) {
        URL.revokeObjectURL(pdfBlobUrlRef.current);
      }

      // Cria URL do Blob e carrega
      const blobUrl = URL.createObjectURL(file);
      pdfBlobUrlRef.current = blobUrl;
      loadPDFFromUrl(blobUrl);
      toast.success('Partitura salva em cache local com sucesso!');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao guardar arquivo no cache local.');
      setLoading(false);
    }
  };

  // Manipula clique na partitura para criar anotação
  const handlePageClick = (e) => {
    if (activeTool === 'none') return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    if (activeTool === 'text') {
      const text = prompt('Digite sua anotação/nota musical:');
      if (!text) return;

      const newAnn = {
        id: 'ann-' + Math.random().toString(36).substring(2, 9),
        page: currentPage,
        type: 'text',
        x,
        y,
        text
      };
      setAnnotations(prev => [...prev, newAnn]);
    } else if (activeTool === 'highlight') {
      const newAnn = {
        id: 'ann-' + Math.random().toString(36).substring(2, 9),
        page: currentPage,
        type: 'highlight',
        x: x - 5, // centraliza levemente
        y: y - 2,
        w: 10, // largura padrão
        h: 4,  // altura padrão
        color: highlightColor
      };
      setAnnotations(prev => [...prev, newAnn]);
    }
  };

  // Remove anotação
  const handleRemoveAnnotation = (id) => {
    setAnnotations(prev => prev.filter(ann => ann.id !== id));
  };

  // Salva anotações no Supabase
  const handleSaveAnnotations = async () => {
    try {
      setLoading(true);
      
      // Remove anotações antigas dessa música
      const { error: delErr } = await supabase
        .from('music_annotations')
        .delete()
        .eq('song_id', song.id);

      if (delErr) throw delErr;

      // Insere novas
      if (annotations.length > 0) {
        const payload = annotations.map(ann => ({
          user_id: user.id,
          song_id: song.id,
          page_index: ann.page,
          data: {
            id: ann.id,
            type: ann.type,
            x: ann.x,
            y: ann.y,
            w: ann.w,
            h: ann.h,
            text: ann.text,
            color: ann.color
          }
        }));

        const { error: insErr } = await supabase
          .from('music_annotations')
          .insert(payload);

        if (insErr) throw insErr;
      }

      toast.success('Anotações salvas com sucesso!');
      fetchAnnotations();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao salvar anotações.');
    } finally {
      setLoading(false);
    }
  };

  // Limpa o cache local desta partitura
  const handleClearCache = async () => {
    if (!window.confirm('Deseja realmente remover esta partitura do cache local? Você precisará selecionar o arquivo PDF novamente na próxima visualização.')) {
      return;
    }
    try {
      await removeFromCache(song.id);
      setPdfDoc(null);
      if (pdfBlobUrlRef.current) {
        URL.revokeObjectURL(pdfBlobUrlRef.current);
        pdfBlobUrlRef.current = null;
      }
      toast.success('Cache local limpo!');
    } catch {
      toast.error('Erro ao limpar cache.');
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '1.5rem', height: '100%', alignItems: 'start' }}>
      
      {/* ── Main Canvas View ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        
        {/* Toolbar */}
        <div className="glass-card" style={{ padding: '0.8rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          
          {/* Zoom & Page Nav */}
          {pdfDoc && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button disabled={currentPage <= 1} className="icon-btn" onClick={() => setCurrentPage(prev => prev - 1)} style={{ padding: '6px' }}><ChevronLeft size={16} /></button>
              <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Pág. {currentPage} de {totalPages}</span>
              <button disabled={currentPage >= totalPages} className="icon-btn" onClick={() => setCurrentPage(prev => prev + 1)} style={{ padding: '6px' }}><ChevronRight size={16} /></button>
              
              <div style={{ width: '1px', height: '20px', background: 'var(--glass-border)', margin: '0 0.5rem' }} />
              
              <button className="icon-btn" onClick={() => setZoom(prev => Math.max(0.6, prev - 0.1))} style={{ padding: '6px' }} title="Afastar"><ZoomOut size={16} /></button>
              <span style={{ fontSize: '0.85rem', fontWeight: 'bold', minWidth: '40px', textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
              <button className="icon-btn" onClick={() => setZoom(prev => Math.min(2.0, prev + 0.1))} style={{ padding: '6px' }} title="Aproximar"><ZoomIn size={16} /></button>
            </div>
          )}

          {/* Annotations Tools */}
          {pdfDoc && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                className="icon-btn"
                onClick={() => setActiveTool(prev => prev === 'highlight' ? 'none' : 'highlight')}
                style={{
                  background: activeTool === 'highlight' ? 'var(--primary)' : 'var(--card-action-bg)',
                  borderColor: activeTool === 'highlight' ? 'var(--primary)' : 'var(--glass-border)',
                  color: activeTool === 'highlight' ? 'white' : 'var(--text-main)',
                  padding: '8px'
                }}
                title="Ferramenta Realce"
              >
                <Highlighter size={16} />
              </button>
              
              {activeTool === 'highlight' && (
                <div style={{ display: 'flex', gap: '4px', background: 'var(--input-bg)', padding: '4px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                  {['rgba(250, 204, 21, 0.4)', 'rgba(34, 197, 94, 0.4)', 'rgba(239, 68, 68, 0.4)', 'rgba(59, 130, 246, 0.4)'].map(c => (
                    <button
                      key={c}
                      onClick={() => setHighlightColor(c)}
                      style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '4px',
                        background: c.replace('0.4', '1.0'),
                        border: highlightColor === c ? '2px solid white' : 'none',
                        cursor: 'pointer'
                      }}
                    />
                  ))}
                </div>
              )}

              <button
                className="icon-btn"
                onClick={() => setActiveTool(prev => prev === 'text' ? 'none' : 'text')}
                style={{
                  background: activeTool === 'text' ? 'var(--primary)' : 'var(--card-action-bg)',
                  borderColor: activeTool === 'text' ? 'var(--primary)' : 'var(--glass-border)',
                  color: activeTool === 'text' ? 'white' : 'var(--text-main)',
                  padding: '8px'
                }}
                title="Escrever Notas"
              >
                <Type size={16} />
              </button>

              <div style={{ width: '1px', height: '20px', background: 'var(--glass-border)', margin: '0 0.5rem' }} />

              <button
                className="btn-primary"
                onClick={handleSaveAnnotations}
                style={{ padding: '0.4rem 1rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}
              >
                <Save size={14} />
                <span>Salvar Notas</span>
              </button>
            </div>
          )}

          {/* Local Action */}
          {song.storage_type === 'local' && pdfDoc && (
            <button className="icon-btn" onClick={handleClearCache} style={{ color: 'var(--danger)', padding: '8px' }} title="Remover PDF do Cache Local">
              <Trash2 size={16} />
            </button>
          )}

          {/* Edit Action */}
          {onEdit && (
            <button
              className="icon-btn"
              onClick={() => onEdit(song)}
              style={{ padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', fontWeight: 700 }}
              title="Editar música"
            >
              <Edit size={13} /> Editar
            </button>
          )}

        </div>

        {/* PDF Container & Canvas */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          
          {loading && (
            <div className="glass-card" style={{ padding: '4rem', textAlign: 'center', width: '100%' }}>
              <div className="animate-spin" style={{ width: '32px', height: '32px', border: '3px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto 1rem' }} />
              <p style={{ color: 'var(--text-muted)' }}>Renderizando partitura...</p>
            </div>
          )}

          {errorMsg && (
            <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', width: '100%', borderColor: 'var(--danger)' }}>
              <AlertCircle size={32} style={{ color: 'var(--danger)', margin: '0 auto 1rem' }} />
              <p style={{ color: 'var(--text-main)', fontWeight: 'bold' }}>{errorMsg}</p>
              <button className="btn-primary" onClick={loadPDFFile} style={{ marginTop: '1rem', padding: '0.5rem 1rem', fontSize: '0.8rem' }}>Tentar Novamente</button>
            </div>
          )}

          {/* Placeholder para carregar arquivo local */}
          {!loading && !errorMsg && !pdfDoc && song.storage_type === 'local' && (
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={handleFileDrop}
              className="glass-card"
              style={{
                width: '100%',
                padding: '4rem 2rem',
                textAlign: 'center',
                border: '2px dashed var(--glass-border)',
                background: 'rgba(255,255,255,0.01)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1.5rem',
                cursor: 'pointer'
              }}
              onClick={() => document.getElementById('file-picker-sheet').click()}
            >
              <div style={{ width: '64px', height: '64px', borderRadius: '20px', background: 'rgba(99,102,241,0.08)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Upload size={32} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>Partitura Local Pendente</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '400px', margin: '0.5rem auto 0', lineHeight: 1.5 }}>
                  Arraste ou clique para selecionar o arquivo PDF original <b>{song.file_path}</b> para salvá-lo no cache do navegador.
                </p>
              </div>
              <input
                id="file-picker-sheet"
                type="file"
                accept="application/pdf"
                onChange={handleFileDrop}
                style={{ display: 'none' }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Isso não consome tráfego ou armazenamento no Supabase Cloud.</span>
            </div>
          )}

          {/* PDF Page Canvas */}
          {pdfDoc && (
            <div
              ref={containerRef}
              style={{
                position: 'relative',
                border: '1px solid var(--glass-border)',
                boxShadow: 'var(--shadow)',
                borderRadius: '8px',
                overflow: 'hidden',
                cursor: activeTool !== 'none' ? 'crosshair' : 'default'
              }}
              onClick={handlePageClick}
            >
              <canvas ref={canvasRef} />

              {/* Camada SVG de anotações sobreposta */}
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                {annotations
                  .filter(ann => ann.page === currentPage)
                  .map(ann => {
                    if (ann.type === 'highlight') {
                      return (
                        <div
                          key={ann.id}
                          style={{
                            position: 'absolute',
                            left: `${ann.x}%`,
                            top: `${ann.y}%`,
                            width: `${ann.w}%`,
                            height: `${ann.h}%`,
                            background: ann.color,
                            borderRadius: '2px',
                            pointerEvents: 'auto',
                            cursor: 'pointer'
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm('Remover este realce?')) handleRemoveAnnotation(ann.id);
                          }}
                          title="Clique para remover o realce"
                        />
                      );
                    } else if (ann.type === 'text') {
                      return (
                        <div
                          key={ann.id}
                          style={{
                            position: 'absolute',
                            left: `${ann.x}%`,
                            top: `${ann.y}%`,
                            transform: 'translate(-50%, -50%)',
                            background: 'var(--primary)',
                            color: 'white',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                            whiteSpace: 'nowrap',
                            pointerEvents: 'auto',
                            cursor: 'pointer'
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Remover nota: "${ann.text}"?`)) handleRemoveAnnotation(ann.id);
                          }}
                          title="Clique para remover a anotação"
                        >
                          {ann.text}
                        </div>
                      );
                    }
                    return null;
                  })}
              </div>
            </div>
          )}

        </div>

      </div>

      {/* ── Sidebar Annotations List ── */}
      <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%', maxHeight: '72vh', overflowY: 'auto' }}>
        <h3 style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Bookmark size={14} />
          <span>Anotações Gravadas</span>
        </h3>

        {/* Informações da música */}
        <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '8px', padding: '0.75rem', border: '1px solid var(--glass-border)' }}>
          <div style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-main)', marginBottom: '0.2rem' }}>{song.title}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: song.music_link ? '0.5rem' : 0 }}>{song.artist || 'Artista Desconhecido'}</div>
          {song.music_link && (
            <a
              href={song.music_link}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                fontSize: '0.72rem',
                color: 'var(--primary)',
                textDecoration: 'none',
                background: 'rgba(99,102,241,0.08)',
                padding: '3px 8px',
                borderRadius: '6px',
                border: '1px solid rgba(99,102,241,0.2)',
                fontWeight: 600
              }}
            >
              <ExternalLink size={11} /> Link de Referência
            </a>
          )}
        </div>
        
        <div style={{ width: '100%', height: '1px', background: 'var(--glass-border)' }} />
        
        {annotations.length === 0 ? (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem 0' }}>
            Nenhuma marcação na partitura ainda. Selecione uma ferramenta acima e clique nas notas para marcar!
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {annotations.map(ann => (
              <div
                key={ann.id}
                onClick={() => setCurrentPage(ann.page)}
                style={{
                  padding: '0.75rem',
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: '8px',
                  border: '1px solid var(--glass-border)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
              >
                <div>
                  <div style={{ fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '0.1rem' }}>
                    {ann.type === 'text' ? `Nota: "${ann.text}"` : 'Realce'}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 600 }}>
                    Pág. {ann.page}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveAnnotation(ann.id);
                  }}
                  style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px' }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
