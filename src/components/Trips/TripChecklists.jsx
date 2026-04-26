import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  ChevronLeft, Plus, Trash2, CheckCircle2, Circle, 
  Copy, ListTodo, Search, AlertCircle, Save, X, Edit2, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { confirmToast } from '../../lib/toast';

export default function TripChecklists({ user, trip, onBack, onSave }) {
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

  useEffect(() => {
    fetchChecklists();
  }, [trip?.id]);

  async function fetchChecklists() {
    setLoading(true);
    const { data, error } = await supabase
      .from('trip_checklists')
      .select(`
        *,
        items:trip_checklist_items(*)
      `)
      .eq('trip_id', trip.id)
      .order('created_at', { ascending: true });

    if (data) {
      // Sort items by created_at inside each checklist
      const formatted = data.map(c => ({
        ...c,
        items: (c.items || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      }));
      setChecklists(formatted);
    }
    setLoading(false);
  }

  const handleAddChecklist = async () => {
    if (!newListTitle.trim()) {
      setIsAddingList(false);
      return;
    }
    setLoading(true);

    const { data, error } = await supabase
      .from('trip_checklists')
      .insert({
        trip_id: trip.id,
        user_id: user.id,
        title: newListTitle.trim()
      })
      .select()
      .single();

    if (data) {
      setChecklists([...checklists, { ...data, items: [] }]);
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

    const { data, error } = await supabase
      .from('trip_checklist_items')
      .insert({
        checklist_id: checklistId,
        task: newItemTask.trim(),
        completed: false
      })
      .select()
      .single();

    if (data) {
      setChecklists(checklists.map(c => {
        if (c.id === checklistId) {
          return { ...c, items: [...c.items, data] };
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

  const saveTitle = async (id) => {
    if (!tempTitle.trim()) return setEditingTitleId(null);

    const { error } = await supabase
      .from('trip_checklists')
      .update({ title: tempTitle })
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
          
          tripsWithChecklists.push({ ...t, checklists: cData || [] });
        }
      }
      setOtherTrips(tripsWithChecklists);
    }
  };

  const importChecklist = async (otherChecklistId) => {
    // Fetch original checklist items
    const { data: originalItems } = await supabase
      .from('trip_checklist_items')
      .select('*')
      .eq('checklist_id', otherChecklistId);

    const { data: originalChecklist } = await supabase
      .from('trip_checklists')
      .select('title')
      .eq('id', otherChecklistId)
      .single();

    if (!originalChecklist) return;

    // Create new checklist
    const { data: newChecklist, error: cError } = await supabase
      .from('trip_checklists')
      .insert({
        trip_id: trip.id,
        user_id: user.id,
        title: `${originalChecklist.title} (Importado)`
      })
      .select()
      .single();

    if (newChecklist && originalItems && originalItems.length > 0) {
      // Insert items
      const itemsToInsert = originalItems.map(item => ({
        checklist_id: newChecklist.id,
        task: item.task,
        completed: false
      }));

      const { data: newItems } = await supabase
        .from('trip_checklist_items')
        .insert(itemsToInsert)
        .select();

      setChecklists([...checklists, { ...newChecklist, items: newItems || [] }]);
    } else if (newChecklist) {
      setChecklists([...checklists, { ...newChecklist, items: [] }]);
    }
    
    setIsImportModalOpen(false);
  };

  return (
    <div className="fade-in" style={{ paddingBottom: '5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={onBack} className="icon-btn" style={{ padding: '0.5rem' }}>
            <ChevronLeft size={24} />
          </button>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '800' }}>Checklists</h2>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.875rem' }}>{trip.title}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
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
            <Copy size={18} /> Importar
          </button>
          <button 
            onClick={() => setIsAddingList(true)}
            className="btn-primary" 
            style={{ padding: '0.6rem 1.2rem', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Plus size={20} /> Nova Lista
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {isAddingList && (
          <motion.div 
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
          </motion.div>
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
            <motion.div 
              layout
              key={checklist.id} 
              className="glass-card" 
              style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', alignSelf: 'flex-start' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
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
                    <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--primary)' }}>{checklist.title}</h3>
                    <button onClick={() => startEditingTitle(checklist)} className="icon-btn" style={{ padding: '4px', opacity: 0.3 }}><Edit2 size={12} /></button>
                  </div>
                )}
                
                <button onClick={() => removeChecklist(checklist.id)} className="icon-btn" style={{ color: 'var(--danger)', opacity: 0.5 }}>
                  <Trash2 size={16} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <AnimatePresence>
                  {checklist.items.map(item => (
                    <motion.div 
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
                      <span style={{ 
                        flex: 1, 
                        fontSize: '0.95rem', 
                        textDecoration: item.completed ? 'line-through' : 'none',
                        opacity: item.completed ? 0.5 : 1
                      }}>
                        {item.task}
                      </span>
                      <button 
                        onClick={() => removeItem(checklist.id, item.id)} 
                        className="icon-btn delete-item-btn" 
                        style={{ padding: '4px', opacity: 0, transition: '0.2s' }}
                      >
                        <X size={14} />
                      </button>
                    </motion.div>
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
                    <button onClick={() => setAddingItemToId(null)} className="btn-secondary" style={{ padding: '0.5rem', fontSize: '0.8rem' }}>Cancelar</button>
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
            </motion.div>
          ))}
        </div>
      )}

      {/* Import Modal */}
      <AnimatePresence>
        {isImportModalOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <motion.div 
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
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .checklist-item-row:hover .delete-item-btn {
          opacity: 0.5 !important;
        }
        .add-item-btn:hover {
          border-color: var(--primary) !important;
          color: var(--primary) !important;
          background: rgba(99, 102, 241, 0.05) !important;
        }
      `}</style>
    </div>
  );
}
