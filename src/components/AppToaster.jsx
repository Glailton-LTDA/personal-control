import React from 'react';
import toast, { ToastBar, resolveValue, useToaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

const options = {
  duration: 4000,
  loading: { duration: Infinity },
  style: {
    background: '#1e293b', color: '#fff',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px',
    fontSize: '0.9rem', padding: '12px 16px',
  },
  success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
  error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
};
const positions = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'];

/** O timer nunca pausa por hover: telas touch podem manter o mouseenter
 * sintético ativo indefinidamente. Loading continua até ser resolvido. */
export default function AppToaster() {
  const { t } = useTranslation();
  const { toasts } = useToaster(options);
  return positions.map((position) => (
    <div key={position} data-testid={`toasts-${position}`} style={{
      position: 'fixed', zIndex: 9999, left: 16, right: 16,
      ...(position.startsWith('top')
        ? { top: 'max(16px, env(safe-area-inset-top))' }
        : { bottom: 'max(16px, env(safe-area-inset-bottom))' }),
      display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none',
      alignItems: position.endsWith('right') ? 'flex-end' : position.endsWith('left') ? 'flex-start' : 'center',
    }}>
      {toasts.filter((item) => item.visible && (item.position || 'top-right') === position).map((item) => (
        <div key={item.id} style={{ pointerEvents: 'auto', maxWidth: '100%' }}>
          {item.type === 'custom' ? resolveValue(item.message, item) : (
            <ToastBar toast={item} position={position} style={{ opacity: 1 }}>
              {({ icon, message }) => <>
                {icon}{message}
                <button type="button" aria-label={t('minhasfinancas.close')} onClick={() => toast.dismiss(item.id)} style={{
                  color: 'inherit', background: 'transparent', border: 0,
                  minWidth: 44, minHeight: 44, cursor: 'pointer', fontSize: '1.25rem', flexShrink: 0,
                }}>×</button>
              </>}
            </ToastBar>
          )}
        </div>
      ))}
    </div>
  ));
}
