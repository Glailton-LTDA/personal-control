import React, { useState, useEffect } from 'react';
import './PullToRefresh.css';

function PullToRefresh() {
  const [pullProgress, setPullProgress] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);

  useEffect(() => {
    // Detecta modo standalone (Safari standalone PWA ou display-mode standalone)
    const isStandalone = 
      window.navigator.standalone || 
      window.matchMedia('(display-mode: standalone)').matches;

    if (!isStandalone) return;

    let startY = 0;
    let currentY = 0;
    let pulling = false;
    const threshold = 70; // pixels para acionar o reload
    const maxPull = 120;  // pixels máximos de resistência visual

    const handleTouchStart = (e) => {
      // Somente inicia se estiver exatamente no topo da página
      if (window.scrollY === 0) {
        startY = e.touches[0].clientY;
        pulling = true;
      }
    };

    const handleTouchMove = (e) => {
      if (!pulling) return;
      currentY = e.touches[0].clientY;
      const diff = currentY - startY;

      // Puxando para baixo no topo
      if (diff > 0 && window.scrollY === 0) {
        const progress = Math.min(diff, maxPull);
        const percent = Math.min((progress / threshold) * 100, 100);
        
        setPullProgress(percent);
        setIsPulling(true);

        // Previne comportamentos de bounce nativos indesejados no iOS
        if (e.cancelable) {
          e.preventDefault();
        }
      } else {
        pulling = false;
        setIsPulling(false);
        setPullProgress(0);
      }
    };

    const handleTouchEnd = () => {
      if (!pulling) return;
      pulling = false;
      setIsPulling(false);

      const diff = currentY - startY;
      if (diff >= threshold && window.scrollY === 0) {
        setIsRefreshing(true);
        // Delay para o usuário ver a animação de atualização antes do reload
        setTimeout(() => {
          window.location.reload();
        }, 800);
      } else {
        setPullProgress(0);
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  if (!isPulling && !isRefreshing) return null;

  const translateY = isRefreshing ? 30 : Math.min((pullProgress / 100) * 50, 50);
  const opacity = isRefreshing ? 1 : Math.min(pullProgress / 100, 1);
  const rotation = (pullProgress / 100) * 360;

  return (
    <div 
      className="pull-to-refresh-container"
      style={{
        transform: `translate3d(0, ${translateY}px, 0)`,
        opacity: opacity,
        transition: isPulling ? 'none' : 'transform 0.3s ease, opacity 0.3s ease'
      }}
    >
      <div className={`pull-to-refresh-spinner ${isRefreshing ? 'refreshing' : ''}`}>
        <svg 
          viewBox="0 0 24 24" 
          width="24" 
          height="24"
          style={{
            transform: isRefreshing ? 'none' : `rotate(${rotation}deg)`
          }}
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke="var(--glass-border)"
            strokeWidth="3"
          />
          <path
            d="M 12 3 A 9 9 0 0 1 21 12"
            fill="none"
            stroke="var(--primary)"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}

export default PullToRefresh;
