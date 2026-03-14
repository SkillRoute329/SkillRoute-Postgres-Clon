import React from 'react';
import { Activity, AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react';
import { SaludOperacional } from '../../types/dashboard';

interface SaludOperacionalCardProps {
  salud: SaludOperacional;
}

export function SaludOperacionalCard({ salud }: SaludOperacionalCardProps) {
  const getStatusIcon = () => {
    switch (salud.estado) {
      case 'excelente':
        return <CheckCircle className="w-8 h-8 text-green-600" />;
      case 'bueno':
        return <Activity className="w-8 h-8 text-blue-600" />;
      case 'regular':
        return <AlertCircle className="w-8 h-8 text-yellow-600" />;
      case 'critico':
        return <AlertTriangle className="w-8 h-8 text-red-600" />;
    }
  };

  const getStatusColor = () => {
    switch (salud.estado) {
      case 'excelente':
        return 'from-green-50 to-emerald-50 border-green-300';
      case 'bueno':
        return 'from-blue-50 to-cyan-50 border-blue-300';
      case 'regular':
        return 'from-yellow-50 to-orange-50 border-yellow-300';
      case 'critico':
        return 'from-red-50 to-pink-50 border-red-300';
    }
  };

  const getStatusTextColor = () => {
    switch (salud.estado) {
      case 'excelente':
        return 'text-green-900';
      case 'bueno':
        return 'text-blue-900';
      case 'regular':
        return 'text-yellow-900';
      case 'critico':
        return 'text-red-900';
    }
  };

  const getScoreColor = () => {
    if (salud.indiceGeneral >= 80) return 'text-green-600';
    if (salud.indiceGeneral >= 60) return 'text-blue-600';
    if (salud.indiceGeneral >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className={`bg-gradient-to-r ${getStatusColor()} rounded-lg shadow-lg p-6 border-2`}>
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          {getStatusIcon()}
          <div>
            <p className="text-sm text-gray-600 font-semibold">ESTADO OPERACIONAL</p>
            <p className={`text-3xl font-bold ${getStatusTextColor()}`}>
              {salud.estado.toUpperCase()}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-600 font-semibold">SCORE GENERAL</p>
          <p className={`text-4xl font-bold ${getScoreColor()}`}>{salud.indiceGeneral}/100</p>
        </div>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white bg-opacity-60 rounded-lg p-4 border border-gray-200">
          <p className="text-xs text-gray-600 font-semibold mb-2">Líneas Operativas</p>
          <div className="flex items-end justify-between">
            <p className="text-2xl font-bold text-green-600">{salud.porcentajeLineasOperativas}%</p>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white bg-opacity-60 rounded-lg p-4 border border-gray-200">
          <p className="text-xs text-gray-600 font-semibold mb-2">Líneas en Riesgo</p>
          <div className="flex items-end justify-between">
            <p className="text-2xl font-bold text-yellow-600">{salud.porcentajeLineasEnRiesgo}%</p>
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
        </div>

        <div className="bg-white bg-opacity-60 rounded-lg p-4 border border-gray-200">
          <p className="text-xs text-gray-600 font-semibold mb-2">Cartones No Viables</p>
          <div className="flex items-end justify-between">
            <p className="text-2xl font-bold text-red-600">{salud.porcentajeCartonesNoViables}%</p>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Alerta Urgente */}
      {salud.recomendacion_urgente && (
        <div className="bg-red-100 border-l-4 border-red-600 rounded p-4 flex gap-3">
          <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-red-900">⚠️ CRÍTICO</p>
            <p className="text-red-800 text-sm mt-1">{salud.recomendacion_urgente}</p>
          </div>
        </div>
      )}
    </div>
  );
}
