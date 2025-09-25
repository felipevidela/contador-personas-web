// ========= CÓDIGO DE DIAGNÓSTICO CON CONECTIVIDAD VERCEL Y BUZZER =========
// Este código envía datos de sensores al dashboard web en tiempo real
// y emite sonidos diferentes para entrada y salida

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <WiFiS3.h>
#include <ArduinoHttpClient.h>
#include <ArduinoJson.h>

// --------- Configuración WiFi ----------
const char* ssid = "iPhone de Felipe";
const char* password = "11223344";
const char* serverName = "contador-personas-web.vercel.app";
const char* serverPath = "/api/counter";
const int serverPort = 443;

// --------- Pines ----------
const int TA = 2, EA = 3;   // Sensor A: TRIG/ECHO
const int TB = 4, EB = 5;   // Sensor B: TRIG/ECHO
const int BTN = 8;          // Botón
const int BUZZER = 9;       // Buzzer en pin 9
const int LED_ENTRADA = 10; // LED verde para entrada (antes LED_GREEN)
const int LED_SALIDA = 11;  // LED rojo para salida (antes LED_RED)

// --------- Configuración de Sonidos ----------
// Frecuencias para diferentes eventos (en Hz)
const int FREQ_ENTRADA = 1000;     // Tono agudo para entrada (1000 Hz)
const int FREQ_SALIDA = 500;       // Tono grave para salida (500 Hz)
const int FREQ_ERROR = 250;        // Tono muy grave para error
const int FREQ_BEEP = 2000;        // Beep agudo para confirmación

// Duraciones (en milisegundos)
const int DURATION_SHORT = 100;    // Sonido corto
const int DURATION_MEDIUM = 200;   // Sonido medio
const int DURATION_LONG = 500;     // Sonido largo

// --------- LCD ----------
#define LCD_ADDR 0x27
LiquidCrystal_I2C lcd(LCD_ADDR, 16, 2);

// Variables para diagnóstico
long minA = 9999, minB = 9999;
long maxA = 0, maxB = 0;
int noReadingsA = 0, noReadingsB = 0;
unsigned long lastValidA = 0, lastValidB = 0;

// Variables para contadores y conectividad
int inCount = 0;    // Contador de entradas (sensor A)
int outCount = 0;   // Contador de salidas (sensor B)
int aforo = 0;      // Aforo actual (entradas - salidas)
bool lastDetectionA = false, lastDetectionB = false;
unsigned long lastSendTime = 0;
const unsigned long SEND_INTERVAL = 30000; // Enviar cada 30 segundos
bool wifiConnected = false;
bool soundEnabled = true;  // Control para activar/desactivar sonidos

// Cliente WiFi
WiFiSSLClient wifiClient;
HttpClient httpClient = HttpClient(wifiClient, serverName, serverPort);

// --------- Funciones de LEDs ----------
void flashLED(int pin, int duration) {
  digitalWrite(pin, HIGH);
  delay(duration);
  digitalWrite(pin, LOW);
}

void flashLEDGreen() {
  // Parpadeo rápido del LED verde
  for (int i = 0; i < 3; i++) {
    digitalWrite(LED_ENTRADA, HIGH);
    delay(50);
    digitalWrite(LED_ENTRADA, LOW);
    delay(50);
  }
}

void flashLEDRed() {
  // Parpadeo rápido del LED rojo
  for (int i = 0; i < 3; i++) {
    digitalWrite(LED_SALIDA, HIGH);
    delay(50);
    digitalWrite(LED_SALIDA, LOW);
    delay(50);
  }
}

void testLEDs() {
  // Test inicial de LEDs
  Serial.println(F("Test de LEDs..."));
  digitalWrite(LED_ENTRADA, HIGH);
  delay(500);
  digitalWrite(LED_ENTRADA, LOW);
  delay(200);
  digitalWrite(LED_SALIDA, HIGH);
  delay(500);
  digitalWrite(LED_SALIDA, LOW);
  delay(200);
}

// --------- Funciones de Sonido ----------
void playSound(int frequency, int duration) {
  if (soundEnabled) {
    tone(BUZZER, frequency, duration);
    delay(duration + 50); // Pequeña pausa después del sonido
  }
}

void playSoundEntrada() {
  // Melodía ascendente para entrada (2 tonos)
  Serial.println(F("♪ Sonido: ENTRADA"));
  tone(BUZZER, FREQ_ENTRADA, DURATION_SHORT);
  delay(DURATION_SHORT);
  tone(BUZZER, FREQ_ENTRADA * 1.25, DURATION_SHORT); // Tono más agudo
  delay(DURATION_SHORT);
  noTone(BUZZER);
}

void playSoundSalida() {
  // Melodía descendente para salida (2 tonos)
  Serial.println(F("♪ Sonido: SALIDA"));
  tone(BUZZER, FREQ_SALIDA * 1.25, DURATION_SHORT); // Tono más agudo primero
  delay(DURATION_SHORT);
  tone(BUZZER, FREQ_SALIDA, DURATION_SHORT);
  delay(DURATION_SHORT);
  noTone(BUZZER);
}

void playSoundDetection() {
  // Beep simple para detección
  tone(BUZZER, FREQ_BEEP, 50);
  delay(60);
  noTone(BUZZER);
}

void playSoundReset() {
  // Sonido de reset (3 beeps rápidos)
  Serial.println(F("♪ Sonido: RESET"));
  for (int i = 0; i < 3; i++) {
    tone(BUZZER, FREQ_BEEP, 50);
    delay(100);
  }
  noTone(BUZZER);
}

void playSoundStartup() {
  // Melodía de inicio
  Serial.println(F("♪ Sonido: INICIO"));
  tone(BUZZER, 523, 100); // C
  delay(110);
  tone(BUZZER, 659, 100); // E
  delay(110);
  tone(BUZZER, 784, 100); // G
  delay(110);
  tone(BUZZER, 1047, 200); // C alto
  delay(210);
  noTone(BUZZER);
}

void playSoundWiFiConnected() {
  // Sonido de WiFi conectado
  Serial.println(F("♪ Sonido: WiFi OK"));
  tone(BUZZER, 880, 100); // A
  delay(110);
  tone(BUZZER, 1047, 150); // C
  delay(160);
  noTone(BUZZER);
}

void playSoundError() {
  // Sonido de error
  tone(BUZZER, FREQ_ERROR, DURATION_LONG);
  delay(DURATION_LONG + 50);
  noTone(BUZZER);
}

// --------- Función de lectura básica ----------
long readCM(int t, int e) {
  digitalWrite(t, LOW);
  delayMicroseconds(2);
  digitalWrite(t, HIGH);
  delayMicroseconds(10);
  digitalWrite(t, LOW);

  // Aumentamos timeout para diagnóstico
  unsigned long us = pulseIn(e, HIGH, 50000UL);

  if (us == 0) {
    return -1;  // Sin lectura
  }

  long cm = us / 58;
  return cm;
}

void setup() {
  Serial.begin(115200);
  
  // Configurar buzzer y LEDs
  pinMode(BUZZER, OUTPUT);
  pinMode(LED_ENTRADA, OUTPUT);
  pinMode(LED_SALIDA, OUTPUT);
  noTone(BUZZER);
  digitalWrite(LED_ENTRADA, LOW);
  digitalWrite(LED_SALIDA, LOW);

  // Test de LEDs
  testLEDs();

  // Sonido de inicio
  playSoundStartup();

  // Inicializar WiFi
  initWiFi();

  // Configurar pines
  pinMode(TA, OUTPUT);
  pinMode(EA, INPUT);
  pinMode(TB, OUTPUT);
  pinMode(EB, INPUT);
  pinMode(BTN, INPUT_PULLUP);

  // Inicializar LCD
  Wire.begin();
  lcd.init();
  lcd.backlight();

  // Mensaje inicial
  Serial.println(F("==========================================="));
  Serial.println(F("   MODO DIAGNÓSTICO + CONECTIVIDAD + BUZZER + LEDs"));
  Serial.println(F("==========================================="));
  Serial.println(F(""));
  Serial.println(F("CONFIGURACIÓN DE INDICADORES:"));
  Serial.println(F("- LED Verde (Pin 10): Parpadea en ENTRADA"));
  Serial.println(F("- LED Rojo (Pin 11): Parpadea en SALIDA"));
  Serial.println(F("- Sensor A (Entrada): Tono ascendente + LED verde"));
  Serial.println(F("- Sensor B (Salida): Tono descendente + LED rojo"));
  Serial.println(F("- Buzzer en PIN 9"));
  Serial.println(F(""));
  Serial.println(F("INSTRUCCIONES:"));
  Serial.println(F("1. Pasa tu mano lentamente frente a cada sensor"));
  Serial.println(F("2. Escucha los diferentes sonidos y observa los LEDs"));
  Serial.println(F("3. Mantén presionado el botón 3 seg para silenciar/activar"));
  Serial.println(F("4. Los datos se envían automáticamente al dashboard web"));
  Serial.println(F(""));
  Serial.println(F("INFORMACIÓN DE DIAGNÓSTICO:"));
  Serial.println(F("- Valores negativos (-1) = Sin lectura/timeout"));
  Serial.println(F("- Valores 0-400 = Distancia en cm"));
  Serial.println(F("- Se muestra MIN/MAX detectado"));
  Serial.println(F("- Sensor A cuenta ENTRADAS, Sensor B cuenta SALIDAS"));
  Serial.println(F("- Datos se envían cada 30 segundos al dashboard"));
  Serial.println(F(""));
  Serial.println(F("Iniciando en 3 segundos..."));

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("DIAGNOSTIC+SOUND");
  lcd.setCursor(0, 1);
  lcd.print("Ver Serial Mon.");

  delay(3000);
  Serial.println(F("¡INICIADO! Pasa tu mano frente a los sensores\n"));

  // Actualizar display con estado WiFi
  updateLCDWiFiStatus();
}

void loop() {
  // Variables para detectar presión larga del botón
  static unsigned long buttonPressTime = 0;
  static bool buttonPressed = false;

  // Verificar conexión WiFi
  checkWiFiConnection();

  // Verificar botón
  if (digitalRead(BTN) == LOW) {
    if (!buttonPressed) {
      buttonPressed = true;
      buttonPressTime = millis();
    } else {
      // Si el botón ha estado presionado por más de 3 segundos
      if (millis() - buttonPressTime > 3000) {
        // Toggle sonido
        soundEnabled = !soundEnabled;
        if (soundEnabled) {
          Serial.println(F("♪ Sonidos ACTIVADOS"));
          playSoundWiFiConnected(); // Confirmación
        } else {
          Serial.println(F("🔇 Sonidos DESACTIVADOS"));
        }
        // Esperar a que suelte el botón
        while (digitalRead(BTN) == LOW);
        buttonPressed = false;
      }
    }
  } else if (buttonPressed) {
    // Botón soltado
    if (millis() - buttonPressTime < 3000) {
      // Presión corta = Reset
      minA = 9999; minB = 9999;
      maxA = 0; maxB = 0;
      noReadingsA = 0; noReadingsB = 0;
      inCount = 0; outCount = 0; aforo = 0;
      Serial.println(F("\n*** VALORES Y CONTADORES RESETEADOS ***\n"));
      playSoundReset();
      // Parpadear ambos LEDs para confirmar reset
      for (int i = 0; i < 2; i++) {
        digitalWrite(LED_ENTRADA, HIGH);
        digitalWrite(LED_SALIDA, HIGH);
        delay(100);
        digitalWrite(LED_ENTRADA, LOW);
        digitalWrite(LED_SALIDA, LOW);
        delay(100);
      }
    }
    buttonPressed = false;
  }

  // Leer Sensor A
  long a = readCM(TA, EA);
  delay(30);  // Anti-crosstalk

  // Leer Sensor B
  long b = readCM(TB, EB);

  // Procesar lectura A
  if (a == -1) {
    noReadingsA++;
  } else if (a > 0 && a < 500) {
    if (a < minA) minA = a;
    if (a > maxA) maxA = a;
    lastValidA = millis();
  }

  // Procesar lectura B
  if (b == -1) {
    noReadingsB++;
  } else if (b > 0 && b < 500) {
    if (b < minB) minB = b;
    if (b > maxB) maxB = b;
    lastValidB = millis();
  }

  // Mostrar en Serial - Formato mejorado
  Serial.print(F("A: "));
  if (a == -1) {
    Serial.print(F("--NO SIGNAL--"));
  } else {
    Serial.print(a);
    Serial.print(F(" cm"));

    // Indicador visual de distancia
    if (a <= 10) {
      Serial.print(F(" [████████]"));
    } else if (a <= 20) {
      Serial.print(F(" [██████--]"));
    } else if (a <= 30) {
      Serial.print(F(" [████----]"));
    } else if (a <= 40) {
      Serial.print(F(" [██------]"));
    } else {
      Serial.print(F(" [--------]"));
    }
  }

  Serial.print(F("  |  B: "));
  if (b == -1) {
    Serial.print(F("--NO SIGNAL--"));
  } else {
    Serial.print(b);
    Serial.print(F(" cm"));

    // Indicador visual de distancia
    if (b <= 10) {
      Serial.print(F(" [████████]"));
    } else if (b <= 20) {
      Serial.print(F(" [██████--]"));
    } else if (b <= 30) {
      Serial.print(F(" [████----]"));
    } else if (b <= 40) {
      Serial.print(F(" [██------]"));
    } else {
      Serial.print(F(" [--------]"));
    }
  }

  // Detectar mano y contar (umbral de 30cm)
  bool currentDetectionA = (a > 0 && a <= 30);
  bool currentDetectionB = (b > 0 && b <= 30);

  // Contar entradas (sensor A) con sonido y LED
  if (currentDetectionA && !lastDetectionA) {
    inCount++;
    aforo = inCount - outCount;
    Serial.print(F("  <-- ENTRADA DETECTADA! Total: "));
    Serial.print(inCount);
    playSoundEntrada(); // Sonido de entrada
    flashLEDGreen();    // LED verde parpadea
  } else if (a > 0 && a <= 30) {
    Serial.print(F("  <-- MANO EN A!"));
  }

  // Contar salidas (sensor B) con sonido y LED
  if (currentDetectionB && !lastDetectionB) {
    outCount++;
    aforo = inCount - outCount;
    Serial.print(F("  <-- SALIDA DETECTADA! Total: "));
    Serial.print(outCount);
    playSoundSalida(); // Sonido de salida
    flashLEDRed();     // LED rojo parpadea
  } else if (b > 0 && b <= 30) {
    Serial.print(F("  <-- MANO EN B!"));
  }

  lastDetectionA = currentDetectionA;
  lastDetectionB = currentDetectionB;

  Serial.println();

  // Actualizar LCD
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(F("A:"));
  if (a == -1) {
    lcd.print(F("---"));
  } else {
    lcd.print(a);
    lcd.print(F("cm"));
  }

  lcd.setCursor(8, 0);
  lcd.print(F("B:"));
  if (b == -1) {
    lcd.print(F("---"));
  } else {
    lcd.print(b);
    lcd.print(F("cm"));
  }

  // Segunda línea LCD: E:entradas S:salidas A:aforo W:wifi
  lcd.setCursor(0, 1);
  lcd.print(F("E:"));
  lcd.print(inCount);
  lcd.print(F(" S:"));
  lcd.print(outCount);
  lcd.print(F(" A:"));
  // Mostrar aforo, pero nunca negativo
  if (aforo < 0) {
    lcd.print(0);
  } else {
    lcd.print(aforo);
  }
  
  // Mostrar W si hay WiFi (solo si alcanza el espacio)
  if (wifiConnected) {
    lcd.print(F(" W"));
  }

  // Mostrar estadísticas cada 5 segundos
  static unsigned long lastStats = 0;
  if (millis() - lastStats > 5000) {
    Serial.println(F("\n========== ESTADÍSTICAS =========="));

    Serial.print(F("Sensor A - Min: "));
    Serial.print(minA == 9999 ? 0 : minA);
    Serial.print(F(" cm, Max: "));
    Serial.print(maxA);
    Serial.print(F(" cm, Sin lectura: "));
    Serial.print(noReadingsA);
    Serial.println(F(" veces"));

    Serial.print(F("Sensor B - Min: "));
    Serial.print(minB == 9999 ? 0 : minB);
    Serial.print(F(" cm, Max: "));
    Serial.print(maxB);
    Serial.print(F(" cm, Sin lectura: "));
    Serial.print(noReadingsB);
    Serial.println(F(" veces"));

    Serial.print(F("Contadores - Entradas: "));
    Serial.print(inCount);
    Serial.print(F(", Salidas: "));
    Serial.print(outCount);
    Serial.print(F(", Aforo: "));
    Serial.println(aforo);

    Serial.print(F("WiFi: "));
    Serial.print(wifiConnected ? F("Conectado") : F("Desconectado"));
    Serial.print(F(" | Sonido: "));
    Serial.println(soundEnabled ? F("Activado") : F("Desactivado"));

    // Diagnóstico de problemas
    Serial.println(F("\n*** DIAGNÓSTICO ***"));

    // Verificar si hay lecturas
    if (noReadingsA > 50) {
      Serial.println(F("⚠ PROBLEMA Sensor A: Muchos timeouts"));
      Serial.println(F("  - Verifica conexión TRIG pin 2, ECHO pin 3"));
      Serial.println(F("  - Verifica alimentación 5V y GND"));
    }

    if (noReadingsB > 50) {
      Serial.println(F("⚠ PROBLEMA Sensor B: Muchos timeouts"));
      Serial.println(F("  - Verifica conexión TRIG pin 4, ECHO pin 5"));
      Serial.println(F("  - Verifica alimentación 5V y GND"));
    }

    // Verificar rango de detección
    if (minA > 50 && maxA > 50) {
      Serial.println(F("⚠ Sensor A: No detecta objetos cercanos"));
      Serial.println(F("  - Prueba con objeto más grande"));
      Serial.println(F("  - Verifica ángulo del sensor"));
    }

    if (minB > 50 && maxB > 50) {
      Serial.println(F("⚠ Sensor B: No detecta objetos cercanos"));
      Serial.println(F("  - Prueba con objeto más grande"));
      Serial.println(F("  - Verifica ángulo del sensor"));
    }

    // Si todo está bien
    if (minA < 30 && minB < 30 && noReadingsA < 10 && noReadingsB < 10) {
      Serial.println(F("✓ Ambos sensores funcionan correctamente"));
      Serial.println(F("✓ Detectan objetos a menos de 30cm"));
    }

    Serial.println(F("==================================\n"));

    lastStats = millis();
    noReadingsA = 0;  // Reset contadores
    noReadingsB = 0;
  }

  // Enviar datos al servidor cada SEND_INTERVAL
  if (wifiConnected && (millis() - lastSendTime > SEND_INTERVAL)) {
    sendDataToServer();
    lastSendTime = millis();
  }

  delay(100);  // Delay para lectura más estable
}

// ========= FUNCIONES DE CONECTIVIDAD =========

void initWiFi() {
  Serial.print(F("Conectando a WiFi: "));
  Serial.println(ssid);

  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(F("."));
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println();
    Serial.println(F("¡WiFi conectado!"));
    Serial.print(F("IP: "));
    Serial.println(WiFi.localIP());
    playSoundWiFiConnected(); // Sonido de confirmación
  } else {
    wifiConnected = false;
    Serial.println();
    Serial.println(F("Error: No se pudo conectar a WiFi"));
    playSoundError(); // Sonido de error
  }
}

void checkWiFiConnection() {
  if (WiFi.status() != WL_CONNECTED) {
    if (wifiConnected) {
      Serial.println(F("WiFi desconectado. Reintentando..."));
      wifiConnected = false;
    }
    // Intentar reconectar cada 30 segundos
    static unsigned long lastReconnect = 0;
    if (millis() - lastReconnect > 30000) {
      initWiFi();
      lastReconnect = millis();
    }
  } else {
    wifiConnected = true;
  }
}

void updateLCDWiFiStatus() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(F("Sistema listo"));
  lcd.setCursor(0, 1);
  if (wifiConnected) {
    lcd.print(F("WiFi: OK"));
  } else {
    lcd.print(F("WiFi: Error"));
  }
  delay(2000);
}

void sendDataToServer() {
  if (!wifiConnected) {
    Serial.println(F("WiFi no conectado, no se pueden enviar datos"));
    return;
  }

  Serial.println(F("Enviando datos al servidor..."));

  // Crear JSON con los datos
  StaticJsonDocument<200> doc;
  doc["inCount"] = inCount;
  doc["outCount"] = outCount;
  doc["aforo"] = aforo;
  doc["deviceId"] = "Arduino_UNO_R4_WiFi";
  doc["timestamp"] = "";

  String jsonString;
  serializeJson(doc, jsonString);

  Serial.print(F("Datos JSON: "));
  Serial.println(jsonString);

  // Enviar petición HTTP POST
  httpClient.beginRequest();
  httpClient.post(serverPath);
  httpClient.sendHeader("Content-Type", "application/json");
  httpClient.sendHeader("Content-Length", jsonString.length());
  httpClient.beginBody();
  httpClient.print(jsonString);
  httpClient.endRequest();

  // Leer respuesta
  int statusCode = httpClient.responseStatusCode();
  String response = httpClient.responseBody();

  Serial.print(F("Status Code: "));
  Serial.println(statusCode);
  Serial.print(F("Respuesta: "));
  Serial.println(response);

  if (statusCode == 200) {
    Serial.println(F("✓ Datos enviados correctamente"));
  } else {
    Serial.println(F("✗ Error enviando datos"));
  }

  Serial.println();
}