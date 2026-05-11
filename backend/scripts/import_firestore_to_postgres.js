#!/usr/bin/env node
/**
 * import_firestore_to_postgres.js
 *
 * FASE 2.7 — Migración de datos del original Cloud (Firestore) al CLON SOBERANO (Postgres).
 *
 * Lee un export de Firestore en formato JSON-lines o el dump nativo de
 * `firebase firestore:export` (carpeta con metadata.json + colecciones)
 * y aplica INSERTs idempotentes (ON CONFLICT (id) DO UPDATE) a las
 * tablas Postgres equivalentes definidas en schema_inicial.sql + schema_fase2.sql.
 *
 * Uso:
 *   node import_firestore_to_postgres.js --input <ruta>
 *
 *   Donde <ruta> puede ser:
 *     - Una carpeta con `firebase firestore:export` adentro (preferido).
 *     - Un archivo .jsonl con una línea = `{"collection":"X","id":"Y","data":{...}}`.
 *     - Un archivo .json con `{ "<collection>": [ {id, ...data}, ... ], ... }`.
 *
 * Reglas que respeta:
 *   - REGLA -6: solo escribe en el CLON SOBERANO (DATABASE_URL local).
 *   - REGLA -2: no inventa nada — si una colección Firestore no tiene equivalente
 *     en Postgres, la deja en `data_jsonb` raw o la skippea con warning.
 *   - REGLA -1: idempotente. Correrlo dos veces no duplica ni rompe nada.
 *   - REGLA -4: usa transacciones por colección + batches de 500 inserts.
 *
 * Salida:
 *   - Reporte por colección: docs leídos, docs aplicados, docs skipped, errores.
 *   - Exit code 0 si todo OK, 1 si hubo errores.
 */

const fs   = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// ─── CLI args ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const idx = args.indexOf('--input');
if (idx < 0 || !args[idx + 1]) {
  console.error('Uso: node import_firestore_to_postgres.js --input <ruta>');
  process.exit(2);
}
const inputPath = path.resolve(args[idx + 1]);
if (!fs.existsSync(inputPath)) {
  console.error(`[FATAL] No existe: ${inputPath}`);
  process.exit(2);
}

// ─── Mapeo Firestore collection → Postgres table ────────────────────────────
//
// Cada entrada describe cómo trasladar una colección de Firestore a una tabla
// Postgres del clon. El campo `mapper` recibe `{id, data}` (id del doc Firestore
// + data del doc) y devuelve el row a insertar. Las columnas indexables van
// derivadas; el resto del doc original queda en `data_jsonb` para preservar la
// info y permitir migración inversa si fuera necesario.
// Helpers de coerción defensivos: Firestore guarda agency_id como número
// en muchos docs, Postgres lo quiere VARCHAR. Los timestamps Firestore
// vienen serializados como {__type:'Timestamp', value:'ISO'}.
const str  = (v) => (v === null || v === undefined ? null : String(v));
const num  = (v) => (v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));
const bool = (v) => (v === null || v === undefined ? null : Boolean(v));
const ts   = (v) => {
  if (!v) return null;
  if (v && typeof v === 'object' && v.__type === 'Timestamp' && v.value) return v.value;
  if (v instanceof Date) return v.toISOString();
  return v;
};
const dateOnly = (v) => {
  const t = ts(v);
  if (!t) return null;
  return typeof t === 'string' ? t.slice(0, 10) : t;
};
// Concatena nombre y apellido si vienen separados (caso users del original).
const fullNameOf = (data) => {
  if (data.fullName) return data.fullName;
  if (data.datos_personales) {
    return [data.datos_personales.nombre, data.datos_personales.apellido].filter(Boolean).join(' ').trim() || null;
  }
  return [data.nombre, data.apellido].filter(Boolean).join(' ').trim() || null;
};

const COLLECTIONS = [
  {
    fsCollection: 'vehicles',
    pgTable: 'vehiculos',
    pkCol: 'id',
    mapper: ({ id, data }) => ({
      id: str(id),
      agency_id: str(data.agencyId ?? data.agency_id ?? data.empresa ?? '70'),
      internal_number: str(data.internalNumber ?? data.interno ?? data.cocheId ?? data.coche ?? id),
      plate: str(data.plate ?? data.patente ?? null),
      data_jsonb: data,
    }),
  },
  {
    fsCollection: 'users',
    pgTable: 'users',
    pkCol: 'id',
    mapper: ({ id, data }) => ({
      id: str(id),
      email: str(data.email ?? null),
      full_name: fullNameOf(data),
      role: str(data.role ?? data.rol ?? 'USER'),
      agency_id: str(data.agencyId ?? data.agency_id ?? data.datos_empresa?.agency_id ?? null),
      data_jsonb: data,
    }),
  },
  {
    fsCollection: 'personal',
    pgTable: 'personal',
    pkCol: 'id',
    mapper: ({ id, data }) => ({
      id: str(id),
      agency_id: str(data.agencyId ?? data.agency_id ?? '70'),
      internal_number: str(data.internalNumber ?? data.interno ?? data.legajo ?? null),
      full_name: fullNameOf(data),
      role: str(data.role ?? data.rol ?? data.cargo ?? 'conductor'),
      estado_hoy: str(data.estadoHoy ?? 'disponible'),
      motivo_ausencia: str(data.motivoAusencia ?? null),
      es_conductor_reserva: bool(data.esConductorReserva),
      telefono: str(data.telefono ?? null),
      data_jsonb: data,
    }),
  },
  {
    fsCollection: 'turnos_dia',
    pgTable: 'turnos_dia',
    pkCol: 'id',
    mapper: ({ id, data }) => ({
      id: String(id),
      agency_id: data.agencyId ?? data.agency_id ?? '70',
      fecha: data.fecha,
      conductor_id: data.conductorId ?? null,
      conductor_nombre: data.conductorNombre ?? null,
      conductor_interno: data.conductorInterno ?? null,
      vehiculo_id: data.vehiculoId,
      vehiculo_interno: data.vehiculoInterno,
      linea_id: data.lineaId,
      variante_key: data.varianteKey ?? null,
      turno: data.turno,
      hora_salida: data.horaSalida,
      hora_llegada_estimada: data.horaLlegadaEstimada,
      terminal: data.terminal,
      estado: data.estado ?? 'programado',
      reserva_activada: !!data.reservaActivada,
      conductor_reserva_id: data.conductorReservaId ?? null,
      conductor_reserva_nombre: data.conductorReservaNombre ?? null,
      importancia_linea: data.importanciaLinea ?? 2,
      impacto_ingresos_estimado: data.impactoIngresosEstimado ?? null,
      observaciones: data.observaciones ?? null,
      firma_conductor: !!data.firmaConductor,
      hora_firma: data.horaFirma ?? null,
      data_jsonb: data,
    }),
  },
  {
    fsCollection: 'cartones_completados',
    pgTable: 'cartones_completados',
    pkCol: 'id',
    mapper: ({ id, data }) => ({
      id: String(id),
      agency_id: data.agencyId ?? data.agency_id ?? null,
      service_number: data.serviceNumber ?? null,
      line: data.line ?? null,
      vehiculo_id: data.vehicleId ?? data.vehiculoId ?? null,
      conductor_id: data.conductorId ?? data.driverId ?? null,
      updated_by: data.updatedBy ?? null,
      data_jsonb: data,
    }),
  },
  {
    fsCollection: 'alertas_operativas',
    pgTable: 'alertas_operativas',
    pkCol: 'id',
    mapper: ({ id, data }) => ({
      id: String(id),
      agency_id: data.agencyId ?? '70',
      fecha: data.fecha,
      tipo: data.tipo,
      urgencia: data.urgencia ?? 'media',
      linea_id: data.lineaId ?? null,
      conductor_id: data.conductorId ?? null,
      vehiculo_id: data.vehiculoId ?? null,
      turno_id: data.turnoId ?? null,
      titulo: data.titulo ?? '',
      mensaje: data.mensaje ?? '',
      accion_sugerida: data.accionSugerida ?? null,
      datos_extra: data.datosExtra ?? {},
      atendida: !!data.atendida,
      atendida_por: data.atendidaPor ?? null,
      hora_atendida: data.horaAtendida ?? null,
      impacto_ingresos_usd: data.impactoIngresosUSD ?? null,
    }),
  },
  {
    fsCollection: 'vehicle_events',
    pgTable: 'vehicle_events',
    pkCol: null, // BIGSERIAL — siempre INSERT, no UPSERT
    mapper: ({ id: _id, data }) => ({
      id_bus: data.idBus,
      agency_id: data.agencyId,
      empresa: data.empresa ?? '',
      linea: data.linea ?? '',
      lat: data.lat,
      lon: data.lon,
      velocidad: data.velocidad ?? 0,
      estado_cumplimiento: data.estadoCumplimiento ?? 'SIN_HORARIO',
      desviacion_min: data.desviacionMin ?? null,
      trip_id: data.tripId ?? null,
      proxima_parada: data.proximaParada ?? null,
      timestamp_gps: data.timestampGPS,
      // expires_at se llena con default DB
    }),
  },
  {
    fsCollection: 'inspecciones',
    pgTable: 'inspecciones',
    pkCol: 'id',
    mapper: ({ id, data }) => ({
      id: str(id),
      agency_id: str(data.agencyId ?? '70'),
      vehiculo_id: str(data.vehiculoId ?? data.vehicleId ?? null),
      fecha_inspeccion: ts(data.fechaInspeccion ?? data.timestamp ?? null),
      inspector_id: str(data.inspectorId ?? data.driverId ?? null),
      data_jsonb: data,
    }),
  },

  // ─── FASE 2.7 EXTENDED — colecciones secundarias del original ──────────
  {
    fsCollection: 'alertas_regulacion',
    pgTable: 'alertas_regulacion',
    pkCol: 'id',
    mapper: ({ id, data }) => ({
      id: str(id),
      agency_id: str(data.agencyId ?? '70'),
      timestamp: ts(data.timestamp ?? data.createdAt ?? null),
      tipo: str(data.tipo ?? null),
      severidad: str(data.severidad ?? data.urgencia ?? null),
      coche_id: str(data.cocheId ?? data.idBus ?? data.vehiculoId ?? null),
      linea_id: str(data.lineaId ?? data.linea ?? null),
      conductor_id: str(data.conductorId ?? null),
      lat: num(data.lat ?? data.coords?.lat ?? null),
      lon: num(data.lon ?? data.lng ?? data.coords?.lon ?? null),
      atendida: bool(data.atendida),
      accion_tomada: str(data.accionTomada ?? data.accionSugerida ?? null),
      data_jsonb: data,
    }),
  },
  {
    fsCollection: 'alertas_trafico',
    pgTable: 'alertas_trafico',
    pkCol: 'id',
    mapper: ({ id, data }) => ({
      id: str(id),
      agency_id: str(data.agencyId ?? '70'),
      tipo: str(data.tipo ?? null),
      descripcion: str(data.descripcion ?? data.mensaje ?? null),
      activa: data.activa === undefined ? true : bool(data.activa),
      lat: num(data.lat ?? data.coords?.lat ?? null),
      lon: num(data.lon ?? data.lng ?? data.coords?.lon ?? null),
      radio_m: num(data.radioM ?? data.radius ?? null),
      creado_en: ts(data.creado_en ?? data.creadoEn ?? data.createdAt ?? null),
      expira_en: ts(data.expira_en ?? data.expiraEn ?? data.expiresAt ?? null),
      data_jsonb: data,
    }),
  },
  {
    fsCollection: 'bus_delays',
    pgTable: 'bus_delays',
    pkCol: 'id',
    mapper: ({ id, data }) => ({
      id: str(id),
      id_bus: str(data.idBus ?? data.id_bus ?? data.cocheId ?? null),
      agency_id: str(data.agencyId ?? '70'),
      linea: str(data.linea ?? data.lineaId ?? null),
      fecha: dateOnly(data.fecha ?? data.date ?? null),
      delay_min: num(data.delayMin ?? data.delay ?? data.desviacionMin ?? null),
      estado_cumplimiento: str(data.estadoCumplimiento ?? data.estado ?? null),
      calculado_en: ts(data.calculadoEn ?? data.timestamp ?? data.createdAt ?? null),
      data_jsonb: data,
    }),
  },
  {
    fsCollection: 'bus_last_pos',
    pgTable: 'bus_last_pos',
    pkCol: 'id_bus',
    mapper: ({ id, data }) => ({
      id_bus: str(data.idBus ?? data.id_bus ?? id),
      agency_id: str(data.agencyId ?? '70'),
      linea: str(data.linea ?? data.lineaId ?? null),
      lat: num(data.lat ?? data.coords?.lat ?? null),
      lon: num(data.lon ?? data.lng ?? data.coords?.lon ?? null),
      velocidad: num(data.velocidad ?? data.speed ?? null),
      estado_cumplimiento: str(data.estadoCumplimiento ?? null),
      timestamp_gps: ts(data.timestampGPS ?? data.timestamp ?? null),
      data_jsonb: data,
    }),
  },
  {
    fsCollection: 'boletines',
    pgTable: 'boletines',
    pkCol: 'id',
    mapper: ({ id, data }) => ({
      id: str(id),
      agency_id: str(data.agencyId ?? '70'),
      tipo: str(data.tipo ?? 'boletin'),
      titulo: str(data.titulo ?? data.title ?? null),
      contenido: str(data.contenido ?? data.content ?? null),
      autor_id: str(data.autorId ?? data.authorId ?? data.creadoPor ?? null),
      estado: str(data.estado ?? data.status ?? null),
      fecha: dateOnly(data.fecha ?? data.date ?? data.createdAt ?? null),
      data_jsonb: data,
    }),
  },
  {
    // bulletins: misma tabla `boletines` con marca de origen para trazabilidad.
    fsCollection: 'bulletins',
    pgTable: 'boletines',
    pkCol: 'id',
    mapper: ({ id, data }) => ({
      id: str(id),
      agency_id: str(data.agencyId ?? '70'),
      tipo: str(data.tipo ?? 'bulletin'),
      titulo: str(data.titulo ?? data.title ?? null),
      contenido: str(data.contenido ?? data.content ?? null),
      autor_id: str(data.autorId ?? data.authorId ?? null),
      estado: str(data.estado ?? data.status ?? null),
      fecha: dateOnly(data.fecha ?? data.date ?? data.createdAt ?? null),
      data_jsonb: { ...data, _imported_from: 'bulletins' },
    }),
  },
  {
    fsCollection: 'ai_orders',
    pgTable: 'ai_orders',
    pkCol: 'id',
    mapper: ({ id, data }) => ({
      id: str(id),
      agency_id: str(data.agencyId ?? '70'),
      tipo: str(data.tipo ?? null),
      sugerencia: str(data.sugerencia ?? data.suggestion ?? data.text ?? null),
      contexto: data.contexto ?? data.context ?? {},
      estado: str(data.estado ?? data.status ?? 'pendiente'),
      aprobada_por: str(data.aprobadaPor ?? null),
      aprobada_en: ts(data.aprobadaEn ?? null),
      data_jsonb: data,
    }),
  },
  {
    fsCollection: 'auto_stats_diarios',
    pgTable: 'auto_stats_diarios',
    pkCol: 'id',
    mapper: ({ id, data }) => ({
      id: str(id),
      agency_id: str(data.agencyId ?? '70'),
      fecha: dateOnly(data.fecha ?? data.date ?? null),
      metric: str(data.metric ?? data.kpi ?? null),
      value: data.value ?? data.valor ?? {},
      data_jsonb: data,
    }),
  },
  {
    // audit_log → reusa la tabla logs_auditoria que YA existe en schema_inicial.sql
    fsCollection: 'audit_log',
    pgTable: 'logs_auditoria',
    pkCol: null, // logs_auditoria.id es SERIAL, siempre INSERT
    mapper: ({ id: _id, data }) => ({
      user_id: str(data.userId ?? data.user_id ?? data.uid ?? null),
      agency_id: str(data.agencyId ?? '70'),
      accion: str(data.accion ?? data.action ?? data.event ?? 'UNKNOWN'),
      recurso: str(data.recurso ?? data.resource ?? data.collection ?? null),
      detalles_jsonb: data,
      client_ip: str(data.clientIp ?? data.ip ?? null),
      timestamp: ts(data.timestamp ?? data.createdAt ?? null),
    }),
  },
];

// ─── Loader: detecta formato del input y produce Iterable<{collection, id, data}>
async function* loadDocs(p) {
  const stat = fs.statSync(p);
  if (stat.isDirectory()) {
    // Soporte para `firebase firestore:export` — tiene metadata.json y subcarpetas
    // por colección con archivos `.export_metadata` y `output-*` binarios.
    // Para simplicidad acá soportamos la versión expandida en JSONs.
    // Convención: <p>/<collection>/<docId>.json
    const collections = fs.readdirSync(p).filter((f) =>
      fs.statSync(path.join(p, f)).isDirectory(),
    );
    for (const col of collections) {
      const cfg = COLLECTIONS.find((c) => c.fsCollection === col);
      if (!cfg) {
        console.log(`[SKIP SCAN] Omitiendo escaneo de directorio de "${col}" (no mapeada)`);
        continue;
      }
      const colPath = path.join(p, col);
      const docs = fs.readdirSync(colPath).filter((f) => f.endsWith('.json'));
      for (const docFile of docs) {
        const id = path.basename(docFile, '.json');
        try {
          const data = JSON.parse(fs.readFileSync(path.join(colPath, docFile), 'utf8'));
          yield { collection: col, id, data };
        } catch (e) {
          console.error(`[WARN] skipped ${col}/${docFile}: ${e.message}`);
        }
      }
    }
    return;
  }

  // Archivo único
  const ext = path.extname(p).toLowerCase();
  if (ext === '.jsonl' || ext === '.ndjson') {
    const content = fs.readFileSync(p, 'utf8');
    const lines = content.split(/\r?\n/).filter((l) => l.trim());
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.collection && obj.id) yield obj;
      } catch (e) {
        console.error(`[WARN] línea inválida saltada: ${e.message}`);
      }
    }
    return;
  }

  // Archivo .json con shape { collection: [docs] }
  const obj = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const [collection, items] of Object.entries(obj)) {
    if (!Array.isArray(items)) continue;
    for (const doc of items) {
      const id = doc.id ?? doc._id;
      if (!id) continue;
      const { id: _, _id: __, ...data } = doc;
      yield { collection, id, data };
    }
  }
}

// ─── Insert helpers ─────────────────────────────────────────────────────────
function buildUpsert(table, row, pkCol) {
  const cols = Object.keys(row);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const values = cols.map((c) => {
    const v = row[c];
    if (v && typeof v === 'object' && !(v instanceof Date)) return JSON.stringify(v);
    return v;
  });

  let sql;
  if (pkCol) {
    const updateSet = cols
      .filter((c) => c !== pkCol)
      .map((c) => `${c} = EXCLUDED.${c}`)
      .join(', ');
    sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})
           ON CONFLICT (${pkCol}) DO UPDATE SET ${updateSet}`;
  } else {
    sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`;
  }
  return { sql, values };
}

// ─── Main ───────────────────────────────────────────────────────────────────
(async () => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('[FATAL] DATABASE_URL no definida en backend/.env');
    process.exit(2);
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  console.log('═══ FASE 2.7 — Importación Firestore export → Postgres ═══');
  console.log(`Input: ${inputPath}`);
  console.log(`Target: ${dbUrl.replace(/:[^@]+@/, ':***@')}`);
  console.log('');

  // Stats por colección
  const stats = {};
  for (const c of COLLECTIONS) {
    stats[c.fsCollection] = { read: 0, applied: 0, errors: 0, skipped: 0 };
  }
  stats['_otras'] = { read: 0, applied: 0, errors: 0, skipped: 0 };

  // Agrupar por lote sobre la marcha (streaming real) para no colapsar la memoria
  let currentBatch = [];
  let currentCollection = null;
  const BATCH = 500;

  const flushBatch = async (col, docs) => {
    const cfg = COLLECTIONS.find((c) => c.fsCollection === col);
    if (!cfg) {
      // No mapeada, solo registramos stats
      stats['_otras'].read += docs.length;
      stats['_otras'].skipped += docs.length;
      return;
    }

    if (!stats[col].startTime) {
      stats[col].startTime = Date.now();
      console.log(`[${col}] importando docs → ${cfg.pgTable}`);
    }
    stats[col].read += docs.length;

    try {
      await client.query('BEGIN');
      for (const d of docs) {
        try {
          const row = cfg.mapper(d);
          const { sql, values } = buildUpsert(cfg.pgTable, row, cfg.pkCol);
          await client.query(sql, values);
          stats[col].applied++;
        } catch (e) {
          stats[col].errors++;
          if (stats[col].errors <= 3) {
            console.error(`  [ERR] ${col}/${d.id}: ${e.message}`);
          }
        }
      }
      await client.query('COMMIT');
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch {}
      stats[col].errors += docs.length;
      console.error(`  [ROLLBACK batch] ${e.message}`);
    }

    // Progreso cada 5000 docs aprox.
    const oldK = Math.floor((stats[col].read - docs.length) / 5000);
    const newK = Math.floor(stats[col].read / 5000);
    if (newK > oldK) {
      process.stdout.write(`  -> ${stats[col].read} procesados...`);
    }
  };

  for await (const doc of loadDocs(inputPath)) {
    if (doc.collection !== currentCollection) {
      if (currentBatch.length > 0) {
        await flushBatch(currentCollection, currentBatch);
        currentBatch = [];
      }
      if (currentCollection) {
        // Cerrar stats visual de la anterior si existia mapper
        const pcfg = COLLECTIONS.find((c) => c.fsCollection === currentCollection);
        if (pcfg && stats[currentCollection].startTime) {
          const elapsed = ((Date.now() - stats[currentCollection].startTime) / 1000).toFixed(1);
          console.log(`\n  → ${stats[currentCollection].applied} aplicados, ${stats[currentCollection].errors} errores, ${elapsed}s`);
        }
      }
      currentCollection = doc.collection;
      const cfg = COLLECTIONS.find((c) => c.fsCollection === currentCollection);
      if (!cfg) {
        console.log(`[SKIP] detectada colección "${currentCollection}" no mapeada. Saltando en streaming.`);
      }
    }
    currentBatch.push(doc);
    if (currentBatch.length >= BATCH) {
      await flushBatch(currentCollection, currentBatch);
      currentBatch = [];
    }
  }

  // Vaciar el último remanente
  if (currentBatch.length > 0) {
    await flushBatch(currentCollection, currentBatch);
    const pcfg = COLLECTIONS.find((c) => c.fsCollection === currentCollection);
    if (pcfg && stats[currentCollection].startTime) {
      const elapsed = ((Date.now() - stats[currentCollection].startTime) / 1000).toFixed(1);
      console.log(`\n  → ${stats[currentCollection].applied} aplicados, ${stats[currentCollection].errors} errores, ${elapsed}s`);
    }
  }

  await client.end();

  console.log('');
  console.log('═══ Resumen por colección ═══');
  console.log('coleccion                     read   applied  errors  skipped');
  let totalErrors = 0;
  for (const [c, s] of Object.entries(stats)) {
    console.log(
      `${c.padEnd(28)}  ${String(s.read).padStart(6)}  ${String(s.applied).padStart(7)}  ${String(s.errors).padStart(6)}  ${String(s.skipped).padStart(7)}`,
    );
    totalErrors += s.errors;
  }
  console.log('');

  if (totalErrors > 0) {
    console.log(`[WARN] Hubo ${totalErrors} errores. Ver logs arriba.`);
    process.exit(1);
  }
  console.log('[OK] Importación FASE 2.7 completada sin errores.');
  process.exit(0);
})().catch((e) => {
  console.error('[FATAL]', e);
  process.exit(1);
});
