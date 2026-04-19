/**
 * DriverGpsPanel — Panel GPS del Conductor
 * =========================================
 * Componente que el conductor usa para iniciar/detener su transmisión GPS.
 * Se integra en la vista del conductor (DriverServiceView o DriverNavigation).
 *
 * DÓNDE AGREGARLO:
 *   En frontend/src/pages/driver/DriverServiceView.tsx o DriverNavigation.tsx
 *   Importar y poner como componente dentro del layout del conductor.
 *
 * USO:
 *   import DriverGpsPanel from '../components/DriverGpsPanel';
 *   <DriverGpsPanel cocheId="115" linea="300a" conductorId={user.uid} conductorNombre={user.displayName} />
 */

import { useState, useEffect, useCallback } from 'react';
import { gpsTracker, type EstadoTracker } from '../services/gpsTrackerService';
import { MapPin, Wifi, WifiOff, Radio, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

// ─── Props ────────────────────────────────────────────────────────────────────

interface DriverGpsPanelProps {
  cocheId: string;
  linea: string;
  conductorId: string;
  conductorNombre?: string;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function DriverGpsPanel({
  cocheId,
  linea,
  conductorId,
  conductorNombre,
}: DriverGpsPanelProps) {
  const [estado, setEstado] = useState<EstadoTracker>(gpsTracker.getEstado());
  const [cargando, setCargando] = useState(false);

  // Suscribirse a cambios del tracker
  useEffect(() => {
    const unsubscribe = gpsTracker.onEstadoCambia(setEstado);
    return unsubscribe;
  }, []);

  // Iniciar GPS
  const handleIniciar = useCallback(async () => {
    setCargando(true);
    try {
      await gpsTracker.iniciar({
        cocheId,
        linea,
        conductorId,
        conductorNombre,
        empresa: 'UCOT',
        intervaloMs: 15_000,
      });
    } catch (err) {
      console.error('[DriverGpsPanel] Error al iniciar:', err);
    } finally {
      setCargando(false);
    }
  }, [cocheId, linea, conductorId, conductorNombre]);

  // Detener GPS
  const handleDetener = useCallback(async () => {
    setCargando(true);
    try {
      await gpsTracker.detener();
    } catch (err) {
      console.error('[DriverGpsPanel] Error al detener:', err);
    } finally {
      setCargando(false);
    }
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────

  const tiempoDesdeActualizacion = estado.ultimaActualizacion
    ? Math.floor((Date.now() - estado.ultimaActualizacion.getTime()) / 1000)
    : null;

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div
        className={`flex items-center gap-3 px-4 py-3 ${
          estado.activo ? 'bg-green-600' : 'bg-slate-700'
        }`}
      >
        <Radio className={`w-5 h-5 text-white ${estado.activo ? 'animate-pulse' : ''}`} />
        <div className="flex-1">
          <p className="text-white font-semibold text-sm">
            {estado.activo ? 'GPS Activo — Transmitiendo' : 'GPS Inactivo'}
          </p>
          <p className="text-white/70 text-xs">
            Coche {cocheId} · Línea {linea}
          </p>
        </div>
        {estado.activo ? (
          <Wifi className="w-5 h-5 text-white" />
        ) : (
          <WifiOff className="w-5 h-5 text-white/50" />
        )}
      </div>

      {/* Contenido */}
      <div className="px-4 py-3 space-y-3">
        {/* Error */}
        {estado.error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-red-700 text-xs">{estado.error}</p>
          </div>
        )}

        {/* Posición actual */}
        {estado.ultimaPosicion && (
          <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
            <MapPin className="w-4 h-4 text-slate-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-slate-700 text-xs font-mono truncate">
                {estado.ultimaPosicion.lat.toFixed(5)}, {estado.ultimaPosicion.lng.toFixed(5)}
              </p>
              {tiempoDesdeActualizacion !== null && (
                <p className="text-slate-400 text-xs">
                  Actualizado hace {tiempoDesdeActualizacion}s
                </p>
              )}
            </div>
            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
          </div>
        )}

        {/* Estadísticas */}
        {estado.activo && (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-blue-50 rounded-lg px-3 py-2 text-center">
              <p className="text-blue-700 font-bold text-lg leading-none">
                {estado.totalActualizaciones}
              </p>
              <p className="text-blue-500 text-xs mt-0.5">Actualizaciones</p>
            </div>
            <div className="bg-green-50 rounded-lg px-3 py-2 text-center">
              <p className="text-green-700 font-bold text-lg leading-none">15s</p>
              <p className="text-green-500 text-xs mt-0.5">Intervalo</p>
            </div>
          </div>
        )}

        {/* Botones de acción */}
        <div className="flex gap-2">
          {!estado.activo ? (
            <button
              onClick={handleIniciar}
              disabled={cargando}
              className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-semibold text-sm py-2.5 rounded-lg transition-colors"
            >
              {cargando ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Radio className="w-4 h-4" />
              )}
              {cargando ? 'Iniciando...' : 'Iniciar GPS'}
            </button>
          ) : (
            <button
              onClick={handleDetener}
              disabled={cargando}
              className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white font-semibold text-sm py-2.5 rounded-lg transition-colors"
            >
              {cargando ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <WifiOff className="w-4 h-4" />
              )}
              {cargando ? 'Deteniendo...' : 'Fin de Servicio'}
            </button>
          )}
        </div>

        {/* Nota informativa */}
        <p className="text-slate-400 text-xs text-center">
          {estado.activo
            ? '🔴 Tu posición es visible en el Centro de Control'
            : 'Iniciá el GPS al comenzar tu servicio'}
        </p>
      </div>
    </div>
  );
}
