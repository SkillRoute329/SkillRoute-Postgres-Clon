import type { Knex } from 'knex';

/**
 * Motor de Alertas de Tráfico Vacante — Escenario de Falla 1: Quiebre de Retenes
 *
 * Crea la tabla `traffic_alerts` para registrar de forma inmutable las vacantes
 * que quedan desprotegidas cuando un conductor titular falta y no hay retén disponible.
 * Aislada por agency_id (SaaS Multi-Tenant).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('traffic_alerts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    table
      .string('agency_id', 50)
      .notNullable()
      .references('agency_id')
      .inTable('empresas')
      .onDelete('CASCADE')
      .comment('Aislamiento SaaS: alerta visible únicamente para la empresa emisora.');

    table
      .string('linea_id', 50)
      .nullable()
      .comment('Línea o servicio que queda sin cobertura.');

    table
      .string('servicio_id', 128)
      .nullable()
      .comment('ID de la asignación (roster_assignments.id) que quedó vacante.');

    table
      .string('tipo_alerta', 50)
      .notNullable()
      .comment('Ej: VACANTE_SIN_RETEN | DOBLE_ASIGNACION | FATIGA_DETECTADA');

    table
      .string('nivel_gravedad', 20)
      .notNullable()
      .defaultTo('INFO')
      .comment('CRITICO | ALTO | MEDIO | INFO');

    table
      .text('mensaje')
      .notNullable()
      .comment('Descripción human-readable para el despachador.');

    table
      .string('driver_ausente_id', 128)
      .nullable()
      .comment('ID del conductor que originó la vacante.');

    table
      .string('reten_asignado_id', 128)
      .nullable()
      .comment('ID del retén asignado automáticamente (NULL = sin cobertura).');

    table
      .boolean('resuelta')
      .notNullable()
      .defaultTo(false)
      .comment('TRUE cuando el despachador confirma haber gestionado la alerta.');

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    // Índices para polling eficiente del dashboard de tráfico
    table.index(['agency_id', 'resuelta', 'nivel_gravedad'], 'idx_traffic_alerts_panel');
    table.index(['agency_id', 'created_at'], 'idx_traffic_alerts_time');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('traffic_alerts');
}
