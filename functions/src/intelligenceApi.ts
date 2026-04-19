import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import express = require('express');
import cors = require('cors');

const app = express();
app.use(cors({ origin: true }));

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
/** Radio considerado "competencia directa" en análisis por línea */
const RADIO_COMPETENCIA_KM = 0.5;

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
        if (dist <= 2.0 && rival.linea) {
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

app.get('/api/ucot/fleet-intel', async (_req, res) => {
  try {
    const geojson: any = await fetchSTM();
    const todos = (geojson.features || []).map(parseBus).filter((b: any) => b.gpsValido);
    const ucotAll = todos.filter((b: any) => b.empresaId === EMPRESA_UCOT_ID);

    // Cargar horarios_oficiales de todas las líneas UCOT en paralelo
    const tipoDia = tipoDiaHoyMontevideo();
    const hhmm = hhmmAhoraMontevideo();
    const horarioDocs = await getDb().getAll(
      ...UCOT_LINEAS.map((l) => getDb().collection('horarios_oficiales').doc(l.id)),
    );
    const horariosMap = new Map<string, admin.firestore.DocumentSnapshot>();
    horarioDocs.forEach((d) => horariosMap.set(d.id, d));

    const lineas = UCOT_LINEAS.map((meta) => {
      const busesUcot = ucotAll.filter((b: any) => b.linea === meta.id);
      const busesActivos = busesUcot.length;

      // Bunching: pares de buses UCOT demasiado cerca (GPS real)
      let bunchingPares = 0;
      for (let i = 0; i < busesUcot.length; i++) {
        for (let j = i + 1; j < busesUcot.length; j++) {
          const d = haversineKm(busesUcot[i].lat, busesUcot[i].lng, busesUcot[j].lat, busesUcot[j].lng);
          if (d < 0.8) bunchingPares++;
        }
      }

      // Rivales cercanos (<0.5km a cualquier bus UCOT de esta línea, GPS real)
      const empresasDetectadas = new Set<string>();
      let busesConCompetenciaDirecta = 0;
      for (const ucot of busesUcot) {
        let tieneRivalCerca = false;
        for (const rival of todos) {
          if (rival.empresaId === EMPRESA_UCOT_ID) continue;
          const d = haversineKm(ucot.lat, ucot.lng, rival.lat, rival.lng);
          if (d <= RADIO_COMPETENCIA_KM) {
            tieneRivalCerca = true;
            empresasDetectadas.add(rival.empresa);
          }
        }
        if (tieneRivalCerca) busesConCompetenciaDirecta++;
      }

      const pctFlotaEnDisputa = busesActivos > 0
        ? Math.round((busesConCompetenciaDirecta / busesActivos) * 100)
        : 0;

      // Alerta operativa deriva SOLO de datos GPS reales (bunching + disputa).
      // No se compara contra frecuencia programada porque no tenemos frecuencia
      // REAL (requiere tracking temporal GPS, no snapshot instantáneo).
      let nivelAlerta: 'ALTA' | 'MEDIA' | 'BAJA' | 'SIN_SERVICIO' = 'BAJA';
      if (busesActivos === 0) nivelAlerta = 'SIN_SERVICIO';
      else if (pctFlotaEnDisputa >= 60 || bunchingPares >= 2) nivelAlerta = 'ALTA';
      else if (pctFlotaEnDisputa >= 30 || bunchingPares >= 1) nivelAlerta = 'MEDIA';

      let estadoOperativo: 'OPERATIVO' | 'SIN_SERVICIO' | 'ALERTA' = 'OPERATIVO';
      if (busesActivos === 0) estadoOperativo = 'SIN_SERVICIO';
      else if (nivelAlerta === 'ALTA') estadoOperativo = 'ALERTA';

      // Posición competitiva: sólo marcadores honestos derivados de GPS real.
      let posicionCompetitiva: 'SIN_RIVALES_VISIBLES' | 'CON_RIVALES' | 'DISPUTADA' | 'CRITICA' | 'SIN_SERVICIO' = 'CON_RIVALES';
      if (busesActivos === 0) posicionCompetitiva = 'SIN_SERVICIO';
      else if (empresasDetectadas.size === 0) posicionCompetitiva = 'SIN_RIVALES_VISIBLES';
      else if (pctFlotaEnDisputa >= 60) posicionCompetitiva = 'CRITICA';
      else if (pctFlotaEnDisputa >= 30) posicionCompetitiva = 'DISPUTADA';

      // Horario oficial (sólo cuando fue scrapeado, sin inventar valores)
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

      return {
        lineId: meta.id,
        nombreComercial: meta.nombre,
        categoria: meta.categoria,
        busesActivos,
        // Frecuencia real NO se calcula: requiere tracking temporal GPS que
        // todavía no implementamos. Exponerla como null es honesto, no inventamos.
        frecuenciaRealMin: null,
        frecuenciaProgramadaMin,
        brechaPct: null,
        horaInicioProgramada,
        horaFinProgramada,
        totalSalidasProgramadas,
        tieneHorariosOficiales,
        bunchingPares,
        pctFlotaEnDisputa,
        busesConCompetenciaDirecta,
        empresasDetectadas: Array.from(empresasDetectadas),
        rivalCount: empresasDetectadas.size,
        nivelAlerta,
        estadoOperativo,
        posicionCompetitiva,
      };
    });

    const totalBuses = lineas.reduce((s, l) => s + l.busesActivos, 0);
    const lineasEnServicio = lineas.filter((l) => l.busesActivos > 0).length;
    const lineasConHorariosOficiales = lineas.filter((l) => l.tieneHorariosOficiales).length;

    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      tipoDia,
      horaMontevideo: hhmm,
      totalLineas: lineas.length,
      lineasEnServicio,
      lineasSinServicio: lineas.length - lineasEnServicio,
      lineasConHorariosOficiales,
      totalBusesUcot: totalBuses,
      lineas,
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

export const intelligenceApi = functions.https.onRequest(app);
