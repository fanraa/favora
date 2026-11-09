import { SensorReading, ThresholdConfig } from '../types/biogas';
import { ChartRangePreset, RANGE_OPTIONS } from '../components/SensorHistoryChart';

interface ExportChartOptions {
  history: SensorReading[];
  thresholds: ThresholdConfig;
  rangePreset: ChartRangePreset;
}

export function filterReadingsByRange(
  history: SensorReading[],
  rangePreset: ChartRangePreset
): SensorReading[] {
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
}

export function exportSensorChartPng(options: ExportChartOptions): void {
  const {
    history,
    thresholds,
    rangePreset
  } = options;

  const dataPoints = filterReadingsByRange(history, rangePreset);
  if (dataPoints.length === 0) return;

  const rangeObj =
    RANGE_OPTIONS.find((r) => r.id === rangePreset) || RANGE_OPTIONS[0];

  const tempValues = dataPoints.map((d) => d.temperatureC);

  const minTemp = Math.min(...tempValues);
  const maxTemp = Math.max(...tempValues);
  const avgTemp =
    tempValues.reduce((a, b) => a + b, 0) / Math.max(1, tempValues.length);

  const tempOptMin = thresholds.tempMinOptimal;
  const tempOptMax = thresholds.tempMaxOptimal;

  // Kanvas resolusi tinggi dengan tema terang (Light Theme)
  const W = 1400;
  const H = 820;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Background terang bersih
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Border luar halus
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.strokeRect(16, 16, W - 32, H - 32);

  // Header Laporan Grafik
  const startTime = dataPoints[0]?.timestamp || '-';
  const endTime = dataPoints[dataPoints.length - 1]?.timestamp || '-';
  const dateStr = new Date().toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 24px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(
    'Laporan Grafik Monitoring Sensor Suhu IoT',
    48,
    64
  );

  ctx.fillStyle = '#64748b';
  ctx.font = '500 14px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(
    `Sistem Pemantauan Suhu Realtime IoT • Tanggal Unduh: ${dateStr}`,
    48,
    92
  );

  // Badge Info Rentang di Kanan Atas
  ctx.textAlign = 'right';
  ctx.fillStyle = '#d97706';
  ctx.font = 'bold 14px "JetBrains Mono", monospace';
  ctx.fillText(`SENSOR SUHU (°C)`, W - 48, 62);

  ctx.fillStyle = '#475569';
  ctx.font = '13px "JetBrains Mono", monospace';
  ctx.fillText(
    `Rentang: ${rangeObj.label} (${dataPoints.length} Titik Data | ${startTime} – ${endTime} WIB)`,
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
    `Rata-rata: ${avgTemp.toFixed(1)}°C   |   Suhu Terendah: ${minTemp.toFixed(1)}°C   |   Suhu Tertinggi: ${maxTemp.toFixed(1)}°C   |   Rentang Optimal: ${tempOptMin}–${tempOptMax}°C`,
    66,
    statY + 56
  );

  // Gambar Panel Grafik Suhu
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

  // Zona Optimal Suhu
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

  // Titik Data & Label
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

  // Label Sumbu X (Waktu)
  const xLabelCount = Math.min(6, dataPoints.length);
  for (let i = 0; i < xLabelCount; i++) {
    const idx =
      xLabelCount === 1
        ? 0
        : Math.round((i / (xLabelCount - 1)) * (dataPoints.length - 1));
    const px = getX(idx);
    ctx.textAlign =
      i === 0 ? 'left' : i === xLabelCount - 1 ? 'right' : 'center';
    ctx.fillStyle = '#64748b';
    ctx.font = '12px "JetBrains Mono", monospace';
    ctx.fillText(dataPoints[idx].timestamp, px, originY + pH + 28);
  }
  ctx.textAlign = 'left';

  // Footer Watermark di Bawah Gambar
  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    'Sistem Pemantauan Suhu IoT ESP32 Realtime',
    W / 2,
    H - 28
  );
  ctx.textAlign = 'left';

  const rangeSlug = rangeObj.shortLabel.replace(/\s+/g, '-');
  const isoDate = new Date().toISOString().slice(0, 10);
  const fileName = `Grafik_Suhu_IoT_${rangeSlug}_${isoDate}.png`;

  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
