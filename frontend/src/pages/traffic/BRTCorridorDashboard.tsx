/**
 * BRTCorridorDashboard — Estrategia UCOT ante el BRT Metropolitano 2027-2029
 *
 * Datos reales (abril 2026):
 * - US$490M de inversión (MTOP + BID + CAF)
 * - Línea A: Zonamérica → 8 de Octubre → Tres Cruces → 18 de Julio → Pza. Independencia
 * - Línea B: El Pinar → Giannattasio → Av. Italia → Tres Cruces → 18 de Julio → Pza. Independencia
 * - Intercambiador Tres Cruces subterráneo (2 niveles)
 * - Inicio obras: enero 2027. Sistema operativo: 2029
 * - Nuevo modelo: pago por km recorrido (no por pasajero)
 * - Buses biarticulados 170-220 pax — propiedad del Estado (ASM)
 */

import { useState, useMemo, useEffect } from 'react';
import { apiClient } from '../../clients/apiClient';
import { MapContainer, TileLayer, Polyline, Marker, Popup, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Train,
  AlertTriangle,
  TrendingUp,
  Clock,
  MapPin,
  DollarSign,
  Bus,
  Zap,
  ArrowRight,
  CheckCircle,
  XCircle,
  Calendar,
  BarChart3,
  Route,
  ShieldCheck,
  Info,
  Globe,
  Wrench,
  Play,
  Building2,
  Star,
  Users,
  Award,
  ChevronRight,
  RefreshCw,
  Layers,
} from 'lucide-react';

// ─── DATOS REALES BRT MONTEVIDEO ───────────────────────────────────────────────

const BRT_META = {
  inversion: 490,            // millones USD (MTOP, 2026)
  inicioObras: 'Enero 2027',
  operativoEstimado: 2029,
  capacidadBiarticulado: 220, // pasajeros por unidad
  nodoTresCruces: 'Subterráneo 2 niveles — Plaza de la Bandera',
  pago18Jul: '10-11 min Tres Cruces → Pza. Independencia',
};

// FASE 5.21: ELIMINADAS las coordenadas de trazado dibujadas a mano
// (TRAMO_18_JULIO y los `trayecto` de cada corredor). El trazado ahora es
// el shape GTFS oficial IMM de la línea troncal de referencia, traído por
// /api/comando/shape-linea/:linea — sin geometría fabricada.

const CORREDORES = [
  {
    id: 'A',
    // Línea troncal real cuyo shape GTFS oficial IMM representa el corredor
    // (sustituye el trazado dibujado a mano que pasaba sobre edificios).
    lineaRef: '316',
    nombre: 'Línea A — 8 de Octubre',
    subtitulo: 'Zonamérica → Camino Maldonado → Av. 8 de Octubre → Tres Cruces → 18 de Julio → Pza. Independencia',
    color: '#ef4444',
    colorBg: 'bg-red-500',
    colorText: 'text-red-400',
    colorBorder: 'border-red-700/40',
    kmTroncal: 24,
    tiempoActualMin: 68,
    tiempoBRTMin: 38,
    pasajerosDiaDireccion: 45000,
    niveles: [-2],
    paradas: [
      { nombre: 'Zonamérica', lat: -34.8552, lng: -55.9628, tipo: 'terminal' },
      { nombre: 'Camino Maldonado km 14', lat: -34.8618, lng: -55.9802, tipo: 'intermedia' },
      { nombre: 'Belloni / Pan de Azúcar', lat: -34.8688, lng: -55.9990, tipo: 'nodo' },
      { nombre: '8 de Octubre / Av. Italia', lat: -34.8800, lng: -56.0440, tipo: 'intercambio' },
      { nombre: 'Propios / 8 de Octubre', lat: -34.8843, lng: -56.0728, tipo: 'intermedia' },
      { nombre: 'Dr. Luis Morquio', lat: -34.8886, lng: -56.0998, tipo: 'intermedia' },
      { nombre: 'Tres Cruces ↓ (nivel -2)', lat: -34.8963, lng: -56.1503, tipo: 'intercambiador' },
      { nombre: 'Plaza de los 33 / Ejido', lat: -34.9025, lng: -56.1565, tipo: 'intermedia' },
      { nombre: 'Plaza Fabini', lat: -34.9061, lng: -56.1840, tipo: 'intermedia' },
      { nombre: 'Explanada Municipal', lat: -34.9057, lng: -56.1778, tipo: 'intermedia' },
      { nombre: 'Plaza Independencia', lat: -34.9065, lng: -56.1972, tipo: 'terminal' },
    ],
    lineasUCOTAfectadas: [
      { linea: '316', nombre: 'Cno. Maldonado Km16 - Pocitos', overlap: 'TOTAL', km: 18, estrategia: 'Alimentadora norte ↔ nodo Belloni' },
      { linea: '300', nombre: 'Instrucciones - Plaza Zitarrosa', overlap: 'PARCIAL', km: 9, estrategia: 'Alimentadora Instrucciones → Tres Cruces' },
      { linea: '306', nombre: 'Parque Roosevelt - Casabó', overlap: 'PARCIAL', km: 7, estrategia: 'Redistribución a corredor oeste' },
      { linea: '328', nombre: 'Mendoza - Punta Carretas', overlap: 'PARCIAL', km: 6, estrategia: 'Desvío por 18 de Julio → concentrar en Pocitos' },
      { linea: '329', nombre: 'Punta Carretas - Melilla', overlap: 'PARCIAL', km: 8, estrategia: 'Alimentadora este ↔ nodo 8 Oct/Italia' },
      { linea: '330', nombre: 'Instrucciones - Ciudadela', overlap: 'PARCIAL', km: 5, estrategia: 'Refuerzo zona Ciudadela post-nodo' },
    ],
  },
  {
    id: 'B',
    lineaRef: '329',
    nombre: 'Línea B — Giannattasio / Av. Italia',
    subtitulo: 'El Pinar → Ruta Interbalnearia / Giannattasio → Av. Italia → Tres Cruces → 18 de Julio → Pza. Independencia',
    color: '#3b82f6',
    colorBg: 'bg-blue-500',
    colorText: 'text-blue-400',
    colorBorder: 'border-blue-700/40',
    kmTroncal: 34,
    tiempoActualMin: 82,
    tiempoBRTMin: 48,
    pasajerosDiaDireccion: 38000,
    niveles: [-1],
    paradas: [
      { nombre: 'El Pinar', lat: -34.8042, lng: -55.9285, tipo: 'terminal' },
      { nombre: 'Neptunia / Giannattasio', lat: -34.8138, lng: -55.9415, tipo: 'intermedia' },
      { nombre: 'Shangrilá / Ruta Interbalnearia', lat: -34.8228, lng: -55.9548, tipo: 'nodo' },
      { nombre: 'Ciudad de la Costa / Giannattasio', lat: -34.8365, lng: -55.9715, tipo: 'intermedia' },
      { nombre: 'Av. Italia / Giannattasio', lat: -34.8508, lng: -55.9953, tipo: 'intercambio' },
      { nombre: 'Av. Italia km 10', lat: -34.8725, lng: -56.0360, tipo: 'intermedia' },
      { nombre: '8 de Octubre / Av. Italia', lat: -34.8800, lng: -56.0440, tipo: 'intercambio' },
      { nombre: 'Tres Cruces ↓ (nivel -1)', lat: -34.8963, lng: -56.1503, tipo: 'intercambiador' },
      { nombre: 'Plaza de los 33 / Ejido', lat: -34.9025, lng: -56.1565, tipo: 'intermedia' },
      { nombre: 'Plaza Fabini', lat: -34.9061, lng: -56.1840, tipo: 'intermedia' },
      { nombre: 'Plaza Independencia', lat: -34.9065, lng: -56.1972, tipo: 'terminal' },
    ],
    lineasUCOTAfectadas: [
      { linea: '221', nombre: 'Línea 221 (Metropolitana)', overlap: 'TOTAL', km: 28, estrategia: 'Redirigir como alimentadora costera → nodo Giannattasio' },
      { linea: '329', nombre: 'Punta Carretas - Melilla', overlap: 'PARCIAL', km: 12, estrategia: 'Alimentadora barrios norte Av. Italia' },
      { linea: '316', nombre: 'Cno. Maldonado Km16 - Pocitos', overlap: 'PARCIAL', km: 6, estrategia: 'Refuerzo tramo compartido' },
    ],
  },
];

// ─── MODELO FINANCIERO: PAGO POR KM ────────────────────────────────────────────

const MODELO_FINANCIERO = {
  actual: {
    tarifa: 45,                  // UYU por pasajero
    pasajerosPromDia: 480,       // por bus/día
    captacionEmpresa: 0.72,      // 72% va a la empresa (resto regulación)
    kmPromDia: 180,              // km recorridos por bus/día
    ingresoDia: 480 * 45 * 0.72, // ~15,552 UYU/bus/día
    costoDia: 12500,             // UYU costo total diario (combustible+conductor+mnto)
  },
  brt: {
    tarifaKm: 420,               // UYU por km (estimado sobre contratos existentes CUTCSA)
    kmPromDia: 220,              // más km como alimentadora (más rutas distribuidas)
    ingresoDia: 420 * 220,       // 92,400 UYU/bus/día
    costoDia: 13500,             // levemente mayor por más km
    bonusNocturno: 1.25,         // factor extra por servicios nocturnos
    riesgoMin: 0.85,             // factor si incumplen KPIs de frecuencia
    ventajas: [
      'Ingresos predecibles independiente de demanda',
      'Sin riesgo de sub-ocupación en horas valle',
      'Más km = más ingresos (incentivo a operar más)',
      'Estado absorbe riesgo de demanda',
      'Contratos más largos (8-12 años vs 3-5 actuales)',
    ],
    riesgos: [
      'Menos margen si tarifa_km queda por debajo del break-even',
      'Descuentos por incumplimiento de KPIs (puntualidad, frecuencia)',
      'Estado propietario de buses — UCOT no capitaliza flota',
      'Mayor control y auditoría por parte del regulador',
    ],
  },
};

// ─── LÍNEAS ALIMENTADORAS PROPUESTAS PARA UCOT ────────────────────────────────

const LINEAS_ALIMENTADORAS_PROPUESTAS = [
  {
    id: 'AL-A1',
    nombre: 'Alimentadora Norte Cerro / La Teja',
    descripcion: 'Conecta Cerro y La Teja directamente al nodo Tres Cruces (sin pasar por 18 de Julio)',
    recorrido: 'Cerro Comercial → Av. Lezica → La Teja → Instrucciones → Tres Cruces',
    kmEstimado: 14,
    frecuenciaMin: 8,
    corredorAlimenta: 'A',
    pasajerosEstDia: 3200,
    conductoresNecesarios: 6,
    cochesNecesarios: 4,
    viabilidad: 'ALTA',
    ingresoEstDia: 420 * 14 * (24 / 8 * 2), // km × tarifa × viajes
    lineaExistenteMigracion: '306',
  },
  {
    id: 'AL-A2',
    nombre: 'Alimentadora Zonamérica Express',
    descripcion: 'Servicio express a la zona franca y parques industriales, conectando con Línea A en nodo Belloni',
    recorrido: 'Zonamérica → Parque Tecnológico → Camino Maldonado → nodo Belloni',
    kmEstimado: 9,
    frecuenciaMin: 12,
    corredorAlimenta: 'A',
    pasajerosEstDia: 1800,
    conductoresNecesarios: 4,
    cochesNecesarios: 3,
    viabilidad: 'ALTA',
    ingresoEstDia: 420 * 9 * (24 / 12 * 2),
    lineaExistenteMigracion: '316',
  },
  {
    id: 'AL-B1',
    nombre: 'Alimentadora Costa Este',
    descripcion: 'Redistribuye tráfico costero (Shangrilá → La Floresta) hacia el corredor Giannattasio',
    recorrido: 'La Floresta → Atlántida → Shangrilá → nodo Giannattasio km 22',
    kmEstimado: 22,
    frecuenciaMin: 15,
    corredorAlimenta: 'B',
    pasajerosEstDia: 2600,
    conductoresNecesarios: 5,
    cochesNecesarios: 4,
    viabilidad: 'MEDIA',
    ingresoEstDia: 420 * 22 * (24 / 15 * 2),
    lineaExistenteMigracion: '221',
  },
  {
    id: 'AL-B2',
    nombre: 'Alimentadora Barros Blancos / Pando',
    descripcion: 'Zona de crecimiento urbano con poca cobertura actual — conecta al corredor Italia en Giannattasio',
    recorrido: 'Pando → Barros Blancos → Camino Maldonado → nodo Italia/Giannat.',
    kmEstimado: 16,
    frecuenciaMin: 10,
    corredorAlimenta: 'B',
    pasajerosEstDia: 2100,
    conductoresNecesarios: 5,
    cochesNecesarios: 3,
    viabilidad: 'MEDIA',
    ingresoEstDia: 420 * 16 * (24 / 10 * 2),
    lineaExistenteMigracion: null,
  },
  {
    id: 'AL-X1',
    nombre: 'Interconector Tres Cruces ↔ Buceo/Pocitos',
    descripcion: 'Circuito corto de alta frecuencia entre el intercambiador y las zonas de alta demanda costera',
    recorrido: 'Tres Cruces → Bvar. España → Pocitos → Buceo → Tres Cruces',
    kmEstimado: 8,
    frecuenciaMin: 5,
    corredorAlimenta: 'A+B',
    pasajerosEstDia: 5400,
    conductoresNecesarios: 8,
    cochesNecesarios: 6,
    viabilidad: 'MUY ALTA',
    ingresoEstDia: 420 * 8 * (24 / 5 * 2),
    lineaExistenteMigracion: '328',
  },
];

// ─── TIMELINE REAL ─────────────────────────────────────────────────────────────

const TIMELINE = [
  { periodo: '2026 Q1-Q2', evento: 'Proyecto ejecutivo finalizado — documentos técnicos publicados por MTOP', estado: 'completado', detalle: 'Incluye estudios geotécnicos, microsimulaciones y análisis de costos BRT vs tranvía vs metro' },
  { periodo: '2026 Q3-Q4', evento: 'Licitaciones abiertas — infraestructura, material rodante y operadores', estado: 'en_curso', detalle: 'UCOT debe presentarse como operador alimentador. Ventana crítica para posicionarse.' },
  { periodo: 'Ene 2027', evento: 'Inicio de obras de infraestructura', estado: 'pendiente', detalle: 'Carriles exclusivos 8 de Octubre y Av. Italia. Obras en Tres Cruces (intercambiador subterráneo).' },
  { periodo: '2027-2028', evento: 'Adaptación operativa UCOT — migrar líneas superpuestas', estado: 'pendiente', detalle: 'Las líneas que comparten corredor con BRT deben migrar. Ventana para diseñar alimentadoras.' },
  { periodo: '2028 Q2-Q4', evento: 'Pruebas con buses biarticulados eléctricos (170-220 pax)', estado: 'pendiente', detalle: 'Material rodante propiedad del Estado (ASM). UCOT opera bajo contrato de servicio.' },
  { periodo: '2029', evento: '🚍 Sistema BRT operativo — Nuevo modelo pago por km activo', estado: 'pendiente', detalle: 'Impacto total en UCOT. Líneas alimentadoras licitadas. Ingresos por km recorrido.' },
];

// ─── ANÁLISIS DE IMPACTO CONSOLIDADO ──────────────────────────────────────────

const todasAfectadas = [...new Set(CORREDORES.flatMap(c => c.lineasUCOTAfectadas.map(l => l.linea)))];

// ─── BENCHMARKS INTERNACIONALES BRT ──────────────────────────────────────────

const BENCHMARKS_BRT = [
  {
    ciudad: 'Bogotá — TransMilenio', pais: 'Colombia', bandera: '🇨🇴',
    inicioOp: 2000, kmRed: 114, pasajerosDia: 2_200_000,
    pasKm: 19300, costoKm: 4.2, velocidadKmh: 26,
    tarifaUSD: 0.55, modelo: 'Pago por km + subsidio estado',
    leccion: 'Mayor red BRT del mundo. Operadores privados licitados. KPI de regularidad y puntualidad clave.',
    fortaleza: 'Integración total con alimentadoras — 7,900 buses de alimentación para 12,000 km de red secundaria',
    riesgo: 'Congestión por corredores únicos, evasión tarifaria alta en inicio',
    relevanciaUCOT: 'ALTA — modelo muy cercano al proyectado para Montevideo',
    color: '#dc2626',
  },
  {
    ciudad: 'Curitiba — URBS', pais: 'Brasil', bandera: '🇧🇷',
    inicioOp: 1974, kmRed: 81, pasajerosDia: 2_100_000,
    pasKm: 25900, costoKm: 3.1, velocidadKmh: 32,
    tarifaUSD: 0.65, modelo: 'Concesión por km + operador 100% privado',
    leccion: 'Pionero mundial. Trifásico (troncal + interdistrital + convencional). Cero subsidio 50 años.',
    fortaleza: 'Integración modal perfecta. Rentable sin subsidio. Tutoriales a 175 ciudades del mundo.',
    riesgo: 'Sistema saturado — capacidad al límite. No puede crecer más en el corredor',
    relevanciaUCOT: 'MUY ALTA — modelo de cooperativa-empresa similar a UCOT. Curitiba no tiene metro.',
    color: '#16a34a',
  },
  {
    ciudad: 'Guangzhou — BRT Zhongshan', pais: 'China', bandera: '🇨🇳',
    inicioOp: 2010, kmRed: 23, pasajerosDia: 1_000_000,
    pasKm: 43478, costoKm: 2.8, velocidadKmh: 24,
    tarifaUSD: 0.28, modelo: 'Operación pública — empresa municipal',
    leccion: 'BRT de mayor capacidad por km del mundo. Premio ITDP Gold 2011.',
    fortaleza: 'Estaciones con bicicletas integradas. Semáforos 100% prioritarios. 350 buses/hora pico.',
    riesgo: 'Solo aplica en ciudades con densidad china — difícil replicar',
    relevanciaUCOT: 'TÉCNICA — las estaciones en plataforma y integración bici son exportables',
    color: '#d97706',
  },
  {
    ciudad: 'Ciudad de México — Metrobús', pais: 'México', bandera: '🇲🇽',
    inicioOp: 2005, kmRed: 153, pasajerosDia: 900_000,
    pasKm: 5882, costoKm: 5.1, velocidadKmh: 19,
    tarifaUSD: 0.30, modelo: 'Concesionarios + tarjeta única integrada',
    leccion: 'Red extensa en ciudad congestionada. Integración con Metro y Tren Suburbano.',
    fortaleza: 'Tarjeta única para todos los modos. Operadores privados supervisados fuertemente.',
    riesgo: 'Velocidad baja por invasión de carril. Corrupción en permisos de parada.',
    relevanciaUCOT: 'MEDIA — escala diferente pero modelo de concesionarios privados idéntico',
    color: '#7c3aed',
  },
  {
    ciudad: 'Istanbul — Metrobüs', pais: 'Turquía', bandera: '🇹🇷',
    inicioOp: 2007, kmRed: 52, pasajerosDia: 800_000,
    pasKm: 15384, costoKm: 3.9, velocidadKmh: 44,
    tarifaUSD: 0.50, modelo: 'IETT (empresa pública) + contrato operadores',
    leccion: 'La BRT más rápida del mundo (44 km/h promedio). Cruce del Bósforo.',
    fortaleza: 'Viaducto exclusivo total — cero interacción con tráfico. Frecuencia de 120 seg en pico.',
    riesgo: 'Inversión muy alta (infraestructura vial exclusiva)',
    relevanciaUCOT: 'TÉCNICA — velocidad comercial objetivo para corredor 18 de Julio',
    color: '#0ea5e9',
  },
];

// ─── SIMULADOR DE DESVÍOS ─────────────────────────────────────────────────────

const ESCENARIOS_DESVIO = [
  {
    id: 'obra_8oct',
    titulo: 'Obras BRT — Corte 8 de Octubre',
    descripcion: 'Interrupción de 8 de Octubre entre Belloni y Tres Cruces durante obras de carril exclusivo (12 meses, 2027)',
    corridor: 'A',
    tramo: 'Belloni → Tres Cruces',
    lineasAfectadas: ['316', '300', '328', '329'],
    pasajerosDesplazados: 18000,
    planDesvio: [
      { accion: 'Línea 316 desviada por Millán → Rivera → Tres Cruces (+8 min)', tipo: 'desvio' },
      { accion: 'Refuerzo frecuencia L300 por corredor Instrucciones (de 12 a 8 min)', tipo: 'refuerzo' },
      { accion: 'Bus Lanzadera Belloni ↔ Tres Cruces (circuito corto, 5 min/vuelta)', tipo: 'especial' },
      { accion: 'Información en tiempo real en paradas: alertas SMS + pantallas', tipo: 'info' },
    ],
    duracionEstMeses: 12,
    costoAdicionalDia: 85000,
    impactoPassengerMin: +14,
  },
  {
    id: 'obra_italia',
    titulo: 'Obras Av. Italia — Pasos a Desnivel',
    descripcion: '5 pasos subterráneos en Av. Italia. Cortes de tráfico por etapas (16 meses, 2027-2028)',
    corridor: 'B',
    tramo: 'Av. Italia km 8 → km 12',
    lineasAfectadas: ['221', '329'],
    pasajerosDesplazados: 12000,
    planDesvio: [
      { accion: 'L221 desviada por Bv. José Batlle → Luis Alberto de Herrera → Italia', tipo: 'desvio' },
      { accion: 'Servicio intermodal: parada de taxi licenciado en puntos clave', tipo: 'especial' },
      { accion: 'Coordinación con STM para semáforos prioridad en rutas alternativas', tipo: 'coordinacion' },
    ],
    duracionEstMeses: 16,
    costoAdicionalDia: 62000,
    impactoPassengerMin: +18,
  },
  {
    id: 'intercambiador',
    titulo: 'Construcción Intercambiador Tres Cruces',
    descripcion: 'Excavación subterránea Plaza de la Bandera — impacto total en zona de Tres Cruces (24 meses, 2027-2029)',
    corridor: 'A+B',
    tramo: 'Zona Tres Cruces radio 500m',
    lineasAfectadas: ['300', '306', '316', '328', '329', '330', '221'],
    pasajerosDesplazados: 35000,
    planDesvio: [
      { accion: 'Crear hub temporal en Garibaldi / Rivera para transbordo (2027 Q1)', tipo: 'especial' },
      { accion: 'Todas las líneas con paso por Tres Cruces redirigen a Garibaldi 500m', tipo: 'desvio' },
      { accion: 'Señalización masiva + app STM actualizada con desvíos en tiempo real', tipo: 'info' },
      { accion: 'Coordinación IMM para corte vehicular nocturno zona obras', tipo: 'coordinacion' },
      { accion: 'Micro-lanzaderas eléctricas Garibaldi ↔ estación provisional (cada 3 min)', tipo: 'especial' },
    ],
    duracionEstMeses: 24,
    costoAdicionalDia: 145000,
    impactoPassengerMin: +22,
  },
  {
    id: 'evento_masivo',
    titulo: 'Evento Masivo — Estadio Centenario',
    descripcion: 'Partido internacional con 65,000 asistentes. Saturación de líneas zona Parque Batlle',
    corridor: 'A',
    tramo: 'Av. Italia / Bv. José Batlle',
    lineasAfectadas: ['329', '306', '316'],
    pasajerosDesplazados: 65000,
    planDesvio: [
      { accion: 'Servicio especial EXPRESS Tres Cruces ↔ Centenario (cada 4 min pre-evento)', tipo: 'especial' },
      { accion: 'Cierre anticipado de líneas que pasan por zona (3h post-evento)', tipo: 'desvio' },
      { accion: 'Coordinación con STM para prioridad semafórica en corredor Italia', tipo: 'coordinacion' },
      { accion: 'Sistema de ticketing integrado evento-transporte (código QR en entrada)', tipo: 'info' },
    ],
    duracionEstMeses: 0.03, // un día
    costoAdicionalDia: 120000,
    impactoPassengerMin: +35,
  },
];

// ─── PROPUESTA UCOT PARA ASM ──────────────────────────────────────────────────

const PROPUESTA_ASM = {
  titulo: 'UCOT como Operador Estratégico del Sistema Metropolitano',
  subtitulo: '63 años de experiencia operando en los mismos corredores donde se construirá el BRT',
  ventajasCompetitivas: [
    {
      icono: '🗺️',
      titulo: 'Conocimiento de red sin rival',
      detalle: '29 líneas activas, 257 coches, 691 conductores/inspectores. Los mismos corredores que serán BRT durante 6+ décadas.',
    },
    {
      icono: '📡',
      titulo: 'Plataforma de inteligencia ya construida',
      detalle: 'SkillRoute: monitoreo GPS en tiempo real, KPIs operativos, gestión de incidentes, distribución diaria automatizada.',
    },
    {
      icono: '👥',
      titulo: 'Estructura cooperativa — alineación de incentivos',
      detalle: 'Al ser cooperativa de trabajadores, los conductores son socios. Menor rotación, mayor compromiso con estándares de calidad.',
    },
    {
      icono: '🔄',
      titulo: 'Ya operando en modelo de alimentación',
      detalle: 'Las líneas L12, L13, L31, L32, L33 son hoy alimentadoras locales. Experiencia directa en el modelo que el BRT requiere.',
    },
    {
      icono: '⚡',
      titulo: 'Capacidad de adaptación probada',
      detalle: 'Sistema de desvíos, cascada de cobertura y gestión de contingencias ya implementado digitalmente.',
    },
    {
      icono: '📊',
      titulo: 'Datos reales para la ASM',
      detalle: 'Única empresa con boletín digitalizado, rotación diaria y datos GPS integrados. Base para el sistema de pago por km.',
    },
  ],
  modeloComercial: {
    opcion1: {
      nombre: 'Operador Alimentador Preferente',
      descripcion: 'UCOT opera las líneas alimentadoras de ambos corredores BRT bajo contrato de km con la ASM',
      ingresosAnualesEstUSD: 8_200_000,
      cochesInvolucrados: 68,
      conductores: 85,
      plazo: '10 años',
    },
    opcion2: {
      nombre: 'Co-Gestor del Corredor A',
      descripcion: 'UCOT toma el rol de operador troncal del Corredor A (8 de Octubre) + alimentadoras asociadas',
      ingresosAnualesEstUSD: 18_500_000,
      cochesInvolucrados: 95,
      conductores: 120,
      plazo: '12 años',
    },
    opcion3: {
      nombre: 'Proveedor de Plataforma Digital ASM',
      descripcion: 'SkillRoute es la plataforma que sistema de gestión para toda la red metropolitana',
      ingresosAnualesEstUSD: 2_400_000,
      cochesInvolucrados: 0,
      conductores: 5,
      plazo: '5 años',
    },
  },
  kpisInternacionales: [
    { kpi: 'Puntualidad', meta: '>92%', ucotActual: '~78%', brecha: 'Gap real: necesita inversión en monitoreo GPS y semáforo adaptativo' },
    { kpi: 'Tiempo viaje extremo-extremo', meta: '<50 min (Línea A)', ucotActual: '68 min', brecha: 'BRT cierra la brecha — UCOT alimentadora debe ofrecer <15 min a nodo' },
    { kpi: 'Capacidad hora pico', meta: '3,500 pas/hr/dir', ucotActual: '~850 pas/hr/dir', brecha: 'BRT lleva biarticulados. UCOT alimentadoras requieren buses de 12m mínimo' },
    { kpi: 'Flota eléctrica/híbrida', meta: '30% para 2030', ucotActual: '0%', brecha: 'Inversión necesaria. Posible subsidio MTOP/BID para flota verde' },
    { kpi: 'Satisfacción usuario', meta: '>80%', ucotActual: 'Sin medición sistemática', brecha: 'Implementar encuestas en tiempo real (QR en unidades)' },
  ],
};

// ─── PLAN DE OBRAS 2027-2029 ──────────────────────────────────────────────────

const PLAN_OBRAS = [
  {
    fase: 'Fase 0 — Pre-obras (2026)',
    periodo: 'Q3-Q4 2026',
    color: 'amber',
    acciones: [
      'Licitación operadores: UCOT debe presentar propuesta técnica',
      'Diseño definitivo de rutas alimentadoras propuestas',
      'Capacitación conductores en protocolos BRT y atención al usuario',
      'Actualización de flota con GPS de alta precisión (integración ASM)',
      'Implementar sistema de desvíos digitales en SkillRoute',
    ],
  },
  {
    fase: 'Fase 1 — Inicio obras 8 de Octubre (Ene-Dic 2027)',
    periodo: 'Ene-Dic 2027',
    color: 'red',
    acciones: [
      'Activar Plan Desvío D1: L316 por Millán y L300 por corredor Instrucciones',
      'Desplegar bus lanzadera Belloni ↔ Tres Cruces (frecuencia 5 min)',
      'Refuerzo nocturno en zonas de obra (mayor demanda de trabajadores)',
      'Comunicación activa con pasajeros (app STM, pantallas en paradas)',
      'Coordinación semanal con IMM para ajuste de desvíos según avance de obra',
    ],
  },
  {
    fase: 'Fase 2 — Obras Av. Italia + Intercambiador (2027-2028)',
    periodo: 'Jul 2027 - Dic 2028',
    color: 'orange',
    acciones: [
      'Activar Plan Desvío D2: L221 por bulevar alternativo',
      'Hub temporal Garibaldi para transbordo zona Tres Cruces',
      'Micro-lanzaderas eléctricas en zona de obras intercambiador',
      'Ajuste dinámico de frecuencias según datos GPS de demanda real',
      'Monitoreo de KPIs de operación — reportes semanales para MTOP/IMM',
    ],
  },
  {
    fase: 'Fase 3 — Pruebas y ajustes (2028-2029)',
    periodo: 'Ene 2028 - Dic 2028',
    color: 'blue',
    acciones: [
      'Pruebas conjuntas BRT troncal + alimentadoras UCOT',
      'Calibración de horarios: empalme alimentadora ↔ BRT (< 3 min espera)',
      'Testeo de sistema de pago integrado (tarjeta única)',
      'Simulaciones de evento masivo y emergencia de red',
      'Capacitación final de todo el personal en nuevo modelo operativo',
    ],
  },
  {
    fase: 'Fase 4 — Operación BRT (2029+)',
    periodo: 'A partir de 2029',
    color: 'emerald',
    acciones: [
      'Sistema totalmente operativo: troncal + alimentadoras UCOT',
      'Pago por km activo — facturación mensual a ASM',
      'KPIs en tiempo real visibles en SkillRoute + reportes ASM',
      'Expansión de alimentadoras a nuevas zonas según demanda',
      'Evaluación para nuevas licitaciones de corredores futuros',
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────

type TabType = 'corredores' | 'impacto' | 'modelo' | 'alimentadoras' | 'timeline' | 'benchmarks' | 'obras' | 'simulador' | 'propuesta';

// ─── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────────

export default function BRTCorridorDashboard() {
  const [tabActiva, setTabActiva] = useState<TabType>('corredores');
  const [corredorSel, setCorredorSel] = useState<'A' | 'B'>('A');
  const [mostrarAmbas, setMostrarAmbas] = useState(false);
  const [escenarioSel, setEscenarioSel] = useState<string>('obra_8oct');
  const [tarifaKmSlider, setTarifaKmSlider] = useState(420);
  const [kmDiaSlider, setKmDiaSlider] = useState(220);
  // Trazado REAL: shape GTFS oficial IMM de la línea troncal de referencia
  // de cada corredor. Reemplaza los waypoints dibujados a mano que cruzaban
  // edificios y terminaban en la playa. Si no hay shape, no se dibuja línea.
  const [shapes, setShapes] = useState<Record<string, [number, number][]>>({});
  useEffect(() => {
    let vivo = true;
    Promise.all(
      CORREDORES.map((c) =>
        apiClient
          .get(`/api/comando/shape-linea/${encodeURIComponent(c.lineaRef)}`)
          .then((r: any) => [c.id, (r && r.puntos) || []] as [string, [number, number][]])
          .catch(() => [c.id, [] as [number, number][]] as [string, [number, number][]]),
      ),
    ).then((pares) => {
      if (vivo) setShapes(Object.fromEntries(pares));
    });
    return () => {
      vivo = false;
    };
  }, []);

  const corredor = CORREDORES.find(c => c.id === corredorSel) ?? CORREDORES[0];
  const escenario = ESCENARIOS_DESVIO.find(e => e.id === escenarioSel) ?? ESCENARIOS_DESVIO[0];

  const m = MODELO_FINANCIERO;
  const margenActual = m.actual.ingresoDia - m.actual.costoDia;
  const ingresoBRTCalc = tarifaKmSlider * kmDiaSlider;
  const margenBRTCalc = ingresoBRTCalc - m.brt.costoDia;
  const margenBRT = m.brt.ingresoDia - m.brt.costoDia;
  const mejoraPct = margenActual !== 0 ? Math.round((margenBRT / margenActual - 1) * 100) : 0;
  const mejoraPctCalc = margenActual !== 0 ? Math.round((margenBRTCalc / margenActual - 1) * 100) : 0;

  const colorFase: Record<string, string> = {
    amber: 'border-amber-700/50 bg-amber-900/10',
    red: 'border-red-700/50 bg-red-900/10',
    orange: 'border-orange-700/50 bg-orange-900/10',
    blue: 'border-blue-700/50 bg-blue-900/10',
    emerald: 'border-emerald-700/50 bg-emerald-900/10',
  };
  const colorFaseText: Record<string, string> = {
    amber: 'text-amber-300', red: 'text-red-300', orange: 'text-orange-300',
    blue: 'text-blue-300', emerald: 'text-emerald-300',
  };

  const tabsMeta: [TabType, string][] = useMemo(() => [
    ['corredores', '🗺️ Corredores'],
    ['impacto', '⚡ Impacto UCOT'],
    ['modelo', '💰 Modelo $/km'],
    ['alimentadoras', '🚌 Alimentadoras'],
    ['timeline', '📅 Timeline'],
    ['benchmarks', '🌍 Benchmarks'],
    ['obras', '🔧 Plan Obras'],
    ['simulador', '🎮 Simulador'],
    ['propuesta', '🏛️ UCOT→ASM'],
  ], []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6">

      {/* ── HEADER ── */}
      <div className="mb-6">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="w-12 h-12 rounded-xl bg-red-600/20 border border-red-500/30 flex items-center justify-center shrink-0">
            <Train className="w-6 h-6 text-red-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">BRT Metropolitano 2027–2029</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              Estrategia UCOT ante la reforma del transporte de Montevideo · Análisis de impacto, oportunidades y adaptación
            </p>
          </div>
          <div className="flex gap-4 flex-wrap">
            <div className="bg-slate-900 rounded-xl border border-slate-800 px-4 py-3 text-center">
              <p className="text-slate-500 text-[10px] uppercase font-bold">Inversión</p>
              <p className="text-xl font-black text-white">US$ 490M</p>
            </div>
            <div className="bg-slate-900 rounded-xl border border-slate-800 px-4 py-3 text-center">
              <p className="text-slate-500 text-[10px] uppercase font-bold">Inicio obras</p>
              <p className="text-xl font-black text-amber-400">Ene 2027</p>
            </div>
            <div className="bg-slate-900 rounded-xl border border-slate-800 px-4 py-3 text-center">
              <p className="text-slate-500 text-[10px] uppercase font-bold">Líneas UCOT</p>
              <p className="text-xl font-black text-red-400">{todasAfectadas.length} afect.</p>
            </div>
            <div className="bg-slate-900 rounded-xl border border-slate-800 px-4 py-3 text-center">
              <p className="text-slate-500 text-[10px] uppercase font-bold">Nuevo modelo</p>
              <p className="text-xl font-black text-emerald-400">$/km</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── TABS ── */}
      <div className="flex gap-1 border-b border-slate-800 mb-6 overflow-x-auto">
        {tabsMeta.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTabActiva(id)}
            className={`px-3 py-2.5 text-xs md:text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tabActiva === id
                ? 'border-primary-500 text-primary-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ══════════════════ TAB: CORREDORES ══════════════════ */}
      {tabActiva === 'corredores' && (
        <div className="space-y-5">
          {/* Selector corredor */}
          <div className="flex flex-wrap gap-3 items-center">
            {CORREDORES.map(c => (
              <button
                key={c.id}
                onClick={() => { setCorredorSel(c.id as 'A' | 'B'); setMostrarAmbas(false); }}
                className={`flex-1 md:flex-none px-4 py-3 rounded-xl border text-sm font-bold transition-all ${
                  !mostrarAmbas && corredorSel === c.id
                    ? 'bg-slate-800 text-white'
                    : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600'
                }`}
                style={{ borderColor: !mostrarAmbas && corredorSel === c.id ? c.color : undefined }}
              >
                <span style={{ color: c.color }}>●</span> {c.nombre}
              </button>
            ))}
            <button
              onClick={() => setMostrarAmbas(v => !v)}
              className={`px-4 py-3 rounded-xl border text-sm font-bold transition-all flex items-center gap-2 ${
                mostrarAmbas
                  ? 'bg-slate-700 border-slate-500 text-white'
                  : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500'
              }`}
            >
              <Layers className="w-4 h-4" />
              Vista general
            </button>
          </div>

          {/* Datos del corredor seleccionado */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Longitud troncal', valor: `${corredor.kmTroncal} km`, sub: 'carril exclusivo', icon: Route },
              { label: 'Paradas', valor: corredor.paradas.length, sub: 'incluye 1 intercambiador', icon: MapPin },
              { label: 'Tiempo actual', valor: `${corredor.tiempoActualMin} min`, sub: 'extremo a extremo', icon: Clock },
              { label: 'Tiempo BRT', valor: `${corredor.tiempoBRTMin} min`, sub: `${corredor.tiempoActualMin - corredor.tiempoBRTMin} min menos`, icon: Zap },
            ].map(({ label, valor, sub, icon: Icon }) => (
              <div key={label} className="bg-slate-900 rounded-xl border border-slate-800 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="w-4 h-4 text-slate-500" />
                  <p className="text-slate-400 text-xs">{label}</p>
                </div>
                <p className="text-2xl font-black text-white">{valor}</p>
                <p className="text-slate-500 text-xs mt-0.5">{sub}</p>
              </div>
            ))}
          </div>

          {/* Descripción del recorrido */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <p className="text-slate-400 text-xs uppercase font-bold mb-2">Recorrido</p>
            <p className="text-white text-sm">{corredor.subtitulo}</p>
            {corredor.id === 'A' && (
              <div className="mt-3 flex items-start gap-2 bg-amber-900/20 border border-amber-700/30 rounded-xl p-3 text-xs text-amber-300">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Línea A circula en <strong>nivel -2</strong> dentro del intercambiador subterráneo de Tres Cruces. El túnel de 8 de Octubre será reconstruido para este nodo.</span>
              </div>
            )}
            {corredor.id === 'B' && (
              <div className="mt-3 flex items-start gap-2 bg-blue-900/20 border border-blue-700/30 rounded-xl p-3 text-xs text-blue-300">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Línea B circula en <strong>nivel -1</strong>. Incluye <strong>5 pasos a desnivel</strong> en Av. Italia para eliminar semáforos críticos.</span>
              </div>
            )}
          </div>

          {/*
            FASE 5.14 (2026-05-13): el polyline del corredor usa waypoints
            sembrados a mano cada ~1km. Leaflet dibuja lineas rectas entre
            ellos, lo que en zoom alto se ve "cortando" manzanas, edificios
            y a veces la costa. Para el proyecto real las geometrias deben
            venir del trazado oficial IMM (snapped a calles via OSRM o GTFS).
            Mostramos disclaimer abajo para evitar confundir al auditor.
          */}
          <div className="mb-3 flex items-start gap-2 bg-slate-800/40 border border-slate-700/40 rounded-xl p-3 text-[11px] text-slate-400">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-500" />
            <span>
              <strong className="text-slate-300">Trazado esquemático.</strong>{' '}
              Las líneas conectan waypoints estratégicos del corredor; el trazado definitivo
              se ajustará al diseño geométrico del proyecto IMM (calles reales, carriles
              exclusivos, accesos a estaciones). Las posiciones de las paradas sí son las
              coordenadas reales propuestas.
            </span>
          </div>

          {/* Mapa */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden relative" style={{ height: 420 }}>
            <MapContainer
              center={[-34.88, -56.09]}
              zoom={12}
              style={{ height: '100%', width: '100%' }}
              zoomControl={true}
            >
              <TileLayer
                attribution='&copy; OpenStreetMap'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              />
              {CORREDORES.map(c => {
                const isSelected = c.id === corredorSel;
                const traza = shapes[c.id] ?? [];
                if (traza.length < 2) return null; // sin shape real → no se dibuja
                if (mostrarAmbas) {
                  return (
                    <Polyline
                      key={c.id}
                      positions={traza}
                      color={c.color}
                      weight={5}
                      opacity={0.95}
                    />
                  );
                }
                if (!isSelected) {
                  return (
                    <Polyline
                      key={c.id}
                      positions={traza}
                      color={c.color}
                      weight={1.5}
                      opacity={0.12}
                      dashArray="6,8"
                    />
                  );
                }
                return (
                  <Polyline
                    key={c.id}
                    positions={traza}
                    color={c.color}
                    weight={7}
                    opacity={1}
                  />
                );
              })}
              {(mostrarAmbas ? CORREDORES : [corredor]).flatMap(c =>
                c.paradas.map(p => {
                  const isIntercambiador = p.tipo === 'intercambiador';
                  const isTerminal = p.tipo === 'terminal';
                  const icon = L.divIcon({
                    html: `<div style="width:${isIntercambiador ? 16 : isTerminal ? 12 : 8}px;height:${isIntercambiador ? 16 : isTerminal ? 12 : 8}px;border-radius:50%;background:${isIntercambiador ? '#f59e0b' : c.color};border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.5)"></div>`,
                    className: '',
                    iconSize: [isIntercambiador ? 16 : 10, isIntercambiador ? 16 : 10],
                    iconAnchor: [isIntercambiador ? 8 : 5, isIntercambiador ? 8 : 5],
                  });
                  return (
                    <Marker key={`${c.id}-${p.nombre}`} position={[p.lat, p.lng]} icon={icon}>
                      <Popup>
                        <div className="text-xs font-semibold">{p.nombre}</div>
                        <div className="text-xs" style={{ color: c.color }}>{c.nombre}</div>
                        <div className="text-xs text-gray-500">{p.tipo === 'intercambiador' ? '⬇ Nodo subterráneo' : p.tipo}</div>
                      </Popup>
                    </Marker>
                  );
                })
              )}
              {/* Intercambiador Tres Cruces */}
              <CircleMarker
                center={[-34.896, -56.156]}
                radius={12}
                color="#f59e0b"
                fillColor="#f59e0b"
                fillOpacity={0.25}
                weight={2}
              >
                <Popup>
                  <strong>Intercambiador Tres Cruces</strong><br />
                  Subterráneo — 2 niveles<br />
                  Línea A: nivel -2 · Línea B: nivel -1
                </Popup>
              </CircleMarker>
            </MapContainer>
            {/* Leyenda superpuesta */}
            <div className="absolute bottom-3 left-3 z-[1000] bg-slate-950/90 border border-slate-700 rounded-xl px-3 py-2 flex flex-col gap-1.5 pointer-events-none">
              {CORREDORES.map(c => (
                <div key={c.id} className="flex items-center gap-2 text-xs font-bold">
                  <span className="inline-block w-6 h-1.5 rounded-full" style={{ background: c.color, opacity: mostrarAmbas || corredorSel === c.id ? 1 : 0.2 }} />
                  <span style={{ color: mostrarAmbas || corredorSel === c.id ? c.color : '#4b5563' }}>{c.nombre}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Lista de paradas */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <p className="font-bold text-sm">{corredor.paradas.length} paradas — {corredor.nombre}</p>
              <p className="text-xs text-slate-500">~500m entre paradas</p>
            </div>
            <div className="divide-y divide-slate-800/60">
              {corredor.paradas.map((p, i) => (
                <div key={p.nombre} className={`flex items-center gap-3 px-4 py-2.5 ${p.tipo === 'intercambiador' ? 'bg-amber-900/10' : ''}`}>
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0"
                    style={{ background: p.tipo === 'intercambiador' ? '#f59e0b' : corredor.color, color: 'white' }}
                  >
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-white font-medium">{p.nombre}</p>
                  </div>
                  {p.tipo === 'intercambiador' && (
                    <span className="text-[10px] bg-amber-900/40 text-amber-300 border border-amber-700/50 px-2 py-0.5 rounded">
                      INTERCAMBIADOR
                    </span>
                  )}
                  {p.tipo === 'terminal' && (
                    <span className="text-[10px] bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded">
                      TERMINAL
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════ TAB: IMPACTO UCOT ══════════════════ */}
      {tabActiva === 'impacto' && (
        <div className="space-y-5">
          <div className="bg-red-900/20 border border-red-700/40 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-red-300">Impacto directo en {todasAfectadas.length} líneas UCOT</p>
              <p className="text-red-400/80 text-sm mt-1">
                Las líneas que comparten corredor con el BRT perderán pasajeros al competir con frecuencias más altas,
                menor tiempo de viaje y mayor confort. La decisión clave es: ¿reconfigurarse como alimentadoras o mantener trazados históricos?
              </p>
            </div>
          </div>

          {CORREDORES.map(c => (
            <div key={c.id} className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ background: c.color }} />
                <p className="font-bold text-sm">{c.nombre}</p>
                <span className="text-xs text-slate-500">{c.lineasUCOTAfectadas.length} líneas afectadas</span>
              </div>
              <div className="divide-y divide-slate-800/40">
                {c.lineasUCOTAfectadas.map(l => (
                  <div key={l.linea} className="px-4 py-3 grid grid-cols-1 md:grid-cols-4 gap-3 items-start">
                    <div>
                      <p className="text-white font-bold">Línea {l.linea}</p>
                      <p className="text-slate-400 text-xs mt-0.5">{l.nombre}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-[10px] uppercase font-bold mb-1">Superposición</p>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded border ${
                        l.overlap === 'TOTAL'
                          ? 'bg-red-900/40 text-red-300 border-red-700/50'
                          : 'bg-amber-900/40 text-amber-300 border-amber-700/50'
                      }`}>
                        {l.overlap} — {l.km} km
                      </span>
                    </div>
                    <div className="md:col-span-2">
                      <p className="text-slate-500 text-[10px] uppercase font-bold mb-1">Estrategia recomendada</p>
                      <div className="flex items-start gap-2">
                        <ArrowRight className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <p className="text-emerald-300 text-sm">{l.estrategia}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Escenario sin adaptación */}
          <div className="bg-slate-900 rounded-xl border border-red-800/50 overflow-hidden">
            <div className="px-4 py-3 border-b border-red-800/50 bg-red-900/20">
              <p className="font-bold text-red-300 flex items-center gap-2">
                <XCircle className="w-4 h-4" /> Escenario SIN adaptación (mantener líneas actuales)
              </p>
            </div>
            <div className="p-4 space-y-2 text-sm">
              {[
                'Pérdida estimada del 35-45% de pasajeros en líneas superpuestas para 2030',
                'Ingresos decrecientes mientras costos operativos se mantienen',
                'Riesgo de incumplimiento de compromisos contractuales con MTOP',
                'Flota subutilizada en horarios valle (mayor costo fijo por pasajero)',
                'Posible pérdida de licencias operativas en corredores BRT',
              ].map(r => (
                <div key={r} className="flex items-start gap-2 text-red-300">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{r}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Escenario con adaptación */}
          <div className="bg-slate-900 rounded-xl border border-emerald-800/50 overflow-hidden">
            <div className="px-4 py-3 border-b border-emerald-800/50 bg-emerald-900/20">
              <p className="font-bold text-emerald-300 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" /> Escenario CON adaptación (migrar a alimentadoras + pago por km)
              </p>
            </div>
            <div className="p-4 space-y-2 text-sm">
              {[
                'Ingresos predecibles y crecientes basados en km operados',
                'Mayor número de líneas = más km = más ingresos (incentivo alineado)',
                'Posicionamiento como operador preferente en proceso de licitación',
                'Cobertura de zonas sin servicio BRT (mercado no disputado por el troncal)',
                'Contratos 8-12 años con el Estado — mayor estabilidad',
                `Con ${LINEAS_ALIMENTADORAS_PROPUESTAS.length} alimentadoras propuestas: +${LINEAS_ALIMENTADORAS_PROPUESTAS.reduce((a, l) => a + l.kmEstimado, 0)} km/día operados`,
              ].map(r => (
                <div key={r} className="flex items-start gap-2 text-emerald-300">
                  <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{r}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════ TAB: MODELO $/km ══════════════════ */}
      {tabActiva === 'modelo' && (
        <div className="space-y-5">
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <p className="text-xs text-slate-500 uppercase font-bold mb-3">Contexto del cambio</p>
            <p className="text-slate-300 text-sm leading-relaxed">
              El nuevo modelo de concesión BRT establece que las empresas operadoras cobran por <strong>kilómetro recorrido</strong>,
              no por pasajero transportado. El Estado (a través de la Agencia del Sistema Metropolitano — ASM)
              fija la tarifa por km y paga directamente a los operadores. Los usuarios pagan al Estado.
              Esto <strong>elimina el riesgo de demanda</strong> para los operadores pero introduce
              KPIs de calidad con descuentos por incumplimiento.
            </p>
          </div>

          {/* Comparativa modelo */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-900 rounded-xl border border-slate-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700 bg-slate-800">
                <p className="font-bold text-white flex items-center gap-2">
                  <Bus className="w-4 h-4 text-slate-400" /> Modelo ACTUAL (por pasajero)
                </p>
                <p className="text-slate-400 text-xs mt-0.5">Referencia: bus promedio UCOT hoy</p>
              </div>
              <div className="p-4 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Tarifa por pasajero</span>
                  <span className="font-mono text-white">${m.actual.tarifa} UYU</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Pasajeros/bus/día</span>
                  <span className="font-mono text-white">{m.actual.pasajerosPromDia}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Captación empresa</span>
                  <span className="font-mono text-white">{m.actual.captacionEmpresa * 100}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Km recorridos/día</span>
                  <span className="font-mono text-white">{m.actual.kmPromDia} km</span>
                </div>
                <div className="border-t border-slate-700 pt-3">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Ingreso/bus/día</span>
                    <span className="font-mono text-emerald-400 font-bold">${Math.round(m.actual.ingresoDia).toLocaleString()} UYU</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-slate-400">Costo/bus/día</span>
                    <span className="font-mono text-red-400">${m.actual.costoDia.toLocaleString()} UYU</span>
                  </div>
                  <div className="flex justify-between mt-1 pt-2 border-t border-slate-700">
                    <span className="text-white font-bold">Margen/bus/día</span>
                    <span className={`font-mono font-black text-lg ${margenActual > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      ${Math.round(margenActual).toLocaleString()} UYU
                    </span>
                  </div>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Margen/bus/mes</span>
                  <span className="text-slate-400">${Math.round(margenActual * 26).toLocaleString()} UYU</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-900 rounded-xl border border-emerald-700/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-emerald-700/50 bg-emerald-900/20">
                <p className="font-bold text-white flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-400" /> Nuevo Modelo BRT (por km)
                </p>
                <p className="text-emerald-400/70 text-xs mt-0.5">Estimación basada en contratos MTOP existentes</p>
              </div>
              <div className="p-4 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Tarifa por km</span>
                  <span className="font-mono text-white">${m.brt.tarifaKm} UYU/km</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Km operados/bus/día</span>
                  <span className="font-mono text-white">{m.brt.kmPromDia} km</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Factor nocturno</span>
                  <span className="font-mono text-white">×{m.brt.bonusNocturno}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Penalización KPI min</span>
                  <span className="font-mono text-amber-400">×{m.brt.riesgoMin} si incumple</span>
                </div>
                <div className="border-t border-emerald-700/30 pt-3">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Ingreso/bus/día</span>
                    <span className="font-mono text-emerald-400 font-bold">${m.brt.ingresoDia.toLocaleString()} UYU</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-slate-400">Costo/bus/día</span>
                    <span className="font-mono text-red-400">${m.brt.costoDia.toLocaleString()} UYU</span>
                  </div>
                  <div className="flex justify-between mt-1 pt-2 border-t border-emerald-700/30">
                    <span className="text-white font-bold">Margen/bus/día</span>
                    <span className="font-mono font-black text-lg text-emerald-400">
                      ${margenBRT.toLocaleString()} UYU
                    </span>
                  </div>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Margen/bus/mes</span>
                  <span className="text-slate-400">${Math.round(margenBRT * 26).toLocaleString()} UYU</span>
                </div>
              </div>
            </div>
          </div>

          {/* Banner mejora */}
          <div className={`rounded-xl border p-4 flex items-center gap-4 ${
            mejoraPct > 0
              ? 'bg-emerald-900/20 border-emerald-700/40'
              : 'bg-red-900/20 border-red-700/40'
          }`}>
            <TrendingUp className={`w-8 h-8 shrink-0 ${mejoraPct > 0 ? 'text-emerald-400' : 'text-red-400'}`} />
            <div>
              <p className={`text-xl font-black ${mejoraPct > 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                {mejoraPct > 0 ? '+' : ''}{mejoraPct}% mejora en margen por bus/día
              </p>
              <p className="text-slate-400 text-sm mt-0.5">
                Con la flota actual de 257 coches y migrando al modelo BRT, el margen total mensual estimado sería de
                <strong className="text-white"> ${Math.round(margenBRT * 26 * 257 / 1_000_000).toFixed(1)}M UYU/mes</strong> vs
                <strong className="text-white"> ${Math.round(margenActual * 26 * 257 / 1_000_000).toFixed(1)}M UYU/mes</strong> actual.
              </p>
            </div>
          </div>

          {/* Ventajas y riesgos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-900 rounded-xl border border-emerald-800/40 p-4">
              <p className="text-xs text-emerald-400 uppercase font-bold mb-3">Ventajas del nuevo modelo</p>
              <div className="space-y-2">
                {m.brt.ventajas.map(v => (
                  <div key={v} className="flex items-start gap-2 text-sm text-emerald-300">
                    <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-slate-900 rounded-xl border border-amber-800/40 p-4">
              <p className="text-xs text-amber-400 uppercase font-bold mb-3">Riesgos a gestionar</p>
              <div className="space-y-2">
                {m.brt.riesgos.map(r => (
                  <div key={r} className="flex items-start gap-2 text-sm text-amber-300">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{r}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════ TAB: LÍNEAS ALIMENTADORAS ══════════════════ */}
      {tabActiva === 'alimentadoras' && (
        <div className="space-y-5">
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <p className="text-slate-300 text-sm leading-relaxed">
              Una vez operativo el BRT, los pasajeros usarán el troncal para el tramo largo.
              Las <strong className="text-white">líneas alimentadoras</strong> conectan barrios sin cobertura BRT con los nodos de intercambio.
              UCOT tiene ventaja competitiva: conoce los recorridos actuales, tiene personal y flota disponibles.
              A continuación, <strong className="text-white">{LINEAS_ALIMENTADORAS_PROPUESTAS.length} propuestas de nuevas líneas</strong> basadas
              en zonas geográficas sin cobertura BRT directa.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {LINEAS_ALIMENTADORAS_PROPUESTAS.map(al => {
              const ingresoMens = Math.round(al.ingresoEstDia * 26 / 1000);
              return (
                <div key={al.id} className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
                  <div className={`px-4 py-3 border-b border-slate-800 flex items-center justify-between ${
                    al.viabilidad === 'MUY ALTA' ? 'bg-emerald-900/20' :
                    al.viabilidad === 'ALTA' ? 'bg-primary-900/20' : 'bg-amber-900/10'
                  }`}>
                    <div>
                      <p className="font-bold text-white text-sm">{al.id} — {al.nombre}</p>
                      <p className="text-slate-400 text-xs mt-0.5">
                        Corredor {al.corredorAlimenta} · Migra desde: {al.lineaExistenteMigracion ?? 'línea nueva'}
                      </p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded border ${
                      al.viabilidad === 'MUY ALTA' ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50' :
                      al.viabilidad === 'ALTA' ? 'bg-blue-900/40 text-blue-300 border-blue-700/50' :
                      'bg-amber-900/40 text-amber-300 border-amber-700/50'
                    }`}>
                      {al.viabilidad}
                    </span>
                  </div>
                  <div className="p-4 space-y-3">
                    <p className="text-slate-300 text-sm">{al.descripcion}</p>
                    <p className="text-slate-400 text-xs">
                      <span className="text-slate-300 font-medium">Recorrido:</span> {al.recorrido}
                    </p>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      {[
                        { label: 'km/viaje', valor: al.kmEstimado },
                        { label: 'Frecuencia', valor: `${al.frecuenciaMin}min` },
                        { label: 'Coches', valor: al.cochesNecesarios },
                      ].map(({ label, valor }) => (
                        <div key={label} className="bg-slate-800 rounded-lg p-2 text-center">
                          <p className="text-slate-500 text-[10px]">{label}</p>
                          <p className="text-white font-bold text-sm">{valor}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-slate-800">
                      <span className="text-slate-400 text-xs">Ingreso estimado/mes</span>
                      <span className="font-mono font-black text-emerald-400">${ingresoMens}K UYU</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Resumen flota */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <p className="text-xs text-slate-500 uppercase font-bold mb-3">Resumen operativo — todas las alimentadoras</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Coches necesarios', valor: LINEAS_ALIMENTADORAS_PROPUESTAS.reduce((a, l) => a + l.cochesNecesarios, 0) },
                { label: 'Conductores', valor: LINEAS_ALIMENTADORAS_PROPUESTAS.reduce((a, l) => a + l.conductoresNecesarios, 0) },
                { label: 'km/día total', valor: LINEAS_ALIMENTADORAS_PROPUESTAS.reduce((a, l) => a + l.kmEstimado, 0) + ' km' },
                { label: 'Ingreso/mes total', valor: '$' + Math.round(LINEAS_ALIMENTADORAS_PROPUESTAS.reduce((a, l) => a + l.ingresoEstDia * 26, 0) / 1000) + 'K UYU' },
              ].map(({ label, valor }) => (
                <div key={label} className="bg-slate-800 rounded-xl p-3 text-center">
                  <p className="text-slate-400 text-[10px] uppercase">{label}</p>
                  <p className="text-xl font-black text-white mt-1">{valor}</p>
                </div>
              ))}
            </div>
            <p className="text-slate-500 text-xs mt-3">
              * La flota UCOT actual tiene 257 coches disponibles. Las alimentadoras propuestas requieren {LINEAS_ALIMENTADORAS_PROPUESTAS.reduce((a, l) => a + l.cochesNecesarios, 0)} coches
              — cubribles con la flota existente redirigida desde las líneas superpuestas con BRT.
            </p>
          </div>
        </div>
      )}

      {/* ══════════════════ TAB: TIMELINE ══════════════════ */}
      {tabActiva === 'timeline' && (
        <div className="space-y-4">
          <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-4 flex items-start gap-3">
            <Calendar className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-300">Ventana crítica: Licitaciones 2026 Q3-Q4</p>
              <p className="text-amber-400/80 text-sm mt-1">
                El proceso de licitación para operadores alimentadores se abrirá en el segundo semestre de 2026.
                UCOT debe tener lista su propuesta técnica y financiera antes de ese período.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {TIMELINE.map((t, i) => (
              <div key={i} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs ${
                    t.estado === 'completado' ? 'bg-emerald-600 text-white' :
                    t.estado === 'en_curso' ? 'bg-amber-600 text-white animate-pulse' :
                    'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}>
                    {t.estado === 'completado' ? <CheckCircle className="w-5 h-5" /> :
                     t.estado === 'en_curso' ? <Clock className="w-5 h-5" /> :
                     <Clock className="w-5 h-5" />}
                  </div>
                  {i < TIMELINE.length - 1 && (
                    <div className={`w-0.5 flex-1 mt-2 min-h-[20px] ${
                      t.estado === 'completado' ? 'bg-emerald-700' : 'bg-slate-800'
                    }`} />
                  )}
                </div>
                <div className="flex-1 pb-5">
                  <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <span className={`text-sm font-black px-2 py-0.5 rounded ${
                        t.estado === 'completado' ? 'bg-emerald-900/40 text-emerald-300' :
                        t.estado === 'en_curso' ? 'bg-amber-900/40 text-amber-300' :
                        'bg-slate-800 text-slate-400'
                      }`}>
                        {t.periodo}
                      </span>
                      {t.estado === 'en_curso' && (
                        <span className="text-xs bg-amber-600 text-white px-2 py-0.5 rounded-full font-bold animate-pulse">
                          AHORA
                        </span>
                      )}
                    </div>
                    <p className="text-white font-bold text-sm">{t.evento}</p>
                    <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">{t.detalle}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Checklist UCOT */}
          <div className="bg-slate-900 rounded-xl border border-primary-800/40 overflow-hidden">
            <div className="px-4 py-3 border-b border-primary-800/40 bg-primary-900/20">
              <p className="font-bold text-primary-300 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" /> Checklist estratégico para UCOT — ¿Qué hacer AHORA?
              </p>
            </div>
            <div className="p-4 space-y-3">
              {[
                { prioridad: 'URGENTE', accion: 'Contratar asesor legal especializado en contratos de concesión de transporte público', deadline: 'Antes de Q3 2026' },
                { prioridad: 'URGENTE', accion: 'Presentar propuesta técnica formal para operar alimentadoras en los corredores A y B', deadline: 'Q3 2026' },
                { prioridad: 'ALTA', accion: 'Mapear recorridos de las 5 alimentadoras propuestas con datos GPS reales', deadline: '2026' },
                { prioridad: 'ALTA', accion: 'Calcular viabilidad financiera con tarifa $420 UYU/km en escenarios optimista/conservador/pesimista', deadline: '2026' },
                { prioridad: 'MEDIA', accion: 'Evaluar renovación de flota (buses accesibles, puertas al nivel de parada BRT)', deadline: '2027' },
                { prioridad: 'MEDIA', accion: 'Negociar con MTOP/IMM posición preferente como operador histórico de los corredores', deadline: '2026-2027' },
                { prioridad: 'INFO', accion: 'Monitorear avance de obras y ajustar servicios transitoriamente durante la construcción', deadline: '2027-2029' },
              ].map(item => (
                <div key={item.accion} className="flex items-start gap-3">
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded shrink-0 mt-0.5 ${
                    item.prioridad === 'URGENTE' ? 'bg-red-900/50 text-red-300 border border-red-700/50' :
                    item.prioridad === 'ALTA' ? 'bg-amber-900/50 text-amber-300 border border-amber-700/50' :
                    item.prioridad === 'MEDIA' ? 'bg-blue-900/50 text-blue-300 border border-blue-700/50' :
                    'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}>
                    {item.prioridad}
                  </span>
                  <div className="flex-1">
                    <p className="text-slate-200 text-sm">{item.accion}</p>
                    <p className="text-slate-500 text-xs mt-0.5">Deadline: {item.deadline}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Nota fuentes */}
          <div className="flex items-start gap-2 text-xs text-slate-600">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Datos basados en: MTOP (publicación estudios técnicos BRT, abril 2026), El Observador, La Diaria, Subrayado, Caras y Caretas.
              US$490M inversión confirmada. Inicio obras enero 2027 confirmado. Tarifas $/km estimadas sobre contratos vigentes de CUTCSA y COME.
            </span>
          </div>
        </div>
      )}

      {/* ══════════════════ TAB: BENCHMARKS INTERNACIONALES ══════════════════ */}
      {tabActiva === 'benchmarks' && (
        <div className="space-y-5">
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <p className="text-slate-300 text-sm leading-relaxed">
              Análisis de los 5 sistemas BRT más relevantes del mundo para contextualizar el proyecto de Montevideo.
              Los benchmarks muestran qué funciona, qué falla y qué es directamente aplicable a UCOT.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {BENCHMARKS_BRT.map(b => (
              <div key={b.ciudad} className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800" style={{ borderLeftColor: b.color, borderLeftWidth: 4 }}>
                  <p className="font-bold text-white text-sm">{b.bandera} {b.ciudad}</p>
                  <p className="text-slate-400 text-xs mt-0.5">{b.pais} · Desde {b.inicioOp}</p>
                </div>
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { l: 'Red', v: `${b.kmRed} km` },
                      { l: 'Pas/día', v: (b.pasajerosDia / 1_000_000).toFixed(1) + 'M' },
                      { l: 'km/h', v: b.velocidadKmh },
                    ].map(({ l, v }) => (
                      <div key={l} className="bg-slate-800 rounded-lg p-2 text-center">
                        <p className="text-slate-500 text-[10px]">{l}</p>
                        <p className="text-white font-bold text-sm">{v}</p>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="text-slate-500 text-[10px] uppercase font-bold mb-1">Modelo</p>
                    <p className="text-slate-300 text-xs">{b.modelo}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-[10px] uppercase font-bold mb-1">Lección clave</p>
                    <p className="text-slate-300 text-xs">{b.leccion}</p>
                  </div>
                  <div className="bg-emerald-900/20 rounded-lg p-2">
                    <p className="text-[10px] text-emerald-400 font-bold uppercase mb-1">Fortaleza</p>
                    <p className="text-emerald-300 text-xs">{b.fortaleza}</p>
                  </div>
                  <div className="bg-red-900/20 rounded-lg p-2">
                    <p className="text-[10px] text-red-400 font-bold uppercase mb-1">Riesgo a evitar</p>
                    <p className="text-red-300 text-xs">{b.riesgo}</p>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${
                      b.relevanciaUCOT.startsWith('MUY ALTA') ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700/50' :
                      b.relevanciaUCOT.startsWith('ALTA') ? 'bg-primary-900/50 text-primary-300 border-primary-700/50' :
                      'bg-slate-800 text-slate-400 border-slate-700'
                    }`}>
                      {b.relevanciaUCOT.split(' — ')[0]}
                    </span>
                    <span className="text-slate-500 text-[10px]">para UCOT</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Tabla comparativa */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800">
              <p className="font-bold text-sm">Comparativa de KPIs internacionales</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/60">
                    <th className="text-left px-3 py-2.5 text-slate-400 font-medium">Sistema</th>
                    <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Km red</th>
                    <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Pas/km/día</th>
                    <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Costo/km (USD)</th>
                    <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Velocidad</th>
                    <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Tarifa USD</th>
                  </tr>
                </thead>
                <tbody>
                  {BENCHMARKS_BRT.map(b => (
                    <tr key={b.ciudad} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="px-3 py-2.5 font-medium text-white">{b.bandera} {b.ciudad.split(' — ')[0]}</td>
                      <td className="px-3 py-2.5 text-right text-slate-300">{b.kmRed}</td>
                      <td className="px-3 py-2.5 text-right text-slate-300">{Math.round(b.pasajerosDia / b.kmRed)}</td>
                      <td className="px-3 py-2.5 text-right text-slate-300">${b.costoKm}</td>
                      <td className="px-3 py-2.5 text-right text-slate-300">{b.velocidadKmh} km/h</td>
                      <td className="px-3 py-2.5 text-right text-slate-300">${b.tarifaUSD}</td>
                    </tr>
                  ))}
                  <tr className="bg-primary-900/20 font-bold">
                    <td className="px-3 py-2.5 text-primary-300">🇺🇾 Montevideo (objetivo)</td>
                    <td className="px-3 py-2.5 text-right text-primary-300">~58</td>
                    <td className="px-3 py-2.5 text-right text-primary-300">~14,000</td>
                    <td className="px-3 py-2.5 text-right text-primary-300">~$4.0</td>
                    <td className="px-3 py-2.5 text-right text-primary-300">~28 km/h</td>
                    <td className="px-3 py-2.5 text-right text-primary-300">~$0.50</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════ TAB: PLAN OBRAS ══════════════════ */}
      {tabActiva === 'obras' && (
        <div className="space-y-5">
          <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-4 flex items-start gap-3">
            <Wrench className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-300">La construcción es el mayor riesgo operativo</p>
              <p className="text-amber-400/80 text-sm mt-1">
                Durante las obras (2027-2029), UCOT debe mantener el servicio con desvíos y lanzaderas,
                coordinar con la IMM y demostrar resiliencia operativa. Esto es una oportunidad de visibilidad.
              </p>
            </div>
          </div>

          {PLAN_OBRAS.map(fase => (
            <div key={fase.fase} className={`rounded-xl border overflow-hidden ${colorFase[fase.color]}`}>
              <div className={`px-4 py-3 border-b ${colorFase[fase.color]}`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className={`font-bold text-sm ${colorFaseText[fase.color]}`}>{fase.fase}</p>
                  <span className={`text-xs px-2 py-0.5 rounded font-mono ${colorFaseText[fase.color]} bg-slate-900/60`}>
                    {fase.periodo}
                  </span>
                </div>
              </div>
              <div className="p-4">
                <div className="space-y-2">
                  {fase.acciones.map((a, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <ChevronRight className={`w-4 h-4 shrink-0 mt-0.5 ${colorFaseText[fase.color]}`} />
                      <p className="text-slate-300 text-sm">{a}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}

          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <p className="text-xs text-slate-500 uppercase font-bold mb-3 flex items-center gap-2">
              <Layers className="w-4 h-4" /> Capacidades digitales de SkillRoute para la fase de obras
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                ['🗺️ Módulo de desvíos activo', 'Activar rutas alternativas con un click y notificar conductores en tiempo real'],
                ['📡 GPS tracking continuo', 'Monitorear cumplimiento de desvíos y detectar incidentes al instante'],
                ['📊 KPIs en tiempo real', 'Reportar a IMM/MTOP sobre niveles de servicio durante obras'],
                ['🔔 Alertas a pasajeros', 'Sistema de notificaciones sobre cambios de recorrido por obras'],
                ['🗓️ Distribución dinámica', 'Reasignar coches y conductores automáticamente según la fase de obra activa'],
                ['📋 Boletín adaptado', 'Generar boletines de inspección actualizados con las nuevas rutas de desvío'],
              ].map(([titulo, desc]) => (
                <div key={titulo as string} className="flex items-start gap-2 bg-slate-800 rounded-xl p-3">
                  <p className="text-sm font-medium text-white mt-0.5">{titulo}</p>
                  <p className="text-slate-400 text-xs mt-1">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════ TAB: SIMULADOR ══════════════════ */}
      {tabActiva === 'simulador' && (
        <div className="space-y-5">
          <p className="text-slate-400 text-sm">
            Seleccioná un escenario de desvío para ver el plan de contingencia operativa y el impacto estimado.
          </p>

          {/* Selector escenario */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {ESCENARIOS_DESVIO.map(e => (
              <button
                key={e.id}
                onClick={() => setEscenarioSel(e.id)}
                className={`text-left px-4 py-3 rounded-xl border transition-all ${
                  escenarioSel === e.id
                    ? 'border-primary-500 bg-primary-950/30'
                    : 'border-slate-700 bg-slate-900 hover:border-slate-600'
                }`}
              >
                <p className={`font-bold text-sm ${escenarioSel === e.id ? 'text-primary-300' : 'text-white'}`}>{e.titulo}</p>
                <p className="text-slate-400 text-xs mt-0.5">{e.tramo}</p>
              </button>
            ))}
          </div>

          {/* Detalle del escenario */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <div className="px-4 py-4 border-b border-slate-800 bg-slate-800/40">
              <h3 className="font-bold text-white text-lg">{escenario.titulo}</h3>
              <p className="text-slate-300 text-sm mt-1">{escenario.descripcion}</p>
            </div>

            {/* Métricas del impacto */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border-b border-slate-800 divide-x divide-slate-800">
              {[
                { l: 'Pasajeros afectados/día', v: escenario.pasajerosDesplazados.toLocaleString(), color: 'text-amber-400' },
                { l: 'Líneas impactadas', v: escenario.lineasAfectadas.join(', '), color: 'text-red-400' },
                { l: 'Duración estimada', v: escenario.duracionEstMeses < 1 ? '1 día' : `${escenario.duracionEstMeses} meses`, color: 'text-white' },
                { l: '+min viaje promedio', v: `+${escenario.impactoPassengerMin} min`, color: 'text-orange-400' },
              ].map(({ l, v, color }) => (
                <div key={l} className="px-4 py-3 text-center">
                  <p className="text-slate-500 text-[10px] uppercase">{l}</p>
                  <p className={`font-bold text-sm mt-1 ${color}`}>{v}</p>
                </div>
              ))}
            </div>

            {/* Plan de desvío */}
            <div className="p-4">
              <p className="text-xs text-slate-500 uppercase font-bold mb-3 flex items-center gap-2">
                <Play className="w-3.5 h-3.5" /> Plan de contingencia activado
              </p>
              <div className="space-y-2">
                {escenario.planDesvio.map((paso, i) => {
                  const tipoBadge: Record<string, string> = {
                    desvio: 'bg-amber-900/40 text-amber-300 border-amber-700/50',
                    refuerzo: 'bg-blue-900/40 text-blue-300 border-blue-700/50',
                    especial: 'bg-purple-900/40 text-purple-300 border-purple-700/50',
                    info: 'bg-slate-800 text-slate-300 border-slate-700',
                    coordinacion: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50',
                  };
                  return (
                    <div key={i} className="flex items-start gap-3 bg-slate-800/40 rounded-xl p-3">
                      <div className="w-6 h-6 rounded-lg bg-slate-700 flex items-center justify-center text-xs font-black text-slate-300 shrink-0">
                        {i + 1}
                      </div>
                      <div className="flex-1">
                        <p className="text-slate-200 text-sm">{paso.accion}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border shrink-0 ${tipoBadge[paso.tipo]}`}>
                        {paso.tipo.toUpperCase()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Costo adicional */}
            <div className="px-4 py-3 border-t border-slate-800 bg-slate-800/20 flex justify-between items-center">
              <span className="text-slate-400 text-sm">Costo operativo adicional estimado/día</span>
              <span className="font-mono font-black text-amber-400">
                ${escenario.costoAdicionalDia.toLocaleString()} UYU
              </span>
            </div>
          </div>

          {/* Simulador tarifa/km */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
            <p className="font-bold text-white mb-1 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-primary-400" /> Simulador de ingresos $/km
            </p>
            <p className="text-slate-400 text-xs mb-5">Ajustá los parámetros para ver el impacto en el margen por bus</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-xs text-slate-400 font-bold uppercase">Tarifa por km (UYU)</label>
                  <span className="font-mono font-black text-primary-400">${tarifaKmSlider}</span>
                </div>
                <input
                  type="range" min={300} max={600} step={10}
                  value={tarifaKmSlider}
                  onChange={e => setTarifaKmSlider(Number(e.target.value))}
                  className="w-full accent-primary-500"
                />
                <div className="flex justify-between text-[10px] text-slate-600">
                  <span>$300 (pesimista)</span><span>$420 (base)</span><span>$600 (optimista)</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-xs text-slate-400 font-bold uppercase">Km operados/bus/día</label>
                  <span className="font-mono font-black text-primary-400">{kmDiaSlider} km</span>
                </div>
                <input
                  type="range" min={120} max={350} step={10}
                  value={kmDiaSlider}
                  onChange={e => setKmDiaSlider(Number(e.target.value))}
                  className="w-full accent-primary-500"
                />
                <div className="flex justify-between text-[10px] text-slate-600">
                  <span>120 (pocas rutas)</span><span>220 (base)</span><span>350 (full alimentadoras)</span>
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">
              {[
                { l: 'Ingreso/bus/día', v: `$${ingresoBRTCalc.toLocaleString()} UYU`, color: 'text-emerald-400' },
                { l: 'Margen/bus/día', v: `$${margenBRTCalc.toLocaleString()} UYU`, color: margenBRTCalc > 0 ? 'text-emerald-400' : 'text-red-400' },
                { l: 'vs modelo actual', v: `${mejoraPctCalc > 0 ? '+' : ''}${mejoraPctCalc}%`, color: mejoraPctCalc > 0 ? 'text-emerald-400' : 'text-red-400' },
              ].map(({ l, v, color }) => (
                <div key={l} className="bg-slate-800 rounded-xl p-3 text-center">
                  <p className="text-slate-500 text-[10px]">{l}</p>
                  <p className={`font-black text-lg ${color}`}>{v}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 text-xs text-slate-600 flex items-center gap-1">
              <Info className="w-3 h-3" />
              <span>Ingreso total flota (257 buses): ${Math.round(ingresoBRTCalc * 257 / 1_000_000).toFixed(1)}M UYU/día · ${Math.round(ingresoBRTCalc * 257 * 26 / 1_000_000).toFixed(0)}M UYU/mes</span>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════ TAB: UCOT → ASM ══════════════════ */}
      {tabActiva === 'propuesta' && (
        <div className="space-y-5">
          {/* Hero */}
          <div className="bg-gradient-to-r from-primary-900/40 to-slate-900 rounded-2xl border border-primary-700/40 p-6">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-primary-600/30 border border-primary-500/50 flex items-center justify-center shrink-0">
                <Award className="w-8 h-8 text-primary-400" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-white">{PROPUESTA_ASM.titulo}</h2>
                <p className="text-primary-300 mt-1">{PROPUESTA_ASM.subtitulo}</p>
              </div>
            </div>
          </div>

          {/* Ventajas competitivas */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800">
              <p className="font-bold text-sm flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-400" /> ¿Por qué UCOT es el operador natural del BRT?
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-slate-800">
              {PROPUESTA_ASM.ventajasCompetitivas.map(v => (
                <div key={v.titulo} className="p-4 border-b border-slate-800/50">
                  <p className="font-bold text-white text-sm flex items-center gap-2">
                    <span className="text-xl">{v.icono}</span> {v.titulo}
                  </p>
                  <p className="text-slate-400 text-xs mt-1 leading-relaxed">{v.detalle}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 3 opciones de negocio */}
          <div>
            <p className="text-xs text-slate-500 uppercase font-bold mb-3">3 modelos de participación posibles</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.values(PROPUESTA_ASM.modeloComercial).map((op, i) => (
                <div key={op.nombre} className={`bg-slate-900 rounded-xl border overflow-hidden ${
                  i === 1 ? 'border-primary-600/60' : 'border-slate-700'
                }`}>
                  {i === 1 && (
                    <div className="bg-primary-600 px-3 py-1 text-center">
                      <p className="text-white text-xs font-black">RECOMENDADO</p>
                    </div>
                  )}
                  <div className="p-4">
                    <p className="font-bold text-white text-sm">{op.nombre}</p>
                    <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">{op.descripcion}</p>
                    <div className="mt-4 space-y-2">
                      {[
                        { l: 'Ingresos anuales est.', v: `US$ ${(op.ingresosAnualesEstUSD / 1_000_000).toFixed(1)}M` },
                        { l: 'Coches involucrados', v: op.cochesInvolucrados > 0 ? op.cochesInvolucrados : 'N/A' },
                        { l: 'Conductores', v: op.conductores },
                        { l: 'Plazo contrato', v: op.plazo },
                      ].map(({ l, v }) => (
                        <div key={l} className="flex justify-between text-xs">
                          <span className="text-slate-500">{l}</span>
                          <span className="text-white font-medium">{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* KPIs a alcanzar */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800">
              <p className="font-bold text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary-400" /> Brecha UCOT vs estándares internacionales BRT
              </p>
            </div>
            <div className="divide-y divide-slate-800/50">
              {PROPUESTA_ASM.kpisInternacionales.map(k => (
                <div key={k.kpi} className="px-4 py-3 grid grid-cols-1 md:grid-cols-4 gap-2 items-start">
                  <p className="text-white text-sm font-medium">{k.kpi}</p>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase">Meta BRT</p>
                    <p className="text-emerald-400 font-bold text-sm">{k.meta}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase">UCOT actual</p>
                    <p className="text-amber-400 font-bold text-sm">{k.ucotActual}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase">Plan de cierre</p>
                    <p className="text-slate-300 text-xs leading-relaxed">{k.brecha}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Multi-tenant / SaaS para ASM */}
          <div className="bg-slate-900 rounded-2xl border border-primary-700/40 overflow-hidden">
            <div className="px-5 py-4 border-b border-primary-700/30 bg-primary-900/20">
              <p className="font-black text-white text-lg flex items-center gap-2">
                <Layers className="w-5 h-5 text-primary-400" /> Plataforma Multi-Empresa — El paso natural al sistema completo
              </p>
              <p className="text-primary-300/80 text-sm mt-1">
                SkillRoute está diseñado como plataforma multi-tenant. UCOT es el primer cliente, la ASM puede ser el administrador global.
              </p>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  {
                    rol: 'Empresa Operadora', ejemplo: 'UCOT, COETC, COME, CUTCSA',
                    icono: '🚌', color: 'border-blue-700/40 bg-blue-900/10',
                    capacidades: [
                      'Su propia flota, conductores y líneas',
                      'KPIs operativos en tiempo real',
                      'Gestión de turnos y cartones',
                      'Módulo de contingencias y desvíos',
                      'Dashboard CEO con proyecciones',
                    ],
                  },
                  {
                    rol: 'Administrador ASM', ejemplo: 'Agencia del Sistema Metropolitano',
                    icono: '🏛️', color: 'border-primary-600/60 bg-primary-900/20',
                    capacidades: [
                      'Vista global de todas las empresas',
                      'KPIs consolidados por corredor BRT',
                      'Gestión de licitaciones y contratos',
                      'Validación de km facturados por empresa',
                      'Panel de cumplimiento MTOP/IMM',
                      'Comparación de desempeño entre operadores',
                    ],
                  },
                  {
                    rol: 'Regulador / MTOP-IMM', ejemplo: 'Solo lectura y auditoría',
                    icono: '⚖️', color: 'border-slate-700 bg-slate-900/40',
                    capacidades: [
                      'Acceso de solo-lectura a todos los datos',
                      'Reportes de cumplimiento automáticos',
                      'Auditoría de km facturados vs operados',
                      'Alertas de incumplimiento de KPIs',
                      'Exportación a formatos MTOP',
                    ],
                  },
                ].map(t => (
                  <div key={t.rol} className={`rounded-xl border p-4 ${t.color}`}>
                    <p className="text-xl mb-2">{t.icono}</p>
                    <p className="font-bold text-white text-sm">{t.rol}</p>
                    <p className="text-slate-500 text-xs mb-3">{t.ejemplo}</p>
                    <div className="space-y-1.5">
                      {t.capacidades.map(c => (
                        <div key={c} className="flex items-start gap-1.5">
                          <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                          <p className="text-slate-300 text-xs">{c}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-4">
                <p className="text-amber-300 text-sm font-bold mb-1">💡 Visión de negocio SaaS</p>
                <p className="text-amber-400/80 text-sm leading-relaxed">
                  Con 4 empresas operadoras (UCOT, COETC, COME, CUTCSA) + la ASM como cliente,
                  la plataforma genera ingresos por licencia de uso (~US$2,000-5,000/empresa/mes).
                  UCOT no solo opera buses — también vende tecnología al sistema.
                </p>
              </div>
            </div>
          </div>

          {/* Llamada a acción */}
          <div className="bg-emerald-900/20 border border-emerald-700/40 rounded-2xl p-6 text-center">
            <Building2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
            <h3 className="text-xl font-black text-white mb-2">UCOT ya tiene la plataforma. Solo falta el contrato.</h3>
            <p className="text-emerald-300/80 text-sm max-w-2xl mx-auto mb-4">
              SkillRoute monitorea GPS en tiempo real, gestiona desvíos, genera boletines, distribuye coches y conductores
              automáticamente, y genera reportes KPI para el regulador. Es exactamente lo que la ASM necesitará operar un sistema BRT.
              Ninguna otra empresa operadora en Uruguay tiene esto hoy.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {['GPS integrado en tiempo real', 'Multi-empresa listo', 'Gestión de contingencias digital', 'KPIs automáticos para regulador', '691 empleados gestionados', '29 líneas activas'].map(item => (
                <span key={item} className="bg-emerald-900/40 border border-emerald-700/50 text-emerald-300 px-3 py-1 rounded-full text-xs font-medium">
                  ✓ {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
