import React, { useEffect, useState } from 'react';
import { Thermometer } from 'lucide-react';

interface SplashScreenProps {
  onComplete?: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const [shouldShow] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;

    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
      window.location.search.includes('pwa=1');

    const isMobile =
      /android|iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (window.innerWidth <= 768 && 'ontouchstart' in window);

    return isStandalone && isMobile;
  });

  const [stage, setStage] = useState<'visible' | 'exiting' | 'done'>('visible');

  useEffect(() => {
    if (!shouldShow) return;

    const restoreStyles = () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
      document.body.style.overscrollBehavior = '';
      document.documentElement.style.overflow = '';
      document.documentElement.style.overscrollBehavior = '';
    };

    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.body.style.overscrollBehavior = 'none';
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.overscrollBehavior = 'none';

    const exitTimer = setTimeout(() => {
      setStage('exiting');
      restoreStyles();
    }, 1400);

    const doneTimer = setTimeout(() => {
      setStage('done');
      restoreStyles();
      if (onComplete) onComplete();
    }, 1900);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
      restoreStyles();
    };
  }, [shouldShow, onComplete]);

  if (!shouldShow || stage === 'done') return null;

  const isExiting = stage === 'exiting';

  return (
    <div
      className={`fixed inset-0 z-[999999] flex flex-col items-center justify-center bg-slate-50 select-none pointer-events-auto touch-none overscroll-none transition-opacity duration-500 ease-out overflow-hidden ${
        isExiting ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      style={{ backgroundColor: '#f8fafc', touchAction: 'none', overscrollBehavior: 'none' }}
      onClick={(e) => e.stopPropagation()}
      onTouchMove={(e) => {
        if (e.cancelable) e.preventDefault();
      }}
      onContextMenu={(e) => e.preventDefault()}
      aria-hidden="true"
    >
      <div className="relative z-10 flex flex-col items-center justify-center text-center px-6">
        <div className="w-20 h-20 rounded-3xl bg-white flex items-center justify-center p-2.5 shadow-lg shadow-amber-500/20 mb-4 border border-slate-100 animate-in zoom-in-90 duration-300">
          <img src="/logo.png" alt="PAVORA" className="w-full h-full object-contain" />
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-slate-900 font-sans">
          PAVORA
        </h1>
        <p className="text-xs font-mono text-slate-500 mt-1">
          Monitoring Suhu Inframerah (GY-906)
        </p>

        <div className="mt-6 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
          <span className="text-[11px] font-mono text-slate-400">Memuat sensor...</span>
        </div>
      </div>
    </div>
  );
};
