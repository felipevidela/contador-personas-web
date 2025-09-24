// Store para mantener conexiones SSE activas
const sseConnections = new Set<ReadableStreamDefaultController>();

// Función para enviar evento a todas las conexiones
export function broadcastEvent(data: Record<string, unknown>) {
  const eventData = `data: ${JSON.stringify(data)}\n\n`;

  sseConnections.forEach((controller) => {
    try {
      controller.enqueue(new TextEncoder().encode(eventData));
    } catch {
      // Remover conexión si está cerrada
      sseConnections.delete(controller);
    }
  });
}

// Función para agregar conexión
export function addSSEConnection(controller: ReadableStreamDefaultController) {
  sseConnections.add(controller);
}

// Función para remover conexión
export function removeSSEConnection(controller: ReadableStreamDefaultController) {
  sseConnections.delete(controller);
}