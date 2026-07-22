import { apiClient } from '../clients/apiClient';
import { getToken } from '../utils/tokenStore';

export type TipoIncidencia =
  | 'corte_calle'
  | 'accidente'
  | 'semaforo_roto'
  | 'parada_bloqueada'
  | 'congestion'
  | 'obra_vial'
  | 'objeto_via'
  | 'otro';

export interface IncidenciaReportada {
  id: string;
  tipo: TipoIncidencia;
  descripcion?: string;
  lat?: number;
  lng?: number;
  lineaCodigo?: string;
  lineaNombre?: string;
  conductorUid?: string;
  timestamp: string;
  resuelta: boolean;
}

// ── Etiquetas y metadatos visuales ──────────────────────────────────────────

export const INCIDENCIA_META: Record<
  TipoIncidencia | string,
  { label: string; emoji: string; color: string }
> = {
  corte_calle: { label: 'Corte de calle', emoji: '🚧', color: '#f97316' },
  accidente: { label: 'Accidente', emoji: '🚗', color: '#ef4444' },
  semaforo_roto: { label: 'Semáforo roto', emoji: '🚦', color: '#eab308' },
  parada_bloqueada: { label: 'Parada bloqueada', emoji: '🛑', color: '#dc2626' },
  congestion: { label: 'Congestión', emoji: '🚕', color: '#f59e0b' },
  obra_vial: { label: 'Obra vial', emoji: '🏗️', color: '#8b5cf6' },
  objeto_via: { label: 'Objeto en vía', emoji: '⚠️', color: '#f97316' },
  otro: { label: 'Otro', emoji: '📋', color: '#64748b' },
  // Map old dispatch panel ones just in case:
  MECANICA: { label: 'Mecánica', emoji: '🔧', color: 'text-orange-400 bg-orange-500/10' },
  ACCIDENTE: { label: 'Accidente', emoji: '🚗', color: 'text-red-400 bg-red-500/10' },
  EVASION: { label: 'Evasión', emoji: '🎫', color: 'text-yellow-400 bg-yellow-500/10' },
  DEMORA: { label: 'Demora', emoji: '⏱️', color: 'text-blue-400 bg-blue-500/10' },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Obtiene el uid del usuario actual desde el JWT almacenado en localStorage. */
function getCurrentUid(): string {
  try {
    const token = getToken() ?? '';
    const payload = token.split('.')[1];
    if (!payload) return 'anonymous';
    const decoded = JSON.parse(atob(payload));
    return decoded.uid ?? decoded.sub ?? 'anonymous';
  } catch {
    return 'anonymous';
  }
}

// ── CRUD ────────────────────────────────────────────────────────────────────

const COL = 'incidencias';

export async function reportarIncidencia(
  tipo: TipoIncidencia,
  extras?: {
    descripcion?: string;
    lat?: number;
    lng?: number;
    lineaCodigo?: string;
    lineaNombre?: string;
    conductorUid?: string;
  },
): Promise<IncidenciaReportada> {
  const reporterUid = extras?.conductorUid ?? getCurrentUid();
  const payload: Record<string, unknown> = {
    type: tipo,
    status: 'ABIERTO',
    priority: tipo === 'accidente' ? 'ALTA' : 'MEDIA',
    description: extras?.descripcion ?? INCIDENCIA_META[tipo]?.label,
    reportedBy: { uid: reporterUid, name: reporterUid },
    source: 'DRIVER_APP',
    createdAt: new Date().toISOString(),
  };
  if (extras?.lat !== undefined) payload.lat = extras.lat;
  if (extras?.lng !== undefined) payload.lng = extras.lng;
  if (extras?.lineaCodigo) payload.lineaCodigo = extras.lineaCodigo;
  if (extras?.lineaNombre) payload.lineaNombre = extras.lineaNombre;

  const result = await apiClient.post(`/api/db/${COL}`, payload) as { id: string };

  return {
    id: result.id,
    tipo,
    descripcion: extras?.descripcion,
    lat: extras?.lat,
    lng: extras?.lng,
    lineaCodigo: extras?.lineaCodigo,
    lineaNombre: extras?.lineaNombre,
    conductorUid: extras?.conductorUid,
    timestamp: new Date().toISOString(),
    resuelta: false,
  };
}

export async function crearIncidenciaManual(
  tipo: TipoIncidencia,
  descripcion: string,
  prioridad: string,
  vehicleId?: string
): Promise<string> {
  const reporterUid = getCurrentUid();
  const payload: Record<string, unknown> = {
    type: tipo,
    status: 'ABIERTO',
    priority: prioridad,
    description: descripcion,
    reportedBy: { uid: reporterUid, name: 'Operador de Despacho' },
    source: 'DESPACHO',
    createdAt: new Date().toISOString(),
  };
  if (vehicleId) payload.vehicleId = vehicleId;

  const result = await apiClient.post(`/api/db/${COL}`, payload) as { id: string };
  return result.id;
}

export async function actualizarIncidencia(
  id: string,
  data: {
    type?: TipoIncidencia;
    description?: string;
    priority?: string;
    vehicleId?: string;
  }
): Promise<void> {
  await apiClient.put(`/api/db/${COL}/` + encodeURIComponent(id), data);
}

export async function getIncidencias(filtros?: {
  lineaCodigo?: string;
  soloAbiertas?: boolean;
  limite?: number;
}): Promise<IncidenciaReportada[]> {
  const queryParams: Record<string, any> = {
    orderBy: 'createdAt:desc',
    limit: filtros?.limite ?? 500,
  };

  const raw = await apiClient.get(`/api/db/${COL}`, { query: queryParams }) as any[];
  let arr = Array.isArray(raw) ? raw : [];

  if (filtros?.soloAbiertas) {
    arr = arr.filter((d: any) => d.status === 'ABIERTO' || d.status === 'EN_PROCESO');
  }

  let result: IncidenciaReportada[] = arr.map((data: any) => ({
    id: data.id,
    tipo: data.type as TipoIncidencia,
    descripcion: data.description,
    lat: data.lat,
    lng: data.lng,
    lineaCodigo: data.lineaCodigo,
    lineaNombre: data.lineaNombre,
    conductorUid: data.reportedBy?.uid,
    timestamp: data.createdAt ?? new Date().toISOString(),
    resuelta: data.status === 'CERRADO',
  }));

  if (filtros?.lineaCodigo) {
    result = result.filter((r) => r.lineaCodigo === filtros.lineaCodigo);
  }

  return result;
}

export async function marcarResuelta(id: string): Promise<void> {
  await apiClient.put(`/api/db/${COL}/` + encodeURIComponent(id), {
    status: 'CERRADO',
    closedAt: new Date().toISOString(),
  });
}

export async function eliminarIncidencia(id: string): Promise<void> {
  // Soft Delete: mantenemos el registro para auditoría
  await apiClient.put(`/api/db/${COL}/` + encodeURIComponent(id), {
    status: 'ANULADO',
    closedAt: new Date().toISOString(),
  });
}

export async function contarIncidenciasAbiertas(lineaCodigo?: string): Promise<number> {
  const incs = await getIncidencias({ lineaCodigo, soloAbiertas: true });
  return incs.length;
}

export function tiempoRelativo(timestamp: string): string {
  if (!timestamp) return '';
  const diff = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  if (diff < 60) return 'Hace un momento';
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`;
  return `Hace ${Math.floor(diff / 86400)} días`;
}

// ── Geo helpers ─────────────────────────────────────────────────────────────

/**
 * ¿El punto está dentro de `toleranciaMetros` del recorrido?
 * Útil para decidir si auto-asociar la incidencia con la línea o reportarla
 * como incidencia geográfica independiente.
 */
export function puntoSobreRecorrido(
  punto: { lat: number; lng: number } | null | undefined,
  recorrido: Array<{ lat: number; lng: number }> | undefined,
  toleranciaMetros = 60,
): boolean {
  if (!punto || !recorrido || recorrido.length < 2) return false;
  for (let i = 1; i < recorrido.length; i++) {
    if (distPointSegmentMetros(punto, recorrido[i - 1], recorrido[i]) <= toleranciaMetros) {
      return true;
    }
  }
  return false;
}

/** Distancia en metros desde un punto a un segmento (proyección plana local). */
function distPointSegmentMetros(
  p: { lat: number; lng: number },
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const cos = Math.cos((p.lat * Math.PI) / 180);
  const M = 111320;
  const ax = a.lng * cos * M, ay = a.lat * M;
  const bx = b.lng * cos * M, by = b.lat * M;
  const px = p.lng * cos * M, py = p.lat * M;
  const dx = bx - ax, dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
