import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ChevronDown,
  Check,
  X,
  MoreVertical,
  Loader2,
  ArrowLeft,
  Calendar,
  Clock,
  Database,
  Info
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
  exportSensorDataJson,
  ExportScopeMode
} from '../utils/exportReports';
import {
  fetchAllSensorReadings
} from '../services/sensorFirestoreService';

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

/**
 * Downsampling cerdas untuk grafik: Membagi data ke dalam bucket waktu
 * sambil MEMASTIKAN titik suhu puncak tertinggi (max peak) dan terendah (min)
 * di setiap bucket tetap dipertahankan, sehingga lonjakan uji 60°C - 70°C tidak hilang.
 */
function downsampleReadingsWithPeaks(items: SensorReading[], targetBuckets = 55): SensorReading[] {
  if (items.length <= targetBuckets * 1.5) {
    return items;
  }

  const bucketSize = Math.ceil(items.length / targetBuckets);
  const result: SensorReading[] = [];

  for (let i = 0; i < items.length; i += bucketSize) {
    const chunk = items.slice(i, i + bucketSize);
    if (chunk.length === 0) continue;

    let minItem = chunk[0];
    let maxItem = chunk[0];

    for (let j = 1; j < chunk.length; j++) {
      const it = chunk[j];
      if (it.temperatureC < minItem.temperatureC) minItem = it;
      if (it.temperatureC > maxItem.temperatureC) maxItem = it;
    }

    if (minItem.id === maxItem.id) {
      result.push(minItem);
    } else {
      const tMin = minItem.epochMs ?? 0;
      const tMax = maxItem.epochMs ?? 0;
      if (tMin <= tMax) {
        result.push(minItem, maxItem);
      } else {
        result.push(maxItem, minItem);
      }
    }
  }

  return result;
}

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
  const [selectedFormat, setSelectedFormat] = useState<'doc' | 'xlsx' | 'png' | 'csv' | 'json' | null>(null);
  const [showScopeInfo, setShowScopeInfo] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);

  // State data riwayat Firestore untuk rentang 24 Jam, 7 Hari, dan Semua
  const [historicalData, setHistoricalData] = useState<SensorReading[] | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const cacheRef = useRef<{ [preset: string]: SensorReading[] }>({});

  const svgRef = useRef<SVGSVGElement | null>(null);
  const rangeBtnRef = useRef<HTMLButtonElement | null>(null);
  const chartMenuBtnRef = useRef<HTMLButtonElement | null>(null);

  // Ambil data riwayat sesungguhnya dari Firestore ketika memilih 24 Jam, 7 Hari, atau Semua
  useEffect(() => {
    if (activeMethod !== 'cloud_hotspot') {
      setHistoricalData(null);
      return;
    }

    if (rangePreset === '15_logs' || rangePreset === '30_logs') {
      setHistoricalData(null);
      return;
    }

    if (cacheRef.current[rangePreset] && cacheRef.current[rangePreset].length > 0) {
      setHistoricalData(cacheRef.current[rangePreset]);
      return;
    }

    let isMounted = true;
    const fetchHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const timeScope = rangePreset === '24_hours' ? 'today' : 'all';
        const docs = await fetchAllSensorReadings({
          timeScope,
          maxLimit: 3000
        });

        if (!isMounted) return;

        if (docs && docs.length > 0) {
          // Urutkan secara kronologis (dari waktu lama di kiri ke terbaru di kanan)
          const sortedAsc = [...docs].sort((a, b) => (a.epochMs ?? 0) - (b.epochMs ?? 0));
          const sampled = downsampleReadingsWithPeaks(sortedAsc, 55);
          cacheRef.current[rangePreset] = sampled;
          setHistoricalData(sampled);
        } else {
          setHistoricalData(null);
        }
      } catch (err) {
        console.warn('Gagal memuat riwayat grafik dari Firestore:', err);
        if (isMounted) setHistoricalData(null);
      } finally {
        if (isMounted) setIsLoadingHistory(false);
      }
    };

    fetchHistory();

    return () => {
      isMounted = false;
    };
  }, [rangePreset, activeMethod]);

  const handleExecuteExport = async (
    format: 'doc' | 'xlsx' | 'png' | 'csv' | 'json',
    scope: ExportScopeMode
  ) => {
    setIsExporting(true);
    setExportSuccessMsg(null);
    try {
      let dataset = history;
      if (scope === 'today_hourly' || scope === 'all_daily') {
        try {
          const fetched = await fetchAllSensorReadings({
            timeScope: scope === 'today_hourly' ? 'today_hourly' : 'all_daily',
            maxLimit: 3000
          });
          if (fetched && fetched.length > 0) {
            dataset = fetched;
          } else if (scope === 'today_hourly') {
            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);
            const localFiltered = history.filter(
              (r) => (r.epochMs ?? 0) >= startOfToday.getTime()
            );
            if (localFiltered.length > 0) {
              dataset = localFiltered;
            }
          }
        } catch (err) {
          console.warn('Gagal mengambil data dari Firestore, memakai data lokal:', err);
        }
      }

      if (dataset.length === 0) {
        setExportSuccessMsg('Data kosong');
        setTimeout(() => setExportSuccessMsg(null), 2500);
        setIsExporting(false);
        return;
      }

      const options = {
        history: dataset,
        thresholds,
        scopeMode: scope,
        rangePreset: 'all' as ChartRangePreset
      };

      if (format === 'doc') exportSensorReportDoc(options);
      else if (format === 'xlsx') exportSensorDataXlsx(options);
      else if (format === 'png') exportSensorChartPng(options);
      else if (format === 'csv') exportSensorDataCsv(options);
      else if (format === 'json') exportSensorDataJson(options);

      const countMsg =
        scope === 'today_hourly'
          ? '24 Jam'
          : scope === 'all_daily'
          ? 'Rekap Harian'
          : `${Math.min(60, dataset.length)} Log`;

      setExportSuccessMsg(`Berhasil (${countMsg})`);
      setTimeout(() => {
        setExportSuccessMsg(null);
        setChartMenuOpen(false);
        setSelectedFormat(null);
      }, 1300);
    } catch (err) {
      console.error('Chart export error:', err);
      setExportSuccessMsg('Gagal ekspor');
      setTimeout(() => setExportSuccessMsg(null), 2500);
    } finally {
      setIsExporting(false);
    }
  };

  // Filter data sesuai pilihan dropdown rentang dan urutkan dari kiri (lama) ke kanan (terbaru)
  const dataPoints = useMemo(() => {
    // 1. Jika rentang 24 Jam, 7 Hari, atau Semua dan riwayat Firestore tersedia
    if (
      (rangePreset === '24_hours' || rangePreset === '7_days' || rangePreset === 'all') &&
      historicalData &&
      historicalData.length > 0
    ) {
      return historicalData;
    }

    // 2. Jika rentang 15 Data atau 30 Data (atau fallback realtime 60 log)
    const valid = history.filter(
      (r) => r.temperatureC !== undefined && Number.isFinite(r.temperatureC)
    );
    if (valid.length === 0) return [];

    let filtered = valid;
    if (rangePreset === '15_logs') {
      filtered = valid.slice(0, 15);
    } else if (rangePreset === '30_logs') {
      filtered = valid.slice(0, 30);
    } else {
      filtered = valid;
    }

    return [...filtered].reverse();
  }, [history, rangePreset, historicalData]);

  const currentRangeOption =
    RANGE_OPTIONS.find((o) => o.id === rangePreset) || RANGE_OPTIONS[0];

  const tempValues = useMemo(
    () => dataPoints.map((d) => d.temperatureC),
    [dataPoints]
  );

  // Batas optimal Suhu
  const tempOptMin = thresholds.tempMinOptimal;
  const tempOptMax = thresholds.tempMaxOptimal;

  // Skala sumbu Y dinamis berpatokan pada data nyata yang sedang aktif dipilih
  const bounds = useMemo(() => {
    if (dataPoints.length === 0 || tempValues.length === 0) {
      return {
        tempMin: 20,
        tempMax: 40
      };
    }

    const tMinData = Math.min(...tempValues);
    const tMaxData = Math.max(...tempValues);

    // Rentang dinamis berpatokan pada data nyata
    const rawSpan = tMaxData - tMinData;
    // Berikan rentang minimal 3.0°C agar variasi suhu kecil tetap nyaman dan jelas
    const span = Math.max(3.0, rawSpan);
    const pad = Math.max(0.8, span * 0.16);

    const minV = Math.max(0, tMinData - pad);
    const maxV = tMaxData + pad;

    return {
      tempMin: Number(minV.toFixed(1)),
      tempMax: Number(maxV.toFixed(1))
    };
  }, [dataPoints.length, tempValues]);

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
        <div className="flex items-center gap-1.5 shrink-0">
          {isLoadingHistory && (
            <div className="flex items-center gap-1 text-[10.5px] text-amber-600 font-medium px-1">
              <Loader2 className="w-3 h-3 animate-spin shrink-0" />
              <span className="hidden sm:inline">Memuat...</span>
            </div>
          )}

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
              onClose={() => {
                if (!isExporting) {
                  setChartMenuOpen(false);
                  setSelectedFormat(null);
                }
              }}
              anchorEl={chartMenuBtnRef.current}
              maxWidth={300}
            >
              {selectedFormat === null ? (
                /* LANGKAH 1: PILIH FORMAT BERKAS */
                <div className="space-y-1 text-slate-800">
                  <div className="px-1.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 mb-1 flex items-center justify-between">
                    <span>Format Unduh Grafik & Data</span>
                    <span className="text-[9px] font-normal text-slate-400">Langkah 1/2</span>
                  </div>

                  {/* 1. Unduh Dokumen Word (.DOC) */}
                  <button
                    type="button"
                    onClick={() => setSelectedFormat('doc')}
                    className="flex items-center gap-2.5 w-full p-2 text-xs text-slate-700 hover:text-slate-900 hover:bg-amber-50/80 rounded-md transition-colors cursor-pointer text-left group"
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
                    onClick={() => setSelectedFormat('xlsx')}
                    className="flex items-center gap-2.5 w-full p-2 text-xs text-slate-700 hover:text-slate-900 hover:bg-amber-50/80 rounded-md transition-colors cursor-pointer text-left group"
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
                    onClick={() => setSelectedFormat('png')}
                    className="flex items-center gap-2.5 w-full p-2 text-xs text-slate-700 hover:text-slate-900 hover:bg-amber-50/80 rounded-md transition-colors cursor-pointer text-left group"
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
                    onClick={() => setSelectedFormat('csv')}
                    className="flex items-center gap-2.5 w-full p-2 text-xs text-slate-700 hover:text-slate-900 hover:bg-amber-50/80 rounded-md transition-colors cursor-pointer text-left group"
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
                    onClick={() => setSelectedFormat('json')}
                    className="flex items-center gap-2.5 w-full p-2 text-xs text-slate-700 hover:text-slate-900 hover:bg-amber-50/80 rounded-md transition-colors cursor-pointer text-left group"
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
              ) : (
                /* LANGKAH 2: PILIH JANGKAUAN DATA */
                <div className="space-y-2 text-slate-800">
                  {/* Header dengan Tombol Kembali */}
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                    <button
                      type="button"
                      disabled={isExporting}
                      onClick={() => {
                        setSelectedFormat(null);
                        setShowScopeInfo(false);
                      }}
                      className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 cursor-pointer p-0.5 rounded hover:bg-slate-100 transition-colors disabled:opacity-50"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Kembali</span>
                    </button>
                    <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">
                      {selectedFormat === 'doc' && 'Word (.doc)'}
                      {selectedFormat === 'xlsx' && 'Excel (.xlsx)'}
                      {selectedFormat === 'png' && 'Grafik (.png)'}
                      {selectedFormat === 'csv' && 'Tabel (.csv)'}
                      {selectedFormat === 'json' && 'Data (.json)'}
                    </span>
                  </div>

                  {/* Judul & Tombol Info Ringkas */}
                  <div className="flex items-center justify-between px-1 pt-0.5">
                    <span className="text-[11px] font-bold text-slate-800">Pilih Jangkauan Data:</span>
                    <button
                      type="button"
                      onClick={() => setShowScopeInfo((prev) => !prev)}
                      title="Penjelasan jangkauan data"
                      aria-label="Info jangkauan data"
                      className={`p-1 rounded transition-colors cursor-pointer ${
                        showScopeInfo ? 'text-amber-600 bg-amber-50' : 'text-slate-400 hover:text-slate-700'
                      }`}
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Penjelasan Detail (Hanya muncul jika ikon info diklik) */}
                  {showScopeInfo && (
                    <div className="p-2 bg-slate-50 border border-slate-200/80 rounded-md text-[10.5px] text-slate-600 space-y-1.5 leading-relaxed">
                      <div>
                        <strong className="text-slate-800">• 60 Log Terkini:</strong> Data mentah sesi aktif dasbor (cepat & 0 kuota).
                      </div>
                      <div>
                        <strong className="text-slate-800">• Hari Ini (24 Jam):</strong> Rangkuman per jam hari ini dengan rata-rata, suhu min & max.
                      </div>
                      <div>
                        <strong className="text-slate-800">• Semua Riwayat:</strong> Rekapitulasi per tanggal dari awal (sangat hemat kuota).
                      </div>
                    </div>
                  )}

                  {/* Status Indicator */}
                  {isExporting && (
                    <div className="p-2 bg-amber-50 rounded-md border border-amber-200/60 flex items-center gap-2 text-xs text-amber-700 animate-pulse">
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-amber-600" />
                      <span className="font-medium text-[11px]">Mengambil & mengolah data...</span>
                    </div>
                  )}

                  {exportSuccessMsg && (
                    <div className="p-2 bg-emerald-50 rounded-md border border-emerald-200/60 flex items-center gap-2 text-xs text-emerald-700">
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="font-semibold text-[11px]">{exportSuccessMsg}</span>
                    </div>
                  )}

                  {/* 3 Pilihan Jangkauan (Simple, Clean, Elegan) */}
                  <div className="space-y-1.5 pt-0.5">
                    {/* Pilihan 1: 60 Terkini */}
                    <button
                      type="button"
                      disabled={isExporting}
                      onClick={() => handleExecuteExport(selectedFormat, 'session_60')}
                      className="flex items-center justify-between w-full p-2.5 rounded-md border border-slate-200/80 hover:border-amber-400 hover:bg-amber-50/60 transition-all text-left cursor-pointer group disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-slate-400 group-hover:text-amber-600 shrink-0" />
                        <span className="text-xs font-semibold text-slate-800 group-hover:text-amber-900">
                          60 Log Terkini
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 group-hover:text-amber-700 font-medium">
                        Sesi Aktif
                      </span>
                    </button>

                    {/* Pilihan 2: Hari Ini (Per Jam) */}
                    <button
                      type="button"
                      disabled={isExporting}
                      onClick={() => handleExecuteExport(selectedFormat, 'today_hourly')}
                      className="flex items-center justify-between w-full p-2.5 rounded-md border border-slate-200/80 hover:border-amber-400 hover:bg-amber-50/60 transition-all text-left cursor-pointer group disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-400 group-hover:text-amber-600 shrink-0" />
                        <span className="text-xs font-semibold text-slate-800 group-hover:text-amber-900">
                          Hari Ini (24 Jam)
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 group-hover:text-amber-700 font-medium">
                        Per Jam • 24 Log
                      </span>
                    </button>

                    {/* Pilihan 3: Semua Riwayat */}
                    <button
                      type="button"
                      disabled={isExporting}
                      onClick={() => handleExecuteExport(selectedFormat, 'all_daily')}
                      className="flex items-center justify-between w-full p-2.5 rounded-md border border-slate-200/80 hover:border-amber-400 hover:bg-amber-50/60 transition-all text-left cursor-pointer group disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-slate-400 group-hover:text-amber-600 shrink-0" />
                        <span className="text-xs font-semibold text-slate-800 group-hover:text-amber-900">
                          Semua Riwayat
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 group-hover:text-amber-700 font-medium">
                        Rekap Harian
                      </span>
                    </button>
                  </div>
                </div>
              )}
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

          {/* Zona Optimal Suhu (Soft Green Tint jika berada dalam jangkauan tampak) */}
          {tempOptMin <= bounds.tempMax && tempOptMax >= bounds.tempMin && (
            <rect
              x={padLeft}
              y={Math.max(padTop, optTopY)}
              width={plotW}
              height={Math.max(0, Math.min(padTop + plotH, optBottomY) - Math.max(padTop, optTopY))}
              fill="rgba(16, 185, 129, 0.06)"
              rx="2"
            />
          )}
          {tempOptMax >= bounds.tempMin && tempOptMax <= bounds.tempMax && (
            <line
              x1={padLeft}
              y1={optTopY}
              x2={padLeft + plotW}
              y2={optTopY}
              stroke="rgba(16, 185, 129, 0.45)"
              strokeDasharray="4 3"
              strokeWidth="1.2"
            />
          )}
          {tempOptMin >= bounds.tempMin && tempOptMin <= bounds.tempMax && (
            <line
              x1={padLeft}
              y1={optBottomY}
              x2={padLeft + plotW}
              y2={optBottomY}
              stroke="rgba(16, 185, 129, 0.45)"
              strokeDasharray="4 3"
              strokeWidth="1.2"
            />
          )}

          {/* Garis Grid Horizontal & Label Y Dinamis */}
          {[0, 0.33, 0.67, 1].map((t, i) => {
            const y = padTop + t * plotH;
            const val = bounds.tempMax - t * (bounds.tempMax - bounds.tempMin);
            const diff = bounds.tempMax - bounds.tempMin;
            const formattedVal = diff < 12 ? val.toFixed(1) : val.toFixed(0);
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
                  {formattedVal}°C
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
