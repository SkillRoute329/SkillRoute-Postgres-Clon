import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // 1. Crear la tabla de configuración de inquilinos
  await knex.schema.createTable("tenant_configs", (table) => {
    table.uuid("id").primary().defaultTo(knex.fn.uuid());
    // Hacemos que agency_id no sea una llave foránea estricta si empresas no está bien poblada,
    // pero conceptualmente referencia a empresas(agency_id)
    table.string("agency_id", 50).unique().notNullable();
    table.string("country_code", 2).notNullable();
    table.string("timezone_string", 50).notNullable();
    table.integer("postgis_srid").notNullable();
    table.jsonb("labor_rules_jsonb").notNullable();
    table.timestamps(true, true);
  });

  // 2. Siembra inicial (Seed in-place) para retrocompatibilidad
  await knex("tenant_configs").insert({
    agency_id: 'ucot',
    country_code: 'UY',
    timezone_string: 'America/Montevideo',
    postgis_srid: 32721,
    labor_rules_jsonb: JSON.stringify({
      nocturnity: { start_hour: 22, end_hour: 6 },
      max_regular_hours: 8,
      overtime_multiplier: 1.5
    })
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("tenant_configs");
}
