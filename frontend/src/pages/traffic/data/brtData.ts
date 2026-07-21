// Datos extraídos para la refactorización de BRTCorridorDashboard

export const BRT_META = {
  inversion: 490,            // millones USD (MTOP, 2026)
  inicioObras: 'Enero 2027',
  operativoEstimado: 2029,
  capacidadBiarticulado: 220, // pasajeros por unidad
  nodoTresCruces: 'Subterráneo 2 niveles — Plaza de la Bandera',
  pago18Jul: '10-11 min Tres Cruces → Pza. Independencia',
};

export const CORREDORES = [
  {
    id: 'A',
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
      { nombre: 'Zonamérica', lat: -34.795, lng: -56.065, tipo: 'terminal' },
      { nombre: 'Cno. Maldonado y Belloni', lat: -34.838, lng: -56.134, tipo: 'nodo' },
      { nombre: '8 de Octubre y Pan de Azúcar', lat: -34.851, lng: -56.14, tipo: 'intermedia' },
      { nombre: '8 de Octubre y Propios', lat: -34.869, lng: -56.147, tipo: 'intermedia' },
      { nombre: '8 de Octubre y L.A. de Herrera', lat: -34.879, lng: -56.155, tipo: 'intermedia' },
      { nombre: 'Tres Cruces (nivel -2)', lat: -34.896, lng: -56.166, tipo: 'intercambiador' },
      { nombre: 'Plaza de los 33', lat: -34.904, lng: -56.183, tipo: 'intermedia' },
      { nombre: 'Plaza Fabini', lat: -34.905, lng: -56.195, tipo: 'intermedia' },
      { nombre: 'Plaza Independencia', lat: -34.906, lng: -56.199, tipo: 'terminal' }
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
    subtitulo: 'El Pinar → Av. Giannattasio → Av. Italia → Tres Cruces → 18 de Julio → Pza. Independencia',
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
      { nombre: 'El Pinar', lat: -34.796964, lng: -55.911598, tipo: 'terminal' },
      { nombre: 'Solymar', lat: -34.815, lng: -55.94, tipo: 'intermedia' },
      { nombre: 'Puente Carrasco', lat: -34.874, lng: -56.035, tipo: 'nodo' },
      { nombre: 'Av. Italia y Bolivia', lat: -34.88, lng: -56.059, tipo: 'intermedia' },
      { nombre: 'Av. Italia y Comercio', lat: -34.887, lng: -56.117, tipo: 'intermedia' },
      { nombre: 'Av. Italia y Propios', lat: -34.889, lng: -56.133, tipo: 'intermedia' },
      { nombre: 'Av. Italia y L.A. de Herrera', lat: -34.892, lng: -56.148, tipo: 'intermedia' },
      { nombre: 'Tres Cruces (nivel -1)', lat: -34.896, lng: -56.166, tipo: 'intercambiador' },
      { nombre: 'Plaza de los 33', lat: -34.904, lng: -56.183, tipo: 'intermedia' },
      { nombre: 'Plaza Fabini', lat: -34.905, lng: -56.195, tipo: 'intermedia' },
      { nombre: 'Plaza Independencia', lat: -34.906, lng: -56.199, tipo: 'terminal' }
    ],
    lineasUCOTAfectadas: [
      { linea: '221', nombre: 'Línea 221 (Metropolitana)', overlap: 'TOTAL', km: 28, estrategia: 'Redirigir como alimentadora costera → nodo Giannattasio' },
      { linea: '329', nombre: 'Punta Carretas - Melilla', overlap: 'PARCIAL', km: 12, estrategia: 'Alimentadora barrios norte Av. Italia' },
      { linea: '316', nombre: 'Cno. Maldonado Km16 - Pocitos', overlap: 'PARCIAL', km: 6, estrategia: 'Refuerzo tramo compartido' },
    ],
  },
];

export const MODELO_FINANCIERO = {
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

export const LINEAS_ALIMENTADORAS_PROPUESTAS = [
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

export const TIMELINE = [
  { periodo: '2026 Q1-Q2', evento: 'Proyecto ejecutivo finalizado — documentos técnicos publicados por MTOP', estado: 'completado', detalle: 'Incluye estudios geotécnicos, microsimulaciones y análisis de costos BRT vs tranvía vs metro' },
  { periodo: '2026 Q3-Q4', evento: 'Licitaciones abiertas — infraestructura, material rodante y operadores', estado: 'en_curso', detalle: 'UCOT debe presentarse como operador alimentador. Ventana crítica para posicionarse.' },
  { periodo: 'Ene 2027', evento: 'Inicio de obras de infraestructura', estado: 'pendiente', detalle: 'Carriles exclusivos 8 de Octubre y Av. Italia. Obras en Tres Cruces (intercambiador subterráneo).' },
  { periodo: '2027-2028', evento: 'Adaptación operativa UCOT — migrar líneas superpuestas', estado: 'pendiente', detalle: 'Las líneas que comparten corredor con BRT deben migrar. Ventana para diseñar alimentadoras.' },
  { periodo: '2028 Q2-Q4', evento: 'Pruebas con buses biarticulados eléctricos (170-220 pax)', estado: 'pendiente', detalle: 'Material rodante propiedad del Estado (ASM). UCOT opera bajo contrato de servicio.' },
  { periodo: '2029', evento: '🚍 Sistema BRT operativo — Nuevo modelo pago por km activo', estado: 'pendiente', detalle: 'Impacto total en UCOT. Líneas alimentadoras licitadas. Ingresos por km recorrido.' },
];

export const todasAfectadas = [...new Set(CORREDORES.flatMap(c => c.lineasUCOTAfectadas.map(l => l.linea)))];

export const BENCHMARKS_BRT = [
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

export const ESCENARIOS_DESVIO = [
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

export const PROPUESTA_ASM = {
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

export const PLAN_OBRAS = [
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

export type TabType = 'corredores' | 'impacto' | 'modelo' | 'alimentadoras' | 'timeline' | 'benchmarks' | 'obras' | 'simulador' | 'propuesta';
