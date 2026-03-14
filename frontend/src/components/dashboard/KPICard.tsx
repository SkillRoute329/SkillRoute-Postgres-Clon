import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { KPIPrincipal } from '../../types/dashboard';

interface KPICardProps {
  kpi: KPIPrincipal;
}

export function KPICard({ kpi }: KPICardProps) {
  const getTrendIcon = () => {
    if (kpi.tendencia === 'creciente') {
      return <TrendingUp className="w-5 h-5 text-green-600" />;
    } else if (kpi.tendencia === 'decreciente') {
      return <TrendingDown className="w-5 h-5 text-red-600" />;
    } else {
      return <Minus className="w-5 h-5 text-blue-600" />;
    }
  };

  const getTrendColor = () => {
    if (kpi.tendencia === 'creciente') return 'text-green-600';
    if (kpi.tendencia === 'decreciente') return 'text-red-600';
    return 'text-blue-600';
  };

  const getBackgroundColor = () => {
    switch (kpi.color) {
      case 'green':
        return 'bg-green-50 border-green-200';
      case 'red':
        return 'bg-red-50 border-red-200';
      case 'yellow':
        return 'bg-yellow-50 border-yellow-200';
      default:
        return 'bg-blue-50 border-blue-200';
    }
  };

  const formatValue = (value: number): string => {
    if (kpi.unidad === 'pesos') {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    if (kpi.unidad === 'pasajeros' || kpi.unidad === 'líneas') {
      return value.toLocaleString('es-ES');
    }
    return `${value}${kpi.unidad === '%' ? '%' : ''}`;
  };

  const porcentajeAlcanzado = Math.min(100, kpi.porcentajeAlcanzado);

  return (
    <div className={`rounded-lg border shadow-lg p-4 ${getBackgroundColor()} hover:shadow-xl transition`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <p className="text-xs text-gray-600 font-semibold uppercase mb-1">{kpi.nombre}</p>
          <p className="text-2xl font-bold text-gray-900">{formatValue(kpi.valor)}</p>
        </div>
        {getTrendIcon()}
      </div>

      {/* Cambio vs anterior */}
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-sm font-semibold ${getTrendColor()}`}>
          {kpi.cambioVsAnterior > 0 ? '+' : ''}{kpi.cambioVsAnterior}%
        </span>
        <span className="text-xs text-gray-600">vs mes anterior</span>
      </div>

      {/* Barra de progreso hacia objetivo */}
      {kpi.objetivo && (
        <div>
          <div className="w-full bg-gray-300 rounded-full h-2 mb-2 overflow-hidden">
            <div
              className={`h-full transition-all ${
                porcentajeAlcanzado >= 100
                  ? 'bg-green-500'
                  : porcentajeAlcanzado >= 80
                  ? 'bg-blue-500'
                  : 'bg-yellow-500'
              }`}
              style={{ width: `${porcentajeAlcanzado}%` }}
            ></div>
          </div>
          <div className="flex justify-between items-center">
            <p className="text-xs text-gray-600">Objetivo: ${(kpi.objetivo / 1000000).toFixed(1)}M</p>
            <p className="text-xs font-semibold text-gray-900">{Math.round(porcentajeAlcanzado)}%</p>
          </div>
        </div>
      )}

      {/* Alerta */}
      {kpi.alerta && (
        <div className="mt-3 bg-red-100 border border-red-300 rounded px-2 py-1">
          <p className="text-xs text-red-700 font-semibold">⚠️ Requiere atención</p>
        </div>
      )}
    </div>
  );
}
