import type { Knex } from 'knex';

/**
 * Motor de Protección de Jornal Base por Incidencia Espacial — Escenario 2
 *
 * Evoluciona la tabla `roster_assignments` para soportar el estado
 * 'INCIDENCIA_CALLE' que congela el jornal base del conductor (jornal_equivalente = 1.0)
 * cuando PostGIS confirma que el bus quedó varado en zonas de desvíos oficiales.
 *
 * Se elimina el CHECK rígido anterior y se reemplaza por un dominio ampliado.
 */
export async function up(knex: Knex): Promise<void> {
  // 1. Eliminar el constraint CHECK existente sobre `estado` (si existe)
  await knex.raw(`
    DO $$
    DECLARE
      constraint_name TEXT;
    BEGIN
      SELECT conname INTO constraint_name
      FROM pg_constraint
      WHERE conrelid = 'roster_assignments'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%estado%';
      
      IF constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE roster_assignments DROP CONSTRAINT ' || quote_ident(constraint_name);
      END IF;
    END$$;
  `);

  // 2. Agregar columna jornal_equivalente para sellar el factor de pago (1.0 = 7:30 hs completas)
  const hasJornalCol = await knex.schema.hasColumn('roster_assignments', 'jornal_equivalente');
  if (!hasJornalCol) {
    await knex.schema.alterTable('roster_assignments', (table) => {
      table
        .decimal('jornal_equivalente', 4, 2)
        .nullable()
        .comment(
          'Factor de jornada efectiva: 1.0 = jornada completa (7:30 hs). ' +
          'Se congela en 1.0 cuando estado = INCIDENCIA_CALLE por evaluación PostGIS.'
        );
    });
  }

  // 3. Agregar columna de geolocalización del siniestro para auditoría
  const hasGeoCol = await knex.schema.hasColumn('roster_assignments', 'incidencia_geom');
  if (!hasGeoCol) {
    await knex.raw(`
      ALTER TABLE roster_assignments
      ADD COLUMN IF NOT EXISTS incidencia_geom GEOMETRY(Point, 4326) NULL,
      ADD COLUMN IF NOT EXISTS incidencia_desvio_id VARCHAR(128) NULL,
      ADD COLUMN IF NOT EXISTS incidencia_timestamp TIMESTAMPTZ NULL;
    `);
  }

  // 4. Re-crear el CHECK con el dominio de estados ampliado
  await knex.raw(`
    ALTER TABLE roster_assignments
    ADD CONSTRAINT chk_roster_estado CHECK (
      estado IN (
        'PROGRAMADO',
        'EN_CURSO',
        'FINALIZADO',
        'CANCELADO',
        'REEMPLAZO_REQUERIDO',
        'INCIDENCIA_CALLE'
      )
    );
  `);

  // 5. Índice espacial sobre incidencia_geom para consultas PostGIS O(log n)
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_roster_incidencia_geom
    ON roster_assignments USING GIST (incidencia_geom)
    WHERE incidencia_geom IS NOT NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE roster_assignments DROP CONSTRAINT IF EXISTS chk_roster_estado;
  `);
  await knex.raw(`
    DROP INDEX IF EXISTS idx_roster_incidencia_geom;
    ALTER TABLE roster_assignments
      DROP COLUMN IF EXISTS jornal_equivalente,
      DROP COLUMN IF EXISTS incidencia_geom,
      DROP COLUMN IF EXISTS incidencia_desvio_id,
      DROP COLUMN IF EXISTS incidencia_timestamp;
  `);
}
