import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("cartones_servicio", (table) => {
    table.uuid("id").primary().defaultTo(knex.fn.uuid());
    table.string("numero_carton").notNullable().index();
    table.string("coche_id").notNullable().index();
    table.timestamp("hora_inicio", { useTz: true }).notNullable();
    table.timestamp("hora_fin", { useTz: true }).notNullable();
    table.text("etapas_data").notNullable();
    table.timestamps(true, true);
  });

  await knex.schema.createTable("driver_service_logs", (table) => {
    table.uuid("id").primary().defaultTo(knex.fn.uuid());
    table.string("driver_id").notNullable().index();
    table.string("coche_id").notNullable().index();
    table.string("carton_id").notNullable();
    table.timestamp("hora_inicio", { useTz: true }).notNullable();
    table.timestamp("hora_fin", { useTz: true }).notNullable();
    table.string("modificado_por").nullable();
    table.text("justificacion_motivo").nullable();
    table.timestamps(true, true);
  });

  await knex.schema.createTable("service_requests", (table) => {
    table.uuid("id").primary().defaultTo(knex.fn.uuid());
    // Referencia abstracta indexada debido a la naturaleza heterogénea de la tabla 'personal' legacy
    table.string("driver_id").notNullable().index();
    table.string("coche_preferencia").nullable();
    table.enum("tipo_solicitud", ["DOBLETE_CORRELATIVO", "LIBERAR_TURNO"]).notNullable();
    table.enum("estado_solicitud", ["PROCESANDO", "EMPARETADO", "PENDIENTE"]).notNullable().defaultTo("PENDIENTE");
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("service_requests");
  await knex.schema.dropTableIfExists("driver_service_logs");
  await knex.schema.dropTableIfExists("cartones_servicio");
}
