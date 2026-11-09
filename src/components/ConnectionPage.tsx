import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Globe,
  Sliders,
  RefreshCw,
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
  Smartphone,
  Info,
  X,
  Cpu,
  Check,
  Copy,
  Wifi,
  ChevronDown,
  ChevronUp,
  History,
  Trash2
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  ConnectionSettings,
  ThresholdConfig
} from '../types/biogas';
import { ARDUINO_SKETCHES } from '../data/esp32Guides';
import { InfoButton, FloatingAnchorBox } from './InfoPopover';
import { usePWAInstall } from '../hooks/usePWAInstall';
import {
  subscribeDeviceSettings,
  updateDeviceInterval,
  updateDeviceWifiAndAp,
  DeviceConfig
} from '../services/sensorFirestoreService';

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

export const ConnectionPage: React.FC<ConnectionPageProps> = ({
  currentUser,
  settings,
  thresholds,
  isConnected,
  alarmSoundEnabled,
  onToggleAlarmSound,
  onTestAlarmSound,
  onUpdateSettings,
  onUpdateThresholds,
  onStartPollingUrl,
  onDisconnect,
  onTestCloudPush,
  onLoginGoogle
}) => {
  const { isInstalled, isIOS, install } = usePWAInstall();
  const [showPwaGuide, setShowPwaGuide] = useState(false);
  const [showPwaInfo, setShowPwaInfo] = useState(false);
  const [installFeedback, setInstallFeedback] = useState<string | null>(null);
  const pwaInfoBtnRef = useRef<HTMLButtonElement | null>(null);

  const handleInstallPwa = async () => {
    setInstallFeedback(null);
    const result = await install();
    if (result === 'accepted') {
      setInstallFeedback('Aplikasi PAVORA berhasil dipasang ke Layar Utama!');
      setTimeout(() => setInstallFeedback(null), 3500);
      return;
    }
    if (result === 'dismissed') {
      return;
    }
    setShowPwaGuide(true);
  };

  const [activeInterval, setActiveInterval] = useState<2 | 5 | 10>(5);
  const [, setDeviceConfig] = useState<DeviceConfig | null>(null);
  const [isSavingInterval, setIsSavingInterval] = useState(false);
  const [intervalFeedback, setIntervalFeedback] = useState<string | null>(null);
  const [showAlarmInfo, setShowAlarmInfo] = useState(false);
  const alarmInfoBtnRef = useRef<HTMLButtonElement | null>(null);

  const handleSelectInterval = async (sec: 2 | 5 | 10) => {
    if (!currentUser) {
      setIntervalFeedback('Login dengan Google dulu untuk mengubah interval.');
      onLoginGoogle?.();
      return;
    }
    setIsSavingInterval(true);
    setIntervalFeedback(null);
    try {
      await updateDeviceInterval(sec, currentUser.email);
      setActiveInterval(sec);
      setIntervalFeedback(`Interval tersimpan: ${sec} detik`);
      setTimeout(() => setIntervalFeedback(null), 3500);
    } catch (err: any) {
      setIntervalFeedback(`Gagal: ${err?.message || 'Periksa koneksi.'}`);
    } finally {
      setIsSavingInterval(false);
    }
  };

  const isUserTypingWifiRef = useRef(false);

  // Kredensial Wi-Fi dengan fallback localStorage & remote Firestore
  const [wifiSsid, setWifiSsid] = useState(() => {
    try {
      return localStorage.getItem('favora_wifi_ssid') || 'FanraRA';
    } catch {
      return 'FanraRA';
    }
  });
  const [wifiPass, setWifiPass] = useState(() => {
    try {
      return localStorage.getItem('favora_wifi_pass') || '#I47r32a6';
    } catch {
      return '#I47r32a6';
    }
  });
  const [apSsid, setApSsid] = useState('FAVORA-ESP32-AP');
  const [apPass, setApPass] = useState('12345678');
  const [showWifiPass, setShowWifiPass] = useState(false);
  const [showApPass, setShowApPass] = useState(false);
  const [showApConfig, setShowApConfig] = useState(false);
  const [isSavingCredentials, setIsSavingCredentials] = useState(false);
  const [credentialsFeedback, setCredentialsFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Riwayat Jaringan Wi-Fi yang Tersimpan
  interface SavedWifiEntry {
    ssid: string;
    pass: string;
  }

  const [wifiHistory, setWifiHistory] = useState<SavedWifiEntry[]>(() => {
    try {
      const stored = localStorage.getItem('favora_wifi_history');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return [
      { ssid: 'tselhome-9EB8', pass: 'parXY03;jl' },
      { ssid: 'FanraRA', pass: '#I47r32a6' }
    ];
  });

  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
  const historyDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showHistoryDropdown) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (
        historyDropdownRef.current &&
        !historyDropdownRef.current.contains(e.target as Node)
      ) {
        setShowHistoryDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showHistoryDropdown]);

  const handleDeleteWifiHistory = (ssidToDelete: string) => {
    setWifiHistory((prev) => {
      const next = prev.filter((item) => item.ssid !== ssidToDelete);
      try {
        localStorage.setItem('favora_wifi_history', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Berlangganan konfigurasi interval & Wi-Fi remote dari Firestore
  useEffect(() => {
    const unsub = subscribeDeviceSettings((cfg) => {
      setDeviceConfig(cfg);
      if (cfg.send_interval_sec) setActiveInterval(cfg.send_interval_sec);
      if (!isUserTypingWifiRef.current) {
        if (cfg.wifi_ssid) {
          setWifiSsid(cfg.wifi_ssid);
          try { localStorage.setItem('favora_wifi_ssid', cfg.wifi_ssid); } catch {}
        }
        if (cfg.wifi_pass) {
          setWifiPass(cfg.wifi_pass);
          try { localStorage.setItem('favora_wifi_pass', cfg.wifi_pass); } catch {}
        }
        if (cfg.ap_ssid) setApSsid(cfg.ap_ssid);
        if (cfg.ap_pass) setApPass(cfg.ap_pass);
      }
    });
    return () => unsub();
  }, []);

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wifiSsid.trim()) {
      setCredentialsFeedback({
        type: 'error',
        message: 'Nama Wi-Fi Router (SSID) tidak boleh kosong.'
      });
      return;
    }
    if (apPass.length < 8) {
      setCredentialsFeedback({
        type: 'error',
        message: 'Password Hotspot AP harus minimal 8 karakter.'
      });
      return;
    }
    if (!currentUser) {
      setCredentialsFeedback({
        type: 'error',
        message: 'Login dengan Google dulu untuk menyimpan kredensial Wi-Fi.'
      });
      onLoginGoogle?.();
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
          ap_pass: apPass,
          send_interval_sec: activeInterval
        },
        currentUser.email
      );
      try {
        localStorage.setItem('favora_wifi_ssid', wifiSsid.trim());
        localStorage.setItem('favora_wifi_pass', wifiPass);
      } catch {
        // ignore
      }

      // Perbarui riwayat Wi-Fi tersimpan
      setWifiHistory((prev) => {
        const filtered = prev.filter((item) => item.ssid !== wifiSsid.trim());
        const updated = [{ ssid: wifiSsid.trim(), pass: wifiPass }, ...filtered].slice(0, 10);
        try {
          localStorage.setItem('favora_wifi_history', JSON.stringify(updated));
        } catch {
          // ignore
        }
        return updated;
      });

      isUserTypingWifiRef.current = false;
      setCredentialsFeedback({
        type: 'success',
        message: `Wi-Fi "${wifiSsid.trim()}" tersimpan ke Firestore! ESP32 akan beralih dalam ~15 detik.`
      });
      setTimeout(() => setCredentialsFeedback(null), 5000);
    } catch (err: any) {
      setCredentialsFeedback({
        type: 'error',
        message: `Gagal menyimpan: ${err?.message || 'Periksa koneksi.'}`
      });
    } finally {
      setIsSavingCredentials(false);
    }
  };

  const [copiedCode, setCopiedCode] = useState(false);

  const activeSketch =
    settings.activeMethod !== 'simulation'
      ? ARDUINO_SKETCHES.cloud_hotspot
      : null;

  // Kode sketch dinamis yang otomatis mencantumkan nama SSID & password Wi-Fi yang diatur user
  const dynamicFirestoreCode = useMemo(() => {
    const raw = ARDUINO_SKETCHES.cloud_hotspot.code;
    const safeSsid = wifiSsid.replace(/"/g, '\\"');
    const safePass = wifiPass.replace(/"/g, '\\"');
    return raw
      .replace('const char* ssid = "FanraRA";', `const char* ssid = "${safeSsid}";`)
      .replace('const char* password = "#I47r32a6";', `const char* password = "${safePass}";`)
      .replace('delay(5000);', `delay(${activeInterval * 1000}); // Interval pengiriman ${activeInterval} detik`);
  }, [wifiSsid, wifiPass, activeInterval]);

  const activeCodeToDisplay =
    settings.activeMethod === 'cloud_hotspot'
      ? dynamicFirestoreCode
      : (activeSketch?.code || '');

  const handleCopyCode = async () => {
    if (!activeCodeToDisplay) return;
    try {
      await navigator.clipboard.writeText(activeCodeToDisplay);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleDownloadIno = () => {
    if (!activeCodeToDisplay) return;
    const blob = new Blob([activeCodeToDisplay], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'FAVORA_ESP32_Firestore.ino';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Kartu Ringkas Terpadu: Pasang PWA & Suara Alarm (kotak rounded-md, ikon tanpa box)
  const renderUnifiedUtilityCard = () => (
    <div className="bg-white/65 sm:bg-white/70 backdrop-blur-md border border-white/80 rounded-md p-4 sm:p-5 shadow-xs transition-all space-y-3.5">
      {/* Baris 1: Pasang Aplikasi PWA */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Smartphone className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight whitespace-nowrap truncate">
                Pasang ke Layar Utama
              </h3>
              <button
                ref={pwaInfoBtnRef}
                type="button"
                onClick={() => setShowPwaInfo((prev) => !prev)}
                title="Informasi Pemasangan Aplikasi"
                className={`transition-colors cursor-pointer p-0.5 shrink-0 rounded ${
                  showPwaInfo ? 'text-amber-600' : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                <Info className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500 truncate mt-0.5">
              Akses cepat layar penuh tanpa bilah pencarian browser di HP
            </p>
          </div>
        </div>

        {/* Floating Anchor Box Info PWA */}
        <FloatingAnchorBox
          isOpen={showPwaInfo}
          onClose={() => setShowPwaInfo(false)}
          anchorEl={pwaInfoBtnRef.current}
          maxWidth={285}
        >
          <div className="space-y-2 text-xs text-slate-800">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 font-bold">
              <span>Pasang ke Layar Utama</span>
              <button
                type="button"
                onClick={() => setShowPwaInfo(false)}
                className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer rounded hover:bg-slate-100"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-1.5 text-[11px] text-slate-600 leading-relaxed">
              <p>
                Buka PAVORA dalam mode layar penuh (standalone) seperti aplikasi asli.
              </p>
              <p>
                <strong className="text-slate-800">Android:</strong> Tekan tombol <em>Pasang</em> lalu konfirmasi <strong>Instal</strong>.
              </p>
              <p>
                <strong className="text-slate-800">iPhone:</strong> Di Safari tekan tombol <strong>Share</strong> &gt; <strong>Tambah ke Layar Utama</strong>.
              </p>
            </div>
          </div>
        </FloatingAnchorBox>

        <div className="shrink-0 flex items-center justify-end">
          {isInstalled ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">
              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Terpasang</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={handleInstallPwa}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-all cursor-pointer active:scale-95 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>Pasang</span>
            </button>
          )}
        </div>
      </div>

      {installFeedback && (
        <div className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-1.5 font-mono">
          {installFeedback}
        </div>
      )}

      {/* Garis Pemisah Tipis */}
      <div className="border-t border-slate-200/60" />

      {/* Baris 2: Suara Alarm Peringatan Suhu */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onToggleAlarmSound}
            className="p-1 text-slate-700 hover:text-amber-600 transition-colors cursor-pointer shrink-0"
            title={alarmSoundEnabled ? 'Alarm Suara Aktif (Klik untuk Matikan)' : 'Alarm Suara Senyap (Klik untuk Hidupkan)'}
          >
            {alarmSoundEnabled ? (
              <Volume2 className="w-5 h-5 text-amber-600 shrink-0" />
            ) : (
              <VolumeX className="w-5 h-5 text-slate-400 shrink-0" />
            )}
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight whitespace-nowrap truncate">
                Suara Alarm Peringatan Suhu
              </h4>
              <button
                ref={alarmInfoBtnRef}
                type="button"
                onClick={() => setShowAlarmInfo((prev) => !prev)}
                title="Informasi Alarm"
                className={`p-0.5 rounded cursor-pointer transition-colors shrink-0 ${
                  showAlarmInfo ? 'text-amber-600' : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                <Info className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500 truncate mt-0.5">
              {alarmSoundEnabled
                ? `Aktif • Sirine berbunyi jika suhu ≥ ${thresholds.tempCritical}°C`
                : 'Alarm suara saat ini dimatikan (Mode Senyap)'}
            </p>
          </div>
        </div>

        {/* Floating Anchor Box Info Alarm */}
        <FloatingAnchorBox
          isOpen={showAlarmInfo}
          onClose={() => setShowAlarmInfo(false)}
          anchorEl={alarmInfoBtnRef.current}
          maxWidth={280}
        >
          <div className="space-y-2 text-xs text-slate-800">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 font-bold">
              <span>Alarm Suhu Kritis</span>
              <button
                type="button"
                onClick={() => setShowAlarmInfo(false)}
                className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer rounded hover:bg-slate-100"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Menghasilkan nada sirine darurat otomatis melalui browser jika pembacaan suhu melewati ambang batas kritis (≥{thresholds.tempCritical}°C).
            </p>
          </div>
        </FloatingAnchorBox>

        <div className="shrink-0 flex items-center justify-end">
          {onTestAlarmSound && (
            <button
              type="button"
              onClick={onTestAlarmSound}
              title="Uji coba nada sirine alarm"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 border border-amber-300/70 transition-all cursor-pointer whitespace-nowrap active:scale-95"
            >
              <Volume2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Uji Suara</span>
            </button>
          )}
        </div>
      </div>

      {/* Dialog Panduan Manual PWA (Safari iOS dll) */}
      {showPwaGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
          onClick={() => setShowPwaGuide(false)}
        >
          <div
            className="w-full max-w-sm rounded-md bg-white border border-slate-200 p-5 shadow-2xl text-slate-800 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Pasang Aplikasi PAVORA</h4>
                <p className="text-[11px] text-slate-500">Monitoring Sensor Suhu IoT</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPwaGuide(false)}
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
                <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-2 text-[11px]">
                  <div className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold shrink-0 text-[10px]">1</span>
                    <span>Tekan tombol <strong>Bagikan (Share)</strong> di bilah navigasi bawah Safari.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold shrink-0 text-[10px]">2</span>
                    <span>Pilih menu <strong>&quot;Tambah ke Layar Utama&quot;</strong> (Add to Home Screen).</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold shrink-0 text-[10px]">3</span>
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
                      setShowPwaGuide(false);
                      setInstallFeedback('Aplikasi PAVORA berhasil dipasang!');
                    }
                  }}
                  className="w-full py-2.5 text-xs font-semibold rounded-md bg-amber-600 text-white hover:bg-amber-700 transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs whitespace-nowrap"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  <span>Pasang Sekarang ke HP</span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowPwaGuide(false)}
              className="w-full py-2 text-xs font-semibold rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5 text-slate-800">
      {/* 1. Kartu Ringkas Terpadu: Pasang PWA & Suara Alarm */}
      {renderUnifiedUtilityCard()}

      {!currentUser ? (
        /* Kartu Masuk dengan Akun Google: Kotak rounded-md, Ikon tanpa box */
        <div className="bg-white/65 sm:bg-white/70 backdrop-blur-md border border-white/80 rounded-md p-6 sm:p-8 text-center max-w-lg mx-auto shadow-xs space-y-3.5">
          <Lock className="w-6 h-6 text-amber-500 mx-auto" />

          <div className="space-y-1.5">
            <h3 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
              Masuk untuk Membuka Pengaturan Lengkap
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
              Pengaturan metode koneksi ESP32, konfigurasi Wi-Fi router jarak jauh, interval pengiriman Firestore, batas ambang suhu, dan kode Arduino firmware hanya dapat diakses setelah Anda masuk dengan akun Google.
            </p>
          </div>

          {onLoginGoogle && (
            <div className="pt-2">
              <button
                type="button"
                onClick={onLoginGoogle}
                className="inline-flex items-center justify-center gap-2.5 px-5 py-2.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs hover:shadow-md transition-all active:scale-95 cursor-pointer whitespace-nowrap"
              >
                <img
                  src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                  alt="Google"
                  className="w-4 h-4 bg-white rounded-full p-0.5 shrink-0"
                />
                <span>Masuk dengan Akun Google</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Grid Utama Dua Kolom: Hanya Muncul Ketika Sudah Login */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Kolom Kiri: Pilihan Metode Koneksi & Kartu Pinout Terpisah */}
          <div className="lg:col-span-6 space-y-5">
            {/* Card 1: Pilihan Metode Sambungan ESP32 */}
            <section className="bg-white/65 sm:bg-white/70 backdrop-blur-md border border-white/80 rounded-md p-4 sm:p-5 space-y-4 shadow-xs">
              <div>
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-200/60">
                  <h2 className="text-sm font-bold text-slate-900 tracking-tight whitespace-nowrap">
                    Pilih Metode Sambungan ESP32
                  </h2>
                  {isConnected && (
                    <button
                      type="button"
                      onClick={onDisconnect}
                      className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-md border border-rose-200/80 transition-colors cursor-pointer whitespace-nowrap active:scale-95"
                    >
                      <Unplug className="w-3.5 h-3.5 shrink-0" />
                      <span>Putuskan</span>
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Pilih jalur transmisi data sensor suhu dari modul mikrokontroler.
                </p>
              </div>

              {/* Dua Pilihan Metode: Cloud Firestore & Mode Simulasi */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Opsi 1: Cloud Firestore */}
                <div
                  onClick={() => onUpdateSettings({ activeMethod: 'cloud_hotspot' })}
                  className={`p-3.5 rounded-md border text-left transition-all cursor-pointer ${
                    settings.activeMethod === 'cloud_hotspot'
                      ? 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/30 shadow-xs'
                      : 'border-white/75 bg-white/40 hover:bg-white/60 hover:border-white/90'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="font-semibold text-xs text-slate-900 whitespace-nowrap">
                      Cloud Firestore
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">
                    Monitoring online realtime via Firebase Cloud
                  </p>
                </div>

                {/* Opsi 2: Mode Simulasi */}
                <div
                  onClick={() => onUpdateSettings({ activeMethod: 'simulation' })}
                  className={`p-3.5 rounded-md border text-left transition-all cursor-pointer ${
                    settings.activeMethod === 'simulation'
                      ? 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/30 shadow-xs'
                      : 'border-white/75 bg-white/40 hover:bg-white/60 hover:border-white/90'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-amber-600 shrink-0" />
                    <span className="font-semibold text-xs text-slate-900 whitespace-nowrap">
                      Mode Simulasi
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">
                    Uji visual indikator &amp; grafik tanpa alat fisik
                  </p>
                </div>
              </div>

              {/* Panel Aksi Sinkronisasi Metode yang Aktif */}
              {settings.activeMethod === 'cloud_hotspot' ? (
                <div className="pt-3 border-t border-slate-200/60 space-y-3">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Data pembacaan suhu tersinkronisasi otomatis via Google Cloud Firestore secara realtime.
                  </p>

                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onStartPollingUrl('cloud_hotspot')}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 active:scale-95 rounded-md transition-all cursor-pointer shadow-xs whitespace-nowrap"
                    >
                      <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                      <span>Sinkronkan Firestore</span>
                    </button>

                    <button
                      type="button"
                      onClick={onTestCloudPush}
                      title="Kirim 1 paket data suhu valid ke Firestore untuk menguji integrasi"
                      className="px-3.5 py-2 text-xs font-semibold text-amber-900 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-300/80 active:scale-95 rounded-md transition-all cursor-pointer whitespace-nowrap"
                    >
                      <span>Uji Kirim Sensor</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="pt-3 border-t border-slate-200/60">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Mode simulasi suhu sedang aktif. Anda dapat menguji perubahan suhu, grafik, dan alarm tanpa alat fisik.
                  </p>
                </div>
              )}
            </section>

            {/* Card 2: Pinout Sensor Suhu Inframerah GY-906 (Dipisah Sendiri dengan Tabel Mini) */}
            <section className="bg-white/65 sm:bg-white/70 backdrop-blur-md border border-white/80 rounded-md p-4 sm:p-5 space-y-3.5 shadow-xs">
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-200/60">
                <div className="flex items-center gap-2 min-w-0">
                  <Cpu className="w-4 h-4 text-amber-600 shrink-0" />
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 whitespace-nowrap truncate">
                      Pinout Sensor GY-906
                    </h3>
                    <p className="text-[11px] text-slate-500 truncate">
                      MLX90614ESF Non-Kontak • Antarmuka I2C
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-mono font-semibold text-amber-800 whitespace-nowrap">
                    I2C: 0x5A
                  </span>
                  <InfoButton topicId="wiring_pinout" />
                </div>
              </div>

              {/* Tabel Mini Pinout Sensor */}
              <div className="overflow-x-auto rounded-md border border-slate-200/70 bg-white/50 backdrop-blur-xs">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50/80 text-[11px] font-semibold text-slate-600 border-b border-slate-200/70">
                    <tr>
                      <th className="py-2 px-3 whitespace-nowrap">Pin GY-906</th>
                      <th className="py-2 px-3 whitespace-nowrap">Pin ESP32</th>
                      <th className="py-2 px-3 whitespace-nowrap">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/50 text-[11px] font-mono">
                    <tr className="hover:bg-amber-500/5 transition-colors">
                      <td className="py-2 px-3 font-bold text-amber-900 whitespace-nowrap">VIN</td>
                      <td className="py-2 px-3 text-slate-800 whitespace-nowrap">3.3V</td>
                      <td className="py-2 px-3 font-sans text-slate-500 whitespace-nowrap">Tegangan Daya (VCC)</td>
                    </tr>
                    <tr className="hover:bg-amber-500/5 transition-colors">
                      <td className="py-2 px-3 font-bold text-slate-700 whitespace-nowrap">GND</td>
                      <td className="py-2 px-3 text-slate-800 whitespace-nowrap">GND</td>
                      <td className="py-2 px-3 font-sans text-slate-500 whitespace-nowrap">Ground / Negatif</td>
                    </tr>
                    <tr className="hover:bg-amber-500/5 transition-colors">
                      <td className="py-2 px-3 font-bold text-blue-700 whitespace-nowrap">SCL</td>
                      <td className="py-2 px-3 font-bold text-amber-700 whitespace-nowrap">GPIO 22</td>
                      <td className="py-2 px-3 font-sans text-slate-500 whitespace-nowrap">I2C Clock Signal</td>
                    </tr>
                    <tr className="hover:bg-amber-500/5 transition-colors">
                      <td className="py-2 px-3 font-bold text-emerald-700 whitespace-nowrap">SDA</td>
                      <td className="py-2 px-3 font-bold text-amber-700 whitespace-nowrap">GPIO 21</td>
                      <td className="py-2 px-3 font-sans text-slate-500 whitespace-nowrap">I2C Data Signal</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <p className="text-[10px] sm:text-[11px] text-slate-500 leading-relaxed">
                * Sensor termometer inframerah non-kontak mengukur suhu objek tanpa sentuhan fisik.
              </p>
            </section>
          </div>

          {/* Kolom Kanan: Pengaturan Wi-Fi Router, Thresholds Suhu, dan Kode Arduino */}
          <section className="lg:col-span-6 space-y-5">
            {/* 1. Pengaturan Wi-Fi Router ESP32 (Sinkron Cloud Firestore) */}
            <div className="bg-white/65 sm:bg-white/70 backdrop-blur-md border border-white/80 rounded-md p-4 sm:p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-200/60">
                <div className="flex items-center gap-2 min-w-0">
                  <Wifi className="w-4 h-4 text-amber-600 shrink-0" />
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 whitespace-nowrap truncate">
                      Konfigurasi Wi-Fi Router ESP32
                    </h3>
                    <p className="text-[11px] text-slate-500 truncate">
                      Koneksi router target agar ESP32 dapat terhubung ke internet
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <InfoButton topicId="wifi_sync_guide" />
                  <span className="text-[11px] font-mono text-emerald-700 font-semibold flex items-center gap-1.5 whitespace-nowrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Firestore Sync
                  </span>
                </div>
              </div>

              <form onSubmit={handleSaveCredentials} className="space-y-3.5">
                {/* Input SSID Wi-Fi Router dengan Riwayat Dropdown */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-slate-700 whitespace-nowrap">
                      Nama Wi-Fi Router (SSID)
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowHistoryDropdown((prev) => !prev)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 hover:text-amber-800 transition-colors cursor-pointer py-0.5"
                      title="Buka riwayat Wi-Fi yang pernah tersambung"
                    >
                      <History className="w-3 h-3 text-amber-600" />
                      <span>Riwayat ({wifiHistory.length})</span>
                    </button>
                  </div>

                  <div className="relative" ref={historyDropdownRef}>
                    <input
                      type="text"
                      value={wifiSsid}
                      onChange={(e) => {
                        isUserTypingWifiRef.current = true;
                        setWifiSsid(e.target.value);
                      }}
                      placeholder="Contoh: FanraRA / MyHomeWiFi"
                      required
                      className="w-full pl-3 pr-10 py-2 text-xs font-mono bg-white/85 border border-white/95 rounded-md text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 shadow-2xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowHistoryDropdown((prev) => !prev)}
                      title="Lihat riwayat Wi-Fi tersimpan"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-amber-600 transition-colors cursor-pointer"
                    >
                      <History className="w-4 h-4" />
                    </button>

                    {/* Dropdown Menu Riwayat Wi-Fi */}
                    {showHistoryDropdown && (
                      <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-xl rounded-md overflow-hidden text-xs animate-in fade-in zoom-in-95 duration-100">
                        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-slate-50/80">
                          <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                            <History className="w-3.5 h-3.5 text-amber-600" />
                            <span>Pilih Jaringan Tersimpan</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowHistoryDropdown(false)}
                            className="text-slate-400 hover:text-slate-700 p-0.5 rounded cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {wifiHistory.length === 0 ? (
                          <div className="p-3 text-center text-[11px] text-slate-400">
                            Belum ada riwayat Wi-Fi tersimpan.
                          </div>
                        ) : (
                          <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                            {wifiHistory.map((item) => {
                              const isCurrent = item.ssid === wifiSsid;
                              return (
                                <div
                                  key={item.ssid}
                                  onClick={() => {
                                    isUserTypingWifiRef.current = true;
                                    setWifiSsid(item.ssid);
                                    if (item.pass) setWifiPass(item.pass);
                                    setShowHistoryDropdown(false);
                                  }}
                                  className={`flex items-center justify-between px-3 py-2 hover:bg-amber-500/10 cursor-pointer transition-colors ${
                                    isCurrent ? 'bg-amber-500/10 font-semibold' : ''
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <Wifi className={`w-3.5 h-3.5 shrink-0 ${isCurrent ? 'text-amber-600' : 'text-slate-400'}`} />
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-mono text-xs text-slate-900 truncate">
                                          {item.ssid}
                                        </span>
                                        {isCurrent && (
                                          <span className="text-[9px] font-mono font-semibold text-emerald-700 bg-emerald-50 px-1 rounded border border-emerald-200">
                                            Aktif
                                          </span>
                                        )}
                                      </div>
                                      <span className="text-[10px] text-slate-400 block font-mono">
                                        {item.pass ? '••••••••' : '(Tanpa sandi)'}
                                      </span>
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteWifiHistory(item.ssid);
                                    }}
                                    title="Hapus dari riwayat"
                                    className="text-slate-400 hover:text-rose-600 p-1 rounded transition-colors cursor-pointer shrink-0 ml-2"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <span className="text-[10px] text-slate-500 block">
                    Nama jaringan Wi-Fi 2.4 GHz atau Hotspot HP yang dihubungkan ke ESP32.
                  </span>
                </div>

                {/* Input Password Wi-Fi Router */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 whitespace-nowrap">
                    Kata Sandi Wi-Fi Router (Password)
                  </label>
                  <div className="relative">
                    <input
                      type={showWifiPass ? 'text' : 'password'}
                      value={wifiPass}
                      onChange={(e) => {
                        isUserTypingWifiRef.current = true;
                        setWifiPass(e.target.value);
                      }}
                      placeholder="Masukkan kata sandi Wi-Fi (kosongkan jika terbuka)"
                      className="w-full pl-3 pr-10 py-2 text-xs font-mono bg-white/85 border border-white/95 rounded-md text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 shadow-2xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowWifiPass((prev) => !prev)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 rounded-md transition-colors cursor-pointer"
                      title={showWifiPass ? 'Sembunyikan password' : 'Lihat password'}
                    >
                      {showWifiPass ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  <span className="text-[10px] text-slate-500 block">
                    Kata sandi otentikasi jaringan Wi-Fi router.
                  </span>
                </div>

                {/* Pilihan Interval Pengiriman Sensor ke Firestore */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-slate-700 whitespace-nowrap">
                      Interval Pengiriman Suhu ke Cloud
                    </label>
                    {intervalFeedback && (
                      <span className="text-[10px] text-emerald-700 font-medium whitespace-nowrap animate-in fade-in">
                        {intervalFeedback}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { sec: 2, label: '2 Detik', sub: '(Cepat)' },
                      { sec: 5, label: '5 Detik', sub: '(Optimal)' },
                      { sec: 10, label: '10 Detik', sub: '(Hemat)' }
                    ] as const).map((item) => (
                      <button
                        key={item.sec}
                        type="button"
                        disabled={isSavingInterval || isSavingCredentials}
                        onClick={() => handleSelectInterval(item.sec)}
                        className={`py-2 px-1 text-center rounded-md border transition-all cursor-pointer flex flex-col items-center justify-center ${
                          activeInterval === item.sec
                            ? 'bg-amber-500 text-white border-amber-600 shadow-2xs font-semibold'
                            : 'bg-white/75 hover:bg-white text-slate-700 border-white/85'
                        }`}
                      >
                        <span className="text-xs whitespace-nowrap font-bold">{item.label}</span>
                        <span className={`text-[10px] whitespace-nowrap ${activeInterval === item.sec ? 'text-amber-100' : 'text-slate-400'}`}>
                          {item.sub}
                        </span>
                      </button>
                    ))}
                  </div>
                  <span className="text-[10px] text-slate-500 block">
                    Frekuensi pengiriman paket temperatur Celsius ke Firestore (pvngblock).
                  </span>
                </div>

                {/* Accordion: Hotspot Mandiri ESP32 (AP 192.168.4.1) */}
                <div className="pt-2 border-t border-slate-200/50">
                  <button
                    type="button"
                    onClick={() => setShowApConfig((prev) => !prev)}
                    className="flex items-center justify-between w-full text-left text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors cursor-pointer py-1.5 group"
                    title={showApConfig ? 'Tutup Pengaturan Hotspot AP' : 'Buka Pengaturan Hotspot AP'}
                  >
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      <Radio className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Pengaturan Hotspot Mandiri ESP32 (AP Mode)</span>
                    </span>
                    <div className="p-0.5 rounded text-slate-400 group-hover:text-slate-700 transition-colors shrink-0">
                      {showApConfig ? (
                        <ChevronUp className="w-4 h-4 text-slate-600" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-500" />
                      )}
                    </div>
                  </button>

                  {showApConfig && (
                    <div className="space-y-3 pt-2 mt-1 bg-white/40 p-3 rounded-md border border-white/70">
                      <div className="space-y-1">
                        <label className="block text-[11px] font-semibold text-slate-700 whitespace-nowrap">
                          Nama Hotspot ESP32 (AP SSID)
                        </label>
                        <input
                          type="text"
                          value={apSsid}
                          onChange={(e) => setApSsid(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs font-mono bg-white/80 border border-white/90 rounded-md text-slate-900 focus:bg-white focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[11px] font-semibold text-slate-700 whitespace-nowrap">
                          Password Hotspot ESP32 (Min. 8 Karakter)
                        </label>
                        <div className="relative">
                          <input
                            type={showApPass ? 'text' : 'password'}
                            value={apPass}
                            onChange={(e) => setApPass(e.target.value)}
                            className="w-full pl-2.5 pr-8 py-1.5 text-xs font-mono bg-white/80 border border-white/90 rounded-md text-slate-900 focus:bg-white focus:outline-none focus:border-amber-500"
                          />
                          <button
                            type="button"
                            onClick={() => setShowApPass((prev) => !prev)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                          >
                            {showApPass ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Feedback Pesan */}
                {credentialsFeedback && (
                  <div
                    className={`p-3 rounded-md text-xs flex items-center gap-2 border ${
                      credentialsFeedback.type === 'success'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-rose-50 text-rose-800 border-rose-200'
                    }`}
                  >
                    {credentialsFeedback.type === 'success' ? (
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <X className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                    <span className="leading-snug">{credentialsFeedback.message}</span>
                  </div>
                )}

                {/* Tombol Simpan & Sinkronkan */}
                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={isSavingCredentials}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 active:scale-[0.99] rounded-md transition-all cursor-pointer shadow-xs disabled:opacity-50 whitespace-nowrap"
                  >
                    {isSavingCredentials ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        <span>Menyimpan ke Firestore...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 shrink-0" />
                        <span>Simpan &amp; Sinkronkan Wi-Fi</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setWifiSsid('FanraRA');
                      setWifiPass('#I47r32a6');
                      setApSsid('FAVORA-ESP32-AP');
                      setApPass('12345678');
                    }}
                    title="Kembalikan nama Wi-Fi ke FanraRA"
                    className="px-3.5 py-2.5 text-xs font-semibold text-slate-700 bg-white/75 hover:bg-white border border-white/90 rounded-md transition-colors cursor-pointer shrink-0 whitespace-nowrap active:scale-95"
                  >
                    Default
                  </button>
                </div>
              </form>
            </div>

            {/* 2. Pengaturan Ambang Batas Suhu (Thresholds) */}
            <div className="bg-white/65 sm:bg-white/70 backdrop-blur-md border border-white/80 rounded-md p-4 sm:p-5 space-y-3.5 shadow-xs">
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-200/60">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-amber-600 shrink-0" />
                  <h3 className="text-sm font-bold text-slate-900 whitespace-nowrap">
                    Batas Rentang Suhu (°C)
                  </h3>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <InfoButton topicId="thresholds_guide" />
                  <span className="text-xs font-mono font-semibold text-amber-800 whitespace-nowrap">
                    Sinkron Realtime
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                Atur nilai suhu optimal dan suhu batas kritis. Notifikasi alarm akan menyala jika suhu melewati ambang batas.
              </p>

              {/* Grid Responsif Kotak: 1 kolom di HP, 3 kolom di desktop */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                {/* Suhu Min Optimal */}
                <div className="p-2.5 sm:p-3 rounded-md bg-white/40 border border-white/70 space-y-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <label className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                      Suhu Min
                    </label>
                    <span className="text-[10px] text-slate-400 whitespace-nowrap">Batas bawah</span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      value={thresholds.tempMinOptimal}
                      onChange={(e) =>
                        onUpdateThresholds({
                          tempMinOptimal: parseFloat(e.target.value) || 28
                        })
                      }
                      className="w-full pl-3 pr-8 py-1.5 font-mono text-xs bg-white/80 border border-white/90 rounded-md text-slate-900 focus:bg-white focus:border-amber-500 focus:outline-none"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-mono text-slate-400 pointer-events-none">
                      °C
                    </span>
                  </div>
                </div>

                {/* Suhu Maks Optimal */}
                <div className="p-2.5 sm:p-3 rounded-md bg-white/40 border border-white/70 space-y-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <label className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                      Suhu Maks
                    </label>
                    <span className="text-[10px] text-slate-400 whitespace-nowrap">Batas atas</span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      value={thresholds.tempMaxOptimal}
                      onChange={(e) =>
                        onUpdateThresholds({
                          tempMaxOptimal: parseFloat(e.target.value) || 40
                        })
                      }
                      className="w-full pl-3 pr-8 py-1.5 font-mono text-xs bg-white/80 border border-white/90 rounded-md text-slate-900 focus:bg-white focus:border-amber-500 focus:outline-none"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-mono text-slate-400 pointer-events-none">
                      °C
                    </span>
                  </div>
                </div>

                {/* Suhu Kritis */}
                <div className="p-2.5 sm:p-3 rounded-md bg-rose-50/40 border border-rose-200/70 space-y-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <label className="text-xs font-semibold text-rose-800 whitespace-nowrap">
                      Suhu Kritis
                    </label>
                    <span className="text-[10px] text-rose-500 whitespace-nowrap">Alarm sirine</span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      value={thresholds.tempCritical}
                      onChange={(e) =>
                        onUpdateThresholds({
                          tempCritical: parseFloat(e.target.value) || 45
                        })
                      }
                      className="w-full pl-3 pr-8 py-1.5 font-mono text-xs bg-white/80 border border-rose-300 rounded-md text-rose-900 font-semibold focus:bg-white focus:border-rose-500 focus:outline-none"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-mono text-rose-600 font-semibold pointer-events-none">
                      °C
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Kode Arduino ESP32 untuk Sensor Suhu */}
            {activeSketch && (
              <div className="bg-white/65 sm:bg-white/70 backdrop-blur-md border border-white/80 rounded-md p-4 sm:p-5 space-y-3.5 shadow-xs overflow-hidden">
                <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                      {activeSketch.title}
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                      {activeSketch.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleDownloadIno}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white/75 hover:bg-white border border-white/85 shadow-2xs rounded-md transition-colors cursor-pointer whitespace-nowrap active:scale-95"
                      title="Unduh file .ino lengkap siap upload ke ESP32"
                    >
                      <Download className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Unduh .ino</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white/75 hover:bg-white border border-white/85 shadow-2xs rounded-md transition-colors cursor-pointer whitespace-nowrap active:scale-95"
                    >
                      {copiedCode ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span className="text-emerald-700 font-semibold">Tersalin</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 shrink-0" />
                          <span>Salin Kode</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <pre className="bg-slate-950/90 backdrop-blur-xs text-slate-200 p-3.5 rounded-md text-xs font-mono overflow-x-auto max-h-60 leading-relaxed border border-slate-800 shadow-inner">
                    <code>{activeCodeToDisplay}</code>
                  </pre>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
