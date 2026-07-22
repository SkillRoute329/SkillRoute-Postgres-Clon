import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // 1. Drop dependent views first
  await knex.raw(`DROP VIEW IF EXISTS daily_shifts CASCADE;`);

  // 2. Transfer data from turnos_dia to roster_assignments if turnos_dia exists
  const hasTurnosDia = await knex.schema.hasTable('turnos_dia');
  if (hasTurnosDia) {
    // Add new columns to roster_assignments to support full turnos_dia features
    await knex.schema.alterTable('roster_assignments', (table) => {
      table.string('agency_id', 50).index();
      table.string('terminal', 255);
      table.string('variante_key', 100);
      table.string('turno', 20);
      table.boolean('reserva_activada').defaultTo(false);
      table.string('conductor_reserva_id', 128);
      table.integer('importancia_linea').defaultTo(2);
      table.decimal('impacto_ingresos_estimado');
      table.text('observaciones');
      table.boolean('firma_conductor').defaultTo(false);
      table.string('hora_firma', 8);
      table.jsonb('data_jsonb').defaultTo('{}');
    });

    // Make driver_id and coche_id nullable to support 'sin_conductor' states from turnos_dia
    await knex.raw(`ALTER TABLE roster_assignments ALTER COLUMN driver_id DROP NOT NULL;`);
    await knex.raw(`ALTER TABLE roster_assignments ALTER COLUMN coche_id DROP NOT NULL;`);
    await knex.raw(`ALTER TABLE roster_assignments ALTER COLUMN linea_id DROP NOT NULL;`);

    // Transfer existing records
    await knex.raw(`
      INSERT INTO roster_assignments (
        id, agency_id, driver_id, coche_id, linea_id, hora_inicio, hora_fin, estado,
        terminal, variante_key, turno, reserva_activada, conductor_reserva_id,
        importancia_linea, impacto_ingresos_estimado, observaciones, firma_conductor, hora_firma, data_jsonb
      )
      SELECT 
        id::uuid, agency_id, conductor_id, vehiculo_id, linea_id,
        (fecha || ' ' || hora_salida)::timestamp AT TIME ZONE 'America/Montevideo',
        (fecha || ' ' || COALESCE(hora_llegada_estimada, hora_salida))::timestamp AT TIME ZONE 'America/Montevideo',
        CASE 
          WHEN estado = 'programado' THEN 'PROGRAMADO'
          WHEN estado = 'activo' THEN 'ACTIVO'
          WHEN estado = 'completado' THEN 'FINALIZADO'
          ELSE 'PROGRAMADO'
        END,
        terminal, variante_key, turno, reserva_activada, conductor_reserva_id,
        importancia_linea, impacto_ingresos_estimado, observaciones, firma_conductor, hora_firma, data_jsonb
      FROM turnos_dia
      ON CONFLICT (id) DO NOTHING;
    `);

    // Drop the physical table
    await knex.raw(`DROP TABLE turnos_dia CASCADE;`);
  }

  // 3. Create turnos_dia as a View
  await knex.raw(`
    CREATE VIEW turnos_dia AS
    SELECT
      ra.id,
      ra.agency_id,
      DATE(ra.hora_inicio AT TIME ZONE 'America/Montevideo') as fecha,
      ra.driver_id as conductor_id,
      p.full_name as conductor_nombre,
      p.internal_number as conductor_interno,
      ra.coche_id as vehiculo_id,
      v.internal_number as vehiculo_interno,
      ra.linea_id,
      ra.variante_key,
      ra.turno,
      to_char(ra.hora_inicio AT TIME ZONE 'America/Montevideo', 'HH24:MI') as hora_salida,
      to_char(ra.hora_fin AT TIME ZONE 'America/Montevideo', 'HH24:MI') as hora_llegada_estimada,
      ra.terminal,
      CASE 
        WHEN ra.estado = 'PROGRAMADO' THEN 'programado'
        WHEN ra.estado = 'ACTIVO' THEN 'activo'
        WHEN ra.estado = 'FINALIZADO' THEN 'completado'
        ELSE 'programado'
      END as estado,
      ra.reserva_activada,
      ra.conductor_reserva_id,
      pr.full_name as conductor_reserva_nombre,
      ra.importancia_linea,
      ra.impacto_ingresos_estimado,
      ra.observaciones,
      ra.firma_conductor,
      ra.hora_firma,
      ra.data_jsonb,
      ra.created_at,
      ra.updated_at
    FROM roster_assignments ra
    LEFT JOIN personal p ON ra.driver_id = p.id
    LEFT JOIN personal pr ON ra.conductor_reserva_id = pr.id
    LEFT JOIN vehiculos v ON ra.coche_id = v.id;
  `);

  // 4. Create INSTEAD OF trigger to allow writing to the view (so legacy services keep working)
  await knex.raw(`
    CREATE OR REPLACE FUNCTION tg_turnos_dia_instead_of()
    RETURNS TRIGGER AS $$
    BEGIN
        IF TG_OP = 'INSERT' THEN
            INSERT INTO roster_assignments (
                id, agency_id, driver_id, coche_id, linea_id, hora_inicio, hora_fin, estado, 
                terminal, variante_key, turno, reserva_activada, conductor_reserva_id, 
                importancia_linea, impacto_ingresos_estimado, observaciones, firma_conductor, hora_firma, data_jsonb
            ) VALUES (
                NEW.id, NEW.agency_id, NEW.conductor_id, NEW.vehiculo_id, NEW.linea_id, 
                (NEW.fecha || ' ' || NEW.hora_salida)::timestamp AT TIME ZONE 'America/Montevideo', 
                (NEW.fecha || ' ' || COALESCE(NEW.hora_llegada_estimada, NEW.hora_salida))::timestamp AT TIME ZONE 'America/Montevideo', 
                CASE 
                    WHEN NEW.estado = 'programado' THEN 'PROGRAMADO'
                    WHEN NEW.estado = 'activo' THEN 'ACTIVO'
                    WHEN NEW.estado = 'completado' THEN 'FINALIZADO'
                    ELSE 'PROGRAMADO'
                END,
                NEW.terminal, NEW.variante_key, NEW.turno, COALESCE(NEW.reserva_activada, false), NEW.conductor_reserva_id,
                COALESCE(NEW.importancia_linea, 2), NEW.impacto_ingresos_estimado, NEW.observaciones, COALESCE(NEW.firma_conductor, false), NEW.hora_firma, COALESCE(NEW.data_jsonb, '{}'::jsonb)
            );
            RETURN NEW;
        ELSIF TG_OP = 'UPDATE' THEN
            UPDATE roster_assignments SET
                agency_id = NEW.agency_id,
                driver_id = NEW.conductor_id,
                coche_id = NEW.vehiculo_id,
                linea_id = NEW.linea_id,
                hora_inicio = (NEW.fecha || ' ' || NEW.hora_salida)::timestamp AT TIME ZONE 'America/Montevideo',
                hora_fin = (NEW.fecha || ' ' || COALESCE(NEW.hora_llegada_estimada, NEW.hora_salida))::timestamp AT TIME ZONE 'America/Montevideo',
                estado = CASE 
                    WHEN NEW.estado = 'programado' THEN 'PROGRAMADO'
                    WHEN NEW.estado = 'activo' THEN 'ACTIVO'
                    WHEN NEW.estado = 'completado' THEN 'FINALIZADO'
                    ELSE 'PROGRAMADO'
                END,
                terminal = NEW.terminal,
                variante_key = NEW.variante_key,
                turno = NEW.turno,
                reserva_activada = NEW.reserva_activada,
                conductor_reserva_id = NEW.conductor_reserva_id,
                importancia_linea = NEW.importancia_linea,
                impacto_ingresos_estimado = NEW.impacto_ingresos_estimado,
                observaciones = NEW.observaciones,
                firma_conductor = NEW.firma_conductor,
                hora_firma = NEW.hora_firma,
                data_jsonb = NEW.data_jsonb,
                updated_at = NOW()
            WHERE id = OLD.id;
            RETURN NEW;
        ELSIF TG_OP = 'DELETE' THEN
            DELETE FROM roster_assignments WHERE id = OLD.id;
            RETURN OLD;
        END IF;
        RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trg_instead_of_turnos_dia
    INSTEAD OF INSERT OR UPDATE OR DELETE ON turnos_dia
    FOR EACH ROW EXECUTE FUNCTION tg_turnos_dia_instead_of();
  `);

  // 5. Recreate daily_shifts legacy view
  await knex.raw(`
    CREATE VIEW daily_shifts AS
    SELECT
      id,
      agency_id,
      fecha AS date,
      fecha,
      conductor_id,
      conductor_id AS "conductorId",
      conductor_nombre,
      conductor_interno,
      vehiculo_id,
      vehiculo_id AS "vehiculoId",
      vehiculo_interno,
      linea_id,
      linea_id AS "lineaId",
      linea_id AS linea,
      variante_key,
      turno,
      hora_salida,
      hora_salida AS "horaSalida",
      hora_llegada_estimada,
      terminal,
      estado,
      reserva_activada,
      conductor_reserva_id
    FROM turnos_dia;
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Not fully implemented for safety, but we could recreate the physical table turnos_dia
  // dropping the view and trigger.
  await knex.raw(`DROP VIEW IF EXISTS daily_shifts CASCADE;`);
  await knex.raw(`DROP VIEW IF EXISTS turnos_dia CASCADE;`);
  await knex.raw(`DROP FUNCTION IF EXISTS tg_turnos_dia_instead_of CASCADE;`);
}
