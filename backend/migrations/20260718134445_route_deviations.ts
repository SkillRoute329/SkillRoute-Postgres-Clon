import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("route_deviations", (table) => {
    table.uuid("id").primary().defaultTo(knex.fn.uuid());
    table.string("linea_id").notNullable().index();
    table.string("sentido_direccion").notNullable();
    table.text("geometria_desvio").notNullable();
    table.enum("motivo", ["OBRA", "FERIA", "ACCIDENTE"]).notNullable();
    table.boolean("activo").notNullable().defaultTo(true);
    table.string("creado_por").notNullable().references("id").inTable("personal").onDelete("RESTRICT");
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("route_deviations");
}
