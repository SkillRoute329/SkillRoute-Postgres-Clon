import React, { useState } from 'react';
import { useSTMLineas, useCambiosHorarios, useCalidadDatos } from '../../hooks/useSTMData';
import { LineaSTM, CambioHorarioDetectado } from '../../types/stm';
import { AlertTriangle, TrendingUp, TrendingDown, Zap, Server } from 'lucide-react';

/**
 * STM Monitor - Monitoreo de líneas públicas y cambios de horarios
 * Semana 10-11
 */

export function STMMonitor() {
  const { lineas, loading: lineasLoading, error: lineasError } = useSTMLineas();
  const { calidad, loading: calidadLoading } = useCalidadDatos();
  const [linea_seleccionada, setLineaSeleccionada] = useState<number | null>(null);

  if (lineasLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600 mx-auto mb-3"></div>
          <p className="text-gray-700">Cargando líneas STM...</p>
        </div>
      </div>
    );
  }

  if (lineasError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <p className="text-red-800">Error: {lineasError}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Calidad de Datos STM */}
      {calidad && (
        <div className="bg-white rounded-lg shadow-lg p-6 border-l-4 border-blue-500">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <Server className="w-6 h-6 text-blue-600" />
              <div>
                <h3 className="text-lg font-bold text-gray-900">Calidad de Datos STM</h3>
                <p className="text-sm text-gray-600">Sincronización en tiempo real</p>
              </div>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-sm font-bold ${
                calidad.calidad_general === 'excelente'
                  ? 'bg-green-100 text-green-800'
                  : calidad.calidad_general === 'buena'
                  ? 'bg-blue-100 text-blue-800'
                  : calidad.calidad_general === 'regular'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-red-100 text-red-800'
              }`}
            >
              {calidad.calidad_general.toUpperCase()}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded p-3 text-center">
              <p className="text-xs text-gray-600 font-semibold mb-1">Máquinas Activas</p>
              <p className="text-2xl font-bold text-gray-900">{calidad.maquinas_activas}</p>
              <p className="text-xs text-gray-500 mt-1">
                {calidad.maquinas_sincronizadas} sincronizadas
              </p>
            </div>
            <div className="bg-gray-50 rounded p-3 text-center">
              <p className="text-xs text-gray-600 font-semibold mb-1">Sincronización</p>
              <p className="text-2xl font-bold text-blue-600">
                {calidad.porcentaje_sincronizacion.toFixed(1)}%
              </p>
            </div>
            <div className="bg-gray-50 rounded p-3 text-center">
              <p className="text-xs text-gray-600 font-semibold mb-1">Transacciones</p>
              <p className="text-2xl font-bold text-gray-900">{calidad.transacciones_diarias}</p>
            </div>
            <div className="bg-gray-50 rounded p-3 text-center">
              <p className="text-xs text-gray-600 font-semibold mb-1">Latencia</p>
              <p className="text-2xl font-bold text-gray-900">{calidad.latencia_promedio_ms}ms</p>
            </div>
          </div>
        </div>
      )}

      {/* Lista de Líneas */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Líneas STM Monitoreadas</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {lineas.map(linea => (
            <LineaCard
              key={linea.id}
              linea={linea}
              isSelected={linea_seleccionada === linea.numero}
              onSelect={() => setLineaSeleccionada(linea.numero)}
            />
          ))}
        </div>
      </div>

      {/* Detalles de línea seleccionada */}
      {linea_seleccionada && (
        <LineaDetalles numeroLinea={linea_seleccionada} />
      )}
    </div>
  );
}

/**
 * Tarjeta de línea STM
 */
function LineaCard({
  linea,
  isSelected,
  onSelect
}: {
  linea: LineaSTM;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={`rounded-lg border-2 p-4 cursor-pointer transition ${
        isSelected
          ? 'bg-blue-50 border-blue-500 shadow-lg'
          : 'bg-white border-gray-200 hover:border-blue-300'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold"
            style={{ backgroundColor: linea.color || '#3b82f6' }}
          >
            {linea.numero}
          </div>
          <div>
            <p className="font-bold text-gray-900">{linea.nombre}</p>
            <p className="text-xs text-gray-600">{linea.operador}</p>
          </div>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <p className="text-gray-700">
          <span className="font-semibold">Ruta:</span> {linea.inicio.nombre} → {linea.fin.nombre}
        </p>
        <p className="text-gray-700">
          <span className="font-semibold">Distancia:</span> {linea.longitud_km} km (~{linea.duracion_promedio_minutos} min)
        </p>
        <p className="text-gray-700">
          <span className="font-semibold">Frecuencia:</span> Cada {linea.frecuencia_minutos} min
        </p>
        <p className="text-gray-700">
          <span className="font-semibold">Paradas:</span> {linea.paradas.length}
        </p>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        className={`w-full mt-4 py-2 rounded font-semibold transition ${
          isSelected
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
        }`}
      >
        {isSelected ? '▼ Seleccionada' : '▶ Seleccionar'}
      </button>
    </div>
  );
}

/**
 * Detalles de línea con cambios detectados
 */
function LineaDetalles({ numeroLinea }: { numeroLinea: number }) {
  const { cambios, cambios_detectados, requiere_accion, loading, error } =
    useCambiosHorarios(numeroLinea);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6 text-center">
        <p className="text-gray-700">Analizando cambios de horarios...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <p className="text-red-800">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-gray-900">Cambios Detectados - Línea {numeroLinea}</h3>
        {requiere_accion && (
          <div className="flex items-center gap-2 bg-red-100 border border-red-300 rounded-lg px-3 py-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <span className="text-sm font-bold text-red-800">⚠️ REQUIERE ACCIÓN</span>
          </div>
        )}
      </div>

      {cambios.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <p className="text-green-800 font-semibold">✓ No se detectaron cambios de horarios</p>
          <p className="text-green-700 text-sm mt-2">La línea mantiene su horario actual</p>
        </div>
      ) : (
        <div className="space-y-4">
          {cambios.map(cambio => (
            <CambioCard key={cambio.id} cambio={cambio} />
          ))}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
            <p className="text-sm text-blue-900 font-semibold mb-2">💡 Recomendación:</p>
            <p className="text-sm text-blue-800">
              {cambios.some(c => c.tipo_cambio === 'adelanto')
                ? 'Se detectó adelanto de competencia. Considera ejecutar el simulador de horarios para evaluar respuesta.'
                : 'Monitorea esta línea para posibles cambios futuros.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Tarjeta individual de cambio detectado
 */
function CambioCard({ cambio }: { cambio: CambioHorarioDetectado }) {
  const getSeveridadColor = (severidad: string) => {
    switch (severidad) {
      case 'alta':
        return 'bg-red-50 border-red-300';
      case 'media':
        return 'bg-yellow-50 border-yellow-300';
      default:
        return 'bg-blue-50 border-blue-300';
    }
  };

  const getTipoIcon = (tipo: string) => {
    if (tipo === 'adelanto') return <TrendingUp className="w-5 h-5 text-green-600" />;
    if (tipo === 'atraso') return <TrendingDown className="w-5 h-5 text-red-600" />;
    return <Zap className="w-5 h-5 text-yellow-600" />;
  };

  return (
    <div className={`border-2 rounded-lg p-4 ${getSeveridadColor(cambio.severidad)}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {getTipoIcon(cambio.tipo_cambio)}
          <div>
            <p className="font-bold text-gray-900">{cambio.tipo_cambio.toUpperCase()}</p>
            <p className="text-xs text-gray-600">
              {new Date(cambio.fecha_deteccion).toLocaleString('es-ES')}
            </p>
          </div>
        </div>
        <span
          className={`px-3 py-1 rounded text-xs font-bold ${
            cambio.severidad === 'alta'
              ? 'bg-red-200 text-red-800'
              : cambio.severidad === 'media'
              ? 'bg-yellow-200 text-yellow-800'
              : 'bg-blue-200 text-blue-800'
          }`}
        >
          {cambio.severidad.toUpperCase()}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-white bg-opacity-60 rounded p-3">
          <p className="text-xs text-gray-600 font-semibold">Hora Anterior</p>
          <p className="text-lg font-bold text-gray-900">{cambio.hora_anterior}</p>
        </div>
        <div className="bg-white bg-opacity-60 rounded p-3">
          <p className="text-xs text-gray-600 font-semibold">Hora Nueva</p>
          <p className="text-lg font-bold text-gray-900">{cambio.hora_nueva}</p>
        </div>
      </div>

      <div className="bg-white bg-opacity-60 rounded p-3 mb-4">
        <p className="text-sm text-gray-900">
          <span className="font-bold">
            {cambio.tipo_cambio === 'adelanto' ? '+' : ''}{cambio.minutos_diferencia} minutos
          </span>
          {' - '}
          <span className="text-gray-700">
            Ventaja adquirida: {cambio.impacto_estimado.minutos_ventaja_adquirida} min
          </span>
        </p>
        <p className="text-sm text-red-700 mt-2 font-semibold">
          ⚠️ Pasajeros en riesgo: {cambio.impacto_estimado.pasajeros_en_riesgo_estimado}
        </p>
      </div>

      <p className="text-xs text-gray-700">
        <span className="font-semibold">Efectiva desde:</span>{' '}
        {new Date(cambio.fecha_efectiva).toLocaleDateString('es-ES')}
      </p>
    </div>
  );
}
