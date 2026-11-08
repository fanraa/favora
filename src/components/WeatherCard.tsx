import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  MapPin,
  Check,
  WifiOff,
  X
} from 'lucide-react';
import { FloatingAnchorBox } from './InfoPopover';

interface WeatherData {
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  windSpeed: number;
  weatherCode: number;
  isDay: boolean;
  precipitation: number;
  updatedAt: string;
}

interface WeatherCardProps {
  latitude?: number;
  longitude?: number;
  locationName?: string;
}

// Terjemahan & icon kode cuaca WMO Open-Meteo
function getWeatherInterpretation(code: number, isDay: boolean) {
  if (code === 0) {
    return {
      label: isDay ? 'Cerah' : 'Malam Cerah',
      icon: (
        <img
          src="https://cdn-icons-png.flaticon.com/128/702/702459.png"
          alt="Cerah"
          className="w-7 h-7 object-contain brightness-0 invert opacity-95 drop-shadow-[0_0_6px_rgba(253,224,71,0.5)] shrink-0 transition-all duration-300"
          draggable={false}
        />
      ),
      color: 'text-amber-400'
    };
  }
  if (code === 1 || code === 2) {
    return {
      label: 'Cerah Berawan',
      icon: (
        <img
          src="https://cdn-icons-png.flaticon.com/128/2932/2932449.png"
          alt="Cerah Berawan"
          className="w-7 h-7 object-contain brightness-0 invert opacity-95 drop-shadow-[0_0_6px_rgba(253,224,71,0.35)] shrink-0 transition-all duration-300"
          draggable={false}
        />
      ),
      color: 'text-amber-300'
    };
  }
  if (code === 3) {
    return {
      label: 'Berawan Tebal',
      icon: (
        <img
          src="https://cdn-icons-png.flaticon.com/128/2932/2932449.png"
          alt="Berawan Tebal"
          className="w-7 h-7 object-contain brightness-0 invert opacity-90 drop-shadow-[0_0_6px_rgba(203,213,225,0.4)] shrink-0 transition-all duration-300"
          draggable={false}
        />
      ),
      color: 'text-zinc-300'
    };
  }
  if (code === 45 || code === 48) {
    return {
      label: 'Berkabut',
      icon: (
        <img
          src="https://cdn-icons-png.flaticon.com/128/2932/2932449.png"
          alt="Berkabut"
          className="w-7 h-7 object-contain brightness-0 invert opacity-80 shrink-0 transition-all duration-300"
          draggable={false}
        />
      ),
      color: 'text-zinc-400'
    };
  }
  if (code >= 51 && code <= 55) {
    return {
      label: 'Gerimis',
      icon: (
        <img
          src="https://cdn-icons-png.flaticon.com/128/3314/3314005.png"
          alt="Gerimis"
          className="w-7 h-7 object-contain brightness-0 invert opacity-90 drop-shadow-[0_0_6px_rgba(56,189,248,0.45)] shrink-0 transition-all duration-300"
          draggable={false}
        />
      ),
      color: 'text-sky-400'
    };
  }
  if (code >= 61 && code <= 65) {
    return {
      label: code === 65 ? 'Hujan Lebat' : 'Hujan',
      icon: (
        <img
          src="https://cdn-icons-png.flaticon.com/128/3314/3314005.png"
          alt="Hujan"
          className="w-7 h-7 object-contain brightness-0 invert opacity-95 drop-shadow-[0_0_6px_rgba(96,165,250,0.5)] shrink-0 transition-all duration-300"
          draggable={false}
        />
      ),
      color: 'text-blue-400'
    };
  }
  if (code >= 80 && code <= 82) {
    return {
      label: 'Hujan Sesaat',
      icon: (
        <img
          src="https://cdn-icons-png.flaticon.com/128/3314/3314005.png"
          alt="Hujan Sesaat"
          className="w-7 h-7 object-contain brightness-0 invert opacity-95 drop-shadow-[0_0_6px_rgba(96,165,250,0.5)] shrink-0 transition-all duration-300"
          draggable={false}
        />
      ),
      color: 'text-blue-400'
    };
  }
  if (code >= 95) {
    return {
      label: 'Hujan Petir',
      icon: (
        <img
          src="https://cdn-icons-png.flaticon.com/128/3314/3314005.png"
          alt="Hujan Petir"
          className="w-7 h-7 object-contain brightness-0 invert opacity-95 drop-shadow-[0_0_6px_rgba(251,191,36,0.5)] shrink-0 transition-all duration-300"
          draggable={false}
        />
      ),
      color: 'text-amber-400'
    };
  }
  return {
    label: 'Cerah Berawan',
    icon: (
      <img
        src="https://cdn-icons-png.flaticon.com/128/2932/2932449.png"
        alt="Cerah Berawan"
        className="w-7 h-7 object-contain brightness-0 invert opacity-90 shrink-0 transition-all duration-300"
        draggable={false}
      />
    ),
    color: 'text-zinc-300'
  };
}

export interface LocationPreset {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  sublabel: string;
}

export const WEATHER_LOCATIONS: LocationPreset[] = [
  {
    id: 'jati_agung',
    name: 'SMAN 1 JATI AGUNG',
    latitude: -5.3176,
    longitude: 105.4097,
    sublabel: 'Sistem Sensor FAVORA'
  },
  {
    id: 'itera',
    name: 'ITERA',
    latitude: -5.3584,
    longitude: 105.3149,
    sublabel: 'Institut Teknologi Sumatera'
  }
];

export const WeatherCard: React.FC<WeatherCardProps> = ({
  latitude = -5.3176,
  longitude = 105.4097,
  locationName = 'SMAN 1 JATI AGUNG'
}) => {
  const [selectedLocation, setSelectedLocation] = useState<LocationPreset>(() => {
    // Cari lokasi awal yang cocok atau default ke SMAN 1 JATI AGUNG
    const found = WEATHER_LOCATIONS.find(
      (l) => Math.abs(l.latitude - latitude) < 0.01 && Math.abs(l.longitude - longitude) < 0.01
    );
    return (
      found || {
        id: 'custom',
        name: locationName || 'SMAN 1 JATI AGUNG',
        latitude,
        longitude,
        sublabel: 'Lokasi Reaktor'
      }
    );
  });

  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const locationBtnRef = useRef<HTMLButtonElement | null>(null);

  const [data, setData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWeather = useCallback(async (lat: number, lon: number) => {
    setLoading(true);
    setError(null);
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&timezone=Asia%2FJakarta`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error('Gagal memuat data cuaca');
      }
      const json = await res.json();
      const current = json.current;

      const now = new Date();
      const timeStr = now.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      setData({
        temperature: current.temperature_2m,
        apparentTemperature: current.apparent_temperature,
        humidity: current.relative_humidity_2m,
        windSpeed: current.wind_speed_10m,
        weatherCode: current.weather_code,
        isDay: current.is_day === 1,
        precipitation: current.precipitation,
        updatedAt: timeStr
      });
    } catch {
      setError('Koneksi internet diperlukan untuk mengambil cuaca online.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Sinkronisasi otomatis setiap 5 menit & saat lokasi aktif berganti
  useEffect(() => {
    fetchWeather(selectedLocation.latitude, selectedLocation.longitude);
    const timer = setInterval(() => {
      fetchWeather(selectedLocation.latitude, selectedLocation.longitude);
    }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [fetchWeather, selectedLocation]);

  const weatherInfo = data
    ? getWeatherInterpretation(data.weatherCode, data.isDay)
    : null;

  return (
    <section className="relative bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-md p-3 sm:p-4 w-full shadow-lg shadow-black/40 hover:border-white/20 transition-all duration-300">
      {/* Garis kilau kaca atas */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none rounded-t-md" />

      {/* Header Bar Cuaca: Bersih, Rapi, Bergaris Lurus Pemisah Transparan */}
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-white/10">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <img
            src="https://cdn-icons-png.flaticon.com/128/3093/3093298.png"
            alt="Cuaca"
            className="w-4 h-4 object-contain brightness-0 invert opacity-85 shrink-0"
            draggable={false}
          />
          <span className="text-xs font-semibold text-white tracking-wide">
            Cuaca Lingkungan Reaktor
          </span>

          {/* Garis lurus agak transparan pembatas lokasi */}
          <span className="text-white/25 select-none font-light hidden sm:inline">|</span>

          {/* Nama Lokasi & Koordinat */}
          <span className="text-[11px] text-zinc-300 hidden sm:inline">
            {selectedLocation.name}
          </span>
          <span className="text-white/25 select-none font-light hidden sm:inline">|</span>
          <span className="text-[11px] font-mono text-zinc-400 hidden sm:inline">
            {selectedLocation.latitude.toFixed(4)}, {selectedLocation.longitude.toFixed(4)}
          </span>
        </div>

        {/* Icon Lokasi: Murni icon halus tanpa box background, klik menampilkan box pilihan lokasi */}
        <div className="relative inline-flex items-center">
          <button
            ref={locationBtnRef}
            type="button"
            onClick={() => setLocationPickerOpen((prev) => !prev)}
            aria-label="Pilih Lokasi Cuaca"
            className={`p-1 rounded transition-colors cursor-pointer shrink-0 ${
              locationPickerOpen
                ? 'text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
            title="Pilih Lokasi Cuaca (ITERA / SMAN 1 JATI AGUNG)"
          >
            <MapPin className="w-4 h-4 transition-transform active:scale-95" />
          </button>

          {/* Box Mengambang Pilihan Lokasi Menggunakan Portal Fixed z-[9999] (Tidak Pernah Tertutup Box Lain) */}
          <FloatingAnchorBox
            isOpen={locationPickerOpen}
            onClose={() => setLocationPickerOpen(false)}
            anchorEl={locationBtnRef.current}
            maxWidth={260}
          >
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between pb-1.5 border-b border-white/10">
                <span className="text-[11px] font-medium text-zinc-300">
                  Pilih Lokasi Cuaca
                </span>
                <button
                  type="button"
                  onClick={() => setLocationPickerOpen(false)}
                  className="text-zinc-400 hover:text-white p-0.5 transition-colors cursor-pointer"
                  title="Tutup"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-1 pt-0.5">
                {WEATHER_LOCATIONS.map((loc) => {
                  const isCurrent = selectedLocation.id === loc.id;
                  return (
                    <button
                      key={loc.id}
                      type="button"
                      onClick={() => {
                        setSelectedLocation(loc);
                        setLocationPickerOpen(false);
                      }}
                      className={`flex items-center justify-between w-full px-2.5 py-1.5 text-xs rounded transition-colors cursor-pointer text-left ${
                        isCurrent
                          ? 'bg-white/10 text-white font-medium'
                          : 'text-zinc-300 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <div className="flex flex-col min-w-0 pr-1">
                        <span className="leading-tight truncate">{loc.name}</span>
                        <span className="text-[10px] font-mono text-zinc-400 leading-tight">
                          {loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)}
                        </span>
                      </div>
                      {isCurrent && (
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 ml-1.5" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </FloatingAnchorBox>
        </div>
      </div>

      {/* Sub-informasi Lokasi di Layar HP (Dibatasi garis lurus transparan) */}
      <div className="sm:hidden text-[10px] text-zinc-400 pt-1.5 flex items-center gap-1.5">
        <span className="text-zinc-300">{selectedLocation.name}</span>
        <span className="text-white/25 select-none font-light">|</span>
        <span className="font-mono text-zinc-400">
          {selectedLocation.latitude.toFixed(4)}, {selectedLocation.longitude.toFixed(4)}
        </span>
      </div>

      {/* State Loading Awal */}
      {loading && !data && (
        <div className="h-20 flex flex-col items-center justify-center gap-2 text-zinc-400 text-xs">
          <div className="w-4 h-4 border-2 border-white/20 border-t-emerald-400 rounded-full animate-spin" />
          <span>Mengambil cuaca Open-Meteo...</span>
        </div>
      )}

      {/* State Error Koneksi */}
      {error && !data && (
        <div className="py-2.5 text-rose-300 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchWeather(selectedLocation.latitude, selectedLocation.longitude)}
            className="text-xs text-white underline hover:no-underline cursor-pointer"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* Konten Data Cuaca: Single Box Bersih tanpa Nested Box */}
      {data && (
        <div className="pt-3 flex flex-wrap items-center justify-between gap-4">
          {/* Suhu Luar & Status Kondisi Cuaca */}
          <div className="flex items-center gap-3">
            <div className="shrink-0">
              {weatherInfo?.icon}
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-mono font-medium tracking-tight text-white tabular-nums">
                  {data.temperature.toFixed(1)}&deg;C
                </span>
                <span className="text-xs text-zinc-400">
                  Terasa {data.apparentTemperature.toFixed(1)}&deg;C
                </span>
              </div>
              <div className="text-xs text-zinc-300 mt-0.5 flex items-center gap-1.5">
                <span className={`font-medium ${weatherInfo?.color}`}>{weatherInfo?.label}</span>
              </div>
            </div>
          </div>

          {/* Parameter Lingkungan (Kelembapan & Angin) Tanpa Box / Tanpa Background */}
          <div className="flex items-center gap-4 sm:gap-6 text-xs sm:ml-auto">
            {/* Kelembapan */}
            <div className="flex items-center gap-2">
              <img
                src="https://cdn-icons-png.flaticon.com/128/1633/1633963.png"
                alt="Kelembapan"
                className="w-4 h-4 object-contain brightness-0 invert opacity-80 shrink-0"
                draggable={false}
              />
              <div className="flex flex-col">
                <span className="text-[10px] text-zinc-400 leading-tight">Kelembapan</span>
                <span className="font-mono font-medium text-white tabular-nums text-xs">
                  {data.humidity}%
                </span>
              </div>
            </div>

            {/* Garis batas vertikal tipis */}
            <div className="h-6 w-px bg-white/10" />

            {/* Angin */}
            <div className="flex items-center gap-2">
              <img
                src="https://cdn-icons-png.flaticon.com/128/17785/17785486.png"
                alt="Angin"
                className="w-4 h-4 object-contain brightness-0 invert opacity-80 shrink-0"
                draggable={false}
              />
              <div className="flex flex-col">
                <span className="text-[10px] text-zinc-400 leading-tight">Angin</span>
                <span className="font-mono font-medium text-white tabular-nums text-xs">
                  {data.windSpeed.toFixed(1)} km/h
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
