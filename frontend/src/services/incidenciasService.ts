import {
  collection,
  addDoc,
  doc,
  updateDoc,
  getDocs,
  query,
  orderBy,
  limit as limitDocs,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db } from '../config/firebase';

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

// ── CRUD (Firestore) ────────────────────────────────────────────────────────

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
  const payload = {
    type: tipo,
    status: 'ABIERTO',
    priority: tipo === 'accidente' ? 'ALTA' : 'MEDIA',
    description: extras?.descripcion ?? INCIDENCIA_META[tipo]?.label,
    reportedBy: extras?.conductorUid
      ? { uid: extras.conductorUid, name: extras.conductorUid }
      : { uid: 'DRIVER', name: 'Conductor' },
    source: 'DRIVER_APP',
    lat: extras?.lat,
    lng: extras?.lng,
    lineaCodigo: extras?.lineaCodigo,
    lineaNombre: extras?.lineaNombre,
    createdAt: serverTimestamp(),
  };

  const ref = await addDoc(collection(db, COL), payload);

  return {
    id: ref.id,
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

export async function getIncidencias(filtros?: {
  lineaCodigo?: string;
  soloAbiertas?: boolean;
  limite?: number;
}): Promise<IncidenciaReportada[]> {
  const qArgs: any[] = [orderBy('createdAt', 'desc')];

  if (filtros?.soloAbiertas) {
    qArgs.push(where('status', 'in', ['ABIERTO', 'EN_PROCESO']));
  }

  if (filtros?.limite) {
    qArgs.push(limitDocs(filtros.limite));
  }

  const q = query(collection(db, COL), ...qArgs);
  const snap = await getDocs(q);

  let result = snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      tipo: data.type as TipoIncidencia,
      descripcion: data.description,
      lat: data.lat,
      lng: data.lng,
      lineaCodigo: data.lineaCodigo,
      lineaNombre: data.lineaNombre,
      conductorUid: data.reportedBy?.uid,
      timestamp: data.createdAt?.toDate
        ? data.createdAt.toDate().toISOString()
        : new Date().toISOString(),
      resuelta: data.status === 'CERRADO',
    };
  });

  if (filtros?.lineaCodigo) {
    result = result.filter((r) => r.lineaCodigo === filtros.lineaCodigo);
  }

  return result;
}

export async function marcarResuelta(id: string): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    status: 'CERRADO',
    closedAt: serverTimestamp(),
  });
}

export async function eliminarIncidencia(id: string): Promise<void> {
  // En producción, es preferible no borrar duro (Hard Delete), sino cambiar estado.
  // Pero si se necesita: await deleteDoc(doc(db, COL, id));
  await updateDoc(doc(db, COL, id), {
    status: 'CERRADO',
    // deleted: true
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
