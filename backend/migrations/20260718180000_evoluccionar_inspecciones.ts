import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Evolución de tabla inspecciones: GEOMETRY, estado_verificacion, driver_id
  await knex.schema.alterTable("inspecciones", (table) => {
    table.specificType("geom", "GEOMETRY(Point, 4326)");
    table.enum("estado_verificacion", ["PENDIENTE", "FISCALIZADO_REAL", "RECHAZADO_POR_FRAUDE"]).defaultTo("PENDIENTE");
    table.string("driver_id", 128).references("id").inTable("users"); // Suponiendo que users tiene los conductores
  });

  // Índice espacial PostGIS para inspecciones
  await knex.raw('CREATE INDEX idx_inspecciones_geom ON inspecciones USING GIST(geom);');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_inspecciones_geom;');
  
  await knex.schema.alterTable("inspecciones", (table) => {
    table.dropColumn("geom");
    table.dropColumn("estado_verificacion");
    table.dropColumn("driver_id");
  });
}
