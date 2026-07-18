import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // 1. Agregar hora_login_real y hora_logoff_real a roster_assignments
  await knex.schema.alterTable("roster_assignments", (table) => {
    table.timestamp("hora_login_real", { useTz: true }).nullable();
    table.timestamp("hora_logoff_real", { useTz: true }).nullable();
  });

  // 2. Crear tabla lotes_financieros
  await knex.schema.createTable("lotes_financieros", (table) => {
    table.uuid("id").primary().defaultTo(knex.fn.uuid());
    table.date("fecha_desde").notNullable();
    table.date("fecha_hasta").notNullable();
    table.enum("estado", ["ABIERTO", "CERRADO"]).notNullable().defaultTo("ABIERTO");
    table.string("aprobado_por").nullable();
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("lotes_financieros");
  await knex.schema.alterTable("roster_assignments", (table) => {
    table.dropColumn("hora_login_real");
    table.dropColumn("hora_logoff_real");
  });
}
