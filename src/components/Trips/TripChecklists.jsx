import React, { useState } from 'react';
import { 
  ChevronLeft, Plus, Trash2, CheckCircle, Circle, 
  ListTodo, Save, X, Edit2, Check, Copy, Search,
  ChevronDown, ChevronRight, Layers, LayoutGrid,
  ClipboardList
} from 'lucide-react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { confirmToast } from '../../lib/toast';
import { useTranslation } from 'react-i18next';
import {
  useOfflineChecklists,
  useOfflineCreateChecklist,
  useOfflineUpdateChecklist,
  useOfflineDeleteChecklist,
  useOfflineCreateChecklistItem,
  useOfflineUpdateChecklistItem,
  useOfflineDeleteChecklistItem,
  useOfflineTrips
} from '../../hooks/useOfflineTrips';

export default function TripChecklists({ user, trip, onBack }) {
  const { t } = useTranslation();
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

  const { data: checklists = [], isLoading: loading } = useOfflineChecklists(trip?.id);
  const { data: allTrips = [] } = useOfflineTrips(user?.id);

  const createChecklistMutation = useOfflineCreateChecklist(user.id, trip.id);
  const updateChecklistMutation = useOfflineUpdateChecklist(user.id, trip.id);
  const deleteChecklistMutation = useOfflineDeleteChecklist(user.id, trip.id);
  
  const createChecklistItemMutation = useOfflineCreateChecklistItem(user.id, trip.id);
  const updateChecklistItemMutation = useOfflineUpdateChecklistItem(user.id, trip.id);
  const deleteChecklistItemMutation = useOfflineDeleteChecklistItem(user.id, trip.id);

  const handleAddChecklist = async () => {
    if (!trip?.id || !newListTitle.trim()) {
      setIsAddingList(false);
      return;
    }

    try {
      await createChecklistMutation.mutateAsync({
        title: newListTitle.trim()
      });
      setNewListTitle('');
      setIsAddingList(false);
      toast.success(t('trips.success.list_created', 'Lista criada'));
    } catch (err) {
      console.error(err);
      toast.error(t('trips.error_creating_list', 'Erro ao criar lista'));
    }
  };

  const removeChecklist = async (id) => {
    confirmToast(t('trips.confirm.delete_list', 'Deseja excluir esta lista inteira?'), async () => {
      try {
        await deleteChecklistMutation.mutateAsync(id);
        toast.success(t('trips.success.list_deleted', 'Lista removida'));
      } catch (err) {
        console.error(err);
        toast.error(t('trips.error_removing_list', 'Erro ao remover lista'));
      }
    }, { danger: true });
  };

  const handleAddItem = async (checklistId) => {
    if (!newItemTask.trim()) {
      setAddingItemToId(null);
      return;
    }

    try {
      await createChecklistItemMutation.mutateAsync({
        checklist_id: checklistId,
        task: newItemTask.trim(),
        completed: false
      });
      setNewItemTask('');
      setAddingItemToId(null);
    } catch (err) {
      console.error(err);
      toast.error(t('trips.error_adding_item', 'Erro ao adicionar item'));
    }
  };

  const toggleItem = async (checklistId, item) => {
    try {
      await updateChecklistItemMutation.mutateAsync({
        id: item.id,
        completed: !item.completed
      });
    } catch (err) {
      console.error(err);
    }
  };

  const removeItem = async (checklistId, itemId) => {
    try {
      await deleteChecklistItemMutation.mutateAsync(itemId);
    } catch (err) {
      console.error(err);
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

    try {
      await updateChecklistItemMutation.mutateAsync({
        id: item.id,
        task: tempItemTask.trim()
      });
      toast.success(t('trips.success.item_updated', 'Item atualizado'));
    } catch (err) {
      console.error(err);
      toast.error(t('trips.error_updating_item', 'Erro ao atualizar item'));
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

    try {
      await updateChecklistMutation.mutateAsync({
        id,
        title: tempTitle.trim()
      });
    } catch (err) {
      console.error(err);
    }
    setEditingTitleId(null);
  };

  const openImportModal = async () => {
    setIsImportModalOpen(true);
    const otherTripsList = allTrips.filter(t => t.id !== trip.id);
    const tripsWithChecklists = [];
    for (const t of otherTripsList) {
      const dbModule = await import('../../lib/offline/db');
      const checklistsForTrip = await dbModule.getTripChecklistsFromDexie(t.id);
      if (checklistsForTrip.length > 0) {
        tripsWithChecklists.push({ ...t, checklists: checklistsForTrip });
      }
    }
    setOtherTrips(tripsWithChecklists);
  };

  const importChecklist = async (otherChecklistId) => {
    if (!trip?.id) return;
    try {
      const dbModule = await import('../../lib/offline/db');
      const originalChecklist = await dbModule.db.trip_checklists.get(otherChecklistId);
      if (!originalChecklist || !originalChecklist.title) {
        toast.error(t('trips.checklist_import_error'));
        return;
      }

      const originalItems = await dbModule.getTripChecklistItemsFromDexie(otherChecklistId);

      const newChecklist = await createChecklistMutation.mutateAsync({
        title: `${originalChecklist.title} ${t('trips.checklist_imported_suffix')}`
      });

      if (newChecklist && originalItems && originalItems.length > 0) {
        for (const item of originalItems) {
          await createChecklistItemMutation.mutateAsync({
            checklist_id: newChecklist.id,
            task: item.task,
            completed: false
          });
        }
      }
      
      setIsImportModalOpen(false);
      toast.success(t('trips.success.list_imported', 'Lista importada com sucesso'));
    } catch (err) {
      console.error(err);
      toast.error(t('trips.checklist_import_error'));
    }
  };

  if (!trip) {
    return (
      <div style={{ padding: '5rem 2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <Motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}>
          <LayoutGrid size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
        </Motion.div>
        <p>{t('trips.loading_trip_info', 'Carregando informações da viagem...')}</p>
        <button onClick={onBack} className="btn-cancel" style={{ marginTop: '1.5rem' }}>{t('common.back', 'Voltar')}</button>
      </div>
    );
  }

  return (
    <div className="fade-in" style={{ paddingBottom: '5rem' }}>
      {/* Header Premium */}
      <div className="checklists-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2.5rem', gap: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <button onClick={onBack} className="action-btn" style={{ width: '44px', height: '44px' }}>
            <ChevronLeft size={24} />
          </button>
          <div>
            <h2 data-testid="checklists-title" style={{ margin: 0, fontSize: '1.75rem', fontWeight: '900', color: 'var(--text-main)', letterSpacing: '-0.02em' }}>{t('trips.checklists_title')}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)', fontWeight: '700', fontSize: '0.85rem' }}>
              <ClipboardList size={14} />
              {trip.title}
            </div>
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
              padding: '0.75rem 1.25rem', 
              borderRadius: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              fontSize: '0.85rem',
              fontWeight: '800',
              border: '1px solid var(--glass-border)',
              transition: '0.3s'
            }}
          >
            {collapsedIds.size === checklists.length ? <ChevronDown size={18} /> : <Layers size={18} />}
            <span className="btn-text">{collapsedIds.size === checklists.length ? t('common.expand', 'EXPANDIR') : t('common.collapse', 'RECOLHER')}</span>
          </button>
          <button 
            data-testid="import-checklist-btn"
            onClick={openImportModal}
            className="btn" 
            style={{ 
              background: 'rgba(255,255,255,0.05)', 
              color: 'white', 
              padding: '0.75rem 1.25rem', 
              borderRadius: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              fontSize: '0.85rem',
              fontWeight: '800',
              border: '1px solid var(--glass-border)',
              transition: '0.3s'
            }}
          >
            <Copy size={18} /> <span className="btn-text">{t('common.import', 'IMPORTAR')}</span>
          </button>
          <button 
            onClick={() => setIsAddingList(true)}
            className="btn" 
            style={{ 
              background: 'var(--primary)', 
              color: 'white', 
              padding: '0.75rem 1.25rem', 
              borderRadius: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              fontSize: '0.85rem',
              fontWeight: '900',
              border: 'none',
              boxShadow: '0 8px 16px -4px rgba(99, 102, 241, 0.4)'
            }}
            data-testid="btn-add-checklist"
          >
            <Plus size={20} /> <span className="btn-text">{t('trips.new_list', 'NOVA LISTA')}</span>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isAddingList && (
          <Motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="glass-card" 
            style={{ 
              padding: '2rem', 
              border: '2px solid var(--primary)', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '1.25rem',
              marginBottom: '2.5rem',
              background: 'rgba(99, 102, 241, 0.05)',
              boxShadow: '0 20px 40px -12px rgba(0,0,0,0.5)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '900' }}>{t('trips.list_name_question', 'Como se chamará sua lista?')}</h3>
              <button onClick={() => setIsAddingList(false)} className="action-btn"><X size={20} /></button>
            </div>
            <input 
              autoFocus
              type="text" 
              value={newListTitle}
              onChange={e => setNewListTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddChecklist()}
              placeholder={t('trips.list_name_placeholder', 'Ex: Documentos, Mala de Mão...')}
              className="glass-input"
              style={{ fontSize: '1.1rem', padding: '1rem' }}
            />
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button data-testid="create-list-btn" onClick={handleAddChecklist} className="btn-primary" style={{ flex: 1, padding: '1rem', borderRadius: '14px', fontWeight: '900' }}>
                {t('common.create_list', 'CRIAR LISTA')}
              </button>
              <button data-testid="cancel-create-list-btn" onClick={() => setIsAddingList(false)} className="btn-cancel" style={{ padding: '1rem 1.5rem', borderRadius: '14px' }}>
                {t('common.cancel', 'CANCELAR')}
              </button>
            </div>
          </Motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div style={{ padding: '6rem', textAlign: 'center' }}>
          <Motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}>
            <ListTodo size={64} style={{ opacity: 0.1, color: 'var(--primary)' }} />
          </Motion.div>
          <p style={{ color: 'var(--text-muted)', marginTop: '1rem', fontWeight: '600' }}>{t('trips.syncing_data', 'Sincronizando suas listas...')}</p>
        </div>
      ) : checklists.length === 0 ? (
        <Motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card" 
          style={{ 
            padding: '5rem 2rem', 
            textAlign: 'center', 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            gap: '1.5rem',
            background: 'rgba(15, 23, 42, 0.2)',
            border: '1px dashed var(--glass-border)',
            borderRadius: '32px'
          }}
        >
          <div style={{ padding: '2rem', background: 'rgba(99,102,241,0.1)', borderRadius: '30px', color: 'var(--primary)' }}>
            <ListTodo size={64} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '900' }}>{t('trips.empty_state_title')}</h3>
            <p style={{ color: 'var(--text-muted)', maxWidth: '400px', margin: '0.75rem auto 0', lineHeight: '1.6', fontSize: '1rem' }}>
              {t('trips.empty_state_desc')}
            </p>
          </div>
          <button onClick={() => setIsAddingList(true)} className="btn-primary" style={{ padding: '1rem 2rem', borderRadius: '16px', fontWeight: '900', boxShadow: '0 10px 20px -5px rgba(99, 102, 241, 0.4)' }}>
            <Plus size={20} /> {t('trips.start_checklist', 'COMEÇAR CHECKLIST')}
          </button>
        </Motion.div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.75rem' }}>
          <AnimatePresence mode="popLayout">
            {checklists.map(checklist => {
              const completedCount = checklist.items.filter(i => i.completed).length;
              const totalCount = checklist.items.length;
              const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

              return (
                <Motion.div 
                   initial={{ opacity: 0, scale: 0.95 }}
                   animate={{ opacity: 1, scale: 1 }}
                   exit={{ opacity: 0, scale: 0.95 }}
                   key={checklist.id} 
                   className="glass-card" 
                   style={{ 
                     padding: '1.75rem', 
                     display: 'flex', 
                     flexDirection: 'column', 
                     gap: '1.25rem', 
                     alignSelf: 'flex-start',
                     border: progress === 100 && totalCount > 0 ? '1px solid var(--success)' : '1px solid var(--glass-border)',
                     background: progress === 100 && totalCount > 0 ? 'rgba(16, 185, 129, 0.05)' : 'rgba(15, 23, 42, 0.3)',
                     transition: 'border-color 0.3s, background 0.3s'
                   }}
                 >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                      <button 
                        onClick={() => toggleCollapse(checklist.id)} 
                        className="action-btn" 
                        style={{ padding: '6px', width: '32px', height: '32px', flexShrink: 0 }}
                      >
                      <Motion.div 
                        animate={{ rotate: collapsedIds.has(checklist.id) ? 0 : 90 }}
                        transition={{ duration: 0.2 }}
                        style={{ display: 'flex' }}
                      >
                        <ChevronRight size={18} />
                      </Motion.div>
                    </button>

                    {editingTitleId === checklist.id ? (
                      <input 
                        autoFocus
                        type="text" 
                        value={tempTitle}
                        onChange={e => setTempTitle(e.target.value)}
                        onBlur={() => saveTitle(checklist.id)}
                        onKeyDown={e => e.key === 'Enter' && saveTitle(checklist.id)}
                        className="glass-input"
                        style={{ padding: '0.4rem 0.75rem', fontSize: '1.1rem', width: '100%', fontWeight: '900' }}
                      />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                        <h3 
                          data-testid={'checklist-title-' + checklist.id}
                          style={{ 
                            margin: 0, 
                            fontSize: '1.25rem', 
                            fontWeight: '900',
                            color: progress === 100 && totalCount > 0 ? 'var(--success)' : 'var(--text-main)', 
                            cursor: 'pointer',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                          onClick={() => toggleCollapse(checklist.id)}
                        >
                          {checklist.title}
                        </h3>
                        <button onClick={() => startEditingTitle(checklist)} className="icon-btn" style={{ opacity: 0.3 }}><Edit2 size={14} /></button>
                      </div>
                    )}
                  </div>
                  
                  <button onClick={() => removeChecklist(checklist.id)} className="action-btn danger" style={{ width: '32px', height: '32px', flexShrink: 0 }}>
                    <Trash2 size={16} />
                  </button>
                </div>

                {/* Progress Bar Premium */}
                <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', overflow: 'hidden', position: 'relative' }}>
                  <Motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    style={{ 
                      height: '100%', 
                      background: progress === 100 ? 'var(--success)' : 'var(--primary)',
                      boxShadow: `0 0 10px ${progress === 100 ? 'rgba(16, 185, 129, 0.5)' : 'rgba(99, 102, 241, 0.5)'}`
                    }} 
                  />
                  <div style={{ position: 'absolute', right: 0, top: '-20px', fontSize: '0.65rem', fontWeight: '900', opacity: 0.5, letterSpacing: '0.05em' }}>
                    {completedCount}/{totalCount}
                  </div>
                </div>

                <AnimatePresence initial={false}>
                  {!collapsedIds.has(checklist.id) && (
                    <Motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                      style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', overflow: 'hidden' }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <AnimatePresence initial={false}>
                          {checklist.items.map(item => (
                            <Motion.div 
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              key={item.id} 
                              style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '1rem', 
                                padding: '0.75rem 1rem', 
                                background: item.completed ? 'rgba(16, 185, 129, 0.03)' : 'rgba(255,255,255,0.02)', 
                                borderRadius: '12px',
                                border: '1px solid transparent',
                                transition: '0.2s'
                              }}
                              className="checklist-item-row"
                            >
                              <button 
                                onClick={() => toggleItem(checklist.id, item)}
                                style={{ 
                                  background: 'none', border: 'none', cursor: 'pointer', padding: 0, 
                                  display: 'flex', color: item.completed ? 'var(--success)' : 'var(--text-muted)',
                                  transition: '0.2s',
                                  transform: item.completed ? 'scale(1.1)' : 'scale(1)'
                                }}
                              >
                                {item.completed ? <CheckCircle size={22} /> : <Circle size={22} />}
                              </button>

                              {editingItemId === item.id ? (
                                <input 
                                  autoFocus
                                  type="text"
                                  data-testid={'edit-item-input-' + item.id}
                                  value={tempItemTask}
                                  onChange={e => setTempItemTask(e.target.value)}
                                  onBlur={() => saveItem(checklist.id, item)}
                                  onKeyDown={e => e.key === 'Enter' && saveItem(checklist.id, item)}
                                  className="glass-input"
                                  style={{ flex: 1, fontSize: '0.95rem', padding: '0.4rem 0.75rem' }}
                                />
                              ) : (
                                <span 
                                  data-testid={'checklist-item-task-' + item.id}
                                  style={{ 
                                    flex: 1, 
                                    fontSize: '1rem', 
                                    fontWeight: '600',
                                    textDecoration: item.completed ? 'line-through' : 'none',
                                    opacity: item.completed ? 0.4 : 1,
                                    cursor: 'pointer',
                                    color: item.completed ? 'var(--text-muted)' : 'var(--text-main)',
                                    transition: '0.2s'
                                  }}
                                  onClick={() => !item.completed && startEditingItem(item)}
                                >
                                  {item.task}
                                </span>
                              )}

                              <div style={{ display: 'flex', gap: '0.4rem', opacity: 0 }} className="item-actions">
                                {editingItemId !== item.id && (
                                  <>
                                    <button onClick={() => startEditingItem(item)} className="icon-btn" title={t('trips.checklist_edit')}><Edit2 size={14} /></button>
                                    <button onClick={() => removeItem(checklist.id, item.id)} className="icon-btn" style={{ color: 'var(--danger)' }} title={t('trips.checklist_remove')}><X size={16} /></button>
                                  </>
                                )}
                              </div>
                            </Motion.div>
                          ))}
                        </AnimatePresence>
                      </div>

                      {addingItemToId === checklist.id ? (
                        <Motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem', padding: '1rem', background: 'rgba(99,102,241,0.05)', borderRadius: '16px', border: '1px solid var(--primary)' }}
                        >
                          <input 
                            autoFocus
                            type="text" 
                            value={newItemTask}
                            onChange={e => setNewItemTask(e.target.value)}
                            onBlur={() => !newItemTask.trim() && setAddingItemToId(null)}
                            onKeyDown={e => e.key === 'Enter' && handleAddItem(checklist.id)}
                            placeholder={t('trips.item_placeholder', 'O que precisa ser feito?')}
                            className="glass-input"
                            style={{ fontSize: '1rem', padding: '0.85rem' }}
                          />
                          <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button onClick={() => handleAddItem(checklist.id)} className="btn-primary" style={{ flex: 1, padding: '0.75rem', fontWeight: '900', borderRadius: '10px' }}>{t('common.add', 'ADICIONAR')}</button>
                            <button onClick={() => setAddingItemToId(null)} className="btn-cancel" style={{ padding: '0.75rem 1rem', borderRadius: '10px' }}>{t('common.cancel', 'CANCELAR')}</button>
                          </div>
                        </Motion.div>
                      ) : (
                        <button 
                          onClick={() => setAddingItemToId(checklist.id)}
                          style={{ 
                            marginTop: '0.5rem',
                            width: '100%',
                            padding: '1rem',
                            border: '2px dashed var(--glass-border)',
                            background: 'transparent',
                            borderRadius: '16px',
                            color: 'var(--text-muted)',
                            fontSize: '0.9rem',
                            fontWeight: '800',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.75rem',
                            transition: '0.3s'
                          }}
                          className="add-item-btn-premium"
                        >
                          <Plus size={20} /> {t('trips.add_item_btn', 'Adicionar item')}
                        </button>
                      )}
                    </Motion.div>
                  )}
                </AnimatePresence>
              </Motion.div>
            );
          })}
        </AnimatePresence>
        </div>
      )}

      {/* Modal de Importação Redesenhado */}
      <AnimatePresence>
        {isImportModalOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
            <Motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="glass-card" 
              style={{ width: '100%', maxWidth: '600px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', border: '1px solid var(--glass-border)', boxShadow: '0 30px 60px -12px rgba(0,0,0,0.8)' }}
            >
              <div style={{ padding: '2rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '900' }}>{t('trips.import_from_other_trips', 'Importar de outras viagens')}</h3>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('trips.import_modal_desc')}</p>
                </div>
                <button onClick={() => setIsImportModalOpen(false)} className="action-btn"><X size={24} /></button>
              </div>
              
              <div style={{ padding: '1.5rem', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
                  <Search size={20} style={{ position: 'absolute', left: '1.25rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.3 }} />
                  <input 
                    type="text" 
                    placeholder={t('trips.import_search_placeholder')} 
                    className="glass-input" 
                    style={{ width: '100%', padding: '1rem 1rem 1rem 3.5rem', fontSize: '1rem', borderRadius: '16px' }}
                    value={importSearch}
                    onChange={(e) => setImportSearch(e.target.value)}
                  />
                </div>

                <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingRight: '0.5rem' }} className="custom-scrollbar">
                  {otherTrips
                    .filter(t => t.title.toLowerCase().includes(importSearch.toLowerCase()))
                    .map(t => (
                      <div key={t.id} style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.03)', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                          <LayoutGrid size={18} style={{ color: 'var(--primary)' }} />
                          <p style={{ margin: 0, fontWeight: '900', fontSize: '1rem', color: 'var(--text-main)' }}>{t.title}</p>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                          {t.checklists.map(c => (
                            <button 
                              key={c.id}
                              onClick={() => importChecklist(c.id)}
                              className="import-list-card"
                              style={{ 
                                padding: '1rem', 
                                fontSize: '0.9rem', 
                                borderRadius: '14px',
                                border: '1px solid var(--glass-border)',
                                cursor: 'pointer',
                                transition: '0.3s',
                                background: 'rgba(255,255,255,0.02)',
                                textAlign: 'left',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                color: 'var(--text-main)',
                                fontWeight: '700'
                              }}
                            >
                              <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Copy size={16} style={{ color: 'var(--primary)' }} />
                              </div>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  {otherTrips.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '4rem 2rem', opacity: 0.3 }}>
                      <ClipboardList size={48} style={{ marginBottom: '1rem' }} />
                      <p>{t('trips.checklist_no_import')}</p>
                    </div>
                  )}
                </div>
              </div>
            </Motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .checklist-item-row:hover {
          background: rgba(255, 255, 255, 0.05) !important;
          border-color: rgba(255, 255, 255, 0.1) !important;
        }
        .checklist-item-row:hover .item-actions {
          opacity: 1 !important;
        }
        .add-item-btn-premium:hover {
          border-color: var(--primary) !important;
          color: var(--primary) !important;
          background: rgba(99, 102, 241, 0.05) !important;
          transform: translateY(-2px);
          box-shadow: 0 10px 20px -5px rgba(0,0,0,0.3);
        }
        .import-list-card:hover {
          border-color: var(--primary) !important;
          background: rgba(99, 102, 241, 0.1) !important;
          transform: translateY(-2px);
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
          .header-actions .btn {
            flex: 1;
            justify-content: center;
            padding: 0.75rem !important;
          }
          .btn-text {
            display: none;
          }
          .item-actions {
            opacity: 1 !important;
          }
        }
      `}</style>
    </div>
  );
}
