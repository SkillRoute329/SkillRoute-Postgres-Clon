import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Purga de la tabla huérfana
  await knex.schema.dropTableIfExists("incident_reports");

  // Reconstrucción Relacional Estricta
  await knex.schema.createTable("incident_reports", (table) => {
    table.uuid("id").primary().defaultTo(knex.fn.uuid());
    
    // Inyección de Foreign Keys (Protección ISO)
    table.string("vehicle_id").notNullable().references("id").inTable("vehiculos").onDelete("RESTRICT");
    table.string("driver_id").notNullable().references("id").inTable("personal").onDelete("RESTRICT");
    table.uuid("carton_id").nullable().references("id").inTable("roster_assignments").onDelete("SET NULL");
    
    table.decimal("latitud", 10, 7).notNullable();
    table.decimal("longitud", 10, 7).notNullable();
    
    table.enum("tipo_incidente", ["DESVIO", "MECANICA", "ACCIDENTE", "OTRO"]).notNullable();
    table.text("mensaje").nullable();
    table.string("estado").notNullable().defaultTo("ACTIVO");
    
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("incident_reports");
}
