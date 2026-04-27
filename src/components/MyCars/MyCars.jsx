import React, { useState, useEffect, useCallback } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { 
  Car, 
  Settings, 
  Plus, 
  Wrench, 
  Calendar, 
  Trash2, 
  ChevronRight, 
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Edit2,
  Search,
  Users,
  Mail,
  Share2
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useEncryption } from '../../contexts/EncryptionContext';
import { confirmToast } from '../../lib/toast';
import toast from 'react-hot-toast';

const milestones = [10000, 20000, 30000, 40000, 50000, 60000, 70000, 80000, 90000, 100000, 110000, 120000];

const defaultServiceTemplates = [
  { description: 'Troca de Óleo e Filtro', km_milestone: 10000 },
  { description: 'Alinhamento e Balanceamento', km_milestone: 10000 },
  { description: 'Filtro de Ar do Motor', km_milestone: 20000 },
  { description: 'Filtro de Combustível', km_milestone: 20000 },
  { description: 'Filtro de Cabine (Ar Condicionado)', km_milestone: 20000 },
  { description: 'Fluido de Freio', km_milestone: 40000 },
  { description: 'Velas de Ignição', km_milestone: 40000 },
  { description: 'Correia Dentada', km_milestone: 60000 },
  { description: 'Limpeza do Sistema de Arrefecimento', km_milestone: 50000 },
];

export default function MyCars({ user, refreshKey, mode = 'list' }) {
  const { decryptObject } = useEncryption();
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
    
    // Combine defaults with user templates
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
    
    // 1. Own cars
    const { data: own } = await supabase
      .from('cars')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    
    // 2. Shared cars (accepted)
    const { data: shared } = await supabase
      .from('car_shares')
      .select('*, car_id (*)')
      .eq('shared_with_email', user.email)
      .eq('status', 'ACCEPTED');
 
    // 3. Pending invitations
    const { data: pends } = await supabase
      .from('car_shares')
      .select('*, car_id (*)')
      .eq('shared_with_email', user.email)
      .eq('status', 'PENDING');
 
    // 4. Active shares (cars I shared with others)
    const { data: active } = await supabase
      .from('car_shares')
      .select('*, car_id (*)')
      .eq('shared_by', user.id);
 
    const decryptedOwn = await decryptObject(own || [], ['name', 'plate', 'make', 'model']);
    const decryptedShared = await decryptObject(shared || [], ['car_id.name', 'car_id.plate', 'car_id.make', 'car_id.model']);
    const decryptedPends = await decryptObject(pends || [], ['car_id.name', 'car_id.plate', 'car_id.make', 'car_id.model']);
    const decryptedActive = await decryptObject(active || [], ['car_id.name', 'car_id.plate', 'car_id.make', 'car_id.model']);
 
    setCars(decryptedOwn);
    setSharedCars(decryptedShared?.map(s => s.car_id) || []);
    setInvitations(decryptedPends || []);
    setActiveShares(decryptedActive || []);
 
    // Select first car if none selected
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
    
    const decrypted = await decryptObject(data || [], ['notes']);
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

  // Listen for FAB clicks from Dashboard
  useEffect(() => {
    const handleAddCar = () => {
      setModalType('add_car');
      setIsModalOpen(true);
    };
    window.addEventListener('open-add-car-modal', handleAddCar);
    return () => window.removeEventListener('open-add-car-modal', handleAddCar);
  }, []);

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
      
      {/* Invitations Alert */}
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

      {/* Car Selector Header */}
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
              <p style={{ fontWeight: 600, fontSize: '0.9rem', margin: 0 }}>{car.name}</p>
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
          
          {/* Tabs Nav */}
          <div style={{ display: 'flex', gap: '1.5rem', borderBottom: '1px solid var(--glass-border)', padding: '0 1rem' }}>
            <button
              className={`tab-btn ${activeSubTab === 'summary' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('summary')}
              style={{ paddingBottom: '1rem', fontSize: '0.9rem', fontWeight: 600, borderBottom: activeSubTab === 'summary' ? '2px solid var(--primary)' : 'none', color: activeSubTab === 'summary' ? 'var(--primary)' : 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Resumo
            </button>
            <button
              className={`tab-btn ${activeSubTab === 'revision' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('revision')}
              style={{ paddingBottom: '1rem', fontSize: '0.9rem', fontWeight: 600, borderBottom: activeSubTab === 'revision' ? '2px solid var(--primary)' : 'none', color: activeSubTab === 'revision' ? 'var(--primary)' : 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
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
                  onAddNote={() => { setModalType('service_note'); setIsModalOpen(true); }}
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
          user={user}
          onSuccess={() => {
            setIsModalOpen(false);
            fetchCars();
            if (selectedCar) fetchMaintenance(selectedCar.id);
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
      
      {/* Basic Info Card */}
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

      {/* Quick Status Card */}
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

function CarRevisionTable({ car, maintenance, templates, onLogService, onAddNote, canEdit }) {
  const miles = milestones;
  
  // Group unique service names from templates and actual maintenance
  const templateNames = Array.from(new Set([
    ...templates.map(t => t.description),
    ...maintenance.map(m => m.description)
  ])).sort();

  const getStatus = (desc, km) => {
    const entry = maintenance.find(m => m.description === desc && m.km_milestone === km);
    if (!entry) {
      // Check if it's a recommended milestone in templates
      const isRecommended = templates.find(t => t.description === desc && t.km_milestone === km);
      return isRecommended ? 'RECOMMENDED' : 'NONE';
    }
    return entry.status || 'PENDING';
  };

  const getNote = (desc, km) => {
    const entry = maintenance.find(m => m.description === desc && m.km_milestone === km);
    return entry?.notes || '';
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
              <th style={{ textAlign: 'left', padding: '1rem', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-muted)', fontSize: '0.8rem', position: 'sticky', left: 0, background: 'var(--bg-dark)', zIndex: 10, width: '220px' }}>SERVIÇO / ITEM</th>
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
                  background: 'var(--bg-dark)', 
                  zIndex: 5,
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {desc}
                </td>
                {miles.map(km => {
                  const status = getStatus(desc, km);
                  const note = getNote(desc, km);
                  const isPast = car.current_km >= km;

                  return (
                    <td key={km} style={{ padding: '0.5rem', borderBottom: '1px solid var(--glass-border)', textAlign: 'center' }}>
                      <div 
                        onClick={() => canEdit && onLogService({ desc, km, status })}
                        className={`status-cell ${status} ${isPast ? 'is-past' : ''}`}
                        style={{
                          width: '32px', height: '32px', borderRadius: '8px', margin: '0 auto',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: canEdit ? 'pointer' : 'default',
                          background: 
                            status === 'DONE' ? 'rgba(34, 197, 94, 0.15)' :
                            status === 'PENDING' ? 'rgba(234, 179, 8, 0.15)' :
                            status === 'SKIPPED' ? 'rgba(239, 68, 68, 0.1)' :
                            status === 'RECOMMENDED' ? 'rgba(255,255,255,0.03)' : 'transparent',
                          color:
                            status === 'DONE' ? 'var(--success)' :
                            status === 'PENDING' ? 'var(--warning)' :
                            status === 'SKIPPED' ? 'var(--danger)' :
                            status === 'RECOMMENDED' ? 'var(--text-muted)' : 'transparent',
                          border: status === 'RECOMMENDED' ? '1px dashed rgba(255,255,255,0.1)' : 'none',
                          opacity: (isPast && status === 'NONE') ? 0.3 : 1
                        }}
                      >
                        {status === 'DONE' && <CheckCircle2 size={16} />}
                        {status === 'PENDING' && <Clock size={16} />}
                        {status === 'SKIPPED' && <XCircle size={16} />}
                        {status === 'RECOMMENDED' && <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor' }} />}
                      </div>
                      
                      {/* Note indicator */}
                      <div 
                        onClick={() => onAddNote({ desc, km, notes: note })}
                        style={{ 
                          fontSize: '0.6rem', marginTop: '4px', cursor: 'pointer',
                          color: note ? 'var(--primary)' : 'transparent',
                          textDecoration: 'underline'
                        }}
                      >
                        {note ? 'Ver nota' : 'Add nota'}
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
          <div style={{ width: 12, height: 12, borderRadius: '3px', background: 'rgba(255, 255, 255, 0.05)', border: '1px dashed rgba(255,255,255,0.2)' }} /> Sugerido
        </div>
      </div>
    </div>
  );
}

function CarModal({ isOpen, onClose, type, car, user, onSuccess }) {
  const { encryptObject } = useEncryption();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ name: '', plate: '', current_km: 0 });
  const [serviceData, setServiceData] = useState({ description: '', km_milestone: 10000, status: 'DONE' });
  const [noteData, setNoteData] = useState({ description: '', km_milestone: 10000, notes: '' });

  const templateNames = Array.from(new Set(defaultServiceTemplates.map(t => t.description))).sort();

  useEffect(() => {
    if (car && (type === 'edit_car' || type === 'log_service' || type === 'service_note')) {
      setFormData({ name: car.name, plate: car.plate, current_km: car.current_km });
    }
  }, [car, type]);

  useEffect(() => {
    if (typeof type === 'object') {
      // It's a structured call from the table
      const { desc, km, status } = type;
      if (status !== undefined) {
         // log_service
         setServiceData({ description: desc, km_milestone: km, status: status === 'NONE' ? 'DONE' : status });
         // Change type to string for rendering
         // setModalType is not accessible here, we should have handled this outside
      }
    }
    
    // Auto-fill note data if passed
    if (type === 'service_note' && car) {
      // This is slightly tricky as we need the specific service name from the table
      // We assume serviceName and km are passed via a global-like state or structured type
    }
  }, [type, car]);

  // Handle structured type calls (Hack to support the table's specific actions)

  useEffect(() => {
    if (typeof type === 'object') {
      const { desc, km, notes } = type;

      if (notes !== undefined) {
        setNoteData({ description: desc, km_milestone: km, notes: notes });
      } else {
        setServiceData(prev => ({ ...prev, description: desc, km_milestone: km }));
      }
    }
  }, [type]);

  if (!isOpen) return null;

  async function handleSaveNote() {
    if (!noteData.notes.trim()) return;
    setLoading(true);
    const { data: existing } = await supabase.from('car_maintenance')
      .select('status')
      .eq('car_id', car.id)
      .eq('description', noteData.description)
      .eq('km_milestone', noteData.km_milestone)
      .single();

    const encrypted = await encryptObject({
      car_id: car.id,
      description: noteData.description,
      km_milestone: noteData.km_milestone,
      notes: noteData.notes,
      status: existing?.status || 'PENDING',
      updated_at: new Date().toISOString()
    }, ['notes']);

    const { error } = await supabase.from('car_maintenance').upsert(encrypted, { onConflict: 'car_id,description,km_milestone' });

    if (!error) {
      onSuccess();
      toast.success('Nota salva');
    } else {
      toast.error('Erro ao salvar observação.');
    }
    setLoading(false);
  }

  async function handleAddCar() {
    setLoading(true);
    const encrypted = await encryptObject({ 
      user_id: user.id, 
      name: formData.name, 
      plate: formData.plate, 
      current_km: formData.current_km 
    }, ['name', 'plate', 'make', 'model']);

    const { error } = await supabase.from('cars').insert(encrypted);
    if (!error) onSuccess();
    setLoading(false);
  }

  async function handleUpdateCar() {
    setLoading(true);
    const encrypted = await encryptObject({ 
      name: formData.name, 
      plate: formData.plate, 
      current_km: formData.current_km 
    }, ['name', 'plate', 'make', 'model']);

    const { error } = await supabase.from('cars').update(encrypted).eq('id', car.id);
    if (!error) onSuccess();
    setLoading(false);
  }

  async function handleLogService() {
    if (!serviceData.description.trim()) {
      toast.error('Preencha a descrição do serviço.');
      return;
    }
    setLoading(true);
    // Note: description is used for grouping, usually it's from templates.
    // If it's a custom service name, we might want to encrypt it, but it breaks grouping.
    // We'll keep description unencrypted for now as it acts as an ID for milestones.
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
      toast.success('Serviço registrado!');
    } else {
      toast.error('Erro ao salvar serviço.');
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
      toast.success('Convite enviado com sucesso!');
      onClose();
    } else {
      toast.error('Erro ao enviar convite: ' + (error.message || 'Tente novamente.'));
    }
    setLoading(false);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <Motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="modal-content glass-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
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

        {(type === 'log_service' || typeof type === 'object' && !type.notes) && (
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
                  <option value="PENDING">Pendente ⌛</option>
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

        {(type === 'service_note' || typeof type === 'object' && type.notes !== undefined) && (
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
                    confirmToast("Remover esta observação?", async () => {
                      setNoteData({...noteData, notes: ''});
                      setLoading(true);
                      await supabase.from('car_maintenance').update({ notes: null })
                        .eq('car_id', car.id)
                        .eq('description', noteData.description)
                        .eq('km_milestone', noteData.km_milestone);
                      onSuccess();
                      toast.success('Observação removida');
                      setLoading(false);
                    }, { danger: true });
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
      </Motion.div>
    </div>
  );
}

function ShareModal({ onShare, loading }) {
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
      toast.success('Milestone adicionado');
    } else {
      toast.error('Erro ao adicionar: ' + error.message);
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
          <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Plano de Revisão -- Milestones</h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Define em quais quilometragens cada serviço deve ser realizado.
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
                    {t.user_id && <button onClick={() => deleteTemplate(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 0, lineHeight: 1, marginLeft: 2 }} title="Remover">x</button>}
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
            <label style={{ fontSize: '0.72rem' }}>Serviço</label>
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
