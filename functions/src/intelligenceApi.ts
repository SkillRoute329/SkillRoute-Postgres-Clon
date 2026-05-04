import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import express = require('express');
import cors = require('cors');
import * as zlib from 'zlib';
import { promisify } from 'util';
const gunzipAsync = promisify(zlib.gunzip);
import { registerAutostatsRoutes } from './api/autostats';
import { registerUcotPortalRoutes } from './api/ucotPortal';
import { registerCartonesConsultaRoutes } from './api/cartonesConsulta';
import { registerListeroRoutes } from './api/listero';
import { registerAdminSeedRoutes } from './api/adminSeeds';
import { detectarSentidoConContexto, loadSentidoContext, type SentidoContext } from './autoStatsCollector';

const app = express();
app.use(cors({ origin: true }));

registerAutostatsRoutes(app);
registerUcotPortalRoutes(app);
registerCartonesConsultaRoutes(app);
registerListeroRoutes(app);
registerAdminSeedRoutes(app);

// Acceso diferido a Firestore para evitar errores de inicialización top-level
const getDb = () => admin.firestore();

// ─── CACHE DE DATOS STM (In-Memory) ──────────────────────────────────────────
// Se usa para no saturar la API de la IMM (que devuelve un GeoJSON de 8MB)
// y para acelerar la respuesta a los agentes.
interface CachedFleet {
  data: any;
  timestamp: number;
}
let fleetCache: CachedFleet | null = null;

/**
 * Las 29 líneas UCOT autoritativas (Wikipedia + snapshot STM 2026-04-18).
 * NO se guardan estimaciones de cicloMin ni frecuencias: todo dato operativo
 * viene de fuentes reales (GPS STM + scraping horarios_oficiales).
 */
const UCOT_LINEAS: Array<{ id: string; nombre: string; categoria: 'urbana' | 'local' | 'diferencial' | 'metropolitana' }> = [
  // Urbanas
  { id: '17',  nombre: 'Punta Carretas - Casabó',        categoria: 'urbana' },
  { id: '71',  nombre: 'Mendoza - Pocitos',               categoria: 'urbana' },
  { id: '79',  nombre: 'Pocitos - Paso de la Arena',      categoria: 'urbana' },
  { id: '300', nombre: 'Instrucciones - Plaza Zitarrosa', categoria: 'urbana' },
  { id: '306', nombre: 'Parque Roosevelt - Casabó',       categoria: 'urbana' },
  { id: '316', nombre: 'Cno. Maldonado Km16 - Pocitos',   categoria: 'urbana' },
  { id: '328', nombre: 'Mendoza - Punta Carretas',        categoria: 'urbana' },
  { id: '329', nombre: 'Punta Carretas - Melilla',        categoria: 'urbana' },
  { id: '330', nombre: 'Instrucciones - Ciudadela',       categoria: 'urbana' },
  { id: '370', nombre: 'Portones - Playa del Cerro',      categoria: 'urbana' },
  { id: '396', nombre: 'Instrucciones - Ciudadela (ABC)', categoria: 'urbana' },
  // Locales
  { id: 'L12', nombre: 'Dique Nacional - Puntas de Sayago', categoria: 'local' },
  { id: 'L13', nombre: 'Local Cerro',                        categoria: 'local' },
  { id: 'L31', nombre: 'Local 31',                           categoria: 'local' },
  { id: 'L32', nombre: 'Local 32',                           categoria: 'local' },
  { id: 'L33', nombre: 'Local 33',                           categoria: 'local' },
  // Diferenciales / Especiales
  { id: 'CE1', nombre: 'Especial Costero 1', categoria: 'diferencial' },
  { id: 'PB',  nombre: 'Punta Ballena',       categoria: 'diferencial' },
  // UCOT Inter / Metropolitanas
  { id: '11A',  nombre: 'Línea 11A',    categoria: 'metropolitana' },
  { id: '221',  nombre: 'Línea 221',    categoria: 'metropolitana' },
  { id: '8SR',  nombre: 'Santa Rosa',   categoria: 'metropolitana' },
  { id: 'DM1',  nombre: 'Directo M1',   categoria: 'metropolitana' },
  { id: 'LM12', nombre: 'Metrop. 12',   categoria: 'metropolitana' },
  { id: 'LM13', nombre: 'Metrop. 13',   categoria: 'metropolitana' },
  { id: 'U11C', nombre: 'UCOT 11C',     categoria: 'metropolitana' },
  { id: 'U11S', nombre: 'UCOT 11S',     categoria: 'metropolitana' },
  { id: 'U11T', nombre: 'UCOT 11T',     categoria: 'metropolitana' },
  { id: 'XA1',  nombre: 'Expreso A1',   categoria: 'metropolitana' },
  { id: 'XA2',  nombre: 'Expreso A2',   categoria: 'metropolitana' },
];

export const UCOT_LINEAS_LIST = UCOT_LINEAS;

// Mapeo agencyId (string) → codigoEmpresa (número en GPS STM)
const EMPRESA_IDS: Record<string, number> = {
  '10': 10, '20': 20, '50': 50, '70': 70,
};

const STM_URL = 'https://www.montevideo.gub.uy/buses/rest/stm-online';
const STM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'Referer': 'https://www.montevideo.gub.uy/buses/',
  'Origin': 'https://www.montevideo.gub.uy',
};
const EMPRESAS: Record<number, string> = {
  10: 'COETC', 20: 'COME', 50: 'CUTCSA', 70: 'UCOT',
};
const EMPRESA_UCOT_ID = 70;
const CACHE_TTL_MS = 45_000; // Aumentado a 45s para reducir latencia de fetch repetitivo (8MB)
/** Radio de competencia directa — 300m es corredor compartido real, no mera proximidad urbana */
const RADIO_COMPETENCIA_KM = 0.3;

let _cache: any = null;
let _cacheTs = 0;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchSTM() {
  const now = Date.now();
  if (_cache && now - _cacheTs < CACHE_TTL_MS) return _cache;

  const axios = require('axios');
  const res = await axios.post(
    STM_URL,
    { empresa: '-1' },
    { headers: STM_HEADERS, timeout: 20_000 }
  );

  const geojson = res.data;
  _cache = geojson;
  _cacheTs = now;
  return geojson;
}

function parseBus(f: any) {
  const p = f.properties || {};
  const coords = f.geometry?.coordinates || [];
  const codEmp = p.codigoEmpresa || 0;
  
  return {
    codigoBus: p.codigoBus || 'S/N',
    empresaId: codEmp,
    empresa: EMPRESAS[codEmp] || `COD_${codEmp}`,
    linea: p.linea ? String(p.linea) : null,
    sublinea: p.sublinea || null,
    destino: p.destinoDesc || 'Sin Destino',
    lat: coords[1],
    lng: coords[0],
    gpsValido: coords[1] < 0 && coords[0] < 0
  };
}

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', server: 'Cloud Function Bridge' });
});

app.get('/api/lines/ucot', async (req, res) => {
  try {
    const geojson: any = await fetchSTM();
    const todos = geojson.features.map(parseBus).filter((b: any) => b.gpsValido);
    const ucotBuses = todos.filter((b: any) => b.empresaId === EMPRESA_UCOT_ID);

    const map = new Map();
    for (const b of ucotBuses) {
      if (!b.linea) continue;
      if (!map.has(b.linea)) {
        map.set(b.linea, { linea: b.linea, sublinea: b.sublinea, cantidad: 0, buses: [] });
      }
      const data = map.get(b.linea);
      data.cantidad++;
      data.buses.push(b);
    }

    const lineas = Array.from(map.values()).sort((a,b) => b.cantidad - a.cantidad);

    res.json({
      ok: true,
      totalLineas: lineas.length,
      totalBuses: ucotBuses.length,
      timestamp: new Date().toISOString(),
      lineas
    });
  } catch(err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/inteligencia/:lineaUcot', async (req, res) => {
  const { lineaUcot } = req.params;
  try {
    const geojson: any = await fetchSTM();
    const todos = geojson.features.map(parseBus).filter((b: any) => b.gpsValido);
    const ucotBuses = todos.filter((b: any) => b.empresaId === EMPRESA_UCOT_ID && b.linea === lineaUcot);
    
    const competenciaMap = new Map();
    for (const ucot of ucotBuses) {
      for (const rival of todos) {
        if (rival.empresaId === EMPRESA_UCOT_ID) continue;
        const dist = haversineKm(ucot.lat, ucot.lng, rival.lat, rival.lng);
        // Fix #1 (2026-04-23): usar la constante RADIO_COMPETENCIA_KM (300 m)
        // en lugar del literal 2.0 km que contradecía el comentario de línea 85.
        // 300 m = corredor compartido real; 2 km generaba falsos positivos urbanos.
        if (dist <= RADIO_COMPETENCIA_KM && rival.linea) {
          const key = `${rival.empresa}-${rival.linea}`;
          if (!competenciaMap.has(key)) {
            competenciaMap.set(key, { empresa: rival.empresa, linea: rival.linea, busesEnTramo: 0 });
          }
          competenciaMap.get(key).busesEnTramo++;
        }
      }
    }

    const competenciaFinal = Array.from(competenciaMap.values())
      .sort((a,b) => b.busesEnTramo - a.busesEnTramo)
      .slice(0, 3)
      .map(c => {
        // Fórmula Experto Transporte: Frecuencia = (Tiempo Vuelta Mins) / Buses
        // Si hay buses en un radio de 2km, estimamos la densidad en el trayecto
        // Asumiendo un corredor activo de unos 15km y vel 18km/h (50 min por tramo)
        let frecEstimada = 0;
        if (c.busesEnTramo > 0) {
           const densidadPorSector = c.busesEnTramo; // buses interceptados
           // Extrapolamos al corredor completo (aprox x3)
           const busesRuta = densidadPorSector * 3;
           frecEstimada = Math.round(100 / (busesRuta + 0.1)); 
        }
        
        return {
          ...c,
          frecuenciaRealMinutos: frecEstimada,
          frecuenciaProgramadaMinutos: null,
          ventajaCompetitiva: frecEstimada < 15 ? "ALTA (Headway Corto)" : "MEDIA"
        };
      });

    const busesTotalesEstimadosUcot = ucotBuses.length || 1;
    let fRealUcot = Math.round(100 / busesTotalesEstimadosUcot);
    
    // Cálculo experto de "Bunching" (Agrupamiento) - si muchos buses están muy cerca, mal servicio
    let bunchingPares = 0;
    for (let i = 0; i < ucotBuses.length; i++) {
       for (let j = i + 1; j < ucotBuses.length; j++) {
          const sep = haversineKm(ucotBuses[i].lat, ucotBuses[i].lng, ucotBuses[j].lat, ucotBuses[j].lng);
          if (sep < 0.8) bunchingPares++;
       }
    }
    
    let puntualidad = 85;
    if (bunchingPares > 0) puntualidad = Math.max(30, 85 - (bunchingPares * 15));

    res.json({
      ok: true,
      linea: lineaUcot,
      timestamp: new Date().toISOString(),
      hoy: { 
        tipo: 'Activo', 
        descripcion: 'Servicio en Curso',
        horaMontevideo: new Date().toLocaleString('es-UY', { timeZone: 'America/Montevideo' })
      },
      ucot: {
        busesActivos: ucotBuses.length,
        frecuenciaRealMinutos: fRealUcot,
        frecuenciaProgramadaMinutos: null,
        puntualidad: puntualidad,
        bunchingPares
      },
      competencia: competenciaFinal,
      alertaNivel: bunchingPares > 0 ? "🟠 WARNING (Bunching Detectado)" : "🟢 NORMAL (Flota OK)",
      resumenEjecutivo: `Línea ${lineaUcot}: ${ucotBuses.length} coches activos. ${bunchingPares > 0 ? 'Agrupamiento detectado.' : 'Separación ideal.'} Enemigo táctico: ${competenciaFinal[0]?.empresa || 'Ninguno'} con frec. est. de ${competenciaFinal[0]?.frecuenciaRealMinutos || '-'} min.`,
      fuente: "Telemetría STM GPS en Tiempo Real"
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Endpoints que antes vivían en el bridge local (localhost:3099) ─────────

// Health check usado por el frontend para detectar "bridge caído"
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', server: 'intelligenceApi', timestamp: new Date().toISOString() });
});
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', server: 'intelligenceApi', timestamp: new Date().toISOString() });
});

// Posiciones GPS crudas (todas las empresas) — usado por fetchPosicionesSTM y similares
async function posicionesHandler(_req: express.Request, res: express.Response) {
  try {
    const geojson: any = await fetchSTM();
    const buses = (geojson.features || [])
      .map(parseBus)
      .filter((b: any) => b.gpsValido)
      .map((b: any) => ({
        idBus: String(b.codigoBus),
        codigoBus: String(b.codigoBus),
        linea: b.linea,
        sublinea: b.sublinea,
        destino: b.destino,
        empresa: b.empresa,
        empresaId: b.empresaId,
        lat: b.lat,
        lng: b.lng,
        timestamp: new Date().toISOString(),
      }));
    res.json({
      ok: true,
      total: buses.length,
      buses,
      timestamp: new Date().toISOString(),
      fuente: 'IMM_GPS',
    });
  } catch (err: any) {
    res.status(502).json({ ok: false, error: err?.message || String(err) });
  }
}
app.get('/api/positions', posicionesHandler);
app.get('/api/posicion', posicionesHandler);

// Análisis de competencia por línea UCOT — shape consumido por CompetitorIntelligencePage
app.get('/api/analysis/:linea', async (req, res) => {
  const { linea } = req.params;
  try {
    const geojson: any = await fetchSTM();
    const todos = (geojson.features || []).map(parseBus).filter((b: any) => b.gpsValido);
    const ucotBuses = todos.filter((b: any) => b.empresaId === EMPRESA_UCOT_ID && b.linea === linea);

    const empresasDetectadas = new Set<string>();
    const alertas: any[] = [];

    for (const ucot of ucotBuses) {
      const cercanos: any[] = [];
      for (const rival of todos) {
        if (rival.empresaId === EMPRESA_UCOT_ID) continue;
        const dist = haversineKm(ucot.lat, ucot.lng, rival.lat, rival.lng);
        if (dist <= RADIO_COMPETENCIA_KM) {
          empresasDetectadas.add(rival.empresa);
          cercanos.push({
            codigoBus: String(rival.codigoBus),
            empresa: rival.empresa,
            linea: rival.linea,
            sublinea: rival.sublinea,
            destino: rival.destino,
            distanciaKm: Math.round(dist * 1000) / 1000,
            lat: rival.lat,
            lng: rival.lng,
          });
        }
      }
      if (cercanos.length > 0) {
        cercanos.sort((a, b) => a.distanciaKm - b.distanciaKm);
        alertas.push({
          busUcot: {
            codigoBus: String(ucot.codigoBus),
            linea: ucot.linea,
            sublinea: ucot.sublinea,
            destino: ucot.destino,
            velocidad: 0,
            lat: ucot.lat,
            lng: ucot.lng,
          },
          competidoresCercanos: cercanos,
          maxAmenaza: cercanos[0],
        });
      }
    }

    const total = ucotBuses.length;
    const conCompetencia = alertas.length;
    const pctFlota = total > 0 ? Math.round((conCompetencia / total) * 100) : 0;
    const nivelAlerta =
      pctFlota >= 60 ? 'ALTA' : pctFlota >= 30 ? 'MEDIA' : total === 0 ? 'SIN DATOS' : 'BAJA';

    res.json({
      ok: true,
      linea,
      resumen: {
        totalBusesUcot: total,
        busesConCompetenciaDirecta: conCompetencia,
        pctFlotaEnDisputa: pctFlota,
        nivelAlerta,
        empresasDetectadas: Array.from(empresasDetectadas),
      },
      alertas,
      timestamp: new Date().toISOString(),
      mensaje: total === 0 ? `Sin buses UCOT activos en línea ${linea} ahora mismo` : undefined,
    });
  } catch (err: any) {
    res.status(502).json({ ok: false, linea, error: err?.message || String(err) });
  }
});

/**
 * /api/ucot/fleet-intel
 * Endpoint consolidado que devuelve estado de las 29 líneas UCOT en un solo request.
 * Calcula, para cada línea UCOT:
 *  - busesActivos (snapshot STM actual)
 *  - frecuenciaEstimadaMin = cicloMin / busesActivos (cycle time por categoría)
 *  - bunchingPares (pares de buses UCOT dentro de 800m → mal servicio)
 *  - rivales con los que se cruza en <0.5km + empresas detectadas
 *  - nivelAlerta / pctFlotaEnDisputa
 * El frontend consume UNA sola vez esto y alimenta tanto la grilla de líneas
 * como la de agentes digitales.
 */
function tipoDiaHoyMontevideo(): 'Hábiles' | 'Sábados' | 'Domingos' {
  // Usa la zona horaria de Montevideo (UTC-3) sin DST
  const ahora = new Date();
  const mvd = new Date(ahora.getTime() - 3 * 60 * 60 * 1000);
  const dow = mvd.getUTCDay(); // 0=Dom, 1=Lun ... 6=Sáb
  if (dow === 0) return 'Domingos';
  if (dow === 6) return 'Sábados';
  return 'Hábiles';
}

function hhmmAhoraMontevideo(): string {
  const ahora = new Date();
  const mvd = new Date(ahora.getTime() - 3 * 60 * 60 * 1000);
  const hh = String(mvd.getUTCHours()).padStart(2, '0');
  const mm = String(mvd.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function hhmmToMin(s: string): number | null {
  const m = s.match(/^(\d{2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * Dado un doc horarios_oficiales/{linea} y un tipoDia + hhmm actual,
 * devuelve la frecuencia programada (min entre salidas) estimada para esa
 * ventana horaria. Prefiere contar salidas reales en [hhmm-30, hhmm+30].
 */
function frecuenciaProgramadaDesdeDoc(
  doc: admin.firestore.DocumentSnapshot,
  tipoDia: string,
  hhmm: string,
): { frecuenciaProgramadaMin: number | null; horaInicio: string | null; horaFin: string | null; totalSalidas: number } {
  const data = doc.data() as any;
  const dia = data?.dias?.[tipoDia];
  if (!dia) return { frecuenciaProgramadaMin: null, horaInicio: null, horaFin: null, totalSalidas: 0 };

  const salidas = (dia.salidasDominante || []) as { desde: string }[];
  // horaInicio/horaFin del día = primera y última salida de CUALQUIER variante
  const horasOrdenadas = salidas
    .map((s) => s.desde)
    .filter((h): h is string => typeof h === 'string')
    .sort();
  const horaInicio = horasOrdenadas[0] ?? null;
  const horaFin = horasOrdenadas[horasOrdenadas.length - 1] ?? null;
  const target = hhmmToMin(hhmm);
  if (target === null) {
    return {
      frecuenciaProgramadaMin: dia.frecuenciaDominanteMin ?? null,
      horaInicio,
      horaFin,
      totalSalidas: dia.totalSalidas ?? 0,
    };
  }

  let enVentana = 0;
  for (const s of salidas) {
    const m = hhmmToMin(s.desde);
    if (m === null) continue;
    if (m >= target - 30 && m <= target + 30) enVentana++;
  }
  const freq = enVentana >= 2 ? Math.round(60 / enVentana) : null;

  return {
    frecuenciaProgramadaMin: freq,
    horaInicio,
    horaFin,
    totalSalidas: dia.totalSalidas ?? 0,
  };
}

// ─── GET /api/agency-lines/:agencyId ─────────────────────────────────────────
app.get('/api/agency-lines/:agencyId', async (req, res) => {
  const agencyId = String(req.params.agencyId || '70').trim();
  try {
    const snap = await getDb().collection('line_inspector_configs')
      .where('agencyId', '==', agencyId).orderBy('lineId').get();
    if (!snap.empty) {
      return res.json({ ok: true, agencyId, source: 'firestore', lines: snap.docs.map((d) => d.data()) });
    }
    if (agencyId === '70') {
      return res.json({
        ok: true, agencyId, source: 'static',
        lines: UCOT_LINEAS.map((l) => ({ lineId: l.id, nombre: l.nombre, categoria: l.categoria })),
      });
    }
    const empresaId = EMPRESA_IDS[agencyId];
    if (!empresaId) return res.json({ ok: true, agencyId, source: 'empty', lines: [] });
    const geojson: any = await fetchSTM();
    const todos = (geojson.features || []).map(parseBus).filter((b: any) => b.gpsValido);
    const companyBuses = todos.filter((b: any) => b.empresaId === empresaId);
    const lineMap = new Map<string, number>();
    companyBuses.forEach((b: any) => { if (b.linea) lineMap.set(b.linea, (lineMap.get(b.linea) ?? 0) + 1); });
    const lines = Array.from(lineMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([lineId, count]) => ({ lineId, nombre: `Línea ${lineId}`, categoria: 'urbana', busesActivos: count }));
    return res.json({ ok: true, agencyId, source: 'gps', lines });
  } catch (err: any) {
    res.status(502).json({ ok: false, error: err?.message || String(err) });
  }
});

// ─── POST /api/admin/seed-line-configs ───────────────────────────────────────
app.post('/api/admin/seed-line-configs', async (_req, res) => {
  try {
    const batch = getDb().batch();
    UCOT_LINEAS.forEach((l) => {
      const ref = getDb().collection('line_inspector_configs').doc(`70_${l.id}`);
      batch.set(ref, { agencyId: '70', lineId: l.id, nombre: l.nombre, categoria: l.categoria, createdAt: new Date().toISOString() }, { merge: true });
    });
    await batch.commit();
    res.json({ ok: true, seeded: UCOT_LINEAS.length });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

// ─── GET /api/ucot/fleet-intel ────────────────────────────────────────────────
// Params: agencyId (default '70'), lineIds (comma-separated, opcional)
app.get('/api/ucot/fleet-intel', async (req, res) => {
  try {
    const agencyId = String((req as any).query.agencyId ?? '70').trim();
    const lineIdsParam = String((req as any).query.lineIds ?? '').trim();
    const requestedLineIds = lineIdsParam ? lineIdsParam.split(',').map((s: string) => s.trim()).filter(Boolean) : null;
    const empresaId = EMPRESA_IDS[agencyId] ?? EMPRESA_UCOT_ID;

    const geojson: any = await fetchSTM();
    const todos = (geojson.features || []).map(parseBus).filter((b: any) => b.gpsValido);
    const agencyBuses = todos.filter((b: any) => b.empresaId === empresaId);

    let lineasMeta: Array<{ id: string; nombre: string; categoria: string }>;
    if (requestedLineIds && requestedLineIds.length > 0) {
      lineasMeta = requestedLineIds.map((id: string) => {
        const ucotMeta = UCOT_LINEAS.find((l) => l.id === id);
        return { id, nombre: ucotMeta?.nombre ?? `Línea ${id}`, categoria: ucotMeta?.categoria ?? 'urbana' };
      });
    } else if (agencyId === '70') {
      lineasMeta = UCOT_LINEAS;
    } else {
      const lineMap = new Map<string, number>();
      agencyBuses.forEach((b: any) => { if (b.linea) lineMap.set(b.linea, (lineMap.get(b.linea) ?? 0) + 1); });
      lineasMeta = Array.from(lineMap.keys()).slice(0, 60).map((id) => ({ id, nombre: `Línea ${id}`, categoria: 'urbana' }));
    }

    const tipoDia = tipoDiaHoyMontevideo();
    const hhmm = hhmmAhoraMontevideo();
    const horariosMap = new Map<string, admin.firestore.DocumentSnapshot>();
    if (lineasMeta.length > 0) {
      const horarioDocs = await getDb().getAll(
        ...lineasMeta.map((l) => getDb().collection('horarios_oficiales').doc(l.id)),
      );
      horarioDocs.forEach((d) => horariosMap.set(d.id, d));
    }

    const since30 = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const evSnap = await getDb().collection('vehicle_events')
      .where('agencyId', '==', agencyId)
      .where('timestampGPS', '>=', since30)
      .orderBy('timestampGPS', 'desc')
      .limit(1500)
      .get();
    const linesBuses: Record<string, Set<string>> = {};
    evSnap.docs.forEach((d) => {
      const e = d.data();
      if (e.linea) {
        if (!linesBuses[e.linea]) linesBuses[e.linea] = new Set();
        linesBuses[e.linea].add(e.idBus);
      }
    });
    const frecuenciaRealByLine: Record<string, number | null> = {};
    for (const [linea, buses] of Object.entries(linesBuses)) {
      const n = (buses as Set<string>).size;
      frecuenciaRealByLine[linea] = n >= 2 ? Math.round(30 / n) : null;
    }

    const lineas = lineasMeta.map((meta) => {
      const busesLinea = agencyBuses.filter((b: any) => b.linea === meta.id);
      const busesActivos = busesLinea.length;

      let bunchingPares = 0;
      for (let i = 0; i < busesLinea.length; i++) {
        for (let j = i + 1; j < busesLinea.length; j++) {
          const d = haversineKm(busesLinea[i].lat, busesLinea[i].lng, busesLinea[j].lat, busesLinea[j].lng);
          if (d < 0.8) bunchingPares++;
        }
      }

      const empresasDetectadas = new Set<string>();
      let busesConCompetenciaDirecta = 0;
      for (const propio of busesLinea) {
        let tieneRivalCerca = false;
        for (const rival of todos) {
          if (rival.empresaId === empresaId) continue;
          const d = haversineKm(propio.lat, propio.lng, rival.lat, rival.lng);
          if (d <= RADIO_COMPETENCIA_KM) { tieneRivalCerca = true; empresasDetectadas.add(rival.empresa); }
        }
        if (tieneRivalCerca) busesConCompetenciaDirecta++;
      }

      const pctFlotaEnDisputa = busesActivos > 0 ? Math.round((busesConCompetenciaDirecta / busesActivos) * 100) : 0;

      let frecuenciaProgramadaMin: number | null = null;
      let horaInicioProgramada: string | null = null;
      let horaFinProgramada: string | null = null;
      let totalSalidasProgramadas = 0;
      let tieneHorariosOficiales = false;
      const docHor = horariosMap.get(meta.id);
      if (docHor && docHor.exists) {
        tieneHorariosOficiales = true;
        const prog = frecuenciaProgramadaDesdeDoc(docHor, tipoDia, hhmm);
        frecuenciaProgramadaMin = prog.frecuenciaProgramadaMin;
        horaInicioProgramada = prog.horaInicio;
        horaFinProgramada = prog.horaFin;
        totalSalidasProgramadas = prog.totalSalidas;
      }

      const frecReal = frecuenciaRealByLine[meta.id] ?? null;
      const brechaPct = frecReal !== null && frecuenciaProgramadaMin !== null && frecuenciaProgramadaMin > 0
        ? Math.round(((frecReal - frecuenciaProgramadaMin) / frecuenciaProgramadaMin) * 100) : null;

      // ── nivelAlerta: driver principal = brecha vs horario programado ──────────
      // Un CEO de tránsito necesita alertas que signifiquen algo:
      //   ALTA = problema operativo real (incumplimiento grave de horario o bunching severo)
      //   MEDIA = atención necesaria (leve degradación o presión rival)
      //   BAJA = operación normal dentro de tolerancia
      let nivelAlerta: 'ALTA' | 'MEDIA' | 'BAJA' | 'SIN_SERVICIO' = 'BAJA';
      if (busesActivos === 0) {
        nivelAlerta = 'SIN_SERVICIO';
      } else if ((brechaPct !== null && brechaPct > 50) || bunchingPares >= 3) {
        nivelAlerta = 'ALTA'; // intervalo real >50% sobre programado, o agrupamiento severo
      } else if ((brechaPct !== null && brechaPct > 20) || bunchingPares >= 1) {
        nivelAlerta = 'MEDIA'; // degradación leve detectada
      } else if (brechaPct === null && pctFlotaEnDisputa >= 80) {
        nivelAlerta = 'MEDIA'; // sin datos de horario pero alta presión de rival
      }

      let estadoOperativo: 'OPERATIVO' | 'SIN_SERVICIO' | 'ALERTA' = 'OPERATIVO';
      if (busesActivos === 0) estadoOperativo = 'SIN_SERVICIO';
      else if (nivelAlerta === 'ALTA') estadoOperativo = 'ALERTA';

      let posicionCompetitiva: 'SIN_RIVALES_VISIBLES' | 'CON_RIVALES' | 'DISPUTADA' | 'CRITICA' | 'SIN_SERVICIO' = 'CON_RIVALES';
      if (busesActivos === 0) posicionCompetitiva = 'SIN_SERVICIO';
      else if (empresasDetectadas.size === 0) posicionCompetitiva = 'SIN_RIVALES_VISIBLES';
      else if (pctFlotaEnDisputa >= 70) posicionCompetitiva = 'CRITICA';
      else if (pctFlotaEnDisputa >= 40) posicionCompetitiva = 'DISPUTADA';

      // ── saludServicio 0-100: KPI ejecutivo compuesto ─────────────────────────
      // Penaliza incumplimiento de frecuencia (40pts) + bunching (30pts) + sin servicio
      let saludServicio = 100;
      if (brechaPct !== null && brechaPct > 0) saludServicio -= Math.min(40, Math.round(brechaPct * 0.7));
      if (bunchingPares > 0) saludServicio -= Math.min(30, bunchingPares * 12);
      if (busesActivos === 0) saludServicio = 0;
      saludServicio = Math.max(0, saludServicio);

      // ── cicloMin estimado: N buses × headway programado (fórmula transit) ────
      const cicloMin = busesActivos > 0 && frecuenciaProgramadaMin
        ? busesActivos * frecuenciaProgramadaMin
        : frecuenciaProgramadaMin
          ? frecuenciaProgramadaMin * 2
          : 0;

      return {
        lineId: meta.id, nombreComercial: meta.nombre, categoria: meta.categoria, busesActivos,
        frecuenciaRealMin: frecReal, frecuenciaProgramadaMin, brechaPct,
        horaInicioProgramada, horaFinProgramada, totalSalidasProgramadas, tieneHorariosOficiales,
        cicloMin, bunchingPares, pctFlotaEnDisputa, busesConCompetenciaDirecta,
        empresasDetectadas: Array.from(empresasDetectadas), rivalCount: empresasDetectadas.size,
        nivelAlerta, estadoOperativo, posicionCompetitiva, saludServicio,
      };
    });

    const totalBuses = lineas.reduce((s, l) => s + l.busesActivos, 0);
    const lineasEnServicio = lineas.filter((l) => l.busesActivos > 0).length;
    const lineasConHorariosOficiales = lineas.filter((l) => l.tieneHorariosOficiales).length;

    res.json({
      ok: true, agencyId, timestamp: new Date().toISOString(), tipoDia, horaMontevideo: hhmm,
      totalLineas: lineas.length, lineasEnServicio, lineasSinServicio: lineas.length - lineasEnServicio,
      lineasConHorariosOficiales, totalBusesUcot: totalBuses, lineas,
    });
  } catch (err: any) {
    res.status(502).json({ ok: false, error: err?.message || String(err) });
  }
});

/**
 * Devuelve el horario oficial scrapeado desde STM + metadatos de la línea UCOT.
 * Usado por DetailPanel del OperationsIntelligenceHub para mostrar datos reales
 * de variantes, horaInicio/horaFin, salidas y frecuencia por tipoDía.
 */
app.get('/api/ucot/schedule/:linea', async (req, res) => {
  const lineaId = String(req.params.linea || '').trim();
  const meta = UCOT_LINEAS.find((l) => l.id === lineaId);
  if (!meta) {
    res.status(404).json({ ok: false, error: `Línea ${lineaId} no está en la lista UCOT` });
    return;
  }
  try {
    const doc = await getDb().collection('horarios_oficiales').doc(lineaId).get();
    if (!doc.exists) {
      res.json({
        ok: true,
        linea: lineaId,
        nombreComercial: meta.nombre,
        categoria: meta.categoria,
        tieneHorariosOficiales: false,
        dias: null,
        tipoDiaHoy: tipoDiaHoyMontevideo(),
        horaMontevideo: hhmmAhoraMontevideo(),
      });
      return;
    }
    const data = doc.data() || {};
    res.json({
      ok: true,
      linea: lineaId,
      nombreComercial: data.nombre || meta.nombre,
      categoria: data.categoria || meta.categoria,
      tieneHorariosOficiales: true,
      dias: data.dias || null,
      ultimaActualizacion: data.ultimaActualizacion || null,
      fuente: data.fuente || 'stm.horarios.jsf',
      tipoDiaHoy: tipoDiaHoyMontevideo(),
      horaMontevideo: hhmmAhoraMontevideo(),
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

// ─── COPILOTO TÁCTICO (/api/ai/chat) ─────────────────────────────────────────
// Usa Claude claude-haiku-4-5-20251001 via Anthropic API con prompt caching.
// El frontend inyecta el contexto táctico por variante seleccionada.

const COPILOTO_SYSTEM = `Eres el Copiloto Táctico de UCOT, cooperativa de transporte público de Montevideo, Uruguay.
Asistís a inspectores y jefes de tránsito con análisis en tiempo real y recomendaciones operativas.

REGLAS:
- Respondés en español rioplatense, tono directo, ejecutivo y breve (3-6 líneas máximo).
- Tu misión: optimizar frecuencia y defender la línea frente a la competencia (CUTCSA, COETC, COME).
- Identificás coches por NÚMERO INTERNO. Ejemplo: "El interno 142 lleva 3min de atraso".
- Cada recomendación se basa en DATOS reales: frecuencia, presión rival, gaps de servicio, horario STM.
- NUNCA inventás datos. Si no tenés información, lo decís explícitamente: "Sin señal GPS ahora mismo".
- Si el inspector pide retener/adelantar un coche, confirmás con datos del corredor antes de sugerir.
- Formato: respuestas cortas y directas. Si hay acción táctica clara, la proponés en negrita al final.`;

app.post('/api/ai/chat', async (req, res) => {
  const { history = [], message, context } = req.body as {
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    message?: string;
    context?: {
      linea?: string;
      destino?: string;
      rivales?: string[];
      puntosCarga?: string[];
      estrategia?: string;
    };
  };

  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'Parámetro requerido: message' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error: 'Copiloto no disponible',
      hint: 'ANTHROPIC_API_KEY no configurada en Firebase Functions. Ejecutá: firebase functions:secrets:set ANTHROPIC_API_KEY',
    });
    return;
  }

  let contextBlock = '';
  if (context?.linea) {
    contextBlock = `\n\nCONTEXTO ACTIVO DEL INSPECTOR:
Línea seleccionada: ${context.linea}
Variante/destino: ${context.destino ?? 'no especificado'}
Rivales verificados en este corredor: ${context.rivales?.join(', ') ?? 'no cargados'}
Puntos de alta demanda: ${context.puntosCarga?.join(', ') ?? 'no especificados'}
Estrategia táctica vigente: ${context.estrategia ?? 'sin datos'}`;
  }

  const systemText = COPILOTO_SYSTEM + contextBlock;

  try {
    const t0 = Date.now();

    const safeHistory = (Array.isArray(history) ? history : [])
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-12);

    const messages = [
      ...safeHistory.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: message },
    ];

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }],
        messages,
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('[copiloto] Anthropic error', anthropicRes.status, errText);
      let hint = `Error ${anthropicRes.status} de Anthropic API`;
      try {
        const parsed = JSON.parse(errText);
        hint = parsed.error?.message || hint;
      } catch {}
      res.status(503).json({ error: 'Copiloto temporalmente no disponible', hint });
      return;
    }

    const data = await anthropicRes.json() as {
      content: Array<{ type: string; text?: string }>;
      model: string;
    };

    const reply = data.content.find((c) => c.type === 'text')?.text ?? '(sin respuesta)';
    res.json({
      reply,
      tools_used: [],
      rounds: 1,
      total_latency_ms: Date.now() - t0,
      model: data.model ?? 'claude-haiku-4-5-20251001',
    });
  } catch (err: any) {
    console.error('[copiloto] Error:', err);
    res.status(503).json({ error: 'Error en copiloto táctico', hint: err?.message || String(err) });
  }
});

// ─── AI ORDERS: approve/reject (Firestore) ───────────────────────────────────

app.post('/api/ai/orders/:id/approve', async (req, res) => {
  try {
    const orderId = String(req.params.id);
    await getDb().collection('ai_orders').doc(orderId).set(
      { status: 'approved', approvedAt: admin.firestore.FieldValue.serverTimestamp(), approvedBy: 'inspector' },
      { merge: true },
    );
    const doc = await getDb().collection('ai_orders').doc(orderId).get();
    res.json({ order: { id: orderId, ...doc.data() } });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || String(err) });
  }
});

app.post('/api/ai/orders/:id/reject', async (req, res) => {
  try {
    const orderId = String(req.params.id);
    const { reason = 'Rechazado por inspector' } = req.body as { reason?: string };
    await getDb().collection('ai_orders').doc(orderId).set(
      { status: 'rejected', rejectedAt: admin.firestore.FieldValue.serverTimestamp(), rejectedBy: 'inspector', reason },
      { merge: true },
    );
    const doc = await getDb().collection('ai_orders').doc(orderId).get();
    res.json({ order: { id: orderId, ...doc.data() } });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || String(err) });
  }
});

// ─── RECOMPUTE SENTIDO (backfill 24h) ────────────────────────────────────────
// Recalcula el campo `sentido` y `confianzaSentido` de vehicle_events recientes
// usando la cascada nueva (destinoDesc + variante + GTFS terminals + bearing).
// Útil para corregir la histórica donde el ~99% quedó null por las regex viejas.
//
// Uso: POST /recomputeSentido?hours=24[&limit=5000]
//   - Vía Cloud Function directa: POST https://us-central1-<project>.cloudfunctions.net/intelligenceApi/recomputeSentido
//   - Vía Hosting rewrite: POST https://<site>/api/recomputeSentido
const recomputeSentidoHandler: express.RequestHandler = async (req, res) => {
  try {
    const hours = Math.max(1, Math.min(72, Number(req.query.hours ?? 6)));
    const limit = Math.max(1, Math.min(20000, Number(req.query.limit ?? 5000)));
    const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    const fsdb = getDb();

    const snap = await fsdb.collection('vehicle_events')
      .where('timestampGPS', '>=', cutoff)
      .orderBy('timestampGPS', 'asc')
      .limit(limit)
      .get();

    // Cache de contexto por `${agencyId}_${linea}` para evitar reads redundantes.
    const ctxCache = new Map<string, SentidoContext>();
    async function getCtx(agencyId: string, linea: string): Promise<SentidoContext> {
      const key = `${agencyId}_${linea}`;
      let ctx = ctxCache.get(key);
      if (!ctx) {
        ctx = await loadSentidoContext(agencyId, linea, fsdb);
        ctxCache.set(key, ctx);
      }
      return ctx;
    }

    let updated = 0;
    let sinCambio = 0;
    let sinDestino = 0;
    const conteoConfianza: Record<string, number> = { HIGH: 0, MEDIUM: 0, LOW: 0, ZERO: 0 };

    let batch = fsdb.batch();
    let pending = 0;
    const FLUSH_EVERY = 400;

    for (const docSnap of snap.docs) {
      const d = docSnap.data() as Record<string, any>;
      if (!d.destinoDesc) sinDestino++;

      const linea = String(d.linea ?? '');
      const agencyId = String(d.agencyId ?? '');
      if (!linea) { sinCambio++; continue; }

      const ctx = await getCtx(agencyId, linea);
      const result = detectarSentidoConContexto(
        d.destinoDesc ?? null,
        d.variante ?? null,
        typeof d.bearing === 'number' ? d.bearing : null,
        ctx,
      );

      conteoConfianza[result.confianza] = (conteoConfianza[result.confianza] ?? 0) + 1;

      const cambio = (result.sentido ?? null) !== (d.sentido ?? null)
                  || (result.confianza ?? null) !== (d.confianzaSentido ?? null);
      if (cambio) {
        batch.update(docSnap.ref, {
          sentido: result.sentido,
          confianzaSentido: result.confianza,
        });
        pending++;
        updated++;
        if (pending >= FLUSH_EVERY) {
          await batch.commit();
          batch = fsdb.batch();
          pending = 0;
        }
      } else {
        sinCambio++;
      }
    }

    if (pending > 0) await batch.commit();

    res.json({
      ok: true,
      total: snap.size,
      updated,
      sinCambio,
      sinDestinoDesc: sinDestino,
      lineasCargadas: ctxCache.size,
      confianza: conteoConfianza,
      hours,
      cutoff,
    });
  } catch (err: any) {
    console.error('[recomputeSentido] Error:', err);
    res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
};
app.post('/recomputeSentido', recomputeSentidoHandler);
app.post('/api/recomputeSentido', recomputeSentidoHandler);

// ─── AUTH: login con custom token (Firebase Admin SDK) ───────────────────────
// El sistema heredado tiene usuarios en Firestore (`users` / `personal`) sin
// cuenta en Firebase Auth. Este endpoint valida credenciales contra Firestore
// y emite un Firebase Custom Token. El frontend luego llama
// signInWithCustomToken(auth, token) para crear una sesión Firebase real, de
// modo que getAuth().currentUser !== null y las reglas Firestore que requieren
// isAuthenticated() pasen sin tener que abrir colecciones a `read: if true`.
app.post('/api/auth/login', async (req, res) => {
  try {
    const internalNumber = String(req.body?.internalNumber ?? '').trim();
    const password = String(req.body?.password ?? '');
    if (!internalNumber || !password) {
      return res.status(400).json({ ok: false, error: 'internalNumber y password son requeridos' });
    }

    const db = getDb();

    // Buscar el usuario primero en `users` (legajo en docId padded), luego en
    // `personal`, luego por campo internalNumber/legajo para tolerar otros docIds.
    const candidates: Array<{ id: string; data: Record<string, any> }> = [];
    const seen = new Set<string>();
    const tryAdd = (id: string, data: Record<string, any> | undefined) => {
      if (!data || seen.has(id)) return;
      seen.add(id);
      candidates.push({ id, data });
    };

    // Heurística: docId padded a 4 dígitos con prefijo P (ej. P0329 para "329")
    const paddedId = `P${internalNumber.padStart(4, '0')}`;
    for (const col of ['users', 'personal']) {
      const direct = await db.collection(col).doc(paddedId).get();
      if (direct.exists) tryAdd(`${col}/${direct.id}`, direct.data());
      const direct2 = await db.collection(col).doc(internalNumber).get();
      if (direct2.exists) tryAdd(`${col}/${direct2.id}`, direct2.data());
    }
    for (const col of ['users', 'personal']) {
      for (const field of ['internalNumber', 'legajo']) {
        const snap = await db.collection(col).where(field, '==', internalNumber).limit(2).get();
        snap.docs.forEach((d) => tryAdd(`${col}/${d.id}`, d.data()));
      }
    }

    if (candidates.length === 0) {
      return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });
    }

    // Validar password. Si el usuario no tiene password almacenado, aceptamos el
    // password por defecto del seeding (legajo == password) — gap conocido,
    // pendiente de hashing real post-presentación.
    const match = candidates.find(({ data }) => {
      const stored = data.password ?? data.passwd ?? null;
      if (typeof stored === 'string' && stored.length > 0) {
        return stored === password;
      }
      // Fallback: aceptar el internalNumber como password (seed por defecto)
      return password === internalNumber;
    });

    if (!match) {
      return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });
    }

    const data = match.data;
    const docPath = match.id; // ej. "users/P0329"
    const uid = `emp_${internalNumber}`;
    const role = String(data.role ?? data.rol ?? 'USER').toUpperCase();
    const agencyId = String(data.agencyId ?? '70');

    const claims: Record<string, any> = { role, agencyId, internalNumber };
    const customToken = await admin.auth().createCustomToken(uid, claims);

    // Asegurar que el documento `users/{uid}` exista con la forma esperada por
    // el AuthContext (lee doc(db,'users',uid)). Mergeamos los datos sin pisar.
    await db.collection('users').doc(uid).set(
      {
        internalNumber,
        legajo: internalNumber,
        rol: data.rol ?? role,
        role,
        agencyId,
        fullName: data.fullName ?? data.nombre ?? null,
        nombre: data.nombre ?? null,
        apellido: data.apellido ?? null,
        sourceDoc: docPath,
        loginAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    res.json({
      ok: true,
      firebaseCustomToken: customToken,
      user: {
        uid,
        internalNumber,
        role,
        agencyId,
        fullName: data.fullName ?? data.nombre ?? null,
        firstName: data.nombre ?? null,
        lastName: data.apellido ?? null,
      },
    });
  } catch (err: any) {
    console.error('[auth/login] Error:', err);
    res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

// ─── EXPORT CLOUD FUNCTION ───────────────────────────────────────────────────
// timeoutSeconds aumentado a 540 (max gen1) para soportar /recomputeSentido
// con cargas de hasta 20k eventos y memory bumped por el cache de contexto.
export const intelligenceApi = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .https.onRequest(app);

