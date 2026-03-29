/**
 * MaintenanceService — Gestión de Mantenimiento UCOT
 * ====================================================
 * Manejo completo de mantenimiento preventivo, correctivo y
 * alertas predictivas para la flota eléctrica Yutong.
 *
 * DÓNDE COLOCAR: frontend/src/services/maintenanceService.ts
 *
 * USO:
 *   import { maintenanceService } from '../services/maintenanceService';
 *   const pendientes = await maintenanceService.getPendientes();
 *   await maintenanceService.crearOrden({ cocheId: '115', tipo: 'preventivo', ... });
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface OrdenMantenimiento {
  id?: string;
  cocheId: string;
  tipo: 'preventivo' | 'correctivo' | 'revision_electrica' | 'cambio_bateria';
  descripcion: string;
  estado: 'pendiente' | 'en_proceso' | 'completado' | 'cancelado';
  prioridad: 'baja' | 'media' | 'alta' | 'critica';
  fechaProgramada: string;
  fechaCompletado?: string;
  tecnicoId?: string;
  tecnicoNombre?: string;
  costo?: number;
  kilometraje?: number;
  horasMotor?: number;
  observaciones?: string;
  // Específico para eléctricos
  nivelBateriaPct?: number;
  ciclosCarga?: number;
  temperaturaMotor?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface AlertaMantenimiento {
  cocheId: string;
  tipo: string;
  mensaje: string;
  severidad: 'info' | 'warning' | 'danger';
  accionRecomendada: string;
}

// ─── Configuración preventivo (km o días) ────────────────────────────────────

const INTERVALOS_PREVENTIVO = {
  diesel: {
    aceite_km: 10_000,
    filtros_km: 20_000,
    revision_general_dias: 90,
    neumaticos_km: 80_000,
  },
  electrico: {
    revision_bateria_dias: 30,
    revision_motor_dias: 60,
    actualizacion_software_dias: 90,
    neumaticos_km: 60_000,
    carga_ciclos_alerta: 500, // alertar al llegar a 500 ciclos
  },
};

// ─── Servicio ─────────────────────────────────────────────────────────────────

class MaintenanceServiceClass {
  private COL = 'maintenance';

  // ── CRUD básico ──────────────────────────────────────────────────────────────

  async getPendientes(): Promise<OrdenMantenimiento[]> {
    const q = query(
      collection(db, this.COL),
      where('estado', 'in', ['pendiente', 'en_proceso']),
      orderBy('fechaProgramada'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as OrdenMantenimiento);
  }

  async getPorVehiculo(cocheId: string): Promise<OrdenMantenimiento[]> {
    const q = query(
      collection(db, this.COL),
      where('cocheId', '==', cocheId),
      orderBy('fechaProgramada', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as OrdenMantenimiento);
  }

  async crearOrden(orden: Omit<OrdenMantenimiento, 'id'>): Promise<string> {
    const ref = await addDoc(collection(db, this.COL), {
      ...orden,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }

  async actualizarEstado(
    ordenId: string,
    estado: OrdenMantenimiento['estado'],
    extras?: Partial<OrdenMantenimiento>,
  ): Promise<void> {
    await updateDoc(doc(db, this.COL, ordenId), {
      estado,
      ...(estado === 'completado' ? { fechaCompletado: new Date().toISOString() } : {}),
      ...extras,
      updatedAt: serverTimestamp(),
    });
  }

  // ── Análisis predictivo (eléctricos Yutong) ──────────────────────────────────

  generarAlertasElectrico(params: {
    cocheId: string;
    nivelBateriaPct: number;
    ciclosCarga: number;
    diasUltimaRevision: number;
    temperaturaMotor?: number;
  }): AlertaMantenimiento[] {
    const alertas: AlertaMantenimiento[] = [];
    const { cocheId, nivelBateriaPct, ciclosCarga, diasUltimaRevision, temperaturaMotor } = params;
    const cfg = INTERVALOS_PREVENTIVO.electrico;

    if (nivelBateriaPct < 20) {
      alertas.push({
        cocheId,
        tipo: 'bateria_critica',
        mensaje: `Batería al ${nivelBateriaPct}% — Cargar urgente`,
        severidad: 'danger',
        accionRecomendada: 'Regresar a cochera para carga inmediata',
      });
    } else if (nivelBateriaPct < 35) {
      alertas.push({
        cocheId,
        tipo: 'bateria_baja',
        mensaje: `Batería al ${nivelBateriaPct}% — Planificar carga`,
        severidad: 'warning',
        accionRecomendada: 'Priorizar en próximo turno de carga nocturna',
      });
    }

    if (ciclosCarga >= cfg.carga_ciclos_alerta) {
      alertas.push({
        cocheId,
        tipo: 'ciclos_carga',
        mensaje: `${ciclosCarga} ciclos de carga — Revisar degradación`,
        severidad: ciclosCarga >= 600 ? 'danger' : 'warning',
        accionRecomendada: 'Programar diagnóstico de batería con técnico Yutong',
      });
    }

    if (diasUltimaRevision >= cfg.revision_bateria_dias) {
      alertas.push({
        cocheId,
        tipo: 'revision_bateria_vencida',
        mensaje: `${diasUltimaRevision} días sin revisión de batería (límite: ${cfg.revision_bateria_dias})`,
        severidad: 'warning',
        accionRecomendada: 'Programar revisión técnica del sistema de baterías',
      });
    }

    if (temperaturaMotor && temperaturaMotor > 85) {
      alertas.push({
        cocheId,
        tipo: 'temperatura_motor',
        mensaje: `Motor a ${temperaturaMotor}°C — Por encima del umbral`,
        severidad: temperaturaMotor > 95 ? 'danger' : 'warning',
        accionRecomendada:
          temperaturaMotor > 95
            ? 'Detener servicio inmediatamente — riesgo de daño'
            : 'Monitorear y reducir velocidad',
      });
    }

    return alertas;
  }

  // ── Programar mantenimiento preventivo masivo ─────────────────────────────────

  async programarPreventivoMasivo(
    vehiculos: Array<{ id: string; tipo: 'electrico' | 'diesel'; ultimoMantenimientoKm: number }>,
    tecnicoId?: string,
  ): Promise<{ creados: number; omitidos: number }> {
    let creados = 0;
    let omitidos = 0;
    const hoy = new Date();

    for (const v of vehiculos) {
      // Verificar si ya tiene pendiente
      const existentes = await getDocs(
        query(
          collection(db, this.COL),
          where('cocheId', '==', v.id),
          where('estado', '==', 'pendiente'),
        ),
      );

      if (existentes.size > 0) {
        omitidos++;
        continue;
      }

      const fechaProgramada = new Date(hoy);
      fechaProgramada.setDate(fechaProgramada.getDate() + 7);

      await this.crearOrden({
        cocheId: v.id,
        tipo: v.tipo === 'electrico' ? 'revision_electrica' : 'preventivo',
        descripcion:
          v.tipo === 'electrico'
            ? 'Revisión técnica sistema eléctrico y baterías Yutong'
            : 'Mantenimiento preventivo general (aceite, filtros, frenos)',
        estado: 'pendiente',
        prioridad: 'media',
        fechaProgramada: fechaProgramada.toISOString().split('T')[0],
        tecnicoId,
        observaciones: `Programado automáticamente por TransformaFacil el ${hoy.toLocaleDateString('es-UY')}`,
      });

      creados++;
    }

    return { creados, omitidos };
  }
}

export const maintenanceService = new MaintenanceServiceClass();
