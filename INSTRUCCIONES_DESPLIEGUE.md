# Instrucciones Paso a Paso - Sistema Contador de Personas

## 📋 Checklist Completo

### ✅ Paso 1: Preparar Arduino
1. **Instalar librerías necesarias** en Arduino IDE:
   ```
   - WiFi (ESP32) o ESP8266WiFi
   - ArduinoJson
   - HTTPClient
   - NTPClient
   - LiquidCrystal_I2C
   ```

2. **Cargar código WiFi** (`contador_personas_wifi.ino`):
   - Abrir archivo en Arduino IDE
   - Modificar credenciales WiFi:
     ```cpp
     const char* ssid = "TU_WIFI_SSID";
     const char* password = "TU_WIFI_PASSWORD";
     ```
   - **NO modificar** serverUrl todavía (se hará después del despliegue)

3. **Compilar y subir** al ESP32/ESP8266

### ✅ Paso 2: Configurar Servicios (Opcional pero Recomendado)

#### Pusher (para tiempo real)
1. Ir a [pusher.com](https://pusher.com) y crear cuenta
2. Crear nueva aplicación:
   - Nombre: "contador-personas"
   - Cluster: "us2"
   - Frontend tech: "React"
   - Backend tech: "Node.js"
3. **Anotar credenciales**:
   - `app_id`
   - `key`
   - `secret`
   - `cluster`

#### GitHub (para código)
1. Crear repositorio en GitHub
2. Subir código:
   ```bash
   cd contador-personas-web
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/tu-usuario/contador-personas.git
   git push -u origin main
   ```

### ✅ Paso 3: Desplegar en Vercel

#### Opción A: Desde GitHub (Recomendado)
1. Ir a [vercel.com](https://vercel.com) y conectar con GitHub
2. Importar repositorio `contador-personas`
3. Configurar:
   - Framework: Next.js
   - Root Directory: `contador-personas-web`
   - Build Command: `npm run build`
   - Output Directory: `.next`

#### Opción B: Desde CLI
```bash
cd contador-personas-web
npm install -g vercel
vercel login
vercel
# Seguir instrucciones en pantalla
```

### ✅ Paso 4: Configurar Variables de Entorno en Vercel

1. En Vercel Dashboard → Proyecto → Settings → Environment Variables
2. Agregar variables (si configuraste Pusher):
   ```
   NEXT_PUBLIC_PUSHER_KEY = tu_pusher_key
   NEXT_PUBLIC_PUSHER_CLUSTER = us2
   PUSHER_APP_ID = tu_app_id
   PUSHER_KEY = tu_pusher_key
   PUSHER_SECRET = tu_pusher_secret
   ```

3. **Opcional**: Para base de datos persistente:
   - En Vercel → Storage → Create Database → Postgres
   - Copiar todas las variables que empiecen con `POSTGRES_`

4. **Redesplegar** después de agregar variables:
   - Ir a Deployments → Redeploy

### ✅ Paso 5: Obtener URL y Actualizar Arduino

1. **Copiar URL de producción** desde Vercel (ej: `https://contador-personas-abc123.vercel.app`)

2. **Actualizar código Arduino**:
   ```cpp
   const char* serverUrl = "https://tu-url-vercel.vercel.app/api/counter";
   ```

3. **Compilar y subir** Arduino nuevamente

### ✅ Paso 6: Probar Sistema

1. **Verificar web**: Abrir URL de Vercel en navegador
2. **Probar Arduino**:
   - Monitor serial debe mostrar conexión WiFi exitosa
   - Al detectar movimiento, debe enviar datos
3. **Verificar tiempo real**: Los cambios deben aparecer inmediatamente en web

## 🔧 Configuración Mínima (Sin Servicios Externos)

Si prefieres empezar sin Pusher ni base de datos:

1. **Desplegar** directamente en Vercel sin variables de entorno
2. **El sistema funcionará** con:
   - Datos en memoria del servidor
   - Actualización cada 30 segundos (polling)
   - Sin persistencia entre reinicios

3. **Agregar servicios después** cuando estés listo

## 📱 URLs y Accesos

Después del despliegue tendrás:

- **Web App**: `https://tu-proyecto.vercel.app`
- **API Status**: `https://tu-proyecto.vercel.app/api/counter`
- **API Historial**: `https://tu-proyecto.vercel.app/api/history`

## 🐛 Solución de Problemas

### Arduino no conecta a WiFi
```cpp
// Agregar debug en setup():
Serial.print("Conectando a: ");
Serial.println(ssid);
Serial.print("Resultado: ");
Serial.println(WiFi.status());
```

### Datos no llegan al servidor
1. Verificar URL en código Arduino
2. Comprobar conectividad: `ping tu-url-vercel.vercel.app`
3. Revisar logs en Vercel → Functions

### Web no actualiza en tiempo real
1. Sin Pusher: Normal, actualiza cada 30s
2. Con Pusher: Verificar credenciales en Variables de Entorno
3. Verificar consola del navegador para errores

## 🚀 Funcionalidades Disponibles

### Inmediatamente Disponible
- ✅ Dashboard web responsivo
- ✅ Visualización de entradas/salidas/aforo
- ✅ Tabla de historial
- ✅ API REST completa
- ✅ Indicadores de conexión

### Con Configuración Opcional
- 🔄 **Pusher**: Actualizaciones en tiempo real
- 💾 **Postgres**: Persistencia de datos históricos
- 📊 **Analytics**: Métricas avanzadas

## 📞 Soporte

Si tienes problemas:
1. Revisar logs del Arduino (Monitor Serial)
2. Revisar logs de Vercel (Functions tab)
3. Verificar consola del navegador (F12)
4. Comprobar que todas las variables de entorno están configuradas