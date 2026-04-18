/**
 * refreshCompetidores.ts — Mantiene `competidores` fresco automáticamente
 * ====================================================================
 * Cada 10 minutos, consulta el endpoint público GPS de IMM y materializa
 * la colección `competidores` con identidad + estado operativo en vivo
 * de COETC, COME, CUTCSA (excluye UCOT).
 *
 * Distinción importante vs `ingestaIMMTick`:
 *   - ingestaIMMTick (cada 60s): escribe pings GPS por bus en
 *     `competencia_monitoreo/{lineaId}/pings` y `viajes_activos`.
 *   - refreshCompetidoresTick (cada 10min): mantiene la entidad-nivel
 *     `competidores/{emp-XX}` con sus líneas observadas y buses activos.
 *     Esta colección es la que consume `competitionService` para análisis.
 *
 * El refresh "completo" de horarios reales (scrape JSF) es operación
 * pesada (~minutos por empresa) y se dispara manual vía
 * POST /api/competition/enrich-horarios/:competidorId.
 */

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import axios from 'axios';

const db = admin.firestore();

const STM_ONLINE_URL = 'https://www.montevideo.gub.uy/buses/rest/stm-online';
const COMPETIDORES_COLLECTION = 'competidores';
const SNAPSHOT_COLLECTION = 'stm_snapshots';

const EMPRESA_NAMES: Record<number, string> = {
  10: 'COETC',
  20: 'COME',
  50: 'CUTCSA',
  70: 'UCOT',
};

const UCOT_CODE = 70;

interface BusFeature {
  type: 'Feature';
  properties: {
    codigoEmpresa: number;
    codigoBus: number;
    linea: string;
    sublinea?: string;
    variante?: number;
    tipoLineaDesc?: string;
    destinoDesc?: string;
    velocidad?: number;
  };
  geometry: { type: 'Point'; coordinates: [number, number] };
}

interface BusFeatureCollection {
  type: 'FeatureCollection';
  features: BusFeature[];
}

interface LineaLive {
  numero: string;
  sublineas: Set<string>;
  destinos: Set<string>;
  variantes: Set<number>;
  tipoLineaDesc?: string;
  busesActivos: number;
}

interface EmpresaLive {
  codigo: number;
  nombre: string;
  totalBuses: number;
  lineas: Map<string, LineaLive>;
}

async function fetchSnapshot(): Promise<BusFeatureCollection> {
  const res = await axios.post<BusFeatureCollection>(
    STM_ONLINE_URL,
    { empresa: '-1' },
    {
      timeout: 15000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
        'Content-Type': 'application/json',
        Referer: 'https://www.montevideo.gub.uy/buses/',
        Origin: 'https://www.montevideo.gub.uy',
      },
    }
  );
  return res.data;
}

function agruparPorEmpresa(coll: BusFeatureCollection): Map<number, EmpresaLive> {
  const map = new Map<number, EmpresaLive>();
  for (const f of coll.features ?? []) {
    const p = f.properties;
    if (!p?.codigoEmpresa || !p?.linea) continue;

    let emp = map.get(p.codigoEmpresa);
    if (!emp) {
      emp = {
        codigo: p.codigoEmpresa,
        nombre: EMPRESA_NAMES[p.codigoEmpresa] || `Empresa ${p.codigoEmpresa}`,
        totalBuses: 0,
        lineas: new Map(),
      };
      map.set(p.codigoEmpresa, emp);
    }
    emp.totalBuses += 1;

    let linea = emp.lineas.get(p.linea);
    if (!linea) {
      linea = {
        numero: p.linea,
        sublineas: new Set(),
        destinos: new Set(),
        variantes: new Set(),
        tipoLineaDesc: p.tipoLineaDesc,
        busesActivos: 0,
      };
      emp.lineas.set(p.linea, linea);
    }
    linea.busesActivos += 1;
    if (p.sublinea) linea.sublineas.add(p.sublinea);
    if (p.destinoDesc) linea.destinos.add(p.destinoDesc);
    if (typeof p.variante === 'number') linea.variantes.add(p.variante);
  }
  return map;
}

async function refresh(): Promise<{ totalBuses: number; competidores: number; durationMs: number }> {
  const started = Date.now();
  const ahora = admin.firestore.FieldValue.serverTimestamp();
  const snapshot = await fetchSnapshot();
  const totalBuses = snapshot.features?.length ?? 0;
  const grouped = agruparPorEmpresa(snapshot);

  const batch = db.batch();
  let competidoresWritten = 0;
  const procesadas: Array<{ codigo: number; nombre: string; buses: number; lineas: number; omitida: boolean }> = [];

  for (const [codigo, emp] of grouped.entries()) {
    const omitida = codigo === UCOT_CODE;
    procesadas.push({
      codigo,
      nombre: emp.nombre,
      buses: emp.totalBuses,
      lineas: emp.lineas.size,
      omitida,
    });
    if (omitida) continue;

    const lineas = Array.from(emp.lineas.values()).map((l) => ({
      id: `${codigo}-${l.numero}`,
      numeroLinea: parseInt(l.numero, 10) || 0,
      numeroLineaTexto: l.numero,
      operador: emp.nombre,
      recorrido: [],
      horarios: [],
      frecuencia: 0,
      historico: [],
      activa: l.busesActivos > 0,
      sublineas: Array.from(l.sublineas),
      destinos: Array.from(l.destinos),
      variantes: Array.from(l.variantes),
      tipoLineaDesc: l.tipoLineaDesc ?? null,
      busesActivosUltimoSnapshot: l.busesActivos,
    }));

    const ref = db.collection(COMPETIDORES_COLLECTION).doc(`emp-${codigo}`);
    batch.set(
      ref,
      {
        id: `emp-${codigo}`,
        nombre: emp.nombre,
        lineas,
        ultimaActualizacion: ahora,
      },
      { merge: true }
    );
    competidoresWritten++;
  }

  // Audit
  const snapRef = db.collection(SNAPSHOT_COLLECTION).doc();
  batch.set(snapRef, {
    timestamp: ahora,
    totalBuses,
    porEmpresa: procesadas,
    fuente: 'POST /buses/rest/stm-online (refreshCompetidores cron)',
  });

  await batch.commit();
  const durationMs = Date.now() - started;
  console.log(
    `[refreshCompetidores] OK ${totalBuses} buses, ${competidoresWritten} competidores, ${durationMs}ms`
  );
  return { totalBuses, competidores: competidoresWritten, durationMs };
}

/**
 * Cron: cada 10 minutos.
 * Mantiene `competidores` con identidad y estado operativo fresco.
 */
export const refreshCompetidoresTick = functions.pubsub
  .schedule('every 10 minutes')
  .timeZone('America/Montevideo')
  .onRun(async () => {
    try {
      await refresh();
    } catch (err: any) {
      console.error('[refreshCompetidores] Error:', err?.message || err);
    }
    return null;
  });

/**
 * HTTP: trigger manual (debug/test).
 */
export const refreshCompetidoresNow = functions.https.onRequest(async (_req, res) => {
  try {
    const result = await refresh();
    res.json({ ok: true, ...result });
  } catch (err: any) {
    console.error('[refreshCompetidoresNow] Error:', err?.message || err);
    res.status(502).json({ ok: false, error: err?.message || String(err) });
  }
});
