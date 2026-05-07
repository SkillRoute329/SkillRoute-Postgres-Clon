// Catálogo de metodologías en español — Módulo Cumplimiento V2
// Aparece en tooltips al hover sobre cada KPI

export interface MethodologyEntry {
  label: string;
  definicion: string;
  formula: string;
  aplicable: string;
  estandar: string;
  cobMinima: string;
  nMinimo: number;
}

export const METHODOLOGY_CATALOG: Record<string, MethodologyEntry> = {
  OTP: {
    label: 'OTP — Puntualidad',
    definicion: 'Porcentaje de viajes que llegan a la parada dentro de la ventana de tolerancia: hasta 1 minuto antes o hasta 5 minutos después de la hora programada.',
    formula: 'OTP = count(|desvMin| ≤ 5) / n × 100',
    aplicable: 'Líneas de baja frecuencia (intervalo > 12 min entre buses).',
    estandar: 'TCRP 165 §4.4.2',
    cobMinima: '70 %',
    nMinimo: 30,
  },
  EWT: {
    label: 'EWT — Exceso de espera',
    definicion: 'Tiempo adicional de espera del pasajero atribuible a irregularidades en el servicio, respecto al programado. Se calcula como la diferencia entre el tiempo promedio de espera observado y el programado.',
    formula: 'AWT = E[h²] / (2·E[h])   ·   EWT = AWT_observado − AWT_programado',
    aplicable: 'Líneas de alta frecuencia (intervalo ≤ 12 min entre buses).',
    estandar: 'TfL EWT methodology / UITP',
    cobMinima: '70 %',
    nMinimo: 30,
  },
  SD: {
    label: 'Servicio entregado (SD)',
    definicion: 'Porcentaje de viajes programados que efectivamente se operaron durante el período.',
    formula: 'SD = buses_únicos_observados / viajes_programados × 100  (aproximación GPS)',
    aplicable: 'Todas las líneas.',
    estandar: 'NYC MTA Service Delivery',
    cobMinima: '70 %',
    nMinimo: 1,
  },
  BUNCHING: {
    label: 'Índice de aglomeración',
    definicion: 'Porcentaje de pares consecutivos de buses donde el intervalo es menor al 50 % del intervalo mediano. Indica cuántos buses "se juntan" en la misma zona.',
    formula: 'BI = count(h_i < 0.5 × mediana_h) / n × 100',
    aplicable: 'Líneas de alta frecuencia.',
    estandar: 'NYC MTA Bunching Index / Transport Reviews 2024',
    cobMinima: '70 %',
    nMinimo: 5,
  },
  HEADWAY_CV: {
    label: 'Irregularidad de frecuencia (CV)',
    definicion: 'Coeficiente de variación de los intervalos entre buses. Mide qué tan irregular es el servicio: 0 = completamente regular, > 1 = muy irregular.',
    formula: 'CV = desviación_estándar(headways) / media(headways)',
    aplicable: 'Líneas de alta frecuencia.',
    estandar: 'TCRP 88 / TCRP 165 §4',
    cobMinima: '70 %',
    nMinimo: 5,
  },
  GPS_COV: {
    label: 'Cobertura GPS',
    definicion: 'Porcentaje de eventos GPS con posición válida (snap a ruta ≤ 80 m y confianza no-CERO). Es un indicador de calidad de datos, no de cumplimiento.',
    formula: 'Cov = count(confianza ≠ CERO && snap ≤ 80m) / total_eventos × 100',
    aplicable: 'Todas las líneas. Métrica de calidad de datos.',
    estandar: 'TfL Data Quality Indicator',
    cobMinima: '—',
    nMinimo: 1,
  },
  SRS: {
    label: 'Puntuación de confiabilidad',
    definicion: 'Índice compuesto que combina puntualidad (40 %), regularidad de frecuencia (25 %) y cobertura GPS (35 %). Solo se calcula cuando las tres métricas componentes están disponibles.',
    formula: 'SRS = 0.40 × OTP + 0.25 × (100 − CV_normalizado) + 0.35 × GPS_Cob',
    aplicable: 'Líneas con suficientes datos para las tres métricas.',
    estandar: 'TfL Service Delivery composite',
    cobMinima: '70 %',
    nMinimo: 5,
  },
  CUMPLIMIENTO_PLENO: {
    label: 'Cumplimiento Pleno [P]',
    definicion: 'Calculado contra el cronograma oficial (boletín UCOT + cartones de conductor). Combina puntualidad real, cobertura GPS y ejecución de servicio. Disponible solo para operadores con cronograma digitalizado.',
    formula: 'CP = OTP_cronograma × cobertura_GPS × SD',
    aplicable: 'Solo UCOT (tiene boletín + cartones + nómina digitalizados).',
    estandar: 'Interno SkillRoute',
    cobMinima: '80 %',
    nMinimo: 30,
  },
  CONFIABILIDAD_GPS: {
    label: 'Confiabilidad GPS [G]',
    definicion: 'Regularidad del servicio observada exclusivamente desde datos GPS. No comparable con Cumplimiento Pleno. Refleja la calidad del servicio medible sin cronograma oficial.',
    formula: 'CG = f(OTP_GPS, EWT_GPS, GPS_Cobertura)',
    aplicable: 'Todos los operadores.',
    estandar: 'Interno SkillRoute',
    cobMinima: '70 %',
    nMinimo: 30,
  },
};
