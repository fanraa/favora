import React, { useState, useEffect, useRef } from 'react';
import {
  Bluetooth,
  Wifi,
  Globe,
  Usb,
  Sliders,
  Copy,
  Check,
  Cpu,
  RefreshCw,
  PlugZap,
  Unplug,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  Lock,
  Loader2,
  Eye,
  EyeOff,
  Radio,
  Save,
  Download,
  ShieldCheck,
  Smartphone,
  Info,
  X,
  Thermometer,
  GraduationCap
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  ConnectionMethod,
  ConnectionSettings,
  ThresholdConfig
} from '../types/biogas';
import { ARDUINO_SKETCHES, INFO_TOPICS } from '../data/esp32Guides';
import { InfoButton, FloatingAnchorBox } from './InfoPopover';
import { PWAInstallCard } from './PWAInstallCard';
import {
  subscribeDeviceSettings,
  updateDeviceInterval,
  updateDeviceWifiAndAp,
  DeviceConfig
} from '../services/sensorFirestoreService';

const OWNER_EMAILS = [
  'irfanrizkiaditri@gmail.com',
  'irfanrizkiaditri01@gmail.com',
  'irfanrizkiaditricreator@gmail.com'
];

interface ConnectionPageProps {
  currentUser?: User | null;
  settings: ConnectionSettings;
  thresholds: ThresholdConfig;
  isConnected: boolean;
  statusMessage: string;
  alarmSoundEnabled: boolean;
  onToggleAlarmSound: () => void;
  onTestAlarmSound?: () => void;
  onUpdateSettings: (partial: Partial<ConnectionSettings>) => void;
  onUpdateThresholds: (partial: Partial<ThresholdConfig>) => void;
  onConnectBluetooth: () => void;
  onConnectUsbSerial: () => void;
  onStartPollingUrl: (method: 'wifi_local' | 'cloud_hotspot') => void;
  onDisconnect: () => void;
  onTestCloudPush: () => void;
  onBackToDashboard?: () => void;
  onLoginGoogle?: () => void;
}

interface MethodCardItem {
  id: ConnectionMethod;
  title: string;
  shortDesc: string;
  tagText: string;
  infoTopic: keyof typeof INFO_TOPICS;
  icon: React.ReactNode;
}

export const ConnectionPage: React.FC<ConnectionPageProps> = ({
  currentUser,
  settings,
  thresholds,
  isConnected,
  statusMessage,
  alarmSoundEnabled,
  onToggleAlarmSound,
  onTestAlarmSound,
  onUpdateSettings,
  onUpdateThresholds,
  onConnectBluetooth,
  onConnectUsbSerial,
  onStartPollingUrl,
  onDisconnect,
  onTestCloudPush,
  onBackToDashboard,
  onLoginGoogle
}) => {
  const emailLower = currentUser?.email ? currentUser.email.toLowerCase().trim() : '';
  const isStudent = emailLower.endsWith('@student.itera.ac.id') || emailLower.endsWith('@itera.ac.id');
  const isOwner = Boolean(
    emailLower && (
      isStudent ||
      OWNER_EMAILS.includes(emailLower)
    )
  );

  const [activeInterval, setActiveInterval] = useState<2 | 5 | 10>(5);
  const [deviceConfig, setDeviceConfig] = useState<DeviceConfig | null>(null);
  const [isSavingInterval, setIsSavingInterval] = useState(false);
  const [intervalFeedback, setIntervalFeedback] = useState<string | null>(null);
  const [showAlarmInfo, setShowAlarmInfo] = useState(false);
  const alarmInfoBtnRef = useRef<HTMLButtonElement | null>(null);

  // Berlangganan konfigurasi interval remote
  useEffect(() => {
    if (!isOwner) return;
    const unsub = subscribeDeviceSettings((cfg) => {
      setDeviceConfig(cfg);
      setActiveInterval(cfg.send_interval_sec);
    });
    return () => unsub();
  }, [isOwner]);

  const handleSelectInterval = async (sec: 2 | 5 | 10) => {
    if (!isOwner || !currentUser?.email) return;
    setIsSavingInterval(true);
    setIntervalFeedback(null);
    try {
      await updateDeviceInterval(sec, currentUser.email);
      setActiveInterval(sec);
      setIntervalFeedback(`Berhasil disimpan! ESP32 akan menyesuaikan interval ke ${sec} detik.`);
      setTimeout(() => setIntervalFeedback(null), 4000);
    } catch (err: any) {
      setIntervalFeedback(`Gagal menyimpan interval: ${err?.message || 'Periksa aturan izin.'}`);
    } finally {
      setIsSavingInterval(false);
    }
  };

  // Kredensial Wi-Fi
  const [wifiSsid, setWifiSsid] = useState('FanraRA');
  const [wifiPass, setWifiPass] = useState('#I47r32a6');
  const [apSsid, setApSsid] = useState('FAVORA-ESP32-AP');
  const [apPass, setApPass] = useState('12345678');
  const [showWifiPass, setShowWifiPass] = useState(false);
  const [showApPass, setShowApPass] = useState(false);
  const [isSavingCredentials, setIsSavingCredentials] = useState(false);
  const [credentialsFeedback, setCredentialsFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    if (deviceConfig) {
      if (deviceConfig.wifi_ssid) setWifiSsid(deviceConfig.wifi_ssid);
      if (deviceConfig.wifi_pass) setWifiPass(deviceConfig.wifi_pass);
      if (deviceConfig.ap_ssid) setApSsid(deviceConfig.ap_ssid);
      if (deviceConfig.ap_pass) setApPass(deviceConfig.ap_pass);
    }
  }, [deviceConfig]);

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner || !currentUser?.email) return;
    if (apPass.length < 8) {
      setCredentialsFeedback({
        type: 'error',
        message: 'Password Hotspot AP harus minimal 8 karakter.'
      });
      return;
    }

    setIsSavingCredentials(true);
    setCredentialsFeedback(null);
    try {
      await updateDeviceWifiAndAp(
        {
          wifi_ssid: wifiSsid.trim(),
          wifi_pass: wifiPass,
          ap_ssid: apSsid.trim(),
          ap_pass: apPass
        },
        currentUser.email
      );
      setCredentialsFeedback({
        type: 'success',
        message: 'Kredensial berhasil disimpan ke Cloud! ESP32 akan sinkron otomatis.'
      });
      setTimeout(() => setCredentialsFeedback(null), 5000);
    } catch (err: any) {
      setCredentialsFeedback({
        type: 'error',
        message: `Gagal menyimpan kredensial: ${err?.message || 'Periksa koneksi.'}`
      });
    } finally {
      setIsSavingCredentials(false);
    }
  };

  const [copiedCode, setCopiedCode] = useState(false);

  const methods: MethodCardItem[] = [
    {
      id: 'cloud_hotspot',
      title: 'Cloud Firestore',
      shortDesc: 'Monitoring online realtime via Firebase Cloud',
      tagText: 'Rekomendasi',
      infoTopic: 'method_cloud_hotspot',
      icon: <Globe className="w-4 h-4 text-amber-600" />
    },
    {
      id: 'bluetooth',
      title: 'Bluetooth BLE',
      shortDesc: 'Koneksi nirkabel langsung tanpa kuota / router',
      tagText: 'Jarak Dekat',
      infoTopic: 'method_bluetooth',
      icon: <Bluetooth className="w-4 h-4 text-amber-600" />
    },
    {
      id: 'wifi_local',
      title: 'Wi-Fi Lokal ESP32',
      shortDesc: 'Hotspot mandiri mikrokontroler (192.168.4.1)',
      tagText: 'Offline',
      infoTopic: 'method_wifi_local',
      icon: <Wifi className="w-4 h-4 text-amber-600" />
    },
    {
      id: 'usb_serial',
      title: 'Kabel USB Serial',
      shortDesc: 'Kabel data langsung ke Laptop via browser',
      tagText: 'Kabel',
      infoTopic: 'method_usb_serial',
      icon: <Usb className="w-4 h-4 text-amber-600" />
    },
    {
      id: 'simulation',
      title: 'Mode Simulasi',
      shortDesc: 'Uji visual indikator & grafik tanpa alat fisik',
      tagText: 'Demo',
      infoTopic: 'method_simulation',
      icon: <Sliders className="w-4 h-4 text-amber-600" />
    }
  ];

  const activeSketch =
    settings.activeMethod !== 'simulation'
      ? ARDUINO_SKETCHES[settings.activeMethod]
      : null;

  const handleCopyCode = async () => {
    if (!activeSketch) return;
    try {
      await navigator.clipboard.writeText(activeSketch.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // ignore
    }
  };

  const renderAudioAlarmCard = () => (
    <div className="bg-white/65 sm:bg-white/70 backdrop-blur-md border border-white/80 rounded-2xl p-4 sm:p-5 flex items-center justify-between gap-3 shadow-xs">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onToggleAlarmSound}
          className={`p-2.5 rounded-xl border transition-colors cursor-pointer shrink-0 ${
            alarmSoundEnabled
              ? 'bg-amber-500/15 text-amber-800 border-amber-300/80'
              : 'bg-white/60 text-slate-400 border-white/80'
          }`}
          title={alarmSoundEnabled ? 'Alarm Suara Aktif' : 'Alarm Suara Senyap'}
        >
          {alarmSoundEnabled ? (
            <Volume2 className="w-5 h-5 text-amber-600" />
          ) : (
            <VolumeX className="w-5 h-5 text-slate-400" />
          )}
        </button>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h4 className="text-xs font-bold text-slate-900 truncate">
              Suara Alarm Peringatan Suhu
            </h4>
            <button
              ref={alarmInfoBtnRef}
              type="button"
              onClick={() => setShowAlarmInfo((prev) => !prev)}
              title="Informasi Alarm"
              className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[11px] text-slate-500 truncate">
            {alarmSoundEnabled
              ? `Aktif • Berbunyi jika suhu ≥ ${thresholds.tempCritical}°C`
              : 'Alarm suara saat ini dimatikan (Senyap)'}
          </p>
        </div>
      </div>

      <FloatingAnchorBox
        isOpen={showAlarmInfo}
        onClose={() => setShowAlarmInfo(false)}
        anchorEl={alarmInfoBtnRef.current}
        maxWidth={275}
      >
        <div className="space-y-2 text-xs text-slate-800">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 font-bold">
            <span>Alarm Suhu Kritis</span>
            <button
              type="button"
              onClick={() => setShowAlarmInfo(false)}
              className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            Menghasilkan nada sirine darurat otomatis melalui browser jika pembacaan suhu melewati ambang batas kritis (≥{thresholds.tempCritical}°C).
          </p>
        </div>
      </FloatingAnchorBox>

      <div className="flex items-center gap-2 shrink-0">
        {onTestAlarmSound && (
          <button
            type="button"
            onClick={onTestAlarmSound}
            title="Uji coba nada suara alarm"
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white/75 hover:bg-white text-slate-800 border border-white/85 shadow-2xs transition-colors cursor-pointer"
          >
            Uji Suara
          </button>
        )}
      </div>
    </div>
  );

  // Jika belum login dengan akun @student.itera.ac.id atau admin
  // Hanya tampilkan Install PWA dan Alarm Peringatan Suhu saja
  if (!isOwner) {
    return (
      <div className="space-y-5 text-slate-800">
        {/* 1. Pasang Aplikasi ke Layar Utama */}
        <PWAInstallCard />

        {/* 2. Suara Alarm Peringatan Suhu */}
        {renderAudioAlarmCard()}
      </div>
    );
  }

  // Tampilan Penuh untuk Mahasiswa ITERA & Administrator
  return (
    <div className="space-y-5 text-slate-800">
      {/* Kartu Panduan PWA di Bagian Paling Atas */}
      <PWAInstallCard />

      {/* Grid Utama Dua Kolom (Glassmorphic Theme) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Kolom Kiri: Pilihan Metode Koneksi & Panel Parameter */}
        <section className="lg:col-span-6 bg-white/65 sm:bg-white/70 backdrop-blur-md border border-white/80 rounded-2xl p-5 space-y-5 shadow-xs">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                Pilih Metode Sambungan ESP32
              </h2>
              {isConnected && (
                <button
                  type="button"
                  onClick={onDisconnect}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-600 bg-rose-50/80 hover:bg-rose-100 rounded-lg border border-rose-200/80 transition-colors cursor-pointer"
                >
                  <Unplug className="w-3.5 h-3.5" />
                  <span>Putuskan</span>
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Pilih jalur transmisi data sensor suhu dari modul mikrokontroler.
            </p>
          </div>

          {/* Kartu Metode */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {methods.map((m) => {
              const isActive = settings.activeMethod === m.id;
              return (
                <div
                  key={m.id}
                  onClick={() => onUpdateSettings({ activeMethod: m.id })}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    isActive
                      ? 'border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/25 shadow-xs'
                      : 'border-white/80 bg-white/50 backdrop-blur-xs hover:border-amber-300 hover:bg-white/70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 rounded-lg bg-white/85 border border-white/90 shadow-2xs">
                        {m.icon}
                      </span>
                      <span className="font-semibold text-xs text-slate-900">
                        {m.title}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-600 bg-white/80 px-1.5 py-0.5 rounded border border-white/90">
                      {m.tagText}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-2 leading-relaxed">
                    {m.shortDesc}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Panel Kontrol Khusus Metode yang Aktif */}
          <div className="pt-4 border-t border-slate-200/60 space-y-4">
            {/* 1. Bluetooth BLE */}
            {settings.activeMethod === 'bluetooth' && (
              <div className="space-y-3 bg-white/55 backdrop-blur-xs p-3.5 rounded-xl border border-white/80">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nama Perangkat BLE (ESP32)
                  </label>
                  <input
                    type="text"
                    value={settings.bleDeviceName}
                    onChange={(e) =>
                      onUpdateSettings({ bleDeviceName: e.target.value })
                    }
                    className="w-full px-3 py-1.5 text-xs font-mono bg-white/80 border border-white/90 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>
                <button
                  type="button"
                  onClick={onConnectBluetooth}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors cursor-pointer shadow-xs"
                >
                  <Bluetooth className="w-4 h-4" />
                  <span>Pindai & Sambungkan Bluetooth</span>
                </button>
              </div>
            )}

            {/* 2. Wi-Fi Lokal */}
            {settings.activeMethod === 'wifi_local' && (
              <div className="space-y-3 bg-white/55 backdrop-blur-xs p-3.5 rounded-xl border border-white/80">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    URL Endpoint Lokal
                  </label>
                  <input
                    type="text"
                    value={settings.localIpUrl}
                    onChange={(e) =>
                      onUpdateSettings({ localIpUrl: e.target.value })
                    }
                    className="w-full px-3 py-1.5 text-xs font-mono bg-white/80 border border-white/90 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onStartPollingUrl('wifi_local')}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors cursor-pointer shadow-xs"
                >
                  <Wifi className="w-4 h-4" />
                  <span>Mulai Pengambilan Data Lokal</span>
                </button>
              </div>
            )}

            {/* 3. Firebase Cloud Firestore */}
            {settings.activeMethod === 'cloud_hotspot' && (
              <div className="space-y-3 bg-white/55 backdrop-blur-xs p-3.5 rounded-xl border border-white/80">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Data pembacaan suhu tersinkronisasi otomatis via Google Cloud Firestore secara realtime.
                </p>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onStartPollingUrl('cloud_hotspot')}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors cursor-pointer shadow-xs"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Sinkronkan Firestore</span>
                  </button>

                  <button
                    type="button"
                    onClick={onTestCloudPush}
                    title="Kirim 1 paket data suhu valid ke Firestore untuk menguji integrasi"
                    className="px-3.5 py-2 text-xs font-semibold text-amber-900 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-300/80 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Uji Kirim Sensor
                  </button>
                </div>
              </div>
            )}

            {/* 4. USB Serial */}
            {settings.activeMethod === 'usb_serial' && (
              <div className="space-y-3 bg-white/55 backdrop-blur-xs p-3.5 rounded-xl border border-white/80">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Baud Rate Serial
                  </label>
                  <select
                    value={settings.serialBaudRate}
                    onChange={(e) =>
                      onUpdateSettings({
                        serialBaudRate: parseInt(e.target.value, 10)
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs font-mono bg-white/80 border border-white/90 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                  >
                    <option value={115200}>115200 bps (Standar ESP32)</option>
                    <option value={9600}>9600 bps</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={onConnectUsbSerial}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors cursor-pointer shadow-xs"
                >
                  <Usb className="w-4 h-4" />
                  <span>Pilih Port USB ESP32</span>
                </button>
              </div>
            )}

            {/* 5. Simulation */}
            {settings.activeMethod === 'simulation' && (
              <div className="bg-white/55 backdrop-blur-xs p-3.5 rounded-xl border border-white/80">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Mode simulasi suhu sedang aktif. Anda dapat menguji perubahan suhu, grafik, dan alarm tanpa alat fisik.
                </p>
              </div>
            )}

            {/* Pinout Reference Sensor Suhu Inframerah GY-906 */}
            <div className="pt-3 border-t border-slate-200/60 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <Cpu className="w-4 h-4 text-amber-600" />
                  <span>Pinout Sensor Suhu Inframerah GY-906</span>
                </div>
                <InfoButton topicId="wiring_pinout" />
              </div>

              <div className="bg-white/55 backdrop-blur-xs border border-white/80 rounded-xl p-3.5 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700 flex items-center gap-1">
                    <Thermometer className="w-3.5 h-3.5 text-amber-600" />
                    <span>GY-906 (MLX90614ESF Non-Kontak)</span>
                  </span>
                  <span className="font-mono text-[11px] font-semibold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded border border-amber-200">
                    I2C: 0x5A
                  </span>
                </div>
                <p className="text-[11px] text-slate-700 font-mono">
                  VIN: 3.3V · GND: GND · SCL: GPIO 22 · SDA: GPIO 21
                </p>
                <p className="text-[10px] text-slate-500">
                  * Sensor termometer inframerah non-kontak mengukur suhu objek tanpa sentuhan fisik.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Kolom Kanan: Pengaturan Thresholds Suhu, Audio Alarm, dan Kode Arduino */}
        <section className="lg:col-span-6 space-y-5">
          {/* 1. Pengaturan Ambang Batas Suhu (Thresholds) */}
          <div className="bg-white/65 sm:bg-white/70 backdrop-blur-md border border-white/80 rounded-2xl p-5 space-y-3.5 shadow-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Batas Rentang Suhu (°C)
                </h3>
              </div>
              <span className="text-[10px] font-mono text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-full border border-amber-200 font-semibold">
                Sinkron Realtime
              </span>
            </div>

            <p className="text-xs text-slate-500">
              Atur nilai suhu optimal dan suhu batas kritis. Notifikasi alarm akan menyala jika suhu melewati ambang batas.
            </p>

            <div className="grid grid-cols-3 gap-3 pt-1">
              {/* Suhu Min Optimal */}
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-600">
                  Suhu Min (°C)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={thresholds.tempMinOptimal}
                  onChange={(e) =>
                    onUpdateThresholds({
                      tempMinOptimal: parseFloat(e.target.value) || 28
                    })
                  }
                  className="w-full px-2.5 py-1.5 font-mono text-xs bg-white/80 border border-white/90 rounded-lg text-slate-900 focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none"
                />
                <span className="text-[10px] text-slate-400 block">Batas bawah normal</span>
              </div>

              {/* Suhu Maks Optimal */}
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-600">
                  Suhu Maks (°C)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={thresholds.tempMaxOptimal}
                  onChange={(e) =>
                    onUpdateThresholds({
                      tempMaxOptimal: parseFloat(e.target.value) || 40
                    })
                  }
                  className="w-full px-2.5 py-1.5 font-mono text-xs bg-white/80 border border-white/90 rounded-lg text-slate-900 focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none"
                />
                <span className="text-[10px] text-slate-400 block">Batas atas normal</span>
              </div>

              {/* Suhu Kritis */}
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-rose-700">
                  Suhu Kritis (°C)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={thresholds.tempCritical}
                  onChange={(e) =>
                    onUpdateThresholds({
                      tempCritical: parseFloat(e.target.value) || 45
                    })
                  }
                  className="w-full px-2.5 py-1.5 font-mono text-xs bg-rose-50/80 border border-rose-200/90 rounded-lg text-rose-900 focus:bg-white focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus:outline-none font-semibold"
                />
                <span className="text-[10px] text-rose-500 block">Pemicu alarm sirine</span>
              </div>
            </div>
          </div>

          {/* 2. Audio Alarm Peringatan Suhu Kritis */}
          {renderAudioAlarmCard()}


          {/* 3. Kode Arduino ESP32 untuk Sensor Suhu */}
          {activeSketch && (
            <div className="bg-white/65 sm:bg-white/70 backdrop-blur-md border border-white/80 rounded-2xl p-5 space-y-3.5 shadow-xs overflow-hidden">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                    {activeSketch.title}
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                    {activeSketch.description}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <a
                    href="/FAVORA_ESP32_Firestore.ino"
                    download="FAVORA_ESP32_Firestore.ino"
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white/75 hover:bg-white border border-white/85 shadow-2xs rounded-lg transition-colors cursor-pointer"
                    title="Unduh file .ino lengkap siap upload ke ESP32"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-600" />
                    <span className="hidden sm:inline">Unduh .ino</span>
                  </a>

                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white/75 hover:bg-white border border-white/85 shadow-2xs rounded-lg transition-colors cursor-pointer"
                  >
                    {copiedCode ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700 font-semibold">Tersalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Kode</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="relative">
                <pre className="bg-slate-950/90 backdrop-blur-xs text-slate-200 p-3.5 rounded-xl text-xs font-mono overflow-x-auto max-h-60 leading-relaxed border border-slate-800 shadow-inner">
                  <code>{activeSketch.code}</code>
                </pre>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
