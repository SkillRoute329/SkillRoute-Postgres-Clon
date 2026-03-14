import React, { useState } from 'react';
import { useDashboardData } from '../../hooks/useDashboardData';
import { AlertTriangle, TrendingUp, TrendingDown, Activity, BarChart3 } from 'lucide-react';
import { KPICard } from './KPICard';
import { SaludOperacionalCard } from './SaludOperacionalCard';
import { LineasStatusPanel } from './LineasStatusPanel';
import { AlertasPanel } from './AlertasPanel';
import { RecomendacionesPanel } from './RecomendacionesPanel';
import { ProyeccionesChart } from './ProyeccionesChart';

interface ExecutiveDashboardProps {
  operador: string;
}

export function ExecutiveDashboard({ operador }: ExecutiveDashboardProps) {
  const {
    dashboard,
    metricas,
    lineas,
    alertas,
    recomendaciones,
    salud,
    proyecciones,
    resumen_ejecutivo,
    loading,
    error,
    refetch
  } = useDashboardData({
    operador,
    autoRefresh: true,
    refreshInterval: 300000 // 5 minutos
  });

  const [selectedTab, setSelectedTab] = useState<'overview' | 'lines' | 'alerts' | 'recommendations'>('overview');

  if (loading && !dashboard) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600"></div>
          </div>
          <p className="mt-4 text-lg font-semibold text-gray-700">Cargando dashboard ejecutivo...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-md">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="w-6 h-6 text-red-600" />
            <h2 className="text-xl font-bold text-red-900">Error</h2>
          </div>
          <p className="text-red-800 mb-4">{error}</p>
          <button
            onClick={refetch}
            className="w-full bg-red-600 text-white py-2 px-4 rounded font-semibold hover:bg-red-700 transition"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Dashboard Ejecutivo</h1>
            <p className="text-gray-600 mt-2">Centro de Comando Unificado de Transporte</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm text-gray-500">Operador:</p>
              <p className="text-xl font-bold text-gray-900">{operador}</p>
            </div>
            <button
              onClick={refetch}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition font-semibold"
            >
              {loading ? 'Actualizando...' : 'Actualizar'}
            </button>
          </div>
        </div>
      </div>

      {/* Resumen Crítico */}
      {salud && (
        <div className="mb-8 grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3">
            <SaludOperacionalCard salud={salud} />
          </div>
          <div className="bg-white rounded-lg shadow-lg p-6 border-l-4 border-yellow-500">
            <p className="text-sm text-gray-600 mb-2">Período:</p>
            <p className="text-sm text-gray-900 font-mono">
              {dashboard?.fecha ? new Date(dashboard.fecha).toLocaleDateString('es-ES') : ''}
            </p>
          </div>
        </div>
      )}

      {/* Navegación por Tabs */}
      <div className="mb-6 bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setSelectedTab('overview')}
            className={`flex-1 py-4 px-6 font-semibold transition ${
              selectedTab === 'overview'
                ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Resumen General
            </div>
          </button>
          <button
            onClick={() => setSelectedTab('lines')}
            className={`flex-1 py-4 px-6 font-semibold transition ${
              selectedTab === 'lines'
                ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Activity className="w-5 h-5" />
              Líneas ({lineas.length})
            </div>
          </button>
          <button
            onClick={() => setSelectedTab('alerts')}
            className={`flex-1 py-4 px-6 font-semibold transition relative ${
              selectedTab === 'alerts'
                ? 'bg-red-50 text-red-700 border-b-2 border-red-600'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Alertas ({alertas.length})
            </div>
            {alertas.length > 0 && (
              <span className="absolute top-2 right-2 bg-red-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {alertas.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setSelectedTab('recommendations')}
            className={`flex-1 py-4 px-6 font-semibold transition ${
              selectedTab === 'recommendations'
                ? 'bg-green-50 text-green-700 border-b-2 border-green-600'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Recomendaciones ({recomendaciones.length})
            </div>
          </button>
        </div>
      </div>

      {/* Contenido por Tab */}
      {selectedTab === 'overview' && (
        <div className="space-y-6">
          {/* KPIs Principales */}
          {metricas && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <KPICard kpi={metricas.ingresosTotales} />
              <KPICard kpi={metricas.pasajerosTotales} />
              <KPICard kpi={metricas.lineasActivas} />
              <KPICard kpi={metricas.ocupacionPromedio} />
              <KPICard kpi={metricas.cumplimientoHorario} />
            </div>
          )}

          {/* Proyecciones */}
          {proyecciones.length > 0 && (
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Proyecciones de Ingresos</h3>
              <ProyeccionesChart proyecciones={proyecciones} />
            </div>
          )}

          {/* Resumen Ejecutivo */}
          {resumen_ejecutivo && (
            <div className="bg-white rounded-lg shadow-lg p-6 border-l-4 border-indigo-500">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Resumen Ejecutivo</h3>
              <div className="text-gray-700 whitespace-pre-wrap font-mono text-sm leading-relaxed">
                {resumen_ejecutivo}
              </div>
            </div>
          )}
        </div>
      )}

      {selectedTab === 'lines' && (
        <LineasStatusPanel lineas={lineas} />
      )}

      {selectedTab === 'alerts' && (
        <AlertasPanel alertas={alertas} lineas={lineas} />
      )}

      {selectedTab === 'recommendations' && (
        <RecomendacionesPanel recomendaciones={recomendaciones} />
      )}
    </div>
  );
}
