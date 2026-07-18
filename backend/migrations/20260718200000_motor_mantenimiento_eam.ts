import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Tabla maintenance_tickets
  await knex.schema.createTable("maintenance_tickets", (table) => {
    table.uuid("id").primary().defaultTo(knex.fn.uuid());
    table.string("agency_id", 50).notNullable();
    table.string("vehiculo_id", 128).notNullable().references("id").inTable("vehiculos");
    table.string("reporter_id", 128).notNullable().references("id").inTable("users");
    table.enum("sector_afectado", ["MECANICA", "ELECTRICIDAD", "GOMERIA", "CARROCERIA"]).notNullable();
    table.enum("gravedad", ["CRITICA", "LEVE"]).notNullable();
    table.text("descripcion").notNullable();
    table.enum("estado", ["PENDIENTE", "EN_REPARACION", "RESUELTO"]).defaultTo("PENDIENTE");
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });

  // Tabla maintenance_work_logs
  await knex.schema.createTable("maintenance_work_logs", (table) => {
    table.uuid("id").primary().defaultTo(knex.fn.uuid());
    table.uuid("ticket_id").notNullable().references("id").inTable("maintenance_tickets").onDelete("CASCADE");
    table.string("operario_id", 128).notNullable().references("id").inTable("users");
    table.timestamp("fecha_inicio").defaultTo(knex.fn.now());
    table.timestamp("fecha_fin").nullable();
    table.jsonb("repuestos_utilizados_jsonb").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("maintenance_work_logs");
  await knex.schema.dropTableIfExists("maintenance_tickets");
}
