import React, { useState } from 'react';
import type { RecomendacionEjecutiva } from '../../types/dashboard';
import { TrendingUp, Clock, Target, AlertTriangle, Zap } from 'lucide-react';

interface RecomendacionesPanelProps {
  recomendaciones: RecomendacionEjecutiva[];
}

const widthMap: Record<number, string> = {
  0: 'w-0',
  5: 'w-[5%]',
  10: 'w-[10%]',
  15: 'w-[15%]',
  20: 'w-[20%]',
  25: 'w-[25%]',
  30: 'w-[30%]',
  35: 'w-[35%]',
  40: 'w-[40%]',
  45: 'w-[45%]',
  50: 'w-[50%]',
  55: 'w-[55%]',
  60: 'w-[60%]',
  65: 'w-[65%]',
  70: 'w-[70%]',
  75: 'w-[75%]',
  80: 'w-[80%]',
  85: 'w-[85%]',
  90: 'w-[90%]',
  95: 'w-[95%]',
  100: 'w-full',
};

export function RecomendacionesPanel({ recomendaciones }: RecomendacionesPanelProps) {
  const [filtroUrgencia, setFiltroUrgencia] = useState<'todas' | 'alta' | 'media' | 'baja'>(
    'todas',
  );
  const [expandedRec, setExpandedRec] = useState<Set<string>>(new Set());

  const recomendacionesFiltradas =
    filtroUrgencia === 'todas'
      ? recomendaciones
      : recomendaciones.filter((r) => r.urgencia === filtroUrgencia);

  // Ordenar por impacto (descendente)
  const recomendacionesOrdenadas = [...recomendacionesFiltradas].sort(
    (a, b) => b.impacto - a.impacto,
  );

  const getUrgenciaIcon = (urgencia: string) => {
    switch (urgencia) {
      case 'alta':
        return <AlertTriangle className="w-5 h-5 text-red-600" />;
      case 'media':
        return <Clock className="w-5 h-5 text-yellow-600" />;
      default:
        return <Zap className="w-5 h-5 text-blue-600" />;
    }
  };

  const getUrgenciaColor = (urgencia: string) => {
    switch (urgencia) {
      case 'alta':
        return 'from-red-50 to-orange-50 border-red-300';
      case 'media':
        return 'from-yellow-50 to-orange-50 border-yellow-300';
      default:
        return 'from-blue-50 to-cyan-50 border-blue-300';
    }
  };

  const getUrgenciaTextColor = (urgencia: string) => {
    switch (urgencia) {
      case 'alta':
        return 'text-red-900';
      case 'media':
        return 'text-yellow-900';
      default:
        return 'text-blue-900';
    }
  };

  const toggleExpanded = (id: string) => {
    const newSet = new Set(expandedRec);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedRec(newSet);
  };

  const resumen = {
    total: recomendaciones.length,
    altas: recomendaciones.filter((r) => r.urgencia === 'alta').length,
    medias: recomendaciones.filter((r) => r.urgencia === 'media').length,
    impactoTotal: recomendaciones.reduce((sum, r) => sum + r.impacto, 0),
  };

  return (
    <div className="space-y-6">
      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-gray-400">
          <p className="text-xs text-gray-600 font-semibold">TOTAL</p>
          <p className="text-3xl font-bold text-gray-900">{resumen.total}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-red-500">
          <p className="text-xs text-gray-600 font-semibold">URGENCIA ALTA</p>
          <p className="text-3xl font-bold text-red-600">{resumen.altas}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-yellow-500">
          <p className="text-xs text-gray-600 font-semibold">URGENCIA MEDIA</p>
          <p className="text-3xl font-bold text-yellow-600">{resumen.medias}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
          <p className="text-xs text-gray-600 font-semibold">IMPACTO TOTAL</p>
          <p className="text-3xl font-bold text-green-600">
            ${(resumen.impactoTotal / 1000).toFixed(0)}K
          </p>
        </div>
      </div>

      {/* Filtro */}
      <div className="bg-white rounded-lg shadow p-4">
        <p className="text-sm font-semibold text-gray-700 mb-3">Filtrar por urgencia:</p>
        <div className="flex gap-2 flex-wrap">
          {(['todas', 'alta', 'media', 'baja'] as const).map((urg) => (
            <button
              key={urg}
              onClick={() => setFiltroUrgencia(urg)}
              className={`px-4 py-2 rounded-lg font-semibold transition ${
                filtroUrgencia === urg
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {urg.charAt(0).toUpperCase() + urg.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de recomendaciones */}
      <div className="space-y-4">
        {recomendacionesOrdenadas.map((rec) => {
          const roiPercentage =
            resumen.impactoTotal > 0
              ? ((rec.probabilidadExito * rec.impacto) / (resumen.impactoTotal * 100)) * 100
              : 0;
          const bgMappedWidth = Math.min(100, Math.round(roiPercentage / 5) * 5);

          return (
            <div
              key={rec.id}
              className={`bg-gradient-to-r ${getUrgenciaColor(rec.urgencia)} rounded-lg shadow-lg border-2 overflow-hidden`}
            >
              <div
                className="p-6 cursor-pointer hover:bg-black hover:bg-opacity-5 transition"
                onClick={() => toggleExpanded(rec.id)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-4">
                    {getUrgenciaIcon(rec.urgencia)}
                    <div className="flex-1">
                      <h3
                        className={`text-lg font-bold mb-2 ${getUrgenciaTextColor(rec.urgencia)}`}
                      >
                        {rec.titulo}
                      </h3>
                      <p className="text-sm text-gray-700 mb-3">{rec.descripcion}</p>

                      {/* Badges de info */}
                      <div className="flex gap-3 flex-wrap">
                        <div className="inline-flex items-center gap-1 bg-white bg-opacity-60 rounded px-3 py-1 text-sm font-semibold">
                          <TrendingUp className="w-4 h-4" />
                          Impacto: ${(rec.impacto / 1000).toFixed(0)}K/mes
                        </div>
                        <div className="inline-flex items-center gap-1 bg-white bg-opacity-60 rounded px-3 py-1 text-sm font-semibold">
                          <Target className="w-4 h-4" />
                          Éxito: {rec.probabilidadExito}%
                        </div>
                        <div className="inline-flex items-center gap-1 bg-white bg-opacity-60 rounded px-3 py-1 text-sm font-semibold">
                          <Clock className="w-4 h-4" />
                          {rec.tiempoImplementacion}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Estado expandido - resumen rápido */}
                {!expandedRec.has(rec.id) && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-current border-opacity-20">
                    <p className="text-xs font-semibold opacity-70">Click para ver detalles</p>
                    <div className="text-lg">▼</div>
                  </div>
                )}
              </div>

              {/* Detalles expandidos */}
              {expandedRec.has(rec.id) && (
                <div className="px-6 py-4 bg-white bg-opacity-40 border-t border-current border-opacity-30 space-y-4">
                  <div className="bg-white bg-opacity-60 rounded p-4">
                    <p className="text-sm font-bold text-gray-900 mb-2">Acción Sugerida:</p>
                    <p className="text-sm text-gray-800">{rec.accion_sugerida}</p>
                  </div>

                  {rec.lineasAfectadas && rec.lineasAfectadas.length > 0 && (
                    <div className="bg-white bg-opacity-60 rounded p-4">
                      <p className="text-sm font-bold text-gray-900 mb-2">Líneas Afectadas:</p>
                      <div className="flex gap-2 flex-wrap">
                        {rec.lineasAfectadas.map((linea, idx) => (
                          <span
                            key={idx}
                            className="inline-block bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded"
                          >
                            Línea {linea}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Métricas detalladas */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white bg-opacity-60 rounded p-3 text-center">
                      <p className="text-xs text-gray-600 font-semibold mb-1">Impacto Mensual</p>
                      <p className="text-2xl font-bold text-green-600">
                        ${(rec.impacto / 1000).toFixed(0)}K
                      </p>
                    </div>
                    <div className="bg-white bg-opacity-60 rounded p-3 text-center">
                      <p className="text-xs text-gray-600 font-semibold mb-1">Probabilidad Éxito</p>
                      <p className="text-2xl font-bold text-blue-600">{rec.probabilidadExito}%</p>
                    </div>
                    <div className="bg-white bg-opacity-60 rounded p-3 text-center">
                      <p className="text-xs text-gray-600 font-semibold mb-1">Tiempo</p>
                      <p className="text-sm font-bold text-gray-900">{rec.tiempoImplementacion}</p>
                    </div>
                  </div>

                  {/* Indicador de ROI */}
                  <div className="bg-white bg-opacity-60 rounded p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-bold text-gray-900">
                        ROI Estimado (Éxito × Impacto):
                      </p>
                      <p className="text-lg font-bold text-green-600">
                        ${((rec.impacto * rec.probabilidadExito) / 100 / 1000).toFixed(0)}K/mes
                      </p>
                    </div>
                    <div className="w-full bg-gray-300 rounded-full h-2">
                      <div
                        className={`bg-gradient-to-r from-green-400 to-green-600 h-full rounded-full ${widthMap[bgMappedWidth] || 'w-0'}`}
                      ></div>
                    </div>
                  </div>

                  <button
                    onClick={() => toggleExpanded(rec.id)}
                    className="w-full py-2 px-4 bg-white bg-opacity-60 hover:bg-opacity-80 transition rounded font-semibold text-gray-900"
                  >
                    Contraer detalles
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {recomendacionesOrdenadas.length === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
          <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-3" />
          <p className="text-green-800 font-semibold">
            ✓ No hay recomendaciones con los filtros seleccionados
          </p>
        </div>
      )}
    </div>
  );
}

function CheckCircle(props: React.SVGProps<SVGSVGElement>) {
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
