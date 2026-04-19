import React, { useState } from 'react';
import type { EstadoLinea } from '../../types/dashboard';
import { AlertTriangle, CheckCircle, AlertCircle, Zap } from 'lucide-react';

interface LineasStatusPanelProps {
  lineas: EstadoLinea[];
}

export function LineasStatusPanel({ lineas }: LineasStatusPanelProps) {
  const [filtro, setFiltro] = useState<'todas' | 'operativa' | 'riesgo' | 'marginal' | 'critica'>(
    'todas',
  );

  const lineasFiltradas = filtro === 'todas' ? lineas : lineas.filter((l) => l.estado === filtro);

  const getEstadoIcon = (estado: string) => {
    switch (estado) {
      case 'operativa':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'marginal':
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      case 'riesgo':
        return <AlertTriangle className="w-5 h-5 text-orange-600" />;
      case 'critica':
        return <AlertTriangle className="w-5 h-5 text-red-600" />;
    }
  };

  const getEstadoBgColor = (estado: string) => {
    switch (estado) {
      case 'operativa':
        return 'bg-green-50 border-green-200';
      case 'marginal':
        return 'bg-yellow-50 border-yellow-200';
      case 'riesgo':
        return 'bg-orange-50 border-orange-200';
      case 'critica':
        return 'bg-red-50 border-red-200';
    }
  };

  const getEstadoTextColor = (estado: string) => {
    switch (estado) {
      case 'operativa':
        return 'text-green-900';
      case 'marginal':
        return 'text-yellow-900';
      case 'riesgo':
        return 'text-orange-900';
      case 'critica':
        return 'text-red-900';
    }
  };

  const estadoLabel = (estado: string) => {
    return estado.charAt(0).toUpperCase() + estado.slice(1).toUpperCase();
  };

  const resumen = {
    total: lineas.length,
    operativas: lineas.filter((l) => l.estado === 'operativa').length,
    riesgo: lineas.filter((l) => l.estado === 'riesgo').length,
    marginales: lineas.filter((l) => l.estado === 'marginal').length,
    criticas: lineas.filter((l) => l.estado === 'critica').length,
  };

  return (
    <div className="space-y-6">
      {/* Resumen de estado */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-gray-400">
          <p className="text-xs text-gray-600 font-semibold">TOTAL</p>
          <p className="text-3xl font-bold text-gray-900">{resumen.total}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
          <p className="text-xs text-gray-600 font-semibold">OPERATIVAS</p>
          <p className="text-3xl font-bold text-green-600">{resumen.operativas}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-yellow-500">
          <p className="text-xs text-gray-600 font-semibold">MARGINALES</p>
          <p className="text-3xl font-bold text-yellow-600">{resumen.marginales}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-orange-500">
          <p className="text-xs text-gray-600 font-semibold">RIESGO</p>
          <p className="text-3xl font-bold text-orange-600">{resumen.riesgo}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-red-500">
          <p className="text-xs text-gray-600 font-semibold">CRÍTICAS</p>
          <p className="text-3xl font-bold text-red-600">{resumen.criticas}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-4">
        <p className="text-sm font-semibold text-gray-700 mb-3">Filtrar por estado:</p>
        <div className="flex gap-2 flex-wrap">
          {(['todas', 'operativa', 'marginal', 'riesgo', 'critica'] as const).map((estado) => (
            <button
              key={estado}
              onClick={() => setFiltro(estado)}
              className={`px-4 py-2 rounded-lg font-semibold transition ${
                filtro === estado
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {estado.charAt(0).toUpperCase() + estado.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de líneas */}
      <div className="space-y-3">
        {lineasFiltradas.map((linea) => (
          <div
            key={linea.lineaId}
            className={`rounded-lg shadow-lg p-6 border-l-4 ${getEstadoBgColor(linea.estado)} hover:shadow-xl transition`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-4">
                {getEstadoIcon(linea.estado)}
                <div>
                  <p className="text-sm font-semibold text-gray-600">LÍNEA</p>
                  <p className={`text-3xl font-bold ${getEstadoTextColor(linea.estado)}`}>
                    {linea.numeroLinea}
                  </p>
                </div>
              </div>
              <div className="bg-white bg-opacity-60 rounded-lg px-4 py-2">
                <p className={`text-sm font-bold ${getEstadoTextColor(linea.estado)}`}>
                  {estadoLabel(linea.estado)}
                </p>
              </div>
            </div>

            {/* KPIs de línea */}
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className="bg-white bg-opacity-60 rounded p-3">
                <p className="text-xs text-gray-600 font-semibold">Ingresos/día</p>
                <p className="text-lg font-bold text-gray-900">
                  ${(linea.ingresos / 1000).toFixed(0)}K
                </p>
              </div>
              <div className="bg-white bg-opacity-60 rounded p-3">
                <p className="text-xs text-gray-600 font-semibold">Pasajeros/día</p>
                <p className="text-lg font-bold text-gray-900">{linea.pasajeros}</p>
              </div>
              <div className="bg-white bg-opacity-60 rounded p-3">
                <p className="text-xs text-gray-600 font-semibold">Cumplimiento</p>
                <p className="text-lg font-bold text-gray-900">{linea.cumplimiento}%</p>
              </div>
              <div className="bg-white bg-opacity-60 rounded p-3">
                <p className="text-xs text-gray-600 font-semibold">Ocupación</p>
                <p className="text-lg font-bold text-gray-900">{linea.ocupacion}%</p>
              </div>
            </div>

            {/* Competencia */}
            {linea.competencia && linea.competencia.length > 0 && (
              <div className="mb-4 bg-white bg-opacity-60 rounded p-3">
                <p className="text-xs text-gray-600 font-semibold mb-2">Competencia directa:</p>
                <div className="flex gap-2 flex-wrap">
                  {linea.competencia.map((comp, idx) => (
                    <span
                      key={idx}
                      className="inline-block bg-red-100 text-red-800 text-xs font-bold px-2.5 py-1 rounded"
                    >
                      {comp}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Alertas */}
            {linea.alertas && linea.alertas.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-gray-600 font-semibold mb-2">Alertas:</p>
                <div className="space-y-2">
                  {linea.alertas.map((alerta, idx) => (
                    <div
                      key={idx}
                      className={`rounded p-2 text-sm ${
                        alerta.severidad === 'critica'
                          ? 'bg-red-100 text-red-800 border border-red-300'
                          : alerta.severidad === 'alta'
                            ? 'bg-orange-100 text-orange-800 border border-orange-300'
                            : 'bg-yellow-100 text-yellow-800 border border-yellow-300'
                      }`}
                    >
                      <p className="font-semibold">{alerta.tipo.toUpperCase()}</p>
                      <p>{alerta.mensaje}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recomendación */}
            <div className="bg-white bg-opacity-60 rounded p-3 flex gap-3">
              <Zap className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-gray-900">{linea.recomendacion}</p>
            </div>
          </div>
        ))}
      </div>

      {lineasFiltradas.length === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 text-center">
          <p className="text-blue-800 font-semibold">No hay líneas con el estado seleccionado</p>
        </div>
      )}
    </div>
  );
}
