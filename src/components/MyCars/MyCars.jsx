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
  MessageSquare
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
 
    if (!selectedCar && decryptedOwn?.length > 0) {
      setSelectedCar(decryptedOwn[0]);
    } else if (!selectedCar && decryptedShared?.length > 0) {
      setSelectedCar(decryptedShared[0].car_id);
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

  if (mode === 'admin') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <ServiceTemplatesManager user={user} />
        <CarSharesManager activeShares={activeShares} onRevoke={handleRevokeShare} />
      </div>
    );
  }

  if (loading) return <div className="skeleton-loader" style={{ height: '400px' }} />;

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

      <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
        {[...cars, ...sharedCars].map(car => (
          <button
            key={car.id}
            onClick={() => setSelectedCar(car)}
            className={`glass-card ${selectedCar?.id === car.id ? 'active' : ''}`}
            style={{
              padding: '1rem 1.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              cursor: 'pointer',
              border: selectedCar?.id === car.id ? '2px solid var(--primary)' : '1px solid var(--glass-border)',
              background: selectedCar?.id === car.id ? 'rgba(99,102,241,0.1)' : 'var(--glass-bg)',
              minWidth: '200px',
              transition: 'all 0.2s'
            }}
          >
            <div style={{ 
              width: 40, height: 40, borderRadius: 10, 
              background: selectedCar?.id === car.id ? 'var(--primary)' : 'rgba(255,255,255,0.05)', 
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: selectedCar?.id === car.id ? 'white' : 'var(--text-muted)'
            }}>
              <Car size={22} />
            </div>
            <div style={{ textAlign: 'left' }}>
              <p style={{ fontWeight: 600, fontSize: '0.9rem', margin: 0, color: 'var(--text-main)' }}>{car.name}</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>{car.plate}</p>
            </div>
          </button>
        ))}
        
        <button
          onClick={() => { setModalType('add_car'); setIsModalOpen(true); }}
          className="glass-card"
          style={{
            padding: '1rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            cursor: 'pointer',
            border: '1px dashed var(--glass-border)',
            minWidth: '180px',
            color: 'var(--text-muted)'
          }}
        >
          <Plus size={20} />
          <span style={{ fontSize: '0.9rem' }}>Adicionar Veículo</span>
        </button>
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
                  onEdit={() => { setModalType('edit_car'); setIsModalOpen(true); }} 
                  onDelete={() => handleDeleteCar(selectedCar.id)}
                  onShare={() => { setModalType('share_car'); setIsModalOpen(true); }}
                  isOwner={selectedCar.user_id === user.id}
                />
              ) : (
                <CarRevisionTable 
                  car={selectedCar} 
                  maintenance={maintenance} 
                  templates={serviceTemplates}
                  onLogService={() => { setModalType('log_service'); setIsModalOpen(true); }}
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

function CarSummary({ car, onEdit, onDelete, onShare, isOwner }) {
  const nextMilestone = milestones.find(m => m > car.current_km) || 100000;
  const kmRemaining = nextMilestone - car.current_km;
  const progress = Math.max(0, Math.min(100, ((car.current_km % 10000) / 10000) * 100));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
      
      <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>{car.name}</h3>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', padding: '2px 8px', background: 'var(--primary)', color: 'white', borderRadius: '4px', fontWeight: 'bold' }}>{car.plate}</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{car.current_km.toLocaleString()} KM</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {isOwner && (
              <>
                <button className="icon-btn" onClick={onShare} title="Compartilhar"><Share2 size={18} /></button>
                <button className="icon-btn" onClick={onEdit} title="Editar"><Edit2 size={18} /></button>
                <button className="icon-btn" onClick={onDelete} style={{ color: 'var(--danger)' }} title="Excluir"><Trash2 size={18} /></button>
              </>
            )}
          </div>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Próximo Checkpoint</span>
            <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{nextMilestone.toLocaleString()} KM</span>
          </div>
          <div style={{ height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden', marginBottom: '0.75rem' }}>
            <Motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              style={{ height: '100%', background: 'var(--primary)', boxShadow: '0 0 10px var(--primary)' }} 
            />
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
            Faltam <strong>{kmRemaining.toLocaleString()} KM</strong> para a próxima revisão sugerida.
          </p>
        </div>
      </div>

      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <h4 style={{ fontSize: '1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Clock size={18} style={{ color: 'var(--primary)' }} /> Status da Revisão Atual
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ color: 'var(--success)' }}><CheckCircle2 size={20} /></div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '0.85rem', margin: 0 }}>Itens em Dia</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>Tudo certo com os componentes básicos.</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ color: 'var(--warning)' }}><AlertTriangle size={20} /></div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '0.85rem', margin: 0 }}>Atenção Próxima</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>Considere verificar as pastilhas de freio em breve.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CarRevisionTable({ car, maintenance, templates, onLogService, onToggleStatus, onAddNote, canEdit }) {
  const miles = milestones;
  
  const templateNames = Array.from(new Set([
    ...templates.map(t => t.description),
    ...maintenance.map(m => m.description)
  ])).sort();

  const getStatus = (desc, km) => {
    const entry = maintenance.find(m => m.description === desc && m.km_milestone === km);
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

      <div className="revision-table-container" style={{ overflowX: 'auto', width: '100%' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '1rem', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-muted)', fontSize: '0.8rem', position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 10, width: '220px' }}>SERVIÇO / ITEM</th>
              {miles.map(km => (
                <th key={km} style={{ padding: '1rem', borderBottom: '1px solid var(--glass-border)', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.6rem', opacity: 0.5, marginBottom: '2px' }}>KM</div>
                  <div style={{ fontSize: '0.85rem', color: car.current_km >= km ? 'var(--text-main)' : 'var(--text-muted)' }}>{(km/1000)}k</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {templateNames.map(desc => (
              <tr key={desc} className="revision-row">
                <td style={{ 
                  padding: '1rem', 
                  borderBottom: '1px solid var(--glass-border)', 
                  fontSize: '0.85rem', 
                  position: 'sticky', 
                  left: 0, 
                  background: 'var(--bg-card)', 
                  zIndex: 5,
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{desc}</span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onAddNote({ desc, isList: true }); }}
                      className="icon-btn" 
                      style={{ 
                        padding: '4px', 
                        color: maintenance.some(m => m.description === desc && m.notes) ? 'var(--primary)' : 'var(--text-muted)',
                        opacity: 0.6
                      }}
                    >
                      <MessageSquare size={14} />
                    </button>
                  </div>
                </td>
                {miles.map(km => {
                  const status = getStatus(desc, km);
                  const isPast = car.current_km >= km;

                  return (
                    <td key={km} style={{ padding: '0.5rem', borderBottom: '1px solid var(--glass-border)', textAlign: 'center' }}>
                      <div 
                        onClick={() => canEdit && onToggleStatus(desc, km, status)}
                        className={`status-cell ${status} ${isPast ? 'is-past' : ''}`}
                        style={{
                          width: '32px', height: '32px', borderRadius: '8px', margin: '0 auto',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: canEdit ? 'pointer' : 'default',
                          background: 
                            status === 'DONE' ? 'rgba(34, 197, 94, 0.2)' :
                            status === 'PENDING' ? 'rgba(234, 179, 8, 0.2)' :
                            status === 'SKIPPED' ? 'rgba(239, 68, 68, 0.15)' :
                            status === 'RECOMMENDED' ? 'var(--input-bg)' : 'transparent',
                          color:
                            status === 'DONE' ? 'var(--success)' :
                            status === 'PENDING' ? 'var(--warning)' :
                            status === 'SKIPPED' ? 'var(--danger)' :
                            status === 'RECOMMENDED' ? 'var(--text-muted)' : 'transparent',
                          border: status === 'RECOMMENDED' ? '1px dashed var(--glass-border)' : 'none',
                          opacity: (isPast && status === 'NONE') ? 0.3 : 1
                        }}
                      >
                        {status === 'DONE' && <CheckCircle2 size={16} />}
                        {status === 'PENDING' && <Clock size={16} />}
                        {status === 'SKIPPED' && <XCircle size={16} />}
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
