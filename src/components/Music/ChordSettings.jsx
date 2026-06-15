import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit, Save, Music, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import ChordDiagram from './ChordDiagram';

// Ordem canônica das notas raiz
const NOTE_ORDER = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

// Extrai a nota raiz de um nome de acorde: C, C#, Db, D, etc.
function getChordRoot(chordName) {
  const match = chordName.match(/^([A-G][#b]?)/);
  return match ? match[1] : chordName[0] || '?';
}

// Índice de ordenação da nota raiz (considera bemóis/sustenidos)
function getRootSortIndex(root) {
  const natural = root[0]; // A-G
  const modifier = root[1] || ''; // # ou b
  const base = NOTE_ORDER.indexOf(natural);
  // sustenido (+0.5), bemol (-0.5) para ordenar entre as notas naturais
  return base + (modifier === '#' ? 0.5 : modifier === 'b' ? -0.5 : 0);
}

// Subcomponente para renderizar cada card de acorde com controle de variações
function ChordCard({ chord, stringsCount, handleEditChord, handleDeleteChord }) {
  const variations = chord.music_chord_variations || [];
  const [activeIdx, setActiveIdx] = useState(0);

  // Ordena variações pelo índice
  const sortedVars = [...variations].sort((a, b) => a.variation_index - b.variation_index);
  const currentVar = sortedVars[activeIdx] || sortedVars[0];

  return (
    <div className="glass-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', position: 'relative' }}>
      {currentVar ? (
        <ChordDiagram
          name={chord.chord_name}
          stringsCount={stringsCount}
          frets={currentVar.frets}
          fingers={currentVar.fingers}
          startFret={currentVar.start_fret}
        />
      ) : (
        <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
          Sem variação cadastrada
        </div>
      )}

      {/* Seletor de variações do acorde na grade */}
      {sortedVars.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '0.25rem', marginTop: '0.25rem' }}>
          <button
            type="button"
            className="icon-btn"
            style={{ padding: '4px' }}
            disabled={activeIdx === 0}
            onClick={() => setActiveIdx(prev => prev - 1)}
            title="Variação Anterior"
          >
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>
            Var. {activeIdx + 1} de {sortedVars.length}
          </span>
          <button
            type="button"
            className="icon-btn"
            style={{ padding: '4px' }}
            disabled={activeIdx === sortedVars.length - 1}
            onClick={() => setActiveIdx(prev => prev + 1)}
            title="Próxima Variação"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* Botões de Ação */}
      <div style={{ display: 'flex', gap: '4px', marginTop: '0.25rem', width: '100%', justifyContent: 'center' }}>
        <button className="icon-btn" onClick={() => handleEditChord(chord)} style={{ padding: '6px' }} title="Editar"><Edit size={12} /></button>
        <button className="icon-btn" onClick={() => handleDeleteChord(chord.id)} style={{ padding: '6px', color: 'var(--danger)' }} title="Excluir"><Trash2 size={12} /></button>
      </div>
    </div>
  );
}

export default function ChordSettings({ user }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('chords'); // 'chords' | 'genres'
  const [instrument, setInstrument] = useState('violao');
  const [chords, setChords] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form de edição de acorde
  const [isEditing, setIsEditing] = useState(false);
  const [editingChordId, setEditingChordId] = useState(null);
  const [chordName, setChordName] = useState('');

  // Variações do acorde sendo editadas/criadas
  const [variations, setVariations] = useState([
    { variation_index: 0, frets: [0, 0, 0, 0, 0, 0], fingers: [0, 0, 0, 0, 0, 0], start_fret: 1 }
  ]);
  const [activeVarIdx, setActiveVarIdx] = useState(0);
  const [deletedVariationIds, setDeletedVariationIds] = useState([]);

  // Gêneros
  const [genres, setGenres] = useState([]);
  const [newGenreName, setNewGenreName] = useState('');
  const [genresLoading, setGenresLoading] = useState(false);

  const isFourString = ['ukulele', 'cavaquinho', 'bandolim'].includes(instrument);
  const stringsCount = isFourString ? 4 : 6;

  // Busca de acordes no dicionário
  const [chordSearch, setChordSearch] = useState('');

  // Ajusta arrays de trastes/dedos ao mudar de instrumento
  useEffect(() => {
    const size = isFourString ? 4 : 6;
    setVariations(prev => prev.map(v => ({
      ...v,
      frets: v.frets.length === size ? v.frets : Array(size).fill(0),
      fingers: v.fingers.length === size ? v.fingers : Array(size).fill(0)
    })));
  }, [instrument, isFourString, stringsCount]);

  const fetchChords = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Busca o instrumento
      let { data: instDataList, error: instErr } = await supabase
        .from('music_instruments')
        .select('*')
        .eq('name', instrument)
        .eq('user_id', user.id);

      if (instErr) throw instErr;
      let instData = instDataList?.[0];

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

      // 2. Busca os acordes e suas variações
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
      setChordSearch(''); // reset busca ao mudar instrumento
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

  // Manipuladores de alteração corda a corda da variação ativa
  const updateActiveVarFret = (stringIdx, fretVal) => {
    setVariations(prev => {
      const next = [...prev];
      const activeVar = { ...next[activeVarIdx] };
      const nextFrets = [...activeVar.frets];
      nextFrets[stringIdx] = fretVal;
      activeVar.frets = nextFrets;

      // Reseta dedo se for solta (0) ou abafada (-1)
      if (fretVal <= 0) {
        const nextFingers = [...activeVar.fingers];
        nextFingers[stringIdx] = 0;
        activeVar.fingers = nextFingers;
      }

      // Cálculo Automático de traste inicial
      const pressedFrets = nextFrets.filter(f => f > 0);
      if (pressedFrets.length > 0) {
        activeVar.start_fret = Math.min(...pressedFrets);
      } else {
        activeVar.start_fret = 1;
      }

      next[activeVarIdx] = activeVar;
      return next;
    });
  };

  const updateActiveVarFinger = (stringIdx, fingerVal) => {
    setVariations(prev => {
      const next = [...prev];
      const activeVar = { ...next[activeVarIdx] };
      const nextFingers = [...activeVar.fingers];
      nextFingers[stringIdx] = parseInt(fingerVal) || 0;
      activeVar.fingers = nextFingers;
      next[activeVarIdx] = activeVar;
      return next;
    });
  };

  const updateActiveVarStartFret = (fretVal) => {
    setVariations(prev => {
      const next = [...prev];
      const activeVar = { ...next[activeVarIdx] };
      activeVar.start_fret = Math.max(1, parseInt(fretVal) || 1);
      next[activeVarIdx] = activeVar;
      return next;
    });
  };

  // Gerenciamento de variações na UI do form
  const handleAddVariation = () => {
    setVariations(prev => [
      ...prev,
      {
        variation_index: prev.length,
        frets: Array(stringsCount).fill(0),
        fingers: Array(stringsCount).fill(0),
        start_fret: 1
      }
    ]);
    setActiveVarIdx(variations.length);
  };

  const handleDeleteVariation = (idx) => {
    if (variations.length === 1) {
      toast.error('O acorde precisa conter pelo menos uma variação.');
      return;
    }
    const varToDelete = variations[idx];
    if (varToDelete.id) {
      setDeletedVariationIds(prev => [...prev, varToDelete.id]);
    }
    const newVars = variations.filter((_, i) => i !== idx).map((v, i) => ({
      ...v,
      variation_index: i
    }));
    setVariations(newVars);
    setActiveVarIdx(Math.max(0, idx - 1));
  };

  const handleSaveChord = async (e) => {
    e.preventDefault();
    if (!chordName.trim()) {
      toast.error('Informe o nome do acorde.');
      return;
    }

    try {
      // 1. Pega ID do instrumento
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
        // Novo acorde - verifica duplicados
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
        // Atualiza nome
        await supabase
          .from('music_chords')
          .update({ chord_name: chordName.trim() })
          .eq('id', chordId);
      }

      // 2. Persiste as variações do acorde
      for (const v of variations) {
        const varPayload = {
          chord_id: chordId,
          variation_index: v.variation_index,
          frets: v.frets,
          fingers: v.fingers,
          start_fret: parseInt(v.start_fret) || 1
        };

        if (v.id) {
          const { error: varErr } = await supabase
             .from('music_chord_variations')
             .update(varPayload)
             .eq('id', v.id);
          if (varErr) throw varErr;
        } else {
          const { error: varErr } = await supabase
             .from('music_chord_variations')
             .insert(varPayload);
          if (varErr) throw varErr;
        }
      }

      // 3. Exclui variações excluídas na UI
      if (deletedVariationIds.length > 0) {
        const { error: delErr } = await supabase
          .from('music_chord_variations')
          .delete()
          .in('id', deletedVariationIds);
        if (delErr) throw delErr;
      }

      toast.success('Acorde gravado com sucesso!');
      setIsEditing(false);
      setEditingChordId(null);
      setChordName('');
      setVariations([
        { variation_index: 0, frets: Array(stringsCount).fill(0), fingers: Array(stringsCount).fill(0), start_fret: 1 }
      ]);
      setDeletedVariationIds([]);
      setActiveVarIdx(0);
      fetchChords();

      // Sincroniza o banco de dados offline
      try {
        const { SyncEngine } = await import('../../lib/offline/SyncEngine');
        const engine = new SyncEngine(user.id);
        await engine.sync();
      } catch (syncErr) {
        console.warn('Erro ao sincronizar acordes offline:', syncErr);
      }
      queryClient.invalidateQueries({ queryKey: ['offline_chords'] });

    } catch (err) {
      console.error(err);
      toast.error('Erro ao salvar acorde.');
    }
  };

  const handleEditChord = (chord) => {
    setIsEditing(true);
    setEditingChordId(chord.id);
    setChordName(chord.chord_name);
    setDeletedVariationIds([]);

    const vars = chord.music_chord_variations || [];
    if (vars.length > 0) {
      const sortedVars = [...vars].sort((a, b) => a.variation_index - b.variation_index);
      setVariations(sortedVars.map(v => ({
        id: v.id,
        variation_index: v.variation_index,
        frets: v.frets,
        fingers: v.fingers,
        start_fret: v.start_fret
      })));
    } else {
      setVariations([
        { variation_index: 0, frets: Array(stringsCount).fill(0), fingers: Array(stringsCount).fill(0), start_fret: 1 }
      ]);
    }
    setActiveVarIdx(0);
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

      // Sincroniza o banco de dados offline
      try {
        const { SyncEngine } = await import('../../lib/offline/SyncEngine');
        const engine = new SyncEngine(user.id);
        await engine.sync();
      } catch (syncErr) {
        console.warn('Erro ao sincronizar exclusão de acordes offline:', syncErr);
      }
      queryClient.invalidateQueries({ queryKey: ['offline_chords'] });

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

  // Agrupa e ordena acordes por nota raiz (C D E F G A B)
  const groupedChords = useMemo(() => {
    const filtered = chordSearch.trim()
      ? chords.filter(c => c.chord_name.toLowerCase().includes(chordSearch.toLowerCase()))
      : chords;

    const groups = {};
    filtered.forEach(c => {
      const root = getChordRoot(c.chord_name);
      if (!groups[root]) groups[root] = [];
      groups[root].push(c);
    });

    // Ordena cada grupo internamente por nome completo
    Object.values(groups).forEach(arr => {
      arr.sort((a, b) => a.chord_name.localeCompare(b.chord_name));
    });

    // Ordena os grupos pela posição canônica da nota raiz
    return Object.entries(groups).sort(([rootA], [rootB]) => {
      return getRootSortIndex(rootA) - getRootSortIndex(rootB);
    });
  }, [chords, chordSearch]);

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
        <div style={{ display: 'grid', gridTemplateColumns: isEditing ? '1fr 360px' : '1fr', gap: '1.5rem', alignItems: 'start' }}>
          {/* ── List Area ── */}
          <div className="glass-card" style={{ padding: '2rem' }}>
            
            {/* Header toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 900, margin: 0, color: 'var(--text-main)' }}>Dicionário de Acordes Customizados</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>Desenhe e gerencie dedilhados e pestanas para seus instrumentos.</p>
              </div>
              
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Busca */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Search size={14} style={{ position: 'absolute', left: '0.6rem', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    className="glass-input"
                    placeholder="Buscar acorde... (ex: C7, Dm)"
                    value={chordSearch}
                    onChange={e => setChordSearch(e.target.value)}
                    style={{ paddingLeft: '2rem', fontSize: '0.8rem', width: '200px' }}
                  />
                </div>

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
                  <button className="btn-primary" onClick={() => {
                    setIsEditing(true);
                    setEditingChordId(null);
                    setChordName('');
                    setVariations([
                      { variation_index: 0, frets: Array(stringsCount).fill(0), fingers: Array(stringsCount).fill(0), start_fret: 1 }
                    ]);
                    setActiveVarIdx(0);
                    setDeletedVariationIds([]);
                  }} style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Plus size={14} />
                    <span>Criar Acorde</span>
                  </button>
                )}
              </div>
            </div>

            {/* Chords Grid — grouped by root note */}
            {loading ? (
              <div style={{ padding: '3rem', textAlign: 'center' }}>Carregando acordes personalizados...</div>
            ) : chords.length === 0 ? (
              <div style={{ padding: '4rem', textAlign: 'center', border: '1px dashed var(--glass-border)', borderRadius: '16px' }}>
                <Music size={32} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem' }} />
                <h4 style={{ margin: 0 }}>Nenhum acorde customizado</h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.25rem 0 1.25rem 0' }}>O sistema exibirá os diagramas padrões. Crie um novo acorde se precisar de digitações específicas.</p>
                <button className="btn-primary" onClick={() => setIsEditing(true)} style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}>Cadastrar Primeiro Acorde</button>
              </div>
            ) : groupedChords.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Search size={28} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
                <p style={{ margin: 0, fontSize: '0.9rem' }}>Nenhum acorde encontrado para &quot;{chordSearch}&quot;</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                {groupedChords.map(([root, chordsInGroup]) => (
                  <div key={root}>
                    {/* Cabeçalho da nota raiz */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      marginBottom: '1rem'
                    }}>
                      <span style={{
                        fontSize: '1.1rem',
                        fontWeight: 900,
                        color: 'var(--primary)',
                        minWidth: '2rem',
                        letterSpacing: '-0.02em'
                      }}>{root}</span>
                      <div style={{ flex: 1, height: '1px', background: 'var(--glass-border)' }} />
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                        {chordsInGroup.length} acorde{chordsInGroup.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {/* Grid de acordes do grupo */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1.25rem' }}>
                      {chordsInGroup.map(c => (
                        <ChordCard
                          key={c.id}
                          chord={c}
                          stringsCount={stringsCount}
                          handleEditChord={handleEditChord}
                          handleDeleteChord={handleDeleteChord}
                        />
                      ))}
                    </div>
                  </div>
                ))}
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

                {/* Variações */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Variações do Acorde</label>
                  <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    {variations.map((v, idx) => (
                      <button
                        key={`var-tab-${idx}`}
                        type="button"
                        onClick={() => setActiveVarIdx(idx)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          background: activeVarIdx === idx ? 'var(--primary)' : 'rgba(255, 255, 255, 0.05)',
                          color: activeVarIdx === idx ? 'white' : 'var(--text-muted)',
                          border: '1px solid',
                          borderColor: activeVarIdx === idx ? 'var(--primary)' : 'var(--glass-border)',
                          fontSize: '0.75rem',
                          fontWeight: 'bold',
                          cursor: 'pointer'
                        }}
                      >
                        Var. {idx + 1}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={handleAddVariation}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        background: 'transparent',
                        color: 'var(--primary)',
                        border: '1px dashed var(--primary)',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px'
                      }}
                    >
                      <Plus size={10} /> Nova
                    </button>
                  </div>
                  {variations.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleDeleteVariation(activeVarIdx)}
                      style={{
                        alignSelf: 'flex-start',
                        padding: '2px 6px',
                        background: 'transparent',
                        color: 'var(--danger)',
                        border: 'none',
                        fontSize: '0.7rem',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        marginTop: '2px'
                      }}
                    >
                      Excluir Variação Atual
                    </button>
                  )}
                </div>

                <div className="input-group">
                  <label>Traste Inicial (Capa)</label>
                  <input
                    type="number"
                    min="1"
                    max="18"
                    value={variations[activeVarIdx]?.start_fret || 1}
                    onChange={e => updateActiveVarStartFret(e.target.value)}
                    required
                  />
                </div>

                {/* Seletores Corda a Corda */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'rgba(0,0,0,0.15)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                  {/* Live Preview */}
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
                    <ChordDiagram
                      name={chordName || '?'}
                      stringsCount={stringsCount}
                      frets={variations[activeVarIdx]?.frets || Array(stringsCount).fill(0)}
                      fingers={variations[activeVarIdx]?.fingers || Array(stringsCount).fill(0)}
                      startFret={variations[activeVarIdx]?.start_fret || 1}
                    />
                  </div>

                  <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '0.75rem' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>
                      Configuração por Corda:
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {Array.from({ length: stringsCount }).map((_, sIdx) => {
                        const activeVar = variations[activeVarIdx] || { frets: Array(stringsCount).fill(0), fingers: Array(stringsCount).fill(0), start_fret: 1 };
                        const fret = activeVar.frets[sIdx] !== undefined ? activeVar.frets[sIdx] : 0;
                        const finger = activeVar.fingers[sIdx] !== undefined ? activeVar.fingers[sIdx] : 0;

                        return (
                          <div key={`string-row-${sIdx}`} style={{ display: 'grid', gridTemplateColumns: '70px 1.2fr 1fr', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--text-main)' }}>
                              Corda {sIdx + 1}
                            </span>
                            
                            <select
                              className="select-filter"
                              value={fret}
                              onChange={(e) => updateActiveVarFret(sIdx, parseInt(e.target.value))}
                              style={{ padding: '3px 6px', fontSize: '0.7rem', width: '100%' }}
                            >
                              <option value="-1">X (Abafada)</option>
                              <option value="0">O (Solta)</option>
                              {Array.from({ length: 18 }).map((_, i) => (
                                <option key={`fret-opt-${i+1}`} value={i+1}>Casa {i+1}</option>
                              ))}
                            </select>

                            {fret > 0 ? (
                              <select
                                className="select-filter"
                                value={finger}
                                onChange={(e) => updateActiveVarFinger(sIdx, e.target.value)}
                                style={{ padding: '3px 6px', fontSize: '0.7rem', width: '100%' }}
                              >
                                <option value="0">Dedo: -</option>
                                <option value="1">Dedo 1</option>
                                <option value="2">Dedo 2</option>
                                <option value="3">Dedo 3</option>
                                <option value="4">Dedo 4</option>
                              </select>
                            ) : (
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center' }}>-</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
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
