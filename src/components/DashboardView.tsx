import React, { useState, useRef, useEffect } from 'react';
import {
  Download,
  Trash2,
  MoreVertical,
  RefreshCw,
  ImageDown
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  ConnectionMethod,
  SensorReading,
  ThresholdConfig
} from '../types/biogas';
import { InfoButton } from './InfoPopover';
import {
  SensorHistoryChart,
  ChartRangePreset
} from './SensorHistoryChart';
import { exportSensorChartPng } from '../utils/exportChartPng';

interface DashboardViewProps {
  currentReading: SensorReading;
  history: SensorReading[];
  thresholds: ThresholdConfig;
  activeMethod: ConnectionMethod;
  isConnected: boolean;
  isEspOnline?: boolean;
  isSyncing?: boolean;
  connectionStatusText: string;
  simAutoWalk: boolean;
  currentUser?: User | null;
  onToggleSimAutoWalk: () => void;
  onManualSimChange: (tempC: number) => void;
  onClearHistory: () => void;
  onNavigateToConnect: () => void;
  onRefresh?: () => void;
}

interface SmoothNumberProps {
  value: number;
  decimals: number;
  prefix?: string;
}

/**
 * Komponen transisi angka ringan berbasis DOM ref + requestAnimationFrame
 */
const SmoothNumber: React.FC<SmoothNumberProps> = ({
  value,
  decimals,
  prefix = ''
}) => {
  const spanRef = useRef<HTMLSpanElement | null>(null);
  const currentValRef = useRef<number>(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const el = spanRef.current;
    if (!el) return;

    const startVal = currentValRef.current;
    const diff = value - startVal;

    if (Math.abs(diff) < 0.005) {
      currentValRef.current = value;
      el.textContent = `${prefix}${value.toFixed(decimals)}`;
      return;
    }

    // Durasi 650ms dengan kurva quartic ease-out menghasilkan deselerasi yang sangat lembut dan nyaman dipandang
    const durationMs = 650;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      // Quartic ease-out: 1 - (1 - t)^4
      const eased = 1 - Math.pow(1 - progress, 4);
      const nextVal = startVal + diff * eased;
      currentValRef.current = nextVal;

      if (spanRef.current) {
        spanRef.current.textContent = `${prefix}${nextVal.toFixed(decimals)}`;
      }

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        currentValRef.current = value;
        if (spanRef.current) {
          spanRef.current.textContent = `${prefix}${value.toFixed(decimals)}`;
        }
      }
    };

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, decimals, prefix]);

  return <span ref={spanRef}>{`${prefix}${value.toFixed(decimals)}`}</span>;
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  currentReading,
  history,
  thresholds,
  activeMethod,
  isConnected,
  isEspOnline = false,
  isSyncing = false,
  connectionStatusText,
  simAutoWalk,
  onToggleSimAutoWalk,
  onManualSimChange,
  onClearHistory,
  onRefresh
}) => {
  const [chartRangePreset, setChartRangePreset] = useState<ChartRangePreset>('15_logs');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const temp = currentReading.temperatureC;

  const hasData =
    activeMethod === 'simulation'
      ? true
      : history.length > 0 ||
        (currentReading.id !== 'awaiting' && currentReading.temperatureC > 0);

  // Status Suhu: warna pada teks dan kotak kecil di pojok bawah
  const getTempStatus = () => {
    if (!hasData) {
      return {
        icon: <span className="w-2 h-2 rounded-[2.5px] bg-slate-400 shrink-0" />,
        label: '-',
        tone: 'text-slate-400'
      };
    }
    if (temp >= thresholds.tempCritical) {
      return {
        icon: <span className="w-2 h-2 rounded-[2.5px] bg-rose-500 shrink-0" />,
        label: 'Kritis',
        tone: 'text-rose-600'
      };
    }
    if (temp > thresholds.tempMaxOptimal) {
      return {
        icon: <span className="w-2 h-2 rounded-[2.5px] bg-amber-500 shrink-0" />,
        label: 'Tinggi',
        tone: 'text-amber-600'
      };
    }
    if (temp < thresholds.tempMinOptimal) {
      return {
        icon: <span className="w-2 h-2 rounded-[2.5px] bg-blue-500 shrink-0" />,
        label: 'Rendah',
        tone: 'text-blue-600'
      };
    }
    return {
      icon: <span className="w-2 h-2 rounded-[2.5px] bg-emerald-500 shrink-0" />,
      label: 'Optimal',
      tone: 'text-emerald-600'
    };
  };

  const tempStatus = getTempStatus();

  // Nilai Ekstrem (Min & Max) dengan Waktu Pencapaian
  const allReadings = hasData && history.length > 0 ? history : (activeMethod === 'simulation' ? [currentReading] : []);
  const validTempReadings = allReadings.filter((r) => r.temperatureC > 0);

  const minTempReading = validTempReadings.length > 0
    ? validTempReadings.reduce((min, cur) => (cur.temperatureC < min.temperatureC ? cur : min), validTempReadings[0])
    : (allReadings.length > 0 ? allReadings[0] : null);
  const maxTempReading = validTempReadings.length > 0
    ? validTempReadings.reduce((max, cur) => (cur.temperatureC > max.temperatureC ? cur : max), validTempReadings[0])
    : (allReadings.length > 0 ? allReadings[0] : null);

  const handleDownloadCsv = () => {
    const headers = ['Waktu', 'Suhu_C', 'Status', 'Sumber'];
    const rows = history.map((row) => {
      let st = 'Optimal';
      if (row.temperatureC >= thresholds.tempCritical) st = 'Kritis';
      else if (row.temperatureC > thresholds.tempMaxOptimal) st = 'Tinggi';
      else if (row.temperatureC < thresholds.tempMinOptimal) st = 'Rendah';
      return [
        row.timestamp,
        row.temperatureC.toFixed(1),
        st,
        row.source
      ];
    });
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `IoT_Suhu_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isDeviceOnline = activeMethod === 'cloud_hotspot' ? Boolean(isEspOnline) : (isConnected && hasData);
  const showSensorValues = hasData && isDeviceOnline;

  return (
    <div className="space-y-3 sm:space-y-4 w-full">
      {/* Bar Status: Satu Status Saja (Aktif / Tidak Aktif) + Refresh Ikon */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-1 text-[11px] text-slate-500">
        <div className="flex items-center gap-2 shrink-0">
          {isSyncing ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="w-2 h-2 rounded-[2.5px] bg-slate-400 animate-pulse shrink-0" />
              <span className="text-slate-600 font-medium whitespace-nowrap">
                Menyinkronkan data...
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              {/* Satu Status Tunggal: Aktif / Tidak Aktif */}
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-[2.5px] shrink-0 ${
                    isDeviceOnline ? 'bg-emerald-500' : 'bg-slate-400'
                  }`}
                />
                <span className={`font-medium whitespace-nowrap ${isDeviceOnline ? 'text-slate-800' : 'text-slate-500'}`}>
                  {isDeviceOnline ? 'Aktif' : 'Tidak Aktif'}
                </span>
              </div>

              {/* Tombol Refresh Murni Ikon */}
              <button
                type="button"
                onClick={onRefresh}
                title="Segarkan data terbaru"
                aria-label="Segarkan data"
                className="text-slate-400 hover:text-slate-800 transition-colors cursor-pointer p-0 shrink-0 inline-flex items-center justify-center active:scale-90"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-slate-800' : ''}`} />
              </button>
            </div>
          )}
        </div>

        {/* Pojok Kanan: Waktu Pembaruan */}
        {showSensorValues && currentReading && currentReading.timestamp && currentReading.timestamp !== '--:--:--' && (
          <span className="font-mono text-[10px] text-slate-400 shrink-0 ml-auto whitespace-nowrap">
            <span className="hidden sm:inline">Live: </span>
            {currentReading.timestamp} WIB
          </span>
        )}
      </div>

      {/* SATU CARD TUNGGAL: SUHU & MIN-MAX DIGABUNG MENJADI SATU */}
      <div className="w-full">
        <div className="flex flex-col gap-1.5 w-full min-w-0">
          {/* Bar Luar Card: Label & Info Icon di Luar Card */}
          <div className="flex items-center justify-between px-1 text-xs">
            <span className="text-[11px] font-normal tracking-wide text-slate-500 uppercase">
              Suhu
            </span>
            <InfoButton topicId="temperature_indicator" align="left" />
          </div>

          {/* CARD TUNGGAL GABUNGAN: GLASSMORPHISM PREMIUM & TEKS TETAP TAJAM */}
          <section className="relative bg-white/65 sm:bg-white/70 backdrop-blur-md border border-white/80 rounded-md p-3.5 sm:p-4 flex flex-col justify-between shadow-xs hover:bg-white/80 hover:border-white transition-all duration-300">
            {/* Pojok Atas: Icon Asli Flaticon */}
            <div className="flex items-center justify-between">
              <img
                src="https://cdn-icons-png.flaticon.com/128/11325/11325002.png"
                alt="Suhu"
                className="w-4 h-4 object-contain opacity-85 hover:opacity-100 transition-opacity duration-300"
                draggable={false}
              />
            </div>

            {/* Tengah: Angka + Satuan */}
            <div className="my-2 sm:my-3.5 flex items-baseline justify-center text-center">
              <span className={`text-4xl sm:text-5xl md:text-6xl font-mono font-semibold tracking-tight tabular-nums drop-shadow-2xs ${
                showSensorValues ? 'text-slate-900' : 'text-slate-400'
              }`}>
                {showSensorValues ? (
                  <SmoothNumber value={temp} decimals={1} />
                ) : (
                  '--.-'
                )}
              </span>
              <span className="text-xs sm:text-sm font-mono text-slate-500 font-medium ml-1.5">
                °C
              </span>
            </div>

            {/* Status Kondisi di kiri & Rentang Optimal di kanan */}
            <div className="flex items-center justify-between text-[11px] w-full pt-1 pb-2">
              <span className={`flex items-center gap-1.5 font-semibold ${showSensorValues ? tempStatus.tone : 'text-slate-500'}`}>
                {showSensorValues ? (
                  tempStatus.icon
                ) : (
                  <span className="w-2 h-2 rounded-[2.5px] bg-slate-400 shrink-0 inline-block" />
                )}
                <span>{showSensorValues ? tempStatus.label : 'Terputus'}</span>
              </span>
              <span className="text-slate-500 font-mono text-[10px] font-medium">
                {thresholds.tempMinOptimal}–{thresholds.tempMaxOptimal}°C
              </span>
            </div>

            {/* Bagian Bawah: Min & Max DIGABUNG DI DALAM CARD INI */}
            <div className="pt-2.5 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-700 font-mono">
              {/* Row Min */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-sans text-[10px] font-semibold">Min:</span>
                <span className="font-bold text-slate-900">
                  {minTempReading && hasData ? `${minTempReading.temperatureC.toFixed(1)}°C` : '-'}
                </span>
                <span className="text-slate-500 text-[10px]">
                  {minTempReading && hasData ? `(${minTempReading.timestamp})` : ''}
                </span>
              </div>

              <span className="text-slate-300 select-none">|</span>

              {/* Row Max */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-sans text-[10px] font-semibold">Max:</span>
                <span className="font-bold text-slate-900">
                  {maxTempReading && hasData ? `${maxTempReading.temperatureC.toFixed(1)}°C` : '-'}
                </span>
                <span className="text-slate-500 text-[10px]">
                  {maxTempReading && hasData ? `(${maxTempReading.timestamp})` : ''}
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* CARD GRAFIK TREN SUHU: GLASSMORPHISM */}
      <section className="bg-white/65 sm:bg-white/70 backdrop-blur-md border border-white/80 rounded-md p-3 sm:p-4 w-full shadow-xs hover:bg-white/80 hover:border-white transition-all duration-300">
        <SensorHistoryChart
          history={history}
          thresholds={thresholds}
          activeMethod={activeMethod}
          rangePreset={chartRangePreset}
          onChangeRangePreset={setChartRangePreset}
        />
      </section>

      {/* CARD PERSEGI PANJANG: KHUSUS RIWAYAT PEMBACAAN SENSOR (GLASSMORPHISM) */}
      <section className="relative bg-white/65 sm:bg-white/70 backdrop-blur-md border border-white/80 rounded-md p-3 sm:p-4 space-y-3 w-full shadow-xs hover:bg-white/80 hover:border-white transition-all duration-300">
        {/* Header Bar Riwayat */}
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200/60 text-xs">
          {/* Pojok Kiri: Judul Riwayat & Jumlah Log */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-semibold text-slate-900 tracking-wide">
              Riwayat
            </span>
            <span className="text-slate-300 select-none font-light">|</span>
            <span className="text-[11px] font-mono text-slate-500">
              {Math.min(59, history.length)} log
            </span>
          </div>

          {/* Pojok Kanan: Tombol Titik 3 Opsi Riwayat */}
          <div className="relative inline-flex items-center shrink-0" ref={menuContainerRef}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((prev) => !prev);
              }}
              aria-label="Opsi Riwayat"
              title="Opsi Riwayat (Unduh / Hapus)"
              className={`p-1 rounded transition-colors cursor-pointer ${
                menuOpen
                  ? 'text-slate-900 bg-white/90 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-white/70'
              }`}
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {/* Box Menu Kecil dengan Ujung Lancip yang tepat di bawah Titik 3 */}
            {menuOpen && (
              <div
                className="absolute right-0 top-full mt-1.5 z-50 w-44 bg-white border border-slate-200 rounded-md shadow-xl p-1 text-left animate-in fade-in zoom-in-95 duration-100"
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  aria-hidden="true"
                  className="absolute -top-1.5 right-2 w-3 h-3 bg-white border-t border-l border-slate-200 rotate-45 pointer-events-none"
                />

                <div className="flex flex-col space-y-0.5 relative z-10">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      exportSensorChartPng({
                        history,
                        thresholds,
                        rangePreset: chartRangePreset
                      });
                    }}
                    className="flex items-center gap-2 w-full px-2.5 py-1.5 text-xs text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors cursor-pointer text-left"
                  >
                    <ImageDown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <div className="flex flex-col min-w-0 leading-tight">
                      <span>Unduh Grafik (PNG)</span>
                      <span className="text-[9.5px] text-slate-400 truncate">
                        Grafik Suhu
                      </span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      handleDownloadCsv();
                    }}
                    className="flex items-center gap-2 w-full px-2.5 py-1.5 text-xs text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors cursor-pointer text-left"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>Unduh Data (CSV)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onClearHistory();
                    }}
                    className="flex items-center gap-2 w-full px-2.5 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer text-left"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    <span>Hapus Riwayat</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tabel Riwayat Suhu */}
        <div className="overflow-x-auto w-full h-[275px] overflow-y-auto overscroll-contain touch-pan-y">
          <table className="w-full border-collapse text-xs font-mono tabular-nums">
            <thead className="sticky top-0 z-10 bg-white/85 backdrop-blur-xs border-b border-slate-200/60">
              <tr className="text-slate-600 font-sans text-[11px]">
                <th className="py-2 px-3 text-left font-normal">
                  <span className="block text-slate-800 font-medium">Waktu</span>
                  <span className="block text-[10px] text-slate-400 font-mono">WIB</span>
                </th>
                <th className="py-2 px-3 text-center font-normal">
                  <span className="block text-slate-800 font-medium">Suhu</span>
                  <span className="block text-[10px] text-slate-400 font-mono">(°C)</span>
                </th>
                <th className="py-2 px-3 text-right font-normal">
                  <span className="block text-slate-800 font-medium">Status</span>
                  <span className="block text-[10px] text-slate-400 font-mono">Kondisi</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[11px]">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={3} className="h-[210px] text-center text-slate-400 font-sans align-middle">
                    {activeMethod === 'cloud_hotspot'
                      ? 'Menunggu data sensor suhu masuk dari Firebase Cloud Firestore...'
                      : 'Belum ada riwayat pembacaan sensor suhu.'}
                  </td>
                </tr>
              ) : (
                history.map((item, idx) => {
                  const isCrit = item.temperatureC >= thresholds.tempCritical;
                  const isHigh = item.temperatureC > thresholds.tempMaxOptimal;
                  const isLow = item.temperatureC < thresholds.tempMinOptimal;

                  const statusText = isCrit
                    ? 'Kritis'
                    : isHigh
                    ? 'Tinggi'
                    : isLow
                    ? 'Rendah'
                    : 'Optimal';

                  const statusClass = isCrit
                    ? 'text-rose-600 font-medium'
                    : isHigh || isLow
                    ? 'text-amber-600 font-medium'
                    : 'text-emerald-600 font-medium';

                  return (
                    <tr key={item.id || idx} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2 px-3 text-left font-mono text-slate-600">
                        {item.timestamp}
                      </td>
                      <td className="py-2 px-3 text-center font-mono font-medium text-slate-900 text-xs">
                        {item.temperatureC.toFixed(1)}°C
                      </td>
                      <td className={`py-2 px-3 text-right font-sans ${statusClass}`}>
                        {statusText}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
