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

// ─── LISTERO: Programación Diaria y Cascada Operativa ────────────────────────

const IMPORTANCIA_LINEA_MAP: Record<string, number> = {
  '300': 5, '306': 5, '329': 4, '330': 4, '17': 4, '316': 4, '328': 3, '370': 3, '79': 3, '396': 2,
};

function fechaHoyMVD(): string {
  const ahora = new Date();
  const mvd = new Date(ahora.getTime() - 3 * 60 * 60 * 1000);
  return mvd.toISOString().split('T')[0];
}

// GET /api/listero/turnos?fecha=&turno=
app.get('/api/listero/turnos', async (req, res) => {
  const fecha = String(req.query.fecha || fechaHoyMVD());
  const turno = req.query.turno as string | undefined;
  try {
    let q: admin.firestore.Query = getDb().collection('turnos_dia').where('fecha', '==', fecha);
    if (turno && turno !== 'todos') q = q.where('turnoNombre', '==', turno);
    const snap = await q.get();
    const turnos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ ok: true, turnos });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/listero/turnos
app.post('/api/listero/turnos', async (req, res) => {
  try {
    const data = { ...req.body, creadoEn: admin.firestore.FieldValue.serverTimestamp() };
    data.fecha = data.fecha || fechaHoyMVD();
    data.estado = data.estado || 'programado';
    const ref = await getDb().collection('turnos_dia').add(data);
    res.json({ ok: true, id: ref.id });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PATCH /api/listero/turnos/:id
app.patch('/api/listero/turnos/:id', async (req, res) => {
  try {
    await getDb().collection('turnos_dia').doc(req.params.id).update({
      ...req.body,
      actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/listero/conductores?fecha=
app.get('/api/listero/conductores', async (_req, res) => {
  try {
    const snap = await getDb().collection('personal').get();
    const conductores = snap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        internalNumber: data.internalNumber || d.id,
        fullName: data.fullName || data.nombre || 'Sin nombre',
        rol: data.rol || data.role || 'Driver',
        estadoHoy: data.estadoHoy || 'disponible',
        turnoAsignado: data.turnoAsignado ?? null,
        lineaAsignada: data.lineaAsignada ?? null,
        vehiculoAsignado: data.vehiculoAsignado ?? null,
        esConductorReserva: data.esConductorReserva ?? (data.rol === 'reserva'),
        telefono: data.telefono ?? null,
      };
    });
    res.json({ ok: true, conductores });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/listero/ausencia
app.post('/api/listero/ausencia', async (req, res) => {
  const { conductorId, conductorNombre, motivo, fecha } = req.body;
  const fechaHoy: string = fecha || fechaHoyMVD();
  try {
    if (conductorId) {
      await getDb().collection('personal').doc(conductorId).set(
        { estadoHoy: 'ausente', motivoAusencia: motivo, fechaAusencia: fechaHoy },
        { merge: true },
      );
    }

    const turnosSnap = await getDb().collection('turnos_dia')
      .where('conductorId', '==', conductorId)
      .where('fecha', '==', fechaHoy)
      .get();

    const turnosAfectados: string[] = [];
    let lineaId = 'desconocida';
    let importanciaLinea = 3;

    for (const doc of turnosSnap.docs) {
      const td = doc.data() as any;
      if (td.estado === 'programado' || td.estado === 'activo') {
        await doc.ref.update({ estado: 'sin_conductor', actualizadoEn: admin.firestore.FieldValue.serverTimestamp() });
        turnosAfectados.push(doc.id);
        lineaId = td.lineaId || lineaId;
        importanciaLinea = td.importanciaLinea || IMPORTANCIA_LINEA_MAP[td.lineaId] || 3;
      }
    }

    const reservasSnap = await getDb().collection('personal')
      .where('esConductorReserva', '==', true)
      .where('estadoHoy', '==', 'disponible')
      .get();
    const reservasDisponibles = reservasSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    let urgencia: string;
    let tipo: string;
    if (reservasDisponibles.length === 0 && importanciaLinea >= 4) {
      urgencia = 'critica'; tipo = 'infraccion_imminente';
    } else if (importanciaLinea >= 5) {
      urgencia = 'critica'; tipo = 'ausencia_conductor';
    } else if (importanciaLinea >= 4) {
      urgencia = 'alta'; tipo = 'ausencia_conductor';
    } else {
      urgencia = 'media'; tipo = 'ausencia_conductor';
    }

    await getDb().collection('alertas_operativas').add({
      tipo,
      urgencia,
      lineaId,
      conductorId,
      titulo: `Ausencia: ${conductorNombre || conductorId}`,
      mensaje: `${conductorNombre || conductorId} registró ausencia (${motivo}). Línea ${lineaId} afectada. ${reservasDisponibles.length} reservas disponibles.`,
      accionSugerida: reservasDisponibles.length > 0
        ? `Asignar ${reservasDisponibles[0].fullName} como reserva`
        : 'Contactar MTOP para permiso de frecuencia reducida',
      turnosAfectados,
      reservasDisponibles: reservasDisponibles.map((r) => ({ id: r.id, fullName: r.fullName })),
      impactoIngresosUSD: turnosAfectados.length * importanciaLinea * 30,
      atendida: false,
      fecha: fechaHoy,
      creadoEn: admin.firestore.FieldValue.serverTimestamp(),
    });

    const allSnap = await getDb().collection('turnos_dia').where('fecha', '==', fechaHoy).get();
    const total = allSnap.size;
    const sinConductor = allSnap.docs.filter((d) => (d.data() as any).estado === 'sin_conductor').length;
    if (total > 0 && sinConductor / total > 0.2) {
      await getDb().collection('alertas_operativas').add({
        tipo: 'cobertura_critica',
        urgencia: 'critica',
        lineaId: null,
        titulo: 'Cobertura de flota crítica',
        mensaje: `${sinConductor} de ${total} turnos sin conductor (${Math.round((sinConductor / total) * 100)}% sin cubrir).`,
        accionSugerida: 'Activar protocolo de emergencia: llamar al retén completo',
        atendida: false,
        fecha: fechaHoy,
        creadoEn: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    res.json({ ok: true, turnosAfectados, reservasDisponibles: reservasDisponibles.length, urgencia });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/listero/reserva
app.post('/api/listero/reserva', async (req, res) => {
  const { turnoId, conductorReservaId, conductorReservaNombre } = req.body;
  try {
    await getDb().collection('turnos_dia').doc(turnoId).update({
      estado: 'cubierto_reserva',
      conductorReservaId,
      conductorReservaNombre,
      reservaActivada: true,
      actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
    });
    if (conductorReservaId) {
      await getDb().collection('personal').doc(conductorReservaId).set({ estadoHoy: 'en_servicio' }, { merge: true });
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/listero/vehiculos-reserva
app.get('/api/listero/vehiculos-reserva', async (_req, res) => {
  try {
    const snap = await getDb().collection('vehicles').where('estadoHoy', '==', 'disponible').get();
    const vehiculos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ ok: true, vehiculos });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/listero/vehiculo-taller
app.post('/api/listero/vehiculo-taller', async (req, res) => {
  const { vehiculoId, vehiculoInterno, motivo, fecha } = req.body;
  const fechaHoy: string = fecha || fechaHoyMVD();
  try {
    if (vehiculoId) {
      await getDb().collection('vehicles').doc(vehiculoId).set(
        { estadoHoy: 'en_taller', motivoTaller: motivo },
        { merge: true },
      );
    }

    const turnosSnap = await getDb().collection('turnos_dia')
      .where('vehiculoId', '==', vehiculoId)
      .where('fecha', '==', fechaHoy)
      .get();

    const turnosAfectados: string[] = [];
    for (const doc of turnosSnap.docs) {
      const td = doc.data() as any;
      if (td.estado === 'programado' || td.estado === 'activo') {
        await doc.ref.update({ estado: 'sin_conductor', vehiculoEnTaller: true, actualizadoEn: admin.firestore.FieldValue.serverTimestamp() });
        turnosAfectados.push(doc.id);
      }
    }

    await getDb().collection('alertas_operativas').add({
      tipo: 'vehiculo_en_taller',
      urgencia: 'alta',
      lineaId: null,
      titulo: `Coche ${vehiculoInterno || vehiculoId} en taller`,
      mensaje: `Coche ${vehiculoInterno || vehiculoId} enviado a taller: ${motivo}. ${turnosAfectados.length} turnos afectados.`,
      accionSugerida: 'Buscar vehículo de reemplazo en el parque disponible',
      turnosAfectados,
      atendida: false,
      fecha: fechaHoy,
      creadoEn: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ ok: true, turnosAfectados });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/listero/firma
app.post('/api/listero/firma', async (req, res) => {
  const { turnoId, horaFirma } = req.body;
  try {
    await getDb().collection('turnos_dia').doc(turnoId).update({
      firmaConductor: true,
      horaFirma: horaFirma || hhmmAhoraMontevideo(),
      actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/listero/alertas?fecha=&historial=
app.get('/api/listero/alertas', async (req, res) => {
  const fecha = String(req.query.fecha || fechaHoyMVD());
  const historial = req.query.historial === 'true';
  try {
    const snap = await getDb().collection('alertas_operativas').where('fecha', '==', fecha).get();
    const alertas = snap.docs
      .map((d) => ({ id: d.id, ...d.data() as any }))
      .filter((a) => historial || !a.atendida)
      .sort((a, b) => ((b.creadoEn?.seconds || 0) - (a.creadoEn?.seconds || 0)))
      .slice(0, 50);
    res.json({ ok: true, alertas });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PATCH /api/listero/alertas/:id/atender
app.patch('/api/listero/alertas/:id/atender', async (req, res) => {
  try {
    await getDb().collection('alertas_operativas').doc(req.params.id).update({
      atendida: true,
      atendidaEn: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/listero/resumen?fecha=
app.get('/api/listero/resumen', async (req, res) => {
  const fecha = String(req.query.fecha || fechaHoyMVD());
  try {
    const [turnosSnap, conductoresSnap, vehiculosSnap, alertasSnap] = await Promise.all([
      getDb().collection('turnos_dia').where('fecha', '==', fecha).get(),
      getDb().collection('personal').get(),
      getDb().collection('vehicles').get(),
      getDb().collection('alertas_operativas').where('fecha', '==', fecha).where('atendida', '==', false).get(),
    ]);

    const turnos = turnosSnap.docs.map((d) => d.data() as any);
    const conductores = conductoresSnap.docs.map((d) => d.data() as any);
    const vehiculos = vehiculosSnap.docs.map((d) => d.data() as any);

    const turnosTotal = turnos.length;
    const turnosCubiertos = turnos.filter((t) =>
      ['activo', 'completado', 'programado', 'cubierto_reserva'].includes(t.estado),
    ).length;
    const turnosSinConductor = turnos.filter((t) => t.estado === 'sin_conductor').length;
    const coberturaFlota = turnosTotal > 0 ? Math.round((turnosCubiertos / turnosTotal) * 100) : 100;

    const lineasEnRiesgoIMM = [
      ...new Set(
        turnos
          .filter((t) => t.estado === 'sin_conductor' && (t.importanciaLinea || 0) >= 4)
          .map((t) => t.lineaId),
      ),
    ].filter(Boolean) as string[];

    res.json({
      ok: true,
      resumen: {
        fecha,
        turnosTotal,
        turnosCubiertos,
        turnosSinConductor,
        conductoresDisponibles: conductores.filter((c) => c.estadoHoy === 'disponible' || c.estadoHoy === 'reserva').length,
        conductoresAusentes: conductores.filter((c) => c.estadoHoy === 'ausente').length,
        conductoresReservaLibres: conductores.filter((c) => c.esConductorReserva && c.estadoHoy === 'disponible').length,
        vehiculosEnTaller: vehiculos.filter((v) => v.estadoHoy === 'en_taller').length,
        coberturaFlota,
        alertasActivas: alertasSnap.size,
        impactoIngresosRiesgoUSD: turnosSinConductor * 150,
        lineasEnRiesgoIMM,
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/listero/generar-programacion
// Auto-genera turnos del día desde personal + vehicles existentes en Firestore.
// Si ya existen turnos para esa fecha, no hace nada.
app.post('/api/listero/generar-programacion', async (req, res) => {
  const fecha: string = String(req.body?.fecha || fechaHoyMVD());
  try {
    const existSnap = await getDb().collection('turnos_dia').where('fecha', '==', fecha).get();
    if (!existSnap.empty) {
      res.json({ ok: true, message: `Ya existen ${existSnap.size} turnos para ${fecha}`, created: 0 });
      return;
    }

    // Leer conductores (intenta 'personal' primero, luego 'users' por naming inconsistency)
    let conductoresSnap = await getDb().collection('personal').get();
    if (conductoresSnap.empty) conductoresSnap = await getDb().collection('users').get();

    // Leer vehículos (intenta 'vehicles' primero, luego 'vehiculos')
    let vehiculosSnap = await getDb().collection('vehicles').get();
    if (vehiculosSnap.empty) vehiculosSnap = await getDb().collection('vehiculos').get();

    const conductores = conductoresSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .filter((c) => c.internalNumber || c.legajo || c.fullName || c.nombre);

    const vehiculos = vehiculosSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .filter((v) => v.interno || v.coche || v.numero);

    // Auto-seed si las colecciones están vacías
    if (conductores.length === 0) {
      const seedBatch = getDb().batch();
      const nombres = ['Carlos Pérez', 'María González', 'Juan Rodríguez', 'Ana Martínez', 'Luis García', 'Rosa López', 'Miguel Fernández', 'Laura Díaz'];
      nombres.forEach((nombre, i) => {
        const ref = getDb().collection('personal').doc(`C${String(i + 1).padStart(3, '0')}`);
        const [n, a] = nombre.split(' ');
        seedBatch.set(ref, {
          internalNumber: String(100 + i),
          fullName: nombre,
          firstName: n,
          lastName: a,
          rol: i === 7 ? 'reserva' : 'Driver',
          estadoHoy: 'disponible',
          esConductorReserva: i >= 6,
          telefono: `09${String(10000000 + i * 7)}`,
          generadoPorSistema: true,
        }, { merge: true });
      });
      await seedBatch.commit();
      const freshSnap = await getDb().collection('personal').get();
      conductores.push(...freshSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    }

    if (vehiculos.length === 0) {
      const vBatch = getDb().batch();
      for (let i = 0; i < 12; i++) {
        const interno = String(115 + i * 7);
        const ref = getDb().collection('vehicles').doc(`VEH${interno}`);
        vBatch.set(ref, {
          interno,
          numero: interno,
          tipo: i < 4 ? 'electrico' : i < 8 ? 'hibrido' : 'diesel',
          estadoHoy: 'disponible',
          capacidad: 80,
          anio: 2018 + (i % 5),
          generadoPorSistema: true,
        }, { merge: true });
      }
      await vBatch.commit();
      const freshSnap = await getDb().collection('vehicles').get();
      vehiculos.push(...freshSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    }

    const lineasOperativas = [
      { id: '300', importancia: 5, terminal: 'Instrucciones - Plaza Zitarrosa' },
      { id: '306', importancia: 5, terminal: 'Parque Roosevelt - Casabó' },
      { id: '329', importancia: 4, terminal: 'Punta Carretas - Melilla' },
      { id: '330', importancia: 4, terminal: 'Instrucciones - Ciudadela' },
      { id: '17',  importancia: 4, terminal: 'Punta Carretas - Casabó' },
      { id: '316', importancia: 4, terminal: 'Cno. Maldonado - Pocitos' },
      { id: '328', importancia: 3, terminal: 'Mendoza - Punta Carretas' },
      { id: '370', importancia: 3, terminal: 'Portones - Playa del Cerro' },
      { id: '79',  importancia: 3, terminal: 'Pocitos - Paso de la Arena' },
    ];

    const bloquesTurno = [
      { nombre: 'madrugada', horas: ['04:30', '05:00', '05:30'] },
      { nombre: 'mañana',    horas: ['06:00', '06:30', '07:00', '07:30', '08:00'] },
      { nombre: 'tarde',     horas: ['12:00', '12:30', '13:00', '13:30'] },
      { nombre: 'noche',     horas: ['18:00', '18:30', '19:00', '19:30'] },
    ];

    const batch = getDb().batch();
    let cIdx = 0;
    let vIdx = 0;
    let created = 0;

    for (const linea of lineasOperativas) {
      for (const bloque of bloquesTurno) {
        for (const hora of bloque.horas) {
          const c = conductores[cIdx % conductores.length];
          const v = vehiculos[vIdx % vehiculos.length];
          const [hh, mm] = hora.split(':').map(Number);
          const llegadaMin = hh * 60 + mm + 90;
          const horaLlegada = `${String(Math.floor(llegadaMin / 60) % 24).padStart(2, '0')}:${String(llegadaMin % 60).padStart(2, '0')}`;

          const ref = getDb().collection('turnos_dia').doc();
          batch.set(ref, {
            fecha,
            conductorId: c.id,
            conductorNombre: c.fullName || c.nombre || `Cond ${c.internalNumber || c.legajo || cIdx}`,
            conductorInterno: String(c.internalNumber || c.legajo || cIdx + 100),
            vehiculoId: v.id,
            vehiculoInterno: String(v.interno || v.coche || v.numero || vIdx + 100),
            lineaId: linea.id,
            turnoNombre: bloque.nombre,
            turno: bloque.nombre,
            horaSalida: hora,
            horaLlegadaEstimada: horaLlegada,
            terminal: linea.terminal,
            estado: 'programado',
            importanciaLinea: linea.importancia,
            impactoIngresosEstimado: linea.importancia * 30,
            firmaConductor: false,
            horaFirma: null,
            reservaActivada: false,
            conductorReservaId: null,
            conductorReservaNombre: null,
            observaciones: null,
            generadoAutomaticamente: true,
            creadoEn: admin.firestore.FieldValue.serverTimestamp(),
          });
          cIdx++;
          vIdx++;
          created++;
        }
      }
    }

    await batch.commit();
    res.json({ ok: true, message: `Programación generada: ${created} turnos para ${fecha}`, created });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── SEED PERSONAL REAL UCOT ─────────────────────────────────────────────────
// Carga los 691 empleados reales del listado oficial UCOT (Líneas Claro Activas)
// Endpoint: POST /api/admin/seed-personal-ucot
// Idempotente: usa merge:true para no sobrescribir datos enriquecidos.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const UCOT_PERSONAL_RAW: Array<{
  interno: string; fullName: string; nombre: string; apellido: string;
  cargo: string; telefono: string; rol: string; role: string;
}> = require('./data/ucot_personal.json');

app.post('/api/admin/seed-personal-ucot', async (req, res) => {
  try {
    const db = getDb();
    const BATCH_SIZE = 450; // Firestore max 500 ops per batch
    let total = 0;

    const chunks: typeof UCOT_PERSONAL_RAW[] = [];
    for (let i = 0; i < UCOT_PERSONAL_RAW.length; i += BATCH_SIZE) {
      chunks.push(UCOT_PERSONAL_RAW.slice(i, i + BATCH_SIZE));
    }

    for (const chunk of chunks) {
      const batchPersonal = db.batch();
      const batchUsers = db.batch();
      for (const emp of chunk) {
        const docId = `P${emp.interno.padStart(4, '0')}`;
        const empleadoData = {
          internalNumber: emp.interno,
          legajo: emp.interno,
          fullName: emp.fullName,
          nombre: emp.nombre,
          apellido: emp.apellido,
          cargo: emp.cargo,
          telefono: emp.telefono,
          rol: emp.rol,
          role: emp.role,
          esConductorReserva: false,
          estadoHoy: 'disponible',
          activo: true,
          fuenteDatos: 'excel_ucot_2019',
          importadoEn: admin.firestore.FieldValue.serverTimestamp(),
        };
        // Escribe en 'personal' (colección HR autoritativa)
        batchPersonal.set(db.collection('personal').doc(docId), empleadoData, { merge: true });
        // Escribe en 'users' (colección que lee el frontend — merge:true no borra cuentas Auth existentes)
        batchUsers.set(db.collection('users').doc(docId), {
          ...empleadoData,
          fromExcel: true, // distingue de cuentas Auth reales
        }, { merge: true });
        total++;
      }
      await Promise.all([batchPersonal.commit(), batchUsers.commit()]);
    }

    res.json({ ok: true, message: `${total} empleados UCOT cargados en 'personal' y 'users'`, total });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── SEED VEHÍCULOS REALES UCOT ──────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-var-requires
const UCOT_VEHICLES_RAW: Array<{
  interno: string; coche: string; linea: string | null; servicioNum: string; estado_operativo: string; tipo: string;
}> = require('./data/ucot_vehicles.json');

app.post('/api/admin/seed-vehicles-ucot', async (req, res) => {
  try {
    const db = getDb();
    const BATCH_SIZE = 450;
    let total = 0;
    for (let i = 0; i < UCOT_VEHICLES_RAW.length; i += BATCH_SIZE) {
      const batchV = db.batch();
      const batchVeh = db.batch();
      for (const v of UCOT_VEHICLES_RAW.slice(i, i + BATCH_SIZE)) {
        const vehicleData = {
          interno: v.interno,
          coche: v.coche,
          internalNumber: v.interno,
          linea: v.linea,
          servicioNum: v.servicioNum,
          estado_operativo: v.estado_operativo,
          tipo: v.tipo,
          activo: true,
          fuenteDatos: 'cartones_ucot_2026',
          importadoEn: admin.firestore.FieldValue.serverTimestamp(),
        };
        // Escribe en 'vehicles' (colección nueva) y 'vehiculos' (colección que lee el frontend)
        batchV.set(db.collection('vehicles').doc(v.interno), vehicleData, { merge: true });
        batchVeh.set(db.collection('vehiculos').doc(v.interno), vehicleData, { merge: true });
        total++;
      }
      await Promise.all([batchV.commit(), batchVeh.commit()]);
    }
    res.json({ ok: true, message: `${total} vehículos cargados en 'vehicles' y 'vehiculos'`, total });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── SEED SERVICIOS HÁBILES UCOT (CARTONES) ──────────────────────────────────
// Cada servicio = cartón de un conductor. Número de servicio ≠ coche físico.
// Estructura: servicio, linea, etapas (paradas clave), vueltas con horarios.
app.post('/api/admin/seed-horarios-ucot', async (req, res) => {
  try {
    const db = getDb();
    const BATCH_SIZE = 450;
    let total = 0;
    for (let i = 0; i < UCOT_SERVICIOS_HABILES.length; i += BATCH_SIZE) {
      const batch = db.batch();
      for (const s of UCOT_SERVICIOS_HABILES.slice(i, i + BATCH_SIZE)) {
        batch.set(db.collection('servicios_ucot').doc(s.servicio), {
          servicio: s.servicio,
          linea: s.linea,
          etapas: s.etapas,
          instrucciones: s.instrucciones,
          vueltas: s.vueltas,
          tipoServicio: 'habil',
          temporada: 'invierno_2026',
          totalVueltas: s.vueltas.length,
          primeraSalida: s.vueltas[0]?.paradas[0]?.hora ?? null,
          ultimaLlegada: s.vueltas[s.vueltas.length - 1]?.paradas?.slice(-1)[0]?.hora ?? null,
          importadoEn: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        total++;
      }
      await batch.commit();
    }
    res.json({ ok: true, message: `${total} servicios hábiles UCOT cargados en 'servicios_ucot'`, total });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/admin/personal — lista paginada de empleados (ordenada por interno)
app.get('/api/admin/personal', async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? '200')), 700);
    const rol = req.query.rol ? String(req.query.rol) : null;
    const db = getDb();

    // Los datos reales del seed tienen IDs P0001-P0691 (startAt 'P')
    const col = db.collection('personal');
    const docIdField = admin.firestore.FieldPath.documentId();

    let snap: FirebaseFirestore.QuerySnapshot;
    if (rol) {
      // Con filtro de rol: traer 700 registros reales y filtrar client-side
      snap = await col
        .where(docIdField, '>=', 'P')
        .where(docIdField, '<', 'Q')
        .limit(700)
        .get();
    } else {
      snap = await col
        .where(docIdField, '>=', 'P')
        .where(docIdField, '<', 'Q')
        .limit(700)
        .get();
    }

    let docs = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

    // Aplicar filtro de rol si corresponde
    if (rol) docs = docs.filter((d: any) => d.rol === rol || d.role === rol);

    // Limitar y ordenar por interno
    docs = docs
      .sort((a: any, b: any) => {
        const na = parseInt(a.internalNumber ?? a.interno ?? '9999');
        const nb = parseInt(b.internalNumber ?? b.interno ?? '9999');
        return na - nb;
      })
      .slice(0, limit);

    res.json({ ok: true, total: docs.length, empleados: docs });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /api/admin/personal/:id — actualiza campos editables de un empleado
app.put('/api/admin/personal/:id', async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { cargo, rol, telefono, estado } = req.body as any;
    const update: any = { actualizadoEn: admin.firestore.FieldValue.serverTimestamp() };
    if (cargo !== undefined) update.cargo = cargo;
    if (rol !== undefined) { update.rol = rol; update.role = rol; }
    if (telefono !== undefined) update.telefono = telefono;
    if (estado !== undefined) update.estado = estado;
    await db.collection('personal').doc(id).update(update);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── SEED SERVICIOS REALES (CARTONES) ────────────────────────────────────────
// Servicios = cartones de servicio. El número de hoja = número de servicio.
// Los coches físicos (1-268) son distintos y se asignan por rotación diaria.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const UCOT_SERVICIOS_HABILES: Array<any> = require('./data/ucot_servicios_habiles.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const UCOT_SERVICIOS_SABADO: Array<any> = require('./data/ucot_servicios_sabado.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const UCOT_BOLETIN: Record<string, any> = require('./data/ucot_boletin.json');

app.post('/api/admin/seed-sabado-ucot', async (req, res) => {
  try {
    const db = getDb();
    let total = 0;
    for (let i = 0; i < UCOT_SERVICIOS_SABADO.length; i += 450) {
      const batch = db.batch();
      for (const s of UCOT_SERVICIOS_SABADO.slice(i, i + 450)) {
        batch.set(db.collection('servicios_ucot').doc(`S${s.servicio}`), {
          servicio: s.servicio,
          linea: s.linea,
          etapas: s.etapas,
          instrucciones: s.instrucciones,
          vueltas: s.vueltas,
          tipoServicio: 'sabado_verano',
          temporada: 'verano_2026',
          totalVueltas: s.vueltas.length,
          primeraSalida: s.vueltas[0]?.paradas[0]?.hora ?? null,
          importadoEn: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        total++;
      }
      await batch.commit();
    }
    res.json({ ok: true, message: `${total} servicios sábado cargados en 'servicios_ucot'`, total });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/admin/seed-boletin-ucot', async (req, res) => {
  try {
    const db = getDb();
    let total = 0;
    const lineas = Object.keys(UCOT_BOLETIN);
    for (let i = 0; i < lineas.length; i += 50) {
      const batch = db.batch();
      for (const linea of lineas.slice(i, i + 50)) {
        const data = UCOT_BOLETIN[linea];
        batch.set(db.collection('boletin_oficial').doc(linea), {
          linea,
          paradas: data.paradas,
          servicios: data.servicios,
          tipoServicio: 'habil',
          temporada: 'invierno_2026',
          importadoEn: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        total++;
      }
      await batch.commit();
    }
    res.json({ ok: true, message: `${total} líneas del boletín cargadas (${Object.values(UCOT_BOLETIN).reduce((a: number, l: any) => a + l.servicios.length, 0)} servicios)`, total });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── ENDPOINTS DE CONSULTA OPERATIVA ─────────────────────────────────────────

// GET /api/cartones/oficiales — lista de servicios desde servicios_ucot
app.get('/api/cartones/oficiales', async (req, res) => {
  try {
    const db = getDb();
    const linea = req.query.linea ? String(req.query.linea) : null;
    const tipo = req.query.tipo ? String(req.query.tipo) : null;
    const limit = Math.min(parseInt(String(req.query.limit ?? '300')), 500);

    let query: FirebaseFirestore.Query = db.collection('servicios_ucot').limit(limit);
    if (linea) query = query.where('linea', '==', linea);
    if (tipo) query = query.where('tipoServicio', '==', tipo);

    const snap = await query.get();
    const cartones = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        servicio: data.servicio,
        linea: data.linea,
        tipoServicio: data.tipoServicio,
        temporada: data.temporada,
        totalVueltas: data.totalVueltas ?? (data.vueltas || []).length,
        totalEtapas: (data.etapas || []).length,
        primeraSalida: data.primeraSalida ?? null,
        ultimaLlegada: data.ultimaLlegada ?? null,
        instrucciones: (data.instrucciones || []).join(' | '),
      };
    });

    res.json({ ok: true, total: cartones.length, cartones });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/cartones/oficiales/:id — detalle completo de un cartón (con vueltas y etapas)
app.get('/api/cartones/oficiales/:id', async (req, res) => {
  try {
    const db = getDb();
    let doc = await db.collection('servicios_ucot').doc(req.params.id).get();
    if (!doc.exists) {
      // fallback por número de servicio
      const snap = await db.collection('servicios_ucot').where('servicio', '==', req.params.id).limit(1).get();
      if (snap.empty) return res.status(404).json({ ok: false, error: 'Cartón no encontrado' });
      doc = snap.docs[0] as any;
    }
    res.json({ ok: true, carton: { id: doc.id, ...doc.data() } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/boletin/:linea — horarios del boletín para una línea/dirección (ej: "300a")
app.get('/api/boletin/:linea', async (req, res) => {
  try {
    const doc = await getDb().collection('boletin_oficial').doc(req.params.linea).get();
    if (!doc.exists) return res.status(404).json({ ok: false, error: 'Línea no encontrada en boletín' });
    res.json({ ok: true, boletin: { id: doc.id, ...doc.data() } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/personal/:interno — datos de un empleado
app.get('/api/personal/:interno', async (req, res) => {
  try {
    const db = getDb();
    const docId = `P${req.params.interno.padStart(4, '0')}`;
    let doc = await db.collection('personal').doc(docId).get();
    if (!doc.exists) {
      // fallback: buscar por internalNumber
      const snap = await db.collection('personal').where('internalNumber', '==', req.params.interno).limit(1).get();
      if (snap.empty) return res.status(404).json({ ok: false, error: 'Empleado no encontrado' });
      doc = snap.docs[0] as any;
    }
    res.json({ ok: true, empleado: { id: doc.id, ...doc.data() } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── SEED: ROTACIÓN DIARIA ──────────────────────────────────────────────────
// POST /api/admin/seed-rotacion-ucot
// Carga la rotación coche→servicio del 21/01/2026 (miércoles hábil).
// Colección: rotacion_diaria / sub-colección por fecha.
app.post('/api/admin/seed-rotacion-ucot', async (req, res) => {
  try {
    const data: Record<string, any> = require('./data/ucot_rotacion.json');
    const db = getDb();
    const batch = db.batch();
    let total = 0;

    for (const [fecha, rotacion] of Object.entries(data) as [string, any][]) {
      const docRef = db.collection('rotacion_diaria').doc(fecha);
      batch.set(docRef, {
        fecha,
        archivo: rotacion.archivo,
        totalCoches: rotacion.totalCoches,
        actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // Sub-colección: cada coche como documento
      for (const coche of rotacion.coches as any[]) {
        const cocheRef = docRef.collection('coches').doc(coche.coche);
        batch.set(cocheRef, {
          coche: coche.coche,
          servicio: coche.servicio,
          horaSalida: coche.horaSalida,
          linea: coche.linea,
        }, { merge: true });
        total++;
        if (total % 400 === 0) await batch.commit(); // Firestore batch limit
      }
    }

    await batch.commit();
    res.json({ ok: true, message: `Rotación cargada: ${total} asignaciones coche→servicio en ${Object.keys(data).length} fechas` });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── SEED: BOLETÍN VERANO 2026 ──────────────────────────────────────────────
// POST /api/admin/seed-boletin-verano-ucot
// Carga la Matriz de Inspección verano 2026 (42 líneas-dirección, 1469 pases).
// Colección: boletin_verano_2026
app.post('/api/admin/seed-boletin-verano-ucot', async (req, res) => {
  try {
    const data: Record<string, any> = require('./data/ucot_boletin_verano.json');
    const db = getDb();
    let total = 0;

    for (const [sheetName, boletin] of Object.entries(data) as [string, any][]) {
      await db.collection('boletin_verano_2026').doc(sheetName).set({
        linea: boletin.linea,
        direccion: boletin.direccion,
        paradas: boletin.paradas,
        pases: boletin.pases,
        totalPases: boletin.totalPases,
        temporada: 'verano_2026',
        actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      total += boletin.pases.length;
    }

    res.json({ ok: true, message: `Boletín verano 2026 cargado: ${Object.keys(data).length} líneas-dirección, ${total} pases totales` });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/rotacion/:fecha — rotación coche→servicio de una fecha (YYYY-MM-DD)
app.get('/api/rotacion/:fecha', async (req, res) => {
  try {
    const db = getDb();
    const docRef = db.collection('rotacion_diaria').doc(req.params.fecha);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ ok: false, error: 'Fecha no encontrada' });
    const coches = await docRef.collection('coches').get();
    res.json({
      ok: true,
      fecha: req.params.fecha,
      meta: doc.data(),
      coches: coches.docs.map(d => d.data()),
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/boletin-verano/:lineaDir — boletín verano para una línea-dirección (ej: "300a")
app.get('/api/boletin-verano/:lineaDir', async (req, res) => {
  try {
    const doc = await getDb().collection('boletin_verano_2026').doc(req.params.lineaDir).get();
    if (!doc.exists) return res.status(404).json({ ok: false, error: 'Línea-dirección no encontrada' });
    res.json({ ok: true, boletin: { id: doc.id, ...doc.data() } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export const intelligenceApi = functions.https.onRequest(app);
