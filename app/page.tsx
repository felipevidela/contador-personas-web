'use client';

// Sistema de tabs integrado v2.0
import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import Pusher from 'pusher-js';

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
  const [allLogs, setAllLogs] = useState<HistoryRecord[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'resumen' | 'logs'>('resumen');
  const [filterType, setFilterType] = useState<'all' | 'entrada' | 'salida'>('all');
  const [dateFilter, setDateFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Cargar datos iniciales
  useEffect(() => {
    fetchCurrentData();
    fetchHistory();

    // Configurar polling como respaldo (cada 30 segundos)
    const interval = setInterval(() => {
      fetchCurrentData();
      fetchHistory();
    }, 30000);

    // Configurar Pusher para tiempo real
    let pusher: Pusher | null = null;

    const connectPusher = () => {
      if (!process.env.NEXT_PUBLIC_PUSHER_KEY) {
        console.log('⚠️ Pusher no configurado, usando solo polling');
        setIsConnected(false);
        return;
      }

      console.log('🚀 Conectando a Pusher...');
      pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, {
        cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'us2',
      });

      const channel = pusher.subscribe('counter-channel');

      channel.bind('counter-update', (data: CounterData) => {
        console.log('📨 Evento Pusher recibido:', data);
        setCurrentData(data);
        setLastUpdate(new Date());
        setIsConnected(true);

        // Agregar al historial
        setHistory(prev => [{...data, id: Date.now(), created_at: data.timestamp}, ...prev].slice(0, 50));
      });

      pusher.connection.bind('connected', () => {
        setIsConnected(true);
        console.log('✅ Conectado a Pusher');
      });

      pusher.connection.bind('disconnected', () => {
        setIsConnected(false);
        console.log('❌ Desconectado de Pusher');
      });

      pusher.connection.bind('error', (error: unknown) => {
        setIsConnected(false);
        console.error('❌ Error de Pusher:', error);
      });
    };

    // Iniciar conexión Pusher
    connectPusher();

    return () => {
      if (pusher) {
        pusher.unsubscribe('counter-channel');
        pusher.disconnect();
      }
      clearInterval(interval);
    };
  }, []);

  // Nota: SSE reemplazado por Pusher - funciona correctamente en Vercel serverless

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
      // Obtener resumen (50 registros)
      const responseResumen = await fetch('/api/history?limit=50', {
        cache: 'no-cache',
        headers: { 'Cache-Control': 'no-cache' }
      });

      if (responseResumen.ok) {
        const dataResumen = await responseResumen.json();
        if (dataResumen.history && Array.isArray(dataResumen.history)) {
          setHistory(dataResumen.history);
        }
      }

      // Obtener todos los logs (1000 registros)
      const responseAll = await fetch('/api/history?limit=1000', {
        cache: 'no-cache',
        headers: { 'Cache-Control': 'no-cache' }
      });

      if (responseAll.ok) {
        const dataAll = await responseAll.json();
        if (dataAll.history && Array.isArray(dataAll.history)) {
          setAllLogs(dataAll.history);
          console.log('✅ Logs completos actualizados con', dataAll.history.length, 'registros');
        }
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

  const getEventType = (log: HistoryRecord, index: number, logs: HistoryRecord[]) => {
    const prevLog = logs[index + 1];
    if (!prevLog) return null;

    const entryChange = log.inCount - prevLog.inCount;
    const exitChange = log.outCount - prevLog.outCount;

    if (entryChange > 0) return { type: 'entrada', change: entryChange };
    if (exitChange > 0) return { type: 'salida', change: exitChange };
    return null;
  };

  const getFilteredLogs = () => {
    let filtered = [...allLogs];

    // Filtrar por tipo
    if (filterType !== 'all') {
      filtered = filtered.filter((log, index) => {
        const event = getEventType(log, index, allLogs);
        if (!event) return false;
        return filterType === event.type;
      });
    }

    // Filtrar por fecha
    if (dateFilter) {
      const filterDate = new Date(dateFilter);
      filtered = filtered.filter(log => {
        const logDate = new Date(log.timestamp);
        return logDate.toDateString() === filterDate.toDateString();
      });
    }

    return filtered;
  };

  const exportToCSV = () => {
    const filtered = getFilteredLogs();
    const csvContent = [
      ['Fecha y Hora', 'Tipo', 'Entradas Totales', 'Salidas Totales', 'Aforo', 'Cambio', 'Dispositivo'],
      ...filtered.map((log, index) => {
        const event = getEventType(log, index, filtered);
        return [
          formatTimestamp(log.timestamp),
          event?.type || 'N/A',
          log.inCount,
          log.outCount,
          log.aforo,
          event?.change || 0,
          log.deviceId || 'N/A'
        ];
      })
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-contador-personas-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
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

        {/* Historial con Tabs */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          {/* Tabs Header */}
          <div className="flex justify-between items-center mb-6">
            <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setActiveTab('resumen')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'resumen'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Resumen
              </button>
              <button
                onClick={() => setActiveTab('logs')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'logs'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Logs Completos
              </button>
            </div>

            {activeTab === 'logs' && (
              <div className="flex items-center space-x-2">
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as any)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="all">Todos</option>
                  <option value="entrada">Entradas</option>
                  <option value="salida">Salidas</option>
                </select>

                <input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />

                <button
                  onClick={() => {
                    setFilterType('all');
                    setDateFilter('');
                  }}
                  className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-2 rounded-lg text-sm transition-colors"
                >
                  Limpiar
                </button>

                <button
                  onClick={exportToCSV}
                  className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-sm transition-colors"
                >
                  CSV
                </button>
              </div>
            )}
          </div>

          {/* Tab Content */}
          {activeTab === 'resumen' ? (
            // Tab Resumen - Vista actual simplificada
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Últimos 50 Registros</h3>
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
          ) : (
            // Tab Logs Completos - Vista extendida con filtros
            (() => {
              const filteredLogs = getFilteredLogs();
              const LOGS_PER_PAGE = 100;
              const paginatedLogs = filteredLogs.slice(
                (currentPage - 1) * LOGS_PER_PAGE,
                currentPage * LOGS_PER_PAGE
              );
              const totalPages = Math.ceil(filteredLogs.length / LOGS_PER_PAGE);

              return (
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">
                    Logs Completos - {filteredLogs.length} registros
                  </h3>

                  {paginatedLogs.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      No hay logs con los filtros aplicados
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Fecha y Hora
                              </th>
                              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Tipo
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
                                Dispositivo
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {paginatedLogs.map((log, index) => {
                              const event = getEventType(log, filteredLogs.indexOf(log), filteredLogs);

                              return (
                                <tr key={log.id || index} className="hover:bg-gray-50">
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    {formatTimestamp(log.timestamp)}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-center">
                                    {event ? (
                                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                                        event.type === 'entrada'
                                          ? 'bg-green-100 text-green-800'
                                          : 'bg-red-100 text-red-800'
                                      }`}>
                                        {event.type === 'entrada' ? '↗️ Entrada' : '↙️ Salida'}
                                        {event.change > 1 && ` (+${event.change})`}
                                      </span>
                                    ) : (
                                      <span className="text-gray-400">-</span>
                                    )}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center font-medium text-gray-900">
                                    {log.inCount}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center font-medium text-gray-900">
                                    {log.outCount}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center font-medium">
                                    <span className={`${log.aforo > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                                      {Math.max(0, log.aforo)}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-500">
                                    {log.deviceId || 'N/A'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Paginación */}
                      {totalPages > 1 && (
                        <div className="mt-6 flex items-center justify-between">
                          <div className="text-sm text-gray-700">
                            Página {currentPage} de {totalPages}
                          </div>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                              disabled={currentPage === 1}
                              className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                            >
                              Anterior
                            </button>
                            <button
                              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                              disabled={currentPage === totalPages}
                              className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                            >
                              Siguiente
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })()
          )}
        </div>
      </div>
    </main>
  );
}
