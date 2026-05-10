import React, { useState } from 'react';
import { supabase, getSignedUrl } from '../../lib/supabase';
import { 
  Plus, X, Upload, FileText, Trash2, ExternalLink, 
  Loader2, ChevronDown, ChevronRight, Ticket, MapPin, 
  Plane, Train, Bus, Car, Ship, Navigation, Calendar,
  Clock, Hash, FileCheck, Info, LayoutGrid
} from 'lucide-react';
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

      const newItems = items.map((item, idx) => 
        idx === index ? { ...item, receipt_url: filePath } : item
      );
      onItemsChange(newItems);
      toast.success('Arquivo enviado com sucesso');
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
      transports_type: 'flight',
      seats: [],
      coach: '',
      origin: '',
      destination: '',
      address: '',
      receipt_url: null 
    }]);
    if (!isExpanded) setIsExpanded(true);
  };

  const [localDateValues, setLocalDateValues] = useState({});

  const removeItem = (id) => {
    confirmToast('Deseja remover este item?', () => {
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

  const getStartLabel = () => {
    if (isLodging) return 'CHECK-IN';
    if (isTransport) return 'PARTIDA';
    if (isTour) return 'DATA / HORA';
    if (isMisc) return 'DATA';
    return 'DATA / HORA';
  };

  const getEndLabel = () => {
    if (isLodging) return 'CHECK-OUT';
    if (isTransport) return 'CHEGADA';
    return null;
  };

  const TRANSPORT_TYPES = [
    { id: 'flight', icon: Plane, label: 'Voo' },
    { id: 'train', icon: Train, label: 'Trem' },
    { id: 'bus', icon: Bus, label: 'Ônibus' },
    { id: 'ship', icon: Ship, label: 'Navio' },
    { id: 'car', icon: Car, label: 'Carro' },
    { id: 'generic', icon: MapPin, label: 'Outro' }
  ];

  const getTransportLabels = (type) => {
    switch (type) {
      case 'train':
        return { origin: 'Estação de Partida', destination: 'Estação de Chegada', id: 'Nº do Trem', showSeats: true, showCoach: true, coachLabel: 'Vagão' };
      case 'bus':
        return { origin: 'Terminal de Partida', destination: 'Terminal de Chegada', id: 'Empresa / Linha', showSeats: true, showCoach: true, coachLabel: 'Box / Plataf.' };
      case 'ship':
        return { origin: 'Porto de Partida', destination: 'Porto de Chegada', id: 'Cruzeiro / Cabine', showSeats: true, showCoach: true, coachLabel: 'Deck / Piso' };
      case 'car':
        return { origin: 'Retirada', destination: 'Devolução', id: 'Modelo / Placa', showSeats: false, showCoach: false };
      case 'flight':
      default:
        return { origin: 'Origem (IATA)', destination: 'Destino (IATA)', id: 'Voo / Cia', showSeats: true, showCoach: true, coachLabel: 'Portão' };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          cursor: 'pointer',
          padding: '1rem',
          borderRadius: '16px',
          background: isExpanded ? 'rgba(99, 102, 241, 0.05)' : 'rgba(255, 255, 255, 0.02)',
          border: '1px solid',
          borderColor: isExpanded ? 'rgba(99, 102, 241, 0.2)' : 'var(--glass-border)',
          transition: '0.3s'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ color: isExpanded ? 'var(--primary)' : 'var(--text-muted)', transition: '0.3s' }}>
            {Icon && <Icon size={20} />}
          </div>
          <span style={{ fontSize: '1rem', fontWeight: '900', color: isExpanded ? 'var(--text-main)' : 'var(--text-muted)', letterSpacing: '-0.01em' }}>
            {label}
            <span style={{ fontSize: '0.75rem', opacity: 0.4, marginLeft: '0.5rem', fontWeight: '600' }}>({items.length})</span>
          </span>
        </div>
        <div style={{ color: isExpanded ? 'var(--primary)' : 'var(--text-muted)' }}>
          {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <Motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
          >
            {items.map((item, index) => (
              <Motion.div 
                key={item.id} 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card" 
                style={{ 
                  padding: isMobile ? '1.5rem' : '2rem', 
                  borderRadius: '24px', 
                  background: 'var(--bg-card)',
                  border: '1px solid var(--glass-border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1.5rem',
                  position: 'relative',
                  boxShadow: 'var(--shadow)'
                }}
              >
                {(() => {
                  const currentType = item.transports_type || 'flight';
                  const labels = getTransportLabels(currentType);
                  return (
                    <>
                      <div style={{ 
                        display: 'flex', 
                        flexDirection: isMobile ? 'column' : 'row', 
                        gap: '1.25rem',
                        alignItems: isMobile ? 'stretch' : 'flex-start'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: isMobile ? '100%' : 'auto' }}>
                          <div style={{ 
                            width: '56px', height: '56px', borderRadius: '18px', 
                            background: 'rgba(99,102,241,0.1)', color: 'var(--primary)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            boxShadow: '0 8px 16px -4px rgba(99, 102, 241, 0.2)'
                          }}>
                            {isTransport ? (
                              (() => {
                                const IconType = TRANSPORT_TYPES.find(t => t.id === currentType)?.icon || MapPin;
                                return <IconType size={28} />;
                              })()
                            ) : Icon ? <Icon size={28} /> : <FileText size={28} />}
                          </div>

                          {isMobile && !readOnly && (
                            <button 
                              type="button"
                              onClick={() => removeItem(item.id)}
                              className="action-btn danger"
                              style={{ width: '48px', height: '48px' }}
                            >
                              <Trash2 size={22} />
                            </button>
                          )}
                        </div>
                        
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.4, marginBottom: '0.5rem', display: 'block', fontWeight: '900' }}>NOME / DESCRIÇÃO</label>
                          <input 
                            className="glass-input"
                            value={item.name || ''}
                            disabled={readOnly}
                            onChange={(e) => updateItemField(item.id, 'name', e.target.value)}
                            style={{ 
                              width: '100%', 
                              background: 'var(--card-action-bg)', 
                              border: '1px solid var(--glass-border)', 
                              padding: '1rem', 
                              fontWeight: '900', 
                              fontSize: '1.25rem', 
                              color: 'var(--text-main)', 
                              borderRadius: '14px',
                              letterSpacing: '-0.02em'
                            }}
                            placeholder={isTransport ? "Ex: Voo LATAM 1234..." : isTour ? "Ex: Ingressos Louvre..." : "Ex: Hotel Hilton..."}
                          />
                        </div>

                        {!isMobile && !readOnly && (
                          <button 
                            type="button"
                            onClick={() => removeItem(item.id)}
                            className="action-btn danger"
                            style={{ marginTop: '1.6rem', width: '44px', height: '44px' }}
                          >
                            <Trash2 size={20} />
                          </button>
                        )}
                      </div>

                      {isTransport && (
                        <div style={{ 
                          display: 'flex', 
                          gap: '0.5rem', 
                          padding: '0.5rem', 
                          background: 'rgba(255,255,255,0.03)', 
                          borderRadius: '18px',
                          width: isMobile ? '100%' : 'fit-content'
                        }}>
                          {TRANSPORT_TYPES.map(type => (
                            <button
                              key={type.id}
                              type="button"
                              disabled={readOnly}
                              onClick={() => updateItemField(item.id, 'transports_type', type.id)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.5rem',
                                padding: isMobile ? '0.75rem' : '0.6rem 1.25rem',
                                borderRadius: '12px',
                                border: 'none',
                                cursor: readOnly ? 'default' : 'pointer',
                                fontSize: '0.8rem',
                                fontWeight: '900',
                                transition: '0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                background: currentType === type.id ? 'var(--primary)' : 'transparent',
                                color: currentType === type.id ? 'white' : 'var(--text-muted)',
                                flex: isMobile ? 1 : 'none',
                                boxShadow: currentType === type.id ? '0 4px 12px -2px rgba(99, 102, 241, 0.4)' : 'none',
                                opacity: readOnly && currentType !== type.id ? 0.3 : 1
                              }}
                            >
                              <type.icon size={isMobile ? 22 : 16} />
                              {!isMobile && type.label.toUpperCase()}
                            </button>
                          ))}
                        </div>
                      )}

                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', 
                        gap: '1.5rem' 
                      }}>
                        <div style={{ position: 'relative' }}>
                  <label style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.6, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: '900', color: 'var(--text-muted)' }}>
                            <Hash size={12} style={{ display: 'inline', marginRight: '4px', marginTop: '-2px' }} /> CONFIRMAÇÃO
                          </label>
                          <input 
                            className="glass-input"
                            value={item.confirmation || ''}
                            onChange={(e) => updateItemField(item.id, 'confirmation', e.target.value)}
                            disabled={readOnly}
                            style={{ 
                              width: '100%', 
                              background: 'var(--card-action-bg)', 
                              border: '1px solid var(--glass-border)', 
                              padding: '0.85rem', 
                              fontSize: '1rem', 
                              color: 'var(--text-main)', 
                              borderRadius: '12px',
                              fontWeight: '700'
                            }}
                            placeholder="Código da reserva..."
                          />
                        </div>

                        {isTransport && (
                          <>
                            <div style={{ position: 'relative' }}>
                      <label style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.6, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: '900', color: 'var(--text-muted)' }}>
                                <Navigation size={12} style={{ display: 'inline', marginRight: '4px', marginTop: '-2px' }} /> {labels.origin.toUpperCase()}
                              </label>
                              <input 
                                className="glass-input"
                                list={currentType === 'flight' ? `airports-origin-${item.id}` : undefined}
                                value={item.origin || ''}
                                onChange={(e) => updateItemField(item.id, 'origin', currentType === 'flight' ? e.target.value.toUpperCase() : e.target.value)}
                                disabled={readOnly}
                                style={{ 
                                  width: '100%', 
                                  background: 'var(--card-action-bg)', 
                                  border: '1px solid var(--glass-border)', 
                                  padding: '0.85rem', 
                                  fontSize: '1rem', 
                                  color: 'var(--text-main)', 
                                  borderRadius: '12px',
                                  fontWeight: '700'
                                }}
                                placeholder={currentType === 'flight' ? "IATA (Ex: GRU)" : "Cidade / Estação"}
                              />
                              {currentType === 'flight' && (
                                <datalist id={`airports-origin-${item.id}`}>
                                  {AIRPORTS.map(ap => (
                                    <option key={ap.iata} value={ap.iata}>{ap.city} ({ap.iata})</option>
                                  ))}
                                </datalist>
                              )}
                            </div>

                            <div style={{ position: 'relative' }}>
                      <label style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.6, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: '900', color: 'var(--text-muted)' }}>
                                <Navigation size={12} style={{ display: 'inline', marginRight: '4px', marginTop: '-2px' }} /> {labels.destination.toUpperCase()}
                              </label>
                              <input 
                                className="glass-input"
                                list={currentType === 'flight' ? `airports-destination-${item.id}` : undefined}
                                value={item.destination || ''}
                                onChange={(e) => updateItemField(item.id, 'destination', currentType === 'flight' ? e.target.value.toUpperCase() : e.target.value)}
                                disabled={readOnly}
                                style={{ 
                                  width: '100%', 
                                  background: 'var(--card-action-bg)', 
                                  border: '1px solid var(--glass-border)', 
                                  padding: '0.85rem', 
                                  fontSize: '1rem', 
                                  color: 'var(--text-main)', 
                                  borderRadius: '12px',
                                  fontWeight: '700'
                                }}
                                placeholder={currentType === 'flight' ? "IATA (Ex: JFK)" : "Cidade / Estação"}
                              />
                              {currentType === 'flight' && (
                                <datalist id={`airports-destination-${item.id}`}>
                                  {AIRPORTS.map(ap => (
                                    <option key={ap.iata} value={ap.iata}>{ap.city} ({ap.iata})</option>
                                  ))}
                                </datalist>
                              )}
                            </div>

                            <div style={{ position: 'relative' }}>
                      <label style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.6, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: '900', color: 'var(--text-muted)' }}>
                                <FileCheck size={12} style={{ display: 'inline', marginRight: '4px', marginTop: '-2px' }} /> {labels.id.toUpperCase()}
                              </label>
                              <input 
                                className="glass-input"
                                value={item.transport_id || ''}
                                onChange={(e) => updateItemField(item.id, 'transport_id', e.target.value)}
                                disabled={readOnly}
                                style={{ width: '100%', background: 'var(--card-action-bg)', border: '1px solid var(--glass-border)', padding: '0.85rem', fontSize: '1rem', color: 'var(--text-main)', borderRadius: '12px', fontWeight: '700' }}
                                placeholder="Nº do Voo, Trem ou Placa..."
                              />
                            </div>

                            {labels.showCoach && (
                              <div style={{ position: 'relative' }}>
                        <label style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.6, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: '900', color: 'var(--text-muted)' }}>
                                  <LayoutGrid size={12} style={{ display: 'inline', marginRight: '4px', marginTop: '-2px' }} /> {labels.coachLabel.toUpperCase()}
                                </label>
                                <input 
                                  className="glass-input"
                                  value={item.coach || ''}
                                  onChange={(e) => updateItemField(item.id, 'coach', e.target.value)}
                                  disabled={readOnly}
                                  style={{ 
                                    width: '100%', 
                                    background: 'var(--card-action-bg)', 
                                    border: '1px solid var(--glass-border)', 
                                    padding: '0.85rem', 
                                    fontSize: '1rem', 
                                    color: 'var(--text-main)', 
                                    borderRadius: '12px',
                                    fontWeight: '700'
                                  }}
                                  placeholder="Ex: 4, G12..."
                                />
                              </div>
                            )}

                            {labels.showSeats && (
                              <div style={{ gridColumn: isMobile ? 'span 1' : 'span 2' }}>
                                <BadgeInput 
                                  label="ASSENTOS / POLTRONAS" 
                                  icon={Ticket} 
                                  values={item.seats || []} 
                                  placeholder="Adicionar assento..."
                                  onValuesChange={(newValues) => updateItemField(item.id, 'seats', newValues)} 
                                  readOnly={readOnly}
                                />
                              </div>
                            )}
                          </>
                        )}

                        {(isTour || isLodging) && (
                          <div style={{ gridColumn: isMobile ? 'span 1' : 'span 2' }}>
                    <label style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.6, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: '900', color: 'var(--text-muted)' }}>
                              <MapPin size={12} style={{ display: 'inline', marginRight: '4px', marginTop: '-2px' }} /> ENDEREÇO / LOCAL
                            </label>
                            <div style={{ display: 'flex', gap: '0.75rem', flexDirection: isMobile ? 'column' : 'row' }}>
                              <div style={{ flex: 1 }}>
                                <AddressInput 
                                  value={item.address}
                                  onChange={(val, coords) => {
                                    updateItemField(item.id, 'address', val);
                                    if (coords) updateItemField(item.id, 'coordinates', coords);
                                  }}
                                  disabled={readOnly}
                                  placeholder="Digite o endereço completo..."
                                  style={{ 
                                    background: 'var(--card-action-bg)', 
                                    border: '1px solid var(--glass-border)', 
                                    padding: '0.85rem', 
                                    fontSize: '1rem', 
                                    borderRadius: '12px',
                                    color: 'var(--text-main)'
                                  }}
                                />
                              </div>
                              {item.address && (
                                <button 
                                  type="button"
                                  onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address)}`, '_blank')}
                                  className="btn"
                                  style={{ 
                                    background: 'rgba(99, 102, 241, 0.1)', 
                                    color: 'var(--primary)', 
                                    border: 'none', 
                                    padding: '0.85rem 1.25rem', 
                                    borderRadius: '12px', 
                                    cursor: 'pointer', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '0.5rem', 
                                    fontSize: '0.85rem', 
                                    fontWeight: '900',
                                    whiteSpace: 'nowrap'
                                  }}
                                >
                                  <Navigation size={16} /> VER NO MAPA
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}

                {/* Dates & Times Premium */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.25rem', borderRadius: '18px', border: '1px solid var(--glass-border)' }}>
                    <label style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.4, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: '900' }}>
                      <Calendar size={12} /> {getStartLabel()}
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: '0.75rem' }}>
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
                          } else if (masked === '') updateItemField(item.id, 'start_date', '');
                        }}
                        style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', padding: '0.75rem', fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-main)' }}
                      />
                      <input 
                        type="time"
                        className="glass-input"
                        value={item.start_time || ''}
                        onChange={(e) => updateItemField(item.id, 'start_time', e.target.value)}
                        disabled={readOnly}
                        style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', padding: '0.75rem', fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-main)' }}
                      />
                    </div>
                  </div>

                  {getEndLabel() && (
                    <div style={{ background: 'var(--card-action-bg)', padding: '1.25rem', borderRadius: '18px', border: '1px solid var(--glass-border)' }}>
                      <label style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.4, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: '900' }}>
                        <Calendar size={12} /> {getEndLabel()}
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: '0.75rem' }}>
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
                            } else if (masked === '') updateItemField(item.id, 'end_date', '');
                          }}
                          style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', padding: '0.75rem', fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-main)' }}
                        />
                        <input 
                          type="time"
                          className="glass-input"
                          value={item.end_time || ''}
                          onChange={(e) => updateItemField(item.id, 'end_time', e.target.value)}
                          disabled={readOnly}
                          style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', padding: '0.75rem', fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-main)' }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Notes Premium */}
                <div style={{ position: 'relative' }}>
                  <label style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.4, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: '900' }}>
                    <Info size={12} /> NOTAS ADICIONAIS
                  </label>
                  <textarea 
                    className="glass-input"
                    value={item.notes || ''}
                    onChange={(e) => {
                      updateItemField(item.id, 'notes', e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = e.target.scrollHeight + 'px';
                    }}
                    ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
                    disabled={readOnly}
                    style={{ 
                      width: '100%', 
                      background: 'var(--card-action-bg)', 
                      border: '1px solid var(--glass-border)', 
                      padding: '1rem', 
                      fontSize: '0.95rem', 
                      color: 'var(--text-main)', 
                      borderRadius: '14px', 
                      minHeight: '60px', 
                      resize: 'none',
                      overflow: 'hidden',
                      transition: '0.2s'
                    }}
                    placeholder="Check-in às 14h, café incluso, portão C3..."
                  />
                </div>

                {/* Attachment Row Premium */}
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.5rem' }}>
                  {item.receipt_url ? (
                    <div style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
                      <button 
                        type="button"
                        onClick={() => handleView(item.receipt_url)}
                        className="btn"
                        style={{ 
                          flex: 1, height: '52px', padding: '0 1.5rem', 
                          background: 'rgba(99,102,241,0.1)', color: 'var(--primary)', 
                          border: '1px solid rgba(99,102,241,0.2)', cursor: 'pointer', 
                          fontSize: '0.9rem', borderRadius: '14px', display: 'flex', 
                          alignItems: 'center', justifyContent: 'center', gap: '0.75rem', fontWeight: '900' 
                        }}
                      >
                        <FileText size={20} /> VISUALIZAR DOCUMENTO
                      </button>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => updateItemField(item.id, 'receipt_url', null)}
                          className="action-btn danger"
                          style={{ width: '52px', height: '52px' }}
                          title="Remover anexo"
                        >
                          <X size={22} />
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
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', 
                            width: '100%', height: '52px', background: 'var(--card-action-bg)', 
                            borderRadius: '14px', fontSize: '0.9rem', color: 'var(--text-muted)', 
                            cursor: 'pointer', border: '2px dashed var(--glass-border)', fontWeight: '800',
                            transition: '0.3s'
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                        >
                          {isUploading ? <Loader2 size={20} className="spin" /> : <Upload size={20} />}
                          {isUploading ? 'ENVIANDO ARQUIVO...' : 'ANEXAR VOUCHER / COMPROVANTE'}
                        </label>
                      </div>
                    ) : null
                  )}
                </div>
              </Motion.div>
            ))}

            {!readOnly && (
              <button
                type="button"
                onClick={addItem}
                style={{
                  width: '100%', padding: '1.5rem', borderRadius: '24px', 
                  background: 'var(--card-action-bg)', border: '2px dashed var(--glass-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', 
                  gap: '1rem', color: 'var(--text-muted)', fontSize: '1rem', 
                  fontWeight: '900', cursor: 'pointer', transition: '0.3s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)'; e.currentTarget.style.background = 'rgba(99,102,241,0.02)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'rgba(255,255,255,0.01)'; }}
              >
                + Adicionar novo item
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

