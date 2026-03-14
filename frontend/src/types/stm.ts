/**
 * Tipos STM - Frontend
 * Espejo de tipos backend para type-safe data handling
 */

export interface Parada {
  id: string;
  numero: number;
  nombre: string;
  latitud: number;
  longitud: number;
  direccion: string;
  accesibilidad: boolean;
}

export interface LineaSTM {
  id: string;
  numero: number;
  nombre: string;
  operador: string;
  color: string;
  descripcion: string;
  inicio: Parada;
  fin: Parada;
  paradas: Parada[];
  horarioOperacion: {
    lunes_viernes_inicio: string;
    lunes_viernes_fin: string;
    sabado_inicio: string;
    sabado_fin: string;
    domingo_inicio: string;
    domingo_fin: string;
  };
  frecuencia_minutos: number;
  longitud_km: number;
  duracion_promedio_minutos: number;
}

export interface ViajeSTM {
  id: string;
  hora_salida: string;
  hora_llegada_estimada: string;
  paradas_intermedias: string[];
  dias_semana: number[];
  es_expreso: boolean;
}

export interface HorarioSTM {
  id: string;
  lineaId: string;
  lineaNumero: number;
  operador: string;
  fecha_vigencia_desde: Date;
  fecha_vigencia_hasta: Date;
  horarios: ViajeSTM[];
  ultima_actualizacion: Date;
  version: number;
}

export interface CambioHorarioDetectado {
  id: string;
  linea_numero: number;
  operador: string;
  tipo_cambio: 'adelanto' | 'atraso' | 'nueva_salida' | 'cancelado' | 'cambio_ruta';
  hora_anterior: string;
  hora_nueva: string;
  minutos_diferencia: number;
  fecha_efectiva: Date;
  severidad: 'baja' | 'media' | 'alta';
  impacto_estimado: {
    lineas_competidoras_afectadas: string[];
    pasajeros_en_riesgo_estimado: number;
    minutos_ventaja_adquirida: number;
  };
  ya_alertado: boolean;
  fecha_deteccion: Date;
}

export interface Maquina5G {
  id: string;
  numero_interno: string;
  bus_id: string;
  operador: string;
  linea_numero: number;
  ubicacion_gps: {
    latitud: number;
    longitud: number;
    timestamp: Date;
  };
  estado: 'operativa' | 'mantenimiento' | 'fuera_servicio';
  saldo_efectivo: number;
  conectividad: '5g' | '4g' | '3g' | 'sin_conexion';
  bateria_porcentaje: number;
  ultima_sincronizacion: Date;
}

export interface DatosEnVivoBus {
  bus_id: string;
  operador: string;
  linea_numero: number;
  ubicacion_gps: {
    latitud: number;
    longitud: number;
    timestamp: Date;
  };
  parada_actual: string;
  siguiente_parada: string;
  pasajeros_a_bordo: number;
  cumplimiento_horario: number;
  estado_mecanico: 'ok' | 'alerta' | 'critico';
  velocidad_km_h: number;
  temperatura_motor: number;
  ultima_actualizacion: Date;
}

export interface EstadisticasDiariasBus {
  id: string;
  bus_id: string;
  operador: string;
  linea_numero: number;
  fecha: Date;
  kilometros_recorridos: number;
  tiempo_operacion_minutos: number;
  viajes_completados: number;
  pasajeros_transportados: number;
  ingresos_total: number;
  ingresos_promedio_por_viaje: number;
  cumplimiento_horario_promedio: number;
  ocupacion_promedio_porcentaje: number;
  paradas_realizadas: number;
}

export interface CalidadDatos {
  id: string;
  fecha_reporte: Date;
  maquinas_activas: number;
  maquinas_sincronizadas: number;
  porcentaje_sincronizacion: number;
  transacciones_diarias: number;
  transacciones_sin_sincronizar: number;
  buses_con_gps_activo: number;
  latencia_promedio_ms: number;
  disponibilidad_api_porcentaje: number;
  calidad_general: 'excelente' | 'buena' | 'regular' | 'mala';
}
