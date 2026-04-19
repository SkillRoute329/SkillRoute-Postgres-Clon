/**
 * Componente: Panel de Alertas en Tiempo Real
 * Muestra alertas críticas y notificaciones de inspectores
 */

import React, { useState, useCallback } from 'react';
import { useInspectorAlerts, useConnectedUsers } from '../../hooks/useRealtimeData';
import { useSocket } from '../../hooks/useSocket';
import type { InspectorAlert } from '../../services/socketService';

interface AlertPanelProps {
  showHeader?: boolean;
  maxAlerts?: number;
  autoHideDuration?: number;
}

export const AlertPanel: React.FC<AlertPanelProps> = ({
  showHeader = true,
  maxAlerts = 10,
  autoHideDuration = 10000,
}) => {
  const { alerts, criticalAlerts, hasCriticalAlerts, clearCriticalAlerts } = useInspectorAlerts();
  const { users, count } = useConnectedUsers();
  const { connected } = useSocket(
    {
      id: 'alert-panel',
      internalNumber: '0000',
      fullName: 'Alert Monitor',
      role: 'Admin',
    },
    { autoConnect: false },
  );

  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  const dismissAlert = useCallback((vehicleId: string) => {
    setDismissedAlerts((prev) => new Set(prev).add(vehicleId));
  }, []);

  const getSeverityColor = (severity: 'info' | 'warning' | 'critical') => {
    switch (severity) {
      case 'critical':
        return 'bg-red-50 border-red-200 text-red-900';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200 text-yellow-900';
      case 'info':
      default:
        return 'bg-blue-50 border-blue-200 text-blue-900';
    }
  };

  const getSeverityBadge = (severity: 'info' | 'warning' | 'critical') => {
    switch (severity) {
      case 'critical':
        return 'bg-red-500 text-white';
      case 'warning':
        return 'bg-yellow-500 text-white';
      case 'info':
      default:
        return 'bg-blue-500 text-white';
    }
  };

  const filteredAlerts = alerts
    .filter((alert) => !dismissedAlerts.has(alert.vehicleId))
    .slice(0, maxAlerts);

  return (
    <div className="w-full bg-white rounded-lg shadow">
      {/* Header */}
      {showHeader && (
        <div className="p-4 border-b border-gray-200">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-bold text-gray-800">Centro de Alertas</h2>
            <div className="flex gap-2">
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  connected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}
              >
                {connected ? '🟢 Activo' : '🔴 Inactivo'}
              </span>
            </div>
          </div>

          {/* Estadísticas rápidas */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-red-50 p-3 rounded">
              <p className="text-xs text-red-600 font-semibold">ALERTAS CRÍTICAS</p>
              <p className="text-2xl font-bold text-red-600">{criticalAlerts.length}</p>
            </div>
            <div className="bg-yellow-50 p-3 rounded">
              <p className="text-xs text-yellow-600 font-semibold">TOTAL ALERTAS</p>
              <p className="text-2xl font-bold text-yellow-600">{alerts.length}</p>
            </div>
            <div className="bg-blue-50 p-3 rounded">
              <p className="text-xs text-blue-600 font-semibold">USUARIOS EN LÍNEA</p>
              <p className="text-2xl font-bold text-blue-600">{count}</p>
            </div>
          </div>
        </div>
      )}

      {/* Alertas críticas destacadas */}
      {hasCriticalAlerts && (
        <div className="p-4 bg-red-50 border-b-2 border-red-500">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🚨</span>
              <h3 className="font-bold text-red-900">ALERTAS CRÍTICAS</h3>
            </div>
            <button
              onClick={clearCriticalAlerts}
              className="text-sm text-red-600 hover:text-red-800 font-semibold"
            >
              Descartar todas
            </button>
          </div>

          <div className="space-y-2">
            {criticalAlerts.slice(0, 3).map((alert) => (
              <div
                key={`critical-${alert.vehicleId}`}
                className="bg-white p-3 rounded border-l-4 border-red-500"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-red-900">Vehículo: {alert.vehicleId}</p>
                    <p className="text-sm text-red-700">{alert.message}</p>
                    <p className="text-xs text-red-600 mt-1">
                      {new Date(alert.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                  <button
                    onClick={() => dismissAlert(alert.vehicleId)}
                    className="text-red-600 hover:text-red-800 font-bold"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista de alertas */}
      <div className="p-4 max-h-96 overflow-y-auto">
        {filteredAlerts.length > 0 ? (
          <div className="space-y-2">
            {filteredAlerts.map((alert, index) => (
              <div
                key={`${alert.vehicleId}-${index}`}
                className={`p-3 rounded border-l-4 ${getSeverityColor(alert.severity)}`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-xs font-bold px-2 py-1 rounded ${getSeverityBadge(
                          alert.severity,
                        )}`}
                      >
                        {alert.severity.toUpperCase()}
                      </span>
                      <span className="text-sm font-bold">{alert.vehicleId}</span>
                    </div>
                    <p className="text-sm mb-1">{alert.message}</p>
                    <p className="text-xs opacity-75">
                      {new Date(alert.timestamp).toLocaleTimeString()}
                    </p>
                  </div>

                  <button
                    onClick={() => dismissAlert(alert.vehicleId)}
                    className="ml-2 text-gray-400 hover:text-gray-600 text-lg"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-500">
              {connected ? 'Sin alertas en este momento' : 'Conectando...'}
            </p>
          </div>
        )}
      </div>

      {/* Usuarios conectados */}
      {users.length > 0 && (
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <p className="text-xs font-semibold text-gray-600 mb-2">USUARIOS EN LÍNEA</p>
          <div className="flex flex-wrap gap-2">
            {users.slice(0, 5).map((user) => (
              <span
                key={user.userId}
                className="text-xs bg-gray-200 text-gray-800 px-2 py-1 rounded"
              >
                {user.fullName}
              </span>
            ))}
            {users.length > 5 && (
              <span className="text-xs bg-gray-300 text-gray-800 px-2 py-1 rounded font-semibold">
                +{users.length - 5} más
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AlertPanel;
