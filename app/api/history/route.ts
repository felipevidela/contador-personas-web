import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');
    const deviceId = searchParams.get('deviceId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!process.env.POSTGRES_URL) {
      return NextResponse.json({
        history: [],
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

    const result = await sql.query(query, params);

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

    return NextResponse.json({
      history: result.rows,
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