import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ChevronDown,
  Check,
  X,
  MoreVertical
} from 'lucide-react';
import {
  ConnectionMethod,
  SensorReading,
  ThresholdConfig
} from '../types/biogas';
import { FloatingAnchorBox } from './InfoPopover';
import {
  exportSensorChartPng,
  exportSensorDataXlsx,
  exportSensorReportDoc,
  exportSensorDataCsv,
  exportSensorDataJson
} from '../utils/exportReports';

export type ChartRangePreset = '15_logs' | '30_logs' | '24_hours' | '7_days' | 'all';

export const RANGE_OPTIONS: {
  id: ChartRangePreset;
  shortLabel: string;
  label: string;
  sublabel: string;
}[] = [
  {
    id: '15_logs',
    shortLabel: '15 Data',
    label: '15 Data Terbaru',
    sublabel: 'Detail titik terbaru'
  },
  {
    id: '30_logs',
    shortLabel: '30 Data',
    label: '30 Data Terbaru',
    sublabel: 'Tren jangka pendek'
  },
  {
    id: '24_hours',
    shortLabel: '24 Jam',
    label: '24 Jam Terakhir',
    sublabel: 'Rentang 1 hari'
  },
  {
    id: '7_days',
    shortLabel: '7 Hari',
    label: '7 Hari (Seminggu)',
    sublabel: 'Rentang 1 minggu'
  },
  {
    id: 'all',
    shortLabel: 'Semua',
    label: 'Semua Data',
    sublabel: 'Keseluruhan riwayat'
  }
];

interface SensorHistoryChartProps {
  history: SensorReading[];
  thresholds: ThresholdConfig;
  activeMethod: ConnectionMethod;
  rangePreset: ChartRangePreset;
  onChangeRangePreset: (r: ChartRangePreset) => void;
}

export const SensorHistoryChart: React.FC<SensorHistoryChartProps> = ({
  history,
  thresholds,
  activeMethod,
  rangePreset,
  onChangeRangePreset
}) => {
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false);
  const [chartMenuOpen, setChartMenuOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const rangeBtnRef = useRef<HTMLButtonElement | null>(null);
  const chartMenuBtnRef = useRef<HTMLButtonElement | null>(null);

  // Filter data sesuai pilihan dropdown rentang dan urutkan dari kiri (lama) ke kanan (terbaru)
  const dataPoints = useMemo(() => {
    const valid = history.filter((r) => r.temperatureC !== undefined && Number.isFinite(r.temperatureC));
    if (valid.length === 0) return [];

    const now = Date.now();
    let filtered = valid;

    if (rangePreset === '15_logs') {
      filtered = valid.slice(0, 15);
    } else if (rangePreset === '30_logs') {
      filtered = valid.slice(0, 30);
    } else if (rangePreset === '24_hours') {
      const cutoff = now - 24 * 60 * 60 * 1000;
      const inWindow = valid.filter((r) => !r.epochMs || r.epochMs >= cutoff);
      filtered = inWindow.length > 0 ? inWindow : valid;
    } else if (rangePreset === '7_days') {
      const cutoff = now - 7 * 24 * 60 * 60 * 1000;
      const inWindow = valid.filter((r) => !r.epochMs || r.epochMs >= cutoff);
      filtered = inWindow.length > 0 ? inWindow : valid;
    } else {
      filtered = valid;
    }

    return [...filtered].reverse();
  }, [history, rangePreset]);

  const currentRangeOption =
    RANGE_OPTIONS.find((o) => o.id === rangePreset) || RANGE_OPTIONS[0];

  const tempValues = useMemo(
    () => dataPoints.map((d) => d.temperatureC),
    [dataPoints]
  );

  // Batas optimal Suhu
  const tempOptMin = thresholds.tempMinOptimal;
  const tempOptMax = thresholds.tempMaxOptimal;

  // Skala sumbu Y untuk Suhu
  const bounds = useMemo(() => {
    if (dataPoints.length === 0) {
      return {
        tempMin: tempOptMin - 5,
        tempMax: tempOptMax + 5
      };
    }

    const tMinRaw = Math.min(...tempValues, tempOptMin);
    const tMaxRaw = Math.max(...tempValues, tempOptMax);
    const tSpan = Math.max(4.0, tMaxRaw - tMinRaw);
    const tPad = tSpan * 0.22;

    return {
      tempMin: Math.max(0, Math.floor(tMinRaw - tPad)),
      tempMax: Math.ceil(tMaxRaw + tPad)
    };
  }, [dataPoints.length, tempValues, tempOptMin, tempOptMax]);

  // Rata-rata dari rentang aktif
  const avgTemp = useMemo(() => {
    if (tempValues.length === 0) return 0;
    return tempValues.reduce((a, b) => a + b, 0) / tempValues.length;
  }, [tempValues]);

  // Dimensi Kanvas SVG
  const width = 580;
  const height = 155;
  const padLeft = 44;
  const padRight = 16;
  const padTop = 12;
  const padBottom = 22;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const getX = (index: number) => {
    if (dataPoints.length <= 1) return padLeft + plotW / 2;
    return padLeft + (index / (dataPoints.length - 1)) * plotW;
  };

  const mapToRange = (val: number, min: number, max: number, yTop: number, yBottom: number) => {
    const range = Math.max(0.0001, max - min);
    const ratio = Math.min(1, Math.max(0, (val - min) / range));
    return yBottom - ratio * (yBottom - yTop);
  };

  const tempCoords = useMemo(() => {
    return tempValues.map((v, i) => ({
      x: getX(i),
      y: mapToRange(v, bounds.tempMin, bounds.tempMax, padTop, padTop + plotH),
      val: v
    }));
  }, [tempValues, bounds, plotH]);

  // Kurva halus Cubic Bezier
  const buildSmoothPath = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return '';
    if (pts.length === 1) {
      return `M ${padLeft} ${pts[0].y.toFixed(1)} L ${(padLeft + plotW).toFixed(1)} ${pts[0].y.toFixed(1)}`;
    }
    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const cpx1 = p0.x + (p1.x - p0.x) * 0.42;
      const cpy1 = p0.y;
      const cpx2 = p0.x + (p1.x - p0.x) * 0.58;
      const cpy2 = p1.y;
      d += ` C ${cpx1.toFixed(1)} ${cpy1.toFixed(1)}, ${cpx2.toFixed(1)} ${cpy2.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
    }
    return d;
  };

  const buildAreaPath = (pts: { x: number; y: number }[], baselineY: number) => {
    if (pts.length === 0) return '';
    const linePath = buildSmoothPath(pts);
    const base = baselineY.toFixed(1);
    if (pts.length === 1) {
      return `${linePath} L ${(padLeft + plotW).toFixed(1)} ${base} L ${padLeft.toFixed(1)} ${base} Z`;
    }
    return `${linePath} L ${pts[pts.length - 1].x.toFixed(1)} ${base} L ${pts[0].x.toFixed(1)} ${base} Z`;
  };

  // Sentuh / geser untuk memilih titik waktu
  const handlePointerMove = (
    e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>
  ) => {
    if (!svgRef.current || dataPoints.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0]?.clientX : e.clientX;
    if (clientX === undefined) return;

    const relX = ((clientX - rect.left) / rect.width) * width;
    if (dataPoints.length === 1) {
      setActiveIndex(0);
      return;
    }
    const clampedX = Math.max(padLeft, Math.min(padLeft + plotW, relX));
    const ratio = (clampedX - padLeft) / plotW;
    const idx = Math.round(ratio * (dataPoints.length - 1));
    setActiveIndex(Math.max(0, Math.min(dataPoints.length - 1, idx)));
  };

  if (dataPoints.length === 0) {
    return (
      <div className="h-[210px] flex items-center justify-center text-center text-xs text-slate-500 font-sans px-4">
        {activeMethod === 'cloud_hotspot'
          ? 'Menunggu data sensor suhu masuk dari Firebase Cloud Firestore...'
          : 'Belum ada riwayat pembacaan sensor suhu untuk ditampilkan pada grafik.'}
      </div>
    );
  }

  const inspectedIndex =
    activeIndex !== null && dataPoints[activeIndex]
      ? activeIndex
      : dataPoints.length - 1;
  const inspectedItem = dataPoints[inspectedIndex];
  const inspectedTemp = tempValues[inspectedIndex] ?? 0;

  const showAllDots = dataPoints.length <= 26;

  const optTopY = mapToRange(tempOptMax, bounds.tempMin, bounds.tempMax, padTop, padTop + plotH);
  const optBottomY = mapToRange(tempOptMin, bounds.tempMin, bounds.tempMax, padTop, padTop + plotH);
  const optBandHeight = Math.max(2, optBottomY - optTopY);

  return (
    <div className="h-[210px] flex flex-col justify-between select-none w-full">
      {/* Bar Atas: Label & Opsi */}
      <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-200/50">
        <div className="flex items-center gap-1.5">
          <img
            src="https://cdn-icons-png.flaticon.com/128/11325/11325002.png"
            alt="Suhu"
            className="w-3.5 h-3.5 object-contain opacity-85"
            draggable={false}
          />
          <span className="text-xs font-semibold text-slate-800 tracking-wide">
            Tren Suhu
          </span>
          <span className="text-slate-400 font-normal font-mono text-[11px]">(°C)</span>
        </div>

        {/* Dropdown Rentang & Tombol Titik 3 Unduh */}
        <div className="flex items-center gap-1 shrink-0">
          <div className="relative inline-flex items-center">
            <button
              ref={rangeBtnRef}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setRangeMenuOpen((prev) => !prev);
              }}
              title="Pilih rentang data grafik"
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer border ${
                rangeMenuOpen
                  ? 'bg-slate-100 text-slate-900 border-slate-300'
                  : 'bg-white text-slate-600 border-slate-200 hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              <span>{currentRangeOption.shortLabel}</span>
              <ChevronDown
                className={`w-3 h-3 text-slate-400 transition-transform duration-150 ${
                  rangeMenuOpen ? 'rotate-180 text-slate-700' : ''
                }`}
              />
            </button>

            <FloatingAnchorBox
              isOpen={rangeMenuOpen}
              onClose={() => setRangeMenuOpen(false)}
              anchorEl={rangeBtnRef.current}
              maxWidth={220}
            >
              <div className="space-y-1.5 text-xs text-slate-800">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                  <span className="text-xs font-semibold text-slate-700">
                    Rentang Grafik
                  </span>
                  <button
                    type="button"
                    onClick={() => setRangeMenuOpen(false)}
                    className="text-slate-400 hover:text-slate-700 p-0.5 transition-colors cursor-pointer rounded hover:bg-slate-100"
                    title="Tutup"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-0.5 pt-0.5">
                  {RANGE_OPTIONS.map((opt) => {
                    const isSelected = opt.id === rangePreset;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          onChangeRangePreset(opt.id);
                          setActiveIndex(null);
                          setRangeMenuOpen(false);
                        }}
                        className={`flex items-center justify-between w-full px-2 py-1.5 rounded-md text-left transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-amber-50 text-amber-900 font-semibold border border-amber-200/60'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex flex-col min-w-0 pr-1">
                          <span className="text-[11px] leading-tight truncate">
                            {opt.label}
                          </span>
                          <span className="text-[10px] text-slate-400 leading-tight truncate">
                            {opt.sublabel}
                          </span>
                        </div>
                        {isSelected && (
                          <Check className="w-3.5 h-3.5 text-amber-600 shrink-0 ml-1" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </FloatingAnchorBox>
          </div>

          {/* Tombol Titik 3 untuk Unduh Grafik */}
          <div className="relative inline-flex items-center">
            <button
              ref={chartMenuBtnRef}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setChartMenuOpen((prev) => !prev);
              }}
              title="Opsi Unduh Grafik & Data"
              aria-label="Opsi Unduh Grafik"
              className={`p-1 rounded transition-colors cursor-pointer ${
                chartMenuOpen
                  ? 'text-slate-900 bg-slate-100'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            <FloatingAnchorBox
              isOpen={chartMenuOpen}
              onClose={() => setChartMenuOpen(false)}
              anchorEl={chartMenuBtnRef.current}
              maxWidth={275}
            >
              <div className="space-y-1 text-slate-800">
                <div className="px-1.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 mb-1">
                  Format Unduh Grafik & Data
                </div>

                {/* 1. Unduh Dokumen Word (.DOC) */}
                <button
                  type="button"
                  onClick={() => {
                    setChartMenuOpen(false);
                    exportSensorReportDoc({
                      history,
                      thresholds,
                      rangePreset
                    });
                  }}
                  className="flex items-center gap-2.5 w-full p-2 text-xs text-slate-700 hover:text-slate-900 hover:bg-amber-50/80 rounded-lg transition-colors cursor-pointer text-left group"
                >
                  <img
                    src="https://cdn-icons-png.flaticon.com/128/2991/2991108.png"
                    alt="Word DOC"
                    className="w-5 h-5 object-contain shrink-0 group-hover:scale-110 transition-transform"
                    draggable={false}
                  />
                  <div className="flex flex-col min-w-0 leading-tight">
                    <span className="font-semibold text-slate-900">Dokumen Word (.doc)</span>
                    <span className="text-[9.5px] text-slate-400 truncate">
                      Laporan resmi + Grafik + Tabel
                    </span>
                  </div>
                </button>

                {/* 2. Unduh Spreadsheet Excel (.XLSX) */}
                <button
                  type="button"
                  onClick={() => {
                    setChartMenuOpen(false);
                    exportSensorDataXlsx({
                      history,
                      thresholds,
                      rangePreset
                    });
                  }}
                  className="flex items-center gap-2.5 w-full p-2 text-xs text-slate-700 hover:text-slate-900 hover:bg-amber-50/80 rounded-lg transition-colors cursor-pointer text-left group"
                >
                  <img
                    src="https://cdn-icons-png.flaticon.com/128/2504/2504768.png"
                    alt="Excel XLSX"
                    className="w-5 h-5 object-contain shrink-0 group-hover:scale-110 transition-transform"
                    draggable={false}
                  />
                  <div className="flex flex-col min-w-0 leading-tight">
                    <span className="font-semibold text-slate-900">Excel (.xlsx)</span>
                    <span className="text-[9.5px] text-slate-400 truncate">
                      Data riwayat & ringkasan statistik
                    </span>
                  </div>
                </button>

                {/* 3. Unduh Gambar Grafik (.PNG) */}
                <button
                  type="button"
                  onClick={() => {
                    setChartMenuOpen(false);
                    exportSensorChartPng({
                      history,
                      thresholds,
                      rangePreset
                    });
                  }}
                  className="flex items-center gap-2.5 w-full p-2 text-xs text-slate-700 hover:text-slate-900 hover:bg-amber-50/80 rounded-lg transition-colors cursor-pointer text-left group"
                >
                  <img
                    src="https://cdn-icons-png.flaticon.com/128/337/337948.png"
                    alt="Gambar PNG"
                    className="w-5 h-5 object-contain shrink-0 group-hover:scale-110 transition-transform"
                    draggable={false}
                  />
                  <div className="flex flex-col min-w-0 leading-tight">
                    <span className="font-semibold text-slate-900">Gambar Grafik (.png)</span>
                    <span className="text-[9.5px] text-slate-400 truncate">
                      Visualisasi grafik resolusi tinggi
                    </span>
                  </div>
                </button>

                {/* 4. Unduh Data CSV (.CSV) */}
                <button
                  type="button"
                  onClick={() => {
                    setChartMenuOpen(false);
                    exportSensorDataCsv({
                      history,
                      thresholds,
                      rangePreset
                    });
                  }}
                  className="flex items-center gap-2.5 w-full p-2 text-xs text-slate-700 hover:text-slate-900 hover:bg-amber-50/80 rounded-lg transition-colors cursor-pointer text-left group"
                >
                  <img
                    src="https://cdn-icons-png.flaticon.com/128/14422/14422338.png"
                    alt="CSV"
                    className="w-5 h-5 object-contain shrink-0 group-hover:scale-110 transition-transform"
                    draggable={false}
                  />
                  <div className="flex flex-col min-w-0 leading-tight">
                    <span className="font-semibold text-slate-900">Format Tabel (.csv)</span>
                    <span className="text-[9.5px] text-slate-400 truncate">
                      Tabel terpisah koma
                    </span>
                  </div>
                </button>

                {/* 5. Unduh Data JSON (.JSON) */}
                <button
                  type="button"
                  onClick={() => {
                    setChartMenuOpen(false);
                    exportSensorDataJson({
                      history,
                      thresholds,
                      rangePreset
                    });
                  }}
                  className="flex items-center gap-2.5 w-full p-2 text-xs text-slate-700 hover:text-slate-900 hover:bg-amber-50/80 rounded-lg transition-colors cursor-pointer text-left group"
                >
                  <img
                    src="https://cdn-icons-png.flaticon.com/128/136/136525.png"
                    alt="JSON"
                    className="w-5 h-5 object-contain shrink-0 group-hover:scale-110 transition-transform"
                    draggable={false}
                  />
                  <div className="flex flex-col min-w-0 leading-tight">
                    <span className="font-semibold text-slate-900">Data Mentah (.json)</span>
                    <span className="text-[9.5px] text-slate-400 truncate">
                      Struktur JSON telemetri IoT
                    </span>
                  </div>
                </button>
              </div>
            </FloatingAnchorBox>
          </div>
        </div>
      </div>

      {/* Kanvas SVG Grafik Light Theme */}
      <div className="relative flex-1 w-full min-h-0 pt-1">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full overflow-visible touch-pan-y cursor-crosshair"
          onMouseMove={handlePointerMove}
          onMouseLeave={() => setActiveIndex(null)}
          onTouchStart={handlePointerMove}
          onTouchMove={handlePointerMove}
          onTouchEnd={() => setActiveIndex(null)}
        >
          <defs>
            <linearGradient id="chartWarmLightGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.32" />
              <stop offset="70%" stopColor="#f59e0b" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Zona Optimal Suhu (Soft Green Tint) */}
          <rect
            x={padLeft}
            y={optTopY}
            width={plotW}
            height={optBandHeight}
            fill="rgba(16, 185, 129, 0.08)"
            rx="2"
          />
          <line
            x1={padLeft}
            y1={optTopY}
            x2={padLeft + plotW}
            y2={optTopY}
            stroke="rgba(16, 185, 129, 0.45)"
            strokeDasharray="4 3"
            strokeWidth="1.2"
          />
          <line
            x1={padLeft}
            y1={optBottomY}
            x2={padLeft + plotW}
            y2={optBottomY}
            stroke="rgba(16, 185, 129, 0.45)"
            strokeDasharray="4 3"
            strokeWidth="1.2"
          />

          {/* Garis Grid Horizontal & Label Y */}
          {[0, 0.33, 0.67, 1].map((t, i) => {
            const y = padTop + t * plotH;
            const val = bounds.tempMax - t * (bounds.tempMax - bounds.tempMin);
            return (
              <g key={i}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={padLeft + plotW}
                  y2={y}
                  stroke="rgba(148, 163, 184, 0.18)"
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 7}
                  y={y + 3.5}
                  textAnchor="end"
                  className="fill-slate-400 font-mono text-[10px] select-none"
                >
                  {val.toFixed(0)}°C
                </text>
              </g>
            );
          })}

          {/* Area Fill */}
          <path
            d={buildAreaPath(tempCoords, padTop + plotH)}
            fill="url(#chartWarmLightGrad)"
          />

          {/* Garis Kurva Utama */}
          <path
            d={buildSmoothPath(tempCoords)}
            fill="none"
            stroke="#ea580c"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Titik Data */}
          {tempCoords.map((pt, idx) => {
            const isSelected = idx === inspectedIndex;
            if (!showAllDots && !isSelected) return null;
            return (
              <circle
                key={idx}
                cx={pt.x}
                cy={pt.y}
                r={isSelected ? 4.5 : 2.5}
                fill={isSelected ? '#ffffff' : '#ea580c'}
                stroke="#ea580c"
                strokeWidth={isSelected ? 2.5 : 1}
              />
            );
          })}

          {/* Scrubber Vertikal saat Diarahkan */}
          {tempCoords[inspectedIndex] && (
            <line
              x1={tempCoords[inspectedIndex].x}
              y1={padTop}
              x2={tempCoords[inspectedIndex].x}
              y2={padTop + plotH}
              stroke="#ea580c"
              strokeDasharray="3 3"
              strokeWidth="1.2"
              opacity="0.6"
            />
          )}

          {/* Label Sumbu X (Waktu) */}
          {dataPoints.length > 0 && (
            <g className="fill-slate-400 font-mono text-[10px] select-none">
              <text x={padLeft} y={height - 4} textAnchor="start">
                {dataPoints[0].timestamp}
              </text>
              {dataPoints.length > 2 && (
                <text
                  x={padLeft + plotW / 2}
                  y={height - 4}
                  textAnchor="middle"
                >
                  {dataPoints[Math.floor(dataPoints.length / 2)].timestamp}
                </text>
              )}
              {dataPoints.length > 1 && (
                <text x={padLeft + plotW} y={height - 4} textAnchor="end">
                  {dataPoints[dataPoints.length - 1].timestamp}
                </text>
              )}
            </g>
          )}
        </svg>
      </div>

      {/* Footer Info Bawah: Bersih tanpa box kuning dan tanpa buletan kuning samping jam */}
      <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-200/50 text-xs font-mono tabular-nums text-slate-500">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-slate-400 text-[11px]">{inspectedItem.timestamp}</span>
          <span className="text-slate-300 select-none">|</span>
          <span className="font-semibold text-slate-800 text-[12px]">
            {inspectedTemp.toFixed(1)}°C
          </span>
        </div>

        <div className="shrink-0 text-slate-500 font-sans text-[11px]">
          <span className="text-slate-400">Rata-rata: </span>
          <span className="text-slate-700 font-semibold font-mono">{avgTemp.toFixed(1)}°C</span>
        </div>
      </div>
    </div>
  );
};
