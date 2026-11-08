import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Info, X, CircleDot } from 'lucide-react';
import { INFO_TOPICS } from '../data/esp32Guides';

interface FloatingCoords {
  top: number;
  left: number;
  arrowLeft: number;
  placement: 'bottom' | 'top';
  width: number;
}

interface FloatingAnchorBoxProps {
  isOpen: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
  children: React.ReactNode;
  maxWidth?: number;
}

export const FloatingAnchorBox: React.FC<FloatingAnchorBoxProps> = ({
  isOpen,
  onClose,
  anchorEl,
  children,
  maxWidth = 290
}) => {
  const [coords, setCoords] = useState<FloatingCoords | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    // Lebar box: responsif, pas di HP (maksimal maxWidth atau screenW - 24px)
    const popoverWidth = Math.min(maxWidth, screenW - 24);
    const anchorCenterX = rect.left + rect.width / 2;

    // Posisi horizontal ideal (berpusat di icon)
    let popoverLeft = anchorCenterX - popoverWidth / 2;

    // Cegah box terpotong di tepi kiri maupun kanan layar ponsel
    if (popoverLeft < 12) {
      popoverLeft = 12;
    } else if (popoverLeft + popoverWidth > screenW - 12) {
      popoverLeft = screenW - 12 - popoverWidth;
    }

    // Posisi panah lancip relatif terhadap box mengambang: mengarah tepat ke tengah tombol/icon
    let arrowLeft = anchorCenterX - popoverLeft;
    arrowLeft = Math.max(14, Math.min(popoverWidth - 14, arrowLeft));

    // Periksa apakah ruang di bawah cukup
    const spaceBelow = screenH - rect.bottom;
    const placeOnTop = spaceBelow < 220 && rect.top > 220;
    const popoverTop = placeOnTop ? rect.top - 8 : rect.bottom + 8;

    setCoords({
      top: popoverTop,
      left: popoverLeft,
      arrowLeft,
      placement: placeOnTop ? 'top' : 'bottom',
      width: popoverWidth
    });
  }, [anchorEl, maxWidth]);

  useEffect(() => {
    if (!isOpen) {
      setCoords(null);
      return;
    }

    updatePosition();

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        anchorEl &&
        !anchorEl.contains(target)
      ) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    const handleUpdate = () => {
      updatePosition();
    };

    window.addEventListener('resize', handleUpdate);
    window.addEventListener('scroll', handleUpdate, true);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('scroll', handleUpdate, true);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, anchorEl, onClose, updatePosition]);

  if (!isOpen || !coords || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-modal="false"
      className="fixed z-[9999] bg-white/95 backdrop-blur-md border border-white/90 rounded-xl shadow-xl shadow-slate-900/10 p-3 text-left animate-in fade-in zoom-in-95 duration-100 text-slate-800"
      style={{
        top: coords.top,
        left: coords.left,
        width: coords.width,
        transform: coords.placement === 'top' ? 'translateY(-100%)' : 'none'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Ujung Lancip (Arrow Pointer) yang menunjuk tepat ke tombol/ikon */}
      {coords.placement === 'bottom' ? (
        <div
          aria-hidden="true"
          className="absolute -top-1.5 w-3 h-3 bg-white/95 border-t border-l border-white/90 rotate-45 pointer-events-none"
          style={{ left: coords.arrowLeft - 6 }}
        />
      ) : (
        <div
          aria-hidden="true"
          className="absolute -bottom-1.5 w-3 h-3 bg-white/95 border-b border-r border-white/90 rotate-45 pointer-events-none"
          style={{ left: coords.arrowLeft - 6 }}
        />
      )}

      <div className="relative z-10 max-h-[75vh] overflow-y-auto">
        {children}
      </div>
    </div>,
    document.body
  );
};

interface InfoButtonProps {
  topicId: keyof typeof INFO_TOPICS;
  label?: string;
  align?: 'left' | 'right' | 'center';
}

export const InfoButton: React.FC<InfoButtonProps> = ({
  topicId,
  label
}) => {
  const [open, setOpen] = useState(false);
  const topic = INFO_TOPICS[topicId];
  const buttonRef = useRef<HTMLButtonElement>(null);

  if (!topic) return null;

  return (
    <div className="relative inline-flex items-center shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        aria-label={`Info: ${topic.title}`}
        title="Info ringkas"
        className={`inline-flex items-center gap-1 transition-colors cursor-pointer p-1 rounded-md shrink-0 ${
          open ? 'text-amber-600 bg-amber-50' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100/70'
        }`}
      >
        <Info className="w-3.5 h-3.5 shrink-0" />
        {label && (
          <span className="text-[11px] text-slate-500 hover:text-slate-800 font-normal">
            {label}
          </span>
        )}
      </button>

      <FloatingAnchorBox
        isOpen={open}
        onClose={() => setOpen(false)}
        anchorEl={buttonRef.current}
        maxWidth={290}
      >
        {/* Header Box Mengambang */}
        <div className="flex items-start justify-between gap-2 pb-2 border-b border-slate-100 relative z-10">
          <div className="min-w-0 pr-1">
            <span className="text-[10px] font-mono text-amber-600 font-semibold block truncate uppercase tracking-wider">
              {topic.subtitle}
            </span>
            <h3 className="text-xs font-bold text-slate-800 truncate mt-0.5">
              {topic.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-slate-400 hover:text-slate-700 transition-colors p-0.5 cursor-pointer shrink-0 rounded hover:bg-slate-100"
            aria-label="Tutup"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Konten Box */}
        <div className="mt-2 space-y-2 relative z-10">
          <p className="text-[11px] font-normal text-slate-600 leading-relaxed">
            {topic.summary}
          </p>

          <ul className="space-y-1.5 text-[11px] font-normal text-slate-600 leading-normal pt-0.5">
            {topic.bullets.map((bullet, idx) => (
              <li key={idx} className="flex items-start gap-1.5">
                <CircleDot className="w-2.5 h-2.5 text-amber-500 mt-1 shrink-0" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </div>
      </FloatingAnchorBox>
    </div>
  );
};
