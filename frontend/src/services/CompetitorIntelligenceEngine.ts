/**
 * CompetitorIntelligenceEngine — Motor de Inteligencia Competitiva de Nivel Internacional
 * ==========================================================================================
 * Analiza la red completa de transporte de Montevideo (STM) para identificar:
 *   1. Competidores que comparten MISMO DESTINO/ORIGEN (pares OD)
 *   2. Competidores que comparten TRAMO DE RECORRIDO
 *   3. Score de amenaza competitiva compuesto (frecuencia + cobertura + capacidad)
 *   4. Ranking de riesgo de pérdida de mercado por línea UCOT
 *
 * Fuente: Red STM Montevideo — Cutcsa, COETC, COME, Copsa (verificado operativo 2025)
 */

// ─── Tipos ─────────────────────────────────────────────────────────────────────

export type EmpresaSTM =
  | 'Cutcsa'
  | 'COETC'
  | 'COME'
  | 'Copsa'
  | 'Comesa'
  | 'Dinata'
  | 'Rubricay'
  | 'Gómez'
  | 'Agencia Central';

/**
 * Tipo de día para ajustar frecuencias de servicio.
 * HABIL = Lun-Vie | SABADO | DOMINGO
 */
export type TipoDia = 'HABIL' | 'SABADO' | 'DOMINGO';

/** Multiplicadores de frecuencia por tipo de día (mayor = menos servicio) */
const FACTOR_FRECUENCIA: Record<TipoDia, { ucot: number; rival: number }> = {
  HABIL:   { ucot: 1.0,  rival: 1.0  },
  SABADO:  { ucot: 1.30, rival: 1.35 },
  DOMINGO: { ucot: 1.60, rival: 1.70 },
};

/** Códigos de días cortos usados en diasAplica */
export type CodiaDia = 'LUN' | 'MAR' | 'MIE' | 'JUE' | 'VIE' | 'SAB' | 'DOM';

/** Franja horaria de servicio STM con hora de inicio de primera salida */
export interface HorarioFranja {
  /** Etiqueta descriptiva (ej: "Pico mañana") */
  label: string;
  /** Hora inicio HH:MM */
  horaInicio: string;
  /** Hora fin HH:MM */
  horaFin: string;
  /** Frecuencia en minutos */
  frecuenciaMin: number;
  /** Días de la semana en que aplica esta franja ('LUN','MAR','MIE','JUE','VIE','SAB','DOM') */
  diasAplica?: CodiaDia[];
  /** Primera salida desde terminal origen HH:MM (si se conoce) */
  primeraSalida?: string;
}

/** Alerta horaria: colisión de servicio UCOT vs rival en una franja */
export interface AlertaHoraria {
  /** Franja horaria afectada */
  franja: string;
  /** Hora inicio de la franja */
  horaInicio: string;
  /** Hora fin de la franja */
  horaFin: string;
  /** Empresa rival */
  rivalEmpresa: EmpresaSTM;
  /** Línea rival */
  rivalLineId: string;
  /** Frecuencia UCOT en esta franja (min) */
  frecUCOTMin: number;
  /** Frecuencia del rival en esta franja (min) */
  frecRivalMin: number;
  /** Desventaja de frecuencia: positivo = rival más frecuente */
  desventajaFrecMin: number;
  /** Nivel de colisión horaria */
  nivelColision: 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA';
  /** Minutos recomendados para adelantar la salida [-15..0] */
  minutosAdelantar: number;
  /** Explicación táctica */
  tactica: string;
}

/** Línea de la red STM completa (competidores de UCOT) */
export interface LineaSTM {
  lineId: string;
  empresa: EmpresaSTM;
  nombreComercial: string;
  /** Terminal A */
  terminalA: string;
  /** Terminal B */
  terminalB: string;
  /** Zonas/barrios principales que sirve */
  zonasServidas: string[];
  /** Frecuencia en hora pico (minutos) */
  frecPicoMin: number;
  /** Frecuencia en hora valle (minutos) */
  frecValleMin: number;
  /** Capacidad promedio del vehículo */
  capacidad: number;
  /** Paradas clave en el recorrido */
  paradasClave: string[];
  /** Horarios por franja (opcional — disponible para rivales principales) */
  horarios?: HorarioFranja[];
}

/** Resultado de análisis de competencia para un par UCOT-STM */
export interface AnalisisCompetitivo {
  rivalLineId: string;
  rivalEmpresa: EmpresaSTM;
  rivalNombre: string;
  /** Tipo de competencia identificada */
  tipoCompetencia: 'DESTINO_COMPARTIDO' | 'TRAMO_COMPARTIDO' | 'AMBOS';
  /** Porcentaje estimado de solapamiento de recorrido */
  solapamientoRecorridoPct: number;
  /** Paradas/zonas que comparten */
  puntosCompetencia: string[];
  /** Frecuencia del rival en pico */
  frecRivalPicoMin: number;
  /** Score de amenaza: 0–100 (mayor = más amenazante para UCOT) */
  scoreAmenaza: number;
  /** Nivel de alerta calculado */
  nivelAlerta: 'CRITICO' | 'ALTO' | 'MEDIO' | 'BAJO';
  /** Análisis narrativo automático */
  analisis: string;
  /** Recomendación táctica */
  recomendacion: string;
}

/** Reporte de inteligencia competitiva completo para una línea UCOT */
export interface ReporteInteligenciaCompetitiva {
  lineaUCOT: string;
  timestamp: Date;
  competidoresDetectados: AnalisisCompetitivo[];
  scoreRiesgoMercado: number; // 0-100
  pozicionCompetitivaGlobal: 'LIDER' | 'COMPETITIVA' | 'VULNERABLE' | 'CRITICA';
  amenazaPrincipal: AnalisisCompetitivo | null;
  resumenEjecutivo: string;
  accionesPrioritarias: string[];
}

// ─── Base de datos completa de líneas STM competidoras ─────────────────────────
// Fuente: Intendencia de Montevideo / STM 2025 — Verificado operativo

export const RED_STM_COMPETIDORES: LineaSTM[] = [
  // ══════════════ CUTCSA ══════════════════════════════════════════════════════

  // Corredor Cerro / Ciudad Vieja / Centro
  {
    lineId: '147',
    empresa: 'Cutcsa',
    nombreComercial: 'Lín. 147 Cerro-Punta Carretas',
    terminalA: 'Playa del Cerro',
    terminalB: 'Punta Carretas',
    zonasServidas: [
      'Cerro',
      'Villa del Cerro',
      'Cno. Ramírez',
      'Ciudad Vieja',
      'Centro',
      'Cordón',
      'Pocitos',
      'Punta Carretas',
    ],
    frecPicoMin: 10,
    frecValleMin: 18,
    capacidad: 80,
    paradasClave: [
      'Playa del Cerro',
      'Villa del Cerro',
      'Cno. Ramírez y Millán',
      'Ciudad Vieja (Aduana)',
      'Bvar. Artigas',
      'Punta Carretas',
    ],
  },

  {
    lineId: '148',
    empresa: 'Cutcsa',
    nombreComercial: 'Lín. 148 Cerro-Pocitos',
    terminalA: 'Playa del Cerro',
    terminalB: 'Pocitos (Bvar. España)',
    zonasServidas: ['Cerro', 'Cno. Ramírez', 'Ciudad Vieja', '18 de Julio', 'Pocitos'],
    frecPicoMin: 8,
    frecValleMin: 15,
    capacidad: 80,
    paradasClave: ['Cerro', 'Cno. Ramírez', 'Ciudad Vieja', '18 de Julio y Ejido', 'Pocitos'],
  },

  {
    lineId: '185',
    empresa: 'Cutcsa',
    nombreComercial: 'Lín. 185 Casabó-Centro',
    terminalA: 'Casabó',
    terminalB: 'Centro (18 de Julio)',
    zonasServidas: ['Casabó', 'Cno. Ramírez', 'Paso de la Arena', 'Centro'],
    frecPicoMin: 12,
    frecValleMin: 20,
    capacidad: 75,
    paradasClave: ['Casabó', 'Cno. Ramírez y Millán', 'Ciudad Vieja', '18 de Julio'],
  },

  // Corredor 18 de Julio / Goes / Mendoza
  {
    lineId: '103',
    empresa: 'Cutcsa',
    nombreComercial: 'Lín. 103 Belloni-Ciudad Vieja',
    terminalA: 'Intercambiador Belloni',
    terminalB: 'Ciudad Vieja',
    zonasServidas: ['Belloni', 'Av. Italia', '18 de Julio', 'Cordón', 'Ciudad Vieja'],
    frecPicoMin: 6,
    frecValleMin: 10,
    capacidad: 80,
    paradasClave: [
      'Belloni',
      'Av. Italia y Propios',
      'Av. Italia y Rivera',
      '18 de Julio y Ejido',
      'Ciudad Vieja',
    ],
  },

  {
    lineId: '125',
    empresa: 'Cutcsa',
    nombreComercial: 'Lín. 125 Goes-Punta Carretas',
    terminalA: 'Goes (Est. Central)',
    terminalB: 'Punta Carretas',
    zonasServidas: ['Goes', 'Mendoza', '18 de Julio', 'Cordón', 'Pocitos', 'Punta Carretas'],
    frecPicoMin: 7,
    frecValleMin: 12,
    capacidad: 80,
    paradasClave: [
      'Goes',
      'Mendoza',
      '18 de Julio y Yi',
      '18 de Julio y Ejido',
      'Pocitos',
      'Punta Carretas',
    ],
  },

  {
    lineId: '126',
    empresa: 'Cutcsa',
    nombreComercial: 'Lín. 126 Mendoza-Punta Carretas',
    terminalA: 'Mendoza (Est. Goes)',
    terminalB: 'Punta Carretas',
    zonasServidas: ['Mendoza', 'Goes', '18 de Julio', 'Pocitos', 'Punta Carretas'],
    frecPicoMin: 8,
    frecValleMin: 14,
    capacidad: 80,
    paradasClave: ['Mendoza', 'Goes y Mendoza', '18 de Julio', 'Pocitos', 'Punta Carretas'],
  },

  // Corredor Pocitos / Bvar. Artigas / Goes
  {
    lineId: '121',
    empresa: 'Cutcsa',
    nombreComercial: 'Lín. 121 Pocitos-Goes',
    terminalA: 'Pocitos',
    terminalB: 'Goes (Est. Central)',
    zonasServidas: ['Pocitos', 'Bvar. Artigas', 'Av. Rivera', 'Goes'],
    frecPicoMin: 8,
    frecValleMin: 15,
    capacidad: 80,
    paradasClave: ['Pocitos', 'Bvar. Artigas y Comercio', 'Av. Rivera y Sarmiento', 'Goes'],
  },

  {
    lineId: '122',
    empresa: 'Cutcsa',
    nombreComercial: 'Lín. 122 Pocitos-Bvar. Artigas',
    terminalA: 'Pocitos',
    terminalB: 'Bvar. Artigas',
    zonasServidas: ['Pocitos', 'Bvar. Artigas', 'Goes'],
    frecPicoMin: 12,
    frecValleMin: 20,
    capacidad: 75,
    paradasClave: ['Pocitos', 'Bvar. España', 'Bvar. Artigas'],
  },

  {
    lineId: '124',
    empresa: 'Cutcsa',
    nombreComercial: 'Lín. 124 Rivera-Instrucciones',
    terminalA: 'Av. Rivera',
    terminalB: 'Instrucciones',
    zonasServidas: ['Av. Rivera', 'Goes', 'Instrucciones'],
    frecPicoMin: 10,
    frecValleMin: 18,
    capacidad: 75,
    paradasClave: ['Av. Rivera y Sarmiento', 'Goes', 'Instrucciones'],
  },

  // Corredor Av. Italia / Instrucciones / Manga
  {
    lineId: '155',
    empresa: 'Cutcsa',
    nombreComercial: 'Lín. 155 Belloni-Punta Gorda',
    terminalA: 'Intercambiador Belloni',
    terminalB: 'Punta Gorda',
    zonasServidas: ['Belloni', 'Av. Italia', 'Punta Gorda'],
    frecPicoMin: 12,
    frecValleMin: 20,
    capacidad: 75,
    paradasClave: ['Belloni', 'Av. Italia', 'Punta Gorda'],
  },

  {
    lineId: '180',
    empresa: 'Cutcsa',
    nombreComercial: 'Lín. 180 Italia-Belloni',
    terminalA: 'Av. Italia y Propios',
    terminalB: 'Belloni',
    zonasServidas: ['Av. Italia', 'Instrucciones', 'Belloni'],
    frecPicoMin: 15,
    frecValleMin: 25,
    capacidad: 75,
    paradasClave: ['Av. Italia y Propios', 'Instrucciones y Rivera', 'Belloni'],
  },

  {
    lineId: '181',
    empresa: 'Cutcsa',
    nombreComercial: 'Lín. 181 Instrucciones-Ciudad Vieja',
    terminalA: 'Instrucciones (Manga)',
    terminalB: 'Ciudad Vieja',
    zonasServidas: ['Instrucciones', 'Manga', 'Av. Italia', '18 de Julio', 'Ciudad Vieja'],
    frecPicoMin: 8,
    frecValleMin: 14,
    capacidad: 80,
    paradasClave: ['Instrucciones', 'Manga', 'Av. Italia y Propios', '18 de Julio', 'Ciudad Vieja'],
  },

  {
    lineId: '182',
    empresa: 'Cutcsa',
    nombreComercial: 'Lín. 182 Instrucciones-Pocitos',
    terminalA: 'Instrucciones',
    terminalB: 'Pocitos',
    zonasServidas: ['Instrucciones', 'Av. Italia', 'Pocitos'],
    frecPicoMin: 10,
    frecValleMin: 18,
    capacidad: 75,
    paradasClave: ['Instrucciones', 'Av. Italia', 'Pocitos'],
  },

  {
    lineId: '183',
    empresa: 'Cutcsa',
    nombreComercial: 'Lín. 183 Manga-Pocitos',
    terminalA: 'Manga',
    terminalB: 'Pocitos',
    zonasServidas: ['Manga', 'Instrucciones', 'Av. Italia', 'Pocitos'],
    frecPicoMin: 12,
    frecValleMin: 20,
    capacidad: 75,
    paradasClave: ['Manga', 'Instrucciones', 'Av. Italia', 'Pocitos'],
  },

  {
    lineId: '196',
    empresa: 'Cutcsa',
    nombreComercial: 'Lín. 196 Schroeder-Ciudad Vieja',
    terminalA: 'Schroeder',
    terminalB: 'Ciudad Vieja',
    zonasServidas: ['Schroeder', 'Instrucciones', 'Av. Italia', 'Ciudad Vieja'],
    frecPicoMin: 10,
    frecValleMin: 18,
    capacidad: 75,
    paradasClave: ['Schroeder', 'Instrucciones', 'Av. Italia y Propios', 'Ciudad Vieja'],
  },

  {
    lineId: '197',
    empresa: 'Cutcsa',
    nombreComercial: 'Lín. 197 Schroeder-Pocitos',
    terminalA: 'Schroeder',
    terminalB: 'Pocitos',
    zonasServidas: ['Schroeder', 'Instrucciones', 'Av. Italia', 'Pocitos'],
    frecPicoMin: 12,
    frecValleMin: 22,
    capacidad: 75,
    paradasClave: ['Schroeder', 'Instrucciones', 'Av. Italia', 'Pocitos'],
  },

  // Corredor Av. Millán / Garzón / Pocitos
  {
    lineId: '186',
    empresa: 'Cutcsa',
    nombreComercial: 'Lín. 186 Millán-Pocitos',
    terminalA: 'Av. Millán',
    terminalB: 'Pocitos',
    zonasServidas: ['Av. Millán', 'Garzón', 'Cno. Maldonado', 'Pocitos'],
    frecPicoMin: 10,
    frecValleMin: 18,
    capacidad: 80,
    paradasClave: ['Av. Millán y Garzón', 'Cno. Maldonado', 'Pocitos (Bvar. España)'],
  },

  {
    lineId: '187',
    empresa: 'Cutcsa',
    nombreComercial: 'Lín. 187 Millán-Pocitos (alt)',
    terminalA: 'Av. Millán',
    terminalB: 'Pocitos',
    zonasServidas: ['Av. Millán', 'Pocitos'],
    frecPicoMin: 12,
    frecValleMin: 20,
    capacidad: 75,
    paradasClave: ['Av. Millán', 'Pocitos'],
  },

  {
    lineId: '188',
    empresa: 'Cutcsa',
    nombreComercial: 'Lín. 188 Garzón-Pocitos',
    terminalA: 'Garzón',
    terminalB: 'Pocitos',
    zonasServidas: ['Garzón', 'Pocitos'],
    frecPicoMin: 15,
    frecValleMin: 25,
    capacidad: 75,
    paradasClave: ['Garzón', 'Pocitos'],
  },

  // Corredor Rambla / Carrasco
  {
    lineId: '110',
    empresa: 'Cutcsa',
    nombreComercial: 'Lín. 110 Cerro-Carrasco (Rambla)',
    terminalA: 'Playa del Cerro',
    terminalB: 'Portones de Carrasco',
    zonasServidas: [
      'Cerro',
      'Rambla Sur',
      'Punta Carretas',
      'Pocitos',
      'Buceo',
      'Malvín',
      'Carrasco',
    ],
    frecPicoMin: 6,
    frecValleMin: 10,
    capacidad: 80,
    paradasClave: [
      'Playa del Cerro',
      'Rambla y Punta Carretas',
      'Av. Italia y Propios',
      'Bvar. Batlle',
      'Portones',
    ],
  },

  {
    lineId: '128',
    empresa: 'Cutcsa',
    nombreComercial: 'Lín. 128 Rambla-Carrasco',
    terminalA: 'Rambla',
    terminalB: 'Portones de Carrasco',
    zonasServidas: ['Rambla', 'Pocitos', 'Punta Gorda', 'Malvín', 'Carrasco'],
    frecPicoMin: 10,
    frecValleMin: 18,
    capacidad: 75,
    paradasClave: ['Rambla', 'Pocitos', 'Malvín', 'Carrasco', 'Portones'],
  },

  {
    lineId: '137',
    empresa: 'Cutcsa',
    nombreComercial: 'Lín. 137 Portones-Centro',
    terminalA: 'Portones de Carrasco',
    terminalB: 'Centro',
    zonasServidas: ['Portones', 'Carrasco', 'Punta Gorda', 'Pocitos', 'Centro'],
    frecPicoMin: 12,
    frecValleMin: 20,
    capacidad: 75,
    paradasClave: ['Portones', 'Carrasco', 'Pocitos', 'Centro'],
  },

  // ══════════════ COETC ══════════════════════════════════════════════════════

  {
    lineId: 'G1',
    empresa: 'COETC',
    nombreComercial: 'COETC G1 Cerro-Centro',
    terminalA: 'Cerro (Villa del Cerro)',
    terminalB: 'Centro (18 de Julio)',
    zonasServidas: ['Cerro', 'Villa del Cerro', 'Paso del Molino', 'Centro', '18 de Julio'],
    frecPicoMin: 12,
    frecValleMin: 20,
    capacidad: 75,
    paradasClave: ['Villa del Cerro', 'Paso del Molino', 'Centro', '18 de Julio'],
  },

  {
    lineId: 'G2',
    empresa: 'COETC',
    nombreComercial: 'COETC G2 Cerro-Pocitos',
    terminalA: 'Cerro',
    terminalB: 'Pocitos',
    zonasServidas: ['Cerro', 'Centro', 'Cordón', 'Pocitos'],
    frecPicoMin: 15,
    frecValleMin: 22,
    capacidad: 75,
    paradasClave: ['Cerro', 'Centro', 'Pocitos'],
  },

  {
    lineId: 'G3',
    empresa: 'COETC',
    nombreComercial: 'COETC G3 Maroñas-Ciudad Vieja',
    terminalA: 'Maroñas',
    terminalB: 'Ciudad Vieja',
    zonasServidas: ['Maroñas', 'Belloni', 'Av. Italia', '18 de Julio', 'Ciudad Vieja'],
    frecPicoMin: 12,
    frecValleMin: 20,
    capacidad: 75,
    paradasClave: ['Maroñas', 'Av. Italia', '18 de Julio', 'Ciudad Vieja'],
  },

  {
    lineId: 'G4',
    empresa: 'COETC',
    nombreComercial: 'COETC G4 Malvín-Centro',
    terminalA: 'Malvín',
    terminalB: 'Centro',
    zonasServidas: ['Malvín', 'Pocitos', 'Bvar. Artigas', 'Centro'],
    frecPicoMin: 12,
    frecValleMin: 20,
    capacidad: 75,
    paradasClave: ['Malvín', 'Pocitos', 'Bvar. Artigas', '18 de Julio'],
  },

  {
    lineId: 'G5',
    empresa: 'COETC',
    nombreComercial: 'COETC G5 Peñarol-Centro',
    terminalA: 'Peñarol',
    terminalB: 'Centro (18 de Julio)',
    zonasServidas: ['Peñarol', 'Goes', 'Mendoza', '18 de Julio', 'Centro'],
    frecPicoMin: 14,
    frecValleMin: 22,
    capacidad: 75,
    paradasClave: ['Peñarol', 'Goes', 'Mendoza', '18 de Julio'],
  },

  // ══════════════ COME ════════════════════════════════════════════════════════

  {
    lineId: 'M1',
    empresa: 'COME',
    nombreComercial: 'COME M1 Ciudad de la Costa-Centro',
    terminalA: 'El Pinar (Ciudad de la Costa)',
    terminalB: 'Centro Montevideo',
    zonasServidas: [
      'El Pinar',
      'Ciudad de la Costa',
      'Ruta Interbalnearia',
      'Ciudad Vieja',
      'Centro',
    ],
    frecPicoMin: 20,
    frecValleMin: 30,
    capacidad: 85,
    paradasClave: ['El Pinar', 'Ciudad de la Costa', 'Bola de Nieve', 'Ciudad Vieja', 'Centro'],
  },

  {
    lineId: 'M2',
    empresa: 'COME',
    nombreComercial: 'COME M2 Pando-Montevideo',
    terminalA: 'Pando',
    terminalB: 'Terminal Tres Cruces',
    zonasServidas: ['Pando', 'Ruta 8', 'Baltasar Brum', 'Tres Cruces'],
    frecPicoMin: 25,
    frecValleMin: 40,
    capacidad: 85,
    paradasClave: ['Pando', 'Ruta 8', 'Baltasar Brum', 'Tres Cruces'],
  },

  // ══════════════ COPSA (Departamental) ═══════════════════════════════════════

  {
    lineId: 'C1',
    empresa: 'Copsa',
    nombreComercial: 'Copsa C1 Montevideo-Canelones',
    terminalA: 'Terminal Tres Cruces (Montevideo)',
    terminalB: 'Canelones / San Ramón',
    zonasServidas: ['Tres Cruces', 'Ruta 8', 'Sauce', 'San Ramón', 'Canelones'],
    frecPicoMin: 25,
    frecValleMin: 40,
    capacidad: 45,
    paradasClave: ['Tres Cruces', 'Baltasar Brum', 'Empalme Olmos', 'Sauce', 'San Ramón'],
  },

  {
    lineId: 'C6',
    empresa: 'Copsa',
    nombreComercial: 'Copsa C6 Interbalnearia-Costa',
    terminalA: 'Ruta Interbalnearia',
    terminalB: 'El Pinar / Ciudad de la Costa',
    zonasServidas: ['Ruta Interbalnearia', 'Ciudad de la Costa', 'El Pinar'],
    frecPicoMin: 22,
    frecValleMin: 35,
    capacidad: 45,
    paradasClave: ['Ruta Interbalnearia', 'Ciudad de la Costa', 'El Pinar'],
  },

  {
    lineId: '721',
    empresa: 'Copsa',
    nombreComercial: 'Copsa 721 Costa-Montevideo',
    terminalA: 'El Pinar',
    terminalB: 'Montevideo (Tres Cruces)',
    zonasServidas: ['El Pinar', 'Ciudad de la Costa', 'Ruta Interbalnearia', 'Montevideo'],
    frecPicoMin: 20,
    frecValleMin: 30,
    capacidad: 45,
    paradasClave: ['El Pinar', 'Ciudad de la Costa', 'Bola de Nieve', 'Tres Cruces'],
  },

  {
    lineId: '722',
    empresa: 'Copsa',
    nombreComercial: 'Copsa 722 Interbalnearia',
    terminalA: 'Atlántida',
    terminalB: 'Montevideo (Tres Cruces)',
    zonasServidas: ['Atlántida', 'Ruta Interbalnearia', 'Ciudad de la Costa', 'Tres Cruces'],
    frecPicoMin: 25,
    frecValleMin: 40,
    capacidad: 45,
    paradasClave: ['Atlántida', 'Ruta Interbalnearia', 'Ciudad de la Costa', 'Tres Cruces'],
  },

  // ══════════════ Otros operadores ════════════════════════════════════════════

  {
    lineId: '161',
    empresa: 'Copsa',
    nombreComercial: 'Copsa 161 Instrucciones-Centro',
    terminalA: 'Instrucciones y Belloni',
    terminalB: 'Centro Montevideo',
    zonasServidas: ['Instrucciones', 'Belloni', 'Av. Italia', 'Centro'],
    frecPicoMin: 15,
    frecValleMin: 25,
    capacidad: 75,
    paradasClave: ['Instrucciones', 'Belloni', 'Av. Italia', 'Centro'],
  },

  {
    lineId: '162',
    empresa: 'Copsa',
    nombreComercial: 'Copsa 162 Belloni-Centro',
    terminalA: 'Belloni',
    terminalB: 'Centro Montevideo',
    zonasServidas: ['Belloni', 'Av. Italia', 'Costa de Oro', 'Centro'],
    frecPicoMin: 18,
    frecValleMin: 28,
    capacidad: 75,
    paradasClave: ['Belloni', 'Av. Italia', 'Centro'],
  },

  {
    lineId: '163',
    empresa: 'Copsa',
    nombreComercial: 'Copsa 163 Instrucciones-Belloni',
    terminalA: 'Instrucciones',
    terminalB: 'Belloni',
    zonasServidas: ['Instrucciones', 'Belloni'],
    frecPicoMin: 20,
    frecValleMin: 35,
    capacidad: 75,
    paradasClave: ['Instrucciones', 'Belloni'],
  },

  {
    lineId: 'Rubricay',
    empresa: 'Rubricay',
    nombreComercial: 'Rubricay Ruta 8',
    terminalA: 'Montevideo',
    terminalB: 'Interior (Ruta 8)',
    zonasServidas: ['Ruta 8', 'Sauce', 'San Ramón'],
    frecPicoMin: 40,
    frecValleMin: 60,
    capacidad: 45,
    paradasClave: ['Baltasar Brum', 'Ruta 8', 'Sauce', 'San Ramón'],
  },

  {
    lineId: 'G',
    empresa: 'Gómez',
    nombreComercial: 'Gómez Ruta 1-Géant',
    terminalA: 'Ruta 1',
    terminalB: 'Géant (Las Piedras)',
    zonasServidas: ['Ruta 1', 'Paso de la Arena', 'Géant'],
    frecPicoMin: 20,
    frecValleMin: 35,
    capacidad: 40,
    paradasClave: ['Ruta 1', 'Paso de la Arena', 'Géant'],
  },

  // ──── Líneas faltantes — completadas v2 (rivales verificados L17 y L316) ─────

  // Rival de Línea 17 (Casabó–Punta Carretas): corredor Ciudad Vieja / 18J / Pocitos
  {
    lineId: '117',
    empresa: 'Cutcsa',
    nombreComercial: 'Lín. 117 Ciudad Vieja-Pocitos',
    terminalA: 'Ciudad Vieja',
    terminalB: 'Pocitos',
    zonasServidas: ['Ciudad Vieja', 'Centro', '18 de Julio', 'Cordón', 'Pocitos'],
    frecPicoMin: 12,
    frecValleMin: 20,
    capacidad: 80,
    paradasClave: ['Ciudad Vieja (Aduana)', '18 de Julio y Ejido', 'Cordón', 'Pocitos'],
  },

  // Rivales de Línea 316 (Cno. Maldonado–Pocitos): corredor Av. Millán / Garzón
  {
    lineId: '186',
    empresa: 'Cutcsa',
    nombreComercial: 'Lín. 186 Millán-Pocitos',
    terminalA: 'Av. Millán (Cno. Maldonado)',
    terminalB: 'Pocitos (Bvar. España)',
    zonasServidas: ['Cno. Maldonado', 'Aparicio Saravia', 'Av. Millán', 'Garzón', 'Pocitos'],
    frecPicoMin: 10,
    frecValleMin: 18,
    capacidad: 80,
    paradasClave: [
      'Cno. Maldonado y Aparicio Saravia',
      'Av. Millán y Garzón',
      'Pocitos (Bvar. España)',
    ],
  },

  {
    lineId: '187',
    empresa: 'Cutcsa',
    nombreComercial: 'Lín. 187 Millán-Pocitos (vía Instrucciones)',
    terminalA: 'Av. Millán',
    terminalB: 'Pocitos',
    zonasServidas: ['Av. Millán', 'Instrucciones', 'Pocitos'],
    frecPicoMin: 12,
    frecValleMin: 20,
    capacidad: 75,
    paradasClave: ['Av. Millán y Larrañaga', 'Instrucciones y Larrañaga', 'Pocitos'],
  },

  {
    lineId: '188',
    empresa: 'Cutcsa',
    nombreComercial: 'Lín. 188 Garzón-Pocitos',
    terminalA: 'Garzón',
    terminalB: 'Pocitos',
    zonasServidas: ['Garzón', 'Av. Rivera', 'Pocitos'],
    frecPicoMin: 15,
    frecValleMin: 25,
    capacidad: 75,
    paradasClave: ['Garzón y Av. Rivera', 'Pocitos (Bvar. España)'],
  },

  // ──── Líneas faltantes — completada v3 (rival verificado L328) ─────────────────

  // Rival de Línea 328 (Punta Carretas–Mendoza): Dinata corredor Goes → Mendoza / 18 de Julio
  {
    lineId: 'D1',
    empresa: 'Dinata',
    nombreComercial: 'Dinata D1 — 18 de Julio / Mendoza',
    terminalA: '18 de Julio (Centro)',
    terminalB: 'Mendoza (Est. Goes)',
    zonasServidas: ['18 de Julio', 'Goes', 'Mendoza'],
    frecPicoMin: 20,
    frecValleMin: 30,
    capacidad: 60,
    paradasClave: ['18 de Julio y Ejido', '18 de Julio y Yi', 'Goes y Mendoza'],
  },
];

// ─── Motor de Inteligencia Competitiva ─────────────────────────────────────────

export class CompetitorIntelligenceEngine {
  /**
   * Calcula el score de amenaza competitiva (0-100) dado:
   * - solapamiento de recorrido/destino
   * - ventaja/desventaja de frecuencia
   * - capacidad del rival
   */
  static calcularScoreAmenaza(
    solapamientoPct: number,
    frecUCOTPicoMin: number,
    frecRivalPicoMin: number,
    capacidadRival: number,
  ): number {
    if (frecRivalPicoMin <= 0 || frecUCOTPicoMin <= 0) return Math.round(solapamientoPct * 0.5);

    // Factor de frecuencia: 0=UCOT es mucho mejor, 1=igual, >1=rival es mejor
    const factorFrec = frecUCOTPicoMin / frecRivalPicoMin;
    // Normalizado: 1 si igual, 0 si UCOT el doble de rápida, 2 si rival el doble de rápida
    const freqScore = Math.min(factorFrec * 50, 100);

    // Factor de solapamiento: directo (ya es 0-100)
    const solapScore = solapamientoPct;

    // Factor capacidad: si rival tiene más capacidad, mayor amenaza
    const capacScore = Math.min((capacidadRival / 80) * 20, 20); // máx 20 puntos

    // Ponderación: solapamiento 50%, frecuencia 40%, capacidad 10%
    return Math.min(Math.round(solapScore * 0.5 + freqScore * 0.4 + capacScore * 0.1), 100);
  }

  // ─── Helpers de Normalización y Similaridad ─────────────────────────────────

  /**
   * Normaliza un string para comparación robusta:
   * elimina acentos, prefijos viales y caracteres especiales.
   */
  private static normalizar(s: string): string {
    return s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\b(av\.|cno\.|bvar\.|blvd\.|est\.|int\.?)\s*/gi, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extrae tokens significativos (>= 3 chars, sin stop-words).
   */
  private static tokenizar(s: string): string[] {
    const STOP = new Set([
      'de',
      'la',
      'el',
      'los',
      'las',
      'y',
      'e',
      'del',
      'al',
      'a',
      'en',
      'por',
      'con',
    ]);
    return CompetitorIntelligenceEngine.normalizar(s)
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !STOP.has(t));
  }

  /**
   * Score de similitud [0, 1] entre dos strings.
   * Estrategias: exacto → contención → Jaccard por tokens.
   */
  private static similitud(a: string, b: string): number {
    const na = CompetitorIntelligenceEngine.normalizar(a);
    const nb = CompetitorIntelligenceEngine.normalizar(b);
    if (na === nb) return 1.0;
    if (na.includes(nb) || nb.includes(na)) return 0.9;
    const ta = new Set(CompetitorIntelligenceEngine.tokenizar(a));
    const tb = new Set(CompetitorIntelligenceEngine.tokenizar(b));
    if (ta.size === 0 || tb.size === 0) return 0;
    let inter = 0;
    ta.forEach((t) => {
      if (tb.has(t)) inter++;
    });
    return inter / (ta.size + tb.size - inter);
  }

  /** Devuelve true si dos lugares son el mismo con el umbral dado. */
  private static sonMismoLugar(a: string, b: string, umbral = 0.45): boolean {
    return CompetitorIntelligenceEngine.similitud(a, b) >= umbral;
  }

  /**
   * Detecta competidores automáticamente para una línea UCOT
   * (algoritmo de nivel internacional — 4 capas de detección)
   */
  static detectarCompetidores(lineaUCOT: {
    lineId: string;
    terminalA: string;
    terminalB: string;
    zonasServidas: string[];
    frecPicoMin: number;
    rivalesVerificados?: Array<{
      lineId: string;
      solapamientoPct: number;
      tramoCompartido: string;
      frecuenciaRivalMin?: number;
    }>;
  }, sentido: 'A' | 'B' | 'GLOBAL' = 'GLOBAL'): AnalisisCompetitivo[] {
    const resultados: AnalisisCompetitivo[] = [];

    // Mapa de rivales verificados (fuente prioritaria de solapamiento real)
    const rivalesMap = new Map((lineaUCOT.rivalesVerificados ?? []).map((r) => [r.lineId, r]));

    const terminalesUCOT = 
      sentido === 'A' ? [lineaUCOT.terminalA] : 
      sentido === 'B' ? [lineaUCOT.terminalB] : 
      [lineaUCOT.terminalA, lineaUCOT.terminalB];

    // Umbral dinámico: líneas con pocas zonas requieren menos puntos de contacto, pero mínimo 2 para que sea un "tramo" real
    const umbralZonas = Math.max(2, Math.floor(lineaUCOT.zonasServidas.length * 0.3));

    for (const rival of RED_STM_COMPETIDORES) {
      const terminalesRival = [rival.terminalA, rival.terminalB];

      // Capa 1: Destino compartido (matching por similitud estricta)
      const destinoCompartido = terminalesUCOT.some((tU) =>
        terminalesRival.some((tR) => CompetitorIntelligenceEngine.sonMismoLugar(tU, tR, 0.7)),
      );

      // Capa 2: Zonas de recorrido compartidas
      const zonasCompartidas = lineaUCOT.zonasServidas.filter((zU) =>
        rival.zonasServidas.some((zR) => CompetitorIntelligenceEngine.sonMismoLugar(zU, zR, 0.75)),
      );

      // Capa 3: Paradas clave del rival que caen en zonas UCOT
      const paradasEnCorredor = lineaUCOT.zonasServidas.filter((zU) =>
        rival.paradasClave.some((pR) => CompetitorIntelligenceEngine.sonMismoLugar(zU, pR, 0.75)),
      );

      const puntosContacto = [...new Set([...zonasCompartidas, ...paradasEnCorredor])];

      // Decisión de relevancia
      const tieneRivalVerificado = rivalesMap.has(rival.lineId);
      const esRelevante =
        destinoCompartido || puntosContacto.length >= umbralZonas || tieneRivalVerificado;

      if (!esRelevante) continue;

      // Tipo de competencia
      let tipoCompetencia: AnalisisCompetitivo['tipoCompetencia'];
      if (destinoCompartido && puntosContacto.length >= umbralZonas) {
        tipoCompetencia = 'AMBOS';
      } else if (destinoCompartido) {
        tipoCompetencia = 'DESTINO_COMPARTIDO';
      } else {
        tipoCompetencia = 'TRAMO_COMPARTIDO';
      }

      // Solapamiento: verificado > estimado
      const rivalVerif = rivalesMap.get(rival.lineId);
      const solapamiento =
        rivalVerif?.solapamientoPct ??
        Math.min(
          Math.round(
            (puntosContacto.length / Math.max(lineaUCOT.zonasServidas.length, 1)) * 100 +
              (destinoCompartido ? 20 : 0),
          ),
          95,
        );

      const frecRival = rivalVerif?.frecuenciaRivalMin ?? rival.frecPicoMin;
      const scoreAmenaza = CompetitorIntelligenceEngine.calcularScoreAmenaza(
        solapamiento,
        lineaUCOT.frecPicoMin,
        frecRival,
        rival.capacidad,
      );

      let nivelAlerta: AnalisisCompetitivo['nivelAlerta'];
      if (scoreAmenaza >= 70) nivelAlerta = 'CRITICO';
      else if (scoreAmenaza >= 50) nivelAlerta = 'ALTO';
      else if (scoreAmenaza >= 30) nivelAlerta = 'MEDIO';
      else nivelAlerta = 'BAJO';

      const ventajaFrec = lineaUCOT.frecPicoMin < frecRival;
      const desventajaFrec = lineaUCOT.frecPicoMin > frecRival;
      const diferenciaFrec = Math.abs(lineaUCOT.frecPicoMin - frecRival);

      const descripcionTipo =
        tipoCompetencia === 'AMBOS'
          ? 'mismo destino Y recorrido compartido'
          : tipoCompetencia === 'DESTINO_COMPARTIDO'
            ? 'mismo destino final'
            : 'tramo compartido';

      const analisis = [
        `${rival.empresa} Lín.${rival.lineId} (${rival.nombreComercial}) — ${descripcionTipo}.`,
        puntosContacto.length > 0
          ? `Puntos de contacto: ${puntosContacto.slice(0, 4).join(', ')}.`
          : '',
        ventajaFrec
          ? `✅ UCOT supera en frecuencia (c/${lineaUCOT.frecPicoMin}m vs c/${frecRival}m — ${diferenciaFrec}m de ventaja).`
          : desventajaFrec
            ? `⚠️ Rival supera en frecuencia (c/${frecRival}m vs UCOT c/${lineaUCOT.frecPicoMin}m — ${diferenciaFrec}m de desventaja).`
            : `Frecuencias similares (c/${frecRival}m).`,
        solapamiento >= 60
          ? `Alta superposición (${solapamiento}%): disputa directa de pasajeros.`
          : '',
      ]
        .filter(Boolean)
        .join(' ');

      let recomendacion: string;
      if (nivelAlerta === 'CRITICO') {
        recomendacion = desventajaFrec
          ? `URGENTE: Reducir headway a <${Math.max(frecRival - 2, 5)}min en: ${puntosContacto[0] ?? 'corredor'}. Evaluar refuerzo de coche.`
          : `Mantener ventaja de frecuencia. Reforzar calidad en: ${puntosContacto.slice(0, 2).join(', ')}.`;
      } else if (nivelAlerta === 'ALTO') {
        recomendacion = `Monitorear captación en ${puntosContacto[0] ?? 'corredor'}. Ajustar horario si rival captura demanda pico. UCOT ${lineaUCOT.frecPicoMin}m vs rival ${frecRival}m.`;
      } else if (nivelAlerta === 'MEDIO') {
        recomendacion = `Rev. mensual. Verificar oferta UCOT en: ${puntosContacto.slice(0, 2).join(', ') || 'puntos compartidos'}.`;
      } else {
        recomendacion = `Competencia baja (score ${scoreAmenaza}/100). Mantener estándar actual.`;
      }

      resultados.push({
        rivalLineId: rival.lineId,
        rivalEmpresa: rival.empresa,
        rivalNombre: rival.nombreComercial,
        tipoCompetencia,
        solapamientoRecorridoPct: solapamiento,
        puntosCompetencia: puntosContacto,
        frecRivalPicoMin: frecRival,
        scoreAmenaza,
        nivelAlerta,
        analisis,
        recomendacion,
      });
    }

    // Ordenar por score de amenaza descendente
    return resultados.sort((a, b) => b.scoreAmenaza - a.scoreAmenaza);
  }

  /**
   * Genera reporte ejecutivo de inteligencia competitiva para una línea UCOT
   */
  static generarReporte(
    lineaUCOT: Parameters<typeof CompetitorIntelligenceEngine.detectarCompetidores>[0],
    lineaNombre: string,
    sentido: 'A' | 'B' | 'GLOBAL' = 'GLOBAL'
  ): ReporteInteligenciaCompetitiva {
    const competidores = CompetitorIntelligenceEngine.detectarCompetidores(lineaUCOT, sentido);

    // Score de riesgo global (promedio ponderado de los 3 rivales más amenazantes)
    const top3 = competidores.slice(0, 3);
    const scoreRiesgo =
      top3.length > 0
        ? Math.round(
            top3.reduce((sum, c, i) => sum + c.scoreAmenaza * (1 - i * 0.2), 0) /
              top3.reduce((sum, _, i) => sum + (1 - i * 0.2), 0),
          )
        : 0;

    // Posición competitiva global
    let posicion: ReporteInteligenciaCompetitiva['pozicionCompetitivaGlobal'];
    if (scoreRiesgo < 25) posicion = 'LIDER';
    else if (scoreRiesgo < 50) posicion = 'COMPETITIVA';
    else if (scoreRiesgo < 70) posicion = 'VULNERABLE';
    else posicion = 'CRITICA';

    const amenazaPrincipal = competidores[0] ?? null;

    // Acciones prioritarias
    const accionesPrioritarias: string[] = [];
    const criticos = competidores.filter((c) => c.nivelAlerta === 'CRITICO');
    const altos = competidores.filter((c) => c.nivelAlerta === 'ALTO');

    if (criticos.length > 0) {
      accionesPrioritarias.push(
        `🔴 ACCIÓN INMEDIATA: ${criticos.length} rival(es) crítico(s) — ${criticos.map((c) => `${c.rivalLineId} (${c.rivalEmpresa})`).join(', ')}`,
      );
    }
    if (altos.length > 0) {
      accionesPrioritarias.push(
        `🟡 MONITOREO: ${altos.length} rival(es) de alto impacto — ${altos.map((c) => c.rivalLineId).join(', ')}`,
      );
    }
    if (competidores.some((c) => c.tipoCompetencia === 'AMBOS')) {
      accionesPrioritarias.push(
        `⚔️ COMPETENCIA TOTAL: Rivales con mismo destino Y recorrido — priorizar diferenciación de servicio.`,
      );
    }
    if (accionesPrioritarias.length === 0) {
      accionesPrioritarias.push(
        `✅ Posición competitiva saludable. Mantener frecuencias y calidad de servicio.`,
      );
    }

    const resumenEjecutivo =
      `📍 ${lineaNombre} | ` +
      `⚔️ ${competidores.length} competidores detectados | ` +
      `🎯 Score riesgo: ${scoreRiesgo}/100 | ` +
      `📊 Posición: ${posicion} | ` +
      (amenazaPrincipal
        ? `⚠️ Mayor amenaza: ${amenazaPrincipal.rivalLineId} (${amenazaPrincipal.rivalEmpresa}) — Score ${amenazaPrincipal.scoreAmenaza}`
        : `✅ Sin amenazas significativas`);

    return {
      lineaUCOT: lineaUCOT.lineId,
      timestamp: new Date(),
      competidoresDetectados: competidores,
      scoreRiesgoMercado: scoreRiesgo,
      pozicionCompetitivaGlobal: posicion,
      amenazaPrincipal,
      resumenEjecutivo,
      accionesPrioritarias,
    };
  }

  /**
   * Deriva el TipoDia a partir de una fecha.
   * 0=Dom → DOMINGO | 6=Sáb → SABADO | 1-5 → HABIL
   */
  static getTipoDia(fecha: Date): TipoDia {
    const dow = fecha.getDay();
    if (dow === 0) return 'DOMINGO';
    if (dow === 6) return 'SABADO';
    return 'HABIL';
  }

  /**
   * Calcula alertas horarias: compara franjas UCOT vs rivales y recomienda
   * cuántos minutos adelantar la salida para ganar pasajeros.
   * El cálculo es consciente del tipo de día (Hábil / Sábado / Domingo).
   *
   * @param frecuenciasUCOT  Franjas de servicio de la línea UCOT
   * @param competidores     Lista de competidores detectados (del reporte)
   * @param tipoDia          Tipo de día para ajustar frecuencias (default: HABIL)
   * @returns lista de alertas ordenadas por urgencia
   */
  static calcularAlertasHorarias(
    frecuenciasUCOT: HorarioFranja[],
    competidores: AnalisisCompetitivo[],
    tipoDia: TipoDia = 'HABIL',
  ): AlertaHoraria[] {
    const alertas: AlertaHoraria[] = [];
    const { ucot: factorUCOT, rival: factorRival } = FACTOR_FRECUENCIA[tipoDia];
    const labelDia = tipoDia === 'HABIL' ? 'día hábil' : tipoDia === 'SABADO' ? 'sábado' : 'domingo';

    // Mapa de TipoDia → códigos de día que aplican
    const DIAS_TIPO: Record<TipoDia, CodiaDia[]> = {
      HABIL:   ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      SABADO:  ['SAB'],
      DOMINGO: ['DOM'],
    };
    const diasRelevantes = DIAS_TIPO[tipoDia];

    // Solo analizar rivales de alto impacto (CRITICO o ALTO) o los 3 más amenazantes
    const rivalesRelevantes = competidores
      .filter((c) => c.nivelAlerta === 'CRITICO' || c.nivelAlerta === 'ALTO' || c.scoreAmenaza >= 40)
      .slice(0, 6);

    for (const franja of frecuenciasUCOT) {
      // ── FILTRO TEMPORAL: saltar franjas que NO aplican al día analizado ──
      if (franja.diasAplica && franja.diasAplica.length > 0) {
        const aplica = franja.diasAplica.some((d) => diasRelevantes.includes(d));
        if (!aplica) continue;
      }
      const [hIni, mIni] = franja.horaInicio.split(':').map(Number);
      const [hFin, mFin] = franja.horaFin.split(':').map(Number);
      const inicioMinutos = hIni * 60 + mIni;
      const finMinutos = hFin * 60 + mFin;

      // Frecuencia UCOT ajustada al tipo de día
      const frecUCOTAjustada = Math.round(franja.frecuenciaMin * factorUCOT);

      for (const rival of rivalesRelevantes) {
        // Buscar horario del rival en la base STM
        const lineaRival = RED_STM_COMPETIDORES.find((l) => l.lineId === rival.rivalLineId);
        const frecRivalBase = CompetitorIntelligenceEngine.estimarFrecRivalEnFranja(
          lineaRival,
          rival.frecRivalPicoMin,
          inicioMinutos,
          finMinutos,
        );
        // Ajustar frecuencia del rival al tipo de día
        const frecRivalAjustada = Math.round(frecRivalBase * factorRival);

        const desventajaFrec = frecUCOTAjustada - frecRivalAjustada;
        // Si rival es más frecuente o similar, hay colisión táctica relevante
        if (desventajaFrec > -5) {
          let nivelColision: AlertaHoraria['nivelColision'];
          let minutosAdelantar: number;
          let tactica: string;

          const desv = Math.abs(desventajaFrec);

          if (desventajaFrec >= 10) {
            // Rival muy más frecuente — colisión crítica
            nivelColision = 'CRITICA';
            minutosAdelantar = Math.min(12, Math.round(frecRivalAjustada * 0.4));
            tactica = `🔴 Colisión crítica (${labelDia}): rival sale cada ${frecRivalAjustada}min vs nuestros ${frecUCOTAjustada}min. Adelantar salida ${minutosAdelantar} min captura usuarios antes de que llegue ${rival.rivalEmpresa} L.${rival.rivalLineId}.`;
          } else if (desventajaFrec >= 3) {
            // Rival algo más frecuente — colisión alta
            nivelColision = 'ALTA';
            minutosAdelantar = Math.min(8, Math.round(frecRivalAjustada * 0.25));
            tactica = `🟠 Adelantar ${minutosAdelantar} min (${labelDia}) permite salir antes que ${rival.rivalEmpresa} L.${rival.rivalLineId} (${frecRivalAjustada}min/vuelta). Ventana táctica recomendada en franja ${franja.label}.`;
          } else if (desventajaFrec >= -4) {
            // Frecuencias similares — colisión media, riesgo de "pegarse"
            nivelColision = 'MEDIA';
            minutosAdelantar = 3;
            tactica = `🟡 Rival ${rival.rivalEmpresa} L.${rival.rivalLineId} opera con frecuencia similar en ${labelDia} (${frecRivalAjustada}min). Salir ${minutosAdelantar} min antes evita competir por el mismo grupo en paradas: ${rival.puntosCompetencia.slice(0, 2).join(', ') || 'tramo compartido'}.`;
          } else {
            // UCOT ligeramente más frecuente pero rival amenaza por capacidad
            nivelColision = 'BAJA';
            minutosAdelantar = 0;
            tactica = `✅ UCOT supera frecuencia en ${labelDia} (+${desv}min de ventaja). Mantener horario actual en ${franja.label}. Monitorear captación vs ${rival.rivalEmpresa} L.${rival.rivalLineId}.`;
          }

          alertas.push({
            franja: franja.label,
            horaInicio: franja.horaInicio,
            horaFin: franja.horaFin,
            rivalEmpresa: rival.rivalEmpresa,
            rivalLineId: rival.rivalLineId,
            frecUCOTMin: frecUCOTAjustada,
            frecRivalMin: frecRivalAjustada,
            desventajaFrecMin: desventajaFrec,
            nivelColision,
            minutosAdelantar,
            tactica,
          });
        }
      }
    }

    // Ordenar: primero críticas, luego por hora de inicio
    return alertas.sort((a, b) => {
      const prioridad = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAJA: 3 };
      const pA = prioridad[a.nivelColision];
      const pB = prioridad[b.nivelColision];
      if (pA !== pB) return pA - pB;
      return a.horaInicio.localeCompare(b.horaInicio);
    });
  }

  /**
   * Estima la frecuencia del rival en una franja horaria específica.
   * Si la línea rival tiene horarios propios los usa; si no, estima
   * por pico (06:00-09:00 y 17:00-20:00) vs valle.
   */
  private static estimarFrecRivalEnFranja(
    lineaRival: LineaSTM | undefined,
    frecPicoDefault: number,
    inicioMin: number,
    finMin: number,
  ): number {
    if (lineaRival?.horarios) {
      // Buscar franja rival que se solape con la nuestra
      const mejor = lineaRival.horarios.find((h) => {
        const [hI, mI] = h.horaInicio.split(':').map(Number);
        const [hF, mF] = h.horaFin.split(':').map(Number);
        const hImin = hI * 60 + mI;
        const hFmin = hF * 60 + mF;
        // Superposición temporal
        return hImin < finMin && hFmin > inicioMin;
      });
      if (mejor) return mejor.frecuenciaMin;
    }

    // Heurística: pico mañana 6-9h y pico tarde 17-20h
    const esPico =
      (inicioMin >= 360 && inicioMin < 540) ||
      (inicioMin >= 1020 && inicioMin < 1200);
    return esPico ? frecPicoDefault : Math.round(frecPicoDefault * 1.6);
  }
}
