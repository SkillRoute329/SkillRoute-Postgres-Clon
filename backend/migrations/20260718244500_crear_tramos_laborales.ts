import type { Knex } from 'knex';

/**
 * Motor de Sumatoria de Tramos Laborales Históricos — Escenario de Falla 3 (Paradoja de Reingresos)
 * 
 * 1. Crea la tabla `personal_periods` para registrar cada alta y baja.
 * 2. Evoluciona la función `fn_dias_licencia_grupo13` para que sume todos los tramos históricos.
 * 3. Actualiza la vista `v_legajo_laboral` para usar la antigüedad total calculada por tramos.
 */
export async function up(knex: Knex): Promise<void> {
  // 1. Crear tabla de períodos históricos
  await knex.schema.createTable('personal_periods', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    
    table
      .string('personal_id', 128)
      .notNullable()
      .references('id')
      .inTable('personal')
      .onDelete('CASCADE')
      .comment('Referencia al trabajador');

    table.date('fecha_ingreso').notNullable().comment('Alta del trabajador en este tramo');
    table.date('fecha_egreso').nullable().comment('Baja del trabajador en este tramo (NULL si sigue activo)');
    
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['personal_id'], 'idx_personal_periods_personal_id');
  });

  // Migrar los ingresos/egresos actuales a la tabla de períodos para no perder data.
  await knex.raw(`
    INSERT INTO personal_periods (personal_id, fecha_ingreso, fecha_egreso)
    SELECT id, fecha_ingreso, fecha_egreso
    FROM personal
    WHERE fecha_ingreso IS NOT NULL;
  `);

  // 2. Reemplazar la función pl/sql para que opere sobre personal_periods
  await knex.raw('DROP FUNCTION IF EXISTS fn_dias_licencia_grupo13(DATE);');
  
  // Nueva función que recibe el ID del trabajador
  await knex.raw(`
    CREATE OR REPLACE FUNCTION fn_dias_licencia_grupo13(p_personal_id VARCHAR)
    RETURNS INTEGER AS $$
    DECLARE
      v_dias_acumulados INTEGER;
      v_anios_comerciales NUMERIC;
      v_anios_base INTEGER;
      v_dias_licencia INTEGER;
    BEGIN
      -- Sumar los días efectivos de cada tramo histórico
      SELECT COALESCE(SUM(COALESCE(fecha_egreso, CURRENT_DATE) - fecha_ingreso), 0)
      INTO v_dias_acumulados
      FROM personal_periods
      WHERE personal_id = p_personal_id;

      -- Convertir días a años comerciales
      v_anios_comerciales := v_dias_acumulados / 365.25;
      v_anios_base := FLOOR(v_anios_comerciales)::INTEGER;

      -- Algoritmo Ley N° 12.590 - Grupo 13
      IF v_anios_base < 5 THEN
        v_dias_licencia := 20;
      ELSE
        -- 20 base + 1 por 5to año + 1 por cada 4 años extra (suelo aritmético)
        v_dias_licencia := 20 + 1 + FLOOR((v_anios_base - 5) / 4);
      END IF;

      RETURN v_dias_licencia;
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;
  `);
  
  // Nueva función para obtener la antigüedad en años para visualización, ya que la vista lo necesita
  await knex.raw(`
    CREATE OR REPLACE FUNCTION fn_antiguedad_anios(p_personal_id VARCHAR)
    RETURNS NUMERIC AS $$
    DECLARE
      v_dias_acumulados INTEGER;
    BEGIN
      SELECT COALESCE(SUM(COALESCE(fecha_egreso, CURRENT_DATE) - fecha_ingreso), 0)
      INTO v_dias_acumulados
      FROM personal_periods
      WHERE personal_id = p_personal_id;
      
      RETURN v_dias_acumulados / 365.25;
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;
  `);
  
  // 3. Recrear la vista v_legajo_laboral para usar las nuevas funciones
  await knex.raw('DROP VIEW IF EXISTS v_legajo_laboral;');
  
  await knex.raw(`
    CREATE VIEW v_legajo_laboral AS
    SELECT 
      p.id,
      p.full_name,
      p.internal_number,
      p.document_id,
      p.email,
      p.phone,
      p.agency_id,
      p.categoria_laboral,
      p.sueldo_jornal_base,
      p.estado_hoy,
      p.fecha_ingreso, -- fecha del último ingreso (para retrocompatibilidad)
      
      -- Antigüedad consolidada real (Años y Meses aproximados para visualización, usando la función)
      FLOOR(fn_antiguedad_anios(p.id))::TEXT || ' años, ' || 
      FLOOR((fn_antiguedad_anios(p.id) - FLOOR(fn_antiguedad_anios(p.id))) * 12)::TEXT || ' meses' AS antiguedad_txt,
      
      FLOOR(fn_antiguedad_anios(p.id)) AS anios_antiguedad,

      -- Licencias Grupo 13 delegadas al motor SQL por ID
      fn_dias_licencia_grupo13(p.id)                       AS dias_licencia_generados,
      p.sueldo_jornal_base * fn_dias_licencia_grupo13(p.id) AS monto_licencia_uyun,

      -- Provisión de aguinaldo mensual base
      p.sueldo_jornal_base * (30.0 / 12.0)                 AS prov_aguinaldo_mensual_uyun

    FROM personal p
    WHERE p.fecha_egreso IS NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Revertir a la versión anterior de la vista
  await knex.raw('DROP VIEW IF EXISTS v_legajo_laboral;');
  
  await knex.raw('DROP FUNCTION IF EXISTS fn_dias_licencia_grupo13(VARCHAR);');
  await knex.raw('DROP FUNCTION IF EXISTS fn_antiguedad_anios(VARCHAR);');
  
  await knex.raw(`
    CREATE OR REPLACE FUNCTION fn_dias_licencia_grupo13(p_fecha_ingreso DATE)
    RETURNS INTEGER AS $$
    DECLARE
      v_anios INTEGER;
      v_dias INTEGER;
    BEGIN
      IF p_fecha_ingreso IS NULL THEN
        RETURN 20;
      END IF;
      
      v_anios := EXTRACT(YEAR FROM AGE(CURRENT_DATE, p_fecha_ingreso))::INTEGER;
      
      IF v_anios < 5 THEN
        v_dias := 20;
      ELSE
        v_dias := 20 + 1 + FLOOR((v_anios - 5) / 4);
      END IF;
      
      RETURN v_dias;
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;
  `);
  
  await knex.raw(`
    CREATE VIEW v_legajo_laboral AS
    SELECT 
      p.id,
      p.full_name,
      p.internal_number,
      p.document_id,
      p.email,
      p.phone,
      p.agency_id,
      p.categoria_laboral,
      p.sueldo_jornal_base,
      p.estado_hoy,
      p.fecha_ingreso,
      
      -- Antigüedad en texto
      EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.fecha_ingreso))::TEXT || ' años, ' || 
      EXTRACT(MONTH FROM AGE(CURRENT_DATE, p.fecha_ingreso))::TEXT || ' meses' AS antiguedad_txt,
      
      EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.fecha_ingreso)) AS anios_antiguedad,

      fn_dias_licencia_grupo13(p.fecha_ingreso)                       AS dias_licencia_generados,
      p.sueldo_jornal_base * fn_dias_licencia_grupo13(p.fecha_ingreso) AS monto_licencia_uyun,

      p.sueldo_jornal_base * (30.0 / 12.0)                 AS prov_aguinaldo_mensual_uyun

    FROM personal p
    WHERE p.fecha_egreso IS NULL;
  `);

  await knex.schema.dropTableIfExists('personal_periods');
}
