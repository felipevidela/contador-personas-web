import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import Pusher from 'pusher';

// Inicializar Pusher solo si las credenciales están configuradas
const pusher = process.env.PUSHER_APP_ID ? new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS: true
}) : null;

// Log del estado de Pusher al inicializar
if (pusher) {
  console.log('✅ Pusher configurado correctamente');
} else {
  console.log('⚠️ Pusher NO configurado - faltan variables de entorno');
  console.log('Variables requeridas: PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER');
}

// Almacenar último estado en memoria (para desarrollo sin DB)
let lastState = {
  inCount: 0,
  outCount: 0,
  aforo: 0,
  timestamp: new Date().toISOString(),
  deviceId: 'unknown'
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { inCount, outCount, aforo, timestamp, deviceId, recentEvents } = body;

    // Validar datos
    if (typeof inCount !== 'number' || typeof outCount !== 'number' || typeof aforo !== 'number') {
      return NextResponse.json(
        { error: 'Datos inválidos' },
        { status: 400 }
      );
    }

    // Crear timestamp si no viene
    const finalTimestamp = timestamp || new Date().toISOString();

    // Actualizar estado en memoria
    lastState = {
      inCount,
      outCount,
      aforo,
      timestamp: finalTimestamp,
      deviceId: deviceId || 'unknown'
    };

    // Intentar guardar en base de datos si está configurada
    if (process.env.POSTGRES_URL) {
      try {
        // Crear tabla si no existe
        await sql`
          CREATE TABLE IF NOT EXISTS counter_logs (
            id SERIAL PRIMARY KEY,
            in_count INTEGER NOT NULL,
            out_count INTEGER NOT NULL,
            aforo INTEGER NOT NULL,
            device_id VARCHAR(255),
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `;

        // Insertar registro
        await sql`
          INSERT INTO counter_logs (in_count, out_count, aforo, device_id, timestamp)
          VALUES (${inCount}, ${outCount}, ${aforo}, ${deviceId}, ${finalTimestamp})
        `;

        // Guardar eventos recientes si vienen
        if (recentEvents && Array.isArray(recentEvents)) {
          for (const event of recentEvents) {
            await sql`
              INSERT INTO counter_events (device_id, is_entry, aforo_at_time, event_timestamp)
              VALUES (${deviceId}, ${event.isEntry}, ${event.aforoAtTime}, ${event.timestamp})
            `;
          }
        }
      } catch (dbError) {
        console.error('Error de base de datos (no crítico):', dbError);
      }
    }

    // Enviar actualización en tiempo real vía Pusher
    if (pusher) {
      try {
        console.log('📡 Enviando evento Pusher...');
        await pusher.trigger('counter-channel', 'counter-update', {
          inCount,
          outCount,
          aforo,
          timestamp: finalTimestamp,
          deviceId
        });
        console.log('✅ Evento Pusher enviado correctamente');
      } catch (pusherError) {
        console.error('❌ Error de Pusher:', pusherError);
      }
    } else {
      console.log('⚠️ Pusher no configurado - variables de entorno faltantes');
    }

    // SSE removido - no funciona en Vercel serverless

    return NextResponse.json({
      success: true,
      data: {
        inCount,
        outCount,
        aforo,
        timestamp: finalTimestamp
      }
    });

  } catch (error) {
    console.error('Error procesando datos:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    console.log('GET /api/counter - Obteniendo datos actuales');

    // Si hay base de datos, obtener últimos registros
    if (process.env.POSTGRES_URL) {
      try {
        console.log('Consultando base de datos PostgreSQL');

        // Crear tabla si no existe
        await sql`
          CREATE TABLE IF NOT EXISTS counter_logs (
            id SERIAL PRIMARY KEY,
            in_count INTEGER NOT NULL DEFAULT 0,
            out_count INTEGER NOT NULL DEFAULT 0,
            aforo INTEGER NOT NULL DEFAULT 0,
            device_id VARCHAR(255) DEFAULT 'unknown',
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `;

        const result = await sql`
          SELECT
            id,
            in_count,
            out_count,
            aforo,
            device_id,
            timestamp,
            created_at
          FROM counter_logs
          ORDER BY created_at DESC
          LIMIT 10
        `;

        console.log(`Encontrados ${result.rows.length} registros en BD`);

        // Obtener el último registro
        const latestRecord = result.rows[0];
        if (latestRecord) {
          lastState = {
            inCount: latestRecord.in_count || 0,
            outCount: latestRecord.out_count || 0,
            aforo: latestRecord.aforo || 0,
            timestamp: latestRecord.timestamp || new Date().toISOString(),
            deviceId: latestRecord.device_id || 'unknown'
          };
          console.log('Estado actualizado desde BD:', lastState);
        }

        // Formatear historial para frontend
        const formattedHistory = result.rows.map(row => ({
          id: row.id,
          inCount: row.in_count || 0,
          outCount: row.out_count || 0,
          aforo: row.aforo || 0,
          timestamp: row.timestamp || row.created_at,
          deviceId: row.device_id || 'unknown',
          created_at: row.created_at
        }));

        return NextResponse.json({
          current: lastState,
          history: formattedHistory,
          source: 'database'
        });

      } catch (dbError) {
        console.error('Error de base de datos:', dbError);
        // Continuar con estado en memoria
      }
    }

    // Devolver estado en memoria si no hay DB o si hay error
    console.log('Usando estado en memoria:', lastState);
    return NextResponse.json({
      current: lastState,
      history: [],
      source: 'memory'
    });

  } catch (error) {
    console.error('Error obteniendo datos:', error);
    return NextResponse.json(
      {
        error: 'Error interno del servidor',
        current: lastState,
        history: []
      },
      { status: 500 }
    );
  }
}