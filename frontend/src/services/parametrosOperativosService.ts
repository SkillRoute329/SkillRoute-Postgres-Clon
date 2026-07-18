/**
 * parametrosOperativosService.ts
 * ================================
 * Fuente de verdad para parámetros operativos editables por operador
 * (turnos personales, umbrales OTP, ventanas pico, etc.).
 *
 * Estructura Firestore:
 *   parametros_operativos/{agencyId}
 *     turnos: TurnoPersonal[]            // Editables desde Admin
 *     otpEarlyMin?: number               // Umbral anticipado (default 5)
 *     otpLateMin?: number                // Umbral demorado (default 5)
 *     ventanaPicoAM?: { ini: string; fin: string }
 *     ventanaPicoPM?: { ini: string; fin: string }
 *     actualizadoEn: Timestamp
 *     actualizadoPor: string             // uid
 *
 * Si el doc no existe, se devuelven los defaults de franjasHorarias.ts.
 *
 * Cache en memoria 5 min para evitar query en cada clasificación.
 */

import { apiClient } from '../clients/apiClient';
import type { TurnoPersonal } from '../utils/franjasHorarias';
import { TURNOS_DEFAULT_POR_OPERADOR } from '../utils/franjasHorarias';

export interface ParametrosOperativos {
  agencyId: string;
  turnos: TurnoPersonal[];
  otpEarlyMin: number;
  otpLateMin: number;
  ventanaPicoAM: { ini: string; fin: string };
  ventanaPicoPM: { ini: string; fin: string };
  actualizadoEn: Date | null;
  actualizadoPor: string | null;
  __default: boolean; // true si no hay doc en Firestore (vienen defaults)
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { ts: number; data: ParametrosOperativos }>();

const COLLECTION = 'parametros_operativos';

const DEFAULTS: Omit<ParametrosOperativos, 'agencyId' | 'turnos' | '__default'> = {
  otpEarlyMin: 5,
  otpLateMin: 5,
  ventanaPicoAM: { ini: '07:00', fin: '09:00' },
  ventanaPicoPM: { ini: '17:00', fin: '20:00' },
  actualizadoEn: null,
  actualizadoPor: null,
};

/** Lee parámetros operativos de un operador. Cache 5 min. */
export async function loadParametrosOperativos(
  agencyId: number | string,
): Promise<ParametrosOperativos> {
  const id = String(agencyId);
  const cached = cache.get(id);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  try {
    const d = await apiClient.get(`/api/db/${COLLECTION}/` + encodeURIComponent(id)) as any;
    let result: ParametrosOperativos;
    if (d) {
      result = {
        agencyId: id,
        turnos: Array.isArray(d.turnos) && d.turnos.length > 0
          ? (d.turnos as TurnoPersonal[])
          : (TURNOS_DEFAULT_POR_OPERADOR[Number(id)] ?? TURNOS_DEFAULT_POR_OPERADOR[70]!),
        otpEarlyMin: typeof d.otpEarlyMin === 'number' ? d.otpEarlyMin : DEFAULTS.otpEarlyMin,
        otpLateMin: typeof d.otpLateMin === 'number' ? d.otpLateMin : DEFAULTS.otpLateMin,
        ventanaPicoAM: d.ventanaPicoAM ?? DEFAULTS.ventanaPicoAM,
        ventanaPicoPM: d.ventanaPicoPM ?? DEFAULTS.ventanaPicoPM,
        actualizadoEn: d.actualizadoEn ? new Date(d.actualizadoEn) : null,
        actualizadoPor: d.actualizadoPor ?? null,
        __default: false,
      };
    } else {
      result = {
        agencyId: id,
        turnos: TURNOS_DEFAULT_POR_OPERADOR[Number(id)] ?? TURNOS_DEFAULT_POR_OPERADOR[70]!,
        ...DEFAULTS,
        __default: true,
      };
    }
    cache.set(id, { ts: Date.now(), data: result });
    return result;
  } catch (err) {
    console.warn(`[parametrosOperativos] No se pudo leer agencyId=${id}:`, err);
    return {
      agencyId: id,
      turnos: TURNOS_DEFAULT_POR_OPERADOR[Number(id)] ?? TURNOS_DEFAULT_POR_OPERADOR[70]!,
      ...DEFAULTS,
      __default: true,
    };
  }
}

/** Guarda los turnos editados desde Admin. Invalida cache. */
export async function saveTurnosOperador(
  agencyId: number | string,
  turnos: TurnoPersonal[],
  uid: string,
): Promise<void> {
  const id = String(agencyId);
  await apiClient.put(`/api/db/${COLLECTION}/` + encodeURIComponent(id), {
    agencyId: id,
    turnos,
    actualizadoEn: new Date().toISOString(),
    actualizadoPor: uid,
  });
  cache.delete(id);
}

/** Guarda umbrales OTP / ventanas pico. */
export async function saveUmbralesOperativos(
  agencyId: number | string,
  patch: Partial<{
    otpEarlyMin: number;
    otpLateMin: number;
    ventanaPicoAM: { ini: string; fin: string };
    ventanaPicoPM: { ini: string; fin: string };
  }>,
  uid: string,
): Promise<void> {
  const id = String(agencyId);
  await apiClient.put(`/api/db/${COLLECTION}/` + encodeURIComponent(id), {
    agencyId: id,
    ...patch,
    actualizadoEn: new Date().toISOString(),
    actualizadoPor: uid,
  });
  cache.delete(id);
}

/** Invalida cache para un operador (usar después de edits manuales). */
export function invalidateCache(agencyId: number | string): void {
  cache.delete(String(agencyId));
}
