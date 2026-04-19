import React, { useState } from 'react';
import { AlertCircle, CheckCircle, Clock, TrendingUp } from 'lucide-react';

interface Decision {
  id: string;
  linea: number;
  titulo: string;
  descripcion: string;
  accion: string;
  estado: 'pendiente' | 'ejecutada' | 'fallida';
  ingresos?: string;
  tiempo?: string;
  icon: React.ReactNode;
}

export function CEOControlPanel() {
  const [decisions, setDecisions] = useState<Decision[]>([
    {
      id: '1',
      linea: 300,
      titulo: 'Línea 300 — Servicio Directo',
      descripcion: 'Crear ruta 300D con 4 buses en horas pico',
      accion: 'INYECTAR_DIRECTO_300',
      estado: 'pendiente',
      ingresos: '+$6,400/mes',
      tiempo: '15 min',
      icon: <TrendingUp className="w-5 h-5" />,
    },
    {
      id: '2',
      linea: 306,
      titulo: 'Línea 306 — Nocturno Expandido',
      descripcion: 'Extender servicios hasta 02:00 AM',
      accion: 'EXPANDIR_HORARIOS_306',
      estado: 'pendiente',
      ingresos: '+$12,000/mes',
      tiempo: '10 min',
      icon: <Clock className="w-5 h-5" />,
    },
    {
      id: '3',
      linea: 316,
      titulo: 'Línea 316 — Carril Preferencial',
      descripcion: 'Petición formal a Intendencia para Ruta 5',
      accion: 'PETICION_CARRIL_316',
      estado: 'pendiente',
      ingresos: '+$3,000/mes',
      tiempo: '1 semana',
      icon: <AlertCircle className="w-5 h-5" />,
    },
  ]);

  const handleExecute = async (decision: Decision) => {
    try {
      const response = await fetch(
        `/api/agents/line/${decision.linea}/alert`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tipo: 'ACCION_EJECUTIVA_CEO',
            accion: decision.accion,
            recorrido: decision.descripcion,
            sentido: 'ejecutiva',
            mensaje: decision.titulo,
            acciones: [decision.descripcion],
          }),
        }
      );

      if (response.ok) {
        setDecisions(
          decisions.map((d) =>
            d.id === decision.id ? { ...d, estado: 'ejecutada' } : d
          )
        );
      }
    } catch (error) {
      setDecisions(
        decisions.map((d) =>
          d.id === decision.id ? { ...d, estado: 'fallida' } : d
        )
      );
    }
  };

  const getStatusColor = (estado: string) => {
    switch (estado) {
      case 'ejecutada':
        return 'bg-green-50 border-green-200';
      case 'fallida':
        return 'bg-red-50 border-red-200';
      default:
        return 'bg-yellow-50 border-yellow-200';
    }
  };

  const getStatusIcon = (estado: string) => {
    switch (estado) {
      case 'ejecutada':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'fallida':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      default:
        return <Clock className="w-5 h-5 text-yellow-600" />;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          🎯 Panel de Control — CEO
        </h2>
        <p className="text-gray-600 mt-1">Decisiones ejecutivas automáticas</p>
      </div>

      <div className="space-y-4">
        {decisions.map((decision) => (
          <div
            key={decision.id}
            className={`border rounded-lg p-4 ${getStatusColor(decision.estado)}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  {decision.icon}
                  <h3 className="text-lg font-bold text-gray-900">
                    {decision.titulo}
                  </h3>
                  {getStatusIcon(decision.estado)}
                </div>
                <p className="text-gray-700 text-sm mb-3">
                  {decision.descripcion}
                </p>
                <div className="flex items-center gap-4 text-sm">
                  {decision.ingresos && (
                    <span className="text-green-700 font-semibold">
                      💰 {decision.ingresos}
                    </span>
                  )}
                  {decision.tiempo && (
                    <span className="text-gray-600">
                      ⏱ {decision.tiempo}
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => handleExecute(decision)}
                disabled={decision.estado !== 'pendiente'}
                className={`px-6 py-2 rounded font-semibold whitespace-nowrap ml-4 ${
                  decision.estado === 'pendiente'
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : decision.estado === 'ejecutada'
                    ? 'bg-green-200 text-green-800 cursor-default'
                    : 'bg-red-200 text-red-800 cursor-default'
                }`}
              >
                {decision.estado === 'pendiente' && 'EJECUTAR'}
                {decision.estado === 'ejecutada' && '✓ EJECUTADA'}
                {decision.estado === 'fallida' && '✗ FALLIDA'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-900">
          <strong>ℹ️ Información:</strong> Cada decisión ejecutada se registra
          automáticamente en el historial de alertas y se monitorea en tiempo
          real.
        </p>
      </div>
    </div>
  );
}
