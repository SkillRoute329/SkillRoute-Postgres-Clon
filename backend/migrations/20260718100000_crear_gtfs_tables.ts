import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Habilitar extensión PostGIS
  await knex.raw('CREATE EXTENSION IF NOT EXISTS postgis');

  await knex.schema.createTable('gtfs_agency', table => {
    table.string('agency_id').primary();
    table.string('agency_name').notNullable();
    table.string('agency_url').notNullable();
    table.string('agency_timezone').notNullable();
  });

  await knex.schema.createTable('gtfs_routes', table => {
    table.string('route_id').primary();
    table.string('agency_id').references('agency_id').inTable('gtfs_agency').onDelete('CASCADE');
    table.string('route_short_name').notNullable();
    table.string('route_long_name').notNullable();
    table.integer('route_type').notNullable();
  });

  await knex.schema.createTable('gtfs_stops', table => {
    table.string('stop_id').primary();
    table.string('stop_name').notNullable();
    table.decimal('stop_lat', 10, 7).notNullable();
    table.decimal('stop_lon', 10, 7).notNullable();
  });
  
  // Agregar columna geoespacial real a gtfs_stops
  await knex.raw(`SELECT AddGeometryColumn('public', 'gtfs_stops', 'geom', 4326, 'POINT', 2)`);
  // Insertar un trigger o hacerlo manual al sembrar
  
  await knex.schema.createTable('gtfs_shapes', table => {
    table.string('shape_id').notNullable();
    table.decimal('shape_pt_lat', 10, 7).notNullable();
    table.decimal('shape_pt_lon', 10, 7).notNullable();
    table.integer('shape_pt_sequence').notNullable();
    table.primary(['shape_id', 'shape_pt_sequence']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('gtfs_shapes');
  await knex.schema.dropTableIfExists('gtfs_stops');
  await knex.schema.dropTableIfExists('gtfs_routes');
  await knex.schema.dropTableIfExists('gtfs_agency');
}
