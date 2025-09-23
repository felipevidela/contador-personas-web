# Sistema Contador de Personas

Sistema web para visualizar en tiempo real los datos del contador de personas con Arduino.

## Características

- **Tiempo Real**: Actualización automática de datos usando Pusher WebSockets
- **Dashboard Interactivo**: Visualización de entradas, salidas y aforo actual
- **Historial Completo**: Registro de todos los eventos con fecha y hora
- **Responsive**: Funciona en dispositivos móviles y desktop
- **Persistencia**: Datos almacenados en base de datos PostgreSQL

## Componentes del Sistema

### 1. Hardware (Arduino)
- **Archivo**: `contador_personas_wifi.ino`
- **Funcionalidades**:
  - Detección bidireccional con sensores ultrasónicos
  - Conexión WiFi para envío de datos
  - Pantalla LCD para visualización local
  - Almacenamiento en EEPROM para persistencia

### 2. Backend (Next.js API)
- **POST /api/counter**: Recibe datos del Arduino
- **GET /api/counter**: Obtiene estado actual
- **GET /api/history**: Obtiene historial de registros

### 3. Frontend (React/Next.js)
- Dashboard en tiempo real
- Visualización de métricas principales
- Tabla de historial con filtros
- Indicadores de conexión

## Configuración

### 1. Arduino
Modificar en `contador_personas_wifi.ino`:
```cpp
const char* ssid = "TU_WIFI_SSID";
const char* password = "TU_WIFI_PASSWORD";
const char* serverUrl = "https://tu-app.vercel.app/api/counter";
```

### 2. Variables de Entorno
Crear archivo `.env.local`:
```bash
# Pusher (tiempo real)
NEXT_PUBLIC_PUSHER_KEY=your_pusher_key
NEXT_PUBLIC_PUSHER_CLUSTER=us2
PUSHER_APP_ID=your_app_id
PUSHER_KEY=your_pusher_key
PUSHER_SECRET=your_pusher_secret

# Base de datos (Vercel Postgres)
POSTGRES_URL=your_postgres_url
```

### 3. Servicios Externos

#### Pusher (Opcional - para tiempo real)
1. Crear cuenta en [pusher.com](https://pusher.com)
2. Crear nueva app
3. Copiar credenciales a `.env.local`

#### Vercel Postgres (Opcional - para persistencia)
1. En Vercel dashboard, ir a Storage
2. Crear nueva base de datos Postgres
3. Copiar credenciales a variables de entorno

## Despliegue en Vercel

### 1. Preparación
```bash
npm install
npm run build
```

### 2. Desplegar
```bash
# Instalar Vercel CLI
npm i -g vercel

# Inicializar proyecto
vercel

# Configurar variables de entorno en Vercel dashboard
# Desplegar
vercel --prod
```

### 3. Configurar Variables de Entorno en Vercel
1. Ir a Vercel Dashboard
2. Seleccionar el proyecto
3. Ir a Settings > Environment Variables
4. Agregar todas las variables de `.env.local`

## Uso

### Visualización Web
- **Métricas Principales**: Entradas, Salidas, Aforo actual
- **Tiempo Real**: Actualizaciones automáticas cada vez que alguien entra/sale
- **Historial**: Tabla con todos los registros y fechas exactas
- **Estado de Conexión**: Indicador visual del estado del sistema

### API Endpoints

#### Enviar Datos (Arduino → Servidor)
```http
POST /api/counter
Content-Type: application/json

{
  "inCount": 10,
  "outCount": 8,
  "aforo": 2,
  "timestamp": "2024-01-15T10:30:45.000Z",
  "deviceId": "AA:BB:CC:DD:EE:FF"
}
```

#### Obtener Estado Actual
```http
GET /api/counter
```

#### Obtener Historial
```http
GET /api/history?limit=50&offset=0
```

## Desarrollo Local

```bash
# Instalar dependencias
npm install

# Ejecutar en desarrollo
npm run dev

# Abrir http://localhost:3000
```

## Tecnologías

- **Arduino**: ESP32/ESP8266 con WiFi
- **Backend**: Next.js 14 con API Routes
- **Frontend**: React 18 con TypeScript
- **Styling**: Tailwind CSS
- **Base de Datos**: Vercel Postgres
- **Tiempo Real**: Pusher WebSockets
- **Despliegue**: Vercel
