import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // 1. Tabla de Auditoría: vehicle_swaps_in_route
  await knex.schema.createTable("vehicle_swaps_in_route", (table) => {
    table.uuid("id").primary().defaultTo(knex.fn.uuid());
    table.uuid("carton_id").notNullable().references("id").inTable("roster_assignments").onDelete("RESTRICT");
    table.string("coche_antiguo_id").notNullable();
    table.string("coche_nuevo_id").notNullable();
    table.timestamp("hora_relevo", { useTz: true }).defaultTo(knex.fn.now());
    table.text("justificacion_motivo").notNullable();
    table.string("listero_id").notNullable().references("id").inTable("personal").onDelete("RESTRICT");
    table.timestamps(true, true);
  });

  // 2. Add direction_id to incident_reports (if not exists)
  await knex.schema.alterTable("incident_reports", (table) => {
    table.integer("direction_id").nullable().index();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("incident_reports", (table) => {
    table.dropColumn("direction_id");
  });
  await knex.schema.dropTableIfExists("vehicle_swaps_in_route");
}
