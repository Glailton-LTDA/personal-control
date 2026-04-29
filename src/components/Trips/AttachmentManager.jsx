import React, { useState } from 'react';
import { supabase, getSignedUrl } from '../../lib/supabase';
import { Plus, X, Upload, FileText, Trash2, ExternalLink, Loader2, ChevronDown, ChevronRight, Ticket, MapPin, Plane, Train, Bus, Car, Ship } from 'lucide-react';
import AddressInput from './AddressInput';
import { AnimatePresence, motion as Motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { confirmToast } from '../../lib/toast';
import BadgeInput from './BadgeInput';
import { AIRPORTS } from '../../data/airports';

export default function AttachmentManager({ label, icon: Icon, items, onItemsChange, tripId, defaultExpanded = true, readOnly = false }) {
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);

  React.useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [isUploading, setIsUploading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const generateId = () => {
    try {
      return crypto.randomUUID();
    } catch {
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

      // Armazenamos apenas o filePath no banco, para maior flexibilidade e segurança
      const newItems = items.map((item, idx) => 
        idx === index ? { ...item, receipt_url: filePath } : item
      );
      onItemsChange(newItems);
    } catch (error) {
      toast.error('Erro ao fazer upload: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleView = async (urlOrPath) => {
    if (!urlOrPath) return;
    const signedUrl = await getSignedUrl('trip-documents', urlOrPath);
    if (signedUrl) {
      window.open(signedUrl, '_blank');
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
      coach: '',        // New field for Coach / Wagon
      origin: '',       // New field for flight segments
      destination: '',  // New field for flight segments
      address: '',
      receipt_url: null 
    }]);
    if (!isExpanded) setIsExpanded(true);
  };

  const [localDateValues, setLocalDateValues] = useState({}); // { id_field: 'DD/MM/AAAA' }

  const removeItem = (id) => {
    confirmToast('Remover este item?', () => {
      onItemsChange(items.filter(item => item.id !== id));
    }, { danger: true });
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
  const isMisc = /documentos/i.test(label) || /diversos/i.test(label);

  // Field label helpers based on type
  const getStartLabel = () => {
    if (isLodging) return 'Check-in';
    if (isTransport) return 'Partida';
    if (isTour) return 'Hora';
    if (isMisc) return 'Data';
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
        return { origin: 'Estação de Partida', destination: 'Estação de Chegada', id: 'Nº do Trem', showSeats: true, showCoach: true, coachLabel: 'Carro / Vagão' };
      case 'bus':
        return { origin: 'Terminal de Partida', destination: 'Terminal de Chegada', id: 'Empresa / Linha', showSeats: true, showCoach: true, coachLabel: 'Plataforma / Box' };
      case 'ship':
        return { origin: 'Porto de Partida', destination: 'Porto de Chegada', id: 'Cruzeiro / Cabine', showSeats: true, showCoach: true, coachLabel: 'Deck / Piso' };
      case 'car':
        return { origin: 'Local de Retirada', destination: 'Local de Devolução', id: 'Modelo / Placa', showSeats: false, showCoach: false };
      case 'flight':
      default:
        return { origin: 'Origem (IATA)', destination: 'Destino (IATA)', id: 'Nº Voo / Cia', showSeats: true, showCoach: true, coachLabel: 'Portão / Grupo' };
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
          <Motion.div 
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
                            value={item.name || ''}
                            disabled={readOnly}
                            onChange={(e) => updateItemField(item.id, 'name', e.target.value)}
                            style={{ 
                              width: '100%', 
                              background: readOnly ? 'transparent' : 'rgba(255,255,255,0.03)', 
                              border: readOnly ? 'none' : '1px solid var(--glass-border)', 
                              padding: readOnly ? '0 0 0.5rem 0' : '0.75rem', 
                              fontWeight: '700', 
                              fontSize: '1.2rem', 
                              color: 'var(--text-main)', 
                              borderRadius: '12px' 
                            }}
                            placeholder={isTransport ? "Ex: Voo LATAM, Aluguel Hertz..." : isTour ? "Ex: Museu do Louvre, Ingresso Show..." : isMisc ? "Ex: Seguro Viagem Porto, Recibo Jantar..." : "Ex: Ibis Paris, Airbnb Marais..."}
                          />
                        </div>

                        {!isMobile && !readOnly && (
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

                      {/* Logistics Fields */}
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
                            disabled={readOnly}
                            style={{ 
                              width: '100%', 
                              background: readOnly ? 'transparent' : 'rgba(255,255,255,0.03)', 
                              border: readOnly ? 'none' : '1px solid var(--glass-border)', 
                              padding: readOnly ? '0' : '0.75rem', 
                              fontSize: '0.9rem', 
                              color: 'var(--text-main)', 
                              borderRadius: '10px', 
                              opacity: 1 
                            }}
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
                                disabled={readOnly}
                                 style={{ 
                                   width: '100%', 
                                   background: readOnly ? 'transparent' : 'rgba(255,255,255,0.03)', 
                                   border: readOnly ? 'none' : '1px solid var(--glass-border)', 
                                   padding: readOnly ? '0' : '0.75rem', 
                                   fontSize: '0.9rem', 
                                   color: 'var(--text-main)', 
                                   borderRadius: '10px', 
                                   opacity: 1 
                                 }}
                                placeholder={currentType === 'flight' ? "Ex: GRU" : "Ex: Gare du Nord, Rodoviária..."}
                              />
                              {currentType === 'flight' && (
                                <datalist id={`airports-origin-${item.id}`}>
                                  {AIRPORTS.map(ap => (
                                    <option key={ap.iata} value={ap.iata}>{ap.city} ({ap.iata}) - {ap.name}</option>
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
                                disabled={readOnly}
                                 style={{ 
                                   width: '100%', 
                                   background: readOnly ? 'transparent' : 'rgba(255,255,255,0.03)', 
                                   border: readOnly ? 'none' : '1px solid var(--glass-border)', 
                                   padding: readOnly ? '0' : '0.75rem', 
                                   fontSize: '0.9rem', 
                                   color: 'var(--text-main)', 
                                   borderRadius: '10px', 
                                   opacity: 1 
                                 }}
                                placeholder={currentType === 'flight' ? "Ex: GIG" : "Ex: St Pancras, Terminal 1..."}
                              />
                              {currentType === 'flight' && (
                                <datalist id={`airports-destination-${item.id}`}>
                                  {AIRPORTS.map(ap => (
                                    <option key={ap.iata} value={ap.iata}>{ap.city} ({ap.iata}) - {ap.name}</option>
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
                                disabled={readOnly}
                                style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', padding: '0.75rem', fontSize: '0.9rem', color: 'var(--text-main)', borderRadius: '10px', opacity: readOnly ? 0.7 : 1 }}
                                placeholder={currentType === 'flight' ? "Ex: LA8100, Placa ABC-1234..." : "Ex: Eurostar 9010..."}
                              />
                            </div>

                            {labels.showCoach && (
                              <div>
                                <label style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.5, marginBottom: '0.4rem', display: 'block', fontWeight: 'bold' }}>
                                  {labels.coachLabel}
                                </label>
                                <input 
                                  className="glass-input"
                                  value={item.coach || ''}
                                  onChange={(e) => updateItemField(item.id, 'coach', e.target.value)}
                                  style={{ 
                                    width: '100%', 
                                    background: readOnly ? 'transparent' : 'rgba(255,255,255,0.03)', 
                                    border: readOnly ? 'none' : '1px solid var(--glass-border)', 
                                    padding: readOnly ? '0' : '0.75rem', 
                                    fontSize: '0.9rem', 
                                    color: 'var(--text-main)', 
                                    borderRadius: '10px', 
                                    opacity: 1,
                                    height: readOnly ? 'auto' : '44px'
                                  }}
                                  />
                              </div>
                            )}

                            {labels.showSeats && (
                              <div style={{ gridColumn: isMobile ? 'span 1' : 'span 2' }}>
                                <BadgeInput 
                                  label="Assentos do Passageiro" 
                                  icon={Ticket} 
                                  values={item.seats || []} 
                                  placeholder="Ex: 12A, 12B..."
                                  onValuesChange={(newValues) => updateItemField(item.id, 'seats', newValues)} 
                                  readOnly={readOnly}
                                />
                              </div>
                            )}
                          </>
                        )}

                        {isTour && (
                          <div style={{ gridColumn: isMobile ? 'span 1' : 'span 2' }}>
                            <label style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.5, marginBottom: '0.4rem', display: 'block', fontWeight: 'bold' }}>Endereço / Local</label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <AddressInput 
                                value={item.address}
                                onChange={(val, coords) => {
                                  updateItemField(item.id, 'address', val);
                                  if (coords) {
                                    updateItemField(item.id, 'coordinates', coords);
                                  }
                                }}
                                disabled={readOnly}
                                placeholder="Ex: Louvre Museum, Rue de Rivoli..."
                                style={{ 
                                  background: readOnly ? 'transparent' : 'rgba(255,255,255,0.03)', 
                                  border: readOnly ? 'none' : '1px solid var(--glass-border)', 
                                  padding: readOnly ? '0' : '0.75rem', 
                                  fontSize: '0.9rem', 
                                  color: 'var(--text-main)', 
                                  borderRadius: '10px', 
                                  opacity: 1 
                                }}
                              />
                              {readOnly && item.address && (
                                <button 
                                  onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address)}`, '_blank')}
                                  style={{ background: 'var(--primary)', color: 'white', border: 'none', padding: '0 0.75rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', fontWeight: '700' }}
                                  title="Ver no Google Maps"
                                >
                                  <MapPin size={14} /> MAPS
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        {isLodging && (
                          <div style={{ gridColumn: isMobile ? 'span 1' : 'span 2' }}>
                            <label style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.5, marginBottom: '0.4rem', display: 'block', fontWeight: 'bold' }}>Endereço da Hospedagem</label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <AddressInput 
                                value={item.address}
                                onChange={(val, coords) => {
                                  updateItemField(item.id, 'address', val);
                                  if (coords) {
                                    updateItemField(item.id, 'coordinates', coords);
                                  }
                                }}
                                disabled={readOnly}
                                placeholder="Ex: Rua das Flores, 123..."
                                style={{ 
                                  background: readOnly ? 'transparent' : 'rgba(255,255,255,0.03)', 
                                  border: readOnly ? 'none' : '1px solid var(--glass-border)', 
                                  padding: readOnly ? '0' : '0.75rem', 
                                  fontSize: '0.9rem', 
                                  color: 'var(--text-main)', 
                                  borderRadius: '10px', 
                                  opacity: 1 
                                }}
                              />
                              {readOnly && item.address && (
                                <button 
                                  onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address)}`, '_blank')}
                                  style={{ background: 'var(--primary)', color: 'white', border: 'none', padding: '0 0.75rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', fontWeight: '700' }}
                                  title="Ver no Google Maps"
                                >
                                  <MapPin size={14} /> MAPS
                                </button>
                              )}
                            </div>
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
                        disabled={readOnly}
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
                        style={{ width: '100%', background: readOnly ? 'transparent' : 'rgba(255,255,255,0.03)', border: readOnly ? 'none' : '1px solid var(--glass-border)', padding: readOnly ? '0' : '0.75rem', fontSize: '0.9rem', color: 'var(--text-main)', borderRadius: '10px', opacity: 1 }}
                      />
                      <input 
                        type="time"
                        className="glass-input"
                        value={item.start_time || ''}
                        onChange={(e) => updateItemField(item.id, 'start_time', e.target.value)}
                        disabled={readOnly}
                        style={{ 
                          width: isMobile ? '100%' : '115px', 
                          background: readOnly ? 'transparent' : 'rgba(255,255,255,0.03)', 
                          border: readOnly ? 'none' : '1px solid var(--glass-border)', 
                          padding: readOnly ? '0' : '0.75rem', 
                          fontSize: '0.9rem', 
                          color: 'var(--text-main)', 
                          borderRadius: '10px', 
                          opacity: 1 
                        }}
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
                          disabled={readOnly}
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
                          style={{ 
                            width: '100%', 
                            background: readOnly ? 'transparent' : 'rgba(255,255,255,0.03)', 
                            border: readOnly ? 'none' : '1px solid var(--glass-border)', 
                            padding: readOnly ? '0' : '0.75rem', 
                            fontSize: '0.9rem', 
                            color: 'var(--text-main)', 
                            borderRadius: '10px', 
                            opacity: 1 
                          }}
                        />
                        <input 
                          type="time"
                          className="glass-input"
                          value={item.end_time || ''}
                          onChange={(e) => updateItemField(item.id, 'end_time', e.target.value)}
                          disabled={readOnly}
                          style={{ 
                          width: isMobile ? '100%' : '115px', 
                          background: readOnly ? 'transparent' : 'rgba(255,255,255,0.03)', 
                          border: readOnly ? 'none' : '1px solid var(--glass-border)', 
                          padding: readOnly ? '0' : '0.75rem', 
                          fontSize: '0.9rem', 
                          color: 'var(--text-main)', 
                          borderRadius: '10px', 
                          opacity: 1 
                        }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <label style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.5, marginBottom: '0.4rem', display: 'block', fontWeight: 'bold' }}>Notas Adicionais</label>
                  <textarea 
                    className="glass-input"
                    value={item.notes || ''}
                    onChange={(e) => updateItemField(item.id, 'notes', e.target.value)}
                    disabled={readOnly}
                    style={{ 
                      width: '100%', 
                      background: readOnly ? 'transparent' : 'rgba(255,255,255,0.03)', 
                      border: readOnly ? 'none' : '1px solid var(--glass-border)', 
                      padding: readOnly ? '0' : '0.75rem', 
                      fontSize: '0.9rem', 
                      color: 'var(--text-main)', 
                      borderRadius: '10px', 
                      minHeight: readOnly ? 'auto' : '60px', 
                      resize: readOnly ? 'none' : 'vertical', 
                      opacity: 1 
                    }}
                    placeholder="Check-in às 14h, portão C3..."
                  />
                </div>

                {/* Attachment Row */}
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {item.receipt_url ? (
                    <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                      <button 
                        type="button"
                        onClick={() => handleView(item.receipt_url)}
                        className="btn"
                        style={{ flex: 1, height: '44px', padding: '0 1rem', background: 'rgba(99,102,241,0.1)', color: 'var(--primary)', border: 'none', cursor: 'pointer', fontSize: '0.85rem', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: '700' }}
                      >
                        <FileText size={18} /> Ver Voucher / Comprovante
                      </button>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Trash2 size={20} />
                        </button>
                      )}
                    </div>
                  ) : (
                    !readOnly ? (
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
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', 
                            width: '100%', height: '44px', background: 'rgba(255,255,255,0.03)', 
                            borderRadius: '12px', fontSize: '0.85rem', color: 'var(--text-muted)', 
                            cursor: 'pointer', border: '1px dashed var(--glass-border)', fontWeight: '600'
                          }}
                        >
                          {isUploading ? <Loader2 size={16} className="spin" /> : <Upload size={16} />}
                          {isUploading ? 'Enviando...' : 'Anexar Voucher / Comprovante'}
                        </label>
                      </div>
                    ) : null
                  )}
                </div>
              </div>
            ))}

            {!readOnly && (
              <button
                type="button"
                onClick={addItem}
                style={{
                  width: '100%', padding: '1.25rem', borderRadius: '16px', 
                  background: 'rgba(255,255,255,0.01)', border: '1px dashed var(--glass-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', 
                  gap: '0.75rem', color: 'var(--text-muted)', fontSize: '0.9rem', 
                  fontWeight: '600', cursor: 'pointer'
                }}
              >
                <Plus size={18} /> + Adicionar novo...
              </button>
            )}
          </Motion.div>
        )}
      </AnimatePresence>
      
      <style dangerouslySetInnerHTML={{ __html: `
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}} />
    </div>
  );
}
