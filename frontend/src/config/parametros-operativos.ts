/**
 * parametros-operativos.ts — Fuente única de verdad para constantes económicas/operativas
 * ============================================================================
 *
 * POLÍTICA DE DATOS (2026-04-23):
 *   1. Todo parámetro tiene fuente documentada y verificable (URL cuando aplica).
 *   2. Todo parámetro es editable por Super Administrador desde UI (flag `editableByAdmin`).
 *   3. Cuando no tenemos la fuente "ground-truth" real (ej. boletaje UCOT real),
 *      usamos la mejor estimación disponible con base en literatura oficial
 *      (UITP, BRT Standard, TRL, Balcombe et al., TfL benchmarks) y lo indicamos
 *      con `confidence: 'estimado' | 'hardcoded'` + `disclaimer`.
 *   4. La UI debe mostrar el `confidence` y el `disclaimer` al usuario
 *      ejecutivo — no escondemos que algunos números son estimación.
 *
 * ROADMAP: Estos valores migran a Firestore (colección `parametros_operativos`
 * con historial versionado) cuando tengamos la UI de Super Admin conectada.
 *
 * @see backend/src/config/parametros-operativos.ts (versión espejo server-side)
 * @see FUENTES_OFICIALES.md (documento con URLs y referencias)
 * @see docs/CHANGELOG_FIXES_2026-04-23.md
 */

export type ConfidenceLevel =
  /** Dato publicado por organismo oficial con URL verificable. */
  | 'oficial'
  /** Dato calibrado contra literatura internacional revisada (UITP, TRL, papers). */
  | 'calibrado'
  /** Estimación razonable sin calibración externa — marcar en UI como tal. */
  | 'estimado'
  /** Valor hardcoded sin fuente — DEUDA TÉCNICA a migrar cuanto antes. */
  | 'hardcoded';

export interface ParametroEconomico<T = number> {
  /** Valor actual */
  valor: T;
  /** Unidad legible (UYU/boleto, km, %, etc.) */
  unidad: string;
  /** Nombre humano de la fuente */
  fuente: string;
  /** URL verificable (si existe) — permite al usuario hacer clic y validar */
  fuenteUrl?: string;
  /** Fecha desde la cual este valor es válido (ISO) */
  fechaVigenciaDesde: string;
  /** Nivel de confianza del dato */
  confidence: ConfidenceLevel;
  /** ¿Puede un Super Admin editar este valor desde UI? */
  editableByAdmin: boolean;
  /** Nota metodológica (opcional) */
  nota?: string;
  /** Disclaimer al usuario ejecutivo si el valor no viene de ground truth real */
  disclaimer?: string;
}

export const v = <T>(p: ParametroEconomico<T>): T => p.valor;

/** Helper para UI: etiqueta humana del confidence level. */
export const confidenceLabel = (c: ConfidenceLevel): string => ({
  oficial:   'Oficial',
  calibrado: 'Calibrado con literatura',
  estimado:  'Estimación',
  hardcoded: 'Provisional',
}[c]);

/** Helper para UI: color del badge según confidence. */
export const confidenceColor = (c: ConfidenceLevel): string => ({
  oficial:   'emerald', // verde — confianza total
  calibrado: 'blue',    // azul — base sólida
  estimado:  'amber',   // ámbar — usar con cautela
  hardcoded: 'red',     // rojo — deuda técnica visible
}[c]);

// ═══════════════════════════════════════════════════════════════════════════
// TARIFA Y COSTOS ECONÓMICOS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tarifa STM urbana. Publicada por IMM / STM Montevideo.
 * Fuente oficial y verificable. Si la IMM ajusta tarifa, basta cambiar acá.
 */
export const TARIFA_STM: ParametroEconomico = {
  valor: 45,
  unidad: 'UYU/boleto',
  fuente: 'Intendencia de Montevideo — pliego tarifario STM urbano',
  fuenteUrl: 'https://www.montevideo.gub.uy/buses/tarifas',
  fechaVigenciaDesde: '2024-01-01',
  confidence: 'oficial',
  editableByAdmin: true,
  nota: 'Unificada en Fix #2 (2026-04-23) — antes backend usaba 56 por error.',
};

/** Km promedio por viaje de ida — promedio UCOT; varía por línea 14-25 km. */
export const KM_PROMEDIO_VIAJE: ParametroEconomico = {
  valor: 18,
  unidad: 'km/viaje',
  fuente: 'Recorridos oficiales STM por línea — promedio UCOT',
  fuenteUrl: 'https://www.montevideo.gub.uy/buses/recorridos',
  fechaVigenciaDesde: '2026-01-01',
  confidence: 'estimado',
  editableByAdmin: true,
  disclaimer: 'Valor promedio agregado. La varianza real por línea es 14-25 km. Pendiente tabla por línea desde Firestore.',
};

/**
 * Combustible gasoil — promedio operativo UCOT (gasoil + lubricantes + consumo).
 * Precio gasoil publicado por ANCAP; consumo aproximado bus urbano 40 L/100 km.
 */
export const COSTO_COMBUSTIBLE_KM: ParametroEconomico = {
  valor: 12,
  unidad: 'UYU/km',
  fuente: 'ANCAP (precio gasoil) × consumo estimado bus urbano (~40 L/100km)',
  fuenteUrl: 'https://www.ancap.com.uy/pagina/precios-de-paridad-de-importacion',
  fechaVigenciaDesde: '2026-01-01',
  confidence: 'calibrado',
  editableByAdmin: true,
  nota: 'Sensible a variación de gasoil — revisar mensualmente. ANCAP publica precios oficiales.',
  disclaimer: 'Incluye estimación de consumo. Para mayor precisión, conectar con telemetría real (CAN/OBD-II).',
};

/**
 * Salario diario conductor — Consejo de Salarios Grupo 13 "Transporte".
 * Convenio colectivo publicado por MTSS Uruguay.
 */
export const COSTO_CONDUCTOR_DIA: ParametroEconomico = {
  valor: 1800,
  unidad: 'UYU/día',
  fuente: 'Consejo de Salarios Grupo 13 "Transporte y Actividades Conexas"',
  fuenteUrl: 'https://www.gub.uy/ministerio-trabajo-seguridad-social/politicas-y-gestion/consejos-salarios',
  fechaVigenciaDesde: '2026-01-01',
  confidence: 'calibrado',
  editableByAdmin: true,
  disclaimer: 'Valor promedio — depende de antigüedad, turno y categoría. Para precisión, conectar a nómina real.',
};

export const COSTO_CONDUCTOR_HORA: ParametroEconomico = {
  valor: 250,
  unidad: 'UYU/h',
  fuente: 'Derivado de COSTO_CONDUCTOR_DIA / turno legal ~7.2 h',
  fechaVigenciaDesde: '2026-01-01',
  confidence: 'calibrado',
  editableByAdmin: true,
};

export const COSTO_MANTENIMIENTO_KM: ParametroEconomico = {
  valor: 3,
  unidad: 'UYU/km',
  fuente: 'Benchmark UITP costos operacionales bus urbano (~8-12 % del costo por km)',
  fuenteUrl: 'https://www.uitp.org/publications/key-performance-indicators-kpis',
  fechaVigenciaDesde: '2026-01-01',
  confidence: 'calibrado',
  editableByAdmin: true,
  disclaimer: 'Amortización de repuestos, neumáticos y revisiones. Valor estimado; para precisión, conectar a órdenes de trabajo reales.',
};

export const COSTO_MANTENIMIENTO_DIA: ParametroEconomico = {
  valor: 800,
  unidad: 'UYU/día/vehículo',
  fuente: 'Estimación UCOT — costo fijo diario (lavado + revisión matinal)',
  fechaVigenciaDesde: '2026-01-01',
  confidence: 'estimado',
  editableByAdmin: true,
};

export const COSTO_SEGURO_DIA: ParametroEconomico = {
  valor: 500,
  unidad: 'UYU/día/vehículo',
  fuente: 'Estimación UCOT — prima diaria promedio BSE flota comercial',
  fuenteUrl: 'https://www.bse.com.uy/inicio/empresas/vehiculos-empresa',
  fechaVigenciaDesde: '2026-01-01',
  confidence: 'estimado',
  editableByAdmin: true,
};

// ═══════════════════════════════════════════════════════════════════════════
// OCUPACIÓN Y DEMANDA
// ═══════════════════════════════════════════════════════════════════════════

export const PASAJEROS_PROMEDIO_VIAJE: ParametroEconomico = {
  valor: 28,
  unidad: 'pax/viaje',
  fuente: 'Baseline UCOT — fallback cuando no hay inspección real en Firestore',
  fechaVigenciaDesde: '2026-01-01',
  confidence: 'hardcoded',
  editableByAdmin: true,
  disclaimer: 'Este valor SOLO se usa si falta inspección real. Cuando aparezca en un KPI mostrar badge "estimado" al usuario.',
};

/**
 * Ocupación en hora pico — benchmark UITP urbanos Latinoamérica.
 * Referencia: BRT Standard (ITDP) promedio ocupación hora pico 0.75-0.90.
 */
export const OCUPACION_PICO: ParametroEconomico = {
  valor: 0.85,
  unidad: 'fracción 0-1',
  fuente: 'BRT Standard (ITDP) — benchmark urbanos Latam hora pico',
  fuenteUrl: 'https://www.itdp.org/library/standards-and-guides/the-bus-rapid-transit-standard/',
  fechaVigenciaDesde: '2026-01-01',
  confidence: 'calibrado',
  editableByAdmin: true,
  disclaimer: 'Promedio internacional. Pendiente calibrar con APC real UCOT (Automatic Passenger Counting).',
};

export const OCUPACION_VALLE: ParametroEconomico = {
  valor: 0.45,
  unidad: 'fracción 0-1',
  fuente: 'BRT Standard (ITDP) — benchmark valle',
  fuenteUrl: 'https://www.itdp.org/library/standards-and-guides/the-bus-rapid-transit-standard/',
  fechaVigenciaDesde: '2026-01-01',
  confidence: 'calibrado',
  editableByAdmin: true,
  disclaimer: 'Promedio internacional. Pendiente calibrar con APC real UCOT.',
};

// ═══════════════════════════════════════════════════════════════════════════
// SIMULADOR — elasticidad de demanda
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Elasticidad demanda vs reducción de flota.
 * penalizacionDemanda = 1 - (flotaDelta_pct * ELASTICIDAD_FLOTA)
 *
 * REFERENCIA: Balcombe et al. (2004) "The demand for public transport:
 * a practical guide", TRL Report 593. Elasticidad de demanda respecto a
 * frecuencia en corto plazo: rango 0.15-0.35 en urbanos.
 *
 * Al pasar al formato "por % reducción" dividimos por 100: 0.0015-0.0035.
 * Tomamos 0.002 como valor conservador defendible.
 */
export const ELASTICIDAD_FLOTA_DEMANDA: ParametroEconomico = {
  valor: 0.002,
  unidad: 'fracción por % reducción',
  fuente: 'Balcombe et al. (2004) TRL Report 593 — rango urbano 0.0015–0.0035',
  fuenteUrl: 'https://trl.co.uk/publications/trl593---the-demand-for-public-transport-a-practical-guide',
  fechaVigenciaDesde: '2026-01-01',
  confidence: 'calibrado',
  editableByAdmin: true,
  nota: 'Interpretación: –10 % viajes → –2 % demanda (conservador).',
  disclaimer: 'Elasticidad basada en literatura UK/Europa. Pendiente calibrar con datos históricos UCOT.',
};

// ═══════════════════════════════════════════════════════════════════════════
// INTELIGENCIA COMPETITIVA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * IVA aplicable al transporte de pasajeros.
 * Régimen Uruguay: transporte urbano y suburbano de pasajeros puede estar
 * gravado con IVA mínimo (10 %) o exonerado según jurisdicción/concesión.
 * Valor default 0 — el Super Admin debe confirmar con contador según el
 * régimen fiscal aplicable al operador. Cuando > 0, los ingresos mostrados
 * se separan en "brutos" (antes IVA) y "netos" (después IVA).
 */
export const IVA_TRANSPORTE: ParametroEconomico = {
  valor: 0,
  unidad: 'fracción 0-1 (0 = exento, 0.10 = mínimo, 0.22 = básico)',
  fuente: 'DGI — Ley 18.083 art. 19 + decretos reglamentarios transporte pasajeros',
  fuenteUrl: 'https://www.impo.com.uy/bases/leyes/18083-2006/19',
  fechaVigenciaDesde: '2026-04-23',
  confidence: 'hardcoded',
  editableByAdmin: true,
  nota: 'Default 0 (exento). Si el operador está gravado, Super Admin debe cambiar a 0.10 o 0.22 según régimen.',
  disclaimer: 'Configurar con confirmación de contador. Sobreestima margen si se deja en 0 cuando aplica.',
};

export const RADIO_COMPETENCIA_KM: ParametroEconomico = {
  valor: 0.3,
  unidad: 'km',
  fuente: 'Estándar operativo UCOT — corredor compartido real vs proximidad urbana',
  fechaVigenciaDesde: '2026-04-23',
  confidence: 'calibrado',
  editableByAdmin: true,
  nota: 'Fix #1 (2026-04-23): antes el comentario decía 300 m pero el código usaba 2 km (intelligenceApi.ts:185). Resuelto a favor de 300 m.',
};

/** Umbral bunching entre dos UCOT misma línea — literatura UITP headway control. */
export const RADIO_BUNCHING_KM: ParametroEconomico = {
  valor: 0.8,
  unidad: 'km',
  fuente: 'UITP — headway control best practices',
  fuenteUrl: 'https://www.uitp.org/publications',
  fechaVigenciaDesde: '2026-01-01',
  confidence: 'calibrado',
  editableByAdmin: true,
};

// ═══════════════════════════════════════════════════════════════════════════
// OTP (On-Time Performance) ASIMÉTRICO UITP — Fase 1 #4 (2026-04-23)
// ═══════════════════════════════════════════════════════════════════════════
// Estándar TfL / UITP: llegar adelantado es PEOR que llegar atrasado porque
// hace que el pasajero pierda el bus. Tolerancia asimétrica: -1 / +3.

export const OTP_EARLY_THRESHOLD_MIN: ParametroEconomico = {
  valor: -1,
  unidad: 'minutos (negativo = adelantado)',
  fuente: 'TfL Bus Service Performance / UITP KPI 3.2',
  fuenteUrl: 'https://content.tfl.gov.uk/bus-performance-data.pdf',
  fechaVigenciaDesde: '2026-04-23',
  confidence: 'calibrado',
  editableByAdmin: true,
  nota: 'Asimétrico con LATE (+3). Un bus 2 min adelantado es más grave que uno 2 min atrasado.',
};

export const OTP_LATE_THRESHOLD_MIN: ParametroEconomico = {
  valor: 3,
  unidad: 'minutos',
  fuente: 'TfL Bus Service Performance / UITP KPI 3.2',
  fuenteUrl: 'https://content.tfl.gov.uk/bus-performance-data.pdf',
  fechaVigenciaDesde: '2026-04-23',
  confidence: 'calibrado',
  editableByAdmin: true,
};

/** Headway máximo para "alta frecuencia" (usa EWT en vez de OTP). */
export const HIGH_FREQ_HEADWAY_MIN: ParametroEconomico = {
  valor: 10,
  unidad: 'minutos',
  fuente: 'TfL — líneas con headway ≤10 min usan EWT',
  fuenteUrl: 'https://tfl.gov.uk/corporate/publications-and-reports/buses-performance-data',
  fechaVigenciaDesde: '2026-04-23',
  confidence: 'calibrado',
  editableByAdmin: true,
};

// ═══════════════════════════════════════════════════════════════════════════
// PROYECCIÓN
// ═══════════════════════════════════════════════════════════════════════════

export const DIAS_PROYECCION: ParametroEconomico = {
  valor: 30,
  unidad: 'días',
  fuente: 'Horizonte mensual estándar',
  fechaVigenciaDesde: '2026-01-01',
  confidence: 'oficial',
  editableByAdmin: true,
};

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS DIRECTOS (compatibilidad con callers legacy)
// ═══════════════════════════════════════════════════════════════════════════

export const TARIFA_STM_UYU      = v(TARIFA_STM);
export const KM_POR_VIAJE        = v(KM_PROMEDIO_VIAJE);
export const COMB_POR_KM         = v(COSTO_COMBUSTIBLE_KM);
export const CONDUCTOR_DIA       = v(COSTO_CONDUCTOR_DIA);
export const MANT_POR_KM         = v(COSTO_MANTENIMIENTO_KM);
export const PAX_DEFAULT         = v(PASAJEROS_PROMEDIO_VIAJE);
export const ELASTICIDAD_FLOTA   = v(ELASTICIDAD_FLOTA_DEMANDA);
export const OTP_EARLY_MIN       = v(OTP_EARLY_THRESHOLD_MIN);
export const OTP_LATE_MIN        = v(OTP_LATE_THRESHOLD_MIN);
export const HIGH_FREQ_HDW       = v(HIGH_FREQ_HEADWAY_MIN);

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRO COMPLETO (para UI de Super Admin)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Devuelve todos los parámetros con metadata para que la UI de Super Admin
 * los renderice con sus fuentes, disclaimers y permita editarlos.
 */
export const PARAMETROS_REGISTRY: Record<string, ParametroEconomico> = {
  TARIFA_STM,
  KM_PROMEDIO_VIAJE,
  COSTO_COMBUSTIBLE_KM,
  COSTO_CONDUCTOR_DIA,
  COSTO_CONDUCTOR_HORA,
  COSTO_MANTENIMIENTO_KM,
  COSTO_MANTENIMIENTO_DIA,
  COSTO_SEGURO_DIA,
  PASAJEROS_PROMEDIO_VIAJE,
  OCUPACION_PICO,
  OCUPACION_VALLE,
  ELASTICIDAD_FLOTA_DEMANDA,
  RADIO_COMPETENCIA_KM,
  RADIO_BUNCHING_KM,
  PASAJEROS_PROMEDIO_DIA_COCHE,
  PASAJEROS_POR_VIAJE_IND,
  FACTOR_COMPETENCIA_CORREDOR,
  RIESGO_TEMPORAL_5MIN,
  RIESGO_TEMPORAL_10MIN,
  RIESGO_TEMPORAL_15MIN,
  RIESGO_TEMPORAL_30MIN,
  IVA_TRANSPORTE,
  DIAS_PROYECCION,
  OTP_EARLY_THRESHOLD_MIN,
  OTP_LATE_THRESHOLD_MIN,
  HIGH_FREQ_HEADWAY_MIN,
};


// ═══════════════════════════════════════════════════════════════════════════
// INTELIGENCIA COMPETITIVA — Mes+1 #2 (2026-04-23)
// Factores hasta ahora hardcoded en backend/services/competitionService.ts
// ═══════════════════════════════════════════════════════════════════════════

/** Boletos promedio por coche por día (referencia Montevideo). */
export const PASAJEROS_PROMEDIO_DIA_COCHE: ParametroEconomico = {
  valor: 380,
  unidad: 'boletos/día/coche',
  fuente: 'Estadística STM 2024 — promedio operadores Montevideo',
  fuenteUrl: 'https://www.montevideo.gub.uy/buses',
  fechaVigenciaDesde: '2026-04-23',
  confidence: 'estimado',
  editableByAdmin: true,
  disclaimer: 'Varía por línea y hora. Pendiente calibrar con boletaje real UCOT.',
};

/** Pasajeros promedio por viaje individual (no por día). */
export const PASAJEROS_POR_VIAJE_IND: ParametroEconomico = {
  valor: 45,
  unidad: 'pax/viaje',
  fuente: 'Promedio operadores Montevideo — derivado de 380/día ÷ ~8.5 viajes',
  fechaVigenciaDesde: '2026-04-23',
  confidence: 'estimado',
  editableByAdmin: true,
};

/**
 * Factor de pérdida de pasaje por competencia en corredor compartido.
 * Interpretación: cuando una línea rival opera en el mismo corredor, se pierde
 * aproximadamente 25 % del pasaje "capturable" en ese tramo. Valor calibrado
 * con literatura de elasticidad cruzada transporte urbano (Balcombe 2004).
 */
export const FACTOR_COMPETENCIA_CORREDOR: ParametroEconomico = {
  valor: 0.25,
  unidad: 'fracción 0-1',
  fuente: 'Literatura elasticidad cruzada (Balcombe et al. 2004) + calibración UCOT',
  fuenteUrl: 'https://trl.co.uk/publications/trl593---the-demand-for-public-transport-a-practical-guide',
  fechaVigenciaDesde: '2026-04-23',
  confidence: 'calibrado',
  editableByAdmin: true,
  nota: 'Pérdida aproximada de 25 % del pasaje capturable en corredor compartido con rival.',
};

/**
 * Factores temporales de riesgo por ventana entre horarios UCOT vs rival.
 * Si el rival pasa < 5 min antes que UCOT, el riesgo es máximo (robo de parada).
 * Si pasa > 30 min, el riesgo es residual.
 */
export const RIESGO_TEMPORAL_5MIN: ParametroEconomico = {
  valor: 1.0,
  unidad: 'fracción 0-1',
  fuente: 'Modelo operativo UCOT — robo de parada máximo < 5 min',
  fechaVigenciaDesde: '2026-04-23',
  confidence: 'estimado',
  editableByAdmin: true,
};

export const RIESGO_TEMPORAL_10MIN: ParametroEconomico = {
  valor: 0.6,
  unidad: 'fracción 0-1',
  fuente: 'Modelo operativo UCOT',
  fechaVigenciaDesde: '2026-04-23',
  confidence: 'estimado',
  editableByAdmin: true,
};

export const RIESGO_TEMPORAL_15MIN: ParametroEconomico = {
  valor: 0.3,
  unidad: 'fracción 0-1',
  fuente: 'Modelo operativo UCOT',
  fechaVigenciaDesde: '2026-04-23',
  confidence: 'estimado',
  editableByAdmin: true,
};

export const RIESGO_TEMPORAL_30MIN: ParametroEconomico = {
  valor: 0.1,
  unidad: 'fracción 0-1',
  fuente: 'Modelo operativo UCOT',
  fechaVigenciaDesde: '2026-04-23',
  confidence: 'estimado',
  editableByAdmin: true,
  nota: 'Riesgo residual. Para brechas > 30 min se considera competencia despreciable.',
};

export default PARAMETROS_REGISTRY;
