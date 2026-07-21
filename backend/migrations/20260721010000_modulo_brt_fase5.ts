import { Knex } from "knex";
import * as fs from 'fs';
import * as path from 'path';

export async function up(knex: Knex): Promise<void> {
  // 1. Crear tabla brt_corredores
  await knex.schema.createTable("brt_corredores", (table) => {
    table.string("id", 50).primary();
    table.string("linea_ref", 50);
    table.string("nombre", 150).notNullable();
    table.string("subtitulo", 255);
    table.string("color", 20);
    table.string("color_bg", 50);
    table.string("color_text", 50);
    table.string("color_border", 50);
    table.decimal("km_troncal", 10, 2);
    table.integer("tiempo_actual_min");
    table.integer("tiempo_brt_min");
    table.integer("pasajeros_dia_direccion");
    table.jsonb("niveles").defaultTo('[]');
    table.jsonb("paradas").defaultTo('[]');
    table.jsonb("lineas_ucot_afectadas").defaultTo('[]');
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });

  // 2. Crear tabla brt_alimentadoras
  await knex.schema.createTable("brt_alimentadoras", (table) => {
    table.string("id", 50).primary();
    table.string("nombre", 150).notNullable();
    table.text("descripcion");
    table.text("recorrido");
    table.decimal("km_estimado", 10, 2);
    table.integer("frecuencia_min");
    table.string("corredor_alimenta", 50);
    table.integer("pasajeros_est_dia");
    table.integer("conductores_necesarios");
    table.integer("coches_necesarios");
    table.string("viabilidad", 50);
    table.decimal("ingreso_est_dia", 12, 2);
    table.string("linea_existente_migracion", 50).nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });

  // Seeds for brt_corredores
  await knex("brt_corredores").insert([
    {
      id: 'A',
      linea_ref: '316',
      nombre: 'Línea A — 8 de Octubre',
      subtitulo: 'Zonamérica → Camino Maldonado → Av. 8 de Octubre → Tres Cruces → 18 de Julio → Pza. Independencia',
      color: '#ef4444',
      color_bg: 'bg-red-500',
      color_text: 'text-red-400',
      color_border: 'border-red-700/40',
      km_troncal: 24,
      tiempo_actual_min: 68,
      tiempo_brt_min: 38,
      pasajeros_dia_direccion: 45000,
      niveles: JSON.stringify([-2]),
      paradas: JSON.stringify([
        { nombre: 'Zonamérica', lat: -34.795, lng: -56.065, tipo: 'terminal' },
        { nombre: 'Cno. Maldonado y Belloni', lat: -34.838, lng: -56.134, tipo: 'nodo' },
        { nombre: '8 de Octubre y Pan de Azúcar', lat: -34.851, lng: -56.14, tipo: 'intermedia' },
        { nombre: '8 de Octubre y Propios', lat: -34.869, lng: -56.147, tipo: 'intermedia' },
        { nombre: '8 de Octubre y L.A. de Herrera', lat: -34.879, lng: -56.155, tipo: 'intermedia' },
        { nombre: 'Tres Cruces (nivel -2)', lat: -34.896, lng: -56.166, tipo: 'intercambiador' },
        { nombre: 'Plaza de los 33', lat: -34.904, lng: -56.183, tipo: 'intermedia' },
        { nombre: 'Plaza Fabini', lat: -34.905, lng: -56.195, tipo: 'intermedia' },
        { nombre: 'Plaza Independencia', lat: -34.906, lng: -56.199, tipo: 'terminal' }
      ]),
      lineas_ucot_afectadas: JSON.stringify([
        { linea: '316', nombre: 'Cno. Maldonado Km16 - Pocitos', overlap: 'TOTAL', km: 18, estrategia: 'Alimentadora norte ↔ nodo Belloni' },
        { linea: '300', nombre: 'Instrucciones - Plaza Zitarrosa', overlap: 'PARCIAL', km: 9, estrategia: 'Alimentadora Instrucciones → Tres Cruces' },
        { linea: '306', nombre: 'Parque Roosevelt - Casabó', overlap: 'PARCIAL', km: 7, estrategia: 'Redistribución a corredor oeste' },
        { linea: '328', nombre: 'Mendoza - Punta Carretas', overlap: 'PARCIAL', km: 6, estrategia: 'Desvío por 18 de Julio → concentrar en Pocitos' },
        { linea: '329', nombre: 'Punta Carretas - Melilla', overlap: 'PARCIAL', km: 8, estrategia: 'Alimentadora este ↔ nodo 8 Oct/Italia' },
        { linea: '330', nombre: 'Instrucciones - Ciudadela', overlap: 'PARCIAL', km: 5, estrategia: 'Refuerzo zona Ciudadela post-nodo' },
      ])
    },
    {
      id: 'B',
      linea_ref: '329',
      nombre: 'Línea B — Giannattasio / Av. Italia',
      subtitulo: 'El Pinar → Av. Giannattasio → Av. Italia → Tres Cruces → 18 de Julio → Pza. Independencia',
      color: '#3b82f6',
      color_bg: 'bg-blue-500',
      color_text: 'text-blue-400',
      color_border: 'border-blue-700/40',
      km_troncal: 34,
      tiempo_actual_min: 82,
      tiempo_brt_min: 48,
      pasajeros_dia_direccion: 38000,
      niveles: JSON.stringify([-1]),
      paradas: JSON.stringify([
        { nombre: 'El Pinar', lat: -34.796964, lng: -55.911598, tipo: 'terminal' },
        { nombre: 'Solymar', lat: -34.815, lng: -55.94, tipo: 'intermedia' },
        { nombre: 'Puente Carrasco', lat: -34.874, lng: -56.035, tipo: 'nodo' },
        { nombre: 'Av. Italia y Bolivia', lat: -34.88, lng: -56.059, tipo: 'intermedia' },
        { nombre: 'Av. Italia y Comercio', lat: -34.887, lng: -56.117, tipo: 'intermedia' },
        { nombre: 'Av. Italia y Propios', lat: -34.889, lng: -56.133, tipo: 'intermedia' },
        { nombre: 'Av. Italia y L.A. de Herrera', lat: -34.892, lng: -56.148, tipo: 'intermedia' },
        { nombre: 'Tres Cruces (nivel -1)', lat: -34.896, lng: -56.166, tipo: 'intercambiador' },
        { nombre: 'Plaza de los 33', lat: -34.904, lng: -56.183, tipo: 'intermedia' },
        { nombre: 'Plaza Fabini', lat: -34.905, lng: -56.195, tipo: 'intermedia' },
        { nombre: 'Plaza Independencia', lat: -34.906, lng: -56.199, tipo: 'terminal' }
      ]),
      lineas_ucot_afectadas: JSON.stringify([
        { linea: '221', nombre: 'Línea 221 (Metropolitana)', overlap: 'TOTAL', km: 28, estrategia: 'Redirigir como alimentadora costera → nodo Giannattasio' },
        { linea: '329', nombre: 'Punta Carretas - Melilla', overlap: 'PARCIAL', km: 12, estrategia: 'Alimentadora barrios norte Av. Italia' },
        { linea: '316', nombre: 'Cno. Maldonado Km16 - Pocitos', overlap: 'PARCIAL', km: 6, estrategia: 'Refuerzo tramo compartido' },
      ])
    }
  ]);

  // Seeds for brt_alimentadoras
  await knex("brt_alimentadoras").insert([
    {
      id: 'AL-A1',
      nombre: 'Alimentadora Norte Cerro / La Teja',
      descripcion: 'Conecta Cerro y La Teja directamente al nodo Tres Cruces (sin pasar por 18 de Julio)',
      recorrido: 'Cerro Comercial → Av. Lezica → La Teja → Instrucciones → Tres Cruces',
      km_estimado: 14,
      frecuencia_min: 8,
      corredor_alimenta: 'A',
      pasajeros_est_dia: 3200,
      conductores_necesarios: 6,
      coches_necesarios: 4,
      viabilidad: 'ALTA',
      ingreso_est_dia: 420 * 14 * (24 / 8 * 2),
      linea_existente_migracion: '306',
    },
    {
      id: 'AL-A2',
      nombre: 'Alimentadora Zonamérica Express',
      descripcion: 'Servicio express a la zona franca y parques industriales, conectando con Línea A en nodo Belloni',
      recorrido: 'Zonamérica → Parque Tecnológico → Camino Maldonado → nodo Belloni',
      km_estimado: 9,
      frecuencia_min: 12,
      corredor_alimenta: 'A',
      pasajeros_est_dia: 1800,
      conductores_necesarios: 4,
      coches_necesarios: 3,
      viabilidad: 'ALTA',
      ingreso_est_dia: 420 * 9 * (24 / 12 * 2),
      linea_existente_migracion: '316',
    },
    {
      id: 'AL-B1',
      nombre: 'Alimentadora Costa Este',
      descripcion: 'Redistribuye tráfico costero (Shangrilá → La Floresta) hacia el corredor Giannattasio',
      recorrido: 'La Floresta → Atlántida → Shangrilá → nodo Giannattasio km 22',
      km_estimado: 22,
      frecuencia_min: 15,
      corredor_alimenta: 'B',
      pasajeros_est_dia: 2600,
      conductores_necesarios: 5,
      coches_necesarios: 4,
      viabilidad: 'MEDIA',
      ingreso_est_dia: 420 * 22 * (24 / 15 * 2),
      linea_existente_migracion: '221',
    },
    {
      id: 'AL-B2',
      nombre: 'Alimentadora Barros Blancos / Pando',
      descripcion: 'Zona de crecimiento urbano con poca cobertura actual — conecta al corredor Italia en Giannattasio',
      recorrido: 'Pando → Barros Blancos → Camino Maldonado → nodo Italia/Giannat.',
      km_estimado: 16,
      frecuencia_min: 10,
      corredor_alimenta: 'B',
      pasajeros_est_dia: 2100,
      conductores_necesarios: 5,
      coches_necesarios: 3,
      viabilidad: 'MEDIA',
      ingreso_est_dia: 420 * 16 * (24 / 10 * 2),
      linea_existente_migracion: null,
    },
    {
      id: 'AL-X1',
      nombre: 'Interconector Tres Cruces ↔ Buceo/Pocitos',
      descripcion: 'Circuito corto de alta frecuencia entre el intercambiador y las zonas de alta demanda costera',
      recorrido: 'Tres Cruces → Bvar. España → Pocitos → Buceo → Tres Cruces',
      km_estimado: 8,
      frecuencia_min: 5,
      corredor_alimenta: 'A+B',
      pasajeros_est_dia: 5400,
      conductores_necesarios: 8,
      coches_necesarios: 6,
      viabilidad: 'MUY ALTA',
      ingreso_est_dia: 420 * 8 * (24 / 5 * 2),
      linea_existente_migracion: '328',
    }
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("brt_alimentadoras");
  await knex.schema.dropTableIfExists("brt_corredores");
}
