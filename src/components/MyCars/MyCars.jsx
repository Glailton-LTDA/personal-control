import React, { useState, useEffect, useCallback } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { 
  Car, 
  Plus, 
  Wrench, 
  Trash2, 
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Edit2,
  Users,
  Mail,
  Share2,
  MessageSquare,
  Eye,
  EyeOff,
  Filter
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useEncryption } from '../../contexts/EncryptionContext';
import { confirmToast } from '../../lib/toast';
import toast from 'react-hot-toast';
import CarModal from './CarModal';
import ServiceTemplatesManager from './ServiceTemplatesManager';
import CarSharesManager from './CarSharesManager';

import { milestones, defaultServiceTemplates } from './constants';

export default function MyCars({ user, refreshKey, mode = 'list' }) {
  const { decryptObject, encryptObject } = useEncryption();
  const [cars, setCars] = useState([]);
  const [sharedCars, setSharedCars] = useState([]);
  const [activeShares, setActiveShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCar, setSelectedCar] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('add_car');
  const [activeSubTab, setActiveSubTab] = useState(() => {
    return localStorage.getItem('personal-control-car-subtab') || 'summary';
  });
  const [showHidden, setShowHidden] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [serviceTemplates, setServiceTemplates] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [invitations, setInvitations] = useState([]);

  useEffect(() => {
    localStorage.setItem('personal-control-car-subtab', activeSubTab);
  }, [activeSubTab]);

  const fetchServiceTemplates = useCallback(async () => {
    const { data } = await supabase
      .from('car_service_templates')
      .select('*');
    
    const templates = [...defaultServiceTemplates];
    if (data) {
      data.forEach(t => {
        if (!templates.find(dt => dt.description === t.description && dt.km_milestone === t.km_milestone)) {
          templates.push(t);
        }
      });
    }
    setServiceTemplates(templates);
  }, []);

  const fetchCars = useCallback(async () => {
    setLoading(true);
    
    const { data: own } = await supabase
      .from('cars')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    
    const { data: shared } = await supabase
      .from('car_shares')
      .select('*, car_id (*)')
      .eq('shared_with_email', user.email)
      .eq('status', 'ACCEPTED');
 
    const { data: pends } = await supabase
      .from('car_shares')
      .select('*, car_id (*)')
      .eq('shared_with_email', user.email)
      .eq('status', 'PENDING');
 
    const { data: active } = await supabase
      .from('car_shares')
      .select('*, car_id (*)')
      .eq('shared_by', user.id);
 
    const decryptedOwn = await decryptObject(own || [], ['name', 'plate', 'make', 'model'], { resourceType: 'CAR' });
    
    const decryptShareList = async (list) => {
      if (!list) return [];
      return await Promise.all(list.map(async (item) => {
        if (!item.car_id) return item;
        const decCar = await decryptObject([item.car_id], ['name', 'plate', 'make', 'model'], {
          resourceId: item.car_id.id,
          resourceType: 'CAR'
        });
        return { ...item, car_id: decCar[0] };
      }));
    };

    const decryptedShared = await decryptShareList(shared);
    const decryptedPends = await decryptShareList(pends);
    const decryptedActive = await decryptShareList(active);

    setCars(decryptedOwn);
    setSharedCars(decryptedShared?.map(s => s.car_id) || []);
    setInvitations(decryptedPends || []);
    setActiveShares(decryptedActive || []);
 
    if (!selectedCar) {
      const firstVisible = decryptedOwn?.find(c => !c.is_hidden) || decryptedShared?.find(s => !s.car_id.is_hidden)?.car_id;
      if (firstVisible) {
        setSelectedCar(firstVisible);
      } else if (decryptedOwn?.length > 0) {
        setSelectedCar(decryptedOwn[0]);
      } else if (decryptedShared?.length > 0) {
        setSelectedCar(decryptedShared[0].car_id);
      }
    }
 
    setLoading(false);
  }, [user.id, user.email, decryptObject, selectedCar]);

  const fetchMaintenance = useCallback(async (carId) => {
    const { data } = await supabase
      .from('car_maintenance')
      .select('*')
      .eq('car_id', carId);
    
    const decrypted = await decryptObject(data || [], ['notes'], { 
      resourceId: carId, 
      resourceType: 'CAR' 
    });
    setMaintenance(decrypted);
  }, [decryptObject]);

  useEffect(() => {
    fetchCars();
    fetchServiceTemplates();
  }, [user, refreshKey, fetchCars, fetchServiceTemplates]);

  useEffect(() => {
    if (selectedCar) {
      fetchMaintenance(selectedCar.id);
    }
  }, [selectedCar, fetchMaintenance]);

  useEffect(() => {
    const handleAddCar = () => {
      setModalType('add_car');
      setIsModalOpen(true);
    };
    window.addEventListener('open-add-car-modal', handleAddCar);
    return () => window.removeEventListener('open-add-car-modal', handleAddCar);
  }, []);

  async function toggleServiceStatus(desc, km, currentStatus) {
    let nextStatus;
    if (currentStatus === 'DONE') nextStatus = 'SKIPPED';
    else if (currentStatus === 'SKIPPED') nextStatus = 'PENDING';
    else nextStatus = 'DONE';
    
    const existing = maintenance.find(m => m.description === desc && m.km_milestone === km);
    
    const encrypted = await encryptObject({
      car_id: selectedCar.id,
      description: desc,
      km_milestone: km,
      status: nextStatus,
      completed: nextStatus === 'DONE',
      notes: existing?.notes || null,
      updated_at: new Date().toISOString()
    }, ['notes'], { resourceId: selectedCar.id, resourceType: 'CAR' });

    const { error } = await supabase.from('car_maintenance').upsert(encrypted, { onConflict: 'car_id,description,km_milestone' });

    if (!error) {
      fetchMaintenance(selectedCar.id);
      const statusLabels = { 'DONE': 'Concluído', 'SKIPPED': 'Não será feito', 'PENDING': 'Pendente' };
      toast.success(`Status: ${statusLabels[nextStatus]}`);
    } else {
      toast.error('Erro ao atualizar status.');
    }
  }

  async function handleAcceptInvitation(inviteId) {
    const { error } = await supabase
      .from('car_shares')
      .update({ status: 'ACCEPTED' })
      .eq('id', inviteId);
    
    if (!error) {
      toast.success('Convite aceito!');
      fetchCars();
    }
  }

  async function handleRejectInvitation(inviteId) {
    const { error } = await supabase
      .from('car_shares')
      .delete()
      .eq('id', inviteId);
    
    if (!error) {
      toast.success('Convite recusado.');
      fetchCars();
    }
  }

  async function handleRevokeShare(shareId) {
    confirmToast("Revogar acesso deste usuário?", async () => {
      const { error } = await supabase
        .from('car_shares')
        .delete()
        .eq('id', shareId);
      
      if (!error) {
        toast.success('Acesso revogado');
        fetchCars();
      }
    }, { danger: true });
  }

  async function handleDeleteCar(carId) {
    confirmToast("Tem certeza que deseja excluir este veículo? Todos os dados de manutenção serão perdidos.", async () => {
      const { error } = await supabase.from('cars').delete().eq('id', carId);
      if (!error) {
        toast.success('Veículo excluído');
        setSelectedCar(null);
        fetchCars();
      }
    }, { danger: true });
  }

  async function handleToggleArchive(car) {
    const { error } = await supabase
      .from('cars')
      .update({ is_hidden: !car.is_hidden })
      .eq('id', car.id);
    
    if (!error) {
      toast.success(car.is_hidden ? 'Veículo restaurado' : 'Veículo arquivado');
      // If we archive the current car, we might want to select another one
      if (!car.is_hidden) setSelectedCar(null);
      fetchCars();
    } else {
      toast.error('Erro ao atualizar status do veículo.');
    }
  }

  if (mode === 'admin') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Filter size={18} /> Configurações de Visualização
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <input 
              type="checkbox" 
              id="show-hidden-global"
              checked={showHidden}
              onChange={e => setShowHidden(e.target.checked)}
            />
            <label htmlFor="show-hidden-global" style={{ cursor: 'pointer' }}>Mostrar veículos arquivados na lista principal</label>
          </div>
        </div>
        <ServiceTemplatesManager user={user} />
        <CarSharesManager activeShares={activeShares} onRevoke={handleRevokeShare} />
      </div>
    );
  }

  if (loading) return <div className="skeleton-loader" style={{ height: '400px' }} />;

  const visibleCars = cars.filter(c => showHidden || !c.is_hidden);
  const visibleShared = sharedCars.filter(c => showHidden || !c.is_hidden);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {invitations.length > 0 && (
        <div className="glass-card" style={{ border: '1px solid var(--primary)', background: 'rgba(99, 102, 241, 0.05)', padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{ color: 'var(--primary)' }}><Mail size={24} /></div>
            <div>
              <h3 style={{ fontSize: '1.1rem' }}>Novos Convites de Veículos</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Você foi convidado para acessar os veículos abaixo.</p>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {invitations.map(invite => (
              <div key={invite.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                <span style={{ fontWeight: 600 }}>{invite.car_id.name} ({invite.car_id.plate})</span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn-primary" onClick={() => handleAcceptInvitation(invite.id)} style={{ padding: '6px 12px', fontSize: '0.8rem' }}>Aceitar</button>
                  <button className="icon-btn" onClick={() => handleRejectInvitation(invite.id)} style={{ color: 'var(--danger)' }}><XCircle size={20} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Car Selection Header */}
      <div className="glass-card" style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, minWidth: '280px' }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
            <Car size={24} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>Veículo Selecionado</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <select 
                className="glass-input"
                value={selectedCar?.id || ''} 
                onChange={(e) => setSelectedCar([...cars, ...sharedCars].find(c => c.id === e.target.value))}
                style={{ padding: '8px 12px', height: 'auto', fontWeight: 600, flex: 1 }}
              >
                <optgroup label="Meus Veículos">
                  {visibleCars.map(car => (
                    <option key={car.id} value={car.id}>{car.name} {car.is_hidden ? '(Arquivado)' : ''}</option>
                  ))}
                </optgroup>
                {visibleShared.length > 0 && (
                  <optgroup label="Compartilhados">
                    {visibleShared.map(car => (
                      <option key={car.id} value={car.id}>{car.name} {car.is_hidden ? '(Arquivado)' : ''}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={() => { setModalType('add_car'); setIsModalOpen(true); }}
            className="btn-secondary"
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            <Plus size={18} /> Novo Veículo
          </button>
          
          {selectedCar && (
            <button
              className="icon-btn"
              onClick={() => { setModalType('edit_car'); setIsModalOpen(true); }}
              title="Editar Veículo"
            >
              <Edit2 size={18} />
            </button>
          )}
        </div>
      </div>

      {selectedCar ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          <div style={{ display: 'flex', gap: '1.5rem', borderBottom: '1px solid var(--glass-border)', padding: '0 1rem' }}>
            <button
              className={`tab-btn ${activeSubTab === 'summary' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('summary')}
              style={{ paddingBottom: '1rem', fontSize: '0.9rem', fontWeight: 600, borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderBottom: activeSubTab === 'summary' ? '2px solid var(--primary)' : 'none', color: activeSubTab === 'summary' ? 'var(--primary)' : 'var(--text-muted)', background: 'none', cursor: 'pointer' }}
            >
              Resumo
            </button>
            <button
              className={`tab-btn ${activeSubTab === 'revision' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('revision')}
              style={{ paddingBottom: '1rem', fontSize: '0.9rem', fontWeight: 600, borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderBottom: activeSubTab === 'revision' ? '2px solid var(--primary)' : 'none', color: activeSubTab === 'revision' ? 'var(--primary)' : 'var(--text-muted)', background: 'none', cursor: 'pointer' }}
            >
              Revisão
            </button>
          </div>

          <AnimatePresence mode="wait">
            <Motion.div
              key={activeSubTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              {activeSubTab === 'summary' ? (
                <CarSummary 
                  car={selectedCar} 
                  maintenance={maintenance}
                  onEdit={() => { setModalType('edit_car'); setIsModalOpen(true); }}
                  onDelete={() => handleDeleteCar(selectedCar.id)}
                  onShare={() => { setModalType('share_car'); setIsModalOpen(true); }}
                  onArchive={() => handleToggleArchive(selectedCar)}
                  isOwner={selectedCar.user_id === user.id}
                />
              ) : (
                <CarRevisionTable 
                  car={selectedCar} 
                  maintenance={maintenance} 
                  templates={serviceTemplates}
                  isMobile={isMobile}
                  onLogService={(data) => { 
                    setModalType(data ? { type: 'log_service', ...data } : 'log_service'); 
                    setIsModalOpen(true); 
                  }}
                  onToggleStatus={toggleServiceStatus}
                  onAddNote={(desc) => { 
                    setModalType({ type: 'service_notes_list', description: desc }); 
                    setIsModalOpen(true); 
                  }}
                  canEdit={true}
                />
              )}
            </Motion.div>
          </AnimatePresence>
        </div>
      ) : (
        <div className="glass-card" style={{ padding: '4rem', textAlign: 'center' }}>
          <Car size={48} style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', opacity: 0.3 }} />
          <h3 style={{ color: 'var(--text-muted)' }}>Nenhum veículo cadastrado</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Adicione seu primeiro carro para começar o controle de manutenção.</p>
        </div>
      )}

      {isModalOpen && (
        <CarModal 
          isOpen={isModalOpen} 
          onClose={() => setIsModalOpen(false)} 
          type={modalType}
          car={selectedCar}
          maintenance={maintenance}
          user={user}
          onSuccess={() => {
            setIsModalOpen(false);
            fetchMaintenance(selectedCar.id);
            fetchCars();
          }}
        />
      )}
    </div>
  );
}

function CarSummary({ car, maintenance, onEdit, onDelete, onShare, onArchive, isOwner }) {
  const nextMilestone = milestones.find(m => m > car.current_km) || 120000;
  const kmRemaining = nextMilestone - car.current_km;
  const progress = Math.max(0, Math.min(100, ((car.current_km % 10000) / 10000) * 100));
  const totalSpent = maintenance.reduce((sum, m) => sum + (parseFloat(m.amount) || 0), 0);
  
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
      
      <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Wrench size={18} style={{ color: car.is_hidden ? 'var(--text-muted)' : 'var(--primary)' }} /> 
              {car.name}
              {car.is_hidden && (
                <span style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, color: 'var(--text-muted)' }}>ARQUIVADO</span>
              )}
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Status Geral do Veículo • <b>{car.plate}</b> • {(car.current_km || 0).toLocaleString()} KM</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {isOwner && (
              <>
                <button className="icon-btn" onClick={onArchive} title={car.is_hidden ? "Restaurar" : "Arquivar"}>
                  {car.is_hidden ? <Eye size={18} /> : <EyeOff size={18} />}
                </button>
                <button className="icon-btn" onClick={onEdit} title="Editar"><Edit2 size={18} /></button>
                <button className="icon-btn" onClick={onShare} title="Compartilhar"><Share2 size={18} /></button>
                <button className="icon-btn" onClick={onDelete} style={{ color: 'var(--danger)' }} title="Excluir"><Trash2 size={18} /></button>
              </>
            )}
          </div>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem', fontSize: '0.8rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Próximo Checkpoint</span>
            <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{nextMilestone.toLocaleString()} KM</span>
          </div>
          <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden', marginBottom: '0.6rem' }}>
            <Motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              style={{ height: '100%', background: 'var(--primary)', boxShadow: '0 0 10px rgba(99, 102, 241, 0.4)' }} 
            />
          </div>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0 }}>
            Restam <b>{kmRemaining.toLocaleString()} KM</b>
          </p>
        </div>
      </div>

      <div className="glass-card premium-gradient" style={{ padding: '1.5rem', color: 'white', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <p style={{ fontSize: '0.8rem', opacity: 0.9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Total Investido</p>
        <h2 style={{ fontSize: '2rem', fontWeight: 900, margin: 0 }}>
          <small style={{ fontSize: '1rem', opacity: 0.8, fontWeight: 600, marginRight: '4px' }}>R$</small>
          {totalSpent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </h2>
        <p style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.5rem' }}>Histórico total de manutenções registradas.</p>
      </div>

      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertTriangle size={18} style={{ color: 'var(--warning)' }} /> Alertas de Manutenção
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', background: 'rgba(16, 185, 129, 0.05)', borderRadius: '8px' }}>
            <div style={{ color: 'var(--success)' }}><CheckCircle2 size={18} /></div>
            <p style={{ fontSize: '0.75rem', margin: 0 }}>Documentação e Seguro em dia.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', background: 'rgba(234, 179, 8, 0.05)', borderRadius: '8px' }}>
            <div style={{ color: 'var(--warning)' }}><AlertTriangle size={18} /></div>
            <p style={{ fontSize: '0.75rem', margin: 0 }}>Verificar freios nos {nextMilestone.toLocaleString()} KM.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function CarRevisionTable({ car, maintenance, templates, onLogService, onToggleStatus, onAddNote, canEdit, isMobile }) {
  const miles = milestones;
  
  const templateNames = Array.from(new Set([
    ...templates.map(t => t.description),
    ...maintenance.filter(m => m.description !== 'Custo Total da Revisão').map(m => m.description)
  ])).sort();

  const getMaintenanceEntry = (desc, km) => {
    return maintenance.find(m => m.description === desc && m.km_milestone === km);
  };

  const getStatus = (desc, km) => {
    const entry = getMaintenanceEntry(desc, km);
    if (!entry) {
      const isRecommended = templates.find(t => t.description === desc && t.km_milestone === km);
      return isRecommended ? 'PENDING' : 'NONE';
    }
    return entry.status || 'PENDING';
  };

  return (
    <div className="glass-card" style={{ padding: '1.5rem', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h3 style={{ fontSize: '1.1rem' }}>Plano de Manutenção</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Acompanhamento por quilometragem.</p>
        </div>
        <button className="btn-primary" onClick={() => onLogService()} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
          <Plus size={16} /> Registrar Serviço
        </button>
      </div>

      <div className="revision-table-container" style={{ 
        overflowX: 'auto', 
        width: '100%',
        borderRadius: '12px',
        border: '1px solid var(--glass-border)',
        background: 'rgba(0,0,0,0.1)'
      }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: '900px' }}>
          <thead>
            <tr>
              <th style={{ 
                textAlign: 'left', 
                padding: '1.25rem 1.5rem', 
                borderBottom: '1px solid var(--glass-border)', 
                color: 'var(--text-muted)', 
                fontSize: '0.7rem', 
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                position: 'sticky', 
                left: 0, 
                background: '#1e293b', // Match Slate theme
                zIndex: 10, 
                width: isMobile ? '140px' : '280px',
                minWidth: isMobile ? '140px' : '280px'
              }}>SERVIÇO / ITEM</th>
              {miles.map(km => (
                <th key={km} style={{ padding: '1rem', borderBottom: '1px solid var(--glass-border)', textAlign: 'center', background: 'rgba(255,255,255,0.02)' }}>
                  <div style={{ fontSize: '0.65rem', opacity: 0.5, fontWeight: 700 }}>KM</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 800, color: car.current_km >= km ? 'var(--text-main)' : 'var(--text-muted)' }}>{(km/1000)}k</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Milestone Total Cost Row */}
            <tr style={{ background: 'rgba(99, 102, 241, 0.05)' }}>
              <td style={{ 
                padding: '1rem 1.5rem', 
                borderBottom: '1px solid var(--glass-border)', 
                position: 'sticky', 
                left: 0, 
                background: '#242b3d', // Slightly different to highlight
                zIndex: 5,
                fontWeight: 700,
                color: 'var(--primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontSize: isMobile ? '0.7rem' : '0.85rem'
              }}>
                {isMobile ? 'CUSTO TOTAL' : 'CUSTO TOTAL DA REVISÃO'}
              </td>
              {miles.map(km => {
                const entry = getMaintenanceEntry('Custo Total da Revisão', km);
                return (
                  <td key={km} style={{ padding: '0.75rem', borderBottom: '1px solid var(--glass-border)', textAlign: 'center' }}>
                    <button 
                      onClick={() => onLogService({ description: 'Custo Total da Revisão', km_milestone: km, amount: entry?.amount || '' })}
                      style={{ 
                        background: 'none', border: '1px dashed var(--glass-border)', 
                        color: entry?.amount > 0 ? 'var(--success)' : 'var(--text-muted)',
                        padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      {entry?.amount > 0 ? `R$ ${parseFloat(entry.amount).toLocaleString('pt-BR')}` : '+ Add'}
                    </button>
                  </td>
                );
              })}
            </tr>

            {templateNames.map(desc => (
              <tr key={desc} className="revision-row">
                <td style={{ 
                  padding: '1rem 1.5rem', 
                  borderBottom: '1px solid var(--glass-border)', 
                  position: 'sticky', 
                  left: 0, 
                  background: '#1e293b', 
                  zIndex: 5,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  fontSize: isMobile ? '0.75rem' : '0.9rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{desc}</span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onAddNote({ desc, isList: true }); }}
                      className="icon-btn" 
                      style={{ 
                        padding: isMobile ? '4px' : '6px', 
                        borderRadius: '8px',
                        color: maintenance.some(m => m.description === desc && m.notes) ? 'var(--primary)' : 'var(--text-muted)',
                        opacity: 0.8,
                        flexShrink: 0
                      }}
                    >
                      <MessageSquare size={isMobile ? 12 : 14} />
                    </button>
                  </div>
                </td>
                {miles.map(km => {
                  const entry = getMaintenanceEntry(desc, km);
                  const status = getStatus(desc, km);

                  return (
                    <td key={km} style={{ padding: '0.75rem', borderBottom: '1px solid var(--glass-border)', textAlign: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                        <div 
                          onClick={() => canEdit && onToggleStatus(desc, km, status)}
                          className={`status-cell ${status}`}
                          style={{
                            width: '32px', height: '32px', borderRadius: '50%', margin: '0 auto',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: canEdit ? 'pointer' : 'default',
                            transition: 'all 0.2s',
                            background: 
                              status === 'DONE' ? 'rgba(16, 185, 129, 0.2)' :
                              status === 'PENDING' ? 'rgba(234, 179, 8, 0.2)' :
                              status === 'SKIPPED' ? 'rgba(239, 68, 68, 0.15)' :
                              'transparent',
                            color:
                              status === 'DONE' ? 'var(--success)' :
                              status === 'PENDING' ? 'var(--warning)' :
                              status === 'SKIPPED' ? 'var(--danger)' :
                              'rgba(255,255,255,0.1)',
                            border: status === 'NONE' || status === 'RECOMMENDED' ? '2px solid rgba(255,255,255,0.1)' : '2px solid transparent',
                          }}
                        >
                          {status === 'DONE' && <CheckCircle2 size={16} />}
                          {status === 'PENDING' && <Clock size={16} />}
                          {status === 'SKIPPED' && <XCircle size={16} />}
                          {(status === 'NONE' || status === 'RECOMMENDED') && <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor' }} />}
                        </div>
                        
                        {entry?.amount > 0 && (
                          <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--success)', opacity: 0.8 }}>
                            R${parseFloat(entry.amount).toLocaleString('pt-BR')}
                          </div>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', marginTop: '2rem', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: 12, height: 12, borderRadius: '3px', background: 'rgba(34, 197, 94, 0.2)', border: '1px solid var(--success)' }} /> Concluído
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: 12, height: 12, borderRadius: '3px', background: 'rgba(234, 179, 8, 0.2)', border: '1px solid var(--warning)' }} /> Pendente
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: 12, height: 12, borderRadius: '3px', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid var(--danger)' }} /> Não será feito
        </div>
      </div>
    </div>
  );
}
