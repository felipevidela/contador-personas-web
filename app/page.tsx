'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface CounterData {
  inCount: number;
  outCount: number;
  aforo: number;
  timestamp: string;
  deviceId?: string;
}

interface HistoryRecord extends CounterData {
  id?: number;
  created_at?: string;
}

export default function Home() {
  const [currentData, setCurrentData] = useState<CounterData>({
    inCount: 0,
    outCount: 0,
    aforo: 0,
    timestamp: new Date().toISOString()
  });

  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [isLoading, setIsLoading] = useState(true);

  // Cargar datos iniciales
  useEffect(() => {
    fetchCurrentData();
    fetchHistory();

    // Configurar actualización periódica más agresiva (cada 10 segundos)
    const interval = setInterval(() => {
      fetchCurrentData();
      fetchHistory();
    }, 10000);

    // Configurar SSE para actualizaciones en tiempo real
    let eventSource: EventSource | null = null;

    const connectSSE = () => {
      if (eventSource) {
        eventSource.close();
      }

      console.log('Conectando a SSE...');
      eventSource = new EventSource('/api/events');

      eventSource.onopen = () => {
        console.log('✅ Conectado a SSE');
        setIsConnected(true);
      };

      eventSource.onmessage = (event) => {
        try {
          console.log('📨 Evento SSE recibido:', event.data);
          const eventData = JSON.parse(event.data);

          if (eventData.type === 'counter-update') {
            const data = eventData.data;
            console.log('🔄 Actualizando datos:', data);

            setCurrentData(data);
            setLastUpdate(new Date());
            setIsConnected(true);

            // Agregar al historial
            setHistory(prev => [{...data, id: Date.now(), created_at: data.timestamp}, ...prev].slice(0, 50));
          } else if (eventData.type === 'connected') {
            console.log('🎉 SSE Conectado exitosamente');
            setIsConnected(true);
          }
        } catch (error) {
          console.error('❌ Error procesando evento SSE:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('❌ Error en SSE:', error);
        setIsConnected(false);

        // Intentar reconectar después de 5 segundos
        setTimeout(() => {
          if (eventSource?.readyState !== EventSource.OPEN) {
            console.log('🔄 Reintentando conexión SSE...');
            connectSSE();
          }
        }, 5000);
      };
    };

    // Iniciar conexión SSE
    connectSSE();

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      clearInterval(interval);
    };
  }, []);

  // Nota: Pusher reemplazado por SSE para actualizaciones en tiempo real

  const fetchCurrentData = async () => {
    try {
      console.log('🔄 Obteniendo datos actuales...');
      const response = await fetch('/api/counter', {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('📊 Datos recibidos:', data);

      if (data.current) {
        setCurrentData(data.current);
        setLastUpdate(new Date());
        console.log('✅ Datos actuales actualizados');
      }
      if (data.history) {
        setHistory(data.history.slice(0, 50));
        console.log('📋 Historial actualizado:', data.history.length, 'registros');
      }
      setIsLoading(false);
    } catch (error) {
      console.error('❌ Error obteniendo datos:', error);
      setIsLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      console.log('📋 Obteniendo historial...');
      const response = await fetch('/api/history?limit=50', {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('📋 Historial recibido:', data);

      if (data.history && Array.isArray(data.history)) {
        setHistory(data.history);
        console.log('✅ Historial actualizado con', data.history.length, 'registros');
      }
    } catch (error) {
      console.error('❌ Error obteniendo historial:', error);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      return format(new Date(timestamp), 'dd/MM/yyyy HH:mm:ss', { locale: es });
    } catch {
      return timestamp;
    }
  };

  const formatRelativeTime = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return `Hace ${seconds} segundos`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `Hace ${minutes} minutos`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Hace ${hours} horas`;
    const days = Math.floor(hours / 24);
    return `Hace ${days} días`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando datos...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-800">
              Sistema Contador de Personas
            </h1>
            <div className="flex items-center space-x-4">
              <div className={`flex items-center ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
                <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-600' : 'bg-red-600'} mr-2 animate-pulse`}></div>
                <span className="text-sm font-medium">
                  {isConnected ? 'Tiempo Real' : 'Desconectado'}
                </span>
              </div>
              <div className="text-sm text-gray-500">
                {formatRelativeTime(lastUpdate)}
              </div>
            </div>
          </div>
        </div>

        {/* Métricas principales */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {/* Entradas */}
          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-lg p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100 text-sm font-medium uppercase tracking-wide">
                  Entradas
                </p>
                <p className="text-4xl font-bold mt-2">
                  {currentData.inCount}
                </p>
              </div>
              <svg className="w-12 h-12 text-green-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </div>
          </div>

          {/* Salidas */}
          <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-lg shadow-lg p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-red-100 text-sm font-medium uppercase tracking-wide">
                  Salidas
                </p>
                <p className="text-4xl font-bold mt-2">
                  {currentData.outCount}
                </p>
              </div>
              <svg className="w-12 h-12 text-red-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" />
              </svg>
            </div>
          </div>

          {/* Aforo */}
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-lg p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm font-medium uppercase tracking-wide">
                  Aforo Actual
                </p>
                <p className="text-4xl font-bold mt-2">
                  {Math.max(0, currentData.aforo)}
                </p>
              </div>
              <svg className="w-12 h-12 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Última actualización */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Última Actualización
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-600">Fecha y Hora</p>
              <p className="text-lg font-medium text-gray-800">
                {formatTimestamp(currentData.timestamp)}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-600">Dispositivo</p>
              <p className="text-lg font-medium text-gray-800">
                {currentData.deviceId || 'No identificado'}
              </p>
            </div>
          </div>
        </div>

        {/* Historial */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Historial de Registros
          </h2>

          {history.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No hay registros disponibles
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Fecha y Hora
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Entradas
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Salidas
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Aforo
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Cambio
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {history.map((record, index) => {
                    const prevRecord = history[index + 1];
                    const changeIn = prevRecord ? record.inCount - prevRecord.inCount : 0;
                    const changeOut = prevRecord ? record.outCount - prevRecord.outCount : 0;

                    return (
                      <tr key={record.id || index} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatTimestamp(record.timestamp)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                          <span className="text-gray-900">{record.inCount}</span>
                          {changeIn > 0 && (
                            <span className="ml-2 text-green-600 text-xs">
                              +{changeIn}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                          <span className="text-gray-900">{record.outCount}</span>
                          {changeOut > 0 && (
                            <span className="ml-2 text-red-600 text-xs">
                              +{changeOut}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-center font-medium">
                          <span className={`${record.aforo > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                            {Math.max(0, record.aforo)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                          {changeIn > 0 && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Entrada
                            </span>
                          )}
                          {changeOut > 0 && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              Salida
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
