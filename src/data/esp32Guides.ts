import { InfoContent, ConnectionMethod } from '../types/biogas';

export const INFO_TOPICS: Record<string, InfoContent> = {
  temperature_indicator: {
    id: 'temperature_indicator',
    title: 'Sensor Suhu Inframerah (°C)',
    subtitle: 'Pemantauan Suhu Non-Kontak GY-906',
    summary: 'Menampilkan temperatur objek non-kontak secara realtime dari sensor inframerah GY-906 (MLX90614ESF) pada sistem FAVORA.',
    bullets: [
      'Sensor Termometer Inframerah Non-Kontak GY-906 (IC Melexis MLX90614ESF).',
      'Mengukur suhu objek presisi tanpa perlu menyentuh permukaan target.',
      'Rentang optimal standar: 30–40 °C (dapat disesuaikan di menu Pengaturan).',
      'Komunikasi I2C standar ESP32 (SDA: GPIO 21, SCL: GPIO 22, Alamat: 0x5A).'
    ]
  },
  method_bluetooth: {
    id: 'method_bluetooth',
    title: 'Bluetooth Langsung (BLE)',
    subtitle: 'Tanpa Wi-Fi & Tanpa Kuota',
    summary: 'Hubungkan HP atau laptop langsung ke modul ESP32 dalam jarak 1–15 meter.',
    bullets: [
      'Tidak perlu router Wi-Fi atau paket internet di lokasi alat.',
      'Cukup nyalakan ESP32, buka Chrome di HP/Laptop, lalu klik Hubungkan.',
      'Sangat praktis untuk pengujian langsung di dekat sensor FAVORA.'
    ]
  },
  method_wifi_local: {
    id: 'method_wifi_local',
    title: 'Wi-Fi Lokal ESP32',
    subtitle: 'Hotspot Mandiri ESP32',
    summary: 'ESP32 memancarkan sinyal Wi-Fi sendiri tanpa memerlukan internet luar.',
    bullets: [
      'Sambungkan Wi-Fi HP ke hotspot ESP32 (192.168.4.1).',
      'Data suhu inframerah diambil langsung dari endpoint lokal (/data).',
      'Jangkauan 10–25 meter, stabil untuk monitoring lokal.'
    ]
  },
  method_cloud_hotspot: {
    id: 'method_cloud_hotspot',
    title: 'Firebase Cloud Firestore',
    subtitle: 'Pantau Online via Cloud Database',
    summary: 'Pantau data suhu live dari mana saja lewat Google Cloud Firestore terenkripsi (Proyek: pvngblock).',
    bullets: [
      'Koleksi Firestore: "sensor_readings" terintegrasi real-time.',
      'Menyimpan pembacaan temperatur Celsius dan timestamp secara otomatis.',
      'Dapat diakses secara publik oleh seluruh tim di browser dan HP.'
    ]
  },
  method_usb_serial: {
    id: 'method_usb_serial',
    title: 'Kabel USB Serial',
    subtitle: 'Koneksi Kabel Data ke Laptop',
    summary: 'Baca data sensor langsung lewat kabel USB tanpa setting jaringan.',
    bullets: [
      'Colok kabel USB ESP32 ke port laptop (Baud 115200).',
      'Gunakan browser Chrome / Edge di laptop.',
      'Praktis untuk debugging awal dan monitoring via kabel serial.'
    ]
  },
  method_simulation: {
    id: 'method_simulation',
    title: 'Mode Simulasi',
    subtitle: 'Pengujian Tampilan',
    summary: 'Uji tampilan indikator dan grafik suhu sebelum alat fisik terhubung.',
    bullets: [
      'Menghasilkan pola fluktuasi suhu dinamis untuk menguji grafik.',
      'Memudahkan demonstrasi dan pengecekan fungsi alarm suhu.'
    ]
  },
  wiring_pinout: {
    id: 'wiring_pinout',
    title: 'Pinout Sensor GY-906 ke ESP32',
    subtitle: 'Koneksi I2C MLX90614ESF ke Board ESP32',
    summary: 'Skema koneksi kabel modul sensor inframerah GY-906 ke ESP32 Dev Module.',
    bullets: [
      'VIN → Pin 3V3 (3.3V) ESP32 (Tegangan kerja aman 3.3V).',
      'GND → Pin GND ESP32.',
      'SCL → Pin GPIO 22 ESP32 (I2C Clock).',
      'SDA → Pin GPIO 21 ESP32 (I2C Data).',
      'Alamat I2C: 0x5A (Otomatis terhubung tanpa solder jumper).'
    ]
  }
};

export const ARDUINO_SKETCHES: Record<
  Exclude<ConnectionMethod, 'simulation'>,
  { title: string; description: string; code: string }
> = {
  cloud_hotspot: {
    title: 'Kode Arduino ESP32 — Firebase Cloud Firestore (Sensor GY-906)',
    description: 'ESP32 membaca suhu objek inframerah GY-906 (MLX90614) via I2C, lalu mengirim ke Firebase Cloud (pvngblock).',
    code: `/*
 * FAVORA — IoT Non-Contact Infrared Temperature Monitoring
 * Hardware: ESP32 + Sensor Inframerah GY-906 (MLX90614ESF)
 * Pinout: VIN->3V3, GND->GND, SCL->GPIO 22, SDA->GPIO 21
 * Library Arduino: "Adafruit MLX90614 Library" & "ArduinoJson"
 */

#include <Wire.h>
#include <Adafruit_MLX90614.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <time.h>

constexpr uint8_t PIN_SDA = 21;
constexpr uint8_t PIN_SCL = 22;

Adafruit_MLX90614 mlx = Adafruit_MLX90614();
bool sensorOk = false;

const char* ssid = "FanraRA";
const char* password = "#I47r32a6";

const char* FIREBASE_API_KEY    = "AIzaSyBI-UaWx_Tgo15266t49zO8z8GkDSCaAvo";
const char* FIREBASE_PROJECT_ID = "pvngblock";

bool initSensor() {
  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.beginTransmission(0x5A);
  if (Wire.endTransmission() == 0 && mlx.begin()) {
    sensorOk = true;
    Serial.println("[Sensor] Sensor Inframerah GY-906 (MLX90614) SIAP!");
    return true;
  }
  sensorOk = false;
  Serial.println("[ERROR] Sensor GY-906 tidak terdeteksi pada 0x5A! Periksa SDA (21) & SCL (22).");
  return false;
}

bool readTempC(float &tempOut) {
  if (!sensorOk && !initSensor()) return false;
  double t = mlx.readObjectTempC();
  if (isnan(t) || t < -65.0 || t > 380.0) return false;
  tempOut = (float)t;
  return true;
}

void sendFirestore(float suhu) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[Firestore] Wi-Fi terputus!");
    return;
  }
  WiFiClientSecure client; client.setInsecure();
  HTTPClient https;
  String docId = "esp32_" + String(millis());
  String url = "https://firestore.googleapis.com/v1/projects/" + String(FIREBASE_PROJECT_ID) +
               "/databases/(default)/documents/sensor_readings?documentId=" + docId +
               "&key=" + String(FIREBASE_API_KEY);
  if (!https.begin(client, url)) return;
  https.addHeader("Content-Type", "application/json");

  char rfc[32];
  time_t now = time(nullptr);
  if (now > 1704067200) {
    struct tm tinfo; gmtime_r(&now, &tinfo);
    strftime(rfc, sizeof(rfc), "%Y-%m-%dT%H:%M:%SZ", &tinfo);
  } else {
    unsigned long s = millis() / 1000UL;
    snprintf(rfc, sizeof(rfc), "2026-11-08T%02lu:%02lu:%02luZ", (s / 3600UL) % 24, (s / 60UL) % 60, s % 60);
  }

  String payload = "{\\"fields\\": {"
    "\\"temperature\\": {\\"doubleValue\\": " + String(suhu, 2) + "},"
    "\\"sensor_model\\": {\\"stringValue\\": \\"GY-906 (MLX90614)\\"},"
    "\\"pressure_kpa\\": {\\"doubleValue\\": 0.0},"
    "\\"timestamp\\": {\\"timestampValue\\": \\"" + String(rfc) + "\\"}"
  "}}";

  Serial.printf("[Firestore] Mengirim data: %.2f °C ... ", suhu);
  int httpCode = https.POST(payload);
  Serial.printf("HTTP Code: %d\\n", httpCode);

  if (httpCode == 200 || httpCode == 201) {
    Serial.println("  ✅ SUKSES: Data suhu berhasil tersimpan di Firestore!");
  } else if (httpCode == 403) {
    Serial.println("  ⚠️ GAGAL 403: Rules di Firebase Console masih terkunci!");
    Serial.println("     Buka Firebase Console -> Firestore Database -> Rules:");
    Serial.println("     Ubah jadi: match /{document=**} { allow read, write: if true; }");
  } else {
    Serial.printf("  Detail: %s\\n", https.getString().c_str());
  }

  https.end();
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\\n=== FAVORA — ESP32 Sensor Inframerah GY-906 ===");
  initSensor();
  WiFi.begin(ssid, password);
  Serial.printf("Menghubungkan ke Wi-Fi '%s'", ssid);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.printf("\\nWi-Fi Terhubung! IP: %s\\n", WiFi.localIP().toString().c_str());
  configTime(0, 0, "time.google.com", "pool.ntp.org");
}

void loop() {
  float temp = 0.0f;
  if (readTempC(temp)) {
    Serial.printf("[Sensor MLX90614] Suhu Objek: %.2f °C\\n", temp);
    sendFirestore(temp);
  } else {
    Serial.println("[Sensor ERROR] Gagal membaca sensor GY-906. Tanpa data palsu!");
  }
  delay(5000);
}`
  },

  wifi_local: {
    title: 'Kode Arduino ESP32 — Wi-Fi Lokal Web Server (Sensor GY-906)',
    description: 'ESP32 memancarkan hotspot (192.168.4.1) dan melayani data suhu inframerah dalam format JSON /data.',
    code: `/*
 * FAVORA — Wi-Fi Lokal Hotspot Web Server (Sensor Inframerah GY-906)
 * Library: "Adafruit MLX90614 Library" by Adafruit
 */

#include <Wire.h>
#include <Adafruit_MLX90614.h>
#include <WiFi.h>
#include <WebServer.h>

Adafruit_MLX90614 mlx = Adafruit_MLX90614();
bool sensorOk = false;

const char *ssid = "FAVORA-ESP32-AP";
const char *password = "12345678";

WebServer server(80);

bool initSensor() {
  Wire.begin(21, 22);
  Wire.beginTransmission(0x5A);
  if (Wire.endTransmission() == 0 && mlx.begin()) {
    sensorOk = true;
    return true;
  }
  sensorOk = false;
  return false;
}

bool readTemp(float &tVal) {
  if (!sensorOk && !initSensor()) return false;
  double t = mlx.readObjectTempC();
  if (isnan(t) || t < -65.0 || t > 380.0) return false;
  tVal = (float)t;
  return true;
}

void handleData() {
  float suhu = 0.0f;
  bool ok = readTemp(suhu);
  String json = "";
  if (ok) {
    json = "{\\"connected\\":true,\\"sensor\\":\\"GY-906 (MLX90614)\\",\\"temperatureC\\":" + String(suhu, 1) + "}";
  } else {
    json = "{\\"connected\\":false,\\"error\\":\\"Sensor GY-906 tidak terdeteksi\\"}";
  }
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", json);
}

void setup() {
  Serial.begin(115200);
  initSensor();
  WiFi.softAP(ssid, password);
  Serial.println("Hotspot FAVORA Aktif: " + WiFi.softAPIP().toString());
  server.on("/data", handleData);
  server.begin();
}

void loop() {
  server.handleClient();
  delay(10);
}`
  },

  bluetooth: {
    title: 'Kode Arduino ESP32 — Bluetooth BLE (Sensor GY-906)',
    description: 'Kirim data suhu Celsius inframerah via Bluetooth BLE langsung ke HP atau Laptop tanpa router Wi-Fi.',
    code: `/*
 * FAVORA — Bluetooth BLE (Sensor Inframerah GY-906)
 * Library: Adafruit MLX90614 Library
 */

#include <Wire.h>
#include <Adafruit_MLX90614.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

Adafruit_MLX90614 mlx = Adafruit_MLX90614();
bool sensorOk = false;

#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

BLEServer* pServer = NULL;
BLECharacteristic* pCharacteristic = NULL;
bool deviceConnected = false;

class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) { deviceConnected = true; };
    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      BLEDevice::startAdvertising();
    }
};

bool initSensor() {
  Wire.begin(21, 22);
  Wire.beginTransmission(0x5A);
  if (Wire.endTransmission() == 0 && mlx.begin()) {
    sensorOk = true;
    return true;
  }
  return false;
}

bool readTemp(float &tVal) {
  if (!sensorOk && !initSensor()) return false;
  double t = mlx.readObjectTempC();
  if (isnan(t)) return false;
  tVal = (float)t;
  return true;
}

void setup() {
  Serial.begin(115200);
  initSensor();

  BLEDevice::init("FAVORA-ESP32");
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);
  pCharacteristic = pService->createCharacteristic(
                      CHARACTERISTIC_UUID,
                      BLECharacteristic::PROPERTY_READ |
                      BLECharacteristic::PROPERTY_NOTIFY
                    );
  pCharacteristic->addDescriptor(new BLE2902());
  pService->start();

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  BLEDevice::startAdvertising();
  Serial.println("Bluetooth BLE FAVORA Aktif. Siap dihubungkan.");
}

void loop() {
  float suhu = 0.0f;
  if (readTemp(suhu)) {
    String payload = "{\\"temperatureC\\":" + String(suhu, 1) + "}";
    if (deviceConnected) {
      pCharacteristic->setValue(payload.c_str());
      pCharacteristic->notify();
      Serial.println("BLE Notify: " + payload);
    }
  } else {
    Serial.println("[Sensor ERROR] Gagal membaca sensor GY-906.");
  }
  delay(3000);
}`
  },

  usb_serial: {
    title: 'Kode Arduino ESP32 — USB Serial (Sensor GY-906)',
    description: 'Mencetak data suhu Celsius inframerah ke port Serial (Baud 115200) untuk dibaca langsung oleh Web Serial di browser.',
    code: `/*
 * FAVORA — USB Serial Monitor (Sensor Inframerah GY-906 / MLX90614)
 * Pinout: VIN->3V3, GND->GND, SCL->GPIO 22, SDA->GPIO 21
 */

#include <Wire.h>
#include <Adafruit_MLX90614.h>

Adafruit_MLX90614 mlx = Adafruit_MLX90614();
bool sensorOk = false;

bool initSensor() {
  Wire.begin(21, 22);
  Wire.beginTransmission(0x5A);
  if (Wire.endTransmission() == 0 && mlx.begin()) {
    sensorOk = true;
    Serial.println("[Sensor] Sensor Inframerah GY-906 (MLX90614) Terdeteksi (0x5A)");
    return true;
  }
  Serial.println("[ERROR] Sensor GY-906 tidak terdeteksi pada alamat 0x5A!");
  return false;
}

bool readTemp(float &tVal) {
  if (!sensorOk && !initSensor()) return false;
  double t = mlx.readObjectTempC();
  if (isnan(t)) return false;
  tVal = (float)t;
  return true;
}

void setup() {
  Serial.begin(115200);
  initSensor();
  Serial.println("FAVORA — Sensor Suhu Inframerah Siap (Baud 115200)");
}

void loop() {
  float suhu = 0.0f;
  if (readTemp(suhu)) {
    Serial.println("{\\"temperatureC\\":" + String(suhu, 1) + "}");
  } else {
    Serial.println("{\\"error\\":\\"Sensor tidak terdeteksi\\"}");
  }
  delay(2000);
}`
  }
};
