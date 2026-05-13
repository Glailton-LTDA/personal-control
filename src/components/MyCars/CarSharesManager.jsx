import { useTranslation } from 'react-i18next';
import { Users, Mail, Trash2, ShieldCheck } from 'lucide-react';

export default function CarSharesManager({ activeShares, onRevoke }) {
  const { t } = useTranslation();
  if (activeShares.length === 0) return null;

  return (
    <div className="glass-card" style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <div className="cat-icon-wrap" style={{ "--cat-color": "var(--primary)", width: 44, height: 44, borderRadius: 12 }}>
          <Users size={22} />
        </div>
        <div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>{t('cars.active_shares', 'Compartilhamentos Ativos')}</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>{t('cars.active_shares_desc', 'Usuários com permissão de visualização/edição.')}</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {activeShares.map(share => (
          <div key={share.id} style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            background: 'var(--card-action-bg)', 
            padding: '1.25rem', 
            borderRadius: '16px', 
            border: '1px solid var(--glass-border)',
            transition: 'transform 0.2s'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ 
                width: 42, height: 42, borderRadius: '50%', 
                background: 'rgba(255,255,255,0.05)', 
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid var(--glass-border)'
              }}>
                <Mail size={18} style={{ opacity: 0.5 }} />
              </div>
              <div>
                <p style={{ fontWeight: 800, fontSize: '0.95rem', margin: 0, color: 'var(--text-main)' }}>{share.shared_with_email}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                  <span className="cat-chip" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                    {share.car_id?.name || t('cars.shared_vehicle', 'Veículo compartilhado')}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--success)', fontSize: '0.7rem', fontWeight: 700 }}>
                    <ShieldCheck size={12} />
                    {t('cars.active_access', 'Acesso Ativo')}
                  </div>
                </div>
              </div>
            </div>
            <button 
              className="action-btn danger" 
              onClick={() => onRevoke(share.id)} 
              title={t('cars.revoke_access', 'Revogar acesso')}
              style={{ width: 42, height: 42 }}
            >
              <Trash2 size={18} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
