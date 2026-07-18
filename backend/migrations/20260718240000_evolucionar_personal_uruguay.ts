import type { Knex } from 'knex';

/**
 * Módulo 10 — RRHH Uruguay: Legajo de Personal con Antigüedad Dinámica (Grupo 13)
 *
 * Agrega columnas al esquema de `personal` para soportar:
 *  - Cálculo de antigüedad exacta en PostgreSQL (EXTRACT YEAR FROM AGE)
 *  - Días de licencia por Ley N° 12.590 (20 días base + adicionales por antigüedad)
 *  - Escalafón laboral Grupo 13 MTSS
 *  - Bloqueo coercitivo de asignaciones para ausentes / enfermos
 */
export async function up(knex: Knex): Promise<void> {
  const hasPersonal = await knex.schema.hasTable('personal');
  if (!hasPersonal) {
    throw new Error(
      'La tabla `personal` no existe. Asegúrese de haber aplicado schema_fase2.sql antes de esta migración.'
    );
  }

  await knex.schema.alterTable('personal', (table) => {
    // ── Datos temporales laborales ───────────────────────────────────────
    table
      .date('fecha_ingreso')
      .notNullable()
      .defaultTo(knex.raw('CURRENT_DATE'))
      .comment('Fecha de alta laboral. Base para cómputo de antigüedad (Ley 12.590).');

    table
      .date('fecha_egreso')
      .nullable()
      .comment('Fecha de baja laboral. NULL = activo. Rellena el sistema al dar de baja.');

    // ── Escalafón Grupo 13 MTSS ──────────────────────────────────────────
    table
      .specificType(
        'categoria_laboral',
        "VARCHAR(30) CHECK (categoria_laboral IN ('CONDUCTOR_1','CONDUCTOR_2','RETEN','LARGADOR','ADMINISTRATIVO'))"
      )
      .nullable()
      .comment('Categoría del Consejo de Salarios Grupo 13 "Transporte y Actividades Conexas".');

    // ── Remuneración base ────────────────────────────────────────────────
    table
      .decimal('sueldo_jornal_base', 14, 2)
      .notNullable()
      .defaultTo(0)
      .comment(
        'Jornal diario base en UYU según categoría y escalafón vigente. ' +
          'Fuente: MTSS https://www.gub.uy/ministerio-trabajo-seguridad-social/'
      );

    // ── Índice para consultas de listería y ausencias ────────────────────
    table.index(['agency_id', 'estado_hoy'], 'idx_personal_agency_estado');
    table.index(['agency_id', 'fecha_ingreso'], 'idx_personal_agency_ingreso');
  });

  // ── Función PostgreSQL: días de licencia Ley 12.590 ─────────────────────
  // Regla Grupo 13:
  //   • Antigüedad < 5 años → 20 días base
  //   • Antigüedad >= 5 años → 20 + 1 día por cada 4 años cumplidos sobre el 5°
  //     Fórmula: 20 + FLOOR((anios - 5) / 4) + 1  para anios >= 5
  await knex.raw(`
    CREATE OR REPLACE FUNCTION fn_dias_licencia_grupo13(p_fecha_ingreso DATE)
    RETURNS INTEGER
    LANGUAGE SQL
    IMMUTABLE
    STRICT
    AS $$
      SELECT CASE
        WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p_fecha_ingreso)) < 5
          THEN 20
        ELSE 20 + 1 + FLOOR(
          (EXTRACT(YEAR FROM AGE(CURRENT_DATE, p_fecha_ingreso)) - 5) / 4
        )::INTEGER
      END;
    $$;
  `);

  // ── Vista materializable: legajo laboral dinámico ────────────────────────
  await knex.raw(`
    CREATE OR REPLACE VIEW v_legajo_laboral AS
    SELECT
      p.id,
      p.agency_id,
      p.internal_number,
      p.full_name,
      p.role,
      p.categoria_laboral,
      p.sueldo_jornal_base,
      p.fecha_ingreso,
      p.fecha_egreso,
      p.estado_hoy,
      p.motivo_ausencia,
      EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.fecha_ingreso))::INTEGER  AS antiguedad_anios,
      EXTRACT(MONTH FROM AGE(CURRENT_DATE, p.fecha_ingreso))::INTEGER AS antiguedad_meses,
      fn_dias_licencia_grupo13(p.fecha_ingreso)                       AS dias_licencia_generados,
      p.sueldo_jornal_base * fn_dias_licencia_grupo13(p.fecha_ingreso) AS monto_licencia_uyun,
      p.sueldo_jornal_base * 30 / 12                                  AS provision_aguinaldo_mensual,
      p.created_at,
      p.updated_at
    FROM personal p
    WHERE p.fecha_egreso IS NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP VIEW IF EXISTS v_legajo_laboral;');
  await knex.raw('DROP FUNCTION IF EXISTS fn_dias_licencia_grupo13(DATE);');

  await knex.schema.alterTable('personal', (table) => {
    table.dropIndex([], 'idx_personal_agency_estado');
    table.dropIndex([], 'idx_personal_agency_ingreso');
    table.dropColumn('fecha_ingreso');
    table.dropColumn('fecha_egreso');
    table.dropColumn('categoria_laboral');
    table.dropColumn('sueldo_jornal_base');
  });
}
