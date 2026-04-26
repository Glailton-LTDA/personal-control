import toast from 'react-hot-toast';

/**
 * Custom confirmation toast with Yes/No buttons
 * @param {string} message - The message to display
 * @param {Function} onConfirm - Callback when user clicks Yes
 * @param {Object} options - Additional options
 */
export const confirmToast = (message, onConfirm, options = {}) => {
  const shouldSkip = localStorage.getItem('pc_skip_confirmations') === 'true';

  if (shouldSkip) {
    onConfirm();
    return;
  }

  toast((t) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: '220px' }}>
      <p style={{ margin: 0, fontWeight: '700', fontSize: '0.9rem', color: '#fff' }}>{message}</p>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button 
          onClick={() => {
            toast.dismiss(t.id);
            onConfirm();
          }}
          style={{ 
            background: options.danger ? '#ef4444' : '#6366f1', 
            color: 'white', 
            border: 'none', 
            padding: '0.4rem 0.8rem', 
            borderRadius: '8px', 
            cursor: 'pointer', 
            fontWeight: '700', 
            fontSize: '0.8rem' 
          }}
        >
          {options.confirmText || 'Confirmar'}
        </button>
        <button 
          onClick={() => toast.dismiss(t.id)}
          style={{ 
            background: 'rgba(255,255,255,0.1)', 
            color: '#fff', 
            border: '1px solid rgba(255,255,255,0.1)', 
            padding: '0.4rem 0.8rem', 
            borderRadius: '8px', 
            cursor: 'pointer', 
            fontWeight: '700', 
            fontSize: '0.8rem' 
          }}
        >
          {options.cancelText || 'Cancelar'}
        </button>
      </div>
    </div>
  ), { 
    duration: options.duration || 6000,
    position: options.position || 'top-right'
  });
};
