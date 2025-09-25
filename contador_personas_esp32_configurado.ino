#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <EEPROM.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <NTPClient.h>
#include <WiFiUdp.h>

// --------- Configuración WiFi ----------
const char* ssid = "iPhone de Felipe";
const char* password = "11223344";
const char* serverUrl = "https://contador-personas-web.vercel.app/api/counter";

// --------- NTP para fecha/hora ----------
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", -3*3600, 60000); // UTC-3 para Chile

// --------- Pines (ajustar según tu conexión) ----------
const int TA = 2, EA = 3;   // Sensor A: TRIG/ECHO
const int TB = 4, EB = 5;   // Sensor B: TRIG/ECHO
const int BTN = 8;          // Botón reset

// --------- LCD (si tienes conectado) ----------
#define LCD_ADDR 0x27
LiquidCrystal_I2C lcd(LCD_ADDR, 16, 2);
bool lcdAvailable = false;

// --------- Direcciones EEPROM ----------
const int EEPROM_NEAR = 0;
const int EEPROM_FAR = 2;
const int EEPROM_MAGIC = 4;
const int EEPROM_IN_COUNT = 6;
const int EEPROM_OUT_COUNT = 10;

// --------- Parámetros configurables ----------
int NEAR_CM = 45;
int FAR_CM = 50;
const int N_MEDIAN = 3;
const unsigned long MAX_GAP_MS = 1200;
const unsigned long CLEAR_MS = 250;
const unsigned long STUCK_TIMEOUT = 5000;
const int BETWEEN_SAMPLES_MS = 5;
const int BETWEEN_SENSORS_MS = 40;
const unsigned long MAX_COUNT = 999999;
const unsigned long SEND_INTERVAL = 10000; // Enviar cada 10 segundos

// --------- Estado / contadores ----------
enum Phase { ARMED, DECIDED, CLEARING };
Phase phase = ARMED;

unsigned long tRiseA = 0, tRiseB = 0;
unsigned long stuckTimer = 0;
bool nearA = false, nearB = false;
bool prevNearA = false, prevNearB = false;

unsigned long inCnt = 0, outCnt = 0;
long aforo = 0;
unsigned long clearStart = 0;
unsigned long lastSendTime = 0;
bool dataChanged = false;

// --------- WiFi y conectividad ----------
bool wifiConnected = false;
unsigned long lastWiFiCheck = 0;
const unsigned long WIFI_CHECK_INTERVAL = 30000; // Verificar WiFi cada 30s

// --------- Funciones de utilidad ----------
void swap(long &a, long &b) {
  long temp = a;
  a = b;
  b = temp;
}

// --------- Funciones WiFi ----------
void setupWiFi() {
  Serial.println("=== CONFIGURANDO WiFi ===");
  Serial.print("Conectando a: ");
  Serial.println(ssid);

  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;

    if (lcdAvailable) {
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Conectando WiFi");
      lcd.setCursor(attempts % 16, 1);
      lcd.print(".");
    }
  }

  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println("");
    Serial.println("✅ WiFi conectado exitosamente!");
    Serial.print("📶 IP asignada: ");
    Serial.println(WiFi.localIP());
    Serial.print("📡 Señal: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");

    if (lcdAvailable) {
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("WiFi OK!");
      lcd.setCursor(0, 1);
      lcd.print(WiFi.localIP());
      delay(2000);
    }
  } else {
    wifiConnected = false;
    Serial.println("");
    Serial.println("❌ Error: No se pudo conectar a WiFi");
    Serial.println("🔍 Verifica:");
    Serial.println("   - Nombre de red (SSID)");
    Serial.println("   - Contraseña");
    Serial.println("   - Proximidad al router");

    if (lcdAvailable) {
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("WiFi ERROR");
      lcd.setCursor(0, 1);
      lcd.print("Ver monitor");
    }
  }
}

void checkWiFi() {
  if (millis() - lastWiFiCheck > WIFI_CHECK_INTERVAL) {
    lastWiFiCheck = millis();

    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("⚠️  WiFi desconectado, reintentando...");
      wifiConnected = false;
      setupWiFi();
    } else if (!wifiConnected) {
      wifiConnected = true;
      Serial.println("✅ WiFi reconectado");
    }
  }
}

void sendDataToServer() {
  if (!wifiConnected || WiFi.status() != WL_CONNECTED) {
    Serial.println("❌ No hay conexión WiFi para enviar datos");
    return;
  }

  HTTPClient http;
  http.begin(serverUrl);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(10000); // 10 segundos timeout

  // Obtener timestamp
  timeClient.update();
  String timestamp = timeClient.getFormattedDate();

  // Crear JSON
  StaticJsonDocument<256> doc;
  doc["inCount"] = inCnt;
  doc["outCount"] = outCnt;
  doc["aforo"] = aforo;
  doc["timestamp"] = timestamp;
  doc["deviceId"] = WiFi.macAddress();

  String jsonString;
  serializeJson(doc, jsonString);

  Serial.println("📤 Enviando datos al servidor...");
  Serial.print("🌐 URL: ");
  Serial.println(serverUrl);
  Serial.print("📊 Datos: ");
  Serial.println(jsonString);

  int httpCode = http.POST(jsonString);

  if (httpCode > 0) {
    String response = http.getString();
    Serial.print("✅ Respuesta del servidor (");
    Serial.print(httpCode);
    Serial.print("): ");
    Serial.println(response);

    if (httpCode == 200) {
      dataChanged = false;
      Serial.println("🎯 Datos enviados exitosamente!");
    }
  } else {
    Serial.print("❌ Error enviando datos: ");
    Serial.println(http.errorToString(httpCode));
    Serial.println("🔍 Verifica la conexión a internet");
  }

  http.end();
}

// --------- Funciones EEPROM ----------
void loadCalibration() {
  int magic;
  EEPROM.get(EEPROM_MAGIC, magic);
  if (magic == 0x1234) {
    EEPROM.get(EEPROM_NEAR, NEAR_CM);
    EEPROM.get(EEPROM_FAR, FAR_CM);
    EEPROM.get(EEPROM_IN_COUNT, inCnt);
    EEPROM.get(EEPROM_OUT_COUNT, outCnt);
    aforo = inCnt - outCnt;
    Serial.println("💾 Configuración cargada de EEPROM");
    Serial.print("📊 Contadores recuperados - IN: ");
    Serial.print(inCnt);
    Serial.print(", OUT: ");
    Serial.print(outCnt);
    Serial.print(", AFORO: ");
    Serial.println(aforo);
  } else {
    Serial.println("🆕 Primera ejecución, usando valores por defecto");
    saveCalibration();
  }
}

void saveCalibration() {
  EEPROM.put(EEPROM_NEAR, NEAR_CM);
  EEPROM.put(EEPROM_FAR, FAR_CM);
  EEPROM.put(EEPROM_MAGIC, 0x1234);
  Serial.println("💾 Configuración guardada en EEPROM");
}

void saveCounters() {
  EEPROM.put(EEPROM_IN_COUNT, inCnt);
  EEPROM.put(EEPROM_OUT_COUNT, outCnt);
}

// --------- Lecturas con mediana ----------
long readCM(int t, int e) {
  digitalWrite(t, LOW);
  delayMicroseconds(2);
  digitalWrite(t, HIGH);
  delayMicroseconds(10);
  digitalWrite(t, LOW);

  unsigned long us = pulseIn(e, HIGH, 30000UL);
  if (us == 0) return 9999;

  long cm = us / 58;
  if (cm < 2 || cm > 400) return 9999;
  return cm;
}

long medianCM(int t, int e) {
  long v[N_MEDIAN];
  int validReadings = 0;

  for (int i = 0; i < N_MEDIAN; i++) {
    v[i] = readCM(t, e);
    if (v[i] < 9999) validReadings++;
    if (i < N_MEDIAN - 1) delay(BETWEEN_SAMPLES_MS);
  }

  if (validReadings == 0) return 9999;

  if (v[0] > v[1]) swap(v[0], v[1]);
  if (v[1] > v[2]) swap(v[1], v[2]);
  if (v[0] > v[1]) swap(v[0], v[1]);

  return v[1];
}

// --------- LCD ----------
void initLCD() {
  Wire.begin();
  lcd.init();
  if (lcd.backlight) {
    lcdAvailable = true;
    lcd.backlight();
    Serial.println("📺 LCD inicializado correctamente");
  } else {
    lcdAvailable = false;
    Serial.println("⚠️  LCD no detectado, continuando sin pantalla");
  }
}

void printLCD() {
  if (!lcdAvailable) return;

  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("IN:");
  lcd.print(inCnt);
  lcd.print(" OUT:");
  lcd.print(outCnt);

  lcd.setCursor(0, 1);
  lcd.print("Aforo: ");
  if (aforo < 0) {
    lcd.print("0");
  } else {
    lcd.print(aforo);
  }

  // Indicador WiFi
  lcd.setCursor(14, 1);
  if (wifiConnected) {
    lcd.print("W");
  } else {
    lcd.print("X");
  }

  lcd.setCursor(15, 1);
  switch(phase) {
    case ARMED:    lcd.print("*"); break;
    case CLEARING: lcd.print("."); break;
    default:       lcd.print(" "); break;
  }
}

// --------- Setup ----------
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("========================================");
  Serial.println("🚀 SISTEMA CONTADOR DE PERSONAS v3.0");
  Serial.println("📱 ESP32-S3 con WiFi");
  Serial.println("🌐 Conectado a: contador-personas-web.vercel.app");
  Serial.println("========================================");

  // Configurar pines
  pinMode(TA, OUTPUT);
  pinMode(EA, INPUT);
  pinMode(TB, OUTPUT);
  pinMode(EB, INPUT);
  pinMode(BTN, INPUT_PULLUP);

  // Inicializar EEPROM
  EEPROM.begin(512);

  // Inicializar LCD (opcional)
  initLCD();

  if (lcdAvailable) {
    lcd.setCursor(0, 0);
    lcd.print("Iniciando...");
    lcd.setCursor(0, 1);
    lcd.print("ESP32-S3");
    delay(2000);
  }

  // Cargar configuración
  loadCalibration();

  // Conectar WiFi
  setupWiFi();

  // Inicializar cliente NTP si WiFi está conectado
  if (wifiConnected) {
    timeClient.begin();
    timeClient.update();
    Serial.print("🕐 Hora sincronizada: ");
    Serial.println(timeClient.getFormattedDate());
  }

  // Mostrar estado inicial
  printLCD();

  Serial.println("========================================");
  Serial.print("📏 NEAR_CM: "); Serial.print(NEAR_CM);
  Serial.print(" | FAR_CM: "); Serial.println(FAR_CM);
  Serial.println("➡️  A->B: ENTRADA");
  Serial.println("⬅️  B->A: SALIDA");
  Serial.println("🎯 Sistema listo!");
  Serial.println("========================================");

  // Enviar datos iniciales
  if (wifiConnected) {
    sendDataToServer();
  }
}

// --------- Loop principal ----------
void loop() {
  // Verificar WiFi periódicamente
  checkWiFi();

  // Reset manual con botón
  if (digitalRead(BTN) == LOW) {
    delay(50);
    if (digitalRead(BTN) == LOW) {
      Serial.println("🔄 Reset manual ejecutado");
      inCnt = 0;
      outCnt = 0;
      aforo = 0;
      tRiseA = 0;
      tRiseB = 0;
      phase = ARMED;
      clearStart = 0;
      stuckTimer = 0;
      saveCounters();
      dataChanged = true;
      printLCD();

      if (wifiConnected) {
        sendDataToServer();
      }

      while (digitalRead(BTN) == LOW);
      delay(200);
    }
  }

  // Leer sensores
  long a = medianCM(TA, EA);
  delay(BETWEEN_SENSORS_MS);
  long b = medianCM(TB, EB);

  nearA = prevNearA ? (a <= FAR_CM) : (a <= NEAR_CM);
  nearB = prevNearB ? (b <= FAR_CM) : (b <= NEAR_CM);

  unsigned long now = millis();

  // Detectar flancos de subida
  if (!prevNearA && nearA) {
    tRiseA = now;
    stuckTimer = now;
    Serial.println("🔵 Sensor A activado");
  }
  if (!prevNearB && nearB) {
    tRiseB = now;
    stuckTimer = now;
    Serial.println("🔴 Sensor B activado");
  }

  prevNearA = nearA;
  prevNearB = nearB;

  // Verificar timeout anti-stuck
  if ((nearA || nearB) && stuckTimer > 0 && (now - stuckTimer > STUCK_TIMEOUT)) {
    Serial.println("⏰ Timeout: Objeto estático detectado, reseteando");
    tRiseA = 0;
    tRiseB = 0;
    phase = ARMED;
    stuckTimer = 0;
  }

  // --- MÁQUINA DE ESTADOS ---
  switch (phase) {
    case ARMED:
      if (!nearA && !nearB) {
        stuckTimer = 0;
      }

      if (nearA && nearB) {
        if (tRiseA && tRiseB && (abs((long)tRiseA - (long)tRiseB) <= (long)MAX_GAP_MS)) {
          if (tRiseA < tRiseB) {
            inCnt++;
            aforo = inCnt - outCnt;
            Serial.println("✅ >>> ENTRADA detectada");
            Serial.print("📊 IN: "); Serial.print(inCnt);
            Serial.print(" | OUT: "); Serial.print(outCnt);
            Serial.print(" | AFORO: "); Serial.println(aforo);

            if (wifiConnected) {
              sendDataToServer();
            }
          } else {
            outCnt++;
            aforo = inCnt - outCnt;
            Serial.println("✅ <<< SALIDA detectada");
            Serial.print("📊 IN: "); Serial.print(inCnt);
            Serial.print(" | OUT: "); Serial.print(outCnt);
            Serial.print(" | AFORO: "); Serial.println(aforo);

            if (wifiConnected) {
              sendDataToServer();
            }
          }
          saveCounters();
          printLCD();
          phase = CLEARING;
          clearStart = 0;
          stuckTimer = 0;
        }
      } else {
        if (tRiseA && !nearB && (now - tRiseA > MAX_GAP_MS)) {
          tRiseA = 0;
          stuckTimer = 0;
        }
        if (tRiseB && !nearA && (now - tRiseB > MAX_GAP_MS)) {
          tRiseB = 0;
          stuckTimer = 0;
        }

        if (tRiseA && nearB && (now - tRiseA <= MAX_GAP_MS)) {
          inCnt++;
          aforo = inCnt - outCnt;
          Serial.println("✅ >>> ENTRADA por secuencia");
          if (wifiConnected) sendDataToServer();
          saveCounters();
          printLCD();
          phase = CLEARING;
          clearStart = 0;
          stuckTimer = 0;
        }
        if (tRiseB && nearA && (now - tRiseB <= MAX_GAP_MS)) {
          outCnt++;
          aforo = inCnt - outCnt;
          Serial.println("✅ <<< SALIDA por secuencia");
          if (wifiConnected) sendDataToServer();
          saveCounters();
          printLCD();
          phase = CLEARING;
          clearStart = 0;
          stuckTimer = 0;
        }
      }
      break;

    case CLEARING:
      if (!nearA && !nearB) {
        if (clearStart == 0) {
          clearStart = now;
        }
        if (now - clearStart >= CLEAR_MS) {
          tRiseA = 0;
          tRiseB = 0;
          phase = ARMED;
          clearStart = 0;
          stuckTimer = 0;
          Serial.println("🎯 Sistema rearmado");
        }
      } else {
        clearStart = 0;
      }
      break;

    case DECIDED:
      phase = ARMED;
      break;
  }

  // Enviar datos periódicamente
  if (wifiConnected && (now - lastSendTime >= SEND_INTERVAL)) {
    sendDataToServer();
    lastSendTime = now;
  }

  // Debug cada 2 segundos si hay actividad
  static unsigned long lastDebug = 0;
  if (now - lastDebug > 2000) {
    if (nearA || nearB || phase != ARMED) {
      Serial.print("📏 A:");
      Serial.print((a < 9999) ? a : -1);
      Serial.print("cm B:");
      Serial.print((b < 9999) ? b : -1);
      Serial.print("cm | 📊 IN:");
      Serial.print(inCnt);
      Serial.print(" OUT:");
      Serial.print(outCnt);
      Serial.print(" AFORO:");
      Serial.print(aforo);
      Serial.print(" | 📶 WiFi:");
      Serial.println(wifiConnected ? "OK" : "NO");
      lastDebug = now;
    }
  }
}