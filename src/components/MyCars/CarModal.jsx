import React, { useState, useEffect } from 'react';
import { motion as Motion } from 'framer-motion';
import { XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { useEncryption } from '../../contexts/EncryptionContext';

export default function CarModal({ isOpen, onClose, type, car, maintenance, user, onSuccess }) {
  const { encryptObject } = useEncryption();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ name: '', plate: '', current_km: 0 });
  const [serviceData, setServiceData] = useState({ description: '', km_milestone: 10000, status: 'DONE' });
  const [noteData, setNoteData] = useState({ description: '', km_milestone: 10000, notes: '' });

  useEffect(() => {
    if (car && (type === 'edit_car' || type === 'log_service' || type === 'service_note')) {
      setFormData({ name: car.name, plate: car.plate, current_km: car.current_km });
    }
  }, [car, type]);

  useEffect(() => {
    if (typeof type === 'object') {
      const { desc, km, notes, isList } = type;
      if (notes !== undefined) {
        setNoteData({ description: desc, km_milestone: km, notes: notes });
      } else if (!isList) {
        setServiceData(prev => ({ ...prev, description: desc, km_milestone: km }));
      }
    }
  }, [type]);

  if (!isOpen) return null;

  async function handleSaveNote() {
    if (!noteData.notes.trim()) return;
    setLoading(true);
    
    const { error } = await supabase.from('car_maintenance').upsert({
      car_id: car.id,
      description: noteData.description,
      km_milestone: noteData.km_milestone,
      notes: noteData.notes,
      updated_at: new Date().toISOString()
    }, { onConflict: 'car_id,description,km_milestone' });

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
    }, ['name', 'plate']);

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
    }, ['name', 'plate']);

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

        {(type === 'log_service' || (typeof type === 'object' && !type.notes && !type.isList)) && (
          <>
            <h3>Registrar Serviço</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
              <div className="input-group">
                <label>Serviço</label>
                <input
                  type="text"
                  value={serviceData.description}
                  onChange={e => setServiceData({...serviceData, description: e.target.value})}
                  placeholder="Ex: Troca de Pneus..."
                  autoFocus
                />
              </div>
              <div className="input-group">
                <label>Quilometragem (KM)</label>
                <select value={serviceData.km_milestone} onChange={e => setServiceData({...serviceData, km_milestone: parseInt(e.target.value)})}>
                  {[10000, 20000, 30000, 40000, 50000, 60000, 70000, 80000, 90000, 100000, 110000, 120000].map(k => (
                    <option key={k} value={k}>{k.toLocaleString()} km</option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label>Status</label>
                <select value={serviceData.status} onChange={e => setServiceData({...serviceData, status: e.target.value})}>
                  <option value="DONE">Concluído ✔</option>
                  <option value="PENDING">Pendente ⌛</option>
                  <option value="SKIPPED">Pular ❌</option>
                </select>
              </div>
            </div>
            <button className="btn-primary" onClick={handleLogService} disabled={loading || !serviceData.description.trim()} style={{ width: '100%', marginTop: '2rem', justifyContent: 'center' }}>
              {loading ? 'Registrando...' : 'Salvar Serviço'}
            </button>
          </>
        )}

        {(type === 'service_note' || (typeof type === 'object' && (type.isNote || type.isList))) && (
          <>
            <h3>{type.isList ? `Notas: ${type.description}` : 'Observações do Serviço'}</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
              {type.isList ? 'Histórico de observações para este serviço.' : `${noteData.description} - ${noteData.km_milestone.toLocaleString()} KM`}
            </p>
            
            {type.isList ? (
              <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '400px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                {maintenance.filter(m => m.description === type.description && m.notes).length > 0 ? (
                  maintenance.filter(m => m.description === type.description && m.notes).map(m => (
                    <div key={m.km_milestone} style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--primary)' }}>{m.km_milestone.toLocaleString()} KM</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{new Date(m.updated_at).toLocaleDateString()}</span>
                      </div>
                      <p style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{m.notes}</p>
                    </div>
                  ))
                ) : (
                  <p style={{ textAlign: 'center', color: 'var(--text-muted)', py: 4 }}>Nenhuma observação encontrada para este serviço.</p>
                )}
              </div>
            ) : (
              <div style={{ marginTop: '1.5rem' }}>
                <textarea
                  value={noteData.notes}
                  onChange={e => setNoteData({...noteData, notes: e.target.value})}
                  placeholder="Ex: Utilizado óleo 5W30 sintético..."
                  className="settings-textarea"
                  style={{ minHeight: '150px' }}
                  autoFocus
                />
              </div>
            )}
            
            {!type.isList && (
              <button className="btn-primary" onClick={handleSaveNote} disabled={loading} style={{ width: '100%', marginTop: '2rem', justifyContent: 'center' }}>
                {loading ? 'Salvando...' : 'Salvar Nota'}
              </button>
            )}
          </>
        )}
      </Motion.div>
    </div>
  );
}
