import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  ChevronLeft, Plus, Trash2, CheckCircle2, Circle, 
  ListTodo, Save, X, Edit2, Check, Copy, Search,
  ChevronDown, ChevronRight, Layers
} from 'lucide-react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { confirmToast } from '../../lib/toast';
import { useEncryption } from '../../contexts/EncryptionContext';

export default function TripChecklists({ user, trip, onBack }) {
  const [checklists, setChecklists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [otherTrips, setOtherTrips] = useState([]);
  const [importSearch, setImportSearch] = useState('');
  const [editingTitleId, setEditingTitleId] = useState(null);
  const [tempTitle, setTempTitle] = useState('');
  const [isAddingList, setIsAddingList] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [addingItemToId, setAddingItemToId] = useState(null);
  const [newItemTask, setNewItemTask] = useState('');
  const [editingItemId, setEditingItemId] = useState(null);
  const [tempItemTask, setTempItemTask] = useState('');
  const [collapsedIds, setCollapsedIds] = useState(new Set());
  const { decryptObject, encryptData } = useEncryption();

  const fetchChecklists = useCallback(async () => {
    if (!trip?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('trip_checklists')
      .select(`
        *,
        items:trip_checklist_items(*)
      `)
      .eq('trip_id', trip.id)
      .order('created_at', { ascending: true });

    if (data) {
      const decrypted = await decryptObject(data, ['title', 'items.*.task']);
      const formatted = decrypted.map(c => ({
        ...c,
        items: (c.items || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      }));
      setChecklists(formatted);
    }
    setLoading(false);
  }, [trip?.id, decryptObject]);

  useEffect(() => {
    fetchChecklists();
  }, [trip?.id, fetchChecklists]);

  const handleAddChecklist = async () => {
    if (!trip?.id || !newListTitle.trim()) {
      setIsAddingList(false);
      return;
    }
    setLoading(true);

    const encryptedTitle = await encryptData(newListTitle.trim());

    const { data } = await supabase
      .from('trip_checklists')
      .insert({
        trip_id: trip.id,
        user_id: user.id,
        title: encryptedTitle
      })
      .select()
      .single();

    if (data) {
      setChecklists([...checklists, { ...data, title: newListTitle.trim(), items: [] }]);
      setNewListTitle('');
      setIsAddingList(false);
      toast.success('Lista criada');
    } else {
      toast.error('Erro ao criar lista');
    }
    setLoading(false);
  };

  const removeChecklist = async (id) => {
    confirmToast('Deseja excluir esta lista inteira?', async () => {
      const { error } = await supabase
        .from('trip_checklists')
        .delete()
        .eq('id', id);

      if (!error) {
        setChecklists(checklists.filter(c => c.id !== id));
        toast.success('Lista removida');
      } else {
        toast.error('Erro ao remover lista');
      }
    }, { danger: true });
  };

  const handleAddItem = async (checklistId) => {
    if (!newItemTask.trim()) {
      setAddingItemToId(null);
      return;
    }

    const encryptedTask = await encryptData(newItemTask.trim());

    const { data } = await supabase
      .from('trip_checklist_items')
      .insert({
        checklist_id: checklistId,
        task: encryptedTask,
        completed: false
      })
      .select()
      .single();

    if (data) {
      setChecklists(checklists.map(c => {
        if (c.id === checklistId) {
          return { ...c, items: [...c.items, { ...data, task: newItemTask.trim() }] };
        }
        return c;
      }));
      setNewItemTask('');
      setAddingItemToId(null);
    } else {
      toast.error('Erro ao adicionar item');
    }
  };

  const toggleItem = async (checklistId, item) => {
    const { error } = await supabase
      .from('trip_checklist_items')
      .update({ completed: !item.completed })
      .eq('id', item.id);

    if (!error) {
      setChecklists(checklists.map(c => {
        if (c.id === checklistId) {
          return {
            ...c,
            items: c.items.map(i => 
              i.id === item.id ? { ...i, completed: !item.completed } : i
            )
          };
        }
        return c;
      }));
    }
  };

  const removeItem = async (checklistId, itemId) => {
    const { error } = await supabase
      .from('trip_checklist_items')
      .delete()
      .eq('id', itemId);

    if (!error) {
      setChecklists(checklists.map(c => {
        if (c.id === checklistId) {
          return {
            ...c,
            items: c.items.filter(i => i.id !== itemId)
          };
        }
        return c;
      }));
    }
  };

  const startEditingTitle = (checklist) => {
    setEditingTitleId(checklist.id);
    setTempTitle(checklist.title);
  };

  const startEditingItem = (item) => {
    setEditingItemId(item.id);
    setTempItemTask(item.task);
  };

  const saveItem = async (checklistId, item) => {
    if (!tempItemTask.trim() || tempItemTask === item.task) {
      setEditingItemId(null);
      return;
    }

    const encryptedTask = await encryptData(tempItemTask.trim());

    const { error } = await supabase
      .from('trip_checklist_items')
      .update({ task: encryptedTask })
      .eq('id', item.id);

    if (!error) {
      setChecklists(checklists.map(c => {
        if (c.id === checklistId) {
          return {
            ...c,
            items: c.items.map(i => i.id === item.id ? { ...i, task: tempItemTask.trim() } : i)
          };
        }
        return c;
      }));
      toast.success('Item atualizado');
    } else {
      toast.error('Erro ao atualizar item');
    }
    setEditingItemId(null);
  };

  const toggleCollapse = (id) => {
    const newCollapsed = new Set(collapsedIds);
    if (newCollapsed.has(id)) {
      newCollapsed.delete(id);
    } else {
      newCollapsed.add(id);
    }
    setCollapsedIds(newCollapsed);
  };

  const saveTitle = async (id) => {
    if (!tempTitle.trim()) return setEditingTitleId(null);

    const encryptedTitle = await encryptData(tempTitle.trim());

    const { error } = await supabase
      .from('trip_checklists')
      .update({ title: encryptedTitle })
      .eq('id', id);

    if (!error) {
      setChecklists(checklists.map(c => c.id === id ? { ...c, title: tempTitle } : c));
    }
    setEditingTitleId(null);
  };

  const openImportModal = async () => {
    setIsImportModalOpen(true);
    const { data } = await supabase
      .from('trips')
      .select('id, title')
      .neq('id', trip.id)
      .order('created_at', { ascending: false });
    
    if (data) {
      // For each trip, check if it has checklists
      const tripsWithChecklists = [];
      for (const t of data) {
        const { count } = await supabase
          .from('trip_checklists')
          .select('*', { count: 'exact', head: true })
          .eq('trip_id', t.id);
        
        if (count > 0) {
          // Fetch the checklists titles for the modal
          const { data: cData } = await supabase
            .from('trip_checklists')
            .select('id, title')
            .eq('trip_id', t.id);
          
          const decryptedChecklists = await decryptObject(cData || [], ['title']);
          tripsWithChecklists.push({ ...t, checklists: decryptedChecklists });
        }
      }
      const decryptedTrips = await decryptObject(tripsWithChecklists, ['title']);
      setOtherTrips(decryptedTrips);
    }
  };

  const importChecklist = async (otherChecklistId) => {
    if (!trip?.id) return;
    // Fetch original checklist items
    const { data: originalItems } = await supabase
      .from('trip_checklist_items')
      .select('*')
      .eq('checklist_id', otherChecklistId);

    const { data: originalChecklistEnc } = await supabase
      .from('trip_checklists')
      .select('title')
      .eq('id', otherChecklistId)
      .single();

    if (!originalChecklistEnc) return;
    const decrypted = await decryptObject(originalChecklistEnc, ['title']);
    const originalChecklist = Array.isArray(decrypted) ? decrypted[0] : decrypted;

    if (!originalChecklist || !originalChecklist.title) {
      toast.error('Erro ao ler título original');
      return;
    }

    // Create new checklist
    const { data: newChecklist } = await supabase
      .from('trip_checklists')
      .insert({
        trip_id: trip.id,
        user_id: user.id,
        title: `${originalChecklist.title} (Importado)`
      })
      .select()
      .single();

    if (newChecklist && originalItems && originalItems.length > 0) {
      // We can just copy the encrypted tasks since they use the same master key
      const itemsToInsert = originalItems.map(item => ({
        checklist_id: newChecklist.id,
        task: item.task,
        completed: false
      }));

      const { data: newItems } = await supabase
        .from('trip_checklist_items')
        .insert(itemsToInsert)
        .select();

      const decryptedItems = await decryptObject(newItems || [], ['task']);
      setChecklists([...checklists, { ...newChecklist, title: `${originalChecklist.title} (Importado)`, items: decryptedItems }]);
    } else if (newChecklist) {
      setChecklists([...checklists, { ...newChecklist, title: `${originalChecklist.title} (Importado)`, items: [] }]);
    }
    
    setIsImportModalOpen(false);
  };

  if (!trip) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <p>Carregando informações da viagem...</p>
        <button onClick={onBack} className="btn-cancel" style={{ marginTop: '1rem' }}>Voltar</button>
      </div>
    );
  }

  return (
    <div className="fade-in" style={{ paddingBottom: '5rem' }}>
      {/* Header */}
      <div className="checklists-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={onBack} className="icon-btn" style={{ padding: '0.5rem' }}>
            <ChevronLeft size={24} />
          </button>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '800' }}>Checklists de Viagem</h2>
            {trip && <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.875rem' }}>{trip.title}</p>}
          </div>
        </div>
        <div className="header-actions" style={{ display: 'flex', gap: '0.75rem' }}>
          <button 
            onClick={() => {
              if (collapsedIds.size === checklists.length) {
                setCollapsedIds(new Set());
              } else {
                setCollapsedIds(new Set(checklists.map(c => c.id)));
              }
            }}
            className="btn"
            style={{ 
              background: 'rgba(255,255,255,0.05)', 
              color: 'white', 
              padding: '0.6rem 1rem', 
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.85rem',
              border: '1px solid var(--glass-border)'
            }}
          >
            {collapsedIds.size === checklists.length ? <ChevronDown size={18} /> : <Layers size={18} />}
            <span className="btn-text">{collapsedIds.size === checklists.length ? 'Expandir' : 'Recolher'}</span>
          </button>
          <button 
            onClick={openImportModal}
            className="btn" 
            style={{ 
              background: 'rgba(255,255,255,0.05)', 
              color: 'white', 
              padding: '0.6rem 1.2rem', 
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.9rem',
              border: '1px solid var(--glass-border)'
            }}
          >
            <Copy size={18} /> <span className="btn-text">Importar</span>
          </button>
          <button 
            onClick={() => setIsAddingList(true)}
            className="btn-primary" 
            style={{ padding: '0.6rem 1.2rem', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Plus size={20} /> <span className="btn-text">Nova Lista</span>
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {isAddingList && (
          <Motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="glass-card" 
            style={{ 
              padding: '1.5rem', 
              border: '2px solid var(--primary)', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '1rem',
              marginBottom: '2rem'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>Nome da nova lista</h3>
              <button onClick={() => setIsAddingList(false)} className="icon-btn"><X size={18} /></button>
            </div>
            <input 
              autoFocus
              type="text" 
              value={newListTitle}
              onChange={e => setNewListTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddChecklist()}
              placeholder="Ex: Documentos, Mala de Mão..."
              className="glass-input"
            />
            <button onClick={handleAddChecklist} className="btn-primary" style={{ width: '100%' }}>
              <Plus size={18} /> Criar Lista
            </button>
          </Motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>Carregando listas...</div>
      ) : checklists.length === 0 ? (
        <div className="glass-card" style={{ padding: '4rem 2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '1.5rem', background: 'rgba(99,102,241,0.1)', borderRadius: '50%', color: 'var(--primary)' }}>
            <ListTodo size={48} />
          </div>
          <h3>Nenhum checklist criado</h3>
          <p style={{ color: 'var(--text-muted)', maxWidth: '300px' }}>
            Crie listas de tarefas para organizar sua viagem ou importe de viagens anteriores.
          </p>
          <button onClick={() => setIsAddingList(true)} className="btn-primary" style={{ marginTop: '1rem' }}>
            Começar agora
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>

          {checklists.map(checklist => (
            <Motion.div 
              layout="position"
              key={checklist.id} 
              className="glass-card" 
              style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', alignSelf: 'flex-start' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                  <button 
                    onClick={() => toggleCollapse(checklist.id)} 
                    data-testid={`checklist-toggle-${checklist.id}`}
                    className="icon-btn" 
                    style={{ padding: '4px', opacity: 0.5 }}
                  >
                    {collapsedIds.has(checklist.id) ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                  </button>

                  {editingTitleId === checklist.id ? (
                    <div style={{ display: 'flex', gap: '0.5rem', flex: 1 }}>
                      <input 
                        autoFocus
                        type="text" 
                        value={tempTitle}
                        onChange={e => setTempTitle(e.target.value)}
                        onBlur={() => saveTitle(checklist.id)}
                        onKeyDown={e => e.key === 'Enter' && saveTitle(checklist.id)}
                        className="glass-input"
                        style={{ padding: '0.2rem 0.5rem', fontSize: '1rem', width: '100%' }}
                      />
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                      <h3 
                        style={{ margin: 0, fontSize: '1.15rem', color: 'var(--primary)', cursor: 'pointer' }}
                        onClick={() => toggleCollapse(checklist.id)}
                      >
                        {checklist.title}
                      </h3>
                      <button onClick={() => startEditingTitle(checklist)} className="icon-btn" style={{ padding: '4px', opacity: 0.3 }}><Edit2 size={12} /></button>
                    </div>
                  )}
                </div>
                
                <button onClick={() => removeChecklist(checklist.id)} className="icon-btn" style={{ color: 'var(--danger)', opacity: 0.5 }}>
                  <Trash2 size={16} />
                </button>
              </div>

              {!collapsedIds.has(checklist.id) && (
                <Motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <AnimatePresence>
                      {checklist.items.map(item => (
                        <Motion.div 
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          key={item.id} 
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.75rem', 
                            padding: '0.5rem', 
                            background: 'rgba(255,255,255,0.02)', 
                            borderRadius: '8px'
                          }}
                          className="checklist-item-row"
                        >
                          <button 
                            onClick={() => toggleItem(checklist.id, item)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: item.completed ? 'var(--success)' : 'var(--text-muted)' }}
                          >
                            {item.completed ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                          </button>

                          {editingItemId === item.id ? (
                            <input 
                              autoFocus
                              type="text"
                              value={tempItemTask}
                              onChange={e => setTempItemTask(e.target.value)}
                              onBlur={() => saveItem(checklist.id, item)}
                              onKeyDown={e => e.key === 'Enter' && saveItem(checklist.id, item)}
                              data-testid={`edit-item-input-${item.id}`}
                              className="glass-input"
                              style={{ flex: 1, fontSize: '0.9rem', padding: '0.2rem 0.5rem' }}
                            />
                          ) : (
                            <span 
                              data-testid={`checklist-item-task-${item.id}`}
                              style={{ 
                                flex: 1, 
                                fontSize: '0.95rem', 
                                textDecoration: item.completed ? 'line-through' : 'none',
                                opacity: item.completed ? 0.5 : 1,
                                cursor: 'pointer'
                              }}
                              onClick={() => !item.completed && startEditingItem(item)}
                            >
                              {item.task}
                            </span>
                          )}

                          <div style={{ display: 'flex', gap: '0.25rem' }}>
                            {editingItemId !== item.id && (
                              <>
                                <button 
                                  onClick={() => startEditingItem(item)} 
                                  className="icon-btn edit-item-btn" 
                                  style={{ padding: '4px', transition: '0.2s' }}
                                  title="Editar item"
                                >
                                  <Edit2 size={12} />
                                </button>
                                <button 
                                  onClick={() => removeItem(checklist.id, item.id)} 
                                  className="icon-btn delete-item-btn" 
                                  style={{ padding: '4px', transition: '0.2s', color: 'var(--danger)' }}
                                  title="Remover item"
                                >
                                  <X size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        </Motion.div>
                      ))}
                    </AnimatePresence>
                  </div>

                  {addingItemToId === checklist.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <input 
                        autoFocus
                        type="text" 
                        value={newItemTask}
                        onChange={e => setNewItemTask(e.target.value)}
                        onBlur={() => !newItemTask.trim() && setAddingItemToId(null)}
                        onKeyDown={e => e.key === 'Enter' && handleAddItem(checklist.id)}
                        placeholder="O que precisa ser feito?"
                        className="glass-input"
                        style={{ fontSize: '0.9rem', padding: '0.6rem' }}
                      />
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => handleAddItem(checklist.id)} className="btn-primary" style={{ flex: 1, padding: '0.5rem', fontSize: '0.8rem' }}>Adicionar</button>
                        <button onClick={() => setAddingItemToId(null)} className="btn-cancel" style={{ padding: '0.5rem', fontSize: '0.8rem' }}>Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setAddingItemToId(checklist.id)}
                      style={{ 
                        marginTop: '0.5rem',
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px dashed var(--glass-border)',
                        background: 'transparent',
                        borderRadius: '10px',
                        color: 'var(--text-muted)',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        transition: '0.2s'
                      }}
                      className="add-item-btn"
                    >
                      <Plus size={16} /> Adicionar item
                    </button>
                  )}
                </Motion.div>
              )}
            </Motion.div>
          ))}
        </div>
      )}

      {/* Import Modal */}
      <AnimatePresence>
        {isImportModalOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <Motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card" 
              style={{ width: '100%', maxWidth: '500px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}
            >
              <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Importar de outras viagens</h3>
                <button onClick={() => setIsImportModalOpen(false)} className="icon-btn"><X size={20} /></button>
              </div>
              
              <div style={{ padding: '1rem' }}>
                <div style={{ position: 'relative', marginBottom: '1rem' }}>
                  <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
                  <input 
                    type="text" 
                    placeholder="Pesquisar viagem..." 
                    className="glass-input" 
                    style={{ width: '100%', paddingLeft: '2.8rem' }}
                    value={importSearch}
                    onChange={(e) => setImportSearch(e.target.value)}
                  />
                </div>

                <div style={{ overflowY: 'auto', maxHeight: '400px', display: 'flex', flexDirection: 'column', gap: '1rem' }} className="custom-scrollbar">
                  {otherTrips
                    .filter(t => t.title.toLowerCase().includes(importSearch.toLowerCase()))
                    .map(t => (
                      <div key={t.id} style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px' }}>
                        <p style={{ margin: '0 0 0.75rem 0', fontWeight: '700', fontSize: '0.9rem', color: 'var(--primary)' }}>{t.title}</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                          {t.checklists.map(c => (
                            <button 
                              key={c.id}
                              onClick={() => importChecklist(c.id)}
                              className="glass-card"
                              style={{ 
                                padding: '0.4rem 0.8rem', 
                                fontSize: '0.75rem', 
                                border: '1px solid rgba(99,102,241,0.2)',
                                cursor: 'pointer',
                                transition: '0.2s',
                                background: 'rgba(255,255,255,0.03)'
                              }}
                              onMouseOver={(e) => e.currentTarget.style.background = 'rgba(99,102,241,0.1)'}
                              onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <Copy size={12} /> {c.title}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  {otherTrips.length === 0 && (
                    <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>Nenhuma outra viagem com checklists encontrada.</p>
                  )}
                </div>
              </div>
            </Motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .checklist-item-row:hover .delete-item-btn,
        .checklist-item-row:hover .edit-item-btn {
          opacity: 0.5 !important;
        }
        .add-item-btn:hover {
          border-color: var(--primary) !important;
          color: var(--primary) !important;
          background: rgba(99, 102, 241, 0.05) !important;
        }

        @media (max-width: 640px) {
          .checklists-header {
            flex-direction: column;
            align-items: flex-start !important;
            gap: 1.5rem !important;
          }
          .header-actions {
            width: 100%;
          }
          .header-actions .btn, 
          .header-actions .btn-primary {
            flex: 1;
            justify-content: center;
          }
          .btn-text {
            display: none;
          }
          .header-actions .btn, 
          .header-actions .btn-primary {
            padding: 0.6rem !important;
            min-width: 44px;
            justify-content: center;
          }
          .edit-item-btn, .delete-item-btn {
            opacity: 1 !important;
          }
        }
      `}</style>
    </div>
  );
}
