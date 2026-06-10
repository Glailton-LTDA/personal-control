import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion as Motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { Plus, Trash2, Edit2, Save, X, Palette, Building2, Layers, CreditCard } from 'lucide-react';
import toast from 'react-hot-toast';
import { confirmToast } from '../../lib/toast';
import CurrencySelector from '../Trips/CurrencySelector';
import { CURRENCIES } from '../../constants/currencies';

export default function InvestmentSettings({ user }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('accounts');
  const [accounts, setAccounts] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [accountTypes, setAccountTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    institution_id: '',
    account_type_id: '',
    color: '#6366f1',
    currency: 'BRL'
  });

  const [instData, setInstData] = useState({
    name: '',
    color: '#6366f1'
  });

  const [typeData, setTypeData] = useState({
    name: ''
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch Institutions
      const { data: insts } = await supabase.from('investment_institutions').select('*').order('name');
      setInstitutions(insts || []);

      // Fetch Account Types
      const { data: types } = await supabase.from('investment_account_types').select('*').order('name');
      setAccountTypes(types || []);

      // Fetch Accounts with joins
      const { data: accs } = await supabase
        .from('investment_accounts')
        .select('*, institution:investment_institutions(name, color), type:investment_account_types(name)')
        .order('name');
      
      if (accs) {
        setAccounts(accs);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [user, fetchData]);

  const resetForms = () => {
    setFormData({ name: '', institution_id: '', account_type_id: '', color: '#6366f1', currency: 'BRL' });
    setInstData({ name: '', color: '#6366f1' });
    setTypeData({ name: '' });
    setEditingId(null);
    setIsAdding(false);
  };
  
  const renderFlag = (code, size = '1.2rem') => {
    const curr = CURRENCIES.find(c => c.code === code);
    const flag = curr?.flag;
    if (!flag) return null;
    if (flag.startsWith('data:image')) {
      return (
        <img 
          src={flag} 
          alt={code} 
          style={{ 
            width: size, 
            height: size, 
            objectFit: 'contain',
            borderRadius: '2px',
            display: 'inline-block',
            verticalAlign: 'middle'
          }} 
        />
      );
    }
    return <span style={{ fontSize: size }}>{flag}</span>;
  };

  async function handleAccountSubmit(e) {
    e.preventDefault();
    const encrypted = formData;
    
    if (editingId) {
      const { error } = await supabase
        .from('investment_accounts')
        .update({
          name: encrypted.name,
          institution_id: formData.institution_id || null,
          account_type_id: formData.account_type_id || null,
          color: formData.color,
          currency: formData.currency || 'BRL'
        })
        .eq('id', editingId);
      
      if (!error) {
        toast.success(t('investments.account_updated'));
        resetForms();
        fetchData();
      }
    } else {
      const { error } = await supabase
        .from('investment_accounts')
        .insert([{
          name: encrypted.name,
          institution_id: formData.institution_id || null,
          account_type_id: formData.account_type_id || null,
          color: formData.color,
          currency: formData.currency || 'BRL',
          user_id: user.id
        }]);
      
      if (!error) {
        toast.success(t('investments.account_created'));
        resetForms();
        fetchData();
      }
    }
  }

  async function handleInstitutionSubmit(e) {
    e.preventDefault();
    if (editingId) {
      const { error } = await supabase
        .from('investment_institutions')
        .update(instData)
        .eq('id', editingId);
      if (!error) { toast.success(t('investments.institution_updated')); resetForms(); fetchData(); }
    } else {
      const { error } = await supabase
        .from('investment_institutions')
        .insert([{ ...instData, user_id: user.id }]);
      if (!error) { toast.success(t('investments.institution_created')); resetForms(); fetchData(); }
    }
  }

  async function handleTypeSubmit(e) {
    e.preventDefault();
    if (editingId) {
      const { error } = await supabase
        .from('investment_account_types')
        .update(typeData)
        .eq('id', editingId);
      if (!error) { toast.success(t('investments.type_updated')); resetForms(); fetchData(); }
    } else {
      const { error } = await supabase
        .from('investment_account_types')
        .insert([{ ...typeData, user_id: user.id }]);
      if (!error) { toast.success(t('investments.type_created')); resetForms(); fetchData(); }
    }
  }

  const deleteItem = async (table, id, label) => {
    confirmToast(t('investments.confirm_delete', { label }), async () => {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (!error) { toast.success(t('investments.item_deleted', { label })); fetchData(); }
      else { toast.error(t('investments.error_delete_deps')); }
    }, { danger: true });
  };
  
  const groupedAccounts = React.useMemo(() => {
    const groups = {};
    accounts.forEach(acc => {
      const instName = acc.institution?.name || 'Sem Instituição';
      if (!groups[instName]) {
        groups[instName] = { 
          name: instName, 
          color: acc.institution?.color || '#6366f1', 
          items: [] 
        };
      }
      groups[instName].items.push(acc);
    });
    return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));
  }, [accounts]);

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '5rem' }}>
      <div style={{ marginBottom: '2.5rem' }}>
        <h3 style={{ fontSize: '1.75rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.75rem', letterSpacing: '-0.02em' }}>
          <Palette size={28} color="var(--primary)" /> {t('investments.settings_title')}
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginTop: '0.5rem', fontWeight: 500 }}>{t('investments.settings_desc')}</p>
      </div>

      <div className="tabs-container" style={{ marginBottom: '2rem' }}>
        <button className={`tab-btn ${activeTab === 'accounts' ? 'active' : ''}`} onClick={() => setActiveTab('accounts')}>
          <CreditCard size={18} /> {t('investments.accounts_tab')}
        </button>
        <button className={`tab-btn ${activeTab === 'institutions' ? 'active' : ''}`} onClick={() => setActiveTab('institutions')}>
          <Building2 size={18} /> {t('investments.institutions_tab')}
        </button>
        <button className={`tab-btn ${activeTab === 'types' ? 'active' : ''}`} onClick={() => setActiveTab('types')}>
          <Layers size={18} /> {t('investments.account_types_tab')}
        </button>
      </div>

      <AnimatePresence mode="wait">
        {isAdding && (
          <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', zIndex: 2000 }}>
            <Motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="glass-card" 
              style={{ padding: '2rem', width: '100%', maxWidth: '600px', border: '2px solid var(--primary)', position: 'relative' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h3 style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                  {t(editingId ? 'investments.edit_' + (activeTab === 'accounts' ? 'account' : activeTab === 'institutions' ? 'institution' : 'type') : 'investments.new_' + (activeTab === 'accounts' ? 'account' : activeTab === 'institutions' ? 'institution' : 'type'))}
                </h3>
                <button onClick={resetForms} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={24} /></button>
              </div>

              {activeTab === 'accounts' && (
                <form onSubmit={handleAccountSubmit}>
                  <div className="form-grid">
                    <div className="input-group">
                      <label>{t('investments.account_name')}</label>
                      <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
                    </div>
                    <div className="input-group">
                      <label>{t('investments.select_institution')}</label>
                      <select className="glass-input" value={formData.institution_id} onChange={e => setFormData({...formData, institution_id: e.target.value})}>
                        <option value="">{t('investments.select_default')}</option>
                        {institutions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                      </select>
                    </div>
                    <div className="input-group">
                      <label>{t('investments.select_account_type')}</label>
                      <select className="glass-input" value={formData.account_type_id} onChange={e => setFormData({...formData, account_type_id: e.target.value})}>
                        <option value="">{t('investments.select_default')}</option>
                        {accountTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                    <div className="input-group">
                      <label>{t('investments.chart_color')}</label>
                      <input type="color" value={formData.color} onChange={e => setFormData({...formData, color: e.target.value})} style={{ height: '45px', padding: '4px' }} />
                    </div>
                    <div className="input-group" style={{ gridColumn: 'span 2' }}>
                      <label>{t('investments.account_currency')}</label>
                      <CurrencySelector 
                        selectedCurrencies={formData.currency ? [formData.currency] : ['BRL']} 
                        onSelectionChange={(newSelection) => setFormData({...formData, currency: newSelection[0] || 'BRL'})}
                        single={true}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2.5rem' }}>
                    <button type="button" className="btn-cancel" onClick={resetForms}>{t('investments.cancel')}</button>
                    <button type="submit" className="btn-primary"><Save size={18} /> {t('investments.save')}</button>
                  </div>
                </form>
              )}

              {activeTab === 'institutions' && (
                <form onSubmit={handleInstitutionSubmit}>
                  <div className="input-group">
                    <label>{t('investments.institution_name')}</label>
                    <input type="text" value={instData.name} onChange={e => setInstData({...instData, name: e.target.value})} required />
                  </div>
                  <div className="input-group">
                    <label>{t('investments.institution_color')}</label>
                    <input type="color" value={instData.color} onChange={e => setInstData({...instData, color: e.target.value})} style={{ height: '45px', padding: '4px' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2.5rem' }}>
                    <button type="button" className="btn-cancel" onClick={resetForms}>{t('investments.cancel')}</button>
                    <button type="submit" className="btn-primary"><Save size={18} /> {t('investments.save')}</button>
                  </div>
                </form>
              )}

              {activeTab === 'types' && (
                <form onSubmit={handleTypeSubmit}>
                  <div className="input-group">
                    <label>{t('investments.type_name')}</label>
                    <input type="text" value={typeData.name} onChange={e => setTypeData({...typeData, name: e.target.value})} required placeholder={t('investments.type_placeholder')} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2.5rem' }}>
                    <button type="button" className="btn-cancel" onClick={resetForms}>{t('investments.cancel')}</button>
                    <button type="submit" className="btn-primary"><Save size={18} /> {t('investments.save')}</button>
                  </div>
                </form>
              )}
            </Motion.div>
          </div>
        )}
      </AnimatePresence>

      <Motion.div 
        key={activeTab}
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}
      >
        {loading ? (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '4rem' }}>{t('investments.loading')}</div>
        ) : (
          <>
            {activeTab === 'accounts' && (
              accounts.length === 0 ? <p style={{ gridColumn: '1/-1', textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>{t('investments.no_accounts')}</p> :
              groupedAccounts.map(group => (
                <div key={group.name} style={{ gridColumn: '1/-1', marginBottom: '2rem' }}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '1rem', 
                    marginBottom: '1.25rem',
                    padding: '0.5rem 1rem',
                    background: 'var(--card-action-bg)',
                    borderRadius: '12px',
                    width: 'fit-content',
                    border: '1px solid var(--glass-border)'
                  }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: group.color }}></div>
                    <h5 style={{ fontSize: '0.9rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-main)' }}>
                      {group.name}
                    </h5>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginLeft: '0.5rem' }}>
                      {group.items.length} {group.items.length === 1 ? t('investments.account_label') : t('investments.accounts_label')}
                    </span>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
                    {group.items.map(acc => (
                      <div key={acc.id} className="glass-card" style={{ 
                        padding: '1.5rem', 
                        position: 'relative',
                        background: `linear-gradient(135deg, var(--bg-card), color-mix(in srgb, ${acc.color} 5%, transparent))`,
                        borderTop: `4px solid ${acc.color}`
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                              {acc.type?.name || t('investments.without_type')}
                            </p>
                            <h4 style={{ fontSize: '1.35rem', fontWeight: 900, color: 'var(--text-main)', letterSpacing: '-0.01em' }}>{acc.name}</h4>
                            
                            <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: acc.color }}></div>
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>{t('investments.visual_id')}</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {renderFlag(acc.currency || 'BRL')}
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>{acc.currency || 'BRL'}</span>
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="action-btn" onClick={() => { setEditingId(acc.id); setFormData({ name: acc.name, institution_id: acc.institution_id || '', account_type_id: acc.account_type_id || '', color: acc.color, currency: acc.currency || 'BRL' }); setIsAdding(true); }}><Edit2 size={18} /></button>
                            <button className="action-btn danger" onClick={() => deleteItem('investment_accounts', acc.id, t('investments.account_label'))}><Trash2 size={18} /></button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}

            {activeTab === 'institutions' && (
              institutions.length === 0 ? <p style={{ gridColumn: '1/-1', textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>{t('investments.no_institutions')}</p> :
              institutions.map(i => (
                <div key={i.id} className="glass-card" style={{ 
                  padding: '1.5rem', 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  background: `linear-gradient(135deg, var(--bg-card), color-mix(in srgb, ${i.color} 5%, transparent))`
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: '38px', height: '38px', borderRadius: '12px', background: `color-mix(in srgb, ${i.color} 15%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid color-mix(in srgb, ${i.color} 25%, transparent)` }}>
                      <Building2 size={20} color={i.color} />
                    </div>
                    <span style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-main)' }}>{i.name}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="action-btn" onClick={() => { setEditingId(i.id); setInstData({ name: i.name, color: i.color }); setIsAdding(true); }}><Edit2 size={18} /></button>
                    <button className="action-btn danger" onClick={() => deleteItem('investment_institutions', i.id, t('investments.institution_label'))}><Trash2 size={18} /></button>
                  </div>
                </div>
              ))
            )}

            {activeTab === 'types' && (
              accountTypes.length === 0 ? <p style={{ gridColumn: '1/-1', textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>{t('investments.no_types')}</p> :
              accountTypes.map(t => (
                <div key={t.id} className="glass-card" style={{ 
                  padding: '1.5rem', 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: '38px', height: '38px', borderRadius: '12px', background: 'var(--card-action-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--glass-border)' }}>
                      <Layers size={20} color="var(--primary)" />
                    </div>
                    <span style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-main)' }}>{t.name}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="action-btn" onClick={() => { setEditingId(t.id); setTypeData({ name: t.name }); setIsAdding(true); }}><Edit2 size={18} /></button>
                    <button className="action-btn danger" onClick={() => deleteItem('investment_account_types', t.id, t('investments.type_label'))}><Trash2 size={18} /></button>
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </Motion.div>

      {!isAdding && (
        <button className="contextual-fab" onClick={() => setIsAdding(true)}><Plus size={32} /></button>
      )}
    </div>
  );
}
