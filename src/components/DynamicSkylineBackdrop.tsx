import React, { useState, useEffect } from 'react';
import { Sun, Sunset, Moon, Sparkles } from 'lucide-react';

export type TimeOfDayMode = 'auto' | 'day' | 'sunset' | 'night';

export function getAutoTimePeriod(): 'day' | 'sunset' | 'night' {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 15) return 'day';
  if (hour >= 15 && hour < 18) return 'sunset';
  return 'night';
}

interface DynamicSkylineBackdropProps {
  currentMode: TimeOfDayMode;
  onModeChange?: (mode: TimeOfDayMode) => void;
}

export const DynamicSkylineBackdrop: React.FC<DynamicSkylineBackdropProps> = ({
  currentMode
}) => {
  const [activePeriod, setActivePeriod] = useState<'day' | 'sunset' | 'night'>(
    currentMode === 'auto' ? getAutoTimePeriod() : currentMode
  );

  useEffect(() => {
    if (currentMode === 'auto') {
      setActivePeriod(getAutoTimePeriod());
      const interval = setInterval(() => {
        setActivePeriod(getAutoTimePeriod());
      }, 60000);
      return () => clearInterval(interval);
    } else {
      setActivePeriod(currentMode);
    }
  }, [currentMode]);

  // Palet & Langit berdasarkan waktu (Siang, Sore, Malam)
  // Semua siluet bangunan, kubah reaktor, dan pegunungan identik sama!
  const isDay = activePeriod === 'day';
  const isSunset = activePeriod === 'sunset';
  const isNight = activePeriod === 'night';

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 h-[400px] sm:h-[480px] overflow-hidden select-none z-0"
    >
      <svg
        className="w-full h-full object-cover transition-all duration-1000 ease-in-out"
        viewBox="0 0 1200 480"
        preserveAspectRatio="xMidYMin slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Langit Siang */}
          <linearGradient id="skyDay" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#1e3a5f" />
            <stop offset="50%" stopColor="#2d527c" />
            <stop offset="85%" stopColor="#416d96" />
            <stop offset="100%" stopColor="#050505" />
          </linearGradient>

          {/* Langit Sore / Senja (Sunset) */}
          <linearGradient id="skySunset" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#2c1445" />
            <stop offset="35%" stopColor="#5c1f58" />
            <stop offset="65%" stopColor="#a33b52" />
            <stop offset="85%" stopColor="#d96b43" />
            <stop offset="100%" stopColor="#050505" />
          </linearGradient>

          {/* Langit Malam */}
          <linearGradient id="skyNight" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#040711" />
            <stop offset="40%" stopColor="#080f24" />
            <stop offset="80%" stopColor="#0f172a" />
            <stop offset="100%" stopColor="#050505" />
          </linearGradient>

          {/* Cahaya Matahari / Sunset / Bulan */}
          <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff9e6" stopOpacity="0.9" />
            <stop offset="40%" stopColor="#ffd166" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#ffd166" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="sunsetGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff9f43" stopOpacity="0.9" />
            <stop offset="40%" stopColor="#ee5253" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#2c1445" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="moonGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#e2e8f0" stopOpacity="0.75" />
            <stop offset="40%" stopColor="#94a3b8" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#080f24" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* 1. Latar Langit Berubah Sesuai Waktu */}
        <rect
          width="1200"
          height="480"
          fill={
            isDay
              ? 'url(#skyDay)'
              : isSunset
              ? 'url(#skySunset)'
              : 'url(#skyNight)'
          }
        />

        {/* 2. Matahari / Senja / Bulan & Bintang */}
        {isDay && (
          <g className="transition-opacity duration-1000">
            {/* Matahari Siang Bersinar */}
            <circle cx="880" cy="80" r="140" fill="url(#sunGlow)" />
            <circle cx="880" cy="80" r="28" fill="#fffdfa" />
          </g>
        )}

        {isSunset && (
          <g className="transition-opacity duration-1000">
            {/* Matahari Senja Tenggelam di Cakrawala */}
            <circle cx="600" cy="190" r="180" fill="url(#sunsetGlow)" />
            <circle cx="600" cy="190" r="32" fill="#ffbe76" />
          </g>
        )}

        {isNight && (
          <g className="transition-opacity duration-1000">
            {/* Bulan Sabit & Bintang-Bintang Malam */}
            <circle cx="920" cy="70" r="90" fill="url(#moonGlow)" />
            <circle cx="920" cy="70" r="16" fill="#f8fafc" />
            {/* Taburan Bintang di Langit Malam */}
            <circle cx="120" cy="45" r="1" fill="#ffffff" opacity="0.8" />
            <circle cx="210" cy="70" r="1.5" fill="#ffffff" opacity="0.9" />
            <circle cx="340" cy="30" r="1" fill="#ffffff" opacity="0.6" />
            <circle cx="480" cy="65" r="1.2" fill="#ffffff" opacity="0.8" />
            <circle cx="650" cy="40" r="1.5" fill="#ffffff" opacity="0.7" />
            <circle cx="780" cy="55" r="1" fill="#ffffff" opacity="0.9" />
            <circle cx="1040" cy="45" r="1.2" fill="#ffffff" opacity="0.8" />
            <circle cx="1120" cy="80" r="1" fill="#ffffff" opacity="0.6" />
            <circle cx="280" cy="110" r="1.2" fill="#ffffff" opacity="0.7" />
            <circle cx="720" cy="100" r="1" fill="#ffffff" opacity="0.6" />
          </g>
        )}

        {/* 3. Barisan Pegunungan Belakang (Siluet Sama Persis di Siang, Sore, Malam) */}
        <path
          d="M 0 250 L 90 220 L 190 235 L 290 190 L 410 240 L 520 205 L 670 230 L 820 180 L 960 225 L 1090 195 L 1200 240 L 1200 480 L 0 480 Z"
          fill={
            isDay
              ? '#1b324d'
              : isSunset
              ? '#3a183d'
              : '#080d1a'
          }
          opacity={isDay ? '0.7' : isSunset ? '0.85' : '0.9'}
        />

        {/* 4. Siluet Kota & Kampus ITERA / Fasilitas Riset Biogas (Sama Persis di Semua Waktu) */}
        {/* Bangunan, Gedung Bertingkat, Kubah Reaktor Biogas, dan Menara */}
        <g
          fill={
            isDay
              ? '#0d1a29'
              : isSunset
              ? '#1e0c24'
              : '#050811'
          }
        >
          {/* Sisi Kiri: Gedung Laboratorium & Fasilitas */}
          <rect x="30" y="220" width="65" height="120" />
          <rect x="75" y="195" width="50" height="145" />
          <rect x="135" y="240" width="70" height="100" />
          <rect x="195" y="210" width="85" height="130" />

          {/* Menara Transmisi / Komunikasi */}
          <line x1="160" y1="240" x2="160" y2="160" stroke="#0d1a29" strokeWidth="2" />
          <line x1="150" y1="180" x2="170" y2="180" stroke="#0d1a29" strokeWidth="1" />

          {/* Kubah Reaktor Biogas (Pusat Fasilitas) */}
          <path d="M 320 270 Q 375 170 430 270 Z" />
          <rect x="340" y="270" width="70" height="70" />
          <line x1="375" y1="170" x2="375" y2="140" stroke="#0d1a29" strokeWidth="2" />

          {/* Tangki Penampung Silinder & Pipa Gas */}
          <rect x="445" y="235" width="55" height="105" rx="4" />
          <rect x="515" y="250" width="60" height="90" rx="4" />

          {/* Siluet Pusat Perkotaan Tengah-Kanan */}
          <rect x="600" y="180" width="75" height="160" />
          <rect x="665" y="160" width="55" height="180" />
          <polygon points="692,125 680,160 705,160" />
          <rect x="730" y="200" width="85" height="140" />
          <rect x="805" y="175" width="60" height="165" />
          <rect x="855" y="220" width="95" height="120" />
          <rect x="940" y="190" width="70" height="150" />
          <rect x="1000" y="230" width="90" height="110" />
          <rect x="1080" y="210" width="80" height="130" />
        </g>

        {/* 5. Lampu-Lampu Jendela Gedung & Lampu Jalan (Menyala di Sore dan Malam Hari) */}
        {!isDay && (
          <g
            fill={isSunset ? '#ffdda1' : '#fef08a'}
            opacity={isSunset ? '0.75' : '0.9'}
            className="transition-opacity duration-1000"
          >
            {/* Lampu Gedung Kiri */}
            <rect x="85" y="205" width="4" height="6" />
            <rect x="95" y="205" width="4" height="6" />
            <rect x="105" y="205" width="4" height="6" />
            <rect x="85" y="220" width="4" height="6" />
            <rect x="105" y="220" width="4" height="6" />
            <rect x="85" y="240" width="4" height="6" />
            <rect x="95" y="240" width="4" height="6" />
            <rect x="210" y="225" width="5" height="5" />
            <rect x="225" y="225" width="5" height="5" />
            <rect x="240" y="225" width="5" height="5" />
            <rect x="210" y="240" width="5" height="5" />
            <rect x="240" y="240" width="5" height="5" />

            {/* Lampu Puncak Menara Biogas (Kelap-kelip merah/amber) */}
            <circle cx="375" cy="140" r="2.5" fill="#f87171" />
            <circle cx="160" cy="160" r="2.5" fill="#f87171" />
            <circle cx="692" cy="125" r="3" fill="#f87171" />

            {/* Lampu Gedung Kota Tengah & Kanan */}
            <rect x="615" y="195" width="5" height="7" />
            <rect x="630" y="195" width="5" height="7" />
            <rect x="645" y="195" width="5" height="7" />
            <rect x="615" y="215" width="5" height="7" />
            <rect x="645" y="215" width="5" height="7" />
            <rect x="615" y="235" width="5" height="7" />
            <rect x="630" y="235" width="5" height="7" />
            <rect x="675" y="175" width="4" height="6" />
            <rect x="690" y="175" width="4" height="6" />
            <rect x="675" y="190" width="4" height="6" />
            <rect x="700" y="190" width="4" height="6" />
            <rect x="675" y="210" width="4" height="6" />
            <rect x="690" y="210" width="4" height="6" />
            <rect x="675" y="230" width="4" height="6" />
            <rect x="745" y="215" width="6" height="6" />
            <rect x="765" y="215" width="6" height="6" />
            <rect x="785" y="215" width="6" height="6" />
            <rect x="745" y="235" width="6" height="6" />
            <rect x="785" y="235" width="6" height="6" />
            <rect x="820" y="190" width="4" height="6" />
            <rect x="835" y="190" width="4" height="6" />
            <rect x="820" y="205" width="4" height="6" />
            <rect x="845" y="205" width="4" height="6" />
            <rect x="820" y="225" width="4" height="6" />
            <rect x="835" y="225" width="4" height="6" />
            <rect x="955" y="205" width="5" height="6" />
            <rect x="975" y="205" width="5" height="6" />
            <rect x="955" y="225" width="5" height="6" />
            <rect x="975" y="225" width="5" height="6" />
            <rect x="1020" y="245" width="5" height="5" />
            <rect x="1040" y="245" width="5" height="5" />
            <rect x="1060" y="245" width="5" height="5" />
            <rect x="1095" y="225" width="5" height="6" />
            <rect x="1115" y="225" width="5" height="6" />
            <rect x="1135" y="225" width="5" height="6" />
          </g>
        )}

        {/* 6. Lapisan Gradasi Menyatu ke Gelap (#050505) di Bawah */}
        <rect
          y="240"
          width="1200"
          height="240"
          fill="url(#gradBlend)"
        />
        <defs>
          <linearGradient id="gradBlend" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#050505" stopOpacity="0" />
            <stop offset="45%" stopColor="#050505" stopOpacity="0.65" />
            <stop offset="90%" stopColor="#050505" stopOpacity="1" />
            <stop offset="100%" stopColor="#050505" stopOpacity="1" />
          </linearGradient>
        </defs>
      </svg>

      {/* Gradasi CSS tambahan untuk kehalusan transisi */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#050505]/40 to-[#050505]" />
    </div>
  );
};
