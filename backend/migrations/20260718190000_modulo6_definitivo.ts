import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // 1. Crear bitácora de alertas de auditoría interna
  await knex.schema.createTable("alertas_auditoria", (table) => {
    table.uuid("id").primary().defaultTo(knex.fn.uuid());
    table.string("agency_id", 50).notNullable();
    table.string("inspector_id", 128).notNullable();
    table.string("driver_id", 128).nullable();
    table.string("tipo_alerta", 50).notNullable(); // ej. 'ALERTA_DISCORDANCIA'
    table.text("mensaje").notNullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });

  // 2. Modificar el enum de estado_verificacion en inspecciones
  // En Knex con Postgres, la forma más limpia de resetear un enum si no hay datos críticos es 
  // eliminar la columna y volverla a crear.
  await knex.schema.alterTable("inspecciones", (table) => {
    table.dropColumn("estado_verificacion");
  });

  await knex.schema.alterTable("inspecciones", (table) => {
    table.enum("estado_verificacion", [
      "VERIFICADO_A_BORDO",
      "VERIFICADO_EN_CORREDOR",
      "ALERTA_DISCORDANCIA"
    ]).defaultTo("VERIFICADO_EN_CORREDOR");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("alertas_auditoria");
  
  await knex.schema.alterTable("inspecciones", (table) => {
    table.dropColumn("estado_verificacion");
  });

  await knex.schema.alterTable("inspecciones", (table) => {
    table.enum("estado_verificacion", ["PENDIENTE", "FISCALIZADO_REAL", "RECHAZADO_POR_FRAUDE"]).defaultTo("PENDIENTE");
  });
}
