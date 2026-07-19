import type { Knex } from 'knex';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * MIGRACIÓN CERO — Esquema Fundacional SkillRoute (Fases 1–6)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Esta migración establece TODOS los cimientos del sistema que las migraciones
 * de Fase 6+ asumen como existentes. Sin esta migración, cualquier migración
 * posterior falla con "relation X does not exist".
 *
 * Tablas fundacionales creadas (en orden de dependencias FK):
 *   Fase 1: empresas, users, vehiculos, inspecciones, alertas, gps_history,
 *           logs_auditoria
 *   Fase 2: personal, turnos_dia, cartones_completados, alertas_operativas,
 *           vehicle_events, system_status
 *   Fase 3.5: poller_health, bus_eta_predictions
 *   Fase 4: lineas_config, route_shapes, competition_events,
 *           maintenance_records, inspecciones_formales
 *   Fase 5.27: shift_categories, fichas_medicas, penalty_rules,
 *              abl_red_numbers, scrapping_logs
 *   Fase 5-extra: stm_validaciones, cartones_historial, stm_horarios_control
 *   Fase 6: solicitudes_listero (ampliación de personal)
 *
 * Fuente de verdad: SkillRoute_Master/repo/backend/src/database/schema_*.sql
 *
 * IMPORTANTE: El nombre "00000000000000" garantiza que Knex ordene este
 * archivo ANTES de cualquier otro, independientemente del timestamp.
 *
 * Ejecutar: cd backend && npm run db:migrate
 * ════════════════════════════════════════════════════════════════════════════
 */

export async function up(knex: Knex): Promise<void> {

  // ── Extensiones PostgreSQL ──────────────────────────────────────────────────
  await knex.raw('CREATE EXTENSION IF NOT EXISTS postgis');
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // ── Función genérica de updated_at (usada por múltiples triggers) ───────────
  await knex.raw(`
    CREATE OR REPLACE FUNCTION trigger_set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // ════════════════════════════════════════════════════════════════════════════
  // FASE 1 — Tablas maestras del sistema
  // ════════════════════════════════════════════════════════════════════════════

  // 1. EMPRESAS (tabla raíz — todos los tenant_id la referencian)
  const hasEmpresas = await knex.schema.hasTable('empresas');
  if (!hasEmpresas) {
    await knex.schema.createTable('empresas', (table) => {
      table.increments('id').primary();
      table.string('agency_id', 50).unique().notNullable()
        .comment('Identificador único STM (ej: 70=UCOT, 50=CUTCSA)');
      table.string('nombre', 255).notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });

    // Seed inicial de operadores STM Montevideo
    await knex('empresas').insert([
      { agency_id: '70', nombre: 'UCOT' },
      { agency_id: '50', nombre: 'CUTCSA' },
      { agency_id: '20', nombre: 'COME' },
      { agency_id: '10', nombre: 'COETC' },
    ]).onConflict('agency_id').ignore();

    console.log('[MIGRATION-0] ✅ empresas creada y sembrada.');
  } else {
    console.log('[MIGRATION-0] ℹ️  empresas ya existe, omitiendo.');
  }

  // 2. USERS (RBAC — depende de empresas)
  const hasUsers = await knex.schema.hasTable('users');
  if (!hasUsers) {
    await knex.schema.createTable('users', (table) => {
      table.string('id', 128).primary()
        .comment('UID de Firebase o ID local');
      table.string('email', 255).unique().nullable();
      table.string('full_name', 255).nullable();
      table.string('role', 50).notNullable()
        .comment('SUPERADMIN | ADMIN | INSPECTOR | CONDUCTOR | TRAFFIC');
      table.string('agency_id', 50).nullable()
        .references('agency_id').inTable('empresas').onDelete('SET NULL');
      table.jsonb('data_jsonb').nullable()
        .comment('Datos extendidos de Firebase originales');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_users_agency ON users(agency_id)`);
    console.log('[MIGRATION-0] ✅ users creada.');
  } else {
    console.log('[MIGRATION-0] ℹ️  users ya existe, omitiendo.');
  }

  // 3. VEHICULOS (flota — depende de empresas)
  const hasVehiculos = await knex.schema.hasTable('vehiculos');
  if (!hasVehiculos) {
    await knex.schema.createTable('vehiculos', (table) => {
      table.string('id', 128).primary();
      table.string('agency_id', 50).nullable()
        .references('agency_id').inTable('empresas').onDelete('SET NULL');
      table.string('internal_number', 50).nullable();
      table.string('plate', 50).nullable();
      table.jsonb('data_jsonb').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_vehiculos_agency ON vehiculos(agency_id)`);
    console.log('[MIGRATION-0] ✅ vehiculos creada.');
  } else {
    console.log('[MIGRATION-0] ℹ️  vehiculos ya existe, omitiendo.');
  }

  // 4. INSPECCIONES
  const hasInspecciones = await knex.schema.hasTable('inspecciones');
  if (!hasInspecciones) {
    await knex.schema.createTable('inspecciones', (table) => {
      table.string('id', 128).primary();
      table.string('agency_id', 50).nullable()
        .references('agency_id').inTable('empresas').onDelete('SET NULL');
      table.string('vehiculo_id', 128).nullable()
        .references('id').inTable('vehiculos').onDelete('SET NULL');
      table.timestamp('fecha_inspeccion').nullable();
      table.string('inspector_id', 128).nullable()
        .references('id').inTable('users').onDelete('SET NULL');
      table.jsonb('data_jsonb').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_inspecciones_agency ON inspecciones(agency_id)`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_inspecciones_fecha ON inspecciones(fecha_inspeccion DESC)`);
    console.log('[MIGRATION-0] ✅ inspecciones creada.');
  } else {
    console.log('[MIGRATION-0] ℹ️  inspecciones ya existe, omitiendo.');
  }

  // 5. ALERTAS (sistema de compliance básico)
  const hasAlertas = await knex.schema.hasTable('alertas');
  if (!hasAlertas) {
    await knex.schema.createTable('alertas', (table) => {
      table.string('id', 128).primary();
      table.string('agency_id', 50).nullable()
        .references('agency_id').inTable('empresas').onDelete('SET NULL');
      table.string('tipo_alerta', 100).nullable();
      table.string('severity', 50).nullable().comment('BAJA | MEDIA | CRITICA');
      table.jsonb('data_jsonb').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_alertas_agency ON alertas(agency_id)`);
    console.log('[MIGRATION-0] ✅ alertas creada.');
  } else {
    console.log('[MIGRATION-0] ℹ️  alertas ya existe, omitiendo.');
  }

  // 6. GPS_HISTORY (telemetría geoespacial — PostGIS)
  const hasGpsHistory = await knex.schema.hasTable('gps_history');
  if (!hasGpsHistory) {
    await knex.schema.createTable('gps_history', (table) => {
      table.bigIncrements('id').primary();
      table.string('agency_id', 50).nullable()
        .references('agency_id').inTable('empresas').onDelete('SET NULL');
      table.string('vehiculo_id', 128).nullable()
        .references('id').inTable('vehiculos').onDelete('SET NULL');
      table.float('speed').nullable();
      table.float('bearing').nullable();
      table.timestamp('timestamp').notNullable();
      table.jsonb('data_jsonb').nullable();
    });
    await knex.raw(`
      SELECT AddGeometryColumn('public','gps_history','geom',4326,'POINT',2)
    `).catch(() => {
      // PostGIS AddGeometryColumn puede fallar si la columna ya existe
    });
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_gps_agency_time ON gps_history(agency_id, timestamp DESC)`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_gps_geom ON gps_history USING GIST(geom)`).catch(() => {});
    console.log('[MIGRATION-0] ✅ gps_history creada.');
  } else {
    console.log('[MIGRATION-0] ℹ️  gps_history ya existe, omitiendo.');
  }

  // 7. LOGS_AUDITORIA (inmutable — Ley 18.331)
  const hasLogsAuditoria = await knex.schema.hasTable('logs_auditoria');
  if (!hasLogsAuditoria) {
    await knex.schema.createTable('logs_auditoria', (table) => {
      table.bigIncrements('id').primary();
      table.string('user_id', 128).nullable();
      table.string('agency_id', 50).nullable();
      table.string('accion', 255).notNullable().comment('LOGIN | CONSULTA_DATOS | MODIFICACION');
      table.string('recurso', 255).nullable().comment('Tabla o endpoint accedido');
      table.jsonb('detalles_jsonb').nullable();
      table.string('client_ip', 45).nullable();
      table.timestamp('timestamp').defaultTo(knex.fn.now());
    });
    console.log('[MIGRATION-0] ✅ logs_auditoria creada.');
  } else {
    console.log('[MIGRATION-0] ℹ️  logs_auditoria ya existe, omitiendo.');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // FASE 2 — Tablas operacionales (dependen de Fase 1)
  // ════════════════════════════════════════════════════════════════════════════

  // 8. PERSONAL (conductores, inspectores, listeros — Grupo 13 MTSS)
  const hasPersonal = await knex.schema.hasTable('personal');
  if (!hasPersonal) {
    await knex.schema.createTable('personal', (table) => {
      table.string('id', 128).primary();
      table.string('agency_id', 50).nullable()
        .references('agency_id').inTable('empresas').onDelete('SET NULL');
      table.string('internal_number', 50).nullable();
      table.string('document_id', 50).nullable().comment('Cédula de identidad');
      table.string('full_name', 255).nullable();
      table.string('email', 255).nullable();
      table.string('phone', 50).nullable();
      table.string('role', 50).nullable()
        .comment('conductor | inspector | listero | administrativo');
      table.string('estado_hoy', 50).defaultTo('disponible')
        .comment('disponible | en_servicio | ausente | reserva | franco | licencia | enfermo');
      table.text('motivo_ausencia').nullable();
      table.date('ausencia_fecha').nullable();
      table.string('ausencia_registrada_por', 128).nullable();
      table.string('hora_ultimo_servicio', 8).nullable().comment('HH:MM');
      table.boolean('es_conductor_reserva').defaultTo(false);
      table.string('telefono', 50).nullable();
      // Fase 6 — Módulo Listero
      table.string('regimen_rotacion', 50).defaultTo('semanal')
        .comment('semanal | fijo_manana | fijo_tarde');
      table.boolean('is_en_lista').defaultTo(false);
      table.string('patron_descanso', 50).defaultTo('sab_dom_alterno');
      table.jsonb('data_jsonb').notNullable().defaultTo('{}');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_personal_agency ON personal(agency_id)`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_personal_role ON personal(role)`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_personal_estado ON personal(estado_hoy)`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_personal_internal ON personal(internal_number)`);

    await knex.raw(`
      DROP TRIGGER IF EXISTS trg_personal_updated ON personal;
      CREATE TRIGGER trg_personal_updated BEFORE UPDATE ON personal
      FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
    `);

    // Seed mínimo para tests
    await knex('personal').insert([
      { id: 'seed-cond-001', agency_id: '70', internal_number: '0001', full_name: 'Juan Demo Pérez', role: 'conductor', estado_hoy: 'disponible', es_conductor_reserva: false, data_jsonb: JSON.stringify({ seed: true }) },
      { id: 'seed-cond-002', agency_id: '70', internal_number: '0002', full_name: 'Marta Demo Suárez', role: 'conductor', estado_hoy: 'reserva', es_conductor_reserva: true, data_jsonb: JSON.stringify({ seed: true }) },
      { id: 'seed-cond-003', agency_id: '70', internal_number: '0003', full_name: 'Diego Demo Rojas', role: 'inspector', estado_hoy: 'disponible', es_conductor_reserva: false, data_jsonb: JSON.stringify({ seed: true }) },
    ]).onConflict('id').ignore();

    console.log('[MIGRATION-0] ✅ personal creada y sembrada (3 registros demo).');
  } else {
    // Si ya existe, asegurarse de que tenga las columnas de Fase 6
    const cols = await knex('personal').columnInfo();
    if (!cols['regimen_rotacion']) {
      await knex.schema.alterTable('personal', (table) => {
        table.string('regimen_rotacion', 50).defaultTo('semanal');
        table.boolean('is_en_lista').defaultTo(false);
        table.string('patron_descanso', 50).defaultTo('sab_dom_alterno');
      });
      console.log('[MIGRATION-0] ℹ️  personal existía → columnas Fase 6 agregadas.');
    } else {
      console.log('[MIGRATION-0] ℹ️  personal ya existe con todas sus columnas, omitiendo.');
    }
  }

  // 9. TURNOS_DIA (programación diaria — depende de personal y vehiculos)
  const hasTurnosDia = await knex.schema.hasTable('turnos_dia');
  if (!hasTurnosDia) {
    await knex.schema.createTable('turnos_dia', (table) => {
      table.string('id', 128).primary();
      table.string('agency_id', 50).nullable()
        .references('agency_id').inTable('empresas').onDelete('SET NULL');
      table.date('fecha').notNullable();
      table.string('conductor_id', 128).nullable()
        .references('id').inTable('personal').onDelete('SET NULL');
      table.string('conductor_nombre', 255).nullable();
      table.string('conductor_interno', 50).nullable();
      table.string('vehiculo_id', 128).nullable()
        .references('id').inTable('vehiculos').onDelete('SET NULL');
      table.string('vehiculo_interno', 50).nullable();
      table.string('linea_id', 50).nullable();
      table.string('variante_key', 100).nullable();
      table.string('turno', 20).nullable().comment('madrugada | mañana | tarde | noche');
      table.string('hora_salida', 8).nullable();
      table.string('hora_llegada_estimada', 8).nullable();
      table.string('terminal', 255).nullable();
      table.string('estado', 30).defaultTo('programado')
        .comment('programado | activo | completado | cancelado | sin_conductor | cubierto_reserva');
      table.boolean('reserva_activada').defaultTo(false);
      table.string('conductor_reserva_id', 128).nullable()
        .references('id').inTable('personal').onDelete('SET NULL');
      table.string('conductor_reserva_nombre', 255).nullable();
      table.integer('importancia_linea').defaultTo(2);
      table.decimal('impacto_ingresos_estimado', 12, 2).nullable();
      table.text('observaciones').nullable();
      table.boolean('firma_conductor').defaultTo(false);
      table.string('hora_firma', 8).nullable();
      table.jsonb('data_jsonb').notNullable().defaultTo('{}');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_turnos_fecha ON turnos_dia(fecha)`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_turnos_agency_fecha ON turnos_dia(agency_id, fecha)`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_turnos_conductor_fecha ON turnos_dia(conductor_id, fecha)`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_turnos_estado ON turnos_dia(estado)`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_turnos_linea ON turnos_dia(linea_id)`);
    await knex.raw(`
      DROP TRIGGER IF EXISTS trg_turnos_updated ON turnos_dia;
      CREATE TRIGGER trg_turnos_updated BEFORE UPDATE ON turnos_dia
      FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
    `);
    console.log('[MIGRATION-0] ✅ turnos_dia creada.');
  } else {
    console.log('[MIGRATION-0] ℹ️  turnos_dia ya existe, omitiendo.');
  }

  // 10. CARTONES_COMPLETADOS (cartones digitales de servicio)
  const hasCartones = await knex.schema.hasTable('cartones_completados');
  if (!hasCartones) {
    await knex.schema.createTable('cartones_completados', (table) => {
      table.string('id', 128).primary();
      table.string('agency_id', 50).nullable()
        .references('agency_id').inTable('empresas').onDelete('SET NULL');
      table.string('service_number', 50).nullable();
      table.string('line', 50).nullable();
      table.string('vehiculo_id', 128).nullable();
      table.string('conductor_id', 128).nullable();
      table.jsonb('data_jsonb').notNullable().defaultTo('{}');
      table.string('updated_by', 128).nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_cartones_agency ON cartones_completados(agency_id)`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_cartones_service_line ON cartones_completados(service_number, line)`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_cartones_updated ON cartones_completados(updated_at DESC)`);
    await knex.raw(`
      DROP TRIGGER IF EXISTS trg_cartones_updated ON cartones_completados;
      CREATE TRIGGER trg_cartones_updated BEFORE UPDATE ON cartones_completados
      FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
    `);
    console.log('[MIGRATION-0] ✅ cartones_completados creada.');
  } else {
    console.log('[MIGRATION-0] ℹ️  cartones_completados ya existe, omitiendo.');
  }

  // 11. ALERTAS_OPERATIVAS (cascade engine)
  const hasAlertasOp = await knex.schema.hasTable('alertas_operativas');
  if (!hasAlertasOp) {
    await knex.schema.createTable('alertas_operativas', (table) => {
      table.string('id', 128).primary();
      table.string('agency_id', 50).nullable()
        .references('agency_id').inTable('empresas').onDelete('SET NULL');
      table.date('fecha').notNullable();
      table.string('tipo', 50).notNullable();
      table.string('urgencia', 20).notNullable().comment('baja | media | alta | critica');
      table.string('linea_id', 50).nullable();
      table.string('conductor_id', 128).nullable();
      table.string('vehiculo_id', 128).nullable();
      table.string('turno_id', 128).nullable();
      table.text('titulo').nullable();
      table.text('mensaje').nullable();
      table.text('accion_sugerida').nullable();
      table.jsonb('datos_extra').defaultTo('{}');
      table.boolean('atendida').defaultTo(false);
      table.string('atendida_por', 128).nullable();
      table.string('hora_atendida', 8).nullable();
      table.decimal('impacto_ingresos_usd', 12, 2).nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_alertas_op_fecha ON alertas_operativas(fecha)`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_alertas_op_urgencia ON alertas_operativas(urgencia)`);
    console.log('[MIGRATION-0] ✅ alertas_operativas creada.');
  } else {
    console.log('[MIGRATION-0] ℹ️  alertas_operativas ya existe, omitiendo.');
  }

  // 12. VEHICLE_EVENTS (telemetría GPS compliance — TTL 30 días)
  const hasVehicleEvents = await knex.schema.hasTable('vehicle_events');
  if (!hasVehicleEvents) {
    await knex.schema.createTable('vehicle_events', (table) => {
      table.bigIncrements('id').primary();
      table.string('id_bus', 50).notNullable();
      table.string('agency_id', 50).notNullable();
      table.string('empresa', 50).nullable();
      table.string('linea', 50).nullable();
      table.double('lat').nullable();
      table.double('lon').nullable();
      table.double('velocidad').nullable();
      table.string('estado_cumplimiento', 50).nullable()
        .comment('EN_TIEMPO | ATRASADO | ADELANTADO | SIN_HORARIO | FUERA_DE_SERVICIO');
      table.double('desviacion_min').nullable();
      table.string('trip_id', 100).nullable();
      table.text('proxima_parada').nullable();
      table.timestamp('timestamp_gps').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('expires_at').defaultTo(knex.raw(`NOW() + INTERVAL '30 days'`));
    });
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_ve_id_bus_created ON vehicle_events(id_bus, created_at DESC)`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_ve_agency_created ON vehicle_events(agency_id, created_at DESC)`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_ve_linea_created ON vehicle_events(linea, created_at DESC)`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_ve_expires ON vehicle_events(expires_at)`);
    await knex.raw(`
      ALTER TABLE vehicle_events ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326);
      CREATE INDEX IF NOT EXISTS idx_ve_geom ON vehicle_events USING GIST(geom);
    `).catch(() => {});
    console.log('[MIGRATION-0] ✅ vehicle_events creada.');
  } else {
    console.log('[MIGRATION-0] ℹ️  vehicle_events ya existe, omitiendo.');
  }

  // 13. SYSTEM_STATUS (key-value de salud del sistema)
  const hasSystemStatus = await knex.schema.hasTable('system_status');
  if (!hasSystemStatus) {
    await knex.schema.createTable('system_status', (table) => {
      table.string('key', 100).primary();
      table.jsonb('value_jsonb').notNullable().defaultTo('{}');
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
    await knex.raw(`
      DROP TRIGGER IF EXISTS trg_system_status_updated ON system_status;
      CREATE TRIGGER trg_system_status_updated BEFORE UPDATE ON system_status
      FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
    `);
    console.log('[MIGRATION-0] ✅ system_status creada.');
  } else {
    console.log('[MIGRATION-0] ℹ️  system_status ya existe, omitiendo.');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // FASE 3.5 — Poller y ETAs
  // ════════════════════════════════════════════════════════════════════════════

  // 14. POLLER_HEALTH (audit trail del poller IMM)
  const hasPollerHealth = await knex.schema.hasTable('poller_health');
  if (!hasPollerHealth) {
    await knex.schema.createTable('poller_health', (table) => {
      table.bigIncrements('id').primary();
      table.string('agency_id', 50).notNullable();
      table.timestamp('cycle_start').notNullable();
      table.timestamp('cycle_end').notNullable();
      table.integer('duration_ms').notNullable();
      table.integer('buses_received').notNullable().defaultTo(0);
      table.integer('events_persisted').notNullable().defaultTo(0);
      table.integer('last_pos_updated').notNullable().defaultTo(0);
      table.integer('eta_predictions').notNullable().defaultTo(0);
      table.integer('errors').notNullable().defaultTo(0);
      table.text('error_message').nullable();
      table.string('source', 50).defaultTo('IMM_API');
      table.string('poller_version', 20).defaultTo('1.0');
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_ph_agency_start ON poller_health(agency_id, cycle_start DESC)`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_ph_errors ON poller_health(errors) WHERE errors > 0`);
    console.log('[MIGRATION-0] ✅ poller_health creada.');
  } else {
    console.log('[MIGRATION-0] ℹ️  poller_health ya existe, omitiendo.');
  }

  // 15. BUS_ETA_PREDICTIONS
  const hasEtaPredictions = await knex.schema.hasTable('bus_eta_predictions');
  if (!hasEtaPredictions) {
    await knex.schema.createTable('bus_eta_predictions', (table) => {
      table.string('id_bus', 50).notNullable();
      table.string('stop_id', 100).notNullable();
      table.string('agency_id', 50).notNullable();
      table.string('linea', 50).nullable();
      table.string('trip_id', 100).nullable();
      table.integer('stop_sequence').nullable();
      table.integer('eta_seconds').nullable();
      table.timestamp('eta_timestamp').nullable();
      table.integer('distance_meters').nullable();
      table.double('speed_kmh').nullable();
      table.timestamp('computed_at').defaultTo(knex.fn.now());
      table.primary(['id_bus', 'stop_id']);
    });
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_eta_stop_id ON bus_eta_predictions(stop_id, eta_timestamp)`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_eta_agency ON bus_eta_predictions(agency_id, computed_at DESC)`);
    console.log('[MIGRATION-0] ✅ bus_eta_predictions creada.');
  } else {
    console.log('[MIGRATION-0] ℹ️  bus_eta_predictions ya existe, omitiendo.');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // FASE 4 — Competencia, mantenimiento, inspecciones formales
  // ════════════════════════════════════════════════════════════════════════════

  // 16. LINEAS_CONFIG (configuración de líneas de servicio)
  const hasLineasConfig = await knex.schema.hasTable('lineas_config');
  if (!hasLineasConfig) {
    await knex.schema.createTable('lineas_config', (table) => {
      table.string('id', 50).primary();
      table.string('agency_id', 50).nullable()
        .references('agency_id').inTable('empresas').onDelete('SET NULL');
      table.string('nombre', 255).nullable();
      table.integer('frecuencia_minutos').nullable();
      table.boolean('activa').defaultTo(true);
      table.jsonb('data_jsonb').defaultTo('{}');
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
    console.log('[MIGRATION-0] ✅ lineas_config creada.');
  } else {
    console.log('[MIGRATION-0] ℹ️  lineas_config ya existe, omitiendo.');
  }

  // 17. COMPETITION_EVENTS (inteligencia de competidores)
  const hasCompetitionEvents = await knex.schema.hasTable('competition_events');
  if (!hasCompetitionEvents) {
    await knex.schema.createTable('competition_events', (table) => {
      table.bigIncrements('id').primary();
      table.string('agency_id', 50).nullable();
      table.string('rival_agency_id', 50).nullable();
      table.string('linea', 50).nullable();
      table.double('lat').nullable();
      table.double('lon').nullable();
      table.double('velocidad').nullable();
      table.string('tipo_evento', 50).nullable();
      table.jsonb('data_jsonb').defaultTo('{}');
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_comp_events_agency ON competition_events(agency_id, created_at DESC)`);
    console.log('[MIGRATION-0] ✅ competition_events creada.');
  } else {
    console.log('[MIGRATION-0] ℹ️  competition_events ya existe, omitiendo.');
  }

  // 18. MAINTENANCE_RECORDS (partes de mantenimiento EAM)
  const hasMaintenanceRecords = await knex.schema.hasTable('maintenance_records');
  if (!hasMaintenanceRecords) {
    await knex.schema.createTable('maintenance_records', (table) => {
      table.string('id', 128).primary();
      table.string('agency_id', 50).nullable()
        .references('agency_id').inTable('empresas').onDelete('SET NULL');
      table.string('vehiculo_id', 128).nullable()
        .references('id').inTable('vehiculos').onDelete('SET NULL');
      table.string('tipo_mantenimiento', 100).nullable();
      table.string('estado', 50).defaultTo('PROGRAMADO')
        .comment('PROGRAMADO | EN_CURSO | COMPLETADO | CANCELADO');
      table.text('observaciones').nullable();
      table.timestamp('fecha_inicio').nullable();
      table.timestamp('fecha_fin_estimada').nullable();
      table.timestamp('fecha_fin_real').nullable();
      table.string('tecnico_id', 128).nullable();
      table.decimal('costo_estimado', 12, 2).nullable();
      table.jsonb('data_jsonb').defaultTo('{}');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_maint_agency ON maintenance_records(agency_id, created_at DESC)`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_maint_vehiculo ON maintenance_records(vehiculo_id)`);
    console.log('[MIGRATION-0] ✅ maintenance_records creada.');
  } else {
    console.log('[MIGRATION-0] ℹ️  maintenance_records ya existe, omitiendo.');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // FASE 5.27 — Tablas de gaps detectadas en auditoría
  // ════════════════════════════════════════════════════════════════════════════

  // 19. SHIFT_CATEGORIES
  const hasShiftCats = await knex.schema.hasTable('shift_categories');
  if (!hasShiftCats) {
    await knex.schema.createTable('shift_categories', (table) => {
      table.string('id', 128).primary();
      table.string('nombre', 255).notNullable();
      table.decimal('precio', 10, 2).nullable();
      table.text('descripcion').nullable();
      table.string('agency_id', 50).nullable()
        .references('agency_id').inTable('empresas').onDelete('SET NULL');
      table.jsonb('data_jsonb').notNullable().defaultTo('{}');
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_shift_cat_agency ON shift_categories(agency_id)`);
    console.log('[MIGRATION-0] ✅ shift_categories creada.');
  } else {
    console.log('[MIGRATION-0] ℹ️  shift_categories ya existe, omitiendo.');
  }

  // 20. FICHAS_MEDICAS
  const hasFichasMedicas = await knex.schema.hasTable('fichas_medicas');
  if (!hasFichasMedicas) {
    await knex.schema.createTable('fichas_medicas', (table) => {
      table.string('id', 128).primary();
      table.string('conductor_id', 128).nullable()
        .references('id').inTable('users').onDelete('SET NULL');
      table.string('agency_id', 50).nullable()
        .references('agency_id').inTable('empresas').onDelete('SET NULL');
      table.date('fecha_emision').nullable();
      table.date('fecha_vencimiento').nullable();
      table.string('estado', 50).nullable();
      table.jsonb('data_jsonb').notNullable().defaultTo('{}');
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_fichas_conductor ON fichas_medicas(conductor_id)`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_fichas_vencimiento ON fichas_medicas(fecha_vencimiento)`);
    console.log('[MIGRATION-0] ✅ fichas_medicas creada.');
  } else {
    console.log('[MIGRATION-0] ℹ️  fichas_medicas ya existe, omitiendo.');
  }

  // 21. PENALTY_RULES
  const hasPenaltyRules = await knex.schema.hasTable('penalty_rules');
  if (!hasPenaltyRules) {
    await knex.schema.createTable('penalty_rules', (table) => {
      table.string('id', 128).primary();
      table.string('nombre', 255).notNullable();
      table.string('codigo', 50).nullable();
      table.string('gravedad', 50).nullable();
      table.decimal('monto_base', 10, 2).nullable();
      table.text('descripcion').nullable();
      table.string('agency_id', 50).nullable()
        .references('agency_id').inTable('empresas').onDelete('SET NULL');
      table.boolean('activa').notNullable().defaultTo(true);
      table.jsonb('data_jsonb').notNullable().defaultTo('{}');
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_penalty_rules_agency ON penalty_rules(agency_id)`);
    console.log('[MIGRATION-0] ✅ penalty_rules creada.');
  } else {
    console.log('[MIGRATION-0] ℹ️  penalty_rules ya existe, omitiendo.');
  }

  // 22. ABL_RED_NUMBERS (disciplina — conductores con sanciones acumuladas)
  const hasAblRedNumbers = await knex.schema.hasTable('abl_red_numbers');
  if (!hasAblRedNumbers) {
    await knex.schema.createTable('abl_red_numbers', (table) => {
      table.string('id', 128).primary();
      table.string('conductor_id', 128).nullable()
        .references('id').inTable('users').onDelete('SET NULL');
      table.string('agency_id', 50).nullable()
        .references('agency_id').inTable('empresas').onDelete('SET NULL');
      table.string('motivo', 255).nullable();
      table.date('fecha_apertura').notNullable().defaultTo(knex.raw('CURRENT_DATE'));
      table.date('fecha_cierre').nullable();
      table.string('estado', 50).notNullable().defaultTo('abierto');
      table.jsonb('data_jsonb').notNullable().defaultTo('{}');
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_abl_red_conductor ON abl_red_numbers(conductor_id)`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_abl_red_estado ON abl_red_numbers(estado)`);
    console.log('[MIGRATION-0] ✅ abl_red_numbers creada.');
  } else {
    console.log('[MIGRATION-0] ℹ️  abl_red_numbers ya existe, omitiendo.');
  }

  // 23. SCRAPPING_LOGS (audit trail de scrapers STM)
  const hasScrappingLogs = await knex.schema.hasTable('scrapping_logs');
  if (!hasScrappingLogs) {
    await knex.schema.createTable('scrapping_logs', (table) => {
      table.string('id', 128).primary();
      table.string('scraper', 100).notNullable();
      table.timestamp('inicio').notNullable().defaultTo(knex.fn.now());
      table.timestamp('fin').nullable();
      table.string('estado', 50).nullable();
      table.integer('registros').nullable();
      table.text('mensaje').nullable();
      table.jsonb('data_jsonb').notNullable().defaultTo('{}');
    });
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_scrapping_inicio ON scrapping_logs(inicio DESC)`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_scrapping_scraper ON scrapping_logs(scraper, inicio DESC)`);
    console.log('[MIGRATION-0] ✅ scrapping_logs creada.');
  } else {
    console.log('[MIGRATION-0] ℹ️  scrapping_logs ya existe, omitiendo.');
  }

  // 24. SOLICITUDES_LISTERO (Fase 6 — papelitos digitales)
  const hasSolicitudesListero = await knex.schema.hasTable('solicitudes_listero');
  if (!hasSolicitudesListero) {
    await knex.schema.createTable('solicitudes_listero', (table) => {
      table.string('id', 128).primary();
      table.string('agency_id', 50).nullable();
      table.string('conductor_id', 128).nullable()
        .references('id').inTable('personal').onDelete('SET NULL');
      table.string('tipo_solicitud', 50).notNullable()
        .comment('correlativo | cambio_turno | cambio_descanso');
      table.date('fecha_objetivo').notNullable();
      table.string('turno_objetivo', 20).nullable();
      table.string('coche_objetivo', 50).nullable();
      table.string('estado', 30).defaultTo('pendiente')
        .comment('pendiente | emparejado | aprobado | rechazado');
      table.text('notas').nullable();
      table.timestamp('fecha_creacion').defaultTo(knex.fn.now());
      table.timestamp('fecha_actualizacion').defaultTo(knex.fn.now());
      table.string('resuelto_por', 128).nullable();
    });
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_solicitudes_listero_agency ON solicitudes_listero(agency_id)`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_solicitudes_listero_conductor ON solicitudes_listero(conductor_id)`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_solicitudes_listero_estado ON solicitudes_listero(estado)`);
    console.log('[MIGRATION-0] ✅ solicitudes_listero creada.');
  } else {
    console.log('[MIGRATION-0] ℹ️  solicitudes_listero ya existe, omitiendo.');
  }

  console.log('\n[MIGRATION-0] ════════════════════════════════════════════════');
  console.log('[MIGRATION-0]  Migración Cero completada — todos los cimientos OK');
  console.log('[MIGRATION-0] ════════════════════════════════════════════════\n');
}

export async function down(knex: Knex): Promise<void> {
  // Eliminar en orden inverso de dependencias FK
  await knex.schema.dropTableIfExists('solicitudes_listero');
  await knex.schema.dropTableIfExists('scrapping_logs');
  await knex.schema.dropTableIfExists('abl_red_numbers');
  await knex.schema.dropTableIfExists('penalty_rules');
  await knex.schema.dropTableIfExists('fichas_medicas');
  await knex.schema.dropTableIfExists('shift_categories');
  await knex.schema.dropTableIfExists('maintenance_records');
  await knex.schema.dropTableIfExists('competition_events');
  await knex.schema.dropTableIfExists('lineas_config');
  await knex.schema.dropTableIfExists('bus_eta_predictions');
  await knex.schema.dropTableIfExists('poller_health');
  await knex.schema.dropTableIfExists('system_status');
  await knex.schema.dropTableIfExists('vehicle_events');
  await knex.schema.dropTableIfExists('alertas_operativas');
  await knex.schema.dropTableIfExists('cartones_completados');
  await knex.schema.dropTableIfExists('turnos_dia');
  await knex.schema.dropTableIfExists('personal');
  await knex.schema.dropTableIfExists('logs_auditoria');
  await knex.schema.dropTableIfExists('gps_history');
  await knex.schema.dropTableIfExists('alertas');
  await knex.schema.dropTableIfExists('inspecciones');
  await knex.schema.dropTableIfExists('vehiculos');
  await knex.schema.dropTableIfExists('users');
  await knex.schema.dropTableIfExists('empresas');
  await knex.raw('DROP FUNCTION IF EXISTS trigger_set_updated_at() CASCADE');
}
