import React, { useState } from 'react';
import type { AlertaLinea, EstadoLinea } from '../../types/dashboard';
import { AlertTriangle, AlertCircle, Zap, X } from 'lucide-react';

interface AlertasPanelProps {
  alertas: AlertaLinea[];
  lineas: EstadoLinea[];
}

export function AlertasPanel({ alertas, lineas }: AlertasPanelProps) {
  const [filtroSeveridad, setFiltroSeveridad] = useState<
    'todas' | 'critica' | 'alta' | 'media' | 'baja'
  >('todas');
  const [filtroTipo, setFiltroTipo] = useState<'todas' | string>('todas');
  const [expandedAlerts, setExpandedAlerts] = useState<Set<number>>(new Set());

  // Obtener todas las alertas de todas las líneas
  const todasLasAlertas = lineas
    .flatMap((linea) =>
      (linea.alertas || []).map((alerta, idx) => ({
        ...alerta,
        lineaId: linea.lineaId,
        numeroLinea: linea.numeroLinea,
        key: `${linea.lineaId}-${idx}`,
      })),
    )
    .concat(
      alertas.map((alerta, idx) => ({
        ...alerta,
        lineaId: '',
        numeroLinea: 0,
        key: `critica-${idx}`,
      })),
    );

  // Filtrar
  let alertasFiltradas = todasLasAlertas;
  if (filtroSeveridad !== 'todas') {
    alertasFiltradas = alertasFiltradas.filter((a) => a.severidad === filtroSeveridad);
  }
  if (filtroTipo !== 'todas') {
    alertasFiltradas = alertasFiltradas.filter((a) => a.tipo === filtroTipo);
  }

  // Ordenar por severidad
  const severidadScore = { critica: 4, alta: 3, media: 2, baja: 1 };
  alertasFiltradas.sort(
    (a, b) =>
      severidadScore[b.severidad as keyof typeof severidadScore] -
      severidadScore[a.severidad as keyof typeof severidadScore],
  );

  const getSeveridadIcon = (severidad: string) => {
    switch (severidad) {
      case 'critica':
        return <AlertTriangle className="w-5 h-5" />;
      case 'alta':
        return <AlertTriangle className="w-5 h-5" />;
      case 'media':
        return <AlertCircle className="w-5 h-5" />;
      default:
        return <Zap className="w-5 h-5" />;
    }
  };

  const getSeveridadColor = (severidad: string) => {
    switch (severidad) {
      case 'critica':
        return 'bg-red-100 border-red-300 text-red-900';
      case 'alta':
        return 'bg-orange-100 border-orange-300 text-orange-900';
      case 'media':
        return 'bg-yellow-100 border-yellow-300 text-yellow-900';
      default:
        return 'bg-blue-100 border-blue-300 text-blue-900';
    }
  };

  const getTipos = Array.from(new Set(todasLasAlertas.map((a) => a.tipo))).sort();

  const resumen = {
    total: todasLasAlertas.length,
    criticas: todasLasAlertas.filter((a) => a.severidad === 'critica').length,
    altas: todasLasAlertas.filter((a) => a.severidad === 'alta').length,
    medias: todasLasAlertas.filter((a) => a.severidad === 'media').length,
  };

  const toggleExpanded = (idx: number) => {
    const newSet = new Set(expandedAlerts);
    if (newSet.has(idx)) {
      newSet.delete(idx);
    } else {
      newSet.add(idx);
    }
    setExpandedAlerts(newSet);
  };

  return (
    <div className="space-y-6">
      {/* Resumen de alertas */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-gray-400">
          <p className="text-xs text-gray-600 font-semibold">TOTAL</p>
          <p className="text-3xl font-bold text-gray-900">{resumen.total}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-red-500">
          <p className="text-xs text-gray-600 font-semibold">CRÍTICAS</p>
          <p className="text-3xl font-bold text-red-600">{resumen.criticas}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-orange-500">
          <p className="text-xs text-gray-600 font-semibold">ALTAS</p>
          <p className="text-3xl font-bold text-orange-600">{resumen.altas}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-yellow-500">
          <p className="text-xs text-gray-600 font-semibold">MEDIAS</p>
          <p className="text-3xl font-bold text-yellow-600">{resumen.medias}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">Filtrar por severidad:</p>
          <div className="flex gap-2 flex-wrap">
            {(['todas', 'critica', 'alta', 'media', 'baja'] as const).map((sev) => (
              <button
                key={sev}
                onClick={() => setFiltroSeveridad(sev)}
                className={`px-4 py-2 rounded-lg font-semibold transition ${
                  filtroSeveridad === sev
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {sev.charAt(0).toUpperCase() + sev.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">Filtrar por tipo:</p>
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            aria-label="Filtrar alertas por tipo"
            title="Filtrar alertas por tipo"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="todas">Todos los tipos</option>
            {getTipos.map((tipo) => (
              <option key={tipo} value={tipo}>
                {tipo.charAt(0).toUpperCase() + tipo.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Lista de alertas */}
      <div className="space-y-3">
        {alertasFiltradas.map((alerta, idx) => (
          <div
            key={alerta.key}
            className={`rounded-lg border-l-4 shadow-lg overflow-hidden ${getSeveridadColor(alerta.severidad)}`}
          >
            <div
              className="p-4 cursor-pointer hover:bg-opacity-70 transition flex items-start justify-between"
              onClick={() => toggleExpanded(idx)}
            >
              <div className="flex items-start gap-4">
                <div className="mt-1">{getSeveridadIcon(alerta.severidad)}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-bold text-sm">{alerta.tipo.toUpperCase()}</p>
                    <span className="text-xs font-bold px-2 py-1 bg-white bg-opacity-40 rounded">
                      {alerta.severidad.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm">{alerta.mensaje}</p>

                  {/* Info de línea si existe */}
                  {'numeroLinea' in alerta && (
                    <p className="text-xs mt-2 opacity-75">Línea: {alerta.numeroLinea}</p>
                  )}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpanded(idx);
                }}
                aria-label="Cerrar detalle de alerta"
                title="Cerrar detalle"
                className="p-1 hover:bg-white hover:bg-opacity-20 rounded transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Detalles expandidos */}
            {expandedAlerts.has(idx) && (
              <div className="px-4 py-3 bg-white bg-opacity-40 border-t border-current border-opacity-30">
                <p className="text-sm font-semibold mb-2">Acción recomendada:</p>
                <p className="text-sm mb-3">{alerta.accion_recomendada}</p>

                {'numeroLinea' in alerta && (
                  <div className="bg-white bg-opacity-60 rounded p-2">
                    <p className="text-xs font-semibold text-gray-700">
                      Línea: {alerta.numeroLinea}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {alertasFiltradas.length === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
          <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-3" />
          <p className="text-green-800 font-semibold">
            ✓ No hay alertas con los filtros seleccionados
          </p>
          <p className="text-green-700 text-sm mt-1">Operación normal de todas las líneas</p>
        </div>
      )}
    </div>
  );
}

function CheckCircle(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}
