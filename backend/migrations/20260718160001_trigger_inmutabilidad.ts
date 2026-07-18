import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // 1. Crear la función del trigger
  await knex.raw(`
    CREATE OR REPLACE FUNCTION fn_prevent_closed_mutation()
    RETURNS TRIGGER AS $$
    DECLARE
      v_fecha DATE;
      v_is_closed BOOLEAN;
    BEGIN
      -- Determinar la fecha según la tabla
      IF TG_TABLE_NAME = 'roster_assignments' THEN
        -- Si es un UPDATE o INSERT en roster_assignments
        -- Usamos hora_inicio (programada) o hora_login_real para chequear
        v_fecha := DATE(COALESCE(NEW.hora_inicio, NOW()));
      ELSIF TG_TABLE_NAME = 'vehicle_events' THEN
        -- Si es un UPDATE o INSERT en vehicle_events
        v_fecha := DATE(COALESCE(NEW.timestamp_gps, NOW()));
      ELSE
        v_fecha := CURRENT_DATE;
      END IF;

      -- Verificar si existe un lote financiero cerrado que cubra esa fecha
      SELECT EXISTS (
        SELECT 1 
        FROM lotes_financieros 
        WHERE estado = 'CERRADO' 
          AND v_fecha BETWEEN fecha_desde AND fecha_hasta
      ) INTO v_is_closed;

      IF v_is_closed THEN
        RAISE EXCEPTION 'VIOLACION DE INMUTABILIDAD CONTABLE: El registro pertenece a un lote financiero CERRADO (%).', v_fecha;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // 2. Crear trigger en roster_assignments
  await knex.raw(`
    DROP TRIGGER IF EXISTS tg_prevent_closed_mutation_roster ON roster_assignments;
    CREATE TRIGGER tg_prevent_closed_mutation_roster
    BEFORE INSERT OR UPDATE ON roster_assignments
    FOR EACH ROW
    EXECUTE FUNCTION fn_prevent_closed_mutation();
  `);

  // 3. Crear trigger en vehicle_events
  await knex.raw(`
    DROP TRIGGER IF EXISTS tg_prevent_closed_mutation_ve ON vehicle_events;
    CREATE TRIGGER tg_prevent_closed_mutation_ve
    BEFORE INSERT OR UPDATE ON vehicle_events
    FOR EACH ROW
    EXECUTE FUNCTION fn_prevent_closed_mutation();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TRIGGER IF EXISTS tg_prevent_closed_mutation_ve ON vehicle_events;`);
  await knex.raw(`DROP TRIGGER IF EXISTS tg_prevent_closed_mutation_roster ON roster_assignments;`);
  await knex.raw(`DROP FUNCTION IF EXISTS fn_prevent_closed_mutation();`);
}
