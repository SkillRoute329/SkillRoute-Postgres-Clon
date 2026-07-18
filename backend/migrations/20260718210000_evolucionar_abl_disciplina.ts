import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Verificamos si la tabla abl_red_numbers existe (creada en schema_fase5_27)
  const hasTable = await knex.schema.hasTable("abl_red_numbers");

  if (hasTable) {
    await knex.schema.alterTable("abl_red_numbers", (table) => {
      // Eliminar columnas ambiguas
      table.dropColumn("motivo");
      table.dropColumn("estado");

      // Añadir tipado fuerte
      table.enum("tipo_alerta", ["EXCESO_VELOCIDAD", "ENGAÑO_HORARIO", "FRAUDE_INSPECCION", "MANUAL"]).notNullable().defaultTo("MANUAL");
      table.jsonb("evidencia_jsonb").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
      table.enum("estado_tramite", ["PENDIENTE_DESCARGO", "PRESENTADO", "EVALUADO_COMISION", "SANCIONADO", "ARCHIVADO"]).notNullable().defaultTo("PENDIENTE_DESCARGO");
      table.text("descargo_conductor").nullable();
      table.timestamp("fecha_descargo", { useTz: true }).nullable();
    });
  } else {
    // Si no existiera, la creamos completa (SaaS-ready)
    await knex.schema.createTable("abl_red_numbers", (table) => {
      table.string("id", 128).primary();
      table.string("conductor_id", 128).notNullable().references("id").inTable("users");
      table.string("agency_id", 50).notNullable().references("agency_id").inTable("empresas");
      
      table.enum("tipo_alerta", ["EXCESO_VELOCIDAD", "ENGAÑO_HORARIO", "FRAUDE_INSPECCION", "MANUAL"]).notNullable();
      table.jsonb("evidencia_jsonb").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
      table.enum("estado_tramite", ["PENDIENTE_DESCARGO", "PRESENTADO", "EVALUADO_COMISION", "SANCIONADO", "ARCHIVADO"]).notNullable().defaultTo("PENDIENTE_DESCARGO");
      
      table.text("descargo_conductor").nullable();
      table.timestamp("fecha_descargo", { useTz: true }).nullable();

      table.date("fecha_apertura").notNullable().defaultTo(knex.fn.now());
      table.date("fecha_cierre").nullable();
      table.jsonb("data_jsonb").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable("abl_red_numbers");
  if (hasTable) {
    await knex.schema.alterTable("abl_red_numbers", (table) => {
      table.dropColumn("tipo_alerta");
      table.dropColumn("evidencia_jsonb");
      table.dropColumn("estado_tramite");
      table.dropColumn("descargo_conductor");
      table.dropColumn("fecha_descargo");
      
      table.string("motivo", 255);
      table.string("estado", 50).notNullable().defaultTo("abierto");
    });
  }
}
