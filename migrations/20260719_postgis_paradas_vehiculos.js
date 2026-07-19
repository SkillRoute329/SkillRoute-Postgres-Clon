/**
 * Migración DDL: Esquema geoespacial PostGIS para SkillRoute
 * Tablas: poligonos_operativos, paradas_gtfs, vehiculos_flota
 *
 * Requiere PostGIS habilitado en la base de datos.
 * Si no está habilitado, las columnas de geometría se crean como JSONB como fallback.
 *
 * Ejecutar: npx knex migrate:latest
 *            npm run db:migrate
 */

exports.up = async function (knex) {
  // ─── Verificar si PostGIS está disponible ───────────────────────────────────
  let postgisAvailable = false;
  try {
    const result = await knex.raw(
      "SELECT 1 FROM pg_extension WHERE extname = 'postgis'"
    );
    if (result.rows && result.rows.length > 0) {
      postgisAvailable = true;
    }
  } catch (_) {
    postgisAvailable = false;
  }

  if (!postgisAvailable) {
    try {
      await knex.raw('CREATE EXTENSION IF NOT EXISTS postgis');
      postgisAvailable = true;
      console.log('[MIGRATION] ✅ Extensión PostGIS habilitada.');
    } catch (err) {
      console.warn(
        '[MIGRATION] ⚠️  No se pudo habilitar PostGIS. Usando JSONB como fallback para geometrías.'
      );
    }
  } else {
    console.log('[MIGRATION] ℹ️  PostGIS ya estaba habilitado.');
  }

  // ─── 1. poligonos_operativos ─────────────────────────────────────────────────
  // Zonas de operación, corredores estructurales, zonas de subsidio, etc.
  const hasPoligonos = await knex.schema.hasTable('poligonos_operativos');
  if (!hasPoligonos) {
    await knex.schema.createTable('poligonos_operativos', (table) => {
      table.increments('id').primary();
      // Tipo de polígono: CORREDOR | ZONA_SUBSIDIO | ZONA_INSPECCION | MICROCORREDOR
      table.string('tipo', 60).notNullable().defaultTo('CORREDOR');
      table.string('nombre', 255).notNullable();
      table.string('codigo_externo', 100).nullable().comment('Código de referencia IMM/MTOP');
      table.integer('agency_id').nullable().index();
      // Geometría: columna nativa PostGIS si está disponible, JSONB como fallback
      // GeoJSON almacenado como JSONB siempre para compatibilidad con Node.js
      table.jsonb('geojson_geom').nullable().comment('GeoJSON del polígono (Polygon/MultiPolygon)');
      table.decimal('area_km2', 12, 4).nullable();
      table.boolean('activo').notNullable().defaultTo(true);
      table.jsonb('meta').nullable().comment('Metadatos adicionales (colores, prioridad, etc.)');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.index(['tipo', 'activo']);
      table.index(['codigo_externo']);
    });

    // Si PostGIS está disponible, agregar columna geometry nativa
    if (postgisAvailable) {
      try {
        await knex.raw(`
          ALTER TABLE poligonos_operativos
          ADD COLUMN IF NOT EXISTS geom geometry(MultiPolygon, 4326)
        `);
        await knex.raw(`
          CREATE INDEX IF NOT EXISTS idx_poligonos_geom
          ON poligonos_operativos USING GIST(geom)
        `);
        console.log('[MIGRATION] ✅ Columna PostGIS geom añadida a poligonos_operativos');
      } catch (err) {
        console.warn('[MIGRATION] ⚠️  No se pudo añadir columna PostGIS geometry:', err.message);
      }
    }

    console.log('[MIGRATION] ✅ Tabla poligonos_operativos creada.');
  } else {
    console.log('[MIGRATION] ℹ️  poligonos_operativos ya existe, omitiendo.');
  }

  // ─── 2. paradas_gtfs ──────────────────────────────────────────────────────────
  // Paradas de transporte urbano en formato GTFS — fuente: IMM/STM Montevideo
  const hasParadas = await knex.schema.hasTable('paradas_gtfs');
  if (!hasParadas) {
    await knex.schema.createTable('paradas_gtfs', (table) => {
      table.increments('id').primary();
      table.string('stop_id', 100).notNullable().unique().comment('ID GTFS de la parada');
      table.string('stop_code', 50).nullable().comment('Código visible al pasajero');
      table.string('stop_name', 255).notNullable();
      table.text('stop_desc').nullable();
      table.decimal('stop_lat', 10, 8).notNullable();
      table.decimal('stop_lon', 11, 8).notNullable();
      // Zona tarifaria
      table.string('zone_id', 50).nullable();
      // Barrio o localidad (enriquecido desde IMM)
      table.string('barrio', 100).nullable();
      table.integer('agency_id').nullable().index();
      // Si la parada está activa en el sistema
      table.boolean('activo').notNullable().defaultTo(true);
      // Accesibilidad: 0=desconocido, 1=accesible, 2=no accesible
      table.smallint('wheelchair_boarding').defaultTo(0);
      table.jsonb('rutas_que_pasan').nullable().comment('Array de route_id que pasan por esta parada');
      table.jsonb('meta').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.index(['stop_lat', 'stop_lon']);
      table.index(['barrio']);
      table.index(['zone_id']);
    });

    // Columna PostGIS nativa
    if (postgisAvailable) {
      try {
        await knex.raw(`
          ALTER TABLE paradas_gtfs
          ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326)
        `);
        await knex.raw(`
          CREATE INDEX IF NOT EXISTS idx_paradas_geom
          ON paradas_gtfs USING GIST(geom)
        `);
        // Trigger para mantener geom sincronizado con lat/lon
        await knex.raw(`
          CREATE OR REPLACE FUNCTION fn_sync_parada_geom()
          RETURNS TRIGGER AS $$
          BEGIN
            NEW.geom := ST_SetSRID(ST_MakePoint(NEW.stop_lon, NEW.stop_lat), 4326);
            RETURN NEW;
          END;
          $$ LANGUAGE plpgsql
        `);
        await knex.raw(`
          DROP TRIGGER IF EXISTS trg_sync_parada_geom ON paradas_gtfs;
          CREATE TRIGGER trg_sync_parada_geom
          BEFORE INSERT OR UPDATE OF stop_lat, stop_lon ON paradas_gtfs
          FOR EACH ROW EXECUTE FUNCTION fn_sync_parada_geom()
        `);
        console.log('[MIGRATION] ✅ Columna PostGIS + trigger geom añadidos a paradas_gtfs');
      } catch (err) {
        console.warn('[MIGRATION] ⚠️  No se pudo añadir columna PostGIS a paradas_gtfs:', err.message);
      }
    }

    console.log('[MIGRATION] ✅ Tabla paradas_gtfs creada.');
  } else {
    console.log('[MIGRATION] ℹ️  paradas_gtfs ya existe, omitiendo.');
  }

  // ─── 3. vehiculos_flota ───────────────────────────────────────────────────────
  // Registro maestro de la flota de vehículos (buses, coches)
  const hasVehiculos = await knex.schema.hasTable('vehiculos_flota');
  if (!hasVehiculos) {
    await knex.schema.createTable('vehiculos_flota', (table) => {
      table.increments('id').primary();
      // Identificadores
      table.string('vehicle_id', 100).notNullable().unique().comment('ID interno del sistema');
      table.string('bus_numero', 50).nullable().comment('Número de coche visible');
      table.string('patente', 20).nullable().unique();
      // Empresa/Agencia operadora
      table.integer('agency_id').notNullable().index();
      table.string('empresa', 150).nullable();
      // Línea habitual (puede cambiar en tiempo real)
      table.string('linea_habitual', 100).nullable().index();
      // Estado operativo
      table.string('estado', 50).notNullable().defaultTo('ACTIVO');
      // estado: ACTIVO | EN_TALLER | BAJA | RESERVA
      // Tipo de vehículo
      table.string('tipo_vehiculo', 80).nullable().defaultTo('OMNIBUS');
      // tipo_vehiculo: OMNIBUS | MICROOMNIBUS | ARTICULADO | ELECTRICO
      table.smallint('capacidad_pasajeros').nullable();
      table.boolean('tiene_rampa').defaultTo(false);
      table.boolean('tiene_wifi').defaultTo(false);
      // Telemetría — última posición conocida
      table.decimal('ultima_lat', 10, 8).nullable();
      table.decimal('ultima_lon', 11, 8).nullable();
      table.timestamp('ultima_pos_at').nullable().comment('Timestamp de la última posición GPS');
      table.decimal('velocidad_kmh', 6, 2).nullable();
      table.string('ultima_linea_activa', 100).nullable();
      // Información técnica
      table.string('modelo', 150).nullable();
      table.integer('anio_fabricacion').nullable();
      table.jsonb('meta').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.index(['estado', 'linea_habitual']);
      table.index(['patente']);
    });

    // Columna PostGIS para posición actual
    if (postgisAvailable) {
      try {
        await knex.raw(`
          ALTER TABLE vehiculos_flota
          ADD COLUMN IF NOT EXISTS ultima_pos geometry(Point, 4326)
        `);
        await knex.raw(`
          CREATE INDEX IF NOT EXISTS idx_vehiculos_ultima_pos
          ON vehiculos_flota USING GIST(ultima_pos)
        `);
        console.log('[MIGRATION] ✅ Columna PostGIS ultima_pos añadida a vehiculos_flota');
      } catch (err) {
        console.warn('[MIGRATION] ⚠️  No se pudo añadir PostGIS a vehiculos_flota:', err.message);
      }
    }

    console.log('[MIGRATION] ✅ Tabla vehiculos_flota creada.');
  } else {
    console.log('[MIGRATION] ℹ️  vehiculos_flota ya existe, omitiendo.');
  }
};

exports.down = async function (knex) {
  // Eliminar triggers y funciones antes de las tablas
  try {
    await knex.raw('DROP TRIGGER IF EXISTS trg_sync_parada_geom ON paradas_gtfs');
    await knex.raw('DROP FUNCTION IF EXISTS fn_sync_parada_geom()');
  } catch (_) {}

  await knex.schema.dropTableIfExists('vehiculos_flota');
  await knex.schema.dropTableIfExists('paradas_gtfs');
  await knex.schema.dropTableIfExists('poligonos_operativos');
};
