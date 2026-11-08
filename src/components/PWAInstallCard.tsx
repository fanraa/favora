import React, { useState, useRef } from 'react';
import { Check, Info, X, Download, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { FloatingAnchorBox } from './InfoPopover';

export const PWAInstallCard: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [showInfoPopover, setShowInfoPopover] = useState(false);
  const [installFeedback, setInstallFeedback] = useState<string | null>(null);
  const infoBtnRef = useRef<HTMLButtonElement | null>(null);

  const handleInstallClick = async () => {
    setInstallFeedback(null);
    const result = await install();

    if (result === 'accepted') {
      setInstallFeedback('Aplikasi berhasil dipasang ke Layar Utama!');
      setTimeout(() => setInstallFeedback(null), 3500);
      return;
    }

    if (result === 'dismissed') {
      return;
    }

    setShowGuide(true);
  };

  return (
    <div className="bg-white/65 sm:bg-white/70 backdrop-blur-md border border-white/80 rounded-2xl p-4 sm:p-5 shadow-xs hover:bg-white/75 transition-all duration-300 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200/80 shrink-0 flex items-center justify-center text-amber-600">
            <Smartphone className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                Pasang Aplikasi ke Layar Utama
              </h3>
              <button
                ref={infoBtnRef}
                type="button"
                onClick={() => setShowInfoPopover((prev) => !prev)}
                title="Informasi Pemasangan Aplikasi"
                className={`transition-colors cursor-pointer p-0.5 shrink-0 rounded ${
                  showInfoPopover ? 'text-slate-900' : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                <Info className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[11px] text-slate-500 truncate mt-0.5">
              Akses cepat layar penuh tanpa bilah pencarian browser di HP
            </p>
          </div>
        </div>

        {/* Floating Anchor Box Info Popover */}
        <FloatingAnchorBox
          isOpen={showInfoPopover}
          onClose={() => setShowInfoPopover(false)}
          anchorEl={infoBtnRef.current}
          maxWidth={280}
        >
          <div className="space-y-2 text-xs text-slate-800">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 font-bold">
              <span>Pasang ke Layar Utama</span>
              <button
                type="button"
                onClick={() => setShowInfoPopover(false)}
                className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer rounded hover:bg-slate-100"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-1.5 text-[11px] text-slate-600 leading-relaxed">
              <p>
                Buka aplikasi layar penuh tanpa bilah browser di HP Android &amp; iPhone.
              </p>
              <p>
                <strong className="text-slate-800">Android:</strong> Klik tombol <em>Pasang</em> lalu pilih <strong>Instal</strong>.
              </p>
              <p>
                <strong className="text-slate-800">iPhone:</strong> Tekan tombol <strong>Share</strong> di Safari &gt; <strong>Tambah ke Layar Utama</strong>.
              </p>
            </div>
          </div>
        </FloatingAnchorBox>

        <div className="shrink-0">
          {isInstalled ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg">
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span>Terpasang</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={handleInstallClick}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors cursor-pointer active:scale-95 shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Pasang</span>
            </button>
          )}
        </div>
      </div>

      {installFeedback && (
        <div className="text-[11px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
          {installFeedback}
        </div>
      )}

      {/* Dialog Panduan Manual (iOS Safari dll) */}
      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white border border-slate-200 p-5 shadow-2xl text-slate-800 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Pasang Aplikasi</h4>
                <p className="text-[11px] text-slate-500">Monitoring Sensor Suhu IoT</p>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="p-1 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer rounded hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <div className="space-y-2.5 text-xs leading-relaxed text-slate-600">
                <p className="text-[11px] text-slate-500">
                  Untuk memasang di iPhone / iPad (Safari):
                </p>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 text-[11px]">
                  <div className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-cyan-100 text-cyan-800 flex items-center justify-center font-bold shrink-0 text-[10px]">1</span>
                    <span>Tekan tombol <strong>Bagikan (Share)</strong> di bilah navigasi bawah Safari.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-cyan-100 text-cyan-800 flex items-center justify-center font-bold shrink-0 text-[10px]">2</span>
                    <span>Pilih menu <strong>&quot;Tambah ke Layar Utama&quot;</strong> (Add to Home Screen).</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-cyan-100 text-cyan-800 flex items-center justify-center font-bold shrink-0 text-[10px]">3</span>
                    <span>Tekan <strong>Tambah</strong> di pojok kanan atas.</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs leading-relaxed text-slate-600">
                <p className="text-[11px] text-slate-500">
                  Pasang langsung ke layar HP Anda agar dapat dibuka layar penuh tanpa bilah browser.
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    const res = await install();
                    if (res === 'accepted') {
                      setShowGuide(false);
                      setInstallFeedback('Aplikasi berhasil dipasang!');
                    }
                  }}
                  className="w-full py-2.5 text-xs font-semibold rounded-xl bg-cyan-600 text-white hover:bg-cyan-700 transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs"
                >
                  <Download className="w-4 h-4" />
                  <span>Pasang Sekarang ke HP</span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full py-2 text-xs font-semibold rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
