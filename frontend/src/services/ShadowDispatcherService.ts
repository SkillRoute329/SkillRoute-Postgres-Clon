/**
 * ShadowDispatcherService.ts — Cliente Frontend del Shadow Dispatcher
 * ===================================================================
 * Suscribe al Navegador del chofer a las alertas de "Regulación de Marcha"
 * en tiempo real desde Firestore. Actualiza el estado React de forma reactiva.
 *
 * Uso: montar el listener al iniciar el turno y desmontarlo al finalizar.
 * Restricción: SOLO lee de `alertas_regulacion/{cocheId}` — nunca escribe directamente.
 */

import { db } from '../config/firebase';
import { doc, onSnapshot, updateDoc, serverTimestamp, collection, query, where, type Unsubscribe } from 'firebase/firestore';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type TipoAlertaRegulacion =
  | 'RIVAL_PISANDO_TURNO'
  | 'PELIGRO_BUNCHING'
  | 'HUECO_FRECUENCIA_RIVAL'
  | 'RETRASO_SERVICIO'
  | 'ADELANTO_SERVICIO';

export type InstruccionChofer = 'REGULACION_MARCHA' | 'ACELERAR_MODERADO' | 'MANTENER_VELOCIDAD';

export interface AlertaRegulacion {
  tipo: TipoAlertaRegulacion;
  rival_empresa?: string;
  rival_interno?: string;
  distancia_metros?: number;
  instruccion: InstruccionChofer;
  mensaje_chofer: string;
  linea_id: string;
  coche_id: string;
  leido: boolean;
  timestamp?: { seconds: number; nanoseconds: number } | null;
}

export type CallbackAlerta = (alerta: AlertaRegulacion | null) => void;

// ─── ShadowDispatcherService ──────────────────────────────────────────────────

export const ShadowDispatcherService = {
  /**
   * Subscribes to real-time regulation alerts for a specific vehicle.
   * Triggers `callback` with the alert data whenever it changes.
   * Returns an unsubscribe function to clean up the listener.
   *
   * Anti-loop: automatically marks the alert as `leido: true` after
   * delivering it to the callback, preventing repeated triggers.
   */
  subscribeAlertas(cocheId: string, callback: CallbackAlerta): Unsubscribe {
    if (!cocheId) {
      console.warn('[ShadowDispatcher] subscribeAlertas: cocheId requerido');
      return () => {};
    }

    const alertaRef = doc(db, 'alertas_regulacion', cocheId);
    let ultimoTimestamp: number | null = null;

    const unsubscribe = onSnapshot(
      alertaRef,
      (snap) => {
        if (!snap.exists()) {
          callback(null);
          return;
        }

        const data = snap.data() as AlertaRegulacion;

        // Filtrar alertas ya leídas
        if (data.leido) {
          callback(null);
          return;
        }

        // Anti-loop: solo entregar si el timestamp cambió
        const ts = data.timestamp?.seconds ?? 0;
        if (ts === ultimoTimestamp) return;
        ultimoTimestamp = ts;

        callback(data);

        // Marcar como leído de forma asíncrona para no bloquear el render
        updateDoc(alertaRef, {
          leido: true,
          leido_en: serverTimestamp(),
        }).catch((err) => {
          console.warn('[ShadowDispatcher] Error al marcar leído:', err);
        });
      },
      (err) => {
        console.error('[ShadowDispatcher] Error en listener:', err);
        callback(null);
      },
    );

    return unsubscribe;
  },

  /**
   * Suscribe a todas las alertas activas (recientes) de una línea específica.
   * Útil para el Dashboard del Inspector.
   */
  subscribeAlertasPorLinea(
    lineaId: string,
    callback: (alertas: AlertaRegulacion[]) => void,
  ): Unsubscribe {
    if (!lineaId) {
      callback([]);
      return () => {};
    }

    const q = query(
      collection(db, 'alertas_regulacion'),
      where('linea_id', '==', lineaId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const alertas = snap.docs.map((d) => d.data() as AlertaRegulacion);
        callback(alertas);
      },
      (err) => {
        console.error('[ShadowDispatcher] Error en listener por línea:', err);
        callback([]);
      }
    );

    return unsubscribe;
  },

  /**
   * Obtiene el icono y color según la instrucción del agente.
   * Útil para la UI del Navegador.
   */
  getInstruccionUI(instruccion: InstruccionChofer): {
    icono: string;
    bordeClase: string;
    textoClase: string;
    etiqueta: string;
  } {
    switch (instruccion) {
      case 'REGULACION_MARCHA':
        return { icono: '🐢', bordeClase: 'border-amber-500', textoClase: 'text-amber-500', etiqueta: 'Regule Marcha' };
      case 'ACELERAR_MODERADO':
        return { icono: '📈', bordeClase: 'border-emerald-500', textoClase: 'text-emerald-500', etiqueta: 'Capturar Pasajeros' };
      case 'MANTENER_VELOCIDAD':
      default:
        return { icono: '✅', bordeClase: 'border-indigo-500', textoClase: 'text-indigo-500', etiqueta: 'En Horario' };
    }
  },

  /**
   * Formatea la distancia al rival para mostrar en la UI.
   */
  formatDistancia(metros?: number): string {
    if (!metros) return '—';
    if (metros >= 1000) return `${(metros / 1000).toFixed(1)} km`;
    return `${metros} m`;
  },
};

export default ShadowDispatcherService;
