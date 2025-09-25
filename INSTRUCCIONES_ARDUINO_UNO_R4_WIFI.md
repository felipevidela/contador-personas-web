# Instrucciones: Arduino UNO R4 WiFi con Dashboard Vercel

## ¿Qué hace este código?

Tu Arduino UNO R4 WiFi ahora:
- ✅ Mantiene toda la funcionalidad de diagnóstico en Serial Monitor
- ✅ Se conecta automáticamente a WiFi
- ✅ Cuenta entradas y salidas usando los sensores ultrasónicos
- ✅ Envía datos automáticamente a tu dashboard web cada 30 segundos
- ✅ Muestra contadores y estado WiFi en el LCD

## Configuración Inicial

### 1. Configurar Credenciales WiFi
En el archivo `contador_personas_UNO_R4_WiFi.ino`, líneas 9-10:

```cpp
const char* ssid = "TU_RED_WIFI";        // Cambia por tu red WiFi
const char* password = "TU_PASSWORD";    // Cambia por tu password
```

**Importante**: Reemplaza estos valores con tu red WiFi real.

### 2. Librerías Necesarias
Instala estas librerías en Arduino IDE:
- `WiFiS3` (para UNO R4 WiFi) - Ya incluida
- `ArduinoHttpClient` - Instalar desde Library Manager
- `ArduinoJson` - Instalar desde Library Manager
- `LiquidCrystal_I2C` - Si usas LCD I2C

### 3. Conexiones Hardware
- **Sensor A (Entradas)**: TRIG → Pin 2, ECHO → Pin 3
- **Sensor B (Salidas)**: TRIG → Pin 4, ECHO → Pin 5
- **Botón Reset**: Pin 8
- **LCD I2C**: SDA → A4, SCL → A5, Dirección 0x27

## Funcionamiento

### Contadores
- **Sensor A**: Cuenta ENTRADAS cuando detecta mano a ≤30cm
- **Sensor B**: Cuenta SALIDAS cuando detecta mano a ≤30cm
- **Aforo**: Se calcula como Entradas - Salidas

### Display LCD
```
A:25cm    B:18cm
E:15 S:12 WiFi
```
- **E**: Entradas totales
- **S**: Salidas totales
- **WiFi**: Estado de conexión

### Serial Monitor
El Serial Monitor muestra:
- Diagnóstico detallado de sensores
- Indicadores visuales de distancia
- Confirmación de entradas/salidas
- Estado de conectividad WiFi
- Estadísticas cada 5 segundos
- Confirmación de envío de datos

### Envío de Datos
- **Frecuencia**: Cada 30 segundos automáticamente
- **Formato JSON**:
  ```json
  {
    "inCount": 15,
    "outCount": 12,
    "aforo": 3,
    "deviceId": "Arduino_UNO_R4_WiFi",
    "timestamp": ""
  }
  ```
- **Destino**: Tu dashboard en `contador-personas-web.vercel.app`

## Ver los Datos en Tiempo Real

1. **Dashboard Web**: Ve a tu URL de Vercel
   - Los datos aparecen automáticamente
   - Se actualiza cada vez que Arduino envía datos
   - Historial completo disponible

2. **Serial Monitor**:
   - Velocidad: 115200 baudios
   - Diagnóstico en tiempo real
   - Confirmaciones de envío

## Resetear Contadores

Presiona el **botón** conectado al pin 8 para:
- Resetear estadísticas de sensores
- Resetear contadores (entradas, salidas, aforo)
- Mensaje de confirmación en Serial

## Solución de Problemas

### WiFi no conecta
- Verifica SSID y password
- Asegúrate que la red sea 2.4GHz
- Revisa que el Arduino esté en rango de WiFi

### Datos no llegan al dashboard
- Verifica conexión WiFi (debe mostrar "WiFi" en LCD)
- Revisa Serial Monitor para errores HTTP
- Confirma que la URL de Vercel esté correcta

### Sensores no detectan
- Verifica conexiones TRIG/ECHO
- Alimentación 5V y GND correcta
- Prueba con objeto más grande
- Revisa mensajes de diagnóstico en Serial

### LCD no funciona
- Verifica dirección I2C (usar scanner I2C)
- Conexiones SDA/SCL correctas
- El código funcionará sin LCD

## Estado de Conectividad

### En LCD:
- `WiFi`: Conectado y funcionando
- `NoWF`: Sin conexión WiFi

### En Serial:
- "✓ Datos enviados correctamente"
- "✗ Error enviando datos"
- Estado de reconexión automática

## Funcionamiento Automático

Una vez configurado y conectado:
1. Arduino detecta entradas/salidas automáticamente
2. Cuenta y almacena localmente
3. Envía datos cada 30 segundos al dashboard
4. Dashboard web se actualiza en tiempo real
5. Historial se guarda automáticamente

¡Tu sistema ahora funciona completamente integrado! Los datos del Serial Monitor se publican automáticamente en tu dashboard web de Vercel.