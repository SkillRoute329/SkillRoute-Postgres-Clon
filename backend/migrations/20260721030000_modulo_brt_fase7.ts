import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // 1. Crear tabla brt_benchmarks
  await knex.schema.createTable("brt_benchmarks", (table) => {
    table.increments("id").primary();
    table.string("ciudad", 150).notNullable();
    table.string("pais", 100);
    table.string("bandera", 10);
    table.integer("inicio_op");
    table.integer("km_red");
    table.integer("pasajeros_dia");
    table.integer("pas_km");
    table.decimal("costo_km", 8, 2);
    table.integer("velocidad_kmh");
    table.decimal("tarifa_usd", 8, 2);
    table.string("modelo", 255);
    table.text("leccion");
    table.text("fortaleza");
    table.text("riesgo");
    table.string("relevancia_ucot", 255);
    table.string("color", 50);
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });

  // 2. Crear tabla brt_propuesta_estrategica
  await knex.schema.createTable("brt_propuesta_estrategica", (table) => {
    table.integer("id").primary();
    table.string("titulo", 255);
    table.string("subtitulo", 255);
    table.jsonb("ventajas_competitivas").defaultTo('[]');
    table.jsonb("modelo_comercial").defaultTo('{}');
    table.jsonb("kpis_internacionales").defaultTo('[]');
    table.timestamp("updated_at").defaultTo(knex.fn.now());
  });

  // Seeds for brt_benchmarks
  await knex("brt_benchmarks").insert([
    {
      ciudad: 'Bogotá — TransMilenio', pais: 'Colombia', bandera: '🇨🇴',
      inicio_op: 2000, km_red: 114, pasajeros_dia: 2200000,
      pas_km: 19300, costo_km: 4.2, velocidad_kmh: 26,
      tarifa_usd: 0.55, modelo: 'Pago por km + subsidio estado',
      leccion: 'Mayor red BRT del mundo. Operadores privados licitados. KPI de regularidad y puntualidad clave.',
      fortaleza: 'Integración total con alimentadoras — 7,900 buses de alimentación para 12,000 km de red secundaria',
      riesgo: 'Congestión por corredores únicos, evasión tarifaria alta en inicio',
      relevancia_ucot: 'ALTA — modelo muy cercano al proyectado para Montevideo',
      color: '#dc2626',
    },
    {
      ciudad: 'Curitiba — URBS', pais: 'Brasil', bandera: '🇧🇷',
      inicio_op: 1974, km_red: 81, pasajeros_dia: 2100000,
      pas_km: 25900, costo_km: 3.1, velocidad_kmh: 32,
      tarifa_usd: 0.65, modelo: 'Concesión por km + operador 100% privado',
      leccion: 'Pionero mundial. Trifásico (troncal + interdistrital + convencional). Cero subsidio 50 años.',
      fortaleza: 'Integración modal perfecta. Rentable sin subsidio. Tutoriales a 175 ciudades del mundo.',
      riesgo: 'Sistema saturado — capacidad al límite. No puede crecer más en el corredor',
      relevancia_ucot: 'MUY ALTA — modelo de cooperativa-empresa similar a UCOT. Curitiba no tiene metro.',
      color: '#16a34a',
    },
    {
      ciudad: 'Guangzhou — BRT Zhongshan', pais: 'China', bandera: '🇨🇳',
      inicio_op: 2010, km_red: 23, pasajeros_dia: 1000000,
      pas_km: 43478, costo_km: 2.8, velocidad_kmh: 24,
      tarifa_usd: 0.28, modelo: 'Operación pública — empresa municipal',
      leccion: 'BRT de mayor capacidad por km del mundo. Premio ITDP Gold 2011.',
      fortaleza: 'Estaciones con bicicletas integradas. Semáforos 100% prioritarios. 350 buses/hora pico.',
      riesgo: 'Solo aplica en ciudades con densidad china — difícil replicar',
      relevancia_ucot: 'TÉCNICA — las estaciones en plataforma y integración bici son exportables',
      color: '#d97706',
    },
    {
      ciudad: 'Ciudad de México — Metrobús', pais: 'México', bandera: '🇲🇽',
      inicio_op: 2005, km_red: 153, pasajeros_dia: 900000,
      pas_km: 5882, costo_km: 5.1, velocidad_kmh: 19,
      tarifa_usd: 0.30, modelo: 'Concesionarios + tarjeta única integrada',
      leccion: 'Red extensa en ciudad congestionada. Integración con Metro y Tren Suburbano.',
      fortaleza: 'Tarjeta única para todos los modos. Operadores privados supervisados fuertemente.',
      riesgo: 'Velocidad baja por invasión de carril. Corrupción en permisos de parada.',
      relevancia_ucot: 'MEDIA — escala diferente pero modelo de concesionarios privados idéntico',
      color: '#7c3aed',
    },
    {
      ciudad: 'Istanbul — Metrobüs', pais: 'Turquía', bandera: '🇹🇷',
      inicio_op: 2007, km_red: 52, pasajeros_dia: 800000,
      pas_km: 15384, costo_km: 3.9, velocidad_kmh: 44,
      tarifa_usd: 0.50, modelo: 'IETT (empresa pública) + contrato operadores',
      leccion: 'La BRT más rápida del mundo (44 km/h promedio). Cruce del Bósforo.',
      fortaleza: 'Viaducto exclusivo total — cero interacción con tráfico. Frecuencia de 120 seg en pico.',
      riesgo: 'Inversión muy alta (infraestructura vial exclusiva)',
      relevancia_ucot: 'TÉCNICA — velocidad comercial objetivo para corredor 18 de Julio',
      color: '#0ea5e9',
    },
  ]);

  // Seeds for brt_propuesta_estrategica
  await knex("brt_propuesta_estrategica").insert([
    {
      id: 1,
      titulo: 'UCOT como Operador Estratégico del Sistema Metropolitano',
      subtitulo: '63 años de experiencia operando en los mismos corredores donde se construirá el BRT',
      ventajas_competitivas: JSON.stringify([
        { icono: '🗺️', titulo: 'Conocimiento de red sin rival', detalle: '29 líneas activas, 257 coches, 691 conductores/inspectores. Los mismos corredores que serán BRT durante 6+ décadas.' },
        { icono: '📡', titulo: 'Plataforma de inteligencia ya construida', detalle: 'SkillRoute: monitoreo GPS en tiempo real, KPIs operativos, gestión de incidentes, distribución diaria automatizada.' },
        { icono: '👥', titulo: 'Estructura cooperativa — alineación de incentivos', detalle: 'Al ser cooperativa de trabajadores, los conductores son socios. Menor rotación, mayor compromiso con estándares de calidad.' },
        { icono: '🔄', titulo: 'Ya operando en modelo de alimentación', detalle: 'Las líneas L12, L13, L31, L32, L33 son hoy alimentadoras locales. Experiencia directa en el modelo que el BRT requiere.' },
        { icono: '⚡', titulo: 'Capacidad de adaptación probada', detalle: 'Sistema de desvíos, cascada de cobertura y gestión de contingencias ya implementado digitalmente.' },
        { icono: '📊', titulo: 'Datos reales para la ASM', detalle: 'Única empresa con boletín digitalizado, rotación diaria y datos GPS integrados. Base para el sistema de pago por km.' },
      ]),
      modelo_comercial: JSON.stringify({
        opcion1: { nombre: 'Operador Alimentador Preferente', descripcion: 'UCOT opera las líneas alimentadoras de ambos corredores BRT bajo contrato de km con la ASM', ingresosAnualesEstUSD: 8200000, cochesInvolucrados: 68, conductores: 85, plazo: '10 años' },
        opcion2: { nombre: 'Co-Gestor del Corredor A', descripcion: 'UCOT toma el rol de operador troncal del Corredor A (8 de Octubre) + alimentadoras asociadas', ingresosAnualesEstUSD: 18500000, cochesInvolucrados: 95, conductores: 120, plazo: '12 años' },
        opcion3: { nombre: 'Proveedor de Plataforma Digital ASM', descripcion: 'SkillRoute es la plataforma que sistema de gestión para toda la red metropolitana', ingresosAnualesEstUSD: 2400000, cochesInvolucrados: 0, conductores: 5, plazo: '5 años' },
      }),
      kpis_internacionales: JSON.stringify([
        { kpi: 'Puntualidad', meta: '>92%', ucotActual: '~78%', brecha: 'Gap real: necesita inversión en monitoreo GPS y semáforo adaptativo' },
        { kpi: 'Tiempo viaje extremo-extremo', meta: '<50 min (Línea A)', ucotActual: '68 min', brecha: 'BRT cierra la brecha — UCOT alimentadora debe ofrecer <15 min a nodo' },
        { kpi: 'Capacidad hora pico', meta: '3,500 pas/hr/dir', ucotActual: '~850 pas/hr/dir', brecha: 'BRT lleva biarticulados. UCOT alimentadoras requieren buses de 12m mínimo' },
        { kpi: 'Flota eléctrica/híbrida', meta: '30% para 2030', ucotActual: '0%', brecha: 'Inversión necesaria. Posible subsidio MTOP/BID para flota verde' },
        { kpi: 'Satisfacción usuario', meta: '>80%', ucotActual: 'Sin medición sistemática', brecha: 'Implementar encuestas en tiempo real (QR en unidades)' },
      ])
    }
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("brt_propuesta_estrategica");
  await knex.schema.dropTableIfExists("brt_benchmarks");
}
