import { NextRequest } from 'next/server';
import { addSSEConnection, removeSSEConnection } from '../../../lib/sse';

export async function GET(request: NextRequest) {
  // Crear stream para SSE
  const stream = new ReadableStream({
    start(controller) {
      const writer = controller;

      // Agregar conexión al store
      addSSEConnection(writer);

      // Enviar evento inicial de conexión
      const welcomeEvent = `data: ${JSON.stringify({
        type: 'connected',
        message: 'Conectado al stream de eventos',
        timestamp: new Date().toISOString()
      })}\n\n`;

      writer.enqueue(new TextEncoder().encode(welcomeEvent));

      // Cleanup cuando se cierra la conexión
      request.signal.addEventListener('abort', () => {
        removeSSEConnection(writer);
        try {
          controller.close();
        } catch {
          // Conexión ya cerrada
        }
      });
    }
  });

  // Retornar respuesta SSE
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Cache-Control',
    },
  });
}