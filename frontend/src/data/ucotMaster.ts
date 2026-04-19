/**
 * Fuente de Verdad: UCOT Master Intelligence 2026.
 * Prohibido simular: si un campo no estÃ¡ en el JSON, se expone como "PENDIENTE" o undefined.
 */

export interface MasterLinea {
  id: string;
  nombre: string;
  activa?: boolean;
}

export interface MasterPuntoControl {
  id: string;
  nombre: string;
  alias?: string[];
}

export interface MasterServicio {
  servicioId: string;
  lineaId: string;
  linea: string;
  serviceNumber: string;
  nombreCorto?: string;
  puntosControl: string[];
  horarios?: Array<{ filas: string[] }>;
  horaInicioReferencia?: string;
}

export interface UcotMasterIntelligence {
  version?: string;
  source?: string;
  lineas: MasterLinea[];
  puntosControl: MasterPuntoControl[];
  servicios: MasterServicio[];
}

import masterData from './ucot_master_intelligence_2026.json';

const master = masterData as unknown as UcotMasterIntelligence;

export function getMaster(): UcotMasterIntelligence {
  return master;
}

export function getMasterLineas(): MasterLinea[] {
  return master?.lineas ?? [];
}

export function getMasterServicios(lineaId?: string): MasterServicio[] {
  const list = master?.servicios ?? [];
  if (lineaId) return list.filter((s) => s.lineaId === lineaId || s.linea === lineaId);
  return list;
}

export function getMasterServicioById(servicioId: string): MasterServicio | undefined {
  return (master?.servicios ?? []).find(
    (s) => s.servicioId === servicioId || s.serviceNumber === servicioId,
  );
}

export function getMasterPuntosControl(): MasterPuntoControl[] {
  return master?.puntosControl ?? [];
}

/** Busca servicios que pasen por un punto de control (nombre o alias). */
export function getServiciosByPuntoControl(nombrePunto: string): MasterServicio[] {
  const normal = nombrePunto.trim().toLowerCase();
  return (master?.servicios ?? []).filter((s) =>
    (s.puntosControl ?? []).some(
      (p) =>
        p.trim().toLowerCase() === normal ||
        (master?.puntosControl ?? []).some(
          (pc) =>
            pc.nombre.toLowerCase() === normal ||
            (pc.alias ?? []).some((a: string) => a.toLowerCase().includes(normal)),
        ),
    ),
  );
}
