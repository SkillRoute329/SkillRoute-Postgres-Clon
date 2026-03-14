/**
 * TIPOS STM Uruguay - Semana 10-11
 * Integración con datos públicos de Sistema de Transporte Metropolitano
 */

// ═══════════════════════════════════════════════════════════════════════════
// DATOS DE STM (Horarios, Rutas, Paradas)
// ═══════════════════════════════════════════════════════════════════════════

export interface LineaSTM {
  id: string;
  numero: number;
  nombre: string;
  operador: string; // COETC, COME, Cutcsa, UCOT, etc.
  color: string;
  descripcion: string;
  inicio: Parada;
  fin: Parada;
  paradas: Parada[];
  horarioOperacion: {
    lunes_viernes_inicio: string; // "05:30"
    lunes_viernes_fin: string;    // "23:30"
    sabado_inicio: string;
    sabado_fin: string;
    domingo_inicio: string;
    domingo_fin: string;
  };
  frecuencia_minutos: number; // 15, 20, 30, etc.
  longitud_km: number;
  duracion_promedio_minutos: number;
}

export interface Parada {
  id: string;
  numero: number;
  nombre: string;
  latitud: number;
  longitud: number;
  direccion: string;
  accesibilidad: boolean; // ADA compliant
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

export interface ViajeSTM {
  id: string;
  hora_salida: string; // "06:15"
  hora_llegada_estimada: string; // "06:45"
  paradas_intermedias: string[]; // ["Parada 1", "Parada 2"]
  dias_semana: number[]; // 1=lunes, 7=domingo
  es_expreso: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// DATOS DE MÁQUINAS 5G (Boletaje en Tiempo Real)
// ═══════════════════════════════════════════════════════════════════════════

export interface Maquina5G {
  id: string;
  numero_interno: string; // Identificador de la máquina
  bus_id: string; // ID del ómnibus donde está instalada
  operador: string;
  linea_numero: number;
  ubicacion_gps: {
    latitud: number;
    longitud: number;
    timestamp: Date;
  };
  estado: 'operativa' | 'mantenimiento' | 'fuera_servicio';
  saldo_efectivo: number; // Pesos en la máquina
  conectividad: '5g' | '4g' | '3g' | 'sin_conexion';
  bateria_porcentaje: number;
  ultima_sincronizacion: Date;
}

export interface DatosBoletaje5G {
  id: string;
  maquina_id: string;
  bus_id: string;
  operador: string;
  linea_numero: number;
  fecha_transaccion: Date;
  hora: string;
  tipo_tarifa: 'adulto' | 'jubilado' | 'estudiante' | 'libre'; // Último es para el que no paga
  monto: number; // 56 pesos para adulto
  metodo_pago: 'efectivo' | 'tarjeta_SUBE' | 'codigo_QR' | 'otro';
  parada_descenso?: string;
  cumplimiento: boolean; // ¿Pagó?
  sincronizado: boolean; // ¿Subido a servidor?
}

export interface ConteoPassajeros5G {
  id: string;
  bus_id: string;
  maquina_id: string;
  operador: string;
  linea_numero: number;
  timestamp: Date;
  pasajeros_a_bordo: number; // Sensores de ocupación
  ocupacion_porcentaje: number; // 0-100
  capacidad_bus: number; // 60 pasajeros típico
  parada_actual?: string;
  siguiente_parada?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SINCRONIZACIÓN Y VALIDACIÓN
// ═══════════════════════════════════════════════════════════════════════════

export interface SincronizacionSTM {
  id: string;
  fecha_inicio: Date;
  fecha_fin: Date;
  tipo: 'horarios' | 'paradas' | 'lineas' | 'completa';
  estado: 'en_progreso' | 'completada' | 'error';
  registros_procesados: number;
  registros_con_error: number;
  errores: ErrorSincronizacion[];
  cambios_detectados: {
    lineas_nuevas: number;
    lineas_modificadas: number;
    horarios_actualizados: number;
  };
}

export interface ErrorSincronizacion {
  campo: string;
  valor: string;
  razon: string;
  timestamp: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// ALERTAS POR CAMBIOS DE HORARIOS
// ═══════════════════════════════════════════════════════════════════════════

export interface CambioHorarioDetectado {
  id: string;
  linea_numero: number;
  operador: string;
  tipo_cambio: 'adelanto' | 'atraso' | 'nueva_salida' | 'cancelado' | 'cambio_ruta';
  hora_anterior: string;
  hora_nueva: string;
  minutos_diferencia: number; // Positivo = adelanto, negativo = atraso
  fecha_efectiva: Date;
  severidad: 'baja' | 'media' | 'alta'; // Alta si es >30 minutos
  impacto_estimado: {
    lineas_competidoras_afectadas: string[];
    pasajeros_en_riesgo_estimado: number;
    minutos_ventaja_adquirida: number;
  };
  ya_alertado: boolean;
  fecha_deteccion: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// DATOS EN VIVO (REAL-TIME via Socket.io)
// ═══════════════════════════════════════════════════════════════════════════

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
  cumplimiento_horario: number; // -5 a +5 minutos
  estado_mecanico: 'ok' | 'alerta' | 'critico';
  velocidad_km_h: number;
  temperatura_motor: number;
  ultima_actualizacion: Date;
}

export interface AlertaEnVivoCompetencia {
  id: string;
  linea_ucot: number;
  linea_competidora: number;
  operador_competidor: string;
  tipo_alerta: 'adelanto_detectado' | 'sincronizacion_horaria' | 'frecuencia_aumentada' | 'nueva_parada';
  descripcion: string;
  impacto_pasajeros: number;
  recomendacion_accion: string;
  urgencia: 'baja' | 'media' | 'alta' | 'critica';
  timestamp: Date;
  resuelta: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// ESTADÍSTICAS Y REPORTES
// ═══════════════════════════════════════════════════════════════════════════

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

export interface ResumenHorarioActual {
  linea_numero: number;
  operador: string;
  ultima_sincronizacion: Date;
  estado_horarios: 'actualizado' | 'desactualizado' | 'error';
  cambios_pendientes: number;
  horarios_activos_hoy: number;
  proximas_cambios: {
    fecha: Date;
    tipo: string;
    descripcion: string;
  }[];
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN STM
// ═══════════════════════════════════════════════════════════════════════════

export interface ConfiguracionSTM {
  api_url: string;
  api_key: string;
  sincronizar_cada_minutos: number;
  zonas_monitoreo: {
    nombre: string;
    latitud_min: number;
    latitud_max: number;
    longitud_min: number;
    longitud_max: number;
  }[];
  operadores_a_monitorear: string[];
  habilitar_alertas_en_tiempo_real: boolean;
  timeout_api_segundos: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// METRICAS DE CALIDAD DE DATOS
// ═══════════════════════════════════════════════════════════════════════════

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
