import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Edit, Save, Music } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import ChordDiagram from './ChordDiagram';

export default function ChordSettings({ user }) {
  const [activeTab, setActiveTab] = useState('chords'); // 'chords' | 'genres'
  const [instrument, setInstrument] = useState('violao');
  const [chords, setChords] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form de edição de acorde
  const [isEditing, setIsEditing] = useState(false);
  const [editingChordId, setEditingChordId] = useState(null);
  const [chordName, setChordName] = useState('');
  
  // Variação ativa no editor
  const [frets, setFrets] = useState([0, 0, 0, 0, 0, 0]);
  const [fingers, setFingers] = useState([0, 0, 0, 0, 0, 0]);
  const [startFret, setStartFret] = useState(1);

  // Gêneros
  const [genres, setGenres] = useState([]);
  const [newGenreName, setNewGenreName] = useState('');
  const [genresLoading, setGenresLoading] = useState(false);

  const isFourString = ['ukulele', 'cavaquinho', 'bandolim'].includes(instrument);
  const stringsCount = isFourString ? 4 : 6;

  // Ajusta arrays de trastes/dedos ao mudar de instrumento
  useEffect(() => {
    const size = isFourString ? 4 : 6;
    setFrets(Array(size).fill(0));
    setFingers(Array(size).fill(0));
  }, [instrument, isFourString]);

  const fetchChords = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Busca os instrumentos cadastrados pelo usuário para ver se já existe o selecionado
      let { data: instDataList, error: instErr } = await supabase
        .from('music_instruments')
        .select('*')
        .eq('name', instrument)
        .eq('user_id', user.id);

      if (instErr) throw instErr;
      let instData = instDataList?.[0];

      // Se não existir o instrumento no banco, cria automaticamente
      if (!instData) {
        const { data: newInst, error: createInstErr } = await supabase
          .from('music_instruments')
          .insert({
            user_id: user.id,
            name: instrument,
            strings_count: stringsCount
          })
          .select()
          .single();

        if (createInstErr) throw createInstErr;
        instData = newInst;
      }

      // 2. Busca os acordes e suas variações do instrumento
      const { data: chordsData, error: chordsErr } = await supabase
        .from('music_chords')
        .select(`
          id,
          chord_name,
          music_chord_variations (
            id,
            variation_index,
            frets,
            fingers,
            start_fret
          )
        `)
        .eq('instrument_id', instData.id);

      if (chordsErr) throw chordsErr;
      setChords(chordsData || []);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar acordes.');
    } finally {
      setLoading(false);
    }
  }, [instrument, stringsCount, user.id]);

  useEffect(() => {
    if (activeTab === 'chords') {
      fetchChords();
    }
  }, [fetchChords, activeTab]);

  const fetchGenres = useCallback(async () => {
    setGenresLoading(true);
    try {
      const { data, error } = await supabase
        .from('music_genres')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      setGenres(data || []);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar gêneros.');
    } finally {
      setGenresLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'genres') {
      fetchGenres();
    }
  }, [activeTab, fetchGenres]);

  // Interatividade do traste no Fretboard
  const handleFretClick = (stringIdx, fretVal) => {
    setFrets(prev => {
      const next = [...prev];
      next[stringIdx] = prev[stringIdx] === fretVal ? 0 : fretVal;
      return next;
    });

    setFingers(prev => {
      const next = [...prev];
      if (frets[stringIdx] === fretVal) {
        next[stringIdx] = 0;
      }
      return next;
    });
  };

  const handleHeaderClick = (stringIdx) => {
    setFrets(prev => {
      const next = [...prev];
      next[stringIdx] = prev[stringIdx] === -1 ? 0 : -1;
      return next;
    });
    setFingers(prev => {
      const next = [...prev];
      next[stringIdx] = 0;
      return next;
    });
  };

  const handleFingerChange = (stringIdx, fingerVal) => {
    setFingers(prev => {
      const next = [...prev];
      next[stringIdx] = parseInt(fingerVal) || 0;
      return next;
    });
  };

  const handleSaveChord = async (e) => {
    e.preventDefault();
    if (!chordName.trim()) {
      toast.error('Informe o nome do acorde.');
      return;
    }

    try {
      // Pega o ID do instrumento no banco safely
      const { data: instDataList, error: instErr } = await supabase
        .from('music_instruments')
        .select('id')
        .eq('name', instrument)
        .eq('user_id', user.id);

      if (instErr) throw instErr;
      let instData = instDataList?.[0];

      let instrumentId = instData?.id;
      if (!instrumentId) {
        const { data: newInst, error: createInstErr } = await supabase
          .from('music_instruments')
          .insert({
            user_id: user.id,
            name: instrument,
            strings_count: stringsCount
          })
          .select()
          .single();

        if (createInstErr) throw createInstErr;
        instrumentId = newInst.id;
      }

      let chordId = editingChordId;

      if (!chordId) {
        // Verifica se acorde com mesmo nome já existe
        const { data: existing } = await supabase
          .from('music_chords')
          .select('id')
          .eq('instrument_id', instrumentId)
          .eq('chord_name', chordName.trim())
          .maybeSingle();

        if (existing) {
          toast.error('Este acorde já está cadastrado para este instrumento.');
          return;
        }

        // Insere Acorde principal
        const { data: newChord, error: chordErr } = await supabase
          .from('music_chords')
          .insert({
            user_id: user.id,
            instrument_id: instrumentId,
            chord_name: chordName.trim()
          })
          .select()
          .single();

        if (chordErr) throw chordErr;
        chordId = newChord.id;
      } else {
        // Atualiza nome do acorde
        await supabase
          .from('music_chords')
          .update({ chord_name: chordName.trim() })
          .eq('id', chordId);
      }

      // Upsert na variação principal (var_index = 0 por enquanto)
      const { data: existingVars } = await supabase
        .from('music_chord_variations')
        .select('id')
        .eq('chord_id', chordId)
        .eq('variation_index', 0)
        .maybeSingle();

      const varPayload = {
        chord_id: chordId,
        variation_index: 0,
        frets,
        fingers,
        start_fret: parseInt(startFret) || 1
      };

      if (existingVars) {
        const { error: varErr } = await supabase
          .from('music_chord_variations')
          .update(varPayload)
          .eq('id', existingVars.id);
        if (varErr) throw varErr;
      } else {
        const { error: varErr } = await supabase
          .from('music_chord_variations')
          .insert(varPayload);
        if (varErr) throw varErr;
      }

      toast.success('Acorde gravado com sucesso!');
      setIsEditing(false);
      setEditingChordId(null);
      setChordName('');
      setFrets(Array(stringsCount).fill(0));
      setFingers(Array(stringsCount).fill(0));
      setStartFret(1);
      fetchChords();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao salvar acorde.');
    }
  };

  const handleEditChord = (chord) => {
    setIsEditing(true);
    setEditingChordId(chord.id);
    setChordName(chord.chord_name);
    
    const variation = chord.music_chord_variations?.[0];
    if (variation) {
      setFrets(variation.frets);
      setFingers(variation.fingers);
      setStartFret(variation.start_fret);
    } else {
      setFrets(Array(stringsCount).fill(0));
      setFingers(Array(stringsCount).fill(0));
      setStartFret(1);
    }
  };

  const handleDeleteChord = async (chordId) => {
    if (!window.confirm('Tem certeza que deseja excluir este acorde personalizado?')) return;
    try {
      const { error } = await supabase
        .from('music_chords')
        .delete()
        .eq('id', chordId);

      if (error) throw error;
      toast.success('Acorde excluído!');
      fetchChords();
    } catch {
      toast.error('Erro ao excluir acorde.');
    }
  };

  const handleAddGenre = async (e) => {
    e.preventDefault();
    if (!newGenreName.trim()) return;
    try {
      const { error } = await supabase
        .from('music_genres')
        .insert({
          user_id: user.id,
          name: newGenreName.trim()
        });
      if (error) {
        if (error.code === '23505') {
          toast.error('Este gênero já está cadastrado.');
        } else {
          throw error;
        }
      } else {
        toast.success('Gênero adicionado com sucesso!');
        setNewGenreName('');
        fetchGenres();
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao cadastrar gênero.');
    }
  };

  const handleDeleteGenre = async (genreId) => {
    if (!window.confirm('Tem certeza que deseja excluir este gênero? As músicas associadas ficarão sem gênero definido.')) return;
    try {
      const { error } = await supabase
        .from('music_genres')
        .delete()
        .eq('id', genreId);
      if (error) throw error;
      toast.success('Gênero excluído com sucesso!');
      fetchGenres();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao excluir gênero.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
      {/* ── Sub-Tab Switcher ── */}
      <div style={{ display: 'flex', gap: '1.5rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.75rem', marginBottom: '0.5rem' }}>
        <button
          onClick={() => { setActiveTab('chords'); setIsEditing(false); }}
          style={{
            background: 'transparent',
            border: 'none',
            color: activeTab === 'chords' ? 'var(--primary)' : 'var(--text-muted)',
            fontSize: '1rem',
            fontWeight: 800,
            cursor: 'pointer',
            paddingBottom: '0.5rem',
            borderBottom: activeTab === 'chords' ? '2px solid var(--primary)' : '2px solid transparent',
            transition: 'all 0.2s'
          }}
        >
          Dicionário de Acordes
        </button>
        <button
          onClick={() => setActiveTab('genres')}
          style={{
            background: 'transparent',
            border: 'none',
            color: activeTab === 'genres' ? 'var(--primary)' : 'var(--text-muted)',
            fontSize: '1rem',
            fontWeight: 800,
            cursor: 'pointer',
            paddingBottom: '0.5rem',
            borderBottom: activeTab === 'genres' ? '2px solid var(--primary)' : '2px solid transparent',
            transition: 'all 0.2s'
          }}
        >
          Gêneros Musicais
        </button>
      </div>

      {activeTab === 'chords' ? (
        <div style={{ display: 'grid', gridTemplateColumns: isEditing ? '1fr 340px' : '1fr', gap: '1.5rem', alignItems: 'start' }}>
          {/* ── List Area ── */}
          <div className="glass-card" style={{ padding: '2rem' }}>
            
            {/* Header toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 900, margin: 0, color: 'var(--text-main)' }}>Dicionário de Acordes Customizados</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>Desenhe e gerencie dedilhados e pestanas para seus instrumentos.</p>
              </div>
              
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <select
                  className="select-filter"
                  value={instrument}
                  onChange={e => setInstrument(e.target.value)}
                >
                  <option value="violao">Violão e Guitarra (6 cordas)</option>
                  <option value="ukulele">Ukulele (4 cordas)</option>
                  <option value="cavaquinho">Cavaquinho (4 cordas)</option>
                  <option value="bandolim">Bandolim (4 cordas)</option>
                </select>
                
                {!isEditing && (
                  <button className="btn-primary" onClick={() => setIsEditing(true)} style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Plus size={14} />
                    <span>Criar Acorde</span>
                  </button>
                )}
              </div>
            </div>

            {/* Chords Grid */}
            {loading ? (
              <div style={{ padding: '3rem', textAlign: 'center' }}>Carregando acordes personalizados...</div>
            ) : chords.length === 0 ? (
              <div style={{ padding: '4rem', textAlign: 'center', border: '1px dashed var(--glass-border)', borderRadius: '16px' }}>
                <Music size={32} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem' }} />
                <h4 style={{ margin: 0 }}>Nenhum acorde customizado</h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.25rem 0 1.25rem 0' }}>O sistema exibirá os diagramas padrões. Crie um novo acorde se precisar de digitações específicas.</p>
                <button className="btn-primary" onClick={() => setIsEditing(true)} style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}>Cadastrar Primeiro Acorde</button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1.25rem' }}>
                {chords.map(c => {
                  const var0 = c.music_chord_variations?.[0];
                  return (
                    <div key={c.id} className="glass-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', position: 'relative' }}>
                      {var0 && (
                        <ChordDiagram
                          name={c.chord_name}
                          stringsCount={stringsCount}
                          frets={var0.frets}
                          fingers={var0.fingers}
                          startFret={var0.start_fret}
                        />
                      )}
                      
                      {/* Action buttons overlay */}
                      <div style={{ display: 'flex', gap: '4px', marginTop: '0.5rem' }}>
                        <button className="icon-btn" onClick={() => handleEditChord(c)} style={{ padding: '6px' }} title="Editar"><Edit size={12} /></button>
                        <button className="icon-btn" onClick={() => handleDeleteChord(c.id)} style={{ padding: '6px', color: 'var(--danger)' }} title="Excluir"><Trash2 size={12} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          </div>

          {/* ── Editor Sidebar (Fretboard Builder) ── */}
          {isEditing && (
            <div className="glass-card animate-fadeIn" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 900, margin: 0 }}>
                  {editingChordId ? 'Editar Acorde' : 'Novo Acorde'}
                </h3>
                <button className="icon-btn" onClick={() => { setIsEditing(false); setEditingChordId(null); }} style={{ padding: '4px' }}>x</button>
              </div>

              <form onSubmit={handleSaveChord} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                
                <div className="input-group">
                  <label>Nome do Acorde *</label>
                  <input
                    type="text"
                    placeholder="Ex: D9/F# ou C"
                    value={chordName}
                    onChange={e => setChordName(e.target.value)}
                    required
                    style={{ fontFamily: 'monospace' }}
                  />
                </div>

                <div className="input-group">
                  <label>Traste Inicial (Capa)</label>
                  <input
                    type="number"
                    min="1"
                    max="18"
                    value={startFret}
                    onChange={e => setStartFret(Math.max(1, parseInt(e.target.value) || 1))}
                    required
                  />
                </div>

                {/* Fretboard Interactive Scale */}
                <div className="input-group">
                  <label>Escala do Instrumento (Trastes)</label>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    background: 'rgba(0,0,0,0.2)',
                    padding: '1.25rem 0.5rem',
                    borderRadius: '12px',
                    border: '1px solid var(--glass-border)'
                  }}>
                    {/* Header (Mute / Open triggers) */}
                    <div style={{ display: 'flex', gap: '14px', marginBottom: '8px' }}>
                      {frets.map((f, sIdx) => (
                        <button
                          key={`header-btn-${sIdx}`}
                          type="button"
                          onClick={() => handleHeaderClick(sIdx)}
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '4px',
                            background: f === -1 ? 'var(--danger)' : f === 0 ? 'var(--success)' : 'var(--text-muted)',
                            color: 'white',
                            border: 'none',
                            fontSize: '9px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          title={f === -1 ? "Silenciado. Clique para liberar" : f === 0 ? "Corda Solta. Clique para silenciar" : "Corda Pressionada. Clique para soltar"}
                        >
                          {f === -1 ? 'X' : f === 0 ? 'O' : '•'}
                        </button>
                      ))}
                    </div>

                    {/* Vertical Strings & Fret Bars Grid */}
                    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '0px' }}>
                      {/* Trastes 1 a 5 */}
                      {[1, 2, 3, 4, 5].map(fVal => (
                        <div key={`fret-${fVal}`} style={{
                          display: 'flex',
                          gap: '14px',
                          height: '32px',
                          borderBottom: '2.5px solid #475569',
                          padding: '0 10px',
                          position: 'relative'
                        }}>
                          {/* Indicador lateral do traste real */}
                          <span style={{ position: 'absolute', left: '-20px', top: '6px', fontSize: '9px', fontWeight: 'bold', color: 'var(--text-muted)' }}>
                            {startFret + fVal - 1}
                          </span>
                          
                          {/* Cordas */}
                          {Array.from({ length: stringsCount }).map((_, sIdx) => {
                            const isPressed = frets[sIdx] === (startFret + fVal - 1);
                            return (
                              <div
                                key={`fret-${fVal}-str-${sIdx}`}
                                onClick={() => handleFretClick(sIdx, startFret + fVal - 1)}
                                style={{
                                  width: '20px',
                                  height: '100%',
                                  position: 'relative',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                              >
                                {/* Linha vertical que imita a corda física */}
                                <div style={{
                                  position: 'absolute',
                                  top: 0,
                                  bottom: 0,
                                  width: '2px',
                                  background: '#94a3b8',
                                  zIndex: 1
                                }} />

                                {/* Bolinha que indica nota presa */}
                                {isPressed && (
                                  <div style={{
                                    width: '15px',
                                    height: '15px',
                                    borderRadius: '50%',
                                    background: 'var(--primary)',
                                    zIndex: 2,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }} />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Dedos (Fingers) select para trastes pressionados */}
                <div className="input-group">
                  <label>Mapeamento de Dedos (1 a 4)</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(60px, 1fr))', gap: '0.5rem' }}>
                    {frets.map((f, sIdx) => {
                      if (f <= 0) return null;
                      return (
                        <div key={`finger-sel-${sIdx}`} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>Corda {sIdx + 1}</span>
                          <select
                            className="select-filter"
                            value={fingers[sIdx] || 0}
                            onChange={e => handleFingerChange(sIdx, e.target.value)}
                            style={{ padding: '4px' }}
                          >
                            <option value="0">-</option>
                            <option value="1">Dedo 1</option>
                            <option value="2">Dedo 2</option>
                            <option value="3">Dedo 3</option>
                            <option value="4">Dedo 4</option>
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => { setIsEditing(false); setEditingChordId(null); }}
                    style={{ flex: 1, padding: '0.5rem' }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    style={{ flex: 1, padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                  >
                    <Save size={14} />
                    <span>Salvar</span>
                  </button>
                </div>

              </form>
            </div>
          )}
        </div>
      ) : (
        /* ── Gêneros Musicais Tab ── */
        <div className="glass-card animate-fadeIn" style={{ padding: '2rem' }}>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 900, margin: 0, color: 'var(--text-main)' }}>Gêneros Musicais</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.25rem 0 1.5rem 0' }}>
              Gerencie a lista de gêneros pré-definidos do sistema.
            </p>
          </div>

          <form onSubmit={handleAddGenre} style={{ display: 'flex', gap: '0.75rem', marginBottom: '2rem', maxWidth: '500px' }}>
            <input
              type="text"
              placeholder="Ex: MPB, Rock, Jazz..."
              className="glass-input"
              value={newGenreName}
              onChange={e => setNewGenreName(e.target.value)}
              required
              style={{ flex: 1 }}
            />
            <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1.25rem' }}>
              <Plus size={14} />
              <span>Adicionar</span>
            </button>
          </form>

          {genresLoading ? (
            <div>Carregando gêneros...</div>
          ) : genres.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', border: '1px dashed var(--glass-border)', borderRadius: '12px', color: 'var(--text-muted)' }}>
              Nenhum gênero cadastrado. Adicione um gênero para classificar suas músicas.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
              {genres.map(g => (
                <div
                  key={g.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '8px',
                    padding: '0.75rem 1rem'
                  }}
                >
                  <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{g.name}</span>
                  <button
                    onClick={() => handleDeleteGenre(g.id)}
                    className="icon-btn"
                    style={{ padding: '6px', color: 'var(--danger)' }}
                    title="Excluir Gênero"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
