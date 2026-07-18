import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("roster_assignments", (table) => {
    table.uuid("id").primary().defaultTo(knex.fn.uuid());
    table.string("coche_id").notNullable().index();
    table.string("driver_id").notNullable().index();
    table.string("linea_id").notNullable();
    table.timestamp("hora_inicio", { useTz: true }).notNullable();
    table.timestamp("hora_fin", { useTz: true }).notNullable();
    table.enum("estado", ["PROGRAMADO", "ACTIVO", "FINALIZADO"]).notNullable().defaultTo("PROGRAMADO");
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("roster_assignments");
}
