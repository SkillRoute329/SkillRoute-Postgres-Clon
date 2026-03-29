/**
 * Tipos centralizados — TransformaFacil 2.0
 * ==========================================
 * DÓNDE COLOCAR: frontend/src/types/transformafacil.ts
 * Importar en cualquier módulo: import type { ... } from '../types/transformafacil'
 */

// ─── Vehículo / Flota ─────────────────────────────────────────────────────────

export interface Vehiculo {
  id: string;
  numero: string; // Número interno del coche, ej: "115"
  patente?: string;
  empresa: 'UCOT' | string;
  modelo?: string; // Ej: "Yutong E12LF"
  año?: number;
  tipo: 'electrico' | 'hibrido' | 'diesel';
  status: 'activo' | 'mantenimiento' | 'taller' | 'paralizado' | 'baja';
  capacidadPasajeros?: number;
  ultimaInspeccion?: string; // ISO date
  // GPS
  ultimaPosicion?: { lat: number; lng: number };
  ultimaActualizacionGps?: string; // ISO timestamp
}

export interface ViajeActivo {
  id: string; // = cocheId
  cocheId: string;
  codigoLinea: string;
  conductorId: string;
  conductorNombre?: string;
  empresa: string;
  posicion?: { latitude: number; longitude: number };
  updatedAt?: { toMillis: () => number };
  estado: 'en_servicio' | 'fuera_de_servicio' | 'parado';
  velocidad?: number | null;
  rumbo?: number | null;
}

// ─── Líneas y Rutas ───────────────────────────────────────────────────────────

export interface LineaUCOT {
  id: string;
  codigo: string; // "300", "306", "CE1"
  variante?: string; // "a", "b"
  nombre: string;
  empresa: string;
  activa: boolean;
  paradas?: ParadaLinea[];
  recorrido?: PuntoLatLng[];
  frecuenciaMinutos?: {
    laborable: number;
    sabado: number;
    domingo: number;
  };
}

export interface ParadaLinea {
  id: string;
  nombre: string;
  lat: number;
  lng: number;
  esTerminal?: boolean;
}

export interface PuntoLatLng {
  lat: number;
  lng: number;
}

// ─── Conductor / Personal ─────────────────────────────────────────────────────

export interface Personal {
  id: string;
  legajo: string;
  nombre: string;
  apellido: string;
  nombreCompleto?: string;
  dni?: string;
  rol: 'conductor' | 'inspector' | 'mecanico' | 'admin' | 'gerencia';
  estado: 'activo' | 'suspendido' | 'licencia' | 'baja';
  licencia?: {
    numero: string;
    vencimiento: string;
    categorias: string[];
  };
  turno?: 'mañana' | 'tarde' | 'noche' | 'rotativo';
  lineaAsignada?: string;
  cocheAsignado?: string;
}

export interface Turno {
  id: string;
  conductorId: string;
  cocheId: string;
  lineaCodigo: string;
  fecha: string; // "YYYY-MM-DD"
  horaInicio: string; // "HH:MM"
  horaFin: string;
  estado: 'programado' | 'en_curso' | 'completado' | 'ausente' | 'cancelado';
  atrasoMinutos?: number;
  observaciones?: string;
}

// ─── Cartones / Boletos ───────────────────────────────────────────────────────

export interface Carton {
  id: string;
  numero: string;
  tipo: 'boleto' | 'abono_mensual' | 'jubilado' | 'escolar' | 'diferencial';
  precio: number;
  validoDesde: string;
  validoHasta: string;
  lineasHabilitadas: string[];
  estado: 'activo' | 'usado' | 'vencido' | 'cancelado';
  usuarioId?: string;
  // STM
  stmCompatible?: boolean;
  qrCode?: string;
}

// ─── Mantenimiento ────────────────────────────────────────────────────────────

export interface Mantenimiento {
  id: string;
  cocheId: string;
  tipo: 'preventivo' | 'correctivo' | 'revision_electrica';
  descripcion: string;
  estado: 'pendiente' | 'en_proceso' | 'completado' | 'cancelado';
  fechaProgramada: string;
  fechaCompletado?: string;
  tecnicoId?: string;
  costo?: number;
  kilometraje?: number;
  observaciones?: string;
  // Para eléctricos
  bateriaEstado?: 'optimo' | 'degradado' | 'critico';
  nivelCargaKwh?: number;
}

// ─── Alertas ──────────────────────────────────────────────────────────────────

export interface AlertaVia {
  id: string;
  tipo: 'accidente' | 'corte_calle' | 'manifestacion' | 'inundacion' | 'obras' | 'otro';
  descripcion: string;
  ubicacion?: { lat: number; lng: number; descripcion?: string };
  lineasAfectadas: string[];
  conductorId?: string;
  estado: 'activa' | 'resuelta';
  createdAt: string;
  resolvedAt?: string;
  severidad: 'baja' | 'media' | 'alta' | 'critica';
}

// ─── Analytics / KPIs ─────────────────────────────────────────────────────────

export interface KpiDashboard {
  fecha: string;
  flotaActiva: {
    valor: number;
    total: number;
    porcentaje: number;
  };
  puntualidad: {
    porcentaje: number | null;
    muestreo: number;
  };
  serviciosHoy: number;
  alertasActivas?: number;
  ingresosHoy?: number;
}

export interface RevenueLinea {
  linea: string;
  totalBoletos: number;
  ingresos: number; // En pesos uruguayos
}

// ─── BRT ──────────────────────────────────────────────────────────────────────

export interface CorredorBRT {
  id: string;
  nombre: string;
  color: string;
  tramo: string;
  kmAproximados: number;
  tiempoActualMin: number;
  tiempoBRTMin: number;
  reduccionMin: number;
  tunnel: boolean;
  lineasUCOTAfectadas: string[];
  coordenadas: [number, number][];
  estaciones: {
    nombre: string;
    lat: number;
    lng: number;
  }[];
}

// ─── GTFS ─────────────────────────────────────────────────────────────────────

export interface GTFSRoute {
  route_id: string;
  agency_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number;
  route_color?: string;
  route_text_color?: string;
}

export interface GTFSStop {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
  stop_code?: string;
}

export interface GTFSAgency {
  agency_id: string;
  agency_name: string;
  agency_url: string;
  agency_timezone: string;
  agency_lang?: string;
  agency_phone?: string;
}
