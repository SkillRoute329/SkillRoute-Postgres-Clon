import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // 1. Crear tabla brt_plan_obras
  await knex.schema.createTable("brt_plan_obras", (table) => {
    table.increments("id").primary();
    table.string("fase", 150).notNullable();
    table.string("periodo", 100);
    table.string("color", 50);
    table.jsonb("acciones").defaultTo('[]');
    table.integer("orden").defaultTo(0);
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });

  // 2. Crear tabla brt_timeline
  await knex.schema.createTable("brt_timeline", (table) => {
    table.increments("id").primary();
    table.string("periodo", 100).notNullable();
    table.string("evento", 255).notNullable();
    table.string("estado", 50).defaultTo('pendiente');
    table.text("detalle");
    table.integer("orden").defaultTo(0);
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });

  // Seeds for brt_plan_obras
  await knex("brt_plan_obras").insert([
    {
      fase: 'Fase 0 — Pre-obras (2026)',
      periodo: 'Q3-Q4 2026',
      color: 'amber',
      orden: 1,
      acciones: JSON.stringify([
        'Licitación operadores: UCOT debe presentar propuesta técnica',
        'Diseño definitivo de rutas alimentadoras propuestas',
        'Capacitación conductores en protocolos BRT y atención al usuario',
        'Actualización de flota con GPS de alta precisión (integración ASM)',
        'Implementar sistema de desvíos digitales en SkillRoute',
      ])
    },
    {
      fase: 'Fase 1 — Inicio obras 8 de Octubre (Ene-Dic 2027)',
      periodo: 'Ene-Dic 2027',
      color: 'red',
      orden: 2,
      acciones: JSON.stringify([
        'Activar Plan Desvío D1: L316 por Millán y L300 por corredor Instrucciones',
        'Desplegar bus lanzadera Belloni ↔ Tres Cruces (frecuencia 5 min)',
        'Refuerzo nocturno en zonas de obra (mayor demanda de trabajadores)',
        'Comunicación activa con pasajeros (app STM, pantallas en paradas)',
        'Coordinación semanal con IMM para ajuste de desvíos según avance de obra',
      ])
    },
    {
      fase: 'Fase 2 — Obras Av. Italia + Intercambiador (2027-2028)',
      periodo: 'Jul 2027 - Dic 2028',
      color: 'orange',
      orden: 3,
      acciones: JSON.stringify([
        'Activar Plan Desvío D2: L221 por bulevar alternativo',
        'Hub temporal Garibaldi para transbordo zona Tres Cruces',
        'Micro-lanzaderas eléctricas en zona de obras intercambiador',
        'Ajuste dinámico de frecuencias según datos GPS de demanda real',
        'Monitoreo de KPIs de operación — reportes semanales para MTOP/IMM',
      ])
    },
    {
      fase: 'Fase 3 — Pruebas y ajustes (2028-2029)',
      periodo: 'Ene 2028 - Dic 2028',
      color: 'blue',
      orden: 4,
      acciones: JSON.stringify([
        'Pruebas conjuntas BRT troncal + alimentadoras UCOT',
        'Calibración de horarios: empalme alimentadora ↔ BRT (< 3 min espera)',
        'Testeo de sistema de pago integrado (tarjeta única)',
        'Simulaciones de evento masivo y emergencia de red',
        'Capacitación final de todo el personal en nuevo modelo operativo',
      ])
    },
    {
      fase: 'Fase 4 — Operación BRT (2029+)',
      periodo: 'A partir de 2029',
      color: 'emerald',
      orden: 5,
      acciones: JSON.stringify([
        'Sistema totalmente operativo: troncal + alimentadoras UCOT',
        'Pago por km activo — facturación mensual a ASM',
        'KPIs en tiempo real visibles en SkillRoute + reportes ASM',
        'Expansión de alimentadoras a nuevas zonas según demanda',
        'Evaluación para nuevas licitaciones de corredores futuros',
      ])
    }
  ]);

  // Seeds for brt_timeline
  await knex("brt_timeline").insert([
    {
      periodo: '2026 Q1-Q2',
      evento: 'Proyecto ejecutivo finalizado — documentos técnicos publicados por MTOP',
      estado: 'completado',
      detalle: 'Incluye estudios geotécnicos, microsimulaciones y análisis de costos BRT vs tranvía vs metro',
      orden: 1
    },
    {
      periodo: '2026 Q3-Q4',
      evento: 'Licitaciones abiertas — infraestructura, material rodante y operadores',
      estado: 'en_curso',
      detalle: 'UCOT debe presentarse como operador alimentador. Ventana crítica para posicionarse.',
      orden: 2
    },
    {
      periodo: 'Ene 2027',
      evento: 'Inicio de obras de infraestructura',
      estado: 'pendiente',
      detalle: 'Carriles exclusivos 8 de Octubre y Av. Italia. Obras en Tres Cruces (intercambiador subterráneo).',
      orden: 3
    },
    {
      periodo: '2027-2028',
      evento: 'Adaptación operativa UCOT — migrar líneas superpuestas',
      estado: 'pendiente',
      detalle: 'Las líneas que comparten corredor con BRT deben migrar. Ventana para diseñar alimentadoras.',
      orden: 4
    },
    {
      periodo: '2028 Q2-Q4',
      evento: 'Pruebas con buses biarticulados eléctricos (170-220 pax)',
      estado: 'pendiente',
      detalle: 'Material rodante propiedad del Estado (ASM). UCOT opera bajo contrato de servicio.',
      orden: 5
    },
    {
      periodo: '2029',
      evento: '🚍 Sistema BRT operativo — Nuevo modelo pago por km activo',
      estado: 'pendiente',
      detalle: 'Impacto total en UCOT. Líneas alimentadoras licitadas. Ingresos por km recorrido.',
      orden: 6
    }
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("brt_timeline");
  await knex.schema.dropTableIfExists("brt_plan_obras");
}
