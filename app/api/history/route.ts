import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET(request: NextRequest) {
  try {
    console.log('GET /api/history - Obteniendo historial');

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const deviceId = searchParams.get('deviceId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    console.log(`Parámetros: limit=${limit}, offset=${offset}`);

    if (!process.env.POSTGRES_URL) {
      console.log('Base de datos no configurada, devolviendo historial vacío');
      return NextResponse.json({
        history: [],
        stats: { total_records: '0' },
        pagination: { limit, offset, total: 0 },
        message: 'Base de datos no configurada'
      });
    }

    // Construir query dinámicamente
    let query = `
      SELECT * FROM counter_logs
      WHERE 1=1
    `;

    const params: (string | number)[] = [];

    if (deviceId) {
      params.push(deviceId);
      query += ` AND device_id = $${params.length}`;
    }

    if (startDate) {
      params.push(startDate);
      query += ` AND timestamp >= $${params.length}`;
    }

    if (endDate) {
      params.push(endDate);
      query += ` AND timestamp <= $${params.length}`;
    }

    query += ` ORDER BY timestamp DESC`;
    params.push(limit);
    query += ` LIMIT $${params.length}`;
    params.push(offset);
    query += ` OFFSET $${params.length}`;

    console.log('Ejecutando query:', query);
    console.log('Parámetros:', params);

    const result = await sql.query(query, params);
    console.log(`Query ejecutado, ${result.rows.length} filas obtenidas`);

    // Formatear historial
    const formattedHistory = result.rows.map(row => ({
      id: row.id,
      inCount: row.in_count || 0,
      outCount: row.out_count || 0,
      aforo: row.aforo || 0,
      timestamp: row.timestamp || row.created_at,
      deviceId: row.device_id || 'unknown',
      created_at: row.created_at
    }));

    // Obtener estadísticas
    const statsQuery = `
      SELECT
        COUNT(*) as total_records,
        MAX(in_count) as max_entries,
        MAX(out_count) as max_exits,
        MAX(aforo) as max_aforo,
        MIN(timestamp) as first_record,
        MAX(timestamp) as last_record
      FROM counter_logs
    `;

    const stats = await sql.query(statsQuery);
    console.log('Estadísticas obtenidas:', stats.rows[0]);

    return NextResponse.json({
      history: formattedHistory,
      stats: stats.rows[0],
      pagination: {
        limit,
        offset,
        total: parseInt(stats.rows[0]?.total_records || '0')
      }
    });

  } catch (error) {
    console.error('Error obteniendo historial:', error);
    return NextResponse.json(
      { error: 'Error obteniendo historial' },
      { status: 500 }
    );
  }
}