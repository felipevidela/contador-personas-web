'use client';

import { useState, useEffect } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';
import Pusher from 'pusher-js';

interface HistoryRecord {
  id?: number;
  inCount: number;
  outCount: number;
  aforo: number;
  timestamp: string;
  deviceId?: string;
  created_at?: string;
}

export default function LogsPage() {
  const [logs, setLogs] = useState<HistoryRecord[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<HistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [filterType, setFilterType] = useState<'all' | 'entrada' | 'salida'>('all');
  const [dateFilter, setDateFilter] = useState('');
  const [isConnected, setIsConnected] = useState(false);

  const LOGS_PER_PAGE = 100;

  useEffect(() => {
    fetchLogs();
    setupPusher();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [logs, filterType, dateFilter]);

  const fetchLogs = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/history?limit=1000', {
        cache: 'no-cache',
        headers: { 'Cache-Control': 'no-cache' }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.history && Array.isArray(data.history)) {
        setLogs(data.history);
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const setupPusher = () => {
    if (!process.env.NEXT_PUBLIC_PUSHER_KEY) {
      setIsConnected(false);
      return;
    }

    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'us2',
    });

    const channel = pusher.subscribe('counter-channel');

    channel.bind('counter-update', (data: any) => {
      const newLog = {
        ...data,
        id: Date.now(),
        created_at: data.timestamp
      };
      setLogs(prev => [newLog, ...prev].slice(0, 1000));
    });

    pusher.connection.bind('connected', () => {
      setIsConnected(true);
    });

    pusher.connection.bind('disconnected', () => {
      setIsConnected(false);
    });
  };

  const applyFilters = () => {
    let filtered = [...logs];

    // Filtrar por tipo
    if (filterType !== 'all') {
      filtered = filtered.filter((log, index) => {
        const prevLog = logs[index + 1];
        if (!prevLog) return false;

        const entryChange = log.inCount - prevLog.inCount;
        const exitChange = log.outCount - prevLog.outCount;

        if (filterType === 'entrada') return entryChange > 0;
        if (filterType === 'salida') return exitChange > 0;
        return true;
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

    setFilteredLogs(filtered);
    setCurrentPage(1);
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = isValid(parseISO(timestamp)) ? parseISO(timestamp) : new Date(timestamp);
      return format(date, 'dd/MM/yyyy HH:mm:ss', { locale: es });
    } catch {
      return timestamp;
    }
  };

  const getEventType = (log: HistoryRecord, index: number) => {
    const prevLog = filteredLogs[index + 1];
    if (!prevLog) return null;

    const entryChange = log.inCount - prevLog.inCount;
    const exitChange = log.outCount - prevLog.outCount;

    if (entryChange > 0) return { type: 'entrada', change: entryChange };
    if (exitChange > 0) return { type: 'salida', change: exitChange };
    return null;
  };

  const exportToCSV = () => {
    const csvContent = [
      ['Fecha y Hora', 'Tipo', 'Entradas Totales', 'Salidas Totales', 'Aforo', 'Cambio', 'Dispositivo'],
      ...filteredLogs.map((log, index) => {
        const event = getEventType(log, index);
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

  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * LOGS_PER_PAGE,
    currentPage * LOGS_PER_PAGE
  );

  const totalPages = Math.ceil(filteredLogs.length / LOGS_PER_PAGE);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando logs...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-3xl font-bold text-gray-800">
              Logs del Contador de Personas
            </h1>
            <div className="flex items-center space-x-4">
              <Link href="/" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">
                ← Dashboard
              </Link>
              <div className={`flex items-center ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
                <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-600' : 'bg-red-600'} mr-2 animate-pulse`}></div>
              </div>
            </div>
          </div>

          {/* Filtros */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="border border-gray-300 rounded-lg px-3 py-2 bg-white"
            >
              <option value="all">Todos los eventos</option>
              <option value="entrada">Solo entradas</option>
              <option value="salida">Solo salidas</option>
            </select>

            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2"
            />

            <button
              onClick={() => {
                setFilterType('all');
                setDateFilter('');
              }}
              className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Limpiar filtros
            </button>

            <button
              onClick={exportToCSV}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Exportar CSV
            </button>
          </div>

          <p className="text-gray-600">
            Mostrando {filteredLogs.length} de {logs.length} registros
          </p>
        </div>

        {/* Tabla de logs */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          {paginatedLogs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No hay logs disponibles con los filtros aplicados
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
                      const event = getEventType(log, index);

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
      </div>
    </main>
  );
}