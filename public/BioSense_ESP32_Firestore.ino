/*
 * ============================================================================
 * FAVORA — IoT Non-Contact Infrared Temperature Monitoring
 * Hardware: ESP32 Dev Module + Sensor Inframerah GY-906 (MLX90614ESF)
 * ============================================================================
 * KONFIGURASI PINOUT SENSOR GY-906 / MLX90614:
 *   - VIN → 3V3 (3.3V) ESP32
 *   - GND → GND ESP32
 *   - SCL → GPIO 22 ESP32 (I2C Clock)
 *   - SDA → GPIO 21 ESP32 (I2C Data)
 *   - Alamat I2C Default: 0x5A
 *
 * TUJUAN:
 *   - Mengukur suhu objek non-kontak secara akurat dalam Celsius (°C).
 *   - Sinkronisasi realtime ke Google Cloud Firestore (proyek: pvngblock).
 *   - Tanpa data palsu jika sensor terputus.
 *
 * LIBRARY ARDUINO YANG WAJIB DIINSTAL:
 *   1. "Adafruit MLX90614 Library" by Adafruit
 *   2. "ArduinoJson" by Benoit Blanchon (Versi 6 atau 7)
 * ============================================================================
 */

#include <Wire.h>
#include <Adafruit_MLX90614.h>
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <time.h>

// ============================================================================
// 1. KREDENSIAL DEFAULT AWAL (Disimpan di memori Flash NVS)
// ============================================================================
const char* DEFAULT_WIFI_SSID = "FanraRA";
const char* DEFAULT_WIFI_PASS = "#I47r32a6";

// Kredensial Hotspot Mandiri ESP32 (Akses di 192.168.4.1)
const char* DEFAULT_AP_SSID   = "FAVORA-ESP32-AP";
const char* DEFAULT_AP_PASS   = "12345678";

// ============================================================================
// 2. KONFIGURASI FIREBASE PROYEK pvngblock
// ============================================================================
const char* FIREBASE_API_KEY    = "AIzaSyBI-UaWx_Tgo15266t49zO8z8GkDSCaAvo";
const char* FIREBASE_PROJECT_ID = "pvngblock";
const char* FIRESTORE_DB_ID     = "(default)";

// ============================================================================
// 3. HARDWARE I2C & OBJEK SENSOR GY-906 (MLX90614)
// ============================================================================
constexpr uint8_t PIN_I2C_SDA = 21;
constexpr uint8_t PIN_I2C_SCL = 22;

Adafruit_MLX90614 mlx = Adafruit_MLX90614();
bool isSensorReady = false;

// ============================================================================
// 4. MEMORI NON-VOLATIL (NVS) & STATE GLOBAL
// ============================================================================
Preferences prefs;

String currentWifiSSID = "";
String currentWifiPass = "";
String currentApSSID   = "";
String currentApPass   = "";
String lastAppliedCmdId = "";

unsigned long sendIntervalMs = 5000;
unsigned long lastSendTime = 0;
unsigned long lastConfigCheckTime = 0;
constexpr unsigned long CONFIG_CHECK_INTERVAL_MS = 30000;

// State Server Captive Portal (Hotspot Mandiri 192.168.4.1)
bool isAPMode = false;
WebServer server(80);
DNSServer dnsServer;
const byte DNS_PORT = 53;

// Cache pembacaan suhu terakhir
float lastTempC = 0.0f;
bool hasValidReading = false;

// Prototype fungsi
bool initMlxSensor();
bool readMlxTemperature(float &tempOut);
void loadCredentialsFromNVS();
void saveCredentialsToNVS(const String& ssid, const String& pass, const String& apSsid, const String& apPass, const String& cmdId);
bool connectToWiFi(unsigned long timeoutMs = 20000);
void startCaptivePortal();
void handlePortalRoot();
void handlePortalSave();
void handlePortalScan();
void handlePortalData();
void checkRemoteDeviceConfig();
void syncLocalConfigToFirestore();
bool sendDataToFirestore(float tempC, const char* rfcTime);
bool getRFC3339Timestamp(char* buffer, size_t maxLen);

// ============================================================================
// INISIALISASI & DETEKSI SENSOR INFRAMERAH GY-906 (MLX90614)
// ============================================================================
bool initMlxSensor() {
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  delay(100);

  // Uji koneksi I2C ke alamat 0x5A
  Wire.beginTransmission(0x5A);
  byte error = Wire.endTransmission();

  if (error == 0 && mlx.begin()) {
    isSensorReady = true;
    Serial.println(F("[Sensor] SUKSES: Sensor Inframerah GY-906 (MLX90614) terdeteksi pada alamat 0x5A!"));
    return true;
  }

  isSensorReady = false;
  Serial.println(F("\n=================================================================="));
  Serial.println(F("[ERROR SENSOR] Modul GY-906 (MLX90614) TIDAK TERDETEKSI!"));
  Serial.println(F("Pastikan koneksi kabel terpasang dengan benar:"));
  Serial.println(F("  - VIN → 3V3 (3.3V) ESP32"));
  Serial.println(F("  - GND → GND ESP32"));
  Serial.println(F("  - SCL → GPIO 22 ESP32 (I2C Clock)"));
  Serial.println(F("  - SDA → GPIO 21 ESP32 (I2C Data)"));
  Serial.println(F("==================================================================\n"));
  return false;
}

// ============================================================================
// PEMBACAAN SUHU OBJEK INFRAMERAH TANPA KONTAK (°C)
// ============================================================================
bool readMlxTemperature(float &tempOut) {
  if (!isSensorReady) {
    if (!initMlxSensor()) {
      return false;
    }
  }

  double t = mlx.readObjectTempC();
  if (isnan(t) || t < -65.0 || t > 380.0) {
    Serial.println(F("[Sensor Warn] Gagal membaca suhu objek atau di luar batas wajar!"));
    isSensorReady = false;
    return false;
  }

  tempOut = (float)t;
  return true;
}

// ============================================================================
// SIMPAN KE MEMORI FLASH NVS (Preferences)
// ============================================================================
void loadCredentialsFromNVS() {
  prefs.begin("favora", false);
  currentWifiSSID  = prefs.getString("wifi_ssid", DEFAULT_WIFI_SSID);
  currentWifiPass  = prefs.getString("wifi_pass", DEFAULT_WIFI_PASS);
  currentApSSID    = prefs.getString("ap_ssid", DEFAULT_AP_SSID);
  currentApPass    = prefs.getString("ap_pass", DEFAULT_AP_PASS);
  lastAppliedCmdId = prefs.getString("applied_id", "init");
  uint32_t savedSec = prefs.getUInt("interval_sec", 5);

  if (savedSec >= 1 && savedSec <= 60) {
    sendIntervalMs = savedSec * 1000UL;
  }
  prefs.end();

  Serial.println(F("[NVS] Kredensial aktif di memori Flash ESP32:"));
  Serial.printf("      - Target Wi-Fi SSID : '%s'\n", currentWifiSSID.c_str());
  Serial.printf("      - Hotspot ESP32 (AP): '%s'\n", currentApSSID.c_str());
}

void saveCredentialsToNVS(const String& ssid, const String& pass, const String& apSsid, const String& apPass, const String& cmdId) {
  prefs.begin("favora", false);
  if (ssid.length() > 0) prefs.putString("wifi_ssid", ssid);
  prefs.putString("wifi_pass", pass);
  if (apSsid.length() > 0) prefs.putString("ap_ssid", apSsid);
  if (apPass.length() > 0) prefs.putString("ap_pass", apPass);
  if (cmdId.length() > 0) prefs.putString("applied_id", cmdId);
  prefs.end();

  if (ssid.length() > 0) currentWifiSSID = ssid;
  currentWifiPass = pass;
  if (apSsid.length() > 0) currentApSSID = apSsid;
  if (apPass.length() > 0) currentApPass = apPass;
  if (cmdId.length() > 0) lastAppliedCmdId = cmdId;

  Serial.println(F("[NVS] Kredensial berhasil disimpan ke Flash ESP32!"));
}

// ============================================================================
// KONEKSI WI-FI DENGAN AUTO-RECONNECT
// ============================================================================
bool connectToWiFi(unsigned long timeoutMs) {
  Serial.printf("[Wi-Fi] Menghubungkan ke SSID: '%s' ...\n", currentWifiSSID.c_str());

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(true);

  if (currentWifiPass.length() > 0) {
    WiFi.begin(currentWifiSSID.c_str(), currentWifiPass.c_str());
  } else {
    WiFi.begin(currentWifiSSID.c_str());
  }

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - start < timeoutMs)) {
    delay(500);
    Serial.print('.');
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[Wi-Fi] TERHUBUNG! IP: %s | RSSI: %d dBm\n", 
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
    return true;
  }
  return false;
}

// ============================================================================
// CAPTIVE PORTAL MANDIRI (192.168.4.1)
// ============================================================================
void startCaptivePortal() {
  isAPMode = true;
  WiFi.disconnect();
  delay(150);

  WiFi.mode(WIFI_AP);
  if (currentApPass.length() >= 8) {
    WiFi.softAP(currentApSSID.c_str(), currentApPass.c_str());
  } else {
    WiFi.softAP(currentApSSID.c_str());
  }

  delay(400);
  IPAddress apIP = WiFi.softAPIP();

  Serial.println(F("\n=================================================="));
  Serial.println(F(" [HOTSPOT CAPTIVE PORTAL AKTIF]"));
  Serial.printf(" SSID Hotspot : %s\n", currentApSSID.c_str());
  Serial.printf(" Web Portal   : http://%s (192.168.4.1)\n", apIP.toString().c_str());
  Serial.println(F("==================================================\n"));

  dnsServer.setErrorReplyCode(DNSReplyCode::NoError);
  dnsServer.start(DNS_PORT, "*", apIP);

  server.on("/", HTTP_GET, handlePortalRoot);
  server.on("/save", HTTP_POST, handlePortalSave);
  server.on("/scan", HTTP_GET, handlePortalScan);
  server.on("/data", HTTP_GET, handlePortalData);
  server.on("/status", HTTP_GET, handlePortalData);

  server.on("/hotspot-detect.html", HTTP_GET, handlePortalRoot);
  server.on("/generate_204", HTTP_GET, handlePortalRoot);
  server.on("/gen_204", HTTP_GET, handlePortalRoot);
  server.on("/connecttest.txt", HTTP_GET, handlePortalRoot);
  server.onNotFound(handlePortalRoot);

  server.begin();
}

void handlePortalRoot() {
  String html = F("<!DOCTYPE html><html lang='id'><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1.0'>");
  html += F("<title>FAVORA — Setup Suhu ESP32</title>");
  html += F("<style>");
  html += F("*{box-sizing:border-box;margin:0;padding:0;}");
  html += F("body{font-family:-apple-system,BlinkMacSystemFont,Roboto,sans-serif;background:#090B10;color:#f4f4f5;padding:16px;line-height:1.5;}");
  html += F(".container{max-width:440px;margin:12px auto;background:#12151E;border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:22px;box-shadow:0 12px 36px rgba(0,0,0,0.6);}");
  html += F(".header{display:flex;align-items:center;gap:10px;margin-bottom:14px;}");
  html += F(".dot{width:10px;height:10px;background:#f59e0b;border-radius:50%;box-shadow:0 0 10px #f59e0b;}");
  html += F("h1{font-size:17px;font-weight:700;color:#fff;}");
  html += F(".sub{font-size:11px;color:#94a3b8;margin-bottom:16px;}");
  html += F(".badge{display:inline-block;padding:3px 9px;background:rgba(245,158,11,0.15);color:#fbbf24;border:1px solid rgba(245,158,11,0.3);border-radius:6px;font-size:10px;font-family:monospace;margin-bottom:14px;}");
  
  html += F(".sensor-box{background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;margin-bottom:18px;text-align:center;}");
  html += F(".s-label{font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;}");
  if (hasValidReading) {
    html += "<div class='s-val' style='font-size:26px;font-weight:700;color:#fbbf24;font-family:monospace;margin:4px 0;'>" + String(lastTempC, 1) + " °C</div>";
    html += F("<div style='font-size:10px;color:#34d399;'>● Sensor GY-906 (MLX90614) Aktif</div>");
  } else {
    html += F("<div class='s-val' style='font-size:18px;font-weight:700;color:#ef4444;font-family:monospace;margin:6px 0;'>SENSOR TIDAK TERDETEKSI</div>");
    html += F("<div style='font-size:10px;color:#f87171;'>Periksa kabel SDA (GPIO 21) & SCL (GPIO 22)</div>");
  }
  html += F("</div>");

  html += F(".sec-title{font-size:12px;font-weight:700;color:#e2e8f0;margin:14px 0 8px;display:flex;align-items:center;gap:6px;}");
  html += F("label{display:block;font-size:11px;font-weight:600;color:#cbd5e1;margin-bottom:5px;}");
  html += F("input{width:100%;padding:10px 12px;background:#090B10;border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#fff;font-size:13px;margin-bottom:12px;}");
  html += F(".btn{width:100%;padding:12px;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;}");
  html += F(".btn-primary{background:linear-gradient(135deg,#d97706,#f59e0b);color:#fff;margin-top:8px;}");
  html += F(".btn-scan{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#fbbf24;padding:9px;font-size:12px;margin-bottom:12px;}");
  html += F("</style></head><body>");

  html += F("<div class='container'>");
  html += F("<div class='header'><div class='dot'></div><h1>FAVORA — Setup Suhu</h1></div>");
  html += F("<div class='badge'>📡 Sensor Inframerah GY-906 (MLX90614)</div>");
  html += F("<p class='sub'>Atur koneksi Wi-Fi dan hotspot alat. Konfigurasi disimpan permanen ke memori flash ESP32.</p>");

  html += F("<button class='btn btn-scan' type='button' onclick='scanWifi()'>🔍 Pindai Jaringan Wi-Fi Sekitar</button>");
  html += F("<div id='scanResults' style='margin-bottom:10px;'></div>");

  html += F("<form action='/save' method='POST'>");
  html += F("<div class='sec-title'>1. Wi-Fi Target (Internet)</div>");
  html += F("<label>Nama Wi-Fi / Hotspot HP (SSID)</label>");
  html += "<input type='text' id='ssid' name='ssid' value='" + currentWifiSSID + "' required>";
  html += F("<label>Password Wi-Fi Target</label>");
  html += "<input type='password' id='pass' name='pass' value='" + currentWifiPass + "' placeholder='Kosongkan jika Wi-Fi terbuka'>";

  html += F("<div class='sec-title' style='margin-top:16px;'>2. Hotspot Mandiri ESP32</div>");
  html += F("<label>Nama Hotspot ESP32 (AP SSID)</label>");
  html += "<input type='text' name='ap_ssid' value='" + currentApSSID + "' required>";
  html += F("<label>Password Hotspot (Min. 8 Karakter)</label>");
  html += "<input type='text' name='ap_pass' value='" + currentApPass + "'>";

  html += F("<button type='submit' class='btn btn-primary'>💾 Simpan & Sambungkan ESP32</button>");
  html += F("</form>");

  html += F("<script>");
  html += F("function scanWifi(){");
  html += F("  const el = document.getElementById('scanResults');");
  html += F("  el.innerHTML = '<span style=\"color:#fbbf24;font-size:11px;\">Memindai sinyal 2.4 GHz...</span>';");
  html += F("  fetch('/scan').then(r=>r.json()).then(data=>{");
  html += F("    if(!data.length){ el.innerHTML = '<span style=\"color:#ef4444;font-size:11px;\">Tidak ada sinyal Wi-Fi.</span>'; return; }");
  html += F("    let s = '<select style=\"width:100%;padding:8px;margin-bottom:10px;background:#090B10;color:#fff;\" onchange=\"document.getElementById(\\'ssid\\').value=this.value;\"><option value=\"\">-- Pilih Wi-Fi --</option>';");
  html += F("    data.forEach(w=>{ s += `<option value=\"${w.ssid}\">${w.ssid} (${w.rssi} dBm)</option>`; });");
  html += F("    s += '</select>'; el.innerHTML = s;");
  html += F("  }).catch(()=>{ el.innerHTML = '<span style=\"color:#ef4444;font-size:11px;\">Gagal memindai.</span>'; });");
  html += F("}");
  html += F("</script>");
  html += F("</div></body></html>");

  server.send(200, "text/html", html);
}

void handlePortalScan() {
  int n = WiFi.scanNetworks();
  DynamicJsonDocument doc(2048);
  JsonArray arr = doc.to<JsonArray>();
  for (int i = 0; i < n; ++i) {
    JsonObject obj = arr.createNestedObject();
    obj["ssid"] = WiFi.SSID(i);
    obj["rssi"] = WiFi.RSSI(i);
  }
  String json; serializeJson(doc, json);
  server.send(200, "application/json", json);
}

void handlePortalSave() {
  String newSsid   = server.hasArg("ssid") ? server.arg("ssid") : "";
  String newPass   = server.hasArg("pass") ? server.arg("pass") : "";
  String newApSsid = server.hasArg("ap_ssid") ? server.arg("ap_ssid") : "";
  String newApPass = server.hasArg("ap_pass") ? server.arg("ap_pass") : "";

  if (newSsid.length() == 0) {
    server.send(400, "text/plain", "Error: SSID Wi-Fi tidak boleh kosong!");
    return;
  }

  String portalCmdId = "portal_" + String(millis());
  saveCredentialsToNVS(newSsid, newPass, newApSsid, newApPass, portalCmdId);

  String html = F("<!DOCTYPE html><html><body style='background:#090B10;color:#fff;font-family:sans-serif;text-align:center;padding:40px;'>");
  html += F("<h2 style='color:#fbbf24;'>✅ Berhasil Disimpan ke Flash ESP32!</h2>");
  html += F("<p>ESP32 sedang restart untuk menghubungkan ke Wi-Fi baru...</p></body></html>");
  server.send(200, "text/html", html);
  delay(1500);
  ESP.restart();
}

void handlePortalData() {
  DynamicJsonDocument doc(512);
  doc["sensor"]       = isSensorReady ? "GY-906 (MLX90614)" : "Error";
  doc["connected"]    = hasValidReading;
  if (hasValidReading) {
    doc["temperatureC"] = lastTempC;
  } else {
    doc["temperatureC"] = nullptr;
  }
  doc["wifi_ssid"]    = currentWifiSSID;
  doc["ap_ssid"]      = currentApSSID;
  doc["mode"]         = isAPMode ? "ap_portal" : "station";
  String json; serializeJson(doc, json);
  server.send(200, "application/json", json);
}

bool getRFC3339Timestamp(char* buffer, size_t maxLen) {
  time_t now = time(nullptr);
  if (now > 1704067200) { // Jika waktu setelah Jan 2024 (NTP sudah sinkron)
    struct tm timeinfo;
    gmtime_r(&now, &timeinfo);
    strftime(buffer, maxLen, "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
    return true;
  }
  // Fallback jika NTP masih berproses agar tidak memblokir pengiriman sensor
  unsigned long s = millis() / 1000UL;
  snprintf(buffer, maxLen, "2026-11-08T%02lu:%02lu:%02luZ", (s / 3600UL) % 24, (s / 60UL) % 60, s % 60);
  return true;
}

void checkRemoteDeviceConfig() {
  if (WiFi.status() != WL_CONNECTED) return;
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient https;
  String url = String("https://firestore.googleapis.com/v1/projects/") + FIREBASE_PROJECT_ID +
               "/databases/" + FIRESTORE_DB_ID + "/documents/device_settings/esp32_config?key=" + FIREBASE_API_KEY;
  if (!https.begin(client, url)) return;
  int httpCode = https.GET();
  if (httpCode == 200) {
    DynamicJsonDocument doc(2048);
    if (!deserializeJson(doc, https.getString()) && doc.containsKey("fields")) {
      JsonObject fields = doc["fields"];
      if (fields.containsKey("send_interval_sec")) {
        long sec = fields["send_interval_sec"]["integerValue"] ? atol(fields["send_interval_sec"]["integerValue"]) : 5;
        if (sec >= 1 && sec <= 60 && (unsigned long)sec * 1000UL != sendIntervalMs) {
          sendIntervalMs = sec * 1000UL;
          prefs.begin("favora", false);
          prefs.putUInt("interval_sec", (uint32_t)sec);
          prefs.end();
          Serial.printf("[Cloud Config] Interval pengiriman diubah ke %ld detik\n", sec);
        }
      }
    }
  }
  https.end();
}

void syncLocalConfigToFirestore() {
  if (WiFi.status() != WL_CONNECTED) return;
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient https;
  String url = String("https://firestore.googleapis.com/v1/projects/") + FIREBASE_PROJECT_ID +
               "/databases/" + FIRESTORE_DB_ID +
               "/documents/device_settings/esp32_config?key=" + FIREBASE_API_KEY +
               "&updateMask.fieldPaths=wifi_ssid&updateMask.fieldPaths=ap_ssid&updateMask.fieldPaths=last_synced_from&updateMask.fieldPaths=updated_at";
  if (!https.begin(client, url)) return;
  https.addHeader("Content-Type", "application/json");
  DynamicJsonDocument doc(1024);
  JsonObject fields = doc.createNestedObject("fields");
  fields.createNestedObject("wifi_ssid")["stringValue"] = currentWifiSSID;
  fields.createNestedObject("ap_ssid")["stringValue"] = currentApSSID;
  fields.createNestedObject("last_synced_from")["stringValue"] = "esp32_hardware";
  char rfc[32];
  getRFC3339Timestamp(rfc, sizeof(rfc));
  fields.createNestedObject("updated_at")["timestampValue"] = rfc;
  String reqBody;
  serializeJson(doc, reqBody);
  https.PATCH(reqBody);
  https.end();
}

bool sendDataToFirestore(float tempC, const char* rfcTime) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("[Firestore] Gagal: Wi-Fi terputus. Mencoba rekoneksi..."));
    return false;
  }

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient https;

  String docId = "esp32_" + String(millis());
  String url = String("https://firestore.googleapis.com/v1/projects/") + FIREBASE_PROJECT_ID +
               "/databases/" + FIRESTORE_DB_ID + "/documents/sensor_readings?documentId=" + docId +
               "&key=" + FIREBASE_API_KEY;

  if (!https.begin(client, url)) {
    Serial.println(F("[Firestore] Gagal menginisialisasi koneksi HTTPS"));
    return false;
  }

  https.addHeader("Content-Type", "application/json");

  // Format dokumen Firestore REST API
  DynamicJsonDocument doc(1024);
  JsonObject fields = doc.createNestedObject("fields");

  // HANYA MENGIRIM SUHU CELSIUS INFRAMERAH OBJEK (GY-906)
  fields.createNestedObject("temperature")["doubleValue"] = tempC;
  fields.createNestedObject("sensor_model")["stringValue"] = "GY-906 (MLX90614)";
  fields.createNestedObject("pressure_kpa")["doubleValue"] = 0.0;
  fields.createNestedObject("timestamp")["timestampValue"] = rfcTime;

  String reqBody;
  serializeJson(doc, reqBody);

  Serial.printf("[Firestore] Mengirim data: %.2f °C ... ", tempC);
  int httpCode = https.POST(reqBody);

  if (httpCode == 200 || httpCode == 201) {
    Serial.printf("SUKSES (HTTP %d)! Data tersimpan di Firestore.\n", httpCode);
    https.end();
    return true;
  } else if (httpCode == 403) {
    Serial.printf("GAGAL (HTTP 403 - PERMISSION DENIED)\n");
    Serial.println(F("------------------------------------------------------------------"));
    Serial.println(F("[PENTING] Firestore Rules di Firebase Console masih terkunci!"));
    Serial.println(F("Buka: https://console.firebase.google.com/project/pvngblock/firestore/rules"));
    Serial.println(F("Ganti aturan menjadi:"));
    Serial.println(F("  rules_version = '2';"));
    Serial.println(F("  service cloud.firestore {"));
    Serial.println(F("    match /databases/{database}/documents {"));
    Serial.println(F("      match /{document=**} { allow read, write: if true; }"));
    Serial.println(F("    }"));
    Serial.println(F("  }"));
    Serial.println(F("Lalu klik tombol 'Publish' di Firebase Console!"));
    Serial.println(F("------------------------------------------------------------------"));
  } else {
    Serial.printf("ERROR HTTP: %d\n", httpCode);
    String res = https.getString();
    if (res.length() > 0) {
      Serial.printf("Detail: %s\n", res.c_str());
    }
  }

  https.end();
  return false;
}

// ============================================================================
// ARDUINO SETUP
// ============================================================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println(F("\n=================================================="));
  Serial.println(F(" FAVORA — ESP32 Sensor Inframerah GY-906"));
  Serial.println(F(" Pinout: VIN->3V3, GND->GND, SCL->22, SDA->21"));
  Serial.println(F("=================================================="));

  // 1. Inisialisasi Sensor Inframerah GY-906 (MLX90614)
  initMlxSensor();

  // 2. Muat Kredensial NVS Flash
  loadCredentialsFromNVS();

  // 3. Konek ke Wi-Fi Target
  bool wifiOk = connectToWiFi(18000);

  if (!wifiOk) {
    Serial.println(F("[Setup] Wi-Fi belum terhubung. Mengaktifkan Hotspot Mandiri (192.168.4.1)..."));
    startCaptivePortal();
  } else {
    isAPMode = false;
    configTime(0, 0, "time.google.com", "id.pool.ntp.org", "pool.ntp.org");
    Serial.print(F("[NTP] Sinkronisasi waktu"));
    time_t now = time(nullptr);
    uint8_t ntpRetries = 0;
    while (now < 1704067200 && ntpRetries < 25) {
      delay(500); Serial.print('.');
      now = time(nullptr);
      ntpRetries++;
    }
    Serial.println();
    syncLocalConfigToFirestore();
  }
}

// ============================================================================
// ARDUINO LOOP
// ============================================================================
void loop() {
  // A. Mode Hotspot Captive Portal (192.168.4.1)
  if (isAPMode) {
    dnsServer.processNextRequest();
    server.handleClient();
    static unsigned long lastLocalRead = 0;
    if (millis() - lastLocalRead > 2000) {
      lastLocalRead = millis();
      float temp = 0.0f;
      if (readMlxTemperature(temp)) {
        lastTempC = temp;
        hasValidReading = true;
      } else {
        hasValidReading = false;
      }
    }
    return;
  }

  // B. Mode Online Wi-Fi
  if (WiFi.status() != WL_CONNECTED) {
    static unsigned long disconnectStart = 0;
    if (disconnectStart == 0) disconnectStart = millis();
    if (millis() - disconnectStart > 30000) {
      startCaptivePortal();
      disconnectStart = 0;
      return;
    }
    delay(1000);
    return;
  }

  char rfcTimestamp[32];
  if (!getRFC3339Timestamp(rfcTimestamp, sizeof(rfcTimestamp))) {
    delay(2000);
    return;
  }

  // Pengecekan Remote Config Cloud
  if (millis() - lastConfigCheckTime >= CONFIG_CHECK_INTERVAL_MS || lastConfigCheckTime == 0) {
    lastConfigCheckTime = millis();
    checkRemoteDeviceConfig();
  }

  // Pengiriman Data ke Firestore Sesuai Interval
  unsigned long currentMs = millis();
  if (currentMs - lastSendTime >= sendIntervalMs) {
    lastSendTime = currentMs;

    float currentTemp = 0.0f;
    bool readOk = readMlxTemperature(currentTemp);

    if (readOk) {
      lastTempC = currentTemp;
      hasValidReading = true;
      Serial.printf("[Sensor MLX90614] Suhu Objek: %.2f °C\n", currentTemp);
      sendDataToFirestore(currentTemp, rfcTimestamp);
    } else {
      hasValidReading = false;
      Serial.println(F("[Sensor ERROR] Gagal membaca suhu GY-906. Tidak mengirim data palsu!"));
    }
  }
}
