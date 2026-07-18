import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("competitor_behavior_stats", (table) => {
    table.uuid("id").primary().defaultTo(knex.fn.uuid());
    table.string("linea_rival_id").notNullable().index();
    table.string("stop_id").notNullable().index();
    table.integer("direction_id").notNullable().index();
    table.integer("delta_segundos_promedio").notNullable().defaultTo(0); // Desvío real sobre el papel
    table.integer("muestra_conteos").notNullable().defaultTo(0);
    table.timestamp("ultima_actualizacion", { useTz: true }).defaultTo(knex.fn.now());
    
    // Unique constraint para evitar duplicados del mismo rival en el mismo nodo y sentido
    table.unique(["linea_rival_id", "stop_id", "direction_id"], { indexName: 'idx_unique_rival_stop_dir' });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("competitor_behavior_stats");
}
