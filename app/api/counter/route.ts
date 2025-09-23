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
        await pusher.trigger('counter-channel', 'counter-update', {
          inCount,
          outCount,
          aforo,
          timestamp: finalTimestamp,
          deviceId
        });
      } catch (pusherError) {
        console.error('Error de Pusher (no crítico):', pusherError);
      }
    }

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
    // Si hay base de datos, obtener últimos registros
    if (process.env.POSTGRES_URL) {
      try {
        const result = await sql`
          SELECT * FROM counter_logs
          ORDER BY created_at DESC
          LIMIT 100
        `;

        // Obtener el último registro
        const latestRecord = result.rows[0];
        if (latestRecord) {
          lastState = {
            inCount: latestRecord.in_count,
            outCount: latestRecord.out_count,
            aforo: latestRecord.aforo,
            timestamp: latestRecord.timestamp,
            deviceId: latestRecord.device_id
          };
        }

        return NextResponse.json({
          current: lastState,
          history: result.rows
        });
      } catch (dbError) {
        console.error('Error de base de datos:', dbError);
      }
    }

    // Devolver estado en memoria si no hay DB
    return NextResponse.json({
      current: lastState,
      history: []
    });

  } catch (error) {
    console.error('Error obteniendo datos:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}