#!/usr/bin/env node
/**
 * ingest_stm_validaciones.mjs — Ingesta agregada de validaciones STM al clon.
 *
 * FASE 5.15 (2026-05-14) v2: la versión 1 acumulaba en Node y explotaba a
 * 9M filas (heap >2GB). Ahora delegamos en Postgres:
 *   1) COPY FROM stdin → tabla temporal `stm_raw_temp` (sin índices)
 *   2) INSERT INTO stm_validaciones_mensual ... SELECT ... GROUP BY ...
 *   3) DROP tabla temp
 *
 * Postgres hace el GROUP BY en disco con work_mem aumentado y termina en
 * <1 min por mes (25M filas).
 *
 * Idempotente: si el archivo ya está en stm_validaciones_ingestados se saltea.
 */
import { spawn } from 'child_process';
import readline from 'readline';
import path from 'path';
import fs from 'fs';
import knex from 'knex';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(import.meta.dirname, '..', '.env') });

const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL || {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'skillroute_master',
  },
  pool: { min: 1, max: 4 },
});

function mesDesdeNombre(nombre) {
  const m = nombre.match(/(\d{2})(\d{4})/);
  if (!m) return null;
  return `${m[2]}-${m[1]}-01`;
}

async function yaIngestado(archivo) {
  const row = await db('stm_validaciones_ingestados').where({ archivo }).first();
  return !!row;
}

async function ensureTempTable() {
  // Tabla cruda temporal: id_viaje no nos importa para el agregado
  await db.raw(`
    DROP TABLE IF EXISTS stm_raw_temp;
    CREATE UNLOGGED TABLE stm_raw_temp (
      mes DATE,
      cod_empresa SMALLINT,
      dsc_linea VARCHAR(20),
      codigo_parada VARCHAR(20),
      hora SMALLINT,
      dow SMALLINT,
      grupo_usuario VARCHAR(40),
      tramo_ordinal SMALLINT,
      con_tarjeta BOOLEAN
    );
    SET work_mem = '256MB';
  `);
}

async function ingestar(zipPath) {
  const archivo = path.basename(zipPath);
  const mesISO = mesDesdeNombre(archivo);
  if (!mesISO) { console.error(`[ingest] no parseo mes de ${archivo}`); return; }
  if (await yaIngestado(archivo)) { console.log(`[ingest] ${archivo} ya ingestado, saltando.`); return; }

  console.log(`\n[ingest] ${archivo} (mes ${mesISO})`);
  const bytesZip = fs.statSync(zipPath).size;
  const t0 = Date.now();

  await ensureTempTable();

  // Streaming: unzip → readline → COPY FROM stdin del pgClient
  const pgClient = await db.client.acquireConnection();
  let filasOrigen = 0;

  try {
    // Usar pg-copy-streams para hacer COPY FROM stdin
    const { from: copyFrom } = await import('pg-copy-streams');
    const copyStream = pgClient.query(copyFrom(`
      COPY stm_raw_temp (mes, cod_empresa, dsc_linea, codigo_parada, hora, dow, grupo_usuario, tramo_ordinal, con_tarjeta)
      FROM STDIN WITH (FORMAT csv, NULL '\\N')
    `));

    await new Promise((resolve, reject) => {
      const proc = spawn('unzip', ['-p', zipPath]);
      proc.on('error', reject);
      const rl = readline.createInterface({ input: proc.stdout, crlfDelay: Infinity });
      let lineNum = 0;
      let idx = {};

      rl.on('line', (line) => {
        lineNum++;
        if (lineNum === 1) {
          const cols = line.split(',');
          for (let i = 0; i < cols.length; i++) idx[cols[i].trim()] = i;
          return;
        }
        filasOrigen++;
        const f = line.split(',');
        if (f.length < 15) return;
        const fecha = f[idx['fecha_evento']];
        if (!fecha || fecha.length < 13) return;
        const hora = parseInt(fecha.slice(11, 13), 10);
        const d = new Date(fecha.slice(0, 10) + 'T00:00:00');
        if (isNaN(d.getTime()) || isNaN(hora)) return;
        const dow = d.getDay();
        const codEmpresa = f[idx['cod_empresa']];
        if (!codEmpresa || codEmpresa.trim() === '') return; // saltar filas sin operador
        const codParada = f[idx['codigo_parada_origen']];
        const grupo = (f[idx['descripcion_grupo_usuario']] || '').replace(/[,"]/g, ' ');
        const linea = (f[idx['dsc_linea']] || '').replace(/[,"]/g, ' ');
        const tramo = f[idx['ordinal_de_tramo']];
        // CSV para COPY: usar comillas para campos con espacios, \N para NULL
        const row = [
          mesISO,
          codEmpresa,
          linea || '',
          codParada || '\\N',
          String(hora),
          String(dow),
          grupo || '',
          tramo && tramo.trim() ? tramo : '0',
          f[idx['con_tarjeta']] === '1' ? 't' : 'f',
        ].join(',') + '\n';
        if (!copyStream.write(row)) {
          rl.pause();
          copyStream.once('drain', () => rl.resume());
        }
        if (filasOrigen % 2000000 === 0) {
          process.stderr.write(`  ${(filasOrigen / 1e6).toFixed(0)}M en stream\r`);
        }
      });
      rl.on('close', () => { copyStream.end(); });
      copyStream.on('finish', resolve);
      copyStream.on('error', reject);
      rl.on('error', reject);
    });

    console.log(`\n[ingest] ${filasOrigen.toLocaleString()} filas a temp en ${((Date.now() - t0) / 1000).toFixed(0)}s — agregando...`);

    // Agregado SQL: ahora Postgres hace GROUP BY eficiente
    const t1 = Date.now();
    await pgClient.query('DELETE FROM stm_validaciones_mensual WHERE mes = $1', [mesISO]);
    const result = await pgClient.query(`
      INSERT INTO stm_validaciones_mensual
        (mes, cod_empresa, dsc_linea, codigo_parada, hora, dow, grupo_usuario, tramo_ordinal, con_tarjeta, validaciones)
      SELECT mes, cod_empresa, dsc_linea, codigo_parada, hora, dow, grupo_usuario, tramo_ordinal, con_tarjeta, COUNT(*) AS validaciones
      FROM stm_raw_temp
      WHERE mes = $1
      GROUP BY mes, cod_empresa, dsc_linea, codigo_parada, hora, dow, grupo_usuario, tramo_ordinal, con_tarjeta
    `, [mesISO]);
    const filasAgregadas = result.rowCount || 0;
    console.log(`[ingest] ${filasAgregadas.toLocaleString()} filas agregadas en ${((Date.now() - t1) / 1000).toFixed(0)}s`);

    await pgClient.query(`TRUNCATE stm_raw_temp`);

    const durMs = Date.now() - t0;
    await db('stm_validaciones_ingestados').insert({
      archivo,
      mes: mesISO,
      filas_origen: filasOrigen,
      filas_agregadas: filasAgregadas,
      bytes_zip: bytesZip,
      duracion_ms: durMs,
    });
    console.log(`[ingest] ${archivo} OK en ${(durMs / 1000).toFixed(0)}s total`);
  } finally {
    db.client.releaseConnection(pgClient);
  }
}

async function main() {
  const zips = process.argv.slice(2);
  if (zips.length === 0) { console.error('Uso: node ingest_stm_validaciones.mjs <zip> [...]'); process.exit(1); }
  for (const zip of zips) {
    try { await ingestar(zip); }
    catch (e) { console.error(`[ingest] error en ${zip}:`, e.message); }
  }
  // Limpieza final
  try { await db.raw('DROP TABLE IF EXISTS stm_raw_temp'); } catch {}
  await db.destroy();
}

main().catch((e) => { console.error('ERROR fatal:', e); process.exit(1); });
