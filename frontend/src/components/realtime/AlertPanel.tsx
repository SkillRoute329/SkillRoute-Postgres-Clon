import React, { useState, useCallback } from 'react';
import { useInspectorAlerts } from '../../hooks/useRealtimeData';
import type { InspectorAlert } from '../../services/socketService';

interface AlertPanelProps {
  showHeader?: boolean;
  maxAlerts?: number;
}

export const AlertPanel: React.FC<AlertPanelProps> = ({
  showHeader = true,
  maxAlerts = 10,
}) => {
  const { alerts, criticalAlerts, hasCriticalAlerts, clearCriticalAlerts } = useInspectorAlerts();
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  const dismissAlert = useCallback((vehicleId: string) => {
    setDismissedAlerts((prev) => new Set(prev).add(vehicleId));
  }, []);

  const severityClass = (severity: InspectorAlert['severity']) => {
    switch (severity) {
      case 'critical': return 'bg-red-500/10 border-red-500/30 text-red-300';
      case 'warning':  return 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300';
      default:         return 'bg-blue-500/10 border-blue-500/30 text-blue-300';
    }
  };

  const severityBadge = (severity: InspectorAlert['severity']) => {
    switch (severity) {
      case 'critical': return 'bg-red-500 text-white';
      case 'warning':  return 'bg-yellow-500 text-black';
      default:         return 'bg-blue-500 text-white';
    }
  };

  const severityLabel = (severity: InspectorAlert['severity']) => {
    switch (severity) {
      case 'critical': return 'CRÍTICA';
      case 'warning':  return 'ADVERTENCIA';
      default:         return 'INFO';
    }
  };

  const filteredAlerts = alerts
    .filter((a) => !dismissedAlerts.has(a.vehicleId))
    .slice(0, maxAlerts);

  return (
    <div className="w-full bg-slate-900 rounded-xl border border-slate-800 shadow-xl">
      {showHeader && (
        <div className="p-4 border-b border-slate-800">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-bold text-white">Centro de Alertas</h2>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold border ${
                alerts.length > 0
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  : 'bg-slate-800 text-slate-500 border-slate-700'
              }`}
            >
              {alerts.length > 0 ? 'ACTIVO' : 'SIN ALERTAS'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-lg">
              <p className="text-[10px] text-red-400 font-bold uppercase tracking-wider">
                Alertas Críticas
              </p>
              <p className="text-2xl font-black text-red-400 mt-1">{criticalAlerts.length}</p>
            </div>
            <div className="bg-slate-800 border border-slate-700 p-3 rounded-lg">
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                Total Alertas
              </p>
              <p className="text-2xl font-black text-white mt-1">{alerts.length}</p>
            </div>
          </div>
        </div>
      )}

      {hasCriticalAlerts && (
        <div className="p-4 bg-red-500/10 border-b border-red-500/30">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-red-400 flex items-center gap-2">
              <span>🚨</span> Alertas Críticas
            </h3>
            <button
              onClick={clearCriticalAlerts}
              className="text-xs text-red-400 hover:text-red-300 font-semibold"
            >
              Descartar todas
            </button>
          </div>
          <div className="space-y-2">
            {criticalAlerts.slice(0, 3).map((alert) => (
              <div
                key={`critical-${alert.vehicleId}`}
                className="bg-slate-900 p-3 rounded-lg border-l-4 border-red-500"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-red-400">Vehículo: {alert.vehicleId}</p>
                    <p className="text-sm text-red-300">{alert.message}</p>
                    <p className="text-[10px] text-red-500 mt-1">
                      {new Date(alert.timestamp).toLocaleTimeString('es-UY')}
                    </p>
                  </div>
                  <button
                    onClick={() => dismissAlert(alert.vehicleId)}
                    className="text-slate-500 hover:text-white text-lg ml-2"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="p-4 max-h-96 overflow-y-auto">
        {filteredAlerts.length > 0 ? (
          <div className="space-y-2">
            {filteredAlerts.map((alert, index) => (
              <div
                key={`${alert.vehicleId}-${index}`}
                className={`p-3 rounded-lg border-l-4 ${severityClass(alert.severity)}`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${severityBadge(alert.severity)}`}>
                        {severityLabel(alert.severity)}
                      </span>
                      <span className="text-sm font-bold text-white">{alert.vehicleId}</span>
                    </div>
                    <p className="text-sm text-slate-300">{alert.message}</p>
                    <p className="text-[10px] text-slate-500 mt-1">
                      {new Date(alert.timestamp).toLocaleTimeString('es-UY')}
                    </p>
                  </div>
                  <button
                    onClick={() => dismissAlert(alert.vehicleId)}
                    className="ml-2 text-slate-600 hover:text-white text-lg"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-slate-500">Sin alertas en este momento</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AlertPanel;
