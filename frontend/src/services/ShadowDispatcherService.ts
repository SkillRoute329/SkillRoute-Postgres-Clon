/**
 * ShadowDispatcherService.ts — Cliente Frontend del Shadow Dispatcher
 * ===================================================================
 * Suscribe al Navegador del chofer a las alertas de "Regulación de Marcha"
 * en tiempo real via polling. Actualiza el estado React de forma reactiva.
 *
 * Uso: montar el listener al iniciar el turno y desmontarlo al finalizar.
 * Restricción: SOLO lee de `alertas_regulacion/{cocheId}` — nunca escribe directamente.
 */

import { apiClient } from '../clients/apiClient';

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
  timestamp?: { seconds: number; nanoseconds: number } | string | null;
}

export type CallbackAlerta = (alerta: AlertaRegulacion | null) => void;
export type Unsubscribe = () => void;

// ─── ShadowDispatcherService ──────────────────────────────────────────────────

export const ShadowDispatcherService = {
  /**
   * Suscribe con polling a alertas de regulación para un vehículo.
   * Marca como leída cada alerta entregada para evitar repeticiones.
   * TODO FASE 4.5: Socket.io firestore:alertas_regulacion
   */
  subscribeAlertas(cocheId: string, callback: CallbackAlerta): Unsubscribe {
    if (!cocheId) {
      console.warn('[ShadowDispatcher] subscribeAlertas: cocheId requerido');
      return () => {};
    }

    let active = true;
    let ultimoTimestamp: number | null = null;

    const fetch = async () => {
      try {
        const data = await apiClient.get('/api/db/alertas_regulacion/' + encodeURIComponent(cocheId)) as AlertaRegulacion | null;

        if (!active) return;

        if (!data) {
          callback(null);
          return;
        }

        if (data.leido) {
          callback(null);
          return;
        }

        // Anti-loop: solo entregar si el timestamp cambió
        const ts = typeof data.timestamp === 'object' && data.timestamp !== null
          ? (data.timestamp as { seconds: number }).seconds ?? 0
          : 0;
        if (ts === ultimoTimestamp) return;
        ultimoTimestamp = ts;

        callback(data);

        // Marcar como leído
        apiClient.put('/api/db/alertas_regulacion/' + encodeURIComponent(cocheId), {
          leido: true,
          leido_en: new Date().toISOString(),
        }).catch((err) => {
          console.warn('[ShadowDispatcher] Error al marcar leído:', err);
        });
      } catch {
        // ignore
      }
    };

    fetch();
    const interval = setInterval(fetch, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  },

  /**
   * Suscribe a todas las alertas activas de una línea específica.
   * TODO FASE 4.5: Socket.io firestore:alertas_regulacion
   */
  subscribeAlertasPorLinea(
    lineaId: string,
    callback: (alertas: AlertaRegulacion[]) => void,
  ): Unsubscribe {
    if (!lineaId) {
      callback([]);
      return () => {};
    }

    let active = true;

    const fetch = async () => {
      try {
        const raw = await apiClient.get('/api/db/alertas_regulacion', {
          query: { where: `linea_id:${lineaId}`, limit: 500 },
        }) as AlertaRegulacion[];
        if (active) callback(Array.isArray(raw) ? raw : []);
      } catch (err) {
        console.error('[ShadowDispatcher] Error en listener por línea:', err);
        if (active) callback([]);
      }
    };

    fetch();
    const interval = setInterval(fetch, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
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
