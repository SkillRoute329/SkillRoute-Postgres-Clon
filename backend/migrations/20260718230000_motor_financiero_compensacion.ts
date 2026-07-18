import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable("driver_ledger");

  if (!hasTable) {
    await knex.schema.createTable("driver_ledger", (table) => {
      table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      table.string("agency_id", 50).notNullable().references("agency_id").inTable("empresas");
      table.string("conductor_id", 128).notNullable();
      table.decimal("monto", 14, 2).notNullable();
      table.string("tipo_transaccion", 50).notNullable(); // INGRESO_TURNO, DEDUCCION_TALLER, DEDUCCION_SANCION
      table.string("referencia_id", 128); // id of the source (turnos_dia.id, maintenance_work_logs.id, etc.)
      table.string("descripcion", 255);
      table.timestamp("fecha", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      
      table.index(["agency_id", "conductor_id"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("driver_ledger");
}
