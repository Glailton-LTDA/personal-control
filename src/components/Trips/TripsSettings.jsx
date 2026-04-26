import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { formatDate } from '../../lib/utils';
import { Plane, Tag, Users, Plus, Save, Trash2, Edit, X, MapPin, Calendar, Globe, Building, Car, DollarSign, Mail, Ticket, LayoutDashboard } from 'lucide-react';
import CurrencySelector from './CurrencySelector';
import BadgeInput from './BadgeInput';
import AttachmentManager from './AttachmentManager';
import { CURRENCIES } from '../../constants/currencies';

export default function TripsSettings({ user, refreshKey, onEditTrip, onAddTrip }) {
  const [activeTab, setActiveTab] = useState('trips'); // 'trips', 'categories', 'shares'
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);


  const renderFlag = (flag, size = '1rem') => {
    if (!flag) return null;
    if (flag.startsWith('data:image')) {
      return (
        <img 
          src={flag} 
          alt="flag" 
          style={{ 
            width: size, 
            height: size, 
            objectFit: 'contain',
            borderRadius: '2px'
          }} 
        />
      );
    }
    return <span style={{ fontSize: size }}>{flag}</span>;
  };
  const [trips, setTrips] = useState([]);
  
  const [categories, setCategories] = useState([]);
  const [editingCategory, setEditingCategory] = useState(null);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  
  const [shares, setShares] = useState([]);
  const [isAddingShare, setIsAddingShare] = useState(false);

  useEffect(() => {
    fetchTrips();
    fetchCategories();
    fetchShares();
  }, [user, refreshKey]);

  async function fetchTrips() {
    if (!user) return;
    const { data } = await supabase.from('trips').select('*').order('created_at', { ascending: false });
    if (data) setTrips(data);
  }

  async function fetchCategories() {
    if (!user) return;
    const { data } = await supabase.from('trip_categories').select('*').eq('user_id', user.id).order('name', { ascending: true });
    if (data) setCategories(data);
  }

  async function fetchShares() {
    if (!user) return;
    const { data } = await supabase.from('trip_shares').select('*, trips(title)').eq('shared_by', user.id);
    if (data) setShares(data);
  }

  async function deleteItem(table, id, callback) {
    if (!confirm('Deseja realmente excluir este item?')) return;
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (!error) callback();
  }

  async function cancelMyShare(tripId) {
    if (!confirm('Deseja realmente remover seu acesso a esta viagem? \n\nIsso NÃO excluirá a viagem para o proprietário, apenas removerá ela da sua lista.')) return;
    
    const { error } = await supabase
      .from('trip_shares')
      .delete()
      .eq('trip_id', tripId)
      .eq('shared_with_email', user.email);

    if (!error) {
      fetchTrips();
    } else {
      alert('Erro ao sair da viagem: ' + error.message);
    }
  }

  const tabIcons = {
    trips: <Plane size={20} />,
    categories: <Tag size={20} />,
    shares: <Users size={20} />
  };

  const tabTitles = {
    trips: 'Viagens',
    categories: 'Categorias',
    shares: 'Compartilhamento'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Header section with tabs */}
      <div className="glass-card" style={{ 
        padding: '0.5rem', 
        display: 'flex', 
        gap: '0.4rem', 
        background: 'var(--card-action-bg)', 
        borderRadius: '16px', 
        border: '1px solid var(--glass-border)',
        overflowX: isMobile ? 'auto' : 'visible',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none'
      }}>
        {['trips', 'categories', 'shares'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: isMobile ? '0 0 auto' : 1,
              minWidth: isMobile ? '120px' : 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
              padding: '0.85rem',
              borderRadius: '12px',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              background: activeTab === tab ? 'var(--primary)' : 'transparent',
              color: activeTab === tab ? 'white' : 'var(--text-muted)',
              boxShadow: activeTab === tab ? '0 10px 20px -5px rgba(99, 102, 241, 0.4)' : 'none',
              transform: activeTab === tab ? 'translateY(-2px)' : 'none',
              fontWeight: activeTab === tab ? '700' : '600',
              fontSize: '0.9rem',
              whiteSpace: 'nowrap'
            }}
          >
            {tabIcons[tab]}
            {tabTitles[tab]}
          </button>
        ))}
      </div>

      {/* Content area */}
      <div className="fade-in">
        {activeTab === 'trips' && (
          <div>
            <div style={{ 
              display: 'flex', 
              flexDirection: isMobile ? 'column' : 'row',
              justifyContent: 'space-between', 
              alignItems: isMobile ? 'stretch' : 'center', 
              marginBottom: '2rem',
              gap: '1.5rem'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: '800' }}>Gerenciar Viagens</h3>
                <p style={{ margin: '0.25rem 0 0 0', opacity: 0.5, fontSize: '0.9rem' }}>Configure os detalhes e moedas de cada jornada</p>
              </div>
              <button 
                className="btn" 
                style={{ 
                  background: 'var(--primary)', 
                  color: 'white', 
                  padding: '0.85rem 1.75rem', 
                  borderRadius: '14px', 
                  fontWeight: '700', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  gap: '0.75rem', 
                  boxShadow: '0 10px 20px -5px rgba(99, 102, 241, 0.4)',
                  width: isMobile ? '100%' : 'auto'
                }} 
                onClick={() => onAddTrip()}
              >
                <Plus size={20} strokeWidth={3} /> Nova Viagem
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
              {trips.length === 0 && <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', opacity: 0.5, gridColumn: '1/-1' }}>Nenhuma viagem cadastrada.</div>}
              {trips.map(trip => (
                <div key={trip.id} className="glass-card item-card" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', border: '1px solid var(--glass-border)', transition: 'transform 0.2s', borderRadius: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.2rem', fontWeight: '800' }}>{trip.title}</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                          <MapPin size={14} style={{ color: 'var(--primary)' }} /> {trip.cities?.join(', ') || 'Várias Cidades'}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                          <Calendar size={14} style={{ color: 'var(--primary)' }} /> 
                          {trip.start_date ? formatDate(trip.start_date) : 'A definir'} 
                          {trip.end_date && ` - ${formatDate(trip.end_date)}`}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
                    {trip.currencies?.map(currCode => {
                      const currData = CURRENCIES.find(c => c.code === currCode);
                      return (
                        <span 
                          key={currCode} 
                          style={{ 
                            fontSize: '0.75rem', 
                            padding: '0.35rem 0.65rem', 
                            borderRadius: '8px', 
                            background: 'rgba(99, 102, 241, 0.1)', 
                            color: 'var(--primary)', 
                            fontWeight: '800', 
                            border: '1px solid var(--glass-border)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem'
                          }}
                        >
                          {renderFlag(currData?.flag)}
                          {currCode}
                        </span>
                      );
                    })}
                  </div>

                  <div className="actions-cell" style={{ marginTop: '0.5rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1.25rem' }}>
                    <div className="actions-row" style={{ justifyContent: 'center', width: '100%' }}>
                      {trip.user_id === user.id ? (
                        <>
                          <button className="action-btn" onClick={() => onEditTrip(trip)} title="Editar">
                            <Edit size={18} />
                          </button>
                          <button 
                            className="action-btn" 
                            style={{ color: 'var(--primary)' }}
                            onClick={() => {
                              localStorage.setItem('pc_selected_trip_v1', trip.id);
                              window.dispatchEvent(new CustomEvent('set-active-tab', { detail: { tab: 'trips-list' } }));
                            }} 
                            title="Ver no Dashboard"
                          >
                            <LayoutDashboard size={18} />
                          </button>
                          <button className="action-btn danger" onClick={() => deleteItem('trips', trip.id, fetchTrips)} title="Excluir">
                            <Trash2 size={18} />
                          </button>
                        </>
                      ) : (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button 
                            className="action-btn" 
                            style={{ color: 'var(--primary)', width: 'auto', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                            onClick={() => {
                              localStorage.setItem('pc_selected_trip_v1', trip.id);
                              window.dispatchEvent(new CustomEvent('set-active-tab', { detail: { tab: 'trips-list' } }));
                            }} 
                            title="Ver no Dashboard"
                          >
                            <LayoutDashboard size={18} /> <span style={{ fontSize: '0.8rem', fontWeight: '700' }}>Ver Dashboard</span>
                          </button>
                          <button 
                            className="action-btn danger" 
                            onClick={() => cancelMyShare(trip.id)} 
                            title="Sair da Viagem"
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', width: 'auto' }}
                          >
                            <X size={18} /> <span style={{ fontSize: '0.8rem', fontWeight: '700' }}>Sair da Viagem</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'categories' && (
          <div>
            <div style={{ 
              display: 'flex', 
              flexDirection: isMobile ? 'column' : 'row',
              justifyContent: 'space-between', 
              alignItems: isMobile ? 'stretch' : 'center', 
              marginBottom: '2rem',
              gap: '1.5rem'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: '800' }}>Categorias</h3>
                <p style={{ margin: '0.25rem 0 0 0', opacity: 0.5, fontSize: '0.9rem' }}>Organize seus gastos por tipo</p>
              </div>
              <button 
                className="btn" 
                style={{ 
                  background: 'var(--primary)', 
                  color: 'white', 
                  padding: '0.85rem 1.75rem', 
                  borderRadius: '14px', 
                  fontWeight: '700', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  gap: '0.75rem', 
                  boxShadow: '0 10px 20px -5px rgba(99, 102, 241, 0.4)',
                  width: isMobile ? '100%' : 'auto'
                }} 
                onClick={() => setIsAddingCategory(true)}
              >
                <Plus size={20} strokeWidth={3} /> Nova Categoria
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
              {categories.length === 0 && <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', opacity: 0.5, gridColumn: '1/-1' }}>Nenhuma categoria cadastrada.</div>}
              {categories.map(cat => (
                <div key={cat.id} className="glass-card" style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--glass-border)', borderRadius: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary)', boxShadow: '0 0 10px var(--primary)' }}></div>
                    <span style={{ fontWeight: '700', fontSize: '1rem', color: 'var(--text-main)' }}>{cat.name}</span>
                  </div>
                  <div className="actions-row">
                    <button className="action-btn" onClick={() => setEditingCategory(cat)} title="Editar">
                      <Edit size={18} />
                    </button>
                    <button className="action-btn danger" onClick={() => deleteItem('trip_categories', cat.id, fetchCategories)} title="Excluir">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'shares' && (
          <div>
            <div style={{ 
              display: 'flex', 
              flexDirection: isMobile ? 'column' : 'row',
              justifyContent: 'space-between', 
              alignItems: isMobile ? 'stretch' : 'center', 
              marginBottom: '2rem',
              gap: '1.5rem'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: '800' }}>Compartilhamento</h3>
                <p style={{ margin: '0.25rem 0 0 0', opacity: 0.5, fontSize: '0.9rem' }}>Convide outras pessoas para visualizar sua viagem</p>
              </div>
              <button 
                className="btn" 
                style={{ 
                  background: 'var(--primary)', 
                  color: 'white', 
                  padding: '0.85rem 1.75rem', 
                  borderRadius: '14px', 
                  fontWeight: '700', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  gap: '0.75rem', 
                  boxShadow: '0 10px 20px -5px rgba(99, 102, 241, 0.4)',
                  width: isMobile ? '100%' : 'auto'
                }} 
                onClick={() => setIsAddingShare(true)}
              >
                <Plus size={20} strokeWidth={3} /> Compartilhar Viagem
              </button>
            </div>

            <div style={{ display: 'grid', gap: '1rem' }}>
              {shares.length === 0 && <div className="glass-card" style={{ padding: '4rem', textAlign: 'center', opacity: 0.5 }}>Nenhum compartilhamento ativo.</div>}
              {shares.map(share => (
                <div key={share.id} className="glass-card" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--glass-border)', borderRadius: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                    <div style={{ background: 'rgba(99, 102, 241, 0.1)', padding: '0.75rem', borderRadius: '12px' }}>
                      <Users size={22} style={{ color: 'var(--primary)' }} />
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-main)' }}>{share.trips?.title}</h4>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        <Mail size={14} /> {share.shared_with_email}
                      </div>
                    </div>
                  </div>
                  <div className="actions-row">
                    <button className="action-btn danger" onClick={() => deleteItem('trip_shares', share.id, fetchShares)} title="Excluir">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Forms Modals */}

      {(isAddingCategory || editingCategory) && (
        <CategoryModal 
          user={user} 
          category={editingCategory}
          onClose={() => { setIsAddingCategory(false); setEditingCategory(null); }} 
          onSave={() => { setIsAddingCategory(false); setEditingCategory(null); fetchCategories(); }} 
        />
      )}

      {isAddingShare && (
        <ShareModal 
          user={user} 
          trips={trips}
          onClose={() => setIsAddingShare(false)} 
          onSave={() => { setIsAddingShare(false); fetchShares(); }} 
        />
      )}
    </div>
  );
}

function BaseModal({ title, subtitle, icon: Icon, onClose, children }) {
  return (
    <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div className="glass-card fade-in" style={{ 
        width: '100%', 
        maxWidth: '600px', 
        maxHeight: '90vh', 
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-card)', 
        border: '1px solid var(--glass-border)', 
        borderRadius: '24px', 
        boxShadow: 'var(--shadow)',
        overflow: 'hidden'
      }}>
        {/* Fixed Header */}
        <div style={{ padding: '2.5rem 2.5rem 1.5rem 2.5rem', position: 'relative', borderBottom: '1px solid var(--glass-border)' }}>
          <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-main)', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {Icon && <div style={{ background: 'var(--primary)', padding: '0.5rem', borderRadius: '10px', display: 'flex' }}><Icon size={20} color="white" /></div>}
            {title}
          </h2>
          {subtitle && <p style={{ margin: '0.5rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.95rem' }}>{subtitle}</p>}
          <button className="icon-btn" onClick={onClose} style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', padding: '0.5rem', color: 'var(--text-muted)' }}><X size={24} /></button>
        </div>
        
        {/* Scrollable Content */}
        <div style={{ padding: '2rem 2.5rem 2.5rem 2.5rem', overflowY: 'auto', flex: 1 }} className="custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
}


function CategoryModal({ user, category, onClose, onSave }) {
  const [name, setName] = useState(category?.name || '');

  async function handleSubmit(e) {
    e.preventDefault();
    let result;
    if (category) {
      result = await supabase.from('trip_categories').update({ name }).eq('id', category.id);
    } else {
      result = await supabase.from('trip_categories').insert([{ user_id: user.id, name }]);
    }
    if (!result.error) onSave();
    else alert('Erro: ' + result.error.message);
  }

  return (
    <BaseModal title={category ? 'Editar Categoria' : 'Nova Categoria'} subtitle="Organize seus gastos de forma clara" icon={Tag} onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div>
          <label className="modal-label" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: '600', opacity: 0.7 }}><Tag size={16} /> Nome da Categoria</label>
          <input 
            required autoFocus className="glass-input" 
            style={{ width: '100%', padding: '1rem 1.25rem', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', borderRadius: '12px', fontSize: '1.1rem' }} 
            value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Alimentação, Passeios..." 
          />
        </div>
        <button type="submit" className="btn" style={{ width: '100%', padding: '1.25rem', background: 'var(--primary)', color: 'white', fontWeight: '700', fontSize: '1rem', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', border: 'none', cursor: 'pointer', boxShadow: '0 10px 20px -5px rgba(99,102,241,0.5)' }}>
          <Save size={20} /> Salvar Categoria
        </button>
      </form>
    </BaseModal>
  );
}

function ShareModal({ user, trips, onClose, onSave }) {
  const [tripId, setTripId] = useState('');
  const [email, setEmail] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    const { error } = await supabase.from('trip_shares').insert([{
      shared_by: user.id,
      trip_id: tripId,
      shared_with_email: email.toLowerCase().trim()
    }]);

    if (!error) onSave();
    else alert('Erro: ' + error.message);
  }

  return (
    <BaseModal title="Compartilhar" subtitle="Dê acesso a outros membros para verem esta viagem" icon={Users} onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div>
          <label className="modal-label" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: '600', opacity: 0.7 }}><Plane size={16} /> Selecione a Viagem</label>
          <select 
            required className="glass-input" 
            style={{ width: '100%', padding: '1rem', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', borderRadius: '12px' }} 
            value={tripId} onChange={e => setTripId(e.target.value)}
          >
            <option value="">Selecione uma viagem...</option>
            {trips.filter(t => t.user_id === user.id).map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </div>
        <div>
          <label className="modal-label" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: '600', opacity: 0.7 }}><Mail size={16} /> E-mail do Parceiro(a)</label>
          <input 
            required type="email" className="glass-input" 
            style={{ width: '100%', padding: '1rem 1.25rem', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', borderRadius: '12px' }} 
            value={email} onChange={e => setEmail(e.target.value)} placeholder="amigo@exemplo.com" 
          />
        </div>
        <button type="submit" className="btn" style={{ width: '100%', padding: '1.25rem', background: 'var(--primary)', color: 'white', fontWeight: '700', fontSize: '1rem', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', border: 'none', cursor: 'pointer', boxShadow: '0 10px 20px -5px rgba(99, 102, 241, 0.5)' }}>
          <Users size={20} /> Confirmar Compartilhamento
        </button>
      </form>
    </BaseModal>
  );
}
