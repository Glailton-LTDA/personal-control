import React from 'react';
import { Users, Mail, Trash2 } from 'lucide-react';

export default function CarSharesManager({ activeShares, onRevoke }) {
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
