import React, { useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, X, Upload, FileText, Trash2, ExternalLink, Loader2, ChevronDown, ChevronRight, Ticket, MapPin, Plane, Train, Bus, Car, Ship } from 'lucide-react';
import { AIRPORTS } from '../../data/airports';
import { motion, AnimatePresence } from 'framer-motion';

export default function AttachmentManager({ label, icon: Icon, items, onItemsChange, tripId, defaultExpanded = true }) {
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);

  React.useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
      transports_type: 'flight', // Default type
      seats: [],        // New field for seats (badges)
      origin: '',       // New field for flight segments
      destination: '',  // New field for flight segments
      address: '',
      receipt_url: null 
    }]);
    if (!isExpanded) setIsExpanded(true);
  };

  const [localDateValues, setLocalDateValues] = useState({}); // { id_field: 'DD/MM/AAAA' }

  const removeItem = (id) => {
    onItemsChange(items.filter(item => item.id !== id));
  };

  const formatDateToDisplay = (dateStr) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  };

  const parseDisplayDateToISO = (displayDate) => {
    if (!displayDate) return '';
    const [day, month, year] = displayDate.split('/');
    if (!day || !month || !year) return '';
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  };

  const handleDateMask = (val) => {
    const numbers = val.replace(/\D/g, '');
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 4) return `${numbers.slice(0, 2)}/${numbers.slice(2)}`;
    return `${numbers.slice(0, 2)}/${numbers.slice(2, 4)}/${numbers.slice(4, 8)}`;
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

  const TRANSPORT_TYPES = [
    { id: 'flight', icon: Plane, label: 'Voo' },
    { id: 'train', icon: Train, label: 'Trem' },
    { id: 'bus', icon: Bus, label: 'Ônibus' },
    { id: 'ship', icon: Ship, label: 'Navio / Cruzeiro' },
    { id: 'car', icon: Car, label: 'Carro' },
    { id: 'generic', icon: MapPin, label: 'Outro' }
  ];

  const getTransportLabels = (type) => {
    switch (type) {
      case 'train':
        return { origin: 'Estação de Partida', destination: 'Estação de Chegada', id: 'Nº do Trem', showSeats: true };
      case 'bus':
        return { origin: 'Terminal de Partida', destination: 'Terminal de Chegada', id: 'Empresa / Linha', showSeats: true };
      case 'ship':
        return { origin: 'Porto de Partida', destination: 'Porto de Chegada', id: 'Cruzeiro / Cabine', showSeats: true };
      case 'car':
        return { origin: 'Local de Retirada', destination: 'Local de Devolução', id: 'Modelo / Placa', showSeats: false };
      case 'flight':
      default:
        return { origin: 'Origem (IATA)', destination: 'Destino (IATA)', id: 'Nº Voo / Cia', showSeats: false };
    }
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
                {(() => {
                  const currentType = item.transports_type || 'flight';
                  const labels = getTransportLabels(currentType);
                  return (
                    <>
                      {/* Header Row: Icon + Name + Delete */}
                      <div style={{ 
                        display: 'flex', 
                        flexDirection: isMobile ? 'column' : 'row', 
                        gap: '1rem',
                        alignItems: isMobile ? 'stretch' : 'flex-start'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: isMobile ? '100%' : 'auto' }}>
                          <div style={{ 
                            width: '44px', height: '44px', borderRadius: '14px', 
                            background: 'rgba(99,102,241,0.1)', color: 'var(--primary)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                          }}>
                            {isTransport ? (
                              (() => {
                                const IconType = TRANSPORT_TYPES.find(t => t.id === currentType)?.icon || MapPin;
                                return <IconType size={22} />;
                              })()
                            ) : Icon ? <Icon size={22} /> : <FileText size={22} />}
                          </div>

                          {isMobile && (
                            <button 
                              type="button"
                              onClick={() => removeItem(item.id)}
                              style={{ 
                                background: 'rgba(239, 68, 68, 0.05)', color: 'var(--danger)', 
                                border: 'none', cursor: 'pointer', padding: '0.75rem', borderRadius: '12px', 
                                display: 'flex', alignItems: 'center', justifyContent: 'center', transition: '0.2s'
                              }}
                              title="Remover item"
                            >
                              <Trash2 size={20} />
                            </button>
                          )}
                        </div>
                        
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.5, marginBottom: '0.4rem', display: 'block', fontWeight: 'bold' }}>Nome / Descrição</label>
                          <input 
                            className="glass-input"
                            value={item.name}
                            onChange={(e) => updateItemField(item.id, 'name', e.target.value)}
                            style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', padding: '0.75rem', fontWeight: '700', fontSize: '1rem', color: 'var(--text-main)', borderRadius: '12px' }}
                            placeholder={isTransport ? "Ex: Voo LATAM, Aluguel Hertz..." : isTour ? "Ex: Museu do Louvre, Ingresso Show..." : "Ex: Ibis Paris, Airbnb Marais..."}
                          />
                        </div>

                        {!isMobile && (
                          <button 
                            type="button"
                            onClick={() => removeItem(item.id)}
                            style={{ 
                              marginTop: '1.4rem',
                              background: 'rgba(239, 68, 68, 0.05)', color: 'var(--danger)', 
                              border: 'none', cursor: 'pointer', padding: '0.6rem', borderRadius: '10px', 
                              display: 'flex', alignItems: 'center', justifyContent: 'center', transition: '0.2s'
                            }}
                            title="Remover item"
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>

                      {isTransport && (
                        <div style={{ 
                          display: 'flex', 
                          gap: isMobile ? '0.25rem' : '0.5rem', 
                          padding: '0.35rem', 
                          background: 'rgba(255,255,255,0.03)', 
                          borderRadius: '14px',
                          width: isMobile ? '100%' : 'fit-content'
                        }}>
                          {TRANSPORT_TYPES.map(type => (
                            <button
                              key={type.id}
                              type="button"
                              onClick={() => updateItemField(item.id, 'transports_type', type.id)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.5rem',
                                padding: isMobile ? '0.5rem 0.25rem' : '0.5rem 1rem',
                                borderRadius: '10px',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                                fontWeight: '700',
                                transition: '0.2s',
                                background: currentType === type.id ? 'var(--primary)' : 'transparent',
                                color: currentType === type.id ? 'white' : 'var(--text-muted)',
                                flex: isMobile ? 1 : 'none'
                              }}
                            >
                              <type.icon size={isMobile ? 18 : 14} />
                              {!isMobile && type.label}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Logistics Fields: Confirmation + ID/Address */}
                      {/* Logistics Fields: Confirmation + ID/Address */}
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', 
                        gap: isMobile ? '1rem' : '1.25rem' 
                      }}>
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
                          <>
                            <div>
                              <label style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.5, marginBottom: '0.4rem', display: 'block', fontWeight: 'bold' }}>
                                {labels.origin}
                              </label>
                              <input 
                                className="glass-input"
                                list={currentType === 'flight' ? `airports-origin-${item.id}` : undefined}
                                value={item.origin || ''}
                                onChange={(e) => updateItemField(item.id, 'origin', currentType === 'flight' ? e.target.value.toUpperCase() : e.target.value)}
                                style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', padding: '0.75rem', fontSize: '0.9rem', color: 'var(--text-main)', borderRadius: '10px' }}
                                placeholder={currentType === 'flight' ? "Ex: GRU" : "Ex: Gare du Nord, Rodoviária..."}
                              />
                              {currentType === 'flight' && (
                                <datalist id={`airports-origin-${item.id}`}>
                                  {AIRPORTS.map(airport => (
                                    <option key={airport.iata} value={airport.iata}>
                                      {airport.city} - {airport.name} ({airport.country})
                                    </option>
                                  ))}
                                </datalist>
                              )}
                            </div>

                            <div>
                              <label style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.5, marginBottom: '0.4rem', display: 'block', fontWeight: 'bold' }}>
                                {labels.destination}
                              </label>
                              <input 
                                className="glass-input"
                                list={currentType === 'flight' ? `airports-destination-${item.id}` : undefined}
                                value={item.destination || ''}
                                onChange={(e) => updateItemField(item.id, 'destination', currentType === 'flight' ? e.target.value.toUpperCase() : e.target.value)}
                                style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', padding: '0.75rem', fontSize: '0.9rem', color: 'var(--text-main)', borderRadius: '10px' }}
                                placeholder={currentType === 'flight' ? "Ex: GIG" : "Ex: St Pancras, Terminal 1..."}
                              />
                              {currentType === 'flight' && (
                                <datalist id={`airports-destination-${item.id}`}>
                                  {AIRPORTS.map(airport => (
                                    <option key={airport.iata} value={airport.iata}>
                                      {airport.city} - {airport.name} ({airport.country})
                                    </option>
                                  ))}
                                </datalist>
                              )}
                            </div>

                            <div>
                              <label style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.5, marginBottom: '0.4rem', display: 'block', fontWeight: 'bold' }}>
                                {labels.id}
                              </label>
                              <input 
                                className="glass-input"
                                value={item.transport_id || ''}
                                onChange={(e) => updateItemField(item.id, 'transport_id', e.target.value)}
                                style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', padding: '0.75rem', fontSize: '0.9rem', color: 'var(--text-main)', borderRadius: '10px' }}
                                placeholder={currentType === 'flight' ? "Ex: LA8100, Placa ABC-1234..." : "Ex: Eurostar 9010..."}
                              />
                            </div>
                          </>
                        )}

                        {isTransport && labels.showSeats && (
                          <div style={{ gridColumn: isMobile ? 'span 1' : 'span 2' }}>
                            <label style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.5, marginBottom: '0.4rem', display: 'block', fontWeight: 'bold' }}>Assento(s)</label>
                            <div className="glass-card" style={{ 
                              padding: '0.5rem', 
                              minHeight: '45px', 
                              display: 'flex', 
                              flexWrap: 'wrap', 
                              gap: '0.5rem', 
                              background: 'rgba(255,255,255,0.03)', 
                              border: '1px solid var(--glass-border)',
                              borderRadius: '12px',
                              alignItems: 'center'
                            }}>
                              {(item.seats || []).map((seat, sIdx) => (
                                <span key={sIdx} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--primary)', color: 'white', padding: '0.2rem 0.6rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '600' }}>
                                  {seat}
                                  <button type="button" onClick={() => updateItemField(item.id, 'seats', (item.seats || []).filter((_, i) => i !== sIdx))} style={{ background: 'none', border: 'none', color: 'white', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: 0.8 }}>
                                    <X size={14} />
                                  </button>
                                </span>
                              ))}
                              <input
                                type="text"
                                className="glass-input"
                                style={{ flex: 1, minWidth: '120px', background: 'transparent', border: 'none', color: 'var(--text-main)', fontSize: '0.85rem', outline: 'none', padding: '0.2rem' }}
                                placeholder="Adicionar assento..."
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && e.target.value) {
                                    updateItemField(item.id, 'seats', [...(item.seats || []), e.target.value]);
                                    e.target.value = '';
                                  }
                                }}
                              />
                            </div>
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
                    </>
                  );
                })()}

                {/* Dates & Times */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
                  <div>
                    <label style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.5, marginBottom: '0.4rem', display: 'block', fontWeight: 'bold' }}>{getStartLabel()}</label>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto', gap: '0.5rem' }}>
                      <input 
                        type="text"
                        className="glass-input"
                        placeholder="DD/MM/AAAA"
                        value={localDateValues[`${item.id}_start_date`] ?? (item.start_date ? formatDateToDisplay(item.start_date) : '')}
                        onChange={(e) => {
                          const masked = handleDateMask(e.target.value);
                          setLocalDateValues(prev => ({ ...prev, [`${item.id}_start_date`]: masked }));
                          
                          if (masked.length === 10) {
                            const iso = parseDisplayDateToISO(masked);
                            updateItemField(item.id, 'start_date', iso);
                          } else if (masked === '') {
                            updateItemField(item.id, 'start_date', '');
                          }
                        }}
                        onBlur={(e) => {
                          const val = e.target.value;
                          if (val.length > 0 && val.length < 10) {
                            setLocalDateValues(prev => ({ ...prev, [`${item.id}_start_date`]: item.start_date ? formatDateToDisplay(item.start_date) : '' }));
                          }
                        }}
                        style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', padding: '0.75rem', fontSize: '0.9rem', color: 'var(--text-main)', borderRadius: '10px' }}
                      />
                      <input 
                        type="time"
                        className="glass-input"
                        value={item.start_time || ''}
                        onChange={(e) => updateItemField(item.id, 'start_time', e.target.value)}
                        style={{ width: isMobile ? '100%' : '115px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', padding: '0.75rem', fontSize: '0.9rem', color: 'var(--text-main)', borderRadius: '10px' }}
                      />
                    </div>
                  </div>

                  {getEndLabel() && (
                    <div>
                      <label style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.5, marginBottom: '0.4rem', display: 'block', fontWeight: 'bold' }}>{getEndLabel()}</label>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto', gap: '0.5rem' }}>
                        <input 
                          type="text"
                          className="glass-input"
                          placeholder="DD/MM/AAAA"
                          value={localDateValues[`${item.id}_end_date`] ?? (item.end_date ? formatDateToDisplay(item.end_date) : '')}
                          onChange={(e) => {
                            const masked = handleDateMask(e.target.value);
                            setLocalDateValues(prev => ({ ...prev, [`${item.id}_end_date`]: masked }));
                            
                            if (masked.length === 10) {
                              const iso = parseDisplayDateToISO(masked);
                              updateItemField(item.id, 'end_date', iso);
                            } else if (masked === '') {
                              updateItemField(item.id, 'end_date', '');
                            }
                          }}
                          onBlur={(e) => {
                            const val = e.target.value;
                            if (val.length > 0 && val.length < 10) {
                              setLocalDateValues(prev => ({ ...prev, [`${item.id}_end_date`]: item.end_date ? formatDateToDisplay(item.end_date) : '' }));
                            }
                          }}
                          style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', padding: '0.75rem', fontSize: '0.9rem', color: 'var(--text-main)', borderRadius: '10px' }}
                        />
                        <input 
                          type="time"
                          className="glass-input"
                          value={item.end_time || ''}
                          onChange={(e) => updateItemField(item.id, 'end_time', e.target.value)}
                          style={{ width: isMobile ? '100%' : '115px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', padding: '0.75rem', fontSize: '0.9rem', color: 'var(--text-main)', borderRadius: '10px' }}
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
