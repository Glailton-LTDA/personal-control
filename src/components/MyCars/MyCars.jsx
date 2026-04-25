import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Car, Settings, Wrench, Share2, Plus, Info, ChevronRight, User, Key, CheckCircle2, XCircle, Clock, Trash2, Mail, Save, AlertTriangle, Eye, EyeOff, MessageSquare, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function MyCars({ user, refreshKey, mode = 'list' }) {
  const [cars, setCars] = useState([]);
  const [pendingShares, setPendingShares] = useState([]);
  const [activeShares, setActiveShares] = useState([]);
  const [selectedCar, setSelectedCar] = useState(() => {
    const saved = localStorage.getItem('personal-control-selected-car-id');
    return saved ? { id: saved } : null; 
  });
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState('add_car');
  const [tableRefreshKey, setTableRefreshKey] = useState(0);
  const [fetchedMaintenance, setFetchedMaintenance] = useState([]);
  
  const isMobile = typeof window !== 'undefined' ? window.innerWidth <= 600 : false;
  const isTablet = typeof window !== 'undefined' ? window.innerWidth <= 1100 : false;

  // Persistence
  useEffect(() => {
    if (selectedCar?.id) {
      localStorage.setItem('personal-control-selected-car-id', selectedCar.id);
    }
  }, [selectedCar?.id]);

  useEffect(() => {
    if (user) {
      fetchCars();
      fetchPendingShares();
      fetchActiveShares();
    }
  }, [refreshKey, user?.id]);

  useEffect(() => {
    const handleOpenAdd = () => openModal('add_car');
    window.addEventListener('open-add-car-modal', handleOpenAdd);
    return () => window.removeEventListener('open-add-car-modal', handleOpenAdd);
  }, []);

  async function fetchCars() {
    setLoading(true);
    // RLS already filters all accessible cars for the user
    const { data: allAccessibleCars } = await supabase.from('cars').select('*').order('created_at', { ascending: true });
    
    const { data: sharedItems } = await supabase
      .from('car_shares')
      .select('car_id, permission')
      .eq('shared_with_email', user.email)
      .eq('status', 'ACCEPTED');

    // Decorate with share info
    const decoratedCars = (allAccessibleCars || []).map(car => {
      const share = sharedItems?.find(s => s.car_id === car.id);
      const isOwner = car.user_id === user.id;
      return { 
        ...car, 
        is_owner: isOwner,
        is_guest: !!share, 
        permission: share?.permission || (isOwner ? 'OWNER' : 'READ') 
      };
    });

    setCars(decoratedCars);
    const allCars = decoratedCars;
    
    if (mode === 'list') {
      const visibleCars = allCars.filter(c => !c.is_hidden);
      if (visibleCars.length > 0) {
        const savedId = localStorage.getItem('personal-control-selected-car-id');
        const found = visibleCars.find(c => c.id === savedId);
        if (found) setSelectedCar(found);
        else if (!selectedCar || !visibleCars.find(c => c.id === selectedCar.id)) {
          setSelectedCar(visibleCars[0]);
        }
      }
    }
    setLoading(false);
  }

  async function fetchPendingShares() {
    const { data } = await supabase
      .from('car_shares')
      .select('*, car_id(id, name, user_id)')
      .eq('shared_with_email', user.email)
      .eq('status', 'PENDING');
    setPendingShares(data || []);
  }

  async function fetchActiveShares() {
    const { data } = await supabase
      .from('car_shares')
      .select('*, car_id(name)')
      .eq('shared_by', user.id);
    setActiveShares(data || []);
  }

  async function revokeShare(shareId) {
    if (!confirm('Deseja realmente parar de compartilhar este veículo com este usuário? \n\nO usuário perderá o acesso imediatamente, mas nenhum dado do veículo será excluído.')) return;
    const { error } = await supabase.from('car_shares').delete().eq('id', shareId);
    if (!error) fetchActiveShares();
  }

  async function leaveCar(carId) {
    if (!confirm('Deseja realmente remover este veículo da sua lista? \n\nIsso NÃO excluirá o veículo para o proprietário, apenas removerá o seu acesso a ele.')) return;
    const { error } = await supabase
      .from('car_shares')
      .delete()
      .eq('car_id', carId)
      .eq('shared_with_email', user.email);
    
    if (!error) {
      fetchCars();
      if (selectedCar?.id === carId) setSelectedCar(null);
    }
  }

  async function handleShareResponse(shareId, status) {
    const { error } = await supabase.from('car_shares').update({ status }).eq('id', shareId);
    if (!error) {
      fetchPendingShares();
      fetchCars();
    }
  }

  async function toggleCarVisibility(carId, currentStatus) {
    const { error } = await supabase.from('cars').update({ is_hidden: !currentStatus }).eq('id', carId);
    if (!error) fetchCars();
  }

  async function handleDeleteCar(carId) {
    if (!window.confirm("ATENÇÃO: Tem certeza que deseja excluir permanentemente este veículo e todo o seu histórico de revisões? Esta ação não pode ser desfeita.")) return;
    
    // Cascading delete is handled by code to be safe, though DB should handle it too
    await supabase.from('car_maintenance').delete().eq('car_id', carId);
    const { error } = await supabase.from('cars').delete().eq('id', carId);
    
    if (!error) {
      if (selectedCar?.id === carId) setSelectedCar(null);
      fetchCars();
    }
  }

  const [selectedService, setSelectedService] = useState(null);

  function openModal(type, serviceName = null) {
    setModalType(type);
    setSelectedService(serviceName);
    setModalOpen(true);
  }

  if (loading && cars.length === 0) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center' }}>
        <Car className="skeleton-loader" size={48} style={{ margin: '0 auto 1rem', opacity: 0.2 }} />
        <p style={{ color: 'var(--text-muted)' }}>Carregando frota...</p>
      </div>
    );
  }

  if (mode === 'admin') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Gestão de Veículos</h3>
          <button className="btn-primary" onClick={() => openModal('add_car')} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
            <Plus size={18} /> Adicionar Veículo
          </button>
        </div>

        <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
          {cars.map(car => (
            <div key={car.id} className="glass-card" style={{ padding: '1.5rem', opacity: car.is_hidden ? 0.7 : 1, transition: 'opacity 0.3s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <div style={{ width: 44, height: 44, borderRadius: '12px', background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', flexShrink: 0 }}>
                    <Car size={24} />
                  </div>
                  <div>
                    <h4 style={{ fontSize: '1rem' }}>{car.name}</h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{car.plate || 'Sem placa'} • {car.current_km.toLocaleString()} km</p>
                  </div>
                  {car.is_hidden && (
                    <span style={{ fontSize: '0.65rem', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)', padding: '2px 8px', borderRadius: '20px', fontWeight: 600, flexShrink: 0 }}>OCULTO</span>
                  )}
                </div>
                 <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                    <button 
                      className="icon-btn"
                      onClick={() => toggleCarVisibility(car.id, car.is_hidden)}
                      title={car.is_hidden ? 'Mostrar na lista' : 'Ocultar da lista'}
                      style={{ 
                        color: car.is_hidden ? '#f59e0b' : 'var(--text-muted)',
                        background: car.is_hidden ? 'rgba(245,158,11,0.1)' : 'transparent',
                        borderRadius: 8, padding: 6
                      }}
                    >
                      {car.is_hidden ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                    {car.is_owner && (
                      <button className="icon-btn" onClick={() => { setSelectedCar(car); openModal('share_car'); }} title="Compartilhar">
                        <Share2 size={18} />
                      </button>
                    )}
                  </div>
              </div>
              
                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1rem' }}>
                    {car.is_owner ? (
                      <>
                        <button className="btn-secondary" style={{ flex: 1, fontSize: '0.8rem', padding: '8px' }} onClick={() => { setSelectedCar(car); openModal('edit_car'); }}>
                          <Settings size={14} /> Editar
                        </button>
                        <button className="icon-btn" style={{ color: 'var(--danger)' }} onClick={() => handleDeleteCar(car.id)} title="Excluir">
                          <Trash2 size={18} />
                        </button>
                      </>
                    ) : (
                      <button className="btn-secondary" style={{ flex: 1, fontSize: '0.8rem', padding: '8px', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }} onClick={() => leaveCar(car.id)}>
                        <XCircle size={14} /> Sair do Veículo
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Shares Management Section */}
            <CarSharesManager activeShares={activeShares} onRevoke={revokeShare} />

        {/* Service Templates Manager */}
        <ServiceTemplatesManager user={user} />

        <CarModals 
          isOpen={isModalOpen} 
          onClose={() => setModalOpen(false)} 
          type={modalType} 
          car={selectedCar} 
          user={user} 
          serviceName={selectedService} 
          maintenance={fetchedMaintenance}
          onSuccess={() => { fetchCars(); setModalOpen(false); setTableRefreshKey(k => k + 1); }} 
        />
      </div>
    );
  }

  const visibleCars = cars.filter(c => !c.is_hidden);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Pending Invitations */}
      {pendingShares.length > 0 && (
        <div className="glass-card" style={{ padding: '1.5rem', borderLeft: '4px solid var(--primary)', background: 'rgba(99, 102, 241, 0.05)' }}>
          <h4 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Mail size={18} /> Convites Pendentes
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {pendingShares.map(invite => (
              <div key={invite.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-card)', padding: '1rem', borderRadius: '12px' }}>
                <div>
                  <p style={{ fontWeight: 600 }}>{invite.car_id?.name || 'Carro Indisponível'}</p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {invite.shared_by_email} convidou você para editar este veículo como <strong>{invite.permission}</strong>
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn-primary" onClick={() => handleShareResponse(invite.id, 'ACCEPTED')} style={{ padding: '6px 12px', fontSize: '0.8rem' }}>Aceitar</button>
                  <button className="icon-btn" onClick={() => handleShareResponse(invite.id, 'REJECTED')} style={{ color: 'var(--danger)' }}><XCircle size={18} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Car Selection Row */}
      <div className="glass-card" style={{ padding: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {visibleCars.length === 0 && (
          <div style={{ flex: 1, textAlign: 'center', padding: '3rem 1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed var(--glass-border)' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', margin: '0 auto 1.5rem' }}>
              <Car size={32} />
            </div>
            <h4 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Nenhum veículo encontrado</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '300px', margin: '0 auto 1.5rem', lineHeight: 1.5 }}>
              Você ainda não tem veículos cadastrados ou visíveis. Adicione um agora ou gerencie sua frota nos ajustes.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button className="btn-primary" onClick={() => openModal('add_car')} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                <Plus size={16} /> Adicionar Veículo
              </button>
              <button className="btn-secondary" onClick={() => window.dispatchEvent(new CustomEvent('navigate-to-tab', { detail: 'cars-settings' }))} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                <Settings size={16} /> Ir para Ajustes
              </button>
            </div>
          </div>
        )}
        {visibleCars.map(car => (
          <button
            key={car.id}
            onClick={() => setSelectedCar(car)}
            className={`tab-btn ${selectedCar?.id === car.id ? 'active' : ''}`}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap', borderRadius: '10px' }}
          >
            <Car size={16} />
            {car.name}
            {car.is_guest && <Share2 size={12} title="Compartilhado comigo" />}
          </button>
        ))}
      </div>

      {selectedCar && (
        <CarDetails 
          car={selectedCar} 
          user={user} 
          openModal={openModal} 
          tableRefreshKey={tableRefreshKey} 
          isMobile={isMobile} 
          setFetchedMaintenance={setFetchedMaintenance}
          activeShares={activeShares}
          revokeShare={revokeShare}
          leaveCar={leaveCar}
        />
      )}

      <CarModals 
        isOpen={isModalOpen} 
        onClose={() => setModalOpen(false)} 
        type={modalType} 
        car={selectedCar} 
        user={user} 
        serviceName={selectedService} 
        maintenance={fetchedMaintenance}
        onSuccess={() => { 
          fetchCars(); 
          setModalOpen(false);
          setTableRefreshKey(k => k + 1); // Force revision table to re-fetch
        }} 
      />
    </div>
  );
}

function CarDetails({ car, user, openModal, tableRefreshKey, isMobile, setFetchedMaintenance, activeShares, revokeShare, leaveCar }) {
  const [activeSubTab, setActiveSubTab] = useState(() => {
    return localStorage.getItem('personal-control-car-subtab') || 'summary';
  });

  useEffect(() => {
    localStorage.setItem('personal-control-car-subtab', activeSubTab);
  }, [activeSubTab]);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div className="tabs-container" style={{ alignSelf: 'flex-start', padding: '4px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px' }}>
          <button className={`tab-btn ${activeSubTab === 'summary' ? 'active' : ''}`} onClick={() => setActiveSubTab('summary')} style={{ fontSize: '0.85rem' }}>Resumo</button>
          <button className={`tab-btn ${activeSubTab === 'revision' ? 'active' : ''}`} onClick={() => setActiveSubTab('revision')} style={{ fontSize: '0.85rem' }}>Revisão</button>
          {car.is_owner && (
            <button className={`tab-btn ${activeSubTab === 'sharing' ? 'active' : ''}`} onClick={() => setActiveSubTab('sharing')} style={{ fontSize: '0.85rem' }}>Compartilhamento</button>
          )}
        </div>

        {!car.is_owner && (
          <button 
            className="btn-secondary" 
            onClick={() => leaveCar(car.id)}
            style={{ 
              padding: '0.6rem 1rem', 
              fontSize: '0.8rem', 
              color: 'var(--danger)', 
              borderColor: 'rgba(239, 68, 68, 0.2)',
              borderRadius: '10px'
            }}
          >
            <XCircle size={14} /> Sair do Veículo
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={car.id + activeSubTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeSubTab === 'summary' && <CarSummary car={car} onLogService={() => openModal('log_service')} />}
          {activeSubTab === 'revision' && (
            <CarRevisionTable 
              car={car} 
              user={user} 
              openModal={openModal} 
              refreshKey={tableRefreshKey} 
              isMobile={isMobile}
              onFetchData={setFetchedMaintenance}
            />
          )}
          {activeSubTab === 'sharing' && car.is_owner && (
            <div className="fade-in">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Gestão de Acesso</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Veja quem tem acesso a este veículo</p>
                </div>
                <button className="btn-primary" onClick={() => openModal('share_car')} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                  <Share2 size={16} /> Compartilhar
                </button>
              </div>
              <CarSharesManager activeShares={activeShares.filter(s => s.car_id === car.id || s.car_id?.id === car.id)} onRevoke={revokeShare} />
              
              {activeShares.filter(s => s.car_id === car.id || s.car_id?.id === car.id).length === 0 && (
                <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', opacity: 0.5, border: '1px dashed var(--glass-border)' }}>
                  Este veículo ainda não foi compartilhado com ninguém.
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

function CarSummary({ car, onLogService }) {
  const [showAlerts, setShowAlerts] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(false);

  async function checkRevisionAlerts() {
    setAlertsLoading(true);
    setShowAlerts(true);
    const [templates, logs] = await Promise.all([
      supabase.from('car_service_templates').select('*'),
      supabase.from('car_maintenance').select('*').eq('car_id', car.id)
    ]);
    const allTemplates = templates.data || [];
    const allLogs = logs.data || [];
    const km = car.current_km;
    const WARN_WINDOW = 5000; // alert within 5k km

    // Find services that are pending/missing for km milestones near or past current km
    const found = [];
    allTemplates.forEach(t => {
      const log = allLogs.find(l => l.description === t.description && l.km_milestone === t.km_milestone);
      const isDone = log?.status === 'DONE' || log?.completed;
      const diff = t.km_milestone - km;
      if (!isDone) {
        if (diff < 0) {
          found.push({ ...t, urgency: 'overdue', diff: Math.abs(diff) });
        } else if (diff <= WARN_WINDOW) {
          found.push({ ...t, urgency: 'soon', diff });
        }
      }
    });
    found.sort((a, b) => {
      if (a.urgency === b.urgency) return a.diff - b.diff;
      return a.urgency === 'overdue' ? -1 : 1;
    });
    setAlerts(found);
    setAlertsLoading(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="dashboard-grid">
        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h4 style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)' }}>
            <Info size={18} /> Dados Atuais
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="stat-card" style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
              <small style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem', textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.05em' }}>Placa</small>
              <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>{car.plate || '-'}</span>
            </div>
            <div className="stat-card" style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
              <small style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem', textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.05em' }}>KM Atual</small>
              <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>{car.current_km.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h4 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Wrench size={18} /> Ações Rápidas
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <button className="btn-primary" onClick={onLogService} style={{ height: 'auto', padding: '1.25rem 1rem', flexDirection: 'column', gap: '0.5rem', borderRadius: '16px' }}>
              <CheckCircle2 size={24} /> Registrar Serviço
            </button>
            <button
              onClick={checkRevisionAlerts}
              className="glass-card"
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', border: '1px solid rgba(245,158,11,0.3)', cursor: 'pointer', background: 'rgba(245,158,11,0.05)', borderRadius: '16px', position: 'relative' }}
            >
              <AlertTriangle size={24} color="#f59e0b" />
              <span style={{ fontSize: '0.85rem' }}>Aviso Revisão</span>
            </button>
          </div>
        </div>
      </div>

      {/* Alerts Panel */}
      <AnimatePresence>
        {showAlerts && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="glass-card"
            style={{ padding: '1.5rem', border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.04)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f59e0b' }}>
                <AlertTriangle size={18} /> Alertas de Revisão
              </h4>
              <button className="icon-btn" onClick={() => setShowAlerts(false)} style={{ fontSize: '1rem', opacity: 0.6 }}>✕</button>
            </div>
            {alertsLoading ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>Verificando...</p>
            ) : alerts.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem', background: 'rgba(16,185,129,0.08)', borderRadius: '10px', border: '1px solid rgba(16,185,129,0.2)' }}>
                <CheckCircle2 size={20} color="var(--success)" />
                <p style={{ fontSize: '0.9rem', color: 'var(--success)' }}>Nenhum serviço pendente ou vencido nos próximos 5.000 km!</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {alerts.map((a, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '0.75rem 1rem', borderRadius: '10px',
                    background: a.urgency === 'overdue' ? 'rgba(239,68,68,0.07)' : 'rgba(245,158,11,0.07)',
                    border: `1px solid ${a.urgency === 'overdue' ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'}`
                  }}>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: '0.85rem' }}>{a.description}</p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Previsto para {a.km_milestone.toLocaleString()} km
                      </p>
                    </div>
                    <span style={{
                      fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                      background: a.urgency === 'overdue' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                      color: a.urgency === 'overdue' ? 'var(--danger)' : '#f59e0b',
                      border: `1px solid ${a.urgency === 'overdue' ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`
                    }}>
                      {a.urgency === 'overdue'
                        ? `Venceu há ${a.diff.toLocaleString()} km`
                        : `Faltam ${a.diff.toLocaleString()} km`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CarRevisionTable({ car, openModal, refreshKey, isMobile, onFetchData }) {
  const miles = [10000, 20000, 30000, 40000, 50000, 60000, 70000, 80000, 90000, 100000, 110000, 120000];
  const [templateServices, setTemplateServices] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState('');

  useEffect(() => {
    fetchData();
  }, [car.id, refreshKey]);

  async function fetchData() {
    setLoading(true);
    const [templates, logs] = await Promise.all([
      supabase.from('car_service_templates').select('*'),
      supabase.from('car_maintenance').select('*').eq('car_id', car.id)
    ]);
    if (templates.data) setTemplateServices(templates.data);
    if (logs.data) {
      setMaintenance(logs.data);
      if (onFetchData) onFetchData(logs.data);
    }
    setLoading(false);
  }

  async function toggleStatus(desc, km) {
    const current = maintenance.find(m => m.description === desc && m.km_milestone === km);
    let nextStatus = 'DONE';
    
    // Ciclo: PENDING (null/empty) -> DONE -> SKIPPED -> PENDING
    if (!current || current.status === 'PENDING' || !current.status) nextStatus = 'DONE';
    else if (current.status === 'DONE') nextStatus = 'SKIPPED';
    else if (current.status === 'SKIPPED') nextStatus = 'PENDING';

    // Optimistic update
    const newMaintenance = [...maintenance.filter(m => !(m.description === desc && m.km_milestone === km))];
    newMaintenance.push({ 
      car_id: car.id, 
      description: desc, 
      km_milestone: km, 
      status: nextStatus, 
      completed: nextStatus === 'DONE' 
    });
    setMaintenance(newMaintenance);

    const { error } = await supabase.from('car_maintenance').upsert({
      car_id: car.id,
      description: desc,
      km_milestone: km,
      status: nextStatus,
      completed: nextStatus === 'DONE',
      notes: current?.notes || null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'car_id,description,km_milestone' });

    if (error) {
      console.error("Error updating status:", error);
      fetchData(); // Rollback
    }
  }

  // Combine: template services + any manually added services for this car
  const allServiceNames = [...new Set([
    ...templateServices.map(s => s.description),
    ...maintenance.map(m => m.description)
  ])].sort();

  const serviceNames = filterText.trim()
    ? allServiceNames.filter(n => n.toLowerCase().includes(filterText.toLowerCase()))
    : allServiceNames;

  async function deleteServiceRow(desc) {
    if (!window.confirm(`Excluir o serviço "${desc}" e todo o seu histórico para este carro?`)) return;
    await supabase.from('car_maintenance').delete()
      .eq('car_id', car.id)
      .eq('description', desc);
    fetchData();
  }

  if (loading) return <div className="skeleton-loader" style={{ height: '300px', borderRadius: '15px' }}></div>;

  return (
    <div className="glass-card" style={{ padding: '0', overflow: 'hidden', border: '1px solid var(--glass-border)' }}>
      <div className="revision-table-container" style={{ overflowX: 'auto', width: '100%' }}>
        <table className="finance-table" style={{ minWidth: '1000px', borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 10, borderRight: '1px solid var(--glass-border)', boxShadow: '4px 0 10px rgba(0,0,0,0.2)', minWidth: isMobile ? 140 : 220 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="text"
                    placeholder={isMobile ? "Filtrar..." : "Filtrar serviço..."}
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    style={{ 
                      background: 'rgba(255,255,255,0.05)', 
                      border: '1px solid var(--glass-border)', 
                      borderRadius: '8px', 
                      padding: '4px 6px', 
                      fontSize: '0.65rem',
                      flex: 1,
                      minWidth: 0,
                      color: 'var(--text-main)'
                    }}
                  />
                  <button 
                    className="icon-btn" 
                    onClick={() => openModal('log_service')}
                    style={{ opacity: 0.8, padding: 2, flexShrink: 0 }}
                  >
                    <Plus size={isMobile ? 14 : 16} />
                  </button>
                </div>
              </th>
              {miles.map(km => (
                <th key={km} style={{ textAlign: 'center', minWidth: '85px', fontSize: '0.75rem' }}>
                   <div style={{ fontSize: '0.6rem', opacity: 0.5, marginBottom: '2px' }}>KM</div>
                   {km/1000}k
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {serviceNames.map(desc => {
              return (
              <tr key={desc}>
                <td style={{ 
                  position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 5, 
                  borderRight: '1px solid var(--glass-border)', boxShadow: '4px 0 10px rgba(0,0,0,0.1)', 
                  fontSize: '0.75rem', padding: isMobile ? '8px 8px' : '8px 12px', textAlign: 'left',
                  minWidth: isMobile ? 140 : 220
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.3rem', width: '100%' }}>
                    <span style={{ fontWeight: 500, flex: 1, lineHeight: '1.2', wordBreak: 'break-word', paddingRight: '4px' }}>{desc}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', marginLeft: 'auto' }}>
                      <button
                        className="icon-btn"
                        onClick={() => openModal('service_note', desc)}
                        title="Adicionar Nota"
                        style={{ opacity: 0.6, padding: 4, flexShrink: 0 }}
                      >
                        <MessageSquare size={13} />
                      </button>
                      <button
                        className="icon-btn"
                        onClick={() => deleteServiceRow(desc)}
                        title={`Remover linha "${desc}"`}
                        style={{ opacity: 0.4, padding: 4, flexShrink: 0, color: 'var(--danger)' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </td>
                {miles.map(km => {
                  const isRequired = templateServices.find(s => s.description === desc && s.km_milestone === km);
                  const log = maintenance.find(m => m.description === desc && m.km_milestone === km);
                  
                  // Se não tem log ou status é nulo, tenta usar completed como fallback para visualização
                  const status = log?.status || (log?.completed ? 'DONE' : 'PENDING');

                  return (
                    <td key={km} style={{ textAlign: 'center', padding: '8px' }}>
                      <motion.div 
                        whileTap={{ scale: 0.8 }}
                        onClick={() => toggleStatus(desc, km)}
                        style={{ 
                          width: 28, height: 28, margin: '0 auto', borderRadius: '8px', position: 'relative',
                          background: status === 'DONE' ? 'rgba(16, 185, 129, 0.1)' : 
                                      status === 'SKIPPED' ? 'rgba(239, 68, 68, 0.1)' : 
                                      'rgba(255, 255, 255, 0.03)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          border: `1px solid ${status === 'DONE' ? 'var(--success)' : status === 'SKIPPED' ? 'var(--danger)' : 'var(--glass-border)'}`,
                          cursor: 'pointer', transition: 'all 0.2s',
                          opacity: isRequired ? 1 : 0.6
                        }}
                      >
                        {status === 'DONE' && <CheckCircle2 size={16} color="var(--success)" />}
                        {status === 'SKIPPED' && <XCircle size={16} color="var(--danger)" />}
                        {(status === 'PENDING' || !status) && <Clock size={14} color="var(--text-muted)" />}
                        
                        {log?.notes && (
                          <div 
                            style={{ 
                              position: 'absolute', top: -2, right: -2, 
                              width: 6, height: 6, borderRadius: '50%', 
                              background: 'var(--primary)', border: '1px solid var(--bg-card)',
                              pointerEvents: 'none' // Não intercepta o clique do toggle
                            }} 
                          />
                        )}
                      </motion.div>
                    </td>
                  );
                })}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '0.75rem 1.5rem', background: 'rgba(255,255,255,0.02)', borderTop: '1px solid var(--glass-border)', display: 'flex', gap: '1.5rem', fontSize: '0.7rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><CheckCircle2 size={12} color="var(--success)" /> Concluído</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Clock size={12} color="var(--text-muted)" /> Pendente</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><XCircle size={12} color="var(--danger)" /> Pular/Não Feito</div>
        <div style={{ marginLeft: 'auto', opacity: 0.5 }}>Clique no ícone para alternar status</div>
      </div>
    </div>
  );
}

function CarModals({ isOpen, onClose, type, car, user, serviceName, onSuccess, maintenance = [] }) {
  const [formData, setFormData] = useState({ name: car?.name || '', plate: car?.plate || '', current_km: car?.current_km || 0 });
  const [serviceData, setServiceData] = useState({ description: '', km_milestone: 10000, status: 'DONE' });
  const [noteData, setNoteData] = useState({ description: '', km_milestone: 10000, notes: '' });
  const [templateNames, setTemplateNames] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (car && type === 'edit_car') {
      setFormData({ name: car.name, plate: car.plate || '', current_km: car.current_km });
    }
    if (type === 'log_service') {
      // Load unique service names from templates
      supabase.from('car_service_templates').select('description')
        .then(({ data }) => {
          if (data) {
            const unique = [...new Set(data.map(t => t.description))].sort();
            setTemplateNames(unique);
            if (unique.length > 0) setServiceData(prev => ({ ...prev, description: unique[0] }));
          }
        });
    }
    if (type === 'service_note' && serviceName) {
      if (typeof serviceName === 'object') {
        setNoteData({ description: serviceName.desc, km_milestone: serviceName.km, notes: serviceName.notes });
      } else {
        const firstWithNote = maintenance.find(m => m.description === serviceName && m.notes);
        setNoteData({ 
          description: serviceName, 
          km_milestone: firstWithNote?.km_milestone || 10000, 
          notes: firstWithNote?.notes || '' 
        });
      }
    }
  }, [car, type, serviceName]);

  // Auto-load notes when KM changes in modal
  useEffect(() => {
    if (type === 'service_note' && noteData.description) {
      const existing = maintenance.find(m => 
        m.description === noteData.description && 
        m.km_milestone === noteData.km_milestone
      );
      if (existing?.notes !== undefined) {
        setNoteData(prev => ({ ...prev, notes: existing.notes || '' }));
      }
    }
  }, [noteData.km_milestone, noteData.description]);

  if (!isOpen) return null;

  async function handleSaveNote() {
    if (!noteData.notes.trim()) return;
    setLoading(true);
    // Verificar se já existe log para esse KM
    const { data: existing } = await supabase.from('car_maintenance')
      .select('status')
      .eq('car_id', car.id)
      .eq('description', noteData.description)
      .eq('km_milestone', noteData.km_milestone)
      .single();

    const { error } = await supabase.from('car_maintenance').upsert({
      car_id: car.id,
      description: noteData.description,
      km_milestone: noteData.km_milestone,
      notes: noteData.notes,
      status: existing?.status || 'PENDING',
      updated_at: new Date().toISOString()
    }, { onConflict: 'car_id,description,km_milestone' });

    if (!error) {
      onSuccess();
    } else {
      console.error('Erro ao salvar nota:', error);
      alert('Erro ao salvar observação.');
    }
    setLoading(false);
  }

  async function handleAddCar() {
    setLoading(true);
    const { error } = await supabase.from('cars').insert({ 
      user_id: user.id, 
      name: formData.name, 
      plate: formData.plate, 
      current_km: formData.current_km 
    });
    if (!error) onSuccess();
    setLoading(false);
  }

  async function handleUpdateCar() {
    setLoading(true);
    const { error } = await supabase.from('cars').update({ 
      name: formData.name, 
      plate: formData.plate, 
      current_km: formData.current_km 
    }).eq('id', car.id);
    if (!error) onSuccess();
    setLoading(false);
  }

  async function handleLogService() {
    if (!serviceData.description.trim()) {
      alert('Preencha a descrição do serviço.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.from('car_maintenance').upsert({
      car_id: car.id,
      description: serviceData.description.trim(),
      km_milestone: parseInt(serviceData.km_milestone.toString()),
      status: serviceData.status,
      completed: serviceData.status === 'DONE',
      updated_at: new Date().toISOString()
    }, { onConflict: 'car_id,description,km_milestone' });
    
    if (!error) {
      setServiceData({ description: '', km_milestone: 10000, status: 'DONE' });
      onSuccess();
    } else {
      console.error('Erro ao salvar serviço:', error);
      alert('Erro ao salvar. Tente novamente.');
    }
    setLoading(false);
  }

  async function handleShareCar(email, permission) {
    setLoading(true);
    const { error } = await supabase.from('car_shares').insert({
      car_id: car.id,
      shared_by: user.id,
      shared_with_email: email,
      permission: permission,
      status: 'PENDING'
    });
    if (!error) {
      alert('Convite enviado com sucesso!');
      onClose();
    } else {
      console.error('Erro ao compartilhar:', error);
      alert('Erro ao enviar convite: ' + (error.message || 'Tente novamente.'));
    }
    setLoading(false);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="modal-content glass-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
        <button className="icon-btn" onClick={onClose} style={{ position: 'absolute', top: '1.5rem', right: '1.5rem' }}><XCircle /></button>
        
        {(type === 'add_car' || type === 'edit_car') && (
          <>
            <h3>{type === 'add_car' ? 'Novo Veículo' : 'Editar Veículo'}</h3>
            <div className="form-grid" style={{ marginTop: '1.5rem' }}>
              <div className="input-group" style={{ gridColumn: 'span 2' }}>
                <label>Nome do Veículo</label>
                <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Ex: Ônix Premier" />
              </div>
              <div className="input-group">
                <label>Placa</label>
                <input type="text" value={formData.plate} onChange={e => setFormData({...formData, plate: e.target.value})} maxLength={8} />
              </div>
              <div className="input-group">
                <label>KM Atual</label>
                <input type="number" value={formData.current_km} onChange={e => setFormData({...formData, current_km: parseInt(e.target.value)})} />
              </div>
            </div>
            <button className="btn-primary" onClick={type === 'add_car' ? handleAddCar : handleUpdateCar} disabled={loading} style={{ width: '100%', marginTop: '2rem', justifyContent: 'center' }}>
              {loading ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </>
        )}

        {type === 'log_service' && (
          <>
            <h3>Registrar Serviço</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Digite o serviço realizado. Será exibido como uma linha na tabela de revisão.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
              <div className="input-group">
                <label>Serviço</label>
                <input
                  type="text"
                  list="service-suggestions"
                  value={serviceData.description}
                  onChange={e => setServiceData({...serviceData, description: e.target.value})}
                  placeholder="Ex: Troca de Pneus, Correia Dentada..."
                  autoFocus
                />
                <datalist id="service-suggestions">
                  {templateNames.map(name => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
              <div className="input-group">
                <label>Quilometragem (KM)</label>
                <select
                  value={serviceData.km_milestone}
                  onChange={e => setServiceData({...serviceData, km_milestone: parseInt(e.target.value)})}
                >
                  {[10000, 20000, 30000, 40000, 50000, 60000, 70000, 80000, 90000, 100000, 110000, 120000].map(k => (
                    <option key={k} value={k}>{k.toLocaleString()} km</option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label>Status</label>
                <select
                  value={serviceData.status}
                  onChange={e => setServiceData({...serviceData, status: e.target.value})}
                >
                  <option value="DONE">Concluído ✔</option>
                  <option value="PENDING">Pendente ⏰</option>
                  <option value="SKIPPED">Pular ❌</option>
                </select>
              </div>
            </div>
            <button
              className="btn-primary"
              onClick={handleLogService}
              disabled={loading || !serviceData.description.trim()}
              style={{ width: '100%', marginTop: '2rem', justifyContent: 'center' }}
            >
              {loading ? 'Registrando...' : 'Salvar Serviço'}
            </button>
          </>
        )}

        {type === 'service_note' && (
          <>
            <h3>Observações do Serviço</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Detalhamento para: <strong>{noteData.description}</strong></p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
              <div className="input-group">
                <label>KM Milestone</label>
                <select
                  value={noteData.km_milestone}
                  onChange={e => setNoteData({...noteData, km_milestone: parseInt(e.target.value)})}
                >
                  {[10000, 20000, 30000, 40000, 50000, 60000, 70000, 80000, 90000, 100000, 110000, 120000].map(k => (
                    <option key={k} value={k}>{k.toLocaleString()} km</option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label>O que foi feito? (Ex: Motivo da manutenção, marca da peça...)</label>
                <textarea
                  value={noteData.notes}
                  onChange={e => setNoteData({...noteData, notes: e.target.value})}
                  placeholder="Descreva os detalhes aqui..."
                  style={{ 
                    width: '100%', minHeight: '100px', padding: '10px', 
                    background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', 
                    borderRadius: '8px', color: 'inherit', outline: 'none', fontSize: '0.85rem'
                  }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '2rem' }}>
              <button
                className="btn-primary"
                onClick={handleSaveNote}
                disabled={loading}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                {loading ? 'Salvando...' : 'Salvar Nota'}
              </button>
              {noteData.notes && (
                <button
                  className="icon-btn"
                  onClick={async () => {
                    if (window.confirm("Remover esta observação?")) {
                      setNoteData({...noteData, notes: ''});
                      // Auto-save empty note to clear it
                      setLoading(true);
                      await supabase.from('car_maintenance').update({ notes: null })
                        .eq('car_id', car.id)
                        .eq('description', noteData.description)
                        .eq('km_milestone', noteData.km_milestone);
                      onSuccess();
                    }
                  }}
                  style={{ color: 'var(--danger)', background: 'rgba(239,68,68,0.1)', borderRadius: '10px', padding: '0 12px' }}
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          </>
        )}

        {type === 'share_car' && <ShareModal car={car} onShare={handleShareCar} loading={loading} />}
      </motion.div>
    </div>
  );
}

function ShareModal({ car, onShare, loading }) {
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState('READ');
  return (
    <>
      <h3>Compartilhar Veículo</h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Convide alguém para visualizar ou editar este veículo.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
        <div className="input-group">
          <label>E-mail do convidado</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" />
        </div>
        <div className="input-group">
          <label>Permissão</label>
          <select value={permission} onChange={e => setPermission(e.target.value)}>
            <option value="READ">Somente visualizar</option>
            <option value="WRITE">Visualizar e editar</option>
          </select>
        </div>
      </div>
      <button
        className="btn-primary"
        onClick={() => onShare(email, permission)}
        disabled={loading || !email}
        style={{ width: '100%', marginTop: '2rem', justifyContent: 'center' }}
      >
        {loading ? 'Enviando...' : 'Enviar Convite'}
      </button>
    </>
  );
}

function ServiceTemplatesManager({ user }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ description: '', km_milestone: 10000 });

  useEffect(() => { fetchTemplates(); }, []);

  async function fetchTemplates() {
    setLoading(true);
    const { data } = await supabase
      .from('car_service_templates')
      .select('*')
      .order('description')
      .order('km_milestone');
    if (data) setTemplates(data);
    setLoading(false);
  }

  async function addTemplate() {
    if (!form.description.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('car_service_templates').insert({
      description: form.description.trim(),
      km_milestone: parseInt(form.km_milestone),
      user_id: user.id
    });
    if (!error) {
      setForm({ description: '', km_milestone: 10000 });
      fetchTemplates();
    } else {
      alert('Erro ao adicionar: ' + error.message);
    }
    setSaving(false);
  }

  async function deleteTemplate(id) {
    await supabase.from('car_service_templates').delete().eq('id', id);
    fetchTemplates();
  }

  const grouped = templates.reduce((acc, t) => {
    if (!acc[t.description]) acc[t.description] = [];
    acc[t.description].push(t);
    return acc;
  }, {});

  const existingNames = Object.keys(grouped).sort();

  return (
    <div className="glass-card" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
          <Wrench size={18} />
        </div>
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Plano de Revisao -- Milestones</h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Define em quais quilometragens cada servico deve ser realizado.
            <span style={{ opacity: 0.6, marginLeft: 6 }}>cadeado = padrao do sistema (somente leitura)</span>
          </p>
        </div>
      </div>

      {loading ? (
        <div className="skeleton-loader" style={{ height: 120, borderRadius: 10 }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.5rem', maxHeight: 400, overflowY: 'auto' }}>
          {existingNames.map(desc => (
            <div key={desc} style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', padding: '0.6rem 1rem', background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid var(--glass-border)' }}>
              <span style={{ fontWeight: 600, fontSize: '0.82rem', minWidth: 200, paddingTop: 4 }}>{desc}</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', flex: 1 }}>
                {grouped[desc].map(t => (
                  <span key={t.id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: '0.72rem', padding: '3px 10px', borderRadius: 20, fontWeight: 600,
                    background: t.user_id ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${t.user_id ? 'rgba(99,102,241,0.3)' : 'var(--glass-border)'}`,
                    color: t.user_id ? 'var(--primary)' : 'var(--text-muted)'
                  }}>
                    {t.km_milestone.toLocaleString()} km
                    {t.user_id
                      ? <button onClick={() => deleteTemplate(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 0, lineHeight: 1, marginLeft: 2 }} title="Remover">x</button>
                      : <span title="Template do sistema" style={{ opacity: 0.4, marginLeft: 2 }}>lock</span>
                    }
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '1rem' }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem', fontWeight: 500 }}>Adicionar milestone personalizado</p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="input-group" style={{ flex: 2, minWidth: 180, marginBottom: 0 }}>
            <label style={{ fontSize: '0.72rem' }}>Servico</label>
            <input
              type="text" list="template-names-mgr"
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Ex: Troca de Correia Dentada"
              style={{ fontSize: '0.82rem' }}
            />
            <datalist id="template-names-mgr">
              {existingNames.map(n => <option key={n} value={n} />)}
            </datalist>
          </div>
          <div className="input-group" style={{ flex: 1, minWidth: 130, marginBottom: 0 }}>
            <label style={{ fontSize: '0.72rem' }}>Quilometragem</label>
            <select value={form.km_milestone} onChange={e => setForm({ ...form, km_milestone: parseInt(e.target.value) })} style={{ fontSize: '0.82rem' }}>
              {[5000,10000,15000,20000,25000,30000,40000,50000,60000,70000,80000,90000,100000,120000,150000].map(k => (
                <option key={k} value={k}>{k.toLocaleString()} km</option>
              ))}
            </select>
          </div>
          <button className="btn-primary" onClick={addTemplate} disabled={saving || !form.description.trim()} style={{ padding: '8px 16px', fontSize: '0.82rem', height: 38 }}>
            {saving ? '...' : 'Adicionar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CarSharesManager({ activeShares, onRevoke }) {
  if (activeShares.length === 0) return null;

  return (
    <div className="glass-card" style={{ padding: '1.5rem', marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
          <Users size={18} />
        </div>
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Compartilhamentos Ativos</h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Gerencie quem tem acesso aos seus veículos.</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {activeShares.map(share => (
          <div key={share.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
            <div>
              <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>{share.car_id?.name}</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Mail size={12} /> {share.shared_with_email} 
                <span style={{ fontSize: '0.65rem', background: 'rgba(99,102,241,0.1)', color: 'var(--primary)', padding: '2px 6px', borderRadius: '10px' }}>{share.permission}</span>
                {share.status === 'PENDING' && <span style={{ fontSize: '0.65rem', color: '#f59e0b' }}>• Pendente</span>}
              </p>
            </div>
            <button className="icon-btn" onClick={() => onRevoke(share.id)} style={{ color: 'var(--danger)' }} title="Revogar acesso">
              <Trash2 size={18} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
