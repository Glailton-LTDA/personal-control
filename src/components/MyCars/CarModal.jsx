import React, { useState, useEffect } from 'react';
import { motion as Motion } from 'framer-motion';
import { XCircle, Car, Wrench, FileText, Share2, DollarSign, Calendar } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { useEncryption } from '../../contexts/EncryptionContext';

export default function CarModal({ isOpen, onClose, type, car, maintenance, user, onSuccess }) {
  const { encryptObject } = useEncryption();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ name: '', plate: '', current_km: 0, is_hidden: false });
  const [serviceData, setServiceData] = useState({ description: '', km_milestone: 10000, status: 'DONE', amount: '' });
  const [noteData, setNoteData] = useState({ description: '', km_milestone: 10000, notes: '' });

  useEffect(() => {
    if (car && (type === 'edit_car' || type === 'log_service' || type === 'service_note')) {
      setFormData({ 
        name: car.name, 
        plate: car.plate, 
        current_km: car.current_km,
        is_hidden: car.is_hidden || false
      });
    }
  }, [car, type]);

  useEffect(() => {
    if (typeof type === 'object') {
      const { desc, description, km, km_milestone, notes, isList, amount } = type;
      const finalDesc = desc || description;
      const finalKm = km || km_milestone;

      if (notes !== undefined) {
        setNoteData({ description: finalDesc, km_milestone: finalKm, notes: notes });
      } else if (!isList) {
        setServiceData(prev => ({ 
          ...prev, 
          description: finalDesc || prev.description, 
          km_milestone: finalKm || prev.km_milestone,
          amount: amount !== undefined ? amount : prev.amount
        }));
      }
    }
  }, [type]);

  if (!isOpen) return null;

  async function handleSaveNote() {
    if (!noteData.notes.trim()) return;
    setLoading(true);
    
    const encrypted = await encryptObject({
      car_id: car.id,
      description: noteData.description,
      km_milestone: noteData.km_milestone,
      notes: noteData.notes,
      updated_at: new Date().toISOString()
    }, ['notes'], { resourceId: car.id, resourceType: 'CAR' });

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
    const carId = crypto.randomUUID();

    const encrypted = await encryptObject({ 
      id: carId,
      user_id: user.id, 
      name: formData.name, 
      plate: formData.plate, 
      current_km: formData.current_km,
      is_hidden: formData.is_hidden
    }, ['name', 'plate'], { 
      resourceId: carId, 
      resourceType: 'CAR', 
      isCreation: true 
    });

    const { error } = await supabase.from('cars').insert(encrypted);
    if (!error) onSuccess();
    setLoading(false);
  }

  async function handleUpdateCar() {
    setLoading(true);
    const encrypted = await encryptObject({ 
      name: formData.name, 
      plate: formData.plate, 
      current_km: formData.current_km,
      is_hidden: formData.is_hidden
    }, ['name', 'plate'], { 
      resourceId: car.id, 
      resourceType: 'CAR' 
    });

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
    const { error } = await supabase.from('car_maintenance').upsert({
      car_id: car.id,
      description: serviceData.description.trim(),
      km_milestone: parseInt(serviceData.km_milestone.toString()),
      status: serviceData.status,
      completed: serviceData.status === 'DONE',
      amount: serviceData.amount ? parseFloat(String(serviceData.amount).replace(',', '.')) : 0,
      updated_at: new Date().toISOString()
    }, { onConflict: 'car_id,description,km_milestone' });
    
    if (!error) {
      setServiceData({ description: '', km_milestone: 10000, status: 'DONE', amount: '' });
      onSuccess();
      toast.success('Serviço registrado!');
    } else {
      toast.error('Erro ao salvar serviço.');
    }
    setLoading(false);
  }

  const isCarForm = type === 'add_car' || type === 'edit_car';
  const isServiceForm = type === 'log_service' || (typeof type === 'object' && type.type === 'log_service' && !type.notes && !type.isList);
  const isNoteForm = type === 'service_note' || (typeof type === 'object' && (type.isNote || type.isList));

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
      <Motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }} 
        animate={{ scale: 1, opacity: 1, y: 0 }} 
        className="modal-content glass-card" 
        onClick={e => e.stopPropagation()} 
        style={{ 
          width: '100%', 
          maxWidth: '480px', 
          padding: '2rem',
          border: '1px solid var(--glass-border)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div className="cat-icon-wrap" style={{ 
              "--cat-color": isCarForm ? "var(--primary)" : isServiceForm ? "var(--success)" : "var(--pending)",
              width: 48, height: 48, borderRadius: 14 
            }}>
              {isCarForm ? <Car size={24} /> : isServiceForm ? <Wrench size={24} /> : <FileText size={24} />}
            </div>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>
                {isCarForm ? (type === 'add_car' ? 'Novo Veículo' : 'Editar Veículo') :
                 isServiceForm ? 'Registrar Serviço' :
                 (typeof type === 'object' && type.isList ? 'Histórico de Notas' : 'Observações')}
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                {isCarForm ? 'Informações básicas do veículo.' :
                 isServiceForm ? 'Atualize o histórico de manutenção.' :
                 'Detalhes adicionais do checkpoint.'}
              </p>
            </div>
          </div>
          <button className="action-btn" onClick={onClose} style={{ marginTop: '-0.5rem', marginRight: '-0.5rem' }}>
            <XCircle size={20} />
          </button>
        </div>
        
        {isCarForm && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="input-group">
              <label>Identificação do Veículo</label>
              <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Ex: Ônix Premier" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              <div className="input-group">
                <label>Placa</label>
                <input type="text" value={formData.plate} onChange={e => setFormData({...formData, plate: e.target.value})} maxLength={8} style={{ textTransform: 'uppercase' }} />
              </div>
              <div className="input-group">
                <label>KM Atual</label>
                <input type="number" value={formData.current_km} onChange={e => setFormData({...formData, current_km: parseInt(e.target.value)})} />
              </div>
            </div>
            <div 
              onClick={() => setFormData({...formData, is_hidden: !formData.is_hidden})}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.75rem', 
                padding: '1rem', 
                background: 'var(--card-action-bg)', 
                borderRadius: '12px',
                cursor: 'pointer',
                border: '1px solid var(--glass-border)'
              }}
            >
              <input 
                type="checkbox" 
                checked={formData.is_hidden} 
                onChange={() => {}}
                style={{ width: '18px', height: '18px', margin: 0 }}
              />
              <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Arquivar este veículo</span>
            </div>
            <button className="btn-primary" onClick={type === 'add_car' ? handleAddCar : handleUpdateCar} disabled={loading} style={{ width: '100%', height: '52px', marginTop: '0.5rem' }}>
              {loading ? 'Salvando...' : 'Confirmar Alterações'}
            </button>
          </div>
        )}

        {isServiceForm && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="input-group">
              <label>Serviço Executado</label>
              <input
                type="text"
                value={serviceData.description}
                onChange={e => setServiceData({...serviceData, description: e.target.value})}
                placeholder="Ex: Troca de Pneus..."
                autoFocus
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              <div className="input-group">
                <label>Checkpoint (KM)</label>
                <select value={serviceData.km_milestone} onChange={e => setServiceData({...serviceData, km_milestone: parseInt(e.target.value)})}>
                  {[10000, 20000, 30000, 40000, 50000, 60000, 70000, 80000, 90000, 100000, 110000, 120000].map(k => (
                    <option key={k} value={k}>{k.toLocaleString()} km</option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label>Custo do Serviço</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5, fontSize: '0.9rem', fontWeight: 700 }}>R$</span>
                  <input
                    type="text"
                    value={serviceData.amount}
                    style={{ paddingLeft: '2.5rem' }}
                    onChange={e => {
                      let val = e.target.value.replace(/\D/g, '');
                      if (!val) {
                        setServiceData({...serviceData, amount: ''});
                        return;
                      }
                      val = (parseInt(val) / 100).toFixed(2);
                      setServiceData({...serviceData, amount: val.replace('.', ',')});
                    }}
                    placeholder="0,00"
                  />
                </div>
              </div>
            </div>
            <div className="input-group">
              <label>Status da Manutenção</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                {[
                  { id: 'DONE', label: 'Concluído', icon: <CheckCircle2 size={16} />, color: 'var(--success)' },
                  { id: 'PENDING', label: 'Pendente', icon: <Clock size={16} />, color: 'var(--pending)' },
                  { id: 'SKIPPED', label: 'Ignorar', icon: <XCircle size={16} />, color: 'var(--danger)' }
                ].map(s => (
                  <div 
                    key={s.id}
                    onClick={() => setServiceData({...serviceData, status: s.id})}
                    style={{ 
                      padding: '0.75rem 0.5rem', 
                      borderRadius: '10px', 
                      border: `1px solid ${serviceData.status === s.id ? s.color : 'var(--glass-border)'}`,
                      background: serviceData.status === s.id ? `${s.color}15` : 'var(--card-action-bg)',
                      color: serviceData.status === s.id ? s.color : 'var(--text-muted)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.4rem',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      transition: 'all 0.2s'
                    }}
                  >
                    {s.icon}
                    {s.label}
                  </div>
                ))}
              </div>
            </div>
            <button className="btn-primary" onClick={handleLogService} disabled={loading || !serviceData.description.trim()} style={{ width: '100%', height: '52px', marginTop: '0.5rem' }}>
              {loading ? 'Registrando...' : 'Salvar Manutenção'}
            </button>
          </div>
        )}

        {isNoteForm && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {typeof type === 'object' && type.isList ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '400px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                {maintenance.filter(m => m.description === type.description && m.notes).length > 0 ? (
                  maintenance.filter(m => m.description === type.description && m.notes).sort((a, b) => b.km_milestone - a.km_milestone).map(m => (
                    <div key={m.km_milestone} style={{ padding: '1.25rem', background: 'var(--card-action-bg)', borderRadius: '16px', border: '1px solid var(--glass-border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Calendar size={14} className="text-primary" />
                          <span style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-main)' }}>{m.km_milestone.toLocaleString()} KM</span>
                        </div>
                        <span className="cat-chip" style={{ fontSize: '0.7rem' }}>{new Date(m.updated_at).toLocaleDateString()}</span>
                      </div>
                      <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{m.notes}</p>
                    </div>
                  ))
                ) : (
                  <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                    <FileText size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                    <p>Nenhuma observação encontrada para este serviço.</p>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div style={{ padding: '1rem', background: 'rgba(99, 102, 241, 0.05)', borderRadius: '12px', border: '1px solid rgba(99, 102, 241, 0.1)', marginBottom: '0.5rem' }}>
                  <p style={{ fontSize: '0.85rem', fontWeight: 700, margin: 0, color: 'var(--primary)' }}>{noteData.description}</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>Checkpoint: {noteData.km_milestone.toLocaleString()} KM</p>
                </div>
                <div className="input-group">
                  <label>Relatório do Serviço</label>
                  <textarea
                    value={noteData.notes}
                    onChange={e => setNoteData({...noteData, notes: e.target.value})}
                    placeholder="Ex: Utilizado óleo 5W30 sintético. Verificado pastilhas de freio..."
                    className="settings-textarea"
                    style={{ minHeight: '160px', padding: '1.25rem', fontSize: '0.95rem' }}
                    autoFocus
                  />
                </div>
                <button className="btn-primary" onClick={handleSaveNote} disabled={loading} style={{ width: '100%', height: '52px', marginTop: '0.5rem' }}>
                  {loading ? 'Salvando...' : 'Salvar Observação'}
                </button>
              </>
            )}
          </div>
        )}

        {type === 'share_car' && (
          <ShareCarSection car={car} user={user} onClose={onClose} />
        )}
      </Motion.div>
    </div>
  );
}

function ShareCarSection({ car, user, onClose }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const { shareResourceKey } = useEncryption();

  async function handleShare(e) {
    e.preventDefault();
    if (!email.trim()) return;
    
    setLoading(true);
    try {
      const shared = await shareResourceKey(car.id, 'CAR', email.toLowerCase().trim());
      if (!shared) return;

      const { error } = await supabase.from('car_shares').insert({
        car_id: car.id,
        shared_by: user.id,
        shared_with_email: email.toLowerCase().trim(),
        permission: 'WRITE',
        status: 'PENDING'
      });

      if (!error) {
        toast.success('Convite enviado com sucesso!');
        onClose();
      } else {
        toast.error('Erro ao registrar compartilhamento: ' + error.message);
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao compartilhar veículo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ padding: '1rem', background: 'rgba(99, 102, 241, 0.05)', borderRadius: '12px', border: '1px solid rgba(99, 102, 241, 0.1)' }}>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
          Convide outra pessoa para gerenciar a manutenção do <strong>{car.name}</strong>.
        </p>
      </div>
      
      <form onSubmit={handleShare} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div className="input-group">
          <label>E-mail do convidado</label>
          <div style={{ position: 'relative' }}>
            <input 
              type="email" 
              required 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              placeholder="exemplo@email.com"
              style={{ paddingLeft: '2.75rem' }}
            />
            <div style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>
               <Share2 size={18} />
            </div>
          </div>
        </div>
        
        <button type="submit" className="btn-primary" disabled={loading} style={{ width: '100%', height: '52px', marginTop: '0.5rem' }}>
          {loading ? 'Enviando convite...' : 'Enviar Convite'}
        </button>
      </form>
    </div>
  );
}
