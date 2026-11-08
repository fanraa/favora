import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  addDoc,
  doc,
  setDoc,
  getDoc,
  Timestamp
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { SensorReading, FirestoreSensorReadingDoc } from '../types/biogas';

const COLLECTION_NAME = 'sensor_readings';
const SETTINGS_DOC_PATH = 'device_settings/esp32_config';

export const OWNER_EMAILS = [
  'irfanrizkiaditri@gmail.com',
  'irfanrizkiaditri01@gmail.com',
  'irfanrizkiaditricreator@gmail.com'
];

export function isUserOwner(user?: { email?: string | null } | null): boolean {
  if (!user?.email) return false;
  return OWNER_EMAILS.includes(user.email.toLowerCase().trim());
}

/**
 * Format timestamp Firestore (Timestamp object, ISO string, atau number) ke string jam lokal WIB
 */
export function formatFirestoreTimestamp(rawTimestamp: any): string {
  if (!rawTimestamp) {
    return new Date().toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  try {
    if (rawTimestamp instanceof Timestamp) {
      return rawTimestamp.toDate().toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    }

    if (typeof rawTimestamp === 'object' && typeof rawTimestamp.toDate === 'function') {
      return rawTimestamp.toDate().toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    }

    if (typeof rawTimestamp === 'object' && 'seconds' in rawTimestamp) {
      return new Date(rawTimestamp.seconds * 1000).toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    }

    const d = new Date(rawTimestamp);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    }
  } catch (err) {
    console.warn('Gagal parsing timestamp:', err);
  }

  return String(rawTimestamp);
}

/**
 * Konversi timestamp Firestore ke milidetik epoch agar pengurutan selalu akurat
 */
export function getFirestoreMillis(rawTimestamp: any): number {
  if (!rawTimestamp) return 0;
  if (rawTimestamp instanceof Timestamp) return rawTimestamp.toMillis();
  if (typeof rawTimestamp === 'object' && typeof rawTimestamp.toDate === 'function') {
    return rawTimestamp.toDate().getTime();
  }
  if (typeof rawTimestamp === 'object' && typeof rawTimestamp.toMillis === 'function') {
    return rawTimestamp.toMillis();
  }
  if (typeof rawTimestamp === 'object' && 'seconds' in rawTimestamp) {
    return rawTimestamp.seconds * 1000 + (rawTimestamp.nanoseconds ? rawTimestamp.nanoseconds / 1e6 : 0);
  }
  const d = new Date(rawTimestamp);
  const t = d.getTime();
  return isNaN(t) ? 0 : t;
}

/**
 * Berlangganan data sensor terbaru secara real-time dari Firebase Cloud Firestore
 * Terpisah dari komponen UI untuk arsitektur clean & modular
 */
export function subscribeLatestSensorReadings(
  onData: (readings: SensorReading[]) => void,
  onError?: (err: Error) => void
): () => void {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      orderBy('timestamp', 'desc'),
      limit(60)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const readingsWithTime: { reading: SensorReading; epochMs: number }[] = [];

        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as FirestoreSensorReadingDoc;
          const temp = typeof data.temperature === 'number' ? data.temperature : 0;
          const presKpa = typeof data.pressure_kpa === 'number' ? data.pressure_kpa : 0;
          const presBar =
            typeof data.pressure_bar === 'number'
              ? data.pressure_bar
              : Number((presKpa / 100).toFixed(4));
          const presPsi =
            typeof data.pressure_psi === 'number'
              ? data.pressure_psi
              : Number((presKpa * 0.145038).toFixed(3));
          const rawPres =
            typeof data.raw_pressure === 'number'
              ? data.raw_pressure
              : 0;

          const epochMs = getFirestoreMillis(data.timestamp);

          readingsWithTime.push({
            epochMs,
            reading: {
              id: docSnap.id,
              timestamp: formatFirestoreTimestamp(data.timestamp),
              temperatureC: Number(temp.toFixed(1)),
              pressureKpa: Number(presKpa.toFixed(1)),
              pressureBar: presBar,
              pressurePsi: presPsi,
              rawPressure: rawPres,
              source: 'cloud_hotspot',
              epochMs
            }
          });
        });

        // Urutkan secara akurat berdasarkan waktu epoch menurun (terbaru di index 0)
        readingsWithTime.sort((a, b) => b.epochMs - a.epochMs);
        const readings = readingsWithTime.map((item) => item.reading);

        onData(readings);
      },
      (error) => {
        const err = handleFirestoreError(error, OperationType.LIST, COLLECTION_NAME);
        if (onError) onError(err);
      }
    );

    return unsubscribe;
  } catch (error) {
    const err = handleFirestoreError(error, OperationType.LIST, COLLECTION_NAME);
    if (onError) onError(err);
    return () => {};
  }
}

/**
 * Mengambil data sensor terbaru dari Firestore sekali jalan untuk tombol refresh manual
 */
export async function fetchLatestSensorReadingsOnce(): Promise<SensorReading[]> {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      orderBy('timestamp', 'desc'),
      limit(60)
    );
    const snapshot = await getDocs(q);
    const readingsWithTime: { reading: SensorReading; epochMs: number }[] = [];

    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as FirestoreSensorReadingDoc;
      const temp = typeof data.temperature === 'number' ? data.temperature : 0;
      const presKpa = typeof data.pressure_kpa === 'number' ? data.pressure_kpa : 0;
      const presBar =
        typeof data.pressure_bar === 'number'
          ? data.pressure_bar
          : Number((presKpa / 100).toFixed(4));
      const presPsi =
        typeof data.pressure_psi === 'number'
          ? data.pressure_psi
          : Number((presKpa * 0.145038).toFixed(3));
      const rawPres =
        typeof data.raw_pressure === 'number'
          ? data.raw_pressure
          : 0;

      const epochMs = getFirestoreMillis(data.timestamp);

      readingsWithTime.push({
        epochMs,
        reading: {
          id: docSnap.id,
          timestamp: formatFirestoreTimestamp(data.timestamp),
          temperatureC: Number(temp.toFixed(1)),
          pressureKpa: Number(presKpa.toFixed(1)),
          pressureBar: presBar,
          pressurePsi: presPsi,
          rawPressure: rawPres,
          source: 'cloud_hotspot',
          epochMs
        }
      });
    });

    readingsWithTime.sort((a, b) => b.epochMs - a.epochMs);
    return readingsWithTime.map((item) => item.reading);
  } catch (error) {
    throw handleFirestoreError(error, OperationType.LIST, COLLECTION_NAME);
  }
}

/**
 * Mengirim data pembacaan sensor ke Firestore (misal dari uji live atau emulator ESP32)
 * Data divalidasi ketat agar sesuai dengan skema firebase-blueprint.json & firestore.rules
 */
export async function pushSensorReadingToFirestore(payload: {
  temperature: number;
  pressure_kpa: number;
  pressure_bar?: number;
  pressure_psi?: number;
  raw_pressure?: number;
  timestamp?: string;
}): Promise<string> {
  const kpa = Number(payload.pressure_kpa.toFixed(2));
  const bar = payload.pressure_bar ?? Number((kpa / 100).toFixed(4));
  const psi = payload.pressure_psi ?? Number((kpa * 0.145038).toFixed(3));
  const raw = payload.raw_pressure ?? Math.round(kpa * 8388);
  const temp = Number(payload.temperature.toFixed(2));
  const time = payload.timestamp ?? new Date().toISOString();

  const docPayload = {
    temperature: temp,
    pressure_kpa: kpa,
    pressure_bar: bar,
    pressure_psi: psi,
    raw_pressure: raw,
    timestamp: time
  };

  try {
    const docRef = await addDoc(collection(db, COLLECTION_NAME), docPayload);
    return docRef.id;
  } catch (error) {
    const err = handleFirestoreError(error, OperationType.CREATE, COLLECTION_NAME);
    throw err;
  }
}

export interface DeviceConfig {
  send_interval_sec: 2 | 5 | 10;
  interval_ms: number;
  wifi_ssid?: string;
  wifi_pass?: string;
  ap_ssid?: string;
  ap_pass?: string;
  credentials_version?: string | number;
  last_synced_from?: string;
  updated_at?: string;
  updated_by?: string;
}

/**
 * Berlangganan konfigurasi ESP32 secara real-time dari Firestore
 */
export function subscribeDeviceSettings(
  onData: (config: DeviceConfig) => void,
  onError?: (err: Error) => void
): () => void {
  try {
    const docRef = doc(db, 'device_settings', 'esp32_config');
    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const sec = (data.send_interval_sec === 2 || data.send_interval_sec === 5 || data.send_interval_sec === 10)
            ? data.send_interval_sec
            : 5;
          onData({
            send_interval_sec: sec,
            interval_ms: sec * 1000,
            wifi_ssid: typeof data.wifi_ssid === 'string' ? data.wifi_ssid : '',
            wifi_pass: typeof data.wifi_pass === 'string' ? data.wifi_pass : '',
            ap_ssid: typeof data.ap_ssid === 'string' ? data.ap_ssid : 'FAVORA-ESP32-AP',
            ap_pass: typeof data.ap_pass === 'string' ? data.ap_pass : '12345678',
            credentials_version: data.credentials_version ? String(data.credentials_version) : undefined,
            last_synced_from: data.last_synced_from,
            updated_at: data.updated_at,
            updated_by: data.updated_by
          });
        } else {
          // Default jika belum ada dokumen di Firestore
          onData({
            send_interval_sec: 5,
            interval_ms: 5000,
            wifi_ssid: 'FanraRA',
            wifi_pass: '#I47r32a6',
            ap_ssid: 'FAVORA-ESP32-AP',
            ap_pass: '12345678'
          });
        }
      },
      (error) => {
        const err = handleFirestoreError(error, OperationType.GET, SETTINGS_DOC_PATH);
        if (onError) onError(err);
      }
    );
    return unsubscribe;
  } catch (error) {
    const err = handleFirestoreError(error, OperationType.GET, SETTINGS_DOC_PATH);
    if (onError) onError(err);
    return () => {};
  }
}

/**
 * Mengubah interval pengiriman ESP32 ke Firestore (Hanya untuk akun pemilik)
 */
export async function updateDeviceInterval(
  seconds: 2 | 5 | 10,
  userEmail: string
): Promise<void> {
  try {
    const docRef = doc(db, 'device_settings', 'esp32_config');
    await setDoc(
      docRef,
      {
        send_interval_sec: seconds,
        interval_ms: seconds * 1000,
        updated_at: new Date().toISOString(),
        updated_by: userEmail
      },
      { merge: true }
    );
  } catch (error) {
    const err = handleFirestoreError(error, OperationType.UPDATE, SETTINGS_DOC_PATH);
    throw err;
  }
}

/**
 * Mengubah Kredensial Wi-Fi Target & Hotspot Mandiri (AP) ESP32 dari jarak jauh (Remote Config Cloud)
 */
export async function updateDeviceWifiAndAp(
  credentials: {
    wifi_ssid: string;
    wifi_pass: string;
    ap_ssid: string;
    ap_pass: string;
  },
  userEmail: string
): Promise<void> {
  try {
    const docRef = doc(db, 'device_settings', 'esp32_config');
    const version = String(Date.now());
    await setDoc(
      docRef,
      {
        wifi_ssid: credentials.wifi_ssid,
        wifi_pass: credentials.wifi_pass,
        ap_ssid: credentials.ap_ssid.trim() || 'FAVORA-ESP32-AP',
        ap_pass: credentials.ap_pass || '12345678',
        credentials_version: version,
        last_synced_from: 'web_portal',
        credentials_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: userEmail
      },
      { merge: true }
    );
  } catch (error) {
    const err = handleFirestoreError(error, OperationType.UPDATE, SETTINGS_DOC_PATH);
    throw err;
  }
}

const THRESHOLDS_DOC_PATH = 'device_settings/thresholds';

/**
 * Berlangganan konfigurasi batas optimal sensor (thresholds) secara real-time dari Firestore
 * Sinkron untuk seluruh pengguna (admin & penonton)
 */
export function subscribeThresholdSettings(
  onData: (thresholds: any) => void,
  onError?: (err: Error) => void
): () => void {
  try {
    const docRef = doc(db, 'device_settings', 'thresholds');
    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          onData(data);
        }
      },
      (error) => {
        const err = handleFirestoreError(error, OperationType.GET, THRESHOLDS_DOC_PATH);
        if (onError) onError(err);
      }
    );
    return unsubscribe;
  } catch (error) {
    const err = handleFirestoreError(error, OperationType.GET, THRESHOLDS_DOC_PATH);
    if (onError) onError(err);
    return () => {};
  }
}

/**
 * Mengubah batas optimal suhu & tekanan ke Firestore (Hanya untuk akun pemilik/admin)
 * Perubahan akan langsung disinkronkan ke semua orang
 */
export async function updateThresholdSettings(
  thresholds: {
    tempMinOptimal: number;
    tempMaxOptimal: number;
    tempCritical: number;
    pressureMinUse: number;
    pressureMaxSafe: number;
    pressureCritical: number;
  },
  userEmail: string
): Promise<void> {
  try {
    const docRef = doc(db, 'device_settings', 'thresholds');
    await setDoc(
      docRef,
      {
        ...thresholds,
        updated_at: new Date().toISOString(),
        updated_by: userEmail
      },
      { merge: true }
    );
  } catch (error) {
    const err = handleFirestoreError(error, OperationType.UPDATE, THRESHOLDS_DOC_PATH);
    throw err;
  }
}

