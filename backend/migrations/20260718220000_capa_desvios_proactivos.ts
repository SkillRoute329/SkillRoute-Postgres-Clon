import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable("route_detours");

  if (!hasTable) {
    await knex.schema.createTable("route_detours", (table) => {
      table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      table.string("agency_id", 50).notNullable().references("agency_id").inTable("empresas");
      table.string("linea_id", 128).notNullable();
      table.specificType("geom_excluyente", "geometry(Polygon, 4326)").notNullable();
      table.specificType("geom_alternativa", "geometry(LineString, 4326)").notNullable();
      table.timestamp("fecha_inicio", { useTz: true }).notNullable();
      table.timestamp("fecha_fin", { useTz: true }).notNullable();
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });

    // Añadir índices espaciales GiST
    await knex.raw(`
      CREATE INDEX idx_route_detours_geom_excluyente 
      ON route_detours 
      USING GIST (geom_excluyente);
    `);

    await knex.raw(`
      CREATE INDEX idx_route_detours_geom_alternativa 
      ON route_detours 
      USING GIST (geom_alternativa);
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS idx_route_detours_geom_alternativa;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_route_detours_geom_excluyente;`);
  await knex.schema.dropTableIfExists("route_detours");
}
