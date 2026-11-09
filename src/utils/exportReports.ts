import * as XLSX from 'xlsx';
import { SensorReading, ThresholdConfig } from '../types/biogas';
import { ChartRangePreset, RANGE_OPTIONS } from '../components/SensorHistoryChart';

export type ExportScopeMode = 'session_60' | 'today_hourly' | 'all_daily';

export interface ExportReportOptions {
  history: SensorReading[];
  thresholds: ThresholdConfig;
  rangePreset?: ChartRangePreset;
  scopeMode?: ExportScopeMode;
  titlePrefix?: string;
}

export interface ProcessedReportRow {
  index: number;
  dayName: string;
  dateStr: string;
  timeRange: string;
  fullDateLabel: string;
  temp: number; // Rata-rata atau suhu riil
  minTemp: number;
  maxTemp: number;
  sampleCount: number;
  status: 'Optimal' | 'Tinggi' | 'Kritis' | 'Rendah';
  epochMs: number;
}

export interface ProcessedReportData {
  rows: ProcessedReportRow[];
  overallAvg: number;
  overallMin: number;
  overallMax: number;
  totalSamples: number;
  scopeLabel: string;
  scopeDesc: string;
  dateSummary: string;
  startTimeLabel: string;
  endTimeLabel: string;
}

const INDO_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const INDO_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const INDO_MONTHS_LONG = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

/**
 * Parsing tanggal pembacaan sensor secara andal (mendukung epochMs atau ISO timestamp)
 */
export function parseReadingDate(reading: SensorReading): Date {
  if (reading.epochMs && reading.epochMs > 0) {
    const d = new Date(reading.epochMs);
    if (!isNaN(d.getTime())) return d;
  }
  const timeMatch = String(reading.timestamp).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  const now = new Date();
  if (timeMatch) {
    const h = parseInt(timeMatch[1], 10);
    const m = parseInt(timeMatch[2], 10);
    const s = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, s);
  }
  const parsed = new Date(reading.timestamp);
  return !isNaN(parsed.getTime()) ? parsed : now;
}

/**
 * Format tanggal dan waktu dalam Bahasa Indonesia yang lengkap dan mudah dibaca
 */
export function formatFullIndoDateTime(d: Date): {
  dayName: string;
  dateShort: string;
  dateLong: string;
  timeStr: string;
  fullShort: string;
  fullLong: string;
  hourStr: string;
  dateKey: string;
} {
  const dayName = INDO_DAYS[d.getDay()] || 'Senin';
  const dd = String(d.getDate()).padStart(2, '0');
  const mmShort = INDO_MONTHS[d.getMonth()] || 'Nov';
  const mmLong = INDO_MONTHS_LONG[d.getMonth()] || 'November';
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const sec = String(d.getSeconds()).padStart(2, '0');

  const dateShort = `${dd} ${mmShort} ${yyyy}`;
  const dateLong = `${dd} ${mmLong} ${yyyy}`;
  const timeStr = `${hh}:${min}:${sec} WIB`;
  const hourStr = `${hh}:00 WIB`;
  const dateKey = `${yyyy}-${String(d.getMonth() + 1).padStart(2, '0')}-${dd}`;

  return {
    dayName,
    dateShort,
    dateLong,
    timeStr,
    fullShort: `${dayName}, ${dateShort} • ${timeStr}`,
    fullLong: `${dayName}, ${dateLong} pukul ${timeStr}`,
    hourStr,
    dateKey
  };
}

function calculateStatus(
  temp: number,
  thresholds: ThresholdConfig
): 'Optimal' | 'Tinggi' | 'Kritis' | 'Rendah' {
  if (temp >= thresholds.tempCritical) return 'Kritis';
  if (temp > thresholds.tempMaxOptimal) return 'Tinggi';
  if (temp < thresholds.tempMinOptimal) return 'Rendah';
  return 'Optimal';
}

/**
 * Filter data sensor sesuai dengan preset rentang waktu (kompatibilitas grafik)
 */
export function filterReadingsByRange(
  history: SensorReading[],
  rangePreset: ChartRangePreset
): SensorReading[] {
  const valid = history.filter(
    (r) => r.temperatureC !== undefined && Number.isFinite(r.temperatureC)
  );
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
}

/**
 * Memproses dan mengelompokkan data sensor sesuai jangkauan yang dipilih:
 * - 'session_60': 60 data mentah sesi aktif (lengkap tanggal & jam)
 * - 'today_hourly': Agregasi 24 jam hari ini (per jam dengan rata-rata, min & max)
 * - 'all_daily': Agregasi per tanggal / hari dari seluruh riwayat Firestore
 */
export function processReadingsForReport(
  history: SensorReading[],
  thresholds: ThresholdConfig,
  scopeMode: ExportScopeMode = 'session_60',
  rangePreset: ChartRangePreset = 'all'
): ProcessedReportData {
  const valid = history.filter(
    (r) => r.temperatureC !== undefined && Number.isFinite(r.temperatureC)
  );

  const now = new Date();
  const todayIndo = formatFullIndoDateTime(now);

  if (valid.length === 0) {
    return {
      rows: [],
      overallAvg: 0,
      overallMin: 0,
      overallMax: 0,
      totalSamples: 0,
      scopeLabel: 'Tidak Ada Data',
      scopeDesc: 'Belum ada data rekaman sensor',
      dateSummary: todayIndo.fullLong,
      startTimeLabel: '-',
      endTimeLabel: '-'
    };
  }

  // 1. MODE: HARI INI (AGREGASI PER JAM • 24 LOG)
  if (scopeMode === 'today_hourly') {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    let todayData = valid.filter((r) => {
      const d = parseReadingDate(r);
      return d.getTime() >= startOfToday;
    });

    // Jika belum ada data khusus hari ini (misal offline/baru nyala), gunakan data terbaru yang ada
    if (todayData.length === 0) {
      todayData = valid.slice(0, 300);
    }

    // Kelompokkan per jam (0..23)
    const buckets: { [hour: number]: { temps: number[]; readings: SensorReading[] } } = {};
    todayData.forEach((r) => {
      const d = parseReadingDate(r);
      const h = d.getHours();
      if (!buckets[h]) buckets[h] = { temps: [], readings: [] };
      buckets[h].temps.push(r.temperatureC);
      buckets[h].readings.push(r);
    });

    const rows: ProcessedReportRow[] = [];
    const sortedHours = Object.keys(buckets)
      .map(Number)
      .sort((a, b) => a - b);

    sortedHours.forEach((h, idx) => {
      const b = buckets[h];
      const count = b.temps.length;
      const sum = b.temps.reduce((acc, v) => acc + v, 0);
      const avg = Number((sum / count).toFixed(2));
      const min = Math.min(...b.temps);
      const max = Math.max(...b.temps);
      const sampleD = parseReadingDate(b.readings[0]);
      const indo = formatFullIndoDateTime(sampleD);

      const hNext = (h + 1) % 24;
      const rangeStr = `Jam ${String(h).padStart(2, '0')}:00 – ${String(hNext).padStart(2, '0')}:00 WIB`;

      rows.push({
        index: idx + 1,
        dayName: indo.dayName,
        dateStr: indo.dateShort,
        timeRange: rangeStr,
        fullDateLabel: `${indo.dayName}, ${indo.dateShort} (${rangeStr})`,
        temp: avg,
        minTemp: Number(min.toFixed(2)),
        maxTemp: Number(max.toFixed(2)),
        sampleCount: count,
        status: calculateStatus(avg, thresholds),
        epochMs: sampleD.getTime()
      });
    });

    const allTemps = todayData.map((r) => r.temperatureC);
    const overallAvg = allTemps.reduce((a, b) => a + b, 0) / Math.max(1, allTemps.length);
    const overallMin = Math.min(...allTemps);
    const overallMax = Math.max(...allTemps);

    return {
      rows,
      overallAvg: Number(overallAvg.toFixed(2)),
      overallMin: Number(overallMin.toFixed(2)),
      overallMax: Number(overallMax.toFixed(2)),
      totalSamples: todayData.length,
      scopeLabel: 'Hari Ini (Per Jam • 24 Log)',
      scopeDesc: `Rangkuman 24 jam hari ini (${rows.length} blok jam tercatat • ${todayData.length} sampel)`,
      dateSummary: `${todayIndo.dayName}, ${todayIndo.dateLong}`,
      startTimeLabel: rows[0]?.timeRange || '-',
      endTimeLabel: rows[rows.length - 1]?.timeRange || '-'
    };
  }

  // 2. MODE: SEMUA RIWAYAT (REKAP HARIAN)
  if (scopeMode === 'all_daily') {
    const dayBuckets: { [dateKey: string]: { temps: number[]; sampleDate: Date; readings: SensorReading[] } } = {};

    valid.forEach((r) => {
      const d = parseReadingDate(r);
      const indo = formatFullIndoDateTime(d);
      if (!dayBuckets[indo.dateKey]) {
        dayBuckets[indo.dateKey] = { temps: [], sampleDate: d, readings: [] };
      }
      dayBuckets[indo.dateKey].temps.push(r.temperatureC);
      dayBuckets[indo.dateKey].readings.push(r);
    });

    const rows: ProcessedReportRow[] = [];
    const sortedKeys = Object.keys(dayBuckets).sort(); // Urutkan tanggal dari terlama ke terbaru

    sortedKeys.forEach((key, idx) => {
      const b = dayBuckets[key];
      const count = b.temps.length;
      const sum = b.temps.reduce((acc, v) => acc + v, 0);
      const avg = Number((sum / count).toFixed(2));
      const min = Math.min(...b.temps);
      const max = Math.max(...b.temps);
      const indo = formatFullIndoDateTime(b.sampleDate);

      rows.push({
        index: idx + 1,
        dayName: indo.dayName,
        dateStr: indo.dateShort,
        timeRange: '24 Jam Penuh',
        fullDateLabel: `${indo.dayName}, ${indo.dateShort}`,
        temp: avg,
        minTemp: Number(min.toFixed(2)),
        maxTemp: Number(max.toFixed(2)),
        sampleCount: count,
        status: calculateStatus(avg, thresholds),
        epochMs: b.sampleDate.getTime()
      });
    });

    const allTemps = valid.map((r) => r.temperatureC);
    const overallAvg = allTemps.reduce((a, b) => a + b, 0) / Math.max(1, allTemps.length);
    const overallMin = Math.min(...allTemps);
    const overallMax = Math.max(...allTemps);

    return {
      rows,
      overallAvg: Number(overallAvg.toFixed(2)),
      overallMin: Number(overallMin.toFixed(2)),
      overallMax: Number(overallMax.toFixed(2)),
      totalSamples: valid.length,
      scopeLabel: 'Semua Riwayat (Rekap Harian)',
      scopeDesc: `Rekapitulasi per hari dari awal (${rows.length} hari tercatat • ${valid.length} total sampel)`,
      dateSummary: `${rows[0]?.dateStr || '-'} s/d ${rows[rows.length - 1]?.dateStr || '-'}`,
      startTimeLabel: rows[0]?.fullDateLabel || '-',
      endTimeLabel: rows[rows.length - 1]?.fullDateLabel || '-'
    };
  }

  // 3. MODE: 60 LOG TERKINI (SESI AKTIF)
  const chronological = filterReadingsByRange(valid, rangePreset);
  const rows: ProcessedReportRow[] = chronological.map((r, idx) => {
    const d = parseReadingDate(r);
    const indo = formatFullIndoDateTime(d);
    return {
      index: idx + 1,
      dayName: indo.dayName,
      dateStr: indo.dateShort,
      timeRange: indo.timeStr,
      fullDateLabel: `${indo.dayName}, ${indo.dateShort} • ${indo.timeStr}`,
      temp: Number(r.temperatureC.toFixed(2)),
      minTemp: Number(r.temperatureC.toFixed(2)),
      maxTemp: Number(r.temperatureC.toFixed(2)),
      sampleCount: 1,
      status: calculateStatus(r.temperatureC, thresholds),
      epochMs: d.getTime()
    };
  });

  const allTemps = chronological.map((r) => r.temperatureC);
  const overallAvg = allTemps.reduce((a, b) => a + b, 0) / Math.max(1, allTemps.length);
  const overallMin = Math.min(...allTemps);
  const overallMax = Math.max(...allTemps);

  return {
    rows,
    overallAvg: Number(overallAvg.toFixed(2)),
    overallMin: Number(overallMin.toFixed(2)),
    overallMax: Number(overallMax.toFixed(2)),
    totalSamples: chronological.length,
    scopeLabel: '60 Log Terkini (Sesi Ini)',
    scopeDesc: `60 titik data mentah terbaru dari sesi aktif dasbor`,
    dateSummary: `${todayIndo.dayName}, ${todayIndo.dateLong}`,
    startTimeLabel: rows[0]?.timeRange || '-',
    endTimeLabel: rows[rows.length - 1]?.timeRange || '-'
  };
}

/**
 * Trigger download file pada browser menggunakan Blob
 */
function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Render visualisasi grafik suhu beresolusi tinggi ke canvas HTML5
 */
export function renderSensorChartToCanvas(options: ExportReportOptions): HTMLCanvasElement | null {
  const { history, thresholds, scopeMode = 'session_60', rangePreset = 'all' } = options;
  const processed = processReadingsForReport(history, thresholds, scopeMode, rangePreset);
  const { rows, overallAvg, overallMin, overallMax } = processed;
  if (rows.length === 0) return null;

  const tempValues = rows.map((r) => r.temp);
  const tempOptMin = thresholds.tempMinOptimal;
  const tempOptMax = thresholds.tempMaxOptimal;

  // Kanvas High-DPI
  const W = 1400;
  const H = 820;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Background terang bersih
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Border luar halus
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.strokeRect(16, 16, W - 32, H - 32);

  // Header Laporan Grafik
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 24px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('PAVORA — Grafik Monitoring Suhu Inframerah', 48, 64);

  ctx.fillStyle = '#64748b';
  ctx.font = '500 13px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(
    `Sistem IoT Sensor GY-906 (MLX90614) • Jangkauan: ${processed.scopeLabel} • ${processed.dateSummary}`,
    48,
    92
  );

  // Badge Info di Kanan Atas
  ctx.textAlign = 'right';
  ctx.fillStyle = '#d97706';
  ctx.font = 'bold 13px "JetBrains Mono", monospace';
  ctx.fillText(`SENSOR SUHU (°C)`, W - 48, 62);

  ctx.fillStyle = '#475569';
  ctx.font = '12px "JetBrains Mono", monospace';
  ctx.fillText(
    `${rows.length} Titik Data | ${processed.startTimeLabel} – ${processed.endTimeLabel}`,
    W - 48,
    88
  );
  ctx.textAlign = 'left';

  // Garis pemisah header
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(48, 112);
  ctx.lineTo(W - 48, 112);
  ctx.stroke();

  // Kotak Ringkasan Statistik
  const statY = 130;
  const statH = 80;
  const boxW = W - 96;

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(48, statY, boxW, statH);
  ctx.strokeStyle = '#cbd5e1';
  ctx.strokeRect(48, statY, boxW, statH);

  ctx.fillStyle = '#b45309';
  ctx.font = 'bold 13px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('RINGKASAN STATISTIK SUHU (°C)', 66, statY + 28);

  ctx.fillStyle = '#1e293b';
  ctx.font = '13px "JetBrains Mono", monospace';
  ctx.fillText(
    `Rata-rata: ${overallAvg.toFixed(2)}°C   |   Terendah: ${overallMin.toFixed(2)}°C   |   Tertinggi: ${overallMax.toFixed(2)}°C   |   Rentang Normal: ${tempOptMin}–${tempOptMax}°C   |   Kritis: ≥${thresholds.tempCritical}°C`,
    66,
    statY + 56
  );

  // Area Gambar Grafik Suhu
  const padL = 96;
  const padR = 64;
  const padT = 246;
  const panelH = 480;
  const pW = W - padL - padR;
  const pH = panelH - 70;
  const originX = padL;
  const originY = padT;

  const tMinData = Math.min(...tempValues);
  const tMaxData = Math.max(...tempValues);
  const rawSpan = tMaxData - tMinData;
  const span = Math.max(3.0, rawSpan);
  const pad = Math.max(0.8, span * 0.16);

  const yMin = Math.max(0, Number((tMinData - pad).toFixed(1)));
  const yMax = Number((tMaxData + pad).toFixed(1));

  const getX = (idx: number) =>
    tempValues.length <= 1
      ? originX + pW / 2
      : originX + (idx / (tempValues.length - 1)) * pW;
  const getY = (v: number) => {
    const ratio = (v - yMin) / Math.max(0.0001, yMax - yMin);
    return originY + pH - Math.min(1, Math.max(0, ratio)) * pH;
  };

  // Zona Optimal Suhu (Tampil lembut jika bersinggungan dengan rentang tampak)
  if (tempOptMin <= yMax && tempOptMax >= yMin) {
    const optTop = Math.max(originY, getY(tempOptMax));
    const optBot = Math.min(originY + pH, getY(tempOptMin));
    ctx.fillStyle = 'rgba(16, 185, 129, 0.06)';
    ctx.fillRect(originX, optTop, pW, Math.max(0, optBot - optTop));
  }

  ctx.save();
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.5)';
  if (tempOptMax >= yMin && tempOptMax <= yMax) {
    const optTop = getY(tempOptMax);
    ctx.beginPath();
    ctx.moveTo(originX, optTop);
    ctx.lineTo(originX + pW, optTop);
    ctx.stroke();
  }
  if (tempOptMin >= yMin && tempOptMin <= yMax) {
    const optBot = getY(tempOptMin);
    ctx.beginPath();
    ctx.moveTo(originX, optBot);
    ctx.lineTo(originX + pW, optBot);
    ctx.stroke();
  }
  ctx.restore();

  // Grid Horizontal
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const diffRange = yMax - yMin;
  ticks.forEach((t) => {
    const gy = originY + t * pH;
    const gVal = yMax - t * (yMax - yMin);
    ctx.strokeStyle = '#f1f5f9';
    ctx.beginPath();
    ctx.moveTo(originX, gy);
    ctx.lineTo(originX + pW, gy);
    ctx.stroke();

    ctx.textAlign = 'right';
    ctx.fillStyle = '#64748b';
    ctx.font = '12px "JetBrains Mono", monospace';
    const formatted = diffRange < 12 ? gVal.toFixed(1) : gVal.toFixed(0);
    ctx.fillText(`${formatted} °C`, originX - 12, gy + 4);
    ctx.textAlign = 'left';
  });

  const pts = tempValues.map((v, i) => ({ x: getX(i), y: getY(v), v }));

  // Gradasi Area Kurva
  const grad = ctx.createLinearGradient(0, originY, 0, originY + pH);
  grad.addColorStop(0, 'rgba(245, 158, 11, 0.25)');
  grad.addColorStop(1, 'rgba(245, 158, 11, 0.01)');

  ctx.beginPath();
  if (pts.length === 1) {
    ctx.moveTo(originX, pts[0].y);
    ctx.lineTo(originX + pW, pts[0].y);
    ctx.lineTo(originX + pW, originY + pH);
    ctx.lineTo(originX, originY + pH);
  } else {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const cpx1 = p0.x + (p1.x - p0.x) * 0.42;
      const cpx2 = p0.x + (p1.x - p0.x) * 0.58;
      ctx.bezierCurveTo(cpx1, p0.y, cpx2, p1.y, p1.x, p1.y);
    }
    ctx.lineTo(pts[pts.length - 1].x, originY + pH);
    ctx.lineTo(pts[0].x, originY + pH);
  }
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Garis Kurva Utama
  ctx.beginPath();
  if (pts.length === 1) {
    ctx.moveTo(originX, pts[0].y);
    ctx.lineTo(originX + pW, pts[0].y);
  } else {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const cpx1 = p0.x + (p1.x - p0.x) * 0.42;
      const cpx2 = p0.x + (p1.x - p0.x) * 0.58;
      ctx.bezierCurveTo(cpx1, p0.y, cpx2, p1.y, p1.x, p1.y);
    }
  }
  ctx.strokeStyle = '#ea580c';
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // Titik Data & Label Nilai
  const labelStep = Math.max(1, Math.ceil(pts.length / 12));
  pts.forEach((pt, idx) => {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#ea580c';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    if (idx % labelStep === 0 || idx === pts.length - 1) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.fillText(`${pt.v.toFixed(1)}°`, pt.x, pt.y - 12);
    }
  });

  // Label Sumbu X (Waktu / Jam / Tanggal)
  const xLabelCount = Math.min(8, rows.length);
  for (let i = 0; i < xLabelCount; i++) {
    const idx =
      xLabelCount === 1
        ? 0
        : Math.round((i / (xLabelCount - 1)) * (rows.length - 1));
    const px = getX(idx);
    const row = rows[idx];
    const lbl = scopeMode === 'all_daily' ? row.dateStr : (scopeMode === 'today_hourly' ? row.timeRange.replace('Jam ', '').replace(' WIB', '') : row.timeRange.replace(' WIB', ''));

    ctx.textAlign = 'center';
    ctx.fillStyle = '#64748b';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillText(lbl, px, originY + pH + 24);
  }

  // Footer Kanvas
  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    'PAVORA — Sistem Pemantauan Suhu Inframerah Realtime Berbasis Cloud Firestore',
    W / 2,
    H - 28
  );
  ctx.textAlign = 'left';

  return canvas;
}

/**
 * Helper membuat nama file terstruktur dan seragam
 */
function generateExportFileName(scopeMode: ExportScopeMode, extension: string): string {
  const isoDate = new Date().toISOString().slice(0, 10);
  let scopeSlug = '60_Terkini';
  if (scopeMode === 'today_hourly') scopeSlug = 'Hari_Ini_Per_Jam';
  else if (scopeMode === 'all_daily') scopeSlug = 'Rekap_Harian';
  return `PAVORA_Suhu_${scopeSlug}_${isoDate}.${extension}`;
}

/**
 * 1. UNDUH GRAFIK FORMAT PNG
 */
export function exportSensorChartPng(options: ExportReportOptions): void {
  const canvas = renderSensorChartToCanvas(options);
  if (!canvas) return;

  const fileName = generateExportFileName(options.scopeMode || 'session_60', 'png');
  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * 2. UNDUH SPREADSHEET EXCEL (.XLSX) DENGAN REKAP HARIAN & PER JAM
 */
export function exportSensorDataXlsx(options: ExportReportOptions): void {
  const { history, thresholds, scopeMode = 'session_60', rangePreset = 'all' } = options;
  const processed = processReadingsForReport(history, thresholds, scopeMode, rangePreset);
  const { rows, overallAvg, overallMin, overallMax, totalSamples } = processed;
  if (rows.length === 0) return;

  const wb = XLSX.utils.book_new();

  // SHEET 1: Data Pengukuran Suhu Lengkap
  const sheetRows: any[][] = [];
  sheetRows.push(['PAVORA — LAPORAN RESMI MONITORING SUHU INFRAMERAH']);
  sheetRows.push([`Jangkauan: ${processed.scopeLabel} | Tanggal Ekspor: ${processed.dateSummary} WIB`]);
  sheetRows.push([`Sensor: GY-906 (MLX90614) | Mikrokontroler: ESP32 Dev Module | Cloud: Firestore`]);
  sheetRows.push([]); // baris kosong

  // Header Kolom Tabel Sesuai Mode
  if (scopeMode === 'today_hourly') {
    sheetRows.push([
      'No',
      'Hari',
      'Tanggal',
      'Rentang Waktu (Jam WIB)',
      'Suhu Rata-rata (°C)',
      'Suhu Terendah (°C)',
      'Suhu Tertinggi (°C)',
      'Status Kondisi',
      'Jumlah Sampel',
      'Model Sensor'
    ]);
    rows.forEach((r) => {
      sheetRows.push([
        r.index,
        r.dayName,
        r.dateStr,
        r.timeRange,
        r.temp,
        r.minTemp,
        r.maxTemp,
        r.status,
        r.sampleCount,
        'GY-906 (MLX90614)'
      ]);
    });
  } else if (scopeMode === 'all_daily') {
    sheetRows.push([
      'No',
      'Hari',
      'Tanggal',
      'Periode',
      'Suhu Rata-rata (°C)',
      'Suhu Minimum (°C)',
      'Suhu Maksimum (°C)',
      'Status Kondisi',
      'Total Sampel Sensor',
      'Model Sensor'
    ]);
    rows.forEach((r) => {
      sheetRows.push([
        r.index,
        r.dayName,
        r.dateStr,
        r.timeRange,
        r.temp,
        r.minTemp,
        r.maxTemp,
        r.status,
        r.sampleCount,
        'GY-906 (MLX90614)'
      ]);
    });
  } else {
    sheetRows.push([
      'No',
      'Hari',
      'Tanggal',
      'Waktu (WIB)',
      'Suhu Objek (°C)',
      'Status Kondisi',
      'Ambang Min (°C)',
      'Ambang Maks (°C)',
      'Batas Kritis (°C)',
      'Model Sensor'
    ]);
    rows.forEach((r) => {
      sheetRows.push([
        r.index,
        r.dayName,
        r.dateStr,
        r.timeRange,
        r.temp,
        r.status,
        thresholds.tempMinOptimal,
        thresholds.tempMaxOptimal,
        thresholds.tempCritical,
        'GY-906 (MLX90614)'
      ]);
    });
  }

  const wsData = XLSX.utils.aoa_to_sheet(sheetRows);
  wsData['!cols'] = [
    { wch: 6 },
    { wch: 12 },
    { wch: 16 },
    { wch: 26 },
    { wch: 20 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 16 },
    { wch: 22 }
  ];
  XLSX.utils.book_append_sheet(wb, wsData, 'Data Pengukuran');

  // SHEET 2: Ringkasan Statistik & Analisis
  const summaryRows: any[][] = [
    ['PAVORA — RINGKASAN STATISTIK & ANALISIS SUHU'],
    [],
    ['Parameter', 'Nilai', 'Satuan', 'Keterangan'],
    ['Mode Jangkauan Laporan', processed.scopeLabel, '-', processed.scopeDesc],
    ['Tanggal & Periode Laporan', processed.dateSummary, 'WIB', 'Waktu pembuatan dokumen'],
    ['Total Baris Data Laporan', rows.length, 'Baris', 'Jumlah data ringkasan dalam tabel'],
    ['Total Sampel Mentah Sensor', totalSamples, 'Sampel', 'Total pembacaan dari sensor fisik'],
    ['Suhu Rata-rata Keseluruhan', overallAvg, '°C', 'Rata-rata temperatur selama periode'],
    ['Suhu Paling Rendah (Minimum)', overallMin, '°C', 'Titik temperatur terendah yang tercapai'],
    ['Suhu Paling Tinggi (Maksimum)', overallMax, '°C', 'Titik temperatur tertinggi yang tercapai'],
    ['Ambang Batas Suhu Normal', `${thresholds.tempMinOptimal} – ${thresholds.tempMaxOptimal}`, '°C', 'Rentang kondisi aman/optimal'],
    ['Batas Kritis Suhu Darurat', thresholds.tempCritical, '°C', 'Ambang batas aktivasi sirine alarm'],
    ['Sensor yang Digunakan', 'GY-906 (MLX90614ESF)', '-', 'Termometer inframerah non-kontak I2C'],
    ['Mikrokontroler Pengirim', 'ESP32 Dev Module', '-', 'Transmisi realtime Firebase Firestore'],
    ['Titik Awal Pengukuran', processed.startTimeLabel, '-', 'Awal rentang rekaman data'],
    ['Titik Akhir Pengukuran', processed.endTimeLabel, '-', 'Akhir rentang rekaman data']
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 28 }, { wch: 22 }, { wch: 12 }, { wch: 44 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan Statistik');

  const fileName = generateExportFileName(scopeMode, 'xlsx');
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  triggerBlobDownload(blob, fileName);
}

/**
 * 3. UNDUH DOKUMEN LAPORAN LENGKAP FORMAT MICROSOFT WORD (.DOC)
 */
export function exportSensorReportDoc(options: ExportReportOptions): void {
  const { history, thresholds, scopeMode = 'session_60', rangePreset = 'all' } = options;
  const processed = processReadingsForReport(history, thresholds, scopeMode, rangePreset);
  const { rows, overallAvg, overallMin, overallMax, totalSamples } = processed;
  if (rows.length === 0) return;

  const canvas = renderSensorChartToCanvas(options);
  let chartImageHtml = '';
  if (canvas) {
    const dataUrl = canvas.toDataURL('image/png');
    chartImageHtml = `
      <div style="margin: 20px 0; text-align: center;">
        <h3 style="font-size: 13px; color: #0f172a; margin-bottom: 8px; text-align: left;">
          Visualisasi Grafik Tren Suhu Inframerah
        </h3>
        <img src="${dataUrl}" style="width: 100%; max-width: 650px; border: 1px solid #cbd5e1; border-radius: 4px;" alt="Grafik Suhu PAVORA" />
      </div>
    `;
  }

  // Baris Tabel HTML
  let tableHeaderHtml = '';
  let tableRowsHtml = '';

  if (scopeMode === 'today_hourly') {
    tableHeaderHtml = `
      <tr>
        <th style="width: 6%; text-align: center;">No</th>
        <th style="width: 14%;">Hari</th>
        <th style="width: 15%;">Tanggal</th>
        <th style="width: 25%;">Rentang Jam (WIB)</th>
        <th style="width: 14%; text-align: center;">Rata-rata (°C)</th>
        <th style="width: 13%; text-align: center;">Min - Max (°C)</th>
        <th style="width: 13%; text-align: center;">Status</th>
      </tr>
    `;
    tableRowsHtml = rows
      .map(
        (r, i) => `
        <tr style="background-color: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
          <td style="text-align: center; padding: 6px; border: 1px solid #e2e8f0;">${r.index}</td>
          <td style="padding: 6px; border: 1px solid #e2e8f0;"><strong>${r.dayName}</strong></td>
          <td style="padding: 6px; border: 1px solid #e2e8f0;">${r.dateStr}</td>
          <td style="padding: 6px; border: 1px solid #e2e8f0; font-family: monospace;">${r.timeRange}</td>
          <td style="text-align: center; padding: 6px; border: 1px solid #e2e8f0; font-weight: bold; color: #ea580c;">${r.temp.toFixed(2)}</td>
          <td style="text-align: center; padding: 6px; border: 1px solid #e2e8f0; font-size: 10.5px;">${r.minTemp.toFixed(1)} – ${r.maxTemp.toFixed(1)}</td>
          <td style="text-align: center; padding: 6px; border: 1px solid #e2e8f0; font-weight: bold; color: ${
            r.status === 'Optimal' ? '#10b981' : r.status === 'Kritis' ? '#e11d48' : '#d97706'
          };">${r.status}</td>
        </tr>
      `
      )
      .join('');
  } else if (scopeMode === 'all_daily') {
    tableHeaderHtml = `
      <tr>
        <th style="width: 6%; text-align: center;">No</th>
        <th style="width: 16%;">Hari</th>
        <th style="width: 18%;">Tanggal</th>
        <th style="width: 18%; text-align: center;">Suhu Rerata (°C)</th>
        <th style="width: 16%; text-align: center;">Min (°C)</th>
        <th style="width: 16%; text-align: center;">Max (°C)</th>
        <th style="width: 10%; text-align: center;">Status</th>
      </tr>
    `;
    tableRowsHtml = rows
      .map(
        (r, i) => `
        <tr style="background-color: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
          <td style="text-align: center; padding: 6px; border: 1px solid #e2e8f0;">${r.index}</td>
          <td style="padding: 6px; border: 1px solid #e2e8f0;"><strong>${r.dayName}</strong></td>
          <td style="padding: 6px; border: 1px solid #e2e8f0;">${r.dateStr}</td>
          <td style="text-align: center; padding: 6px; border: 1px solid #e2e8f0; font-weight: bold; color: #ea580c;">${r.temp.toFixed(2)}</td>
          <td style="text-align: center; padding: 6px; border: 1px solid #e2e8f0;">${r.minTemp.toFixed(2)}</td>
          <td style="text-align: center; padding: 6px; border: 1px solid #e2e8f0;">${r.maxTemp.toFixed(2)}</td>
          <td style="text-align: center; padding: 6px; border: 1px solid #e2e8f0; font-weight: bold; color: ${
            r.status === 'Optimal' ? '#10b981' : r.status === 'Kritis' ? '#e11d48' : '#d97706'
          };">${r.status}</td>
        </tr>
      `
      )
      .join('');
  } else {
    tableHeaderHtml = `
      <tr>
        <th style="width: 6%; text-align: center;">No</th>
        <th style="width: 16%;">Hari</th>
        <th style="width: 18%;">Tanggal</th>
        <th style="width: 22%;">Waktu (WIB)</th>
        <th style="width: 20%; text-align: center;">Suhu (°C)</th>
        <th style="width: 18%; text-align: center;">Status</th>
      </tr>
    `;
    tableRowsHtml = rows
      .map(
        (r, i) => `
        <tr style="background-color: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
          <td style="text-align: center; padding: 6px; border: 1px solid #e2e8f0;">${r.index}</td>
          <td style="padding: 6px; border: 1px solid #e2e8f0;"><strong>${r.dayName}</strong></td>
          <td style="padding: 6px; border: 1px solid #e2e8f0;">${r.dateStr}</td>
          <td style="padding: 6px; border: 1px solid #e2e8f0; font-family: monospace;">${r.timeRange}</td>
          <td style="text-align: center; padding: 6px; border: 1px solid #e2e8f0; font-weight: bold; color: #ea580c;">${r.temp.toFixed(2)}</td>
          <td style="text-align: center; padding: 6px; border: 1px solid #e2e8f0; font-weight: bold; color: ${
            r.status === 'Optimal' ? '#10b981' : r.status === 'Kritis' ? '#e11d48' : '#d97706'
          };">${r.status}</td>
        </tr>
      `
      )
      .join('');
  }

  const docHtml = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset="utf-8">
      <title>PAVORA — Laporan Monitoring Suhu</title>
      <style>
        @page { size: A4 portrait; margin: 2cm; }
        body { font-family: 'Calibri', 'Segoe UI', Arial, sans-serif; color: #0f172a; line-height: 1.5; margin: 0; padding: 0; }
        h1 { color: #b45309; font-size: 20px; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.5px; }
        h2 { color: #334155; font-size: 13px; margin-top: 0; font-weight: normal; }
        table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 11px; }
        th { background-color: #f1f5f9; color: #334155; font-weight: bold; padding: 8px 6px; border: 1px solid #cbd5e1; text-align: left; }
        .stat-card { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin: 14px 0; }
      </style>
    </head>
    <body>
      <!-- Header Dokumen -->
      <table style="width: 100%; border-bottom: 2px solid #ea580c; padding-bottom: 8px; margin-bottom: 14px; border: none;">
        <tr>
          <td style="vertical-align: middle; border: none;">
            <h1>PAVORA — LAPORAN RESMI MONITORING SUHU</h1>
            <h2>Sistem Pengukuran Temperatur Inframerah Non-Kontak Berbasis IoT & Cloud</h2>
          </td>
          <td style="text-align: right; vertical-align: middle; font-size: 11px; color: #64748b; border: none;">
            <strong>Waktu Ekspor:</strong><br />
            ${processed.dateSummary}
          </td>
        </tr>
      </table>

      <!-- Informasi Sistem & Parameter -->
      <table style="width: 100%; margin-bottom: 14px; font-size: 11px;">
        <tr>
          <td style="width: 50%; padding: 8px; background-color: #f8fafc; border: 1px solid #e2e8f0; vertical-align: top;">
            <strong>INFORMASI PERANGKAT:</strong><br />
            • Mikrokontroler: ESP32 Dev Module<br />
            • Modul Sensor: GY-906 (MLX90614ESF Inframerah)<br />
            • Antarmuka: I2C (SCL: GPIO 22, SDA: GPIO 21)<br />
            • Cloud Sinkronisasi: Google Cloud Firestore
          </td>
          <td style="width: 50%; padding: 8px; background-color: #f8fafc; border: 1px solid #e2e8f0; vertical-align: top;">
            <strong>PARAMETER PENGUKURAN:</strong><br />
            • Jangkauan Data: <strong>${processed.scopeLabel}</strong><br />
            • Total Data Sampel: ${totalSamples} Titik Rekaman Sensor<br />
            • Baris Rekapitulasi: ${rows.length} Baris Teranalisis<br />
            • Periode: ${processed.startTimeLabel} s/d ${processed.endTimeLabel}
          </td>
        </tr>
      </table>

      <!-- Ringkasan Statistik -->
      <div class="stat-card">
        <h3 style="font-size: 13px; color: #b45309; margin: 0 0 8px 0; text-transform: uppercase;">
          Ringkasan Statistik Suhu (°C)
        </h3>
        <table style="width: 100%; font-size: 11px; margin: 0; border: none;">
          <tr>
            <td style="width: 25%; padding: 4px; border: none;"><strong>Rata-rata:</strong> ${overallAvg.toFixed(2)} °C</td>
            <td style="width: 25%; padding: 4px; border: none;"><strong>Terendah (Min):</strong> ${overallMin.toFixed(2)} °C</td>
            <td style="width: 25%; padding: 4px; border: none;"><strong>Tertinggi (Max):</strong> ${overallMax.toFixed(2)} °C</td>
            <td style="width: 25%; padding: 4px; border: none;"><strong>Rentang Normal:</strong> ${thresholds.tempMinOptimal} – ${thresholds.tempMaxOptimal} °C</td>
          </tr>
          <tr>
            <td colspan="4" style="padding: 4px; color: #e11d48; font-size: 10.5px; border: none;">
              *Ambang Batas Kritis Pemicu Sirine Alarm: ≥ ${thresholds.tempCritical} °C
            </td>
          </tr>
        </table>
      </div>

      <!-- Gambar Grafik Visual -->
      ${chartImageHtml}

      <!-- Tabel Data Log Rinci -->
      <h3 style="font-size: 13px; color: #0f172a; margin: 20px 0 6px 0;">
        Tabel Riwayat Data Log Pengukuran Suhu
      </h3>
      <table>
        <thead>
          ${tableHeaderHtml}
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>

      <!-- Footer & Validasi -->
      <div style="margin-top: 26px; padding-top: 10px; border-top: 1px solid #cbd5e1; font-size: 10px; color: #94a3b8; text-align: center;">
        Dokumen ini dibuat otomatis oleh Sistem Monitoring Suhu IoT PAVORA.<br />
        Hak Cipta © ${new Date().getFullYear()} PAVORA — Rekayasa Instrumentasi & IoT.
      </div>
    </body>
    </html>
  `;

  const blob = new Blob(['\ufeff', docHtml], { type: 'application/msword;charset=utf-8' });
  const fileName = generateExportFileName(scopeMode, 'doc');
  triggerBlobDownload(blob, fileName);
}

/**
 * 4. UNDUH DATA RIWAYAT FORMAT CSV (.CSV)
 */
export function exportSensorDataCsv(options: ExportReportOptions): void {
  const { history, thresholds, scopeMode = 'session_60', rangePreset = 'all' } = options;
  const processed = processReadingsForReport(history, thresholds, scopeMode, rangePreset);
  const { rows } = processed;
  if (rows.length === 0) return;

  const lines: string[] = [];

  if (scopeMode === 'today_hourly') {
    lines.push(['No', 'Hari', 'Tanggal', 'Rentang_Waktu_WIB', 'Suhu_Rata_Rata_C', 'Suhu_Min_C', 'Suhu_Maks_C', 'Status_Kondisi', 'Jumlah_Sampel', 'Model_Sensor'].join(','));
    rows.forEach((r) => {
      lines.push([
        r.index,
        `"${r.dayName}"`,
        `"${r.dateStr}"`,
        `"${r.timeRange}"`,
        r.temp.toFixed(2),
        r.minTemp.toFixed(2),
        r.maxTemp.toFixed(2),
        `"${r.status}"`,
        r.sampleCount,
        `"GY-906 (MLX90614)"`
      ].join(','));
    });
  } else if (scopeMode === 'all_daily') {
    lines.push(['No', 'Hari', 'Tanggal', 'Periode', 'Suhu_Rata_Rata_C', 'Suhu_Min_C', 'Suhu_Maks_C', 'Status_Kondisi', 'Total_Sampel', 'Model_Sensor'].join(','));
    rows.forEach((r) => {
      lines.push([
        r.index,
        `"${r.dayName}"`,
        `"${r.dateStr}"`,
        `"${r.timeRange}"`,
        r.temp.toFixed(2),
        r.minTemp.toFixed(2),
        r.maxTemp.toFixed(2),
        `"${r.status}"`,
        r.sampleCount,
        `"GY-906 (MLX90614)"`
      ].join(','));
    });
  } else {
    lines.push(['No', 'Hari', 'Tanggal', 'Waktu_WIB', 'Suhu_Celcius', 'Status_Kondisi', 'Ambang_Min_C', 'Ambang_Maks_C', 'Batas_Kritis_C', 'Model_Sensor'].join(','));
    rows.forEach((r) => {
      lines.push([
        r.index,
        `"${r.dayName}"`,
        `"${r.dateStr}"`,
        `"${r.timeRange}"`,
        r.temp.toFixed(2),
        `"${r.status}"`,
        thresholds.tempMinOptimal,
        thresholds.tempMaxOptimal,
        thresholds.tempCritical,
        `"GY-906 (MLX90614)"`
      ].join(','));
    });
  }

  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const fileName = generateExportFileName(scopeMode, 'csv');
  triggerBlobDownload(blob, fileName);
}

/**
 * 5. UNDUH DATA TERSTRUKTUR FORMAT JSON (.JSON)
 */
export function exportSensorDataJson(options: ExportReportOptions): void {
  const { history, thresholds, scopeMode = 'session_60', rangePreset = 'all' } = options;
  const processed = processReadingsForReport(history, thresholds, scopeMode, rangePreset);
  const { rows, overallAvg, overallMin, overallMax, totalSamples } = processed;
  if (rows.length === 0) return;

  const payload = {
    project: 'PAVORA',
    description: 'Laporan Telemetri Suhu Inframerah Realtime',
    sensor_model: 'GY-906 (MLX90614ESF)',
    scope_mode: scopeMode,
    scope_label: processed.scopeLabel,
    exported_at: new Date().toISOString(),
    date_summary: processed.dateSummary,
    thresholds_config: thresholds,
    statistics: {
      total_rows: rows.length,
      total_samples: totalSamples,
      average_temp_c: overallAvg,
      min_temp_c: overallMin,
      max_temp_c: overallMax
    },
    data_records: rows
  };

  const jsonStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
  const fileName = generateExportFileName(scopeMode, 'json');
  triggerBlobDownload(blob, fileName);
}
