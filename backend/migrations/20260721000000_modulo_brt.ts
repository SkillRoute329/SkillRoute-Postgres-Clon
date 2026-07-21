import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Configuración financiera BRT
  await knex.schema.createTable("brt_financial_config", (table) => {
    table.integer("id").primary().defaultTo(1);
    table.decimal("tarifa_actual_uyus", 10, 2).defaultTo(45);
    table.decimal("costo_dia_actual_uyus", 10, 2).defaultTo(15000);
    table.decimal("tarifa_km_brt_uyus", 10, 2).defaultTo(420);
    table.decimal("km_promedio_dia", 10, 2).defaultTo(220);
    table.integer("pasajeros_prom_dia").defaultTo(450);
    table.decimal("captacion_empresa", 3, 2).defaultTo(0.70);
    table.decimal("brt_bonus_nocturno", 3, 2).defaultTo(1.15);
    table.decimal("brt_riesgo_kpi_min", 3, 2).defaultTo(0.90);
    table.decimal("brt_costo_dia", 10, 2).defaultTo(18000);
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
  });

  // Escenarios de simulación (Desvíos y Contingencias)
  await knex.schema.createTable("brt_scenarios", (table) => {
    table.string("id", 50).primary();
    table.string("titulo", 100).notNullable();
    table.string("tramo", 150).notNullable();
    table.text("descripcion").notNullable();
    table.integer("pasajeros_desplazados").defaultTo(0);
    table.jsonb("lineas_afectadas").defaultTo('[]');
    table.decimal("duracion_est_meses", 4, 1).defaultTo(1.0);
    table.integer("impacto_passenger_min").defaultTo(0);
    table.decimal("costo_adicional_dia", 10, 2).defaultTo(0);
    table.jsonb("plan_desvio").defaultTo('[]');
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });

  // Seed default values for financial config
  await knex("brt_financial_config").insert({ id: 1 });

  // Seed default scenarios to match existing ones
  await knex("brt_scenarios").insert([
    {
      id: "obra_8oct",
      titulo: "Renovación 8 de Octubre (Corredor)",
      tramo: "Habana - Pan de Azúcar",
      descripcion: "Obra mayor de recapado y ampliación de veredas. Obliga a desviar el 100% de la flota por Av. Centenario.",
      pasajeros_desplazados: 12500,
      lineas_afectadas: JSON.stringify(["103", "104", "105", "109", "110"]),
      duracion_est_meses: 2.5,
      impacto_passenger_min: 15,
      costo_adicional_dia: 145000,
      plan_desvio: JSON.stringify([
        { tipo: "desvio", accion: "Ruteo por Centenario (ambos sentidos)" },
        { tipo: "refuerzo", accion: "+4 unidades en pico para 103 y 105" },
        { tipo: "info", accion: "Inspectores en puntos ciegos" }
      ])
    },
    {
      id: "obra_18jul",
      titulo: "Peatonalización 18 de Julio",
      tramo: "Pza Independencia - Ejido",
      descripcion: "Cierre total del centro para ensanche de aceras. Impacta terminales de Ciudad Vieja.",
      pasajeros_desplazados: 28000,
      lineas_afectadas: JSON.stringify(["21", "104", "180", "187"]),
      duracion_est_meses: 6,
      impacto_passenger_min: 22,
      costo_adicional_dia: 320000,
      plan_desvio: JSON.stringify([
        { tipo: "desvio", accion: "Ingreso por Mercedes, salida por Colonia" },
        { tipo: "refuerzo", accion: "Creación de 3 paradas provisorias" },
        { tipo: "especial", accion: "Terminal provisoria en Plaza España" }
      ])
    }
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("brt_scenarios");
  await knex.schema.dropTableIfExists("brt_financial_config");
}
