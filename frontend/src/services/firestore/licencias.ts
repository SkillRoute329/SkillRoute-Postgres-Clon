/**
 * licencias.ts — Colección `licencias_personal` en Firestore
 * Gestión completa de ausencias, licencias y días compensatorios del personal.
 */
import {
  collection, doc, setDoc, updateDoc, getDoc,
  getDocs, query, where, orderBy, onSnapshot, Timestamp,
} from 'firebase/firestore';
import { db } from '../../config/firebase';

const COL = 'licencias_personal';
const COL_COMP = 'compensatorios_personal';

// ─── TIPOS ────────────────────────────────────────────────────────────────────

export type TipoLicencia =
  | 'medica'           // Licencia médica (BPS / mutualista)
  | 'administrativa'   // Licencia administrativa (trámites, etc.)
  | 'sindical'         // Actividad sindical (ATM, UNOTT, etc.)
  | 'estudio'          // Licencia por estudio
  | 'maternidad'       // Licencia por maternidad/paternidad
  | 'falta_injustificada' // Falta sin aviso
  | 'compensatorio'    // Uso de día compensatorio acumulado
  | 'cambio_libre'     // Cambio de día libre (movimiento de descanso)
  | 'franco_adicional' // Franco adicional (horas extra, festivo trabajado)
  | 'otro';

export type EstadoLicencia = 'pendiente' | 'aprobada' | 'rechazada' | 'completada';

export interface LicenciaPersonal {
  id: string;
  driverId: string;
  internalNumber: string;
  tipo: TipoLicencia;
  estado: EstadoLicencia;
  fechaDesde: string;        // YYYY-MM-DD
  fechaHasta: string;        // YYYY-MM-DD (igual que desde si es 1 día)
  diasHabiles: number;       // días hábiles afectados
  motivo?: string;
  documentoUrl?: string;     // URL del certificado médico, etc.
  aprobadoPor?: string;      // userId del supervisor
  rechazadoPor?: string;
  motivoRechazo?: string;
  creadoEn: string;
  actualizadoEn: string;
  // Para cambio de libre:
  diaLibreOriginal?: string; // YYYY-MM-DD — día que se mueve
  diaLibreNuevo?: string;    // YYYY-MM-DD — nuevo día libre
}

export interface CompensatorioPersonal {
  id: string;
  driverId: string;
  internalNumber: string;
  concepto: string;          // "Festivo trabajado 25/12/2025", "Horas extra", etc.
  fecha: string;             // YYYY-MM-DD — cuando se generó el derecho
  diasDisponibles: number;
  diasUsados: number;
  vencimiento: string;       // YYYY-MM-DD
  creadoEn: string;
}

// ─── SERVICIO ─────────────────────────────────────────────────────────────────

export const LicenciasService = {
  async crear(data: Omit<LicenciaPersonal, 'id' | 'creadoEn' | 'actualizadoEn'>): Promise<string> {
    const id = `lic_${data.driverId}_${data.fechaDesde}_${Date.now()}`;
    const now = new Date().toISOString();
    await setDoc(doc(db, COL, id), { ...data, id, creadoEn: now, actualizadoEn: now });
    return id;
  },

  async aprobar(id: string, aprobadoPor: string): Promise<void> {
    await updateDoc(doc(db, COL, id), {
      estado: 'aprobada',
      aprobadoPor,
      actualizadoEn: new Date().toISOString(),
    });
  },

  async rechazar(id: string, rechazadoPor: string, motivo: string): Promise<void> {
    await updateDoc(doc(db, COL, id), {
      estado: 'rechazada',
      rechazadoPor,
      motivoRechazo: motivo,
      actualizadoEn: new Date().toISOString(),
    });
  },

  async getByDriver(driverId: string): Promise<LicenciaPersonal[]> {
    const q = query(
      collection(db, COL),
      where('driverId', '==', driverId),
      orderBy('fechaDesde', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as LicenciaPersonal);
  },

  async getPendientes(): Promise<LicenciaPersonal[]> {
    const q = query(
      collection(db, COL),
      where('estado', '==', 'pendiente'),
      orderBy('creadoEn', 'asc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as LicenciaPersonal);
  },

  /** Ausencias de un conductor en un rango de fechas */
  async getAusenciasByRango(driverId: string, desde: string, hasta: string): Promise<LicenciaPersonal[]> {
    const q = query(
      collection(db, COL),
      where('driverId', '==', driverId),
      where('fechaDesde', '>=', desde),
      where('fechaHasta', '<=', hasta),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as LicenciaPersonal);
  },

  /** Todos los conductores ausentes en una fecha específica */
  async getAusentesPorFecha(fecha: string): Promise<LicenciaPersonal[]> {
    const q = query(
      collection(db, COL),
      where('fechaDesde', '<=', fecha),
      where('fechaHasta', '>=', fecha),
      where('estado', 'in', ['aprobada', 'pendiente']),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as LicenciaPersonal);
  },

  subscribe(onChange: (items: LicenciaPersonal[]) => void): () => void {
    const q = query(collection(db, COL), orderBy('creadoEn', 'desc'));
    return onSnapshot(q, (snap) => onChange(snap.docs.map((d) => d.data() as LicenciaPersonal)));
  },
};

// ─── COMPENSATORIOS ───────────────────────────────────────────────────────────

export const CompensatoriosService = {
  async acreditar(data: Omit<CompensatorioPersonal, 'id' | 'creadoEn' | 'diasUsados'>): Promise<string> {
    const id = `comp_${data.driverId}_${data.fecha}_${Date.now()}`;
    await setDoc(doc(db, COL_COMP, id), {
      ...data, id, diasUsados: 0, creadoEn: new Date().toISOString(),
    });
    return id;
  },

  async usar(id: string, dias: number): Promise<void> {
    const ref = doc(db, COL_COMP, id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data() as CompensatorioPersonal;
    await updateDoc(ref, {
      diasUsados: Math.min(data.diasUsados + dias, data.diasDisponibles),
    });
  },

  async getSaldo(driverId: string): Promise<{ disponibles: number; registros: CompensatorioPersonal[] }> {
    const hoy = new Date().toISOString().split('T')[0];
    const q = query(
      collection(db, COL_COMP),
      where('driverId', '==', driverId),
      where('vencimiento', '>=', hoy),
    );
    const snap = await getDocs(q);
    const registros = snap.docs.map((d) => d.data() as CompensatorioPersonal);
    const disponibles = registros.reduce((s, r) => s + r.diasDisponibles - r.diasUsados, 0);
    return { disponibles, registros };
  },
};

// ─── ETIQUETAS UI ─────────────────────────────────────────────────────────────

export const TIPO_LICENCIA_LABEL: Record<TipoLicencia, string> = {
  medica:              'Licencia Médica',
  administrativa:      'Licencia Administrativa',
  sindical:            'Licencia Sindical',
  estudio:             'Licencia por Estudio',
  maternidad:          'Maternidad / Paternidad',
  falta_injustificada: 'Falta Injustificada',
  compensatorio:       'Compensatorio',
  cambio_libre:        'Cambio de Día Libre',
  franco_adicional:    'Franco Adicional',
  otro:                'Otro',
};

export const TIPO_LICENCIA_COLOR: Record<TipoLicencia, string> = {
  medica:              'text-blue-400 bg-blue-900/30 border-blue-800',
  administrativa:      'text-cyan-400 bg-cyan-900/30 border-cyan-800',
  sindical:            'text-purple-400 bg-purple-900/30 border-purple-800',
  estudio:             'text-indigo-400 bg-indigo-900/30 border-indigo-800',
  maternidad:          'text-pink-400 bg-pink-900/30 border-pink-800',
  falta_injustificada: 'text-red-400 bg-red-900/30 border-red-800',
  compensatorio:       'text-emerald-400 bg-emerald-900/30 border-emerald-800',
  cambio_libre:        'text-amber-400 bg-amber-900/30 border-amber-800',
  franco_adicional:    'text-teal-400 bg-teal-900/30 border-teal-800',
  otro:                'text-slate-400 bg-slate-800 border-slate-700',
};
