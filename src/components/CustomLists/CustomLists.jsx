import React, { useState, useEffect, useCallback } from 'react';
import { 
  List, Plus, Search, Settings, Trash2, Edit2, 
  ChevronRight, Save, X, Loader2, Info, 
  CheckCircle2, Circle, Calendar, Hash, Type, 
  MapPin, CheckSquare as CheckboxIcon, Box, ExternalLink,
  Users, Share2, Mail, Lock
} from 'lucide-react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { useEncryption } from '../../contexts/EncryptionContext';
import toast from 'react-hot-toast';
import AddressInput from '../Trips/AddressInput';

const FIELD_TYPES = [
  { id: 'text', label: 'Texto', icon: Type },
  { id: 'number', label: 'Número', icon: Hash },
  { id: 'date', label: 'Data', icon: Calendar },
  { id: 'checkbox', label: 'Checklist', icon: CheckCircle2 },
  { id: 'address', label: 'Endereço', icon: MapPin },
  { id: 'link', label: 'Link', icon: ExternalLink },
];

export default function CustomLists({ user, refreshKey, mode = 'manager' }) {
  const { encryptObject, decryptObject, shareResourceKey } = useEncryption();
  const [lists, setLists] = useState([]);
  const [selectedList, setSelectedList] = useState(null);
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('list'); // 'list', 'item', 'share'
  const [editingItem, setEditingItem] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeShares, setActiveShares] = useState([]);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  const [newList, setNewList] = useState({
    name: '',
    icon: 'List',
    description: '',
    fields: [{ id: Math.random().toString(36).substr(2, 9), name: 'Item', type: 'text' }]
  });

  const [editingListId, setEditingListId] = useState(null);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchLists = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const { data: ownedData } = await supabase.from('custom_lists').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      const { data: sharedData } = await supabase
        .from('custom_lists')
        .select('*, custom_list_shares!inner(shared_with_email)')
        .eq('custom_list_shares.shared_with_email', user?.email?.toLowerCase().trim() || '')
        .order('created_at', { ascending: false });

      const allData = [...(ownedData || []), ...(sharedData || [])];
      const uniqueData = Array.from(new Map(allData.map(item => [item.id, item])).values());

      if (uniqueData) {
        const decrypted = await decryptObject(uniqueData, ['name', 'description', 'fields.*.name'], { resourceType: 'LIST' });
        setLists(decrypted);
        
        if (selectedList) {
          const updated = decrypted.find(l => l.id === selectedList.id);
          if (updated) setSelectedList(updated);
          else if (decrypted.length > 0) setSelectedList(decrypted[0]);
        } else if (decrypted.length > 0 && mode === 'manager') {
          setSelectedList(decrypted[0]);
        }
      }
    } catch (err) {
      console.error('Error fetching lists:', err);
      toast.error('Erro ao carregar coleções');
    } finally {
      setIsLoading(false);
    }
  }, [user, decryptObject, selectedList, mode]);

  const fetchShares = useCallback(async () => {
    if (!selectedList || selectedList.user_id !== user.id) {
      setActiveShares([]);
      return;
    }
    const { data } = await supabase.from('custom_list_shares').select('*').eq('list_id', selectedList.id);
    if (data) setActiveShares(data);
  }, [selectedList, user?.id]);

  const fetchItems = useCallback(async (listId) => {
    if (!listId) return;
    try {
      const { data, error } = await supabase
        .from('custom_list_items')
        .select('*')
        .eq('list_id', listId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      if (data) {
        const decrypted = await decryptObject(data, ['content'], { 
          resourceId: listId, 
          resourceType: 'LIST' 
        });
        
        const itemsWithData = decrypted.map(item => ({
          ...item,
          data: JSON.parse(item.content)
        }));
        
        setItems(itemsWithData);
      }
    } catch (err) {
      console.error('Error fetching items:', err);
      toast.error('Erro ao carregar itens');
    }
  }, [decryptObject]);

  useEffect(() => {
    fetchLists();
  }, [fetchLists, refreshKey]);

  useEffect(() => {
    fetchShares();
  }, [selectedList, fetchShares]);

  useEffect(() => {
    if (selectedList && mode === 'manager') {
      fetchItems(selectedList.id);
    }
  }, [selectedList, fetchItems, mode]);

  const handleSaveList = async () => {
    if (!newList.name) {
      toast.error('O nome da lista é obrigatório');
      return;
    }
    setIsSaving(true);
    try {
      const encrypted = await encryptObject(newList, ['name', 'description', 'fields.*.name'], { resourceType: 'LIST' });
      
      if (editingListId) {
        const { error } = await supabase
          .from('custom_lists')
          .update({
            name: encrypted.name,
            icon: newList.icon,
            description: encrypted.description,
            fields: encrypted.fields
          })
          .eq('id', editingListId);
        if (error) throw error;
        toast.success('Lista atualizada!');
      } else {
        const { error } = await supabase
          .from('custom_lists')
          .insert([{
            user_id: user.id,
            name: encrypted.name,
            icon: newList.icon,
            description: encrypted.description,
            fields: encrypted.fields
          }]);
        if (error) throw error;
        toast.success('Lista criada!');
      }
      
      setIsModalOpen(false);
      setEditingListId(null);
      setNewList({ name: '', icon: 'List', description: '', fields: [{ id: Math.random().toString(36).substr(2, 9), name: 'Item', type: 'text' }] });
      fetchLists();
    } catch (err) {
      console.error('Error saving list:', err);
      toast.error('Erro ao salvar lista');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteList = async (id) => {
    const list = lists.find(l => l.id === id);
    if (!list) return;

    if (list.user_id === user.id) {
      if (confirm('Excluir esta coleção e todos os seus itens permanentemente?')) {
        const { error } = await supabase.from('custom_lists').delete().eq('id', id);
        if (!error) {
          toast.success('Coleção excluída');
          if (selectedList?.id === id) setSelectedList(null);
          fetchLists();
        }
      }
    } else {
      if (confirm('Deseja realmente sair desta lista compartilhada?')) {
        const { error } = await supabase
          .from('custom_list_shares')
          .delete()
          .eq('list_id', id)
          .eq('shared_with_email', user.email.toLowerCase().trim());
        
        if (!error) {
          toast.success('Você saiu da lista');
          if (selectedList?.id === id) setSelectedList(null);
          fetchLists();
        }
      }
    }
  };

  const handleSaveItem = async (itemData) => {
    if (!selectedList) return;
    setIsSaving(true);
    try {
      const encryptedContent = await encryptObject(JSON.stringify(itemData), [], {
        resourceId: selectedList.id,
        resourceType: 'LIST'
      });

      if (editingItem) {
        const { error } = await supabase
          .from('custom_list_items')
          .update({ content: encryptedContent })
          .eq('id', editingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('custom_list_items')
          .insert([{
            list_id: selectedList.id,
            user_id: user.id,
            content: encryptedContent
          }]);
        if (error) throw error;
      }

      fetchItems(selectedList.id);
      setIsModalOpen(false);
      setEditingItem(null);
      toast.success(editingItem ? 'Item atualizado' : 'Item adicionado');
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Erro ao salvar item');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteItem = async (id) => {
    if (!confirm('Deseja excluir este item?')) return;
    try {
      const { error } = await supabase.from('custom_list_items').delete().eq('id', id);
      if (error) throw error;
      setItems(items.filter(i => i.id !== id));
      toast.success('Item excluído');
    } catch (err) {
      console.error('Delete error:', err);
      toast.error('Erro ao excluir');
    }
  };

  const toggleItemCompletion = async (item) => {
    try {
      const { error } = await supabase
        .from('custom_list_items')
        .update({ completed: !item.completed })
        .eq('id', item.id);
      if (error) throw error;
      setItems(items.map(i => i.id === item.id ? { ...i, completed: !item.completed } : i));
    } catch (err) {
      console.error('Toggle error:', err);
    }
  };

  const addField = () => setNewList({...newList, fields: [...newList.fields, { id: Math.random().toString(36).substr(2, 9), name: '', type: 'text' }]});
  const updateField = (id, key, val) => setNewList({...newList, fields: newList.fields.map(f => f.id === id ? {...f, [key]: val} : f)});
  const removeField = (id) => setNewList({...newList, fields: newList.fields.filter(f => f.id !== id)});

  const isMobile = windowWidth < 1024;

  const renderFieldContent = (field, item) => {
    if (field.type === 'checkbox') {
      return (
        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          {item.data[field.id] ? <CheckCircle2 size={18} className="text-primary" /> : <Circle size={18} style={{ opacity: 0.2 }} />}
        </div>
      );
    }
    if (field.type === 'date') {
      return <span style={{ whiteSpace: 'nowrap' }}>{item.data[field.id] ? new Date(item.data[field.id] + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}</span>;
    }
    if (field.type === 'address' && item.data[field.id]) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={item.data[field.id]}>{item.data[field.id]}</span>
          <button 
            onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.data[field.id])}`, '_blank')}
            className="icon-btn" style={{ width: 32, height: 32, color: 'var(--primary)', flexShrink: 0 }}
          >
            <MapPin size={14} />
          </button>
        </div>
      );
    }
    if (field.type === 'link' && item.data[field.id]) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, color: 'var(--primary)', textDecoration: 'underline' }} title={item.data[field.id]}>{item.data[field.id]}</span>
          <button 
            onClick={() => {
              let url = item.data[field.id];
              if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
              window.open(url, '_blank', 'noopener,noreferrer');
            }}
            className="icon-btn" style={{ width: 32, height: 32, color: 'var(--primary)', flexShrink: 0 }}
          >
            <ExternalLink size={14} />
          </button>
        </div>
      );
    }
    return <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.data[field.id]}>{item.data[field.id] || '-'}</div>;
  };

  if (mode === 'settings') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
        <div className="glass-card" style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--text-main)' }}>Ajustes de Coleções</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Gerencie a estrutura das suas listas personalizadas</p>
            </div>
            <button 
              onClick={() => { setEditingListId(null); setNewList({ name: '', icon: 'List', description: '', fields: [{ id: Math.random().toString(36).substr(2, 9), name: 'Item', type: 'text' }] }); setModalType('list'); setIsModalOpen(true); }} 
              className="btn-primary" 
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              data-testid="btn-add-collection-settings"
            >
              <Plus size={18} /> Nova Lista
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {isLoading && lists.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem' }}><Loader2 className="animate-spin" size={32} style={{ opacity: 0.5 }} /></div>
            ) : lists.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', opacity: 0.5 }}>
                <Box size={48} style={{ margin: '0 auto 1rem' }} />
                <p>Nenhuma lista criada ainda</p>
              </div>
            ) : lists.map(list => (
              <div key={list.id} className="glass-card" style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ width: 44, height: 44, borderRadius: '12px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <List size={22} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, color: 'var(--text-main)' }}>{list.name}</h4>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{list.fields?.length || 0} campos • {list.user_id === user.id ? 'Proprietário' : 'Compartilhada'}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {list.user_id === user.id && (
                    <button 
                      onClick={() => { 
                        setEditingListId(list.id); 
                        setNewList({ name: list.name, description: list.description || '', fields: list.fields || [], icon: list.icon || 'List' }); 
                        setModalType('list'); 
                        setIsModalOpen(true); 
                      }} 
                      className="icon-btn" 
                      title="Editar Estrutura"
                    >
                      <Edit2 size={18} />
                    </button>
                  )}
                  <button onClick={() => handleDeleteList(list.id)} className="icon-btn" style={{ color: 'var(--danger)' }} title="Excluir Coleção">
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <AnimatePresence>
          {isModalOpen && (
            <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
              <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsModalOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }} />
              <Motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="glass-card" style={{ position: 'relative', width: '100%', maxWidth: '550px', maxHeight: '90vh', overflowY: 'auto', padding: isMobile ? '1.5rem' : '2.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, color: 'var(--text-main)' }}>{editingListId ? 'Editar Coleção' : 'Nova Coleção'}</h3>
                    <button onClick={() => setIsModalOpen(false)} className="icon-btn"><X size={20} /></button>
                  </div>
                  <div className="glass-input-container">
                    <label style={{ color: 'var(--text-muted)' }}>Nome da Lista</label>
                    <input className="glass-input" value={newList.name} onChange={e => setNewList({...newList, name: e.target.value})} placeholder="Ex: Inventário de Remédios" />
                  </div>
                  <div className="glass-input-container">
                    <label style={{ color: 'var(--text-muted)' }}>Descrição</label>
                    <textarea className="glass-input" value={newList.description} onChange={e => setNewList({...newList, description: e.target.value})} placeholder="Opcional..." rows={2} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Campos da Tabela</label>
                    <button onClick={addField} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem' }}>+ ADICIONAR CAMPO</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {newList.fields.map((f) => (
                      <div key={f.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 40px', gap: '0.5rem' }}>
                        <input className="glass-input" value={f.name} onChange={e => updateField(f.id, 'name', e.target.value)} placeholder="Ex: Nome do Item" />
                        <select className="glass-input" value={f.type} onChange={e => updateField(f.id, 'type', e.target.value)}>
                          {FIELD_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                        </select>
                        <button onClick={() => removeField(f.id)} className="icon-btn" style={{ color: 'var(--danger)' }} disabled={newList.fields.length === 1}><Trash2 size={16} /></button>
                      </div>
                    ))}
                  </div>
                  <button onClick={handleSaveList} disabled={isSaving} className="btn-primary" style={{ padding: '1rem', marginTop: '1rem' }}>
                    {isSaving ? <Loader2 className="spin" size={18} /> : (editingListId ? 'Salvar Alterações' : 'Criar Lista')}
                  </button>
                </div>
              </Motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '320px 1fr', gap: '1.5rem', alignItems: 'start' }}>
        
        {!isMobile && (
          <aside className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', height: 'fit-content', position: 'sticky', top: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>Coleções</h3>
              <button 
                onClick={() => { setEditingListId(null); setNewList({ name: '', icon: 'List', description: '', fields: [{ id: Math.random().toString(36).substr(2, 9), name: 'Item', type: 'text' }] }); setModalType('list'); setIsModalOpen(true); }} 
                className="icon-btn" 
                style={{ width: 40, height: 40 }}
                data-testid="btn-add-collection"
              >
                <Plus size={20} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: 'calc(100vh - 250px)', overflowY: 'auto', paddingRight: '4px' }}>
              {isLoading && lists.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center' }}><Loader2 className="animate-spin" size={24} style={{ opacity: 0.3, margin: '0 auto' }} /></div>
              ) : lists.map(list => (
                <div key={list.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button 
                    onClick={() => setSelectedList(list)} 
                    style={{ 
                      display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '0.85rem', 
                      borderRadius: '14px', background: selectedList?.id === list.id ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255,255,255,0.02)', 
                      border: '1px solid', borderColor: selectedList?.id === list.id ? 'var(--primary)' : 'var(--glass-border)', 
                      cursor: 'pointer', textAlign: 'left', transition: '0.2s', flex: 1, overflow: 'hidden'
                    }}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><List size={18} /></div>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{list.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{list.fields?.length || 0} campos</div>
                    </div>
                  </button>
                  <button 
                    onClick={() => { setSelectedList(list); setModalType('share'); setIsModalOpen(true); }}
                    className="icon-btn" style={{ width: 32, height: 32 }} title="Compartilhar"
                    data-testid="btn-share-collection"
                  >
                    <Users size={16} />
                  </button>
                </div>
              ))}
            </div>
          </aside>
        )}

        <main style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>
          {isMobile && (
            <div className="glass-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Selecionar Coleção</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <select 
                  className="glass-input" 
                  style={{ flex: 1 }}
                  value={selectedList?.id || ''} 
                  onChange={(e) => setSelectedList(lists.find(l => l.id === e.target.value))}
                >
                  <option value="" disabled>Escolha uma lista...</option>
                  {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <button 
                  onClick={() => { setEditingListId(null); setModalType('list'); setIsModalOpen(true); }} 
                  className="icon-btn"
                  style={{ background: 'var(--primary)', color: 'white', border: 'none' }}
                >
                  <Plus size={20} />
                </button>
              </div>
            </div>
          )}

          {selectedList ? (
            <>
              <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-main)' }}>{selectedList.name}</h2>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>{selectedList.description || 'Sua lista dinâmica'}</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {selectedList.user_id === user.id && (
                    <button 
                      onClick={() => { setModalType('share'); setIsModalOpen(true); }} 
                      className="icon-btn" 
                      title="Compartilhar"
                      data-testid="btn-share-collection-header"
                    >
                      <Users size={20} />
                    </button>
                  )}
                  <button onClick={() => { setModalType('item'); setEditingItem(null); setIsModalOpen(true); }} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', height: '44px' }}><Plus size={18} /> Novo Item</button>
                </div>
              </div>

              {isMobile ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {items.length > 0 ? items.map(item => (
                    <div key={item.id} className="glass-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', border: item.completed ? '1px solid var(--success)' : '1px solid var(--glass-border)', opacity: item.completed ? 0.8 : 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <button onClick={() => toggleItemCompletion(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: item.completed ? 'var(--success)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: 0 }}>
                          {item.completed ? <CheckCircle2 size={24} /> : <Circle size={24} />}
                          <span style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '1rem' }}>{item.completed ? 'Concluído' : 'Pendente'}</span>
                        </button>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button onClick={() => { setModalType('item'); setEditingItem(item); setIsModalOpen(true); }} className="icon-btn" style={{ width: 36, height: 36 }}><Edit2 size={16} /></button>
                          <button onClick={() => handleDeleteItem(item.id)} className="icon-btn" style={{ width: 36, height: 36, color: 'var(--danger)' }}><Trash2 size={16} /></button>
                        </div>
                      </div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '1rem', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '12px' }}>
                        {selectedList.fields?.map(field => (
                          <div key={field.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{field.name}</span>
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: 500 }}>
                              {renderFieldContent(field, item)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )) : (
                    <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', opacity: 0.3 }}>
                      <Box size={48} style={{ margin: '0 auto 1rem' }} />
                      <p>Nenhum item nesta lista</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="glass-card" style={{ overflowX: 'auto', padding: '0.5rem' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: Math.max(600, (selectedList.fields?.length || 0) * 150 + 100) }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.02)' }}>
                        <th style={{ padding: '1rem', width: '48px' }}></th>
                        {selectedList.fields?.map(field => (
                          <th key={field.id} style={{ padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {field.name}
                          </th>
                        ))}
                        <th style={{ padding: '1rem', width: '100px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.length > 0 ? items.map(item => (
                        <tr key={item.id} style={{ borderBottom: '1px solid var(--glass-border)', opacity: item.completed ? 0.6 : 1, transition: '0.2s' }}>
                          <td style={{ padding: '1rem' }}>
                            <button onClick={() => toggleItemCompletion(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: item.completed ? 'var(--success)' : 'var(--text-muted)', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {item.completed ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                            </button>
                          </td>
                          {selectedList.fields?.map(field => (
                            <td key={field.id} style={{ padding: '1rem', fontSize: '0.9rem', color: 'var(--text-main)', maxWidth: '250px' }}>
                              {renderFieldContent(field, item)}
                            </td>
                          ))}
                          <td style={{ padding: '1rem', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                              <button onClick={() => { setModalType('item'); setEditingItem(item); setIsModalOpen(true); }} className="icon-btn" style={{ width: 36, height: 36 }}><Edit2 size={16} /></button>
                              <button onClick={() => handleDeleteItem(item.id)} className="icon-btn" style={{ width: 36, height: 36, color: 'var(--danger)' }}><Trash2 size={16} /></button>
                            </div>
                          </td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={(selectedList.fields?.length || 0) + 2} style={{ padding: '4rem', textAlign: 'center', opacity: 0.3 }}>
                            <Box size={48} style={{ marginBottom: '1rem', color: 'var(--text-main)', margin: '0 auto' }} />
                            <p style={{ color: 'var(--text-main)', fontSize: '1.1rem' }}>Nenhum item nesta lista ainda</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div className="glass-card" style={{ height: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
              <List size={48} style={{ marginBottom: '1rem', color: 'var(--text-main)' }} />
              <h3 style={{ color: 'var(--text-main)' }}>Selecione uma coleção</h3>
            </div>
          )}
        </main>
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
            <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsModalOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }} />
            <Motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="glass-card" style={{ position: 'relative', width: '100%', maxWidth: '550px', maxHeight: '90vh', overflowY: 'auto', padding: isMobile ? '1.5rem' : '2.5rem' }}>
              {modalType === 'list' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, color: 'var(--text-main)' }}>{editingListId ? 'Editar Coleção' : 'Nova Coleção'}</h3>
                    <button onClick={() => setIsModalOpen(false)} className="icon-btn"><X size={20} /></button>
                  </div>
                  <div className="glass-input-container">
                    <label style={{ color: 'var(--text-muted)' }}>Nome da Lista</label>
                    <input className="glass-input" value={newList.name} onChange={e => setNewList({...newList, name: e.target.value})} placeholder="Ex: Inventário de Remédios" />
                  </div>
                  <div className="glass-input-container">
                    <label style={{ color: 'var(--text-muted)' }}>Descrição</label>
                    <textarea className="glass-input" value={newList.description} onChange={e => setNewList({...newList, description: e.target.value})} placeholder="Opcional..." rows={2} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Campos da Tabela</label>
                    <button onClick={addField} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem' }}>+ ADICIONAR CAMPO</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {newList.fields.map((f) => (
                      <div key={f.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 40px', gap: '0.5rem' }}>
                        <input className="glass-input" value={f.name} onChange={e => updateField(f.id, 'name', e.target.value)} placeholder="Ex: Nome do Item" />
                        <select className="glass-input" value={f.type} onChange={e => updateField(f.id, 'type', e.target.value)}>
                          {FIELD_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                        </select>
                        <button onClick={() => removeField(f.id)} className="icon-btn" style={{ color: 'var(--danger)' }} disabled={newList.fields.length === 1}><Trash2 size={16} /></button>
                      </div>
                    ))}
                  </div>
                  <button onClick={handleSaveList} disabled={isSaving} className="btn-primary" style={{ padding: '1rem', marginTop: '1rem' }}>
                    {isSaving ? <Loader2 className="spin" size={18} /> : (editingListId ? 'Salvar Alterações' : 'Criar Lista')}
                  </button>
                </div>
              ) : modalType === 'share' ? (
                <ShareListModal 
                  user={user}
                  list={selectedList}
                  activeShares={activeShares}
                  onClose={() => setIsModalOpen(false)}
                  onRefresh={fetchShares}
                  shareResourceKey={shareResourceKey}
                />
              ) : (
                <ItemForm 
                  selectedList={selectedList} 
                  editingItem={editingItem} 
                  onSave={handleSaveItem} 
                  onCancel={() => setIsModalOpen(false)}
                  isSaving={isSaving}
                  isMobile={isMobile}
                />
              )}
            </Motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ShareListModal({ user, list, activeShares, onClose, onRefresh, shareResourceKey }) {
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState('WRITE');
  const [isLoading, setIsLoading] = useState(false);

  const handleShare = async (e) => {
    e.preventDefault();
    if (!email) return;
    setIsLoading(true);

    try {
      const keyShared = await shareResourceKey(list.id, 'LIST', email.toLowerCase().trim());
      if (!keyShared) {
        setIsLoading(false);
        return;
      }

      const { error } = await supabase.from('custom_list_shares').insert([{
        list_id: list.id,
        shared_by: user.id,
        shared_with_email: email.toLowerCase().trim(),
        permission
      }]);

      if (error) throw error;

      toast.success('Lista compartilhada!');
      setEmail('');
      onRefresh();
    } catch (error) {
      toast.error('Erro ao compartilhar: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevoke = async (shareId) => {
    if (!confirm('Revogar acesso?')) return;
    const { error } = await supabase.from('custom_list_shares').delete().eq('id', shareId);
    if (!error) {
      toast.success('Acesso revogado');
      onRefresh();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, color: 'var(--text-main)' }}>Compartilhar Lista</h3>
        <button onClick={onClose} className="icon-btn"><X size={20} /></button>
      </div>
      <form onSubmit={handleShare} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="glass-input-container">
          <label style={{ color: 'var(--text-muted)' }}>E-mail</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="glass-input" required placeholder="exemplo@email.com" />
        </div>
        <div className="glass-input-container">
          <label style={{ color: 'var(--text-muted)' }}>Permissão</label>
          <select value={permission} onChange={e => setPermission(e.target.value)} className="glass-input">
            <option value="READ">Apenas Visualizar</option>
            <option value="WRITE">Pode Editar</option>
          </select>
        </div>
        <button type="submit" disabled={isLoading} className="btn-primary" style={{ padding: '0.75rem' }}>
          {isLoading ? <Loader2 className="spin" size={18} /> : 'Compartilhar'}
        </button>
      </form>
      {activeShares.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, opacity: 0.5, color: 'var(--text-main)' }}>Acessos Ativos</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
            {activeShares.map(s => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.shared_with_email}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--primary)' }}>{s.permission === 'WRITE' ? 'EDITOR' : 'LEITOR'}</span>
                </div>
                <button onClick={() => handleRevoke(s.id)} className="icon-btn" style={{ color: 'var(--danger)', flexShrink: 0 }}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ItemForm({ selectedList, editingItem, onSave, onCancel, isSaving, isMobile }) {
  const [formData, setFormData] = useState(() => {
    if (editingItem) return editingItem.data;
    const initial = {};
    selectedList.fields.forEach(f => {
      initial[f.id] = f.type === 'checkbox' ? false : '';
    });
    return initial;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, color: 'var(--text-main)' }}>{editingItem ? 'Editar Item' : 'Novo Item'}</h3>
        <button onClick={onCancel} className="icon-btn"><X size={20} /></button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {selectedList.fields.map(field => (
          <div key={field.id} className="glass-input-container">
            <label style={{ color: 'var(--text-muted)' }}>{field.name}</label>
            {field.type === 'checkbox' ? (
              <button 
                onClick={() => setFormData({...formData, [field.id]: !formData[field.id]})}
                style={{ 
                  display: 'flex', alignItems: 'center', gap: '1rem', width: '100%', 
                  padding: '0.85rem', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', 
                  border: '1px solid var(--glass-border)', cursor: 'pointer', color: 'var(--text-main)'
                }}
              >
                {formData[field.id] ? <CheckCircle2 className="text-primary" /> : <Circle />}
                <span style={{ fontWeight: 600 }}>{field.name}</span>
              </button>
            ) : field.type === 'address' ? (
              <AddressInput 
                value={formData[field.id] || ''}
                onChange={(val) => setFormData({...formData, [field.id]: val})}
                placeholder="Digite o endereço ou local..."
              />
            ) : field.type === 'date' ? (
              <input 
                type="date" value={formData[field.id] || ''} 
                onChange={e => setFormData({...formData, [field.id]: e.target.value})}
                className="glass-input"
              />
            ) : field.type === 'number' ? (
              <input 
                type="number" value={formData[field.id] || ''} 
                onChange={e => setFormData({...formData, [field.id]: e.target.value})}
                className="glass-input" placeholder="0"
              />
            ) : field.type === 'link' ? (
              <input 
                type="url" value={formData[field.id] || ''} 
                onChange={e => setFormData({...formData, [field.id]: e.target.value})}
                className="glass-input" placeholder="https://exemplo.com"
              />
            ) : (
              <input 
                type="text" value={formData[field.id] || ''} 
                onChange={e => setFormData({...formData, [field.id]: e.target.value})}
                className="glass-input" placeholder="..."
              />
            )}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
        {!isMobile && <button onClick={onCancel} className="btn-secondary" style={{ flex: 1 }}>Cancelar</button>}
        <button onClick={() => onSave(formData)} disabled={isSaving} className="btn-primary" style={{ flex: 1, padding: '1rem' }}>
          {isSaving ? <Loader2 size={18} className="animate-spin" /> : 'Salvar Item'}
        </button>
      </div>
    </div>
  );
}
