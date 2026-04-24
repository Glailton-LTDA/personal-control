import React, { useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, X, Upload, FileText, Trash2, ExternalLink, Loader2, ChevronDown, ChevronRight, Ticket } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function AttachmentManager({ label, icon: Icon, items, onItemsChange, tripId, defaultExpanded = true }) {
  const [isUploading, setIsUploading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const fileInputRef = useRef(null);

  const generateId = () => {
    try {
      return crypto.randomUUID();
    } catch (e) {
      return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
  };

  const handleFileUpload = async (index, file) => {
    if (!file) return;
    
    setIsUploading(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `${tripId}/${Date.now()}_${index}.${fileExt}`;
    const filePath = `receipts/${fileName}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from('trip-documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('trip-documents')
        .getPublicUrl(filePath);

      const newItems = items.map((item, idx) => 
        idx === index ? { ...item, receipt_url: publicUrl } : item
      );
      onItemsChange(newItems);
    } catch (error) {
      alert('Erro ao fazer upload: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const addItem = () => {
    onItemsChange([...items, { 
      id: generateId(), 
      name: '', 
      confirmation: '',
      start_date: '',
      start_time: '',
      end_date: '',
      end_time: '',
      notes: '',
      transport_id: '', // New field for transport
      address: '',      // New field for tours/tours
      receipt_url: null 
    }]);
    if (!isExpanded) setIsExpanded(true);
  };

  const removeItem = (id) => {
    onItemsChange(items.filter(item => item.id !== id));
  };

  const updateItemField = (id, field, value) => {
    onItemsChange(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const isLodging = /hospedag/i.test(label);
  const isTransport = /transporte/i.test(label);
  const isTour = /passeio/i.test(label) || /ticket/i.test(label);

  // Field label helpers based on type
  const getStartLabel = () => {
    if (isLodging) return 'Check-in';
    if (isTransport) return 'Partida';
    if (isTour) return 'Hora';
    return 'Data / Hora';
  };

  const getEndLabel = () => {
    if (isLodging) return 'Check-out';
    if (isTransport) return 'Chegada';
    return null;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          cursor: 'pointer',
          padding: '0.5rem 0'
        }}
      >
        <label className="modal-label" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.9rem', fontWeight: '800', opacity: 0.8, margin: 0, cursor: 'pointer' }}>
          {Icon && <Icon size={18} style={{ color: 'var(--primary)' }} />} {label}
          <span style={{ fontSize: '0.75rem', opacity: 0.5, fontWeight: '600', marginLeft: '0.5rem' }}>({items.length})</span>
        </label>
        <div style={{ color: 'var(--text-muted)' }}>
          {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            {items.map((item, index) => (
              <div key={item.id} className="glass-card" style={{ 
                padding: '1.5rem', 
                borderRadius: '24px', 
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--glass-border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem',
                position: 'relative'
              }}>
                {/* Header Row: Icon + Name + Delete */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                  <div style={{ 
                    width: '40px', height: '40px', borderRadius: '12px', 
                    background: 'rgba(99,102,241,0.1)', color: 'var(--primary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    marginTop: '1.4rem' // Aligns with the input (label height)
                  }}>
                    {Icon ? <Icon size={20} /> : <FileText size={20} />}
                  </div>
                  
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.5, marginBottom: '0.4rem', display: 'block', fontWeight: 'bold' }}>Nome / Descrição</label>
                    <input 
                      className="glass-input"
                      value={item.name}
                      onChange={(e) => updateItemField(item.id, 'name', e.target.value)}
                      style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', padding: '0.75rem', fontWeight: '700', fontSize: '1rem', color: 'var(--text-main)', borderRadius: '10px' }}
                      placeholder={isTransport ? "Ex: Voo LATAM, Aluguel Hertz..." : isTour ? "Ex: Museu do Louvre, Ingresso Show..." : "Ex: Ibis Paris, Airbnb Marais..."}
                    />
                  </div>

                  <button 
                    type="button"
                    onClick={() => removeItem(item.id)}
                    style={{ 
                      marginTop: '1.4rem',
                      background: 'rgba(239, 68, 68, 0.05)', color: 'var(--danger)', 
                      border: 'none', cursor: 'pointer', padding: '0.6rem', borderRadius: '10px', 
                      display: 'flex', alignItems: 'center', justifyContent: 'center', transition: '0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'}
                    onMouseOut={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.05)'}
                    title="Remover item"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>

                {/* Logistics Fields: Confirmation + ID/Address */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
                  <div>
                    <label style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.5, marginBottom: '0.4rem', display: 'block', fontWeight: 'bold' }}>Confirmação #</label>
                    <input 
                      className="glass-input"
                      value={item.confirmation || ''}
                      onChange={(e) => updateItemField(item.id, 'confirmation', e.target.value)}
                      style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', padding: '0.75rem', fontSize: '0.9rem', color: 'var(--text-main)', borderRadius: '10px' }}
                      placeholder="Código..."
                    />
                  </div>

                  {isTransport && (
                    <div>
                      <label style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.5, marginBottom: '0.4rem', display: 'block', fontWeight: 'bold' }}>Identificação do transporte</label>
                      <input 
                        className="glass-input"
                        value={item.transport_id || ''}
                        onChange={(e) => updateItemField(item.id, 'transport_id', e.target.value)}
                        style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', padding: '0.75rem', fontSize: '0.9rem', color: 'var(--text-main)', borderRadius: '10px' }}
                        placeholder="Ex: LA8100, Placa ABC-1234..."
                      />
                    </div>
                  )}

                  {isTour && (
                    <div style={{ gridColumn: 'span 1' }}>
                      <label style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.5, marginBottom: '0.4rem', display: 'block', fontWeight: 'bold' }}>Endereço / Local</label>
                      <input 
                        className="glass-input"
                        value={item.address || ''}
                        onChange={(e) => updateItemField(item.id, 'address', e.target.value)}
                        style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', padding: '0.75rem', fontSize: '0.9rem', color: 'var(--text-main)', borderRadius: '10px' }}
                        placeholder="Ex: Rue de Rivoli, 75001 Paris..."
                      />
                    </div>
                  )}
                </div>

                {/* Dates & Times */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
                  <div>
                    <label style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.5, marginBottom: '0.4rem', display: 'block', fontWeight: 'bold' }}>{getStartLabel()}</label>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <input 
                        type="date"
                        className="glass-input"
                        value={item.start_date || ''}
                        onChange={(e) => updateItemField(item.id, 'start_date', e.target.value)}
                        style={{ flex: 1, minWidth: '110px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', padding: '0.75rem', fontSize: '0.9rem', color: 'var(--text-main)', borderRadius: '10px' }}
                      />
                      <input 
                        type="time"
                        className="glass-input"
                        value={item.start_time || ''}
                        onChange={(e) => updateItemField(item.id, 'start_time', e.target.value)}
                        style={{ width: '115px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', padding: '0.75rem', fontSize: '0.9rem', color: 'var(--text-main)', borderRadius: '10px' }}
                      />
                    </div>
                  </div>

                  {getEndLabel() && (
                    <div>
                      <label style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.5, marginBottom: '0.4rem', display: 'block', fontWeight: 'bold' }}>{getEndLabel()}</label>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <input 
                          type="date"
                          className="glass-input"
                          value={item.end_date || ''}
                          onChange={(e) => updateItemField(item.id, 'end_date', e.target.value)}
                          style={{ flex: 1, minWidth: '110px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', padding: '0.75rem', fontSize: '0.9rem', color: 'var(--text-main)', borderRadius: '10px' }}
                        />
                        <input 
                          type="time"
                          className="glass-input"
                          value={item.end_time || ''}
                          onChange={(e) => updateItemField(item.id, 'end_time', e.target.value)}
                          style={{ width: '115px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', padding: '0.75rem', fontSize: '0.9rem', color: 'var(--text-main)', borderRadius: '10px' }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Third Row: Notes */}
                <div>
                  <label style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.5, marginBottom: '0.4rem', display: 'block', fontWeight: 'bold' }}>Notas Adicionais</label>
                  <textarea 
                    className="glass-input"
                    value={item.notes || ''}
                    onChange={(e) => updateItemField(item.id, 'notes', e.target.value)}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', padding: '0.75rem', fontSize: '0.9rem', color: 'var(--text-main)', borderRadius: '10px', minHeight: '60px', resize: 'vertical' }}
                    placeholder="Check-in às 14h, portão C3..."
                  />
                </div>

                {/* Fourth Row: Attachment Row */}
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {item.receipt_url ? (
                    <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                      <a 
                        href={item.receipt_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="btn"
                        style={{ flex: 1, height: '44px', padding: '0 1rem', background: 'rgba(99,102,241,0.1)', color: 'var(--primary)', fontSize: '0.85rem', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: '700' }}
                      >
                        <FileText size={18} /> Ver Voucher / Comprovante
                      </a>
                      <button
                        type="button"
                        onClick={() => updateItemField(item.id, 'receipt_url', null)}
                        style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Excluir comprovante"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  ) : (
                    <div style={{ width: '100%' }}>
                      <input 
                        type="file" 
                        id={`file-${item.id}`} 
                        style={{ display: 'none' }} 
                        onChange={(e) => handleFileUpload(index, e.target.files[0])}
                      />
                      <label 
                        htmlFor={`file-${item.id}`}
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          gap: '0.6rem', 
                          width: '100%', 
                          height: '44px', 
                          background: 'rgba(255,255,255,0.03)', 
                          borderRadius: '12px', 
                          fontSize: '0.85rem', 
                          color: 'var(--text-muted)', 
                          cursor: 'pointer',
                          border: '1px dashed var(--glass-border)',
                          fontWeight: '600',
                          transition: '0.2s'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                      >
                        {isUploading ? <Loader2 size={16} className="spin" /> : <Upload size={16} />}
                        {isUploading ? 'Enviando...' : 'Anexar Voucher / Comprovante'}
                      </label>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* "Add New" Button / Label */}
            <button
              type="button"
              onClick={addItem}
              style={{
                width: '100%',
                padding: '1.25rem',
                borderRadius: '16px',
                background: 'rgba(255,255,255,0.01)',
                border: '1px dashed var(--glass-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem',
                color: 'var(--text-muted)',
                fontSize: '0.9rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                outline: 'none'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                e.currentTarget.style.borderColor = 'var(--primary)';
                e.currentTarget.style.color = 'var(--primary)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.01)';
                e.currentTarget.style.borderColor = 'var(--glass-border)';
                e.currentTarget.style.color = 'var(--text-muted)';
              }}
            >
              <Plus size={18} /> + Adicionar novo...
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      
      <style dangerouslySetInnerHTML={{ __html: `
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}} />
    </div>
  );
}
