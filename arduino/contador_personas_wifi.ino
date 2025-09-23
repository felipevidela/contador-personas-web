#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <EEPROM.h>
#include <WiFi.h>           // Para ESP32 (usa ESP8266WiFi.h para ESP8266)
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <NTPClient.h>
#include <WiFiUdp.h>

// --------- Configuración WiFi ----------
const char* ssid = "TU_WIFI_SSID";        // Cambiar por tu SSID
const char* password = "TU_WIFI_PASSWORD"; // Cambiar por tu contraseña
const char* serverUrl = "https://tu-app.vercel.app/api/counter"; // Cambiar por tu URL de Vercel

// --------- NTP para fecha/hora ----------
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", -3*3600, 60000); // UTC-3 para Argentina

// --------- Pines ----------
const int TA = 2, EA = 3;   // Sensor A: TRIG/ECHO
const int TB = 4, EB = 5;   // Sensor B: TRIG/ECHO
const int BTN = 8;          // Botón reset (diagonal a GND)

// --------- LCD ----------
#define LCD_ADDR 0x27
LiquidCrystal_I2C lcd(LCD_ADDR, 16, 2);

// --------- Direcciones EEPROM ----------
const int EEPROM_NEAR = 0;
const int EEPROM_FAR = 2;
const int EEPROM_MAGIC = 4;
const int EEPROM_IN_COUNT = 6;  // Guardar contadores en EEPROM
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
const unsigned long SEND_INTERVAL = 5000; // Enviar datos cada 5 segundos

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

// --------- Registro de eventos ----------
struct Event {
  unsigned long timestamp;
  bool isEntry;
  int aforoAtTime;
};
const int MAX_EVENTS = 10;
Event eventLog[MAX_EVENTS];
int eventIndex = 0;

// --------- Funciones de utilidad ----------
void swap(long &a, long &b) {
  long temp = a;
  a = b;
  b = temp;
}

// --------- Funciones WiFi ----------
void setupWiFi() {
  WiFi.begin(ssid, password);
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(F("Conectando WiFi"));

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    lcd.setCursor(attempts % 16, 1);
    lcd.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print(F("WiFi Conectado"));
    lcd.setCursor(0, 1);
    lcd.print(WiFi.localIP());
    Serial.println(F("WiFi conectado"));
    Serial.print(F("IP: "));
    Serial.println(WiFi.localIP());
    delay(2000);
  } else {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print(F("WiFi Fallo"));
    Serial.println(F("Fallo conexión WiFi"));
  }
}

void sendDataToServer() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("WiFi no conectado, intentando reconectar..."));
    setupWiFi();
    return;
  }

  HTTPClient http;
  http.begin(serverUrl);
  http.addHeader("Content-Type", "application/json");

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

  // Agregar últimos eventos si hay
  JsonArray events = doc.createNestedArray("recentEvents");
  int startIdx = (eventIndex - 3 + MAX_EVENTS) % MAX_EVENTS;
  for (int i = 0; i < 3; i++) {
    int idx = (startIdx + i) % MAX_EVENTS;
    if (eventLog[idx].timestamp > 0) {
      JsonObject event = events.createNestedObject();
      event["timestamp"] = eventLog[idx].timestamp;
      event["isEntry"] = eventLog[idx].isEntry;
      event["aforoAtTime"] = eventLog[idx].aforoAtTime;
    }
  }

  String jsonString;
  serializeJson(doc, jsonString);

  Serial.print(F("Enviando datos: "));
  Serial.println(jsonString);

  int httpCode = http.POST(jsonString);

  if (httpCode > 0) {
    String response = http.getString();
    Serial.print(F("Respuesta servidor ("));
    Serial.print(httpCode);
    Serial.print(F("): "));
    Serial.println(response);

    if (httpCode == 200) {
      dataChanged = false;
    }
  } else {
    Serial.print(F("Error enviando datos: "));
    Serial.println(http.errorToString(httpCode));
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
    Serial.println(F("Calibración y contadores cargados de EEPROM"));
  } else {
    Serial.println(F("Usando valores por defecto"));
    saveCalibration();
  }
}

void saveCalibration() {
  EEPROM.put(EEPROM_NEAR, NEAR_CM);
  EEPROM.put(EEPROM_FAR, FAR_CM);
  EEPROM.put(EEPROM_MAGIC, 0x1234);
  Serial.println(F("Calibración guardada"));
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
void printLCD() {
  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print(F("IN:"));
  lcd.print(inCnt);
  lcd.print(F(" OUT:"));
  lcd.print(outCnt);

  lcd.setCursor(0, 1);
  lcd.print(F("Aforo: "));
  if (aforo < 0) {
    lcd.print(F("0"));
  } else {
    lcd.print(aforo);
  }

  // Indicador WiFi
  lcd.setCursor(14, 1);
  if (WiFi.status() == WL_CONNECTED) {
    lcd.print(F("W"));
  }

  lcd.setCursor(15, 1);
  switch(phase) {
    case ARMED:    lcd.print(F("*")); break;
    case CLEARING: lcd.print(F(".")); break;
    default:       lcd.print(F(" ")); break;
  }
}

// --------- Registro de eventos ----------
void logEvent(bool isEntry) {
  eventLog[eventIndex].timestamp = millis();
  eventLog[eventIndex].isEntry = isEntry;
  eventLog[eventIndex].aforoAtTime = aforo;
  eventIndex = (eventIndex + 1) % MAX_EVENTS;
  dataChanged = true;
}

// --------- Manejo de overflow ----------
void checkOverflow() {
  if (inCnt >= MAX_COUNT || outCnt >= MAX_COUNT) {
    Serial.println(F("¡Alerta: Contador cerca del límite!"));
  }
}

// --------- Setup ----------
void setup() {
  Serial.begin(115200);

  // Configurar pines
  pinMode(TA, OUTPUT);
  pinMode(EA, INPUT);
  pinMode(TB, OUTPUT);
  pinMode(EB, INPUT);
  pinMode(BTN, INPUT_PULLUP);

  // Inicializar I2C y LCD
  Wire.begin();
  lcd.init();
  lcd.backlight();

  lcd.setCursor(0, 0);
  lcd.print(F("Iniciando..."));
  delay(1000);

  // Cargar calibración y contadores
  loadCalibration();

  // Conectar WiFi
  setupWiFi();

  // Inicializar cliente NTP
  timeClient.begin();

  // Mostrar estado inicial
  printLCD();

  Serial.println(F("========================================"));
  Serial.println(F("Sistema Contador de Personas v3.0 WiFi"));
  Serial.println(F("Modo: Bidireccional con aforo y WiFi"));
  Serial.print(F("NEAR_CM: ")); Serial.print(NEAR_CM);
  Serial.print(F(" FAR_CM: ")); Serial.println(FAR_CM);
  Serial.println(F("A->B: ENTRADA, B->A: SALIDA"));
  Serial.println(F("========================================"));
}

// --------- Loop principal ----------
void loop() {
  // Reset manual con botón
  if (digitalRead(BTN) == LOW) {
    delay(50);
    if (digitalRead(BTN) == LOW) {
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
      Serial.println(F("Reset manual ejecutado"));
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
  }
  if (!prevNearB && nearB) {
    tRiseB = now;
    stuckTimer = now;
  }

  prevNearA = nearA;
  prevNearB = nearB;

  // Verificar timeout anti-stuck
  if ((nearA || nearB) && stuckTimer > 0 && (now - stuckTimer > STUCK_TIMEOUT)) {
    Serial.println(F("Timeout: Objeto estático detectado"));
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
            logEvent(true);
            Serial.println(F(">>> ENTRADA detectada"));
            sendDataToServer(); // Enviar inmediatamente
          } else {
            outCnt++;
            aforo = inCnt - outCnt;
            logEvent(false);
            Serial.println(F("<<< SALIDA detectada"));
            sendDataToServer(); // Enviar inmediatamente
          }
          saveCounters();
          printLCD();
          checkOverflow();
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
          logEvent(true);
          Serial.println(F(">>> ENTRADA por secuencia"));
          sendDataToServer();
          saveCounters();
          printLCD();
          checkOverflow();
          phase = CLEARING;
          clearStart = 0;
          stuckTimer = 0;
        }
        if (tRiseB && nearA && (now - tRiseB <= MAX_GAP_MS)) {
          outCnt++;
          aforo = inCnt - outCnt;
          logEvent(false);
          Serial.println(F("<<< SALIDA por secuencia"));
          sendDataToServer();
          saveCounters();
          printLCD();
          checkOverflow();
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
          Serial.println(F("Sistema rearmado"));
        }
      } else {
        clearStart = 0;
      }
      break;

    case DECIDED:
      phase = ARMED;
      break;
  }

  // Enviar datos periódicamente aunque no haya cambios
  if (now - lastSendTime >= SEND_INTERVAL) {
    if (dataChanged || (now - lastSendTime >= SEND_INTERVAL * 2)) {
      sendDataToServer();
      lastSendTime = now;
    }
  }

  // Debug
  static unsigned long lastDebug = 0;
  if (now - lastDebug > 500) {
    if (nearA || nearB || phase != ARMED) {
      Serial.print(F("A:"));
      Serial.print((a < 9999) ? a : -1);
      Serial.print(F("cm B:"));
      Serial.print((b < 9999) ? b : -1);
      Serial.print(F("cm | IN:"));
      Serial.print(inCnt);
      Serial.print(F(" OUT:"));
      Serial.print(outCnt);
      Serial.print(F(" AFORO:"));
      Serial.println(aforo);
      lastDebug = now;
    }
  }
}