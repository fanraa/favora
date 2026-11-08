export type ConnectionMethod =
  | 'simulation'
  | 'bluetooth'
  | 'wifi_local'
  | 'cloud_hotspot'
  | 'usb_serial';

export interface SensorReading {
  id: string;
  timestamp: string;
  temperatureC: number; // °C
  source: ConnectionMethod;
  epochMs?: number;     // waktu epoch ms untuk deteksi status ESP32 aktif/mati
  // Legacy optional fields for database backwards-compatibility
  pressureKpa?: number;
  pressureBar?: number;
  pressurePsi?: number;
  rawPressure?: number;
}

export interface FirestoreSensorReadingDoc {
  temperature: number;
  timestamp: string | { toDate?: () => Date; seconds?: number; nanoseconds?: number };
  pressure_kpa?: number;
  pressure_bar?: number;
  pressure_psi?: number;
  raw_pressure?: number;
}

export interface ThresholdConfig {
  tempMinOptimal: number; // e.g. 30 °C
  tempMaxOptimal: number; // e.g. 40 °C
  tempCritical: number;   // e.g. 45 °C
  // Optional legacy fields to avoid breaking stored objects
  pressureMinUse?: number;
  pressureMaxSafe?: number;
  pressureCritical?: number;
}

export interface ConnectionSettings {
  activeMethod: ConnectionMethod;
  // Wi-Fi Lokal (ESP32 Access Point / Local IP)
  localIpUrl: string;
  pollIntervalSec: number;
  // Cloud / Hotspot HP (Firebase Cloud Firestore / Endpoint)
  cloudEndpointUrl: string;
  // Bluetooth BLE
  bleDeviceName: string;
  bleServiceUuid: string;
  bleCharUuid: string;
  // USB Serial
  serialBaudRate: number;
}

export interface InfoContent {
  id: string;
  title: string;
  subtitle: string;
  summary: string;
  bullets: string[];
  tip?: string;
}
