import * as XLSX from 'xlsx';
import { SensorReading, ThresholdConfig } from '../types/biogas';
import { ChartRangePreset, RANGE_OPTIONS } from '../components/SensorHistoryChart';

export interface ExportReportOptions {
  history: SensorReading[];
  thresholds: ThresholdConfig;
  rangePreset: ChartRangePreset;
  titlePrefix?: string;
}

/**
 * Filter data sensor sesuai dengan preset rentang waktu
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

  // Balik urutan agar kronologis dari yang terlama ke terbaru untuk grafik dan tabel runtut
  return [...filtered].reverse();
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
  const { history, thresholds, rangePreset } = options;
  const dataPoints = filterReadingsByRange(history, rangePreset);
  if (dataPoints.length === 0) return null;

  const rangeObj =
    RANGE_OPTIONS.find((r) => r.id === rangePreset) || RANGE_OPTIONS[0];

  const tempValues = dataPoints.map((d) => d.temperatureC);
  const minTemp = Math.min(...tempValues);
  const maxTemp = Math.max(...tempValues);
  const avgTemp =
    tempValues.reduce((a, b) => a + b, 0) / Math.max(1, tempValues.length);

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
  const startTime = dataPoints[0]?.timestamp || '-';
  const endTime = dataPoints[dataPoints.length - 1]?.timestamp || '-';
  const dateStr = new Date().toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 24px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('PAVORA — Grafik Monitoring Suhu Inframerah', 48, 64);

  ctx.fillStyle = '#64748b';
  ctx.font = '500 14px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(
    `Sistem Pemantauan Suhu Realtime IoT • Sensor GY-906 (MLX90614) • Tanggal: ${dateStr}`,
    48,
    92
  );

  // Badge Info Rentang di Kanan Atas
  ctx.textAlign = 'right';
  ctx.fillStyle = '#d97706';
  ctx.font = 'bold 14px "JetBrains Mono", monospace';
  ctx.fillText(`SENSOR SUHU INFRAMERAH (°C)`, W - 48, 62);

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

  // Area Gambar Grafik Suhu
  const padL = 96;
  const padR = 64;
  const padT = 246;
  const panelH = 480;
  const pW = W - padL - padR;
  const pH = panelH - 70;
  const originX = padL;
  const originY = padT;

  const minV = Math.min(...tempValues, tempOptMin);
  const maxV = Math.max(...tempValues, tempOptMax);
  const span = Math.max(4.0, maxV - minV);
  const yMin = Math.max(0, Math.floor(minV - span * 0.22));
  const yMax = Math.ceil(maxV + span * 0.22);

  const getX = (idx: number) =>
    tempValues.length <= 1
      ? originX + pW / 2
      : originX + (idx / (tempValues.length - 1)) * pW;
  const getY = (v: number) => {
    const ratio = (v - yMin) / Math.max(0.0001, yMax - yMin);
    return originY + pH - Math.min(1, Math.max(0, ratio)) * pH;
  };

  // Zona Optimal Suhu
  const optTop = getY(tempOptMax);
  const optBot = getY(tempOptMin);
  ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
  ctx.fillRect(originX, optTop, pW, Math.max(2, optBot - optTop));

  ctx.save();
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.5)';
  ctx.beginPath();
  ctx.moveTo(originX, optTop);
  ctx.lineTo(originX + pW, optTop);
  ctx.moveTo(originX, optBot);
  ctx.lineTo(originX + pW, optBot);
  ctx.stroke();
  ctx.restore();

  // Grid Horizontal
  const ticks = [0, 0.25, 0.5, 0.75, 1];
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
    ctx.fillText(`${gVal.toFixed(0)} °C`, originX - 12, gy + 4);
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

  // Footer Watermark
  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    'PAVORA — Sistem Pemantauan Suhu Inframerah Realtime',
    W / 2,
    H - 28
  );
  ctx.textAlign = 'left';

  return canvas;
}

/**
 * 1. UNDUH GRAFIK FORMAT PNG
 */
export function exportSensorChartPng(options: ExportReportOptions): void {
  const canvas = renderSensorChartToCanvas(options);
  if (!canvas) return;

  const rangeObj =
    RANGE_OPTIONS.find((r) => r.id === options.rangePreset) || RANGE_OPTIONS[0];
  const rangeSlug = rangeObj.shortLabel.replace(/\s+/g, '-');
  const isoDate = new Date().toISOString().slice(0, 10);
  const fileName = `PAVORA_Grafik_Suhu_${rangeSlug}_${isoDate}.png`;

  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * 2. UNDUH DATA & LOG FORMAT EXCEL (.XLSX)
 */
export function exportSensorDataXlsx(options: ExportReportOptions): void {
  const { history, thresholds, rangePreset } = options;
  const dataPoints = filterReadingsByRange(history, rangePreset);
  if (dataPoints.length === 0) return;

  const tempValues = dataPoints.map((d) => d.temperatureC);
  const minTemp = Math.min(...tempValues);
  const maxTemp = Math.max(...tempValues);
  const avgTemp = tempValues.reduce((a, b) => a + b, 0) / tempValues.length;

  const wb = XLSX.utils.book_new();

  // SHEET 1: Data Riwayat Suhu
  const rows: any[][] = [];
  rows.push(['PAVORA — LAPORAN DATA MONITORING SUHU INFRAMERAH']);
  rows.push([`Dibuat pada: ${new Date().toLocaleString('id-ID')} WIB`]);
  rows.push([`Sensor: GY-906 (MLX90614) | Mikrokontroler: ESP32`]);
  rows.push([]); // baris kosong

  // Header Kolom Tabel
  rows.push([
    'No',
    'Waktu (WIB)',
    'Suhu Objek (°C)',
    'Status Kondisi',
    'Ambang Min (°C)',
    'Ambang Maks (°C)',
    'Batas Kritis (°C)',
    'Model Sensor'
  ]);

  dataPoints.forEach((r, idx) => {
    let status = 'Optimal';
    if (r.temperatureC >= thresholds.tempCritical) {
      status = 'Kritis (Bahaya)';
    } else if (r.temperatureC > thresholds.tempMaxOptimal) {
      status = 'Tinggi di Atas Normal';
    } else if (r.temperatureC < thresholds.tempMinOptimal) {
      status = 'Rendah di Bawah Normal';
    }

    rows.push([
      idx + 1,
      r.timestamp,
      Number(r.temperatureC.toFixed(2)),
      status,
      thresholds.tempMinOptimal,
      thresholds.tempMaxOptimal,
      thresholds.tempCritical,
      'GY-906 (MLX90614)'
    ]);
  });

  const wsData = XLSX.utils.aoa_to_sheet(rows);

  // Auto lebar kolom
  wsData['!cols'] = [
    { wch: 6 },
    { wch: 18 },
    { wch: 16 },
    { wch: 22 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 20 }
  ];

  XLSX.utils.book_append_sheet(wb, wsData, 'Data Riwayat Suhu');

  // SHEET 2: Ringkasan & Statistik
  const summaryRows: any[][] = [
    ['PAVORA — RINGKASAN STATISTIK MONITORING'],
    [],
    ['Parameter', 'Nilai', 'Satuan', 'Keterangan'],
    ['Total Titik Data Terbaca', dataPoints.length, 'Data', 'Jumlah rekaman sampel sensor'],
    ['Suhu Rata-rata', Number(avgTemp.toFixed(2)), '°C', 'Rerata selama periode ini'],
    ['Suhu Terendah (Minimum)', Number(minTemp.toFixed(2)), '°C', 'Titik suhu paling rendah'],
    ['Suhu Tertinggi (Maksimum)', Number(maxTemp.toFixed(2)), '°C', 'Titik suhu paling tinggi'],
    ['Ambang Batas Suhu Bawah', thresholds.tempMinOptimal, '°C', 'Batas bawah kondisi normal'],
    ['Ambang Batas Suhu Atas', thresholds.tempMaxOptimal, '°C', 'Batas atas kondisi normal'],
    ['Batas Kritis Suhu', thresholds.tempCritical, '°C', 'Pemicu alarm peringatan sirine'],
    ['Sensor Terpasang', 'GY-906 (MLX90614ESF)', '-', 'Termometer inframerah non-kontak I2C'],
    ['Mikrokontroler', 'ESP32 Dev Module', '-', 'Transmisi realtime Cloud Firestore'],
    ['Waktu Mulai Pengukuran', dataPoints[0]?.timestamp || '-', 'WIB', 'Titik awal rentang'],
    ['Waktu Akhir Pengukuran', dataPoints[dataPoints.length - 1]?.timestamp || '-', 'WIB', 'Titik akhir rentang']
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [
    { wch: 28 },
    { wch: 18 },
    { wch: 12 },
    { wch: 38 }
  ];

  XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan Statistik');

  // Buat file binary & unduh
  const rangeObj =
    RANGE_OPTIONS.find((r) => r.id === rangePreset) || RANGE_OPTIONS[0];
  const rangeSlug = rangeObj.shortLabel.replace(/\s+/g, '-');
  const isoDate = new Date().toISOString().slice(0, 10);
  const fileName = `PAVORA_Laporan_Suhu_${rangeSlug}_${isoDate}.xlsx`;

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  triggerBlobDownload(blob, fileName);
}

/**
 * 3. UNDUH DOKUMEN LAPORAN LENGKAP FORMAT MICROSOFT WORD (.DOC)
 * Menyertakan header resmi, metadata IoT, ringkasan statistik,
 * visual grafik kurva suhu tersemat (embedded image), dan tabel log lengkap.
 */
export function exportSensorReportDoc(options: ExportReportOptions): void {
  const { history, thresholds, rangePreset } = options;
  const dataPoints = filterReadingsByRange(history, rangePreset);
  if (dataPoints.length === 0) return;

  const tempValues = dataPoints.map((d) => d.temperatureC);
  const minTemp = Math.min(...tempValues);
  const maxTemp = Math.max(...tempValues);
  const avgTemp = tempValues.reduce((a, b) => a + b, 0) / tempValues.length;

  const rangeObj =
    RANGE_OPTIONS.find((r) => r.id === rangePreset) || RANGE_OPTIONS[0];
  const dateStr = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
  const timeStr = new Date().toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit'
  });

  // Render chart ke canvas lalu ambil data URL image base64 untuk disematkan di Word
  let chartImageHtml = '';
  const canvas = renderSensorChartToCanvas(options);
  if (canvas) {
    const dataUrl = canvas.toDataURL('image/png');
    chartImageHtml = `
      <div style="margin: 20px 0; text-align: center;">
        <h3 style="font-size: 14px; color: #0f172a; margin-bottom: 8px;">Visualisasi Kurva Fluktuasi Suhu Objek</h3>
        <img src="${dataUrl}" style="width: 100%; max-width: 650px; height: auto; border: 1px solid #cbd5e1; border-radius: 6px;" alt="Grafik Suhu PAVORA" />
        <p style="font-size: 10px; color: #64748b; margin-top: 4px; font-style: italic;">*Grafik dirender secara otomatis berdasarkan titik sampel sensor inframerah.</p>
      </div>
    `;
  }

  // Baris-baris tabel log riwayat suhu
  let tableRowsHtml = '';
  dataPoints.forEach((r, idx) => {
    let statusText = 'Optimal (Normal)';
    let statusBg = '#ecfdf5';
    let statusColor = '#065f46';

    if (r.temperatureC >= thresholds.tempCritical) {
      statusText = 'KRITIS (Bahaya)';
      statusBg = '#fef2f2';
      statusColor = '#991b1b';
    } else if (r.temperatureC > thresholds.tempMaxOptimal) {
      statusText = 'Tinggi';
      statusBg = '#fffbeb';
      statusColor = '#92400e';
    } else if (r.temperatureC < thresholds.tempMinOptimal) {
      statusText = 'Rendah';
      statusBg = '#f8fafc';
      statusColor = '#475569';
    }

    tableRowsHtml += `
      <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 1 ? 'background-color: #f8fafc;' : ''}">
        <td style="padding: 8px; text-align: center; font-size: 11px;">${idx + 1}</td>
        <td style="padding: 8px; font-size: 11px; font-family: monospace;">${r.timestamp} WIB</td>
        <td style="padding: 8px; text-align: center; font-size: 11px; font-weight: bold; font-family: monospace;">${r.temperatureC.toFixed(2)} °C</td>
        <td style="padding: 8px; text-align: center; font-size: 11px;">
          <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; background-color: ${statusBg}; color: ${statusColor}; font-weight: 600; font-size: 10px;">
            ${statusText}
          </span>
        </td>
        <td style="padding: 8px; text-align: center; font-size: 11px; color: #64748b;">${thresholds.tempMinOptimal} – ${thresholds.tempMaxOptimal} °C</td>
      </tr>
    `;
  });

  const docHtml = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <title>Laporan Monitoring Suhu PAVORA</title>
      <!--[if gte mso 9]>
      <xml>
        <w:WordDocument>
          <w:View>Print</w:View>
          <w:Zoom>100</w:Zoom>
          <w:DoNotOptimizeForBrowser/>
        </w:WordDocument>
      </xml>
      <![endif]-->
      <style>
        @page {
          size: A4 portrait;
          margin: 2cm 2cm 2cm 2cm;
          mso-page-orientation: portrait;
        }
        body {
          font-family: 'Calibri', 'Segoe UI', Arial, sans-serif;
          color: #0f172a;
          line-height: 1.5;
          margin: 0;
          padding: 0;
        }
        h1 {
          color: #b45309;
          font-size: 20px;
          margin-bottom: 2px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        h2 {
          color: #334155;
          font-size: 14px;
          margin-top: 0;
          font-weight: normal;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 12px 0;
        }
        th {
          background-color: #f1f5f9;
          color: #334155;
          font-weight: bold;
          padding: 8px;
          border-bottom: 2px solid #cbd5e1;
          font-size: 11px;
          text-align: left;
        }
        .stat-card {
          background-color: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 12px;
          margin: 14px 0;
        }
      </style>
    </head>
    <body>
      <!-- Header Dokumen -->
      <table style="width: 100%; border-bottom: 2px solid #ea580c; padding-bottom: 10px; margin-bottom: 16px;">
        <tr>
          <td style="vertical-align: middle;">
            <h1>PAVORA — LAPORAN RESMI MONITORING SUHU</h1>
            <h2>Sistem Pengukuran Temperatur Inframerah Non-Kontak Berbasis IoT & Cloud</h2>
          </td>
          <td style="text-align: right; vertical-align: middle; font-size: 11px; color: #64748b;">
            <strong>Waktu Ekspor:</strong><br />
            ${dateStr}<br />
            Pukul ${timeStr} WIB
          </td>
        </tr>
      </table>

      <!-- Informasi Sistem & Sensor -->
      <table style="width: 100%; margin-bottom: 16px; font-size: 11px;">
        <tr>
          <td style="width: 50%; padding: 6px; background-color: #f8fafc; border: 1px solid #e2e8f0; vertical-align: top;">
            <strong>INFORMASI PERANGKAT:</strong><br />
            • Mikrokontroler: ESP32 Dev Module<br />
            • Modul Sensor: GY-906 (Melexis MLX90614ESF)<br />
            • Antarmuka: I2C (Clock: GPIO 22, Data: GPIO 21)<br />
            • Komunikasi Cloud: Google Firebase Firestore (pvngblock)
          </td>
          <td style="width: 50%; padding: 6px; background-color: #f8fafc; border: 1px solid #e2e8f0; vertical-align: top;">
            <strong>PARAMETER PENGUKURAN:</strong><br />
            • Rentang Analisis: ${rangeObj.label}<br />
            • Total Data Sampel: ${dataPoints.length} Titik Pengukuran<br />
            • Waktu Awal: ${dataPoints[0]?.timestamp || '-'} WIB<br />
            • Waktu Akhir: ${dataPoints[dataPoints.length - 1]?.timestamp || '-'} WIB
          </td>
        </tr>
      </table>

      <!-- Ringkasan Statistik -->
      <div class="stat-card">
        <h3 style="font-size: 13px; color: #b45309; margin: 0 0 8px 0; text-transform: uppercase;">
          Ringkasan Statistik Suhu (°C)
        </h3>
        <table style="width: 100%; font-size: 11px; margin: 0;">
          <tr>
            <td style="width: 25%; padding: 4px;"><strong>Rata-rata:</strong> ${avgTemp.toFixed(2)} °C</td>
            <td style="width: 25%; padding: 4px;"><strong>Minimum:</strong> ${minTemp.toFixed(2)} °C</td>
            <td style="width: 25%; padding: 4px;"><strong>Maksimum:</strong> ${maxTemp.toFixed(2)} °C</td>
            <td style="width: 25%; padding: 4px;"><strong>Optimal:</strong> ${thresholds.tempMinOptimal} – ${thresholds.tempMaxOptimal} °C</td>
          </tr>
          <tr>
            <td colspan="4" style="padding: 4px; color: #64748b; font-size: 10.5px;">
              *Ambang Batas Kritis Darurat Pemicu Sirine Alarm: ≥ ${thresholds.tempCritical} °C
            </td>
          </tr>
        </table>
      </div>

      <!-- Gambar Grafik Visual -->
      ${chartImageHtml}

      <!-- Tabel Data Log Rinci -->
      <h3 style="font-size: 13px; color: #0f172a; margin: 24px 0 6px 0;">
        Tabel Riwayat Data Log Pengukuran Suhu
      </h3>
      <table>
        <thead>
          <tr>
            <th style="width: 8%; text-align: center;">No</th>
            <th style="width: 26%;">Waktu (WIB)</th>
            <th style="width: 22%; text-align: center;">Suhu Objek (°C)</th>
            <th style="width: 24%; text-align: center;">Status Kondisi</th>
            <th style="width: 20%; text-align: center;">Ambang Batas</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>

      <!-- Footer & Validasi -->
      <div style="margin-top: 30px; padding-top: 12px; border-top: 1px solid #cbd5e1; font-size: 10px; color: #94a3b8; text-align: center;">
        Dokumen ini dibuat otomatis oleh Sistem Monitoring Suhu IoT PAVORA.<br />
        Hak Cipta © ${new Date().getFullYear()} PAVORA — Rekayasa Instrumentasi & IoT.
      </div>
    </body>
    </html>
  `;

  const blob = new Blob(['\ufeff', docHtml], { type: 'application/msword;charset=utf-8' });
  const rangeSlug = rangeObj.shortLabel.replace(/\s+/g, '-');
  const isoDate = new Date().toISOString().slice(0, 10);
  const fileName = `PAVORA_Laporan_Suhu_${rangeSlug}_${isoDate}.doc`;

  triggerBlobDownload(blob, fileName);
}

/**
 * 4. UNDUH DATA RIWAYAT FORMAT CSV (.CSV)
 */
export function exportSensorDataCsv(options: ExportReportOptions): void {
  const { history, thresholds, rangePreset } = options;
  const dataPoints = filterReadingsByRange(history, rangePreset);
  if (dataPoints.length === 0) return;

  const header = ['No', 'Waktu_WIB', 'Suhu_Celcius', 'Status', 'Ambang_Min_C', 'Ambang_Maks_C', 'Batas_Kritis_C', 'Model_Sensor'];
  const lines: string[] = [header.join(',')];

  dataPoints.forEach((r, idx) => {
    let status = 'Optimal';
    if (r.temperatureC >= thresholds.tempCritical) {
      status = 'Kritis';
    } else if (r.temperatureC > thresholds.tempMaxOptimal) {
      status = 'Tinggi';
    } else if (r.temperatureC < thresholds.tempMinOptimal) {
      status = 'Rendah';
    }

    const row = [
      idx + 1,
      `"${r.timestamp}"`,
      r.temperatureC.toFixed(2),
      `"${status}"`,
      thresholds.tempMinOptimal,
      thresholds.tempMaxOptimal,
      thresholds.tempCritical,
      `"GY-906 (MLX90614)"`
    ];
    lines.push(row.join(','));
  });

  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

  const rangeObj =
    RANGE_OPTIONS.find((r) => r.id === rangePreset) || RANGE_OPTIONS[0];
  const rangeSlug = rangeObj.shortLabel.replace(/\s+/g, '-');
  const isoDate = new Date().toISOString().slice(0, 10);
  const fileName = `PAVORA_Data_Suhu_${rangeSlug}_${isoDate}.csv`;

  triggerBlobDownload(blob, fileName);
}

/**
 * 5. UNDUH DATA TERSTRUKTUR FORMAT JSON (.JSON)
 */
export function exportSensorDataJson(options: ExportReportOptions): void {
  const { history, thresholds, rangePreset } = options;
  const dataPoints = filterReadingsByRange(history, rangePreset);
  if (dataPoints.length === 0) return;

  const tempValues = dataPoints.map((d) => d.temperatureC);
  const minTemp = Math.min(...tempValues);
  const maxTemp = Math.max(...tempValues);
  const avgTemp = tempValues.reduce((a, b) => a + b, 0) / tempValues.length;

  const payload = {
    project: 'PAVORA',
    description: 'Laporan Telemetri Suhu Inframerah Realtime',
    sensor_model: 'GY-906 (MLX90614ESF)',
    exported_at: new Date().toISOString(),
    thresholds_config: thresholds,
    statistics: {
      total_data_points: dataPoints.length,
      average_temp_c: Number(avgTemp.toFixed(2)),
      min_temp_c: Number(minTemp.toFixed(2)),
      max_temp_c: Number(maxTemp.toFixed(2))
    },
    readings: dataPoints.map((r, idx) => ({
      index: idx + 1,
      id: r.id,
      timestamp_wib: r.timestamp,
      epoch_ms: r.epochMs,
      temperature_c: r.temperatureC,
      sensor: 'GY-906 (MLX90614)'
    }))
  };

  const jsonStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });

  const rangeObj =
    RANGE_OPTIONS.find((r) => r.id === rangePreset) || RANGE_OPTIONS[0];
  const rangeSlug = rangeObj.shortLabel.replace(/\s+/g, '-');
  const isoDate = new Date().toISOString().slice(0, 10);
  const fileName = `PAVORA_Data_Suhu_${rangeSlug}_${isoDate}.json`;

  triggerBlobDownload(blob, fileName);
}
