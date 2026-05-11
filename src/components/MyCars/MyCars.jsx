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
  Filter,
  FileText,
  LayoutDashboard
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useEncryption } from '../../contexts/EncryptionContext';
import { confirmToast } from '../../lib/toast';
import toast from 'react-hot-toast';
import CarModal from './CarModal';
import ServiceTemplatesManager from './ServiceTemplatesManager';
import CarSharesManager from './CarSharesManager';

import { milestones, defaultServiceTemplates } from './constants';

export default function MyCars({ user, refreshKey, mode = 'list' }) {
  const { t } = useTranslation();
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
        <div className="glass-card" style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="cat-icon-wrap" style={{ "--cat-color": "var(--primary)", width: 44, height: 44, borderRadius: 12 }}>
              <Filter size={22} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>{t('cars.admin.prefs_title')}</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>{t('cars.admin.prefs_desc')}</p>
            </div>
          </div>
          
          <div 
            onClick={() => setShowHidden(!showHidden)}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '1rem', 
              padding: '1.25rem', 
              background: 'var(--card-action-bg)', 
              borderRadius: '16px', 
              cursor: 'pointer',
              border: '1px solid var(--glass-border)',
              transition: 'all 0.2s'
            }}
          >
            <input 
              type="checkbox" 
              checked={showHidden}
              onChange={() => {}}
              style={{ width: '20px', height: '20px', cursor: 'pointer' }}
            />
            <div>
              <p style={{ fontWeight: 800, fontSize: '0.95rem', margin: 0 }}>{t('cars.admin.show_archived')}</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>{t('cars.admin.show_archived_desc')}</p>
            </div>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="cat-icon-wrap" style={{ "--cat-color": "var(--pending)", width: 44, height: 44, borderRadius: 12 }}>
              <EyeOff size={22} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>{t('cars.admin.archived_title')}</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>{t('cars.admin.archived_desc')}</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {cars.filter(c => c.is_hidden).length === 0 && sharedCars.filter(c => c.is_hidden).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', background: 'var(--card-action-bg)', borderRadius: '16px' }}>
                <Car size={48} style={{ opacity: 0.1, marginBottom: '1rem' }} />
                <p style={{ margin: 0 }}>{t('cars.admin.no_archived')}</p>
              </div>
            ) : (
              <>
                {cars.filter(c => c.is_hidden).map(car => (
                  <div key={car.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem', background: 'var(--card-action-bg)', borderRadius: '16px', border: '1px solid var(--glass-border)' }}>
                    <div>
                      <p style={{ fontWeight: 800, fontSize: '1rem', margin: 0, color: 'var(--text-main)' }}>{car.name}</p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>{car.plate} • {car.make} {car.model}</p>
                    </div>
                    <button className="btn-secondary" onClick={() => handleToggleArchive(car)} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                      <Eye size={16} /> {t('cars.admin.restore')}
                    </button>
                  </div>
                ))}
                {sharedCars.filter(c => c.is_hidden).map(car => (
                  <div key={car.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem', background: 'var(--card-action-bg)', borderRadius: '16px', border: '1px solid var(--glass-border)' }}>
                    <div>
                      <p style={{ fontWeight: 800, fontSize: '1rem', margin: 0, color: 'var(--text-main)' }}>
                        {car.name} <span style={{ fontSize: '0.65rem', color: 'var(--primary)', background: 'rgba(99,102,241,0.1)', padding: '2px 6px', borderRadius: '4px', marginLeft: '0.5rem' }}>Compartilhado</span>
                      </p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>{car.plate}</p>
                    </div>
                    <button className="btn-secondary" onClick={() => handleToggleArchive(car)} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                      <Eye size={16} /> {t('cars.admin.restore')}
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        <ServiceTemplatesManager user={user} />
        <CarSharesManager activeShares={activeShares} onRevoke={handleRevokeShare} />
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem', gap: '1rem' }}>
        <Car size={48} className="animate-spin" style={{ color: 'var(--primary)', opacity: 0.5 }} />
        <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{t('cars.loading')}</span>
      </div>
    );
  }



  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="cat-icon-wrap" style={{ "--cat-color": "var(--primary)" }}>
            <Car size={24} />
          </div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0 }}>{t('cars.title')}</h2>
        </div>
        <button onClick={() => { setModalType('add_car'); setIsModalOpen(true); }} className="btn-primary">
          <Plus size={18} /> {t('cars.add_car')}
        </button>
      </header>

      {invitations.length > 0 && (
        <Motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card" 
          style={{ border: '1px solid var(--primary)', background: 'rgba(99, 102, 241, 0.05)', padding: '1.5rem' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
            <div className="cat-icon-wrap" style={{ "--cat-color": "var(--primary)", width: 42, height: 42, borderRadius: 12 }}>
              <Mail size={24} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>{t('cars.invitations.title')}</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('cars.invitations.desc')}</p>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {invitations.map(invite => (
              <div key={invite.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'var(--card-action-bg)', borderRadius: '14px', border: '1px solid var(--glass-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Car size={18} className="text-primary" />
                  <span style={{ fontWeight: 700 }}>{invite.car_id.name} <small style={{ opacity: 0.6, fontWeight: 500 }}>({invite.car_id.plate})</small></span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn-primary" onClick={() => handleAcceptInvitation(invite.id)} style={{ padding: '8px 16px', fontSize: '0.8rem', height: '36px' }}>{t('common.accept')}</button>
                  <button className="action-btn danger" onClick={() => handleRejectInvitation(invite.id)}><XCircle size={18} /></button>
                </div>
              </div>
            ))}
          </div>
        </Motion.div>
      )}

      {selectedCar ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          <div className="glass-card" style={{ padding: '0.5rem', marginBottom: '2.5rem', display: 'flex', gap: '0.5rem', overflowX: 'auto', scrollbarWidth: 'none' }}>
            {[
              { id: 'summary', label: t('cars.tabs.summary'), icon: LayoutDashboard },
              { id: 'revision', label: t('cars.tabs.revisions'), icon: Wrench }
            ].map(tab => (
              <button
                key={tab.id}
                className={`tab-btn ${activeSubTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveSubTab(tab.id)}
              >
                <tab.icon size={16} /> {tab.label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <Motion.div
              key={activeSubTab}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
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
                  onLogService={(data) => { 
                    setModalType(data ? { type: 'log_service', ...data } : 'log_service'); 
                    setIsModalOpen(true); 
                  }}
                  onToggleStatus={toggleServiceStatus}
                  onAddNote={(data) => { 
                    setModalType(data); 
                    setIsModalOpen(true); 
                  }}
                  canEdit={true}
                />
              )}
            </Motion.div>
          </AnimatePresence>
        </div>
      ) : (
        <div className="glass-card" style={{ padding: '6rem 2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="premium-gradient" style={{ width: 80, height: 80, borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', marginBottom: '2rem', opacity: 0.8 }}>
            <Car size={40} />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.75rem' }}>{t('cars.empty.title')}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '1rem', maxWidth: '400px', margin: '0 auto 2.5rem' }}>{t('cars.empty.desc')}</p>
          <button className="btn-primary" onClick={() => { setModalType('add_car'); setIsModalOpen(true); }}>
            <Plus size={20} /> Cadastrar Primeiro Veículo
          </button>
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
    <div className="bento-grid">
      
      {/* Car Profile Card - Bento Large */}
      <div className="glass-card bento-span-2" style={{ padding: '1.75rem', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'relative', zIndex: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 900, letterSpacing: '-0.02em' }} data-testid="car-name">{car.name}</h2>
                {car.is_hidden && (
                  <span className="cat-chip" style={{ "--cat-color": "var(--text-muted)" }}>ARQUIVADO</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  <span style={{ padding: '2px 8px', background: 'var(--card-action-bg)', borderRadius: '6px', border: '1px solid var(--glass-border)' }} data-testid="car-plate">{car.plate}</span>
                </div>
                <div style={{ width: 1, height: 12, background: 'var(--glass-border)' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  <Wrench size={16} /> 
                  <span data-testid="car-km">{(car.current_km || 0).toLocaleString()}</span> KM
                </div>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              {isOwner && (
                <>
                  <button className="action-btn" onClick={onEdit} title="Editar"><Edit2 size={18} /></button>
                  <button className="action-btn" onClick={onShare} title="Compartilhar"><Share2 size={18} /></button>
                  <button className="action-btn" onClick={onArchive} title={car.is_hidden ? "Restaurar" : "Arquivar"}>
                    {car.is_hidden ? <Eye size={18} /> : <EyeOff size={18} />}
                  </button>
                  <button className="action-btn danger" onClick={onDelete} title="Excluir"><Trash2 size={18} /></button>
                </>
              )}
            </div>
          </div>

          <div style={{ background: 'var(--card-action-bg)', padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--glass-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Próximo Checkpoint</span>
              <span style={{ fontWeight: 800, color: 'var(--primary)' }}>{nextMilestone.toLocaleString()} KM</span>
            </div>
            <div style={{ height: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '5px', overflow: 'hidden', marginBottom: '0.75rem' }}>
              <Motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                style={{ height: '100%', background: 'linear-gradient(90deg, var(--primary), #8b5cf6)', boxShadow: '0 0 15px rgba(99, 102, 241, 0.5)' }} 
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, fontWeight: 500 }}>
                Restam <b style={{ color: 'var(--text-main)' }}>{kmRemaining.toLocaleString()} KM</b> para a próxima revisão sugerida.
              </p>
              <div className="status-badge paid" style={{ fontSize: '10px', padding: '2px 8px' }}>{(progress).toFixed(0)}%</div>
            </div>
          </div>
        </div>
        
        {/* Decorative element */}
        <div style={{ position: 'absolute', top: '-10%', right: '-5%', opacity: 0.03, transform: 'rotate(15deg)' }}>
          <Car size={300} strokeWidth={1} />
        </div>
      </div>

      {/* Financial Premium Card - Bento Normal */}
      <div className="glass-card premium-gradient" style={{ padding: '1.75rem', color: 'white', display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '220px' }}>
        <p style={{ fontSize: '0.85rem', opacity: 0.8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>Investimento Total</p>
        <h2 style={{ fontSize: 'clamp(1.75rem, 5vw, 2.5rem)', fontWeight: 900, margin: 0, letterSpacing: '-0.04em', whiteSpace: 'nowrap' }}>
          <small style={{ fontSize: '0.5em', opacity: 0.7, fontWeight: 600, marginRight: '4px' }}>R$</small>
          {totalSpent.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </h2>
        <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle2 size={16} style={{ opacity: 0.8 }} />
          <p style={{ fontSize: '0.8rem', opacity: 0.9, margin: 0, fontWeight: 500 }}>Histórico de manutenções consolidado.</p>
        </div>
      </div>

      {/* Maintenance Alerts - Bento Normal */}
      <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
        <h4 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <AlertTriangle size={20} style={{ color: '#f59e0b' }} /> Insights & Alertas
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '1rem', background: 'rgba(16, 185, 129, 0.08)', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.15)' }}>
            <div style={{ color: 'var(--success)' }}><CheckCircle2 size={20} /></div>
            <div>
              <p style={{ fontSize: '0.85rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>Status: OK</p>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0 }}>Documentos e seguros vigentes.</p>
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '1rem', background: 'rgba(245, 158, 11, 0.08)', borderRadius: '12px', border: '1px solid rgba(245, 158, 11, 0.15)' }}>
            <div style={{ color: '#f59e0b' }}><Clock size={20} /></div>
            <div>
              <p style={{ fontSize: '0.85rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>Próxima Revisão</p>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0 }}>Faltam {kmRemaining.toLocaleString()} KM para o check-up.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CarRevisionTable({ car, maintenance, templates, onLogService, onToggleStatus, onAddNote, canEdit }) {
  const { t } = useTranslation();
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
    <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem' }}>
        <div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>{t('cars.tabs.revisions')}</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{t('cars.revisions.checkpoints_desc')}</p>
        </div>
        <button className="btn-primary" onClick={() => onLogService()} style={{ padding: '10px 20px' }}>
          <Plus size={18} /> {t('cars.add_service')}
        </button>
      </div>

      <div className="orbit-table-container" style={{ borderTop: '1px solid var(--glass-border)', borderRadius: 0 }}>
        <table className="orbit-table">
          <thead>
            <tr>
              <th className="sticky-col">{t('cars.service_item')}</th>
              {miles.map(km => (
                <th key={km} style={{ textAlign: 'center', background: 'rgba(255,255,255,0.01)' }}>
                  <div style={{ fontSize: '0.6rem', opacity: 0.6, fontWeight: 800, color: 'var(--primary)' }}>CHECKPOINT</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900, color: car.current_km >= km ? 'var(--text-main)' : 'var(--text-muted)' }}>{(km/1000)}k</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr style={{ background: 'rgba(99, 102, 241, 0.03)' }}>
              <td className="sticky-col" style={{ fontWeight: 800, color: 'var(--primary)' }}>
                {t('cars.total_cost')}
              </td>
              {miles.map(km => {
                const entry = getMaintenanceEntry('Custo Total da Revisão', km);
                return (
                  <td key={km} style={{ textAlign: 'center' }}>
                    <button 
                      onClick={() => onLogService({ description: 'Custo Total da Revisão', km_milestone: km, amount: entry?.amount || '' })}
                      className="status-badge paid"
                      style={{ 
                        background: entry?.amount > 0 ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                        border: '1px dashed var(--glass-border)',
                        cursor: 'pointer',
                        minWidth: '80px',
                        justifyContent: 'center',
                        fontSize: '0.75rem'
                      }}
                    >
                      {entry?.amount > 0 ? `${t('common.currency_symbol')} ${parseFloat(entry.amount).toLocaleString(t('common.locale'))}` : `+ ${t('common.add')}`}
                    </button>
                  </td>
                );
              })}
            </tr>

            {templateNames.map(desc => (
              <tr key={desc} className="row-hover">
                <td className="sticky-col">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{desc}</span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onAddNote({ description: desc, isList: true }); }}
                      className="action-btn" 
                      title={t('cars.revisions.view_notes_history')}
                      style={{ 
                        width: '28px', height: '28px',
                        color: maintenance.some(m => m.description === desc && m.notes) ? 'var(--primary)' : 'var(--text-muted)',
                        padding: 0
                      }}
                    >
                      <FileText size={14} />
                    </button>
                  </div>
                </td>
                {miles.map(km => {
                  const entry = getMaintenanceEntry(desc, km);
                  const status = getStatus(desc, km);

                  return (
                    <td key={km} style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                        <div style={{ position: 'relative' }}>
                          <div 
                            onClick={() => canEdit && onToggleStatus(desc, km, status)}
                            style={{
                              width: '36px', height: '36px', borderRadius: '10px',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: canEdit ? 'pointer' : 'default',
                              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                              background: 
                                status === 'DONE' ? 'rgba(16, 185, 129, 0.15)' :
                                status === 'PENDING' ? 'rgba(245, 158, 11, 0.15)' :
                                status === 'SKIPPED' ? 'rgba(239, 68, 68, 0.12)' :
                                'rgba(255,255,255,0.02)',
                              color:
                                status === 'DONE' ? 'var(--success)' :
                                status === 'PENDING' ? 'var(--pending)' :
                                status === 'SKIPPED' ? 'var(--danger)' :
                                'rgba(255,255,255,0.1)',
                              border: '1px solid var(--glass-border)',
                              boxShadow: status !== 'NONE' ? '0 4px 12px rgba(0,0,0,0.1)' : 'none'
                            }}
                            onMouseEnter={(e) => {
                              if (canEdit) e.currentTarget.style.transform = 'scale(1.1) translateY(-2px)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = 'scale(1)';
                            }}
                          >
                            {status === 'DONE' && <CheckCircle2 size={18} />}
                            {status === 'PENDING' && <Clock size={18} />}
                            {status === 'SKIPPED' && <XCircle size={18} />}
                            {(status === 'NONE' || status === 'RECOMMENDED') && <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor' }} />}
                          </div>
                          
                          <button 
                            onClick={(e) => { e.stopPropagation(); onAddNote({ desc, km, notes: entry?.notes || '', isNote: true }); }}
                            style={{ 
                              position: 'absolute',
                              top: -10,
                              right: -10,
                              width: '24px',
                              height: '24px',
                              borderRadius: '8px',
                              background: entry?.notes ? 'var(--primary)' : 'var(--bg-card)',
                              border: '1px solid var(--glass-border)',
                              color: entry?.notes ? 'white' : 'var(--text-muted)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                              zIndex: 5,
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.2)'}
                            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                            title={t('cars.revisions.view_add_note')}
                          >
                            <MessageSquare size={12} />
                          </button>
                        </div>
                        
                        {entry?.amount > 0 && (
                          <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--success)' }}>
                            R$ {parseFloat(entry.amount).toLocaleString(t('common.locale') === 'pt-BR' ? 'pt-BR' : 'en-US')}
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

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', padding: '1.5rem', background: 'var(--card-action-bg)', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div className="status-badge paid" style={{ padding: '4px' }}><CheckCircle2 size={12} /></div> {t('cars.revisions.status_done')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div className="status-badge pending" style={{ padding: '4px' }}><Clock size={12} /></div> {t('cars.revisions.status_pending')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div className="status-badge danger" style={{ padding: '4px' }}><XCircle size={12} /></div> {t('cars.revisions.status_ignored')}
        </div>
      </div>
    </div>
  );
}
