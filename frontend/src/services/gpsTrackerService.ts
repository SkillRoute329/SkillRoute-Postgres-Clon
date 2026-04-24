/**
 * GPS Tracker Service — SkillRoute UCOT
 * ============================================
 * Alimenta la colección `viajes_activos` en Firestore en tiempo real.
 * Funciona desde la app del conductor (web PWA o Android/Capacitor).
 * Compatible con la red 5G/4G de Antel (reemplaza la red 2G caída).
 *
 * INSTALACIÓN:
 * No requiere dependencias extra — usa las ya instaladas:
 * - @capacitor/network (ya en package.json)
 * - firebase/firestore (ya configurado)
 *
 * USO:
 *   import { gpsTracker } from '../services/gpsTrackerService';
 *   gpsTracker.iniciar({ cocheId: '115', linea: '300', conductorId: 'user123' });
 *   gpsTracker.detener();
 */

import { doc, setDoc, serverTimestamp, GeoPoint, deleteDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ConfigTrackerParams {
  cocheId: string; // Ej: "115", "203"
  linea: string; // Ej: "300a", "306b"
  conductorId: string; // UID de Firebase Auth
  conductorNombre?: string;
  empresa?: string; // "UCOT" por defecto
  intervaloMs?: number; // Intervalo GPS en ms (por defecto 15000 = 15s)
}

export interface EstadoTracker {
  activo: boolean;
  cocheId: string | null;
  linea: string | null;
  ultimaPosicion: { lat: number; lng: number } | null;
  ultimaActualizacion: Date | null;
  error: string | null;
  totalActualizaciones: number;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const COL_VIAJES = 'viajes_activos';
const INTERVALO_DEFAULT_MS = 15_000; // 15 segundos
const TIMEOUT_GPS_MS = 10_000; // 10s máximo para obtener posición
const PRECISION_MIN_METROS = 100; // Descartar posiciones muy imprecisas

// ─── Clase GPS Tracker ────────────────────────────────────────────────────────

class GpsTrackerService {
  private watchId: number | null = null;
  private intervaloId: ReturnType<typeof setInterval> | null = null;
  private config: ConfigTrackerParams | null = null;
  private estado: EstadoTracker = {
    activo: false,
    cocheId: null,
    linea: null,
    ultimaPosicion: null,
    ultimaActualizacion: null,
    error: null,
    totalActualizaciones: 0,
  };
  private listeners: Array<(estado: EstadoTracker) => void> = [];
  private ultimaPosicionBuffer: { lat: number; lng: number } | null = null;

  // ── Suscripción de estado para la UI ────────────────────────────────────────

  onEstadoCambia(callback: (estado: EstadoTracker) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  private emitirEstado() {
    const snap = { ...this.estado };
    this.listeners.forEach((l) => l(snap));
  }

  getEstado(): EstadoTracker {
    return { ...this.estado };
  }

  // ── Iniciar tracking ─────────────────────────────────────────────────────────

  async iniciar(params: ConfigTrackerParams): Promise<void> {
    if (this.estado.activo) {
      console.warn('[GPS] Ya hay un tracking activo. Deteniendo el anterior...');
      await this.detener();
    }

    if (!navigator.geolocation) {
      const msg = 'Geolocalización no disponible en este dispositivo';
      this.estado.error = msg;
      this.emitirEstado();
      throw new Error(msg);
    }

    // Solicitar permiso explícito
    try {
      const permiso = await navigator.permissions.query({ name: 'geolocation' });
      if (permiso.state === 'denied') {
        throw new Error('Permiso de GPS denegado. Habilitá la ubicación en configuración.');
      }
    } catch {
      // Algunos browsers no soportan permissions API, continuar igual
    }

    this.config = {
      empresa: 'UCOT',
      intervaloMs: INTERVALO_DEFAULT_MS,
      ...params,
    };

    this.estado = {
      activo: true,
      cocheId: params.cocheId,
      linea: params.linea,
      ultimaPosicion: null,
      ultimaActualizacion: null,
      error: null,
      totalActualizaciones: 0,
    };

    console.log(`[GPS] Iniciando tracking — Coche ${params.cocheId}, Línea ${params.linea}`);

    // Obtener posición inicial inmediata
    await this.obtenerYPublicar();

    // Watch continuo con watchPosition (más eficiente que polling en móvil)
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.ultimaPosicionBuffer = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
      },
      (err) => {
        console.warn('[GPS] Error watchPosition:', err.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5_000,
        timeout: TIMEOUT_GPS_MS,
      },
    );

    // Publicar en Firestore cada intervalo
    const intervalo = this.config.intervaloMs ?? INTERVALO_DEFAULT_MS;
    this.intervaloId = setInterval(() => {
      void this.obtenerYPublicar();
    }, intervalo);

    this.emitirEstado();
  }

  // ── Obtener posición y publicar en Firestore ──────────────────────────────────

  private async obtenerYPublicar(): Promise<void> {
    if (!this.config) return;

    let lat: number;
    let lng: number;
    let precision: number;

    // Usar buffer de watchPosition si está disponible (más rápido)
    if (this.ultimaPosicionBuffer) {
      lat = this.ultimaPosicionBuffer.lat;
      lng = this.ultimaPosicionBuffer.lng;
      precision = 0;
    } else {
      // Fallback: getCurrentPosition
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            maximumAge: 10_000,
            timeout: TIMEOUT_GPS_MS,
          });
        });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
        precision = pos.coords.accuracy;
      } catch (err) {
        const msg =
          err instanceof GeolocationPositionError
            ? this.mensajeErrorGps(err.code)
            : 'Error desconocido de GPS';
        this.estado.error = msg;
        console.error('[GPS] Error obteniendo posición:', msg);
        this.emitirEstado();
        return;
      }
    }

    // Descartar posiciones muy imprecisas
    if (precision > PRECISION_MIN_METROS && precision !== 0) {
      console.warn(`[GPS] Posición descartada por baja precisión: ${precision}m`);
      return;
    }

    // Publicar en Firestore
    try {
      const docId = this.config.cocheId;
      const ref = doc(db, COL_VIAJES, docId);

      await setDoc(
        ref,
        {
          cocheId: this.config.cocheId,
          codigoLinea: this.config.linea,
          conductorId: this.config.conductorId,
          conductorNombre: this.config.conductorNombre ?? 'Conductor',
          empresa: this.config.empresa ?? 'UCOT',
          posicion: new GeoPoint(lat, lng),
          updatedAt: serverTimestamp(),
          estado: 'en_servicio',
          // Datos extra útiles para el dashboard
          velocidad: null,
          rumbo: null,
          pasajeros: null,
        },
        { merge: true },
      );

      this.estado.ultimaPosicion = { lat, lng };
      this.estado.ultimaActualizacion = new Date();
      this.estado.totalActualizaciones++;
      this.estado.error = null;

      console.log(`[GPS] ✓ Publicado — Coche ${docId} @ [${lat.toFixed(5)}, ${lng.toFixed(5)}]`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error Firestore';
      this.estado.error = `Error al publicar: ${msg}`;
      console.error('[GPS] Error Firestore:', msg);
    }

    this.emitirEstado();
  }

  // ── Detener tracking ──────────────────────────────────────────────────────────

  async detener(): Promise<void> {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    if (this.intervaloId !== null) {
      clearInterval(this.intervaloId);
      this.intervaloId = null;
    }

    // Marcar vehículo como inactivo en Firestore
    if (this.config?.cocheId) {
      try {
        const ref = doc(db, COL_VIAJES, this.config.cocheId);
        await setDoc(
          ref,
          {
            estado: 'fuera_de_servicio',
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
        console.log(`[GPS] Vehículo ${this.config.cocheId} marcado como fuera de servicio`);
      } catch (err) {
        console.warn('[GPS] No se pudo actualizar estado en Firestore:', err);
      }
    }

    this.estado = {
      activo: false,
      cocheId: null,
      linea: null,
      ultimaPosicion: null,
      ultimaActualizacion: null,
      error: null,
      totalActualizaciones: 0,
    };
    this.config = null;
    this.ultimaPosicionBuffer = null;

    console.log('[GPS] Tracking detenido');
    this.emitirEstado();
  }

  // ── Eliminar vehículo de viajes_activos (fin de turno) ────────────────────────

  async finalizarServicio(cocheId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, COL_VIAJES, cocheId));
      console.log(`[GPS] Vehículo ${cocheId} eliminado de viajes_activos`);
    } catch (err) {
      console.error('[GPS] Error al finalizar servicio:', err);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private mensajeErrorGps(code: number): string {
    switch (code) {
      case GeolocationPositionError.PERMISSION_DENIED:
        return 'Permiso de ubicación denegado. Habilitá el GPS en configuración.';
      case GeolocationPositionError.POSITION_UNAVAILABLE:
        return 'Señal GPS no disponible. Verificá que el GPS esté activo.';
      case GeolocationPositionError.TIMEOUT:
        return 'Tiempo de espera GPS agotado. Reintentando...';
      default:
        return 'Error desconocido de GPS';
    }
  }
}

// ─── Singleton exportado ───────────────────────────────────────────────────────

export const gpsTracker = new GpsTrackerService();
