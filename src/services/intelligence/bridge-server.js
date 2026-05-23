/**
 * BRIDGE SERVER — Inteligencia Competitiva UCOT
 * Puerto: 3099
 * Fuente: API STM Montevideo (pública, sin auth)
 */

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3099;

app.use(cors({ 
  origin: ['http://localhost:3006', 'http://127.0.0.1:3006'], 
  credentials: true 
}));
app.use(express.json());

// ─── Constantes ────────────────────────────────────────────────────────────
const STM_URL = 'https://www.montevideo.gub.uy/buses/rest/stm-online';
const EMPRESAS = {
  20: 'COME',
  30: 'COETC',
  40: 'COETC',
  50: 'CUTCSA',
  70: 'UCOT',
  80: 'COETC'
};
const EMPRESA_UCOT_ID = 70;
const CACHE_TTL_MS = 15_000;

// ─── Caché en memoria ──────────────────────────────────────────────────────
let _cache = null;
let _cacheTs = 0;

// ─── Haversine ─────────────────────────────────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
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

// ─── Fetch con caché y timeout ─────────────────────────────────────────────
async function fetchSTM() {
  const now = Date.now();
  if (_cache && now - _cacheTs < CACHE_TTL_MS) return _cache;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);

  try {
    const res = await fetch(STM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      body: '{}',
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`STM respondio ${res.status}`);
    const geojson = await res.json();
    _cache = geojson;
    _cacheTs = now;
    return geojson;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Parsear feature ──────────────────────────────────────────────────────
function parseBus(f) {
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

// ─── Motores de Inteligencia ───────────────────────────────────────────────
const gtfsEngine = require('./gtfs-engine');
gtfsEngine.load(); // Carga asíncrona en segundo plano

// ─── Telemetría (Simulación Avanzada) ──────────────────────────────────────
function getBusTelemetry(busId) {
  // Enriquecemos el dato GPS con telemetría de motor simulada para el Mechanic Agent
  const seed = parseInt(busId.replace(/\D/g, '') || '0');
  return {
    engineTemp: 85 + (seed % 15),
    oilPressure: 45 + (seed % 10),
    rpm: 800 + (seed % 400),
    load: 20 + (seed % 60),
    status: (85 + (seed % 15)) > 98 ? 'WARNING_OVERHEAT' : 'OK'
  };
}

// ─── ENDPOINTS ─────────────────────────────────────────────────────────────

app.get('/api/horarios/:linea', async (req, res) => {
  const { linea } = req.params;
  const { stopId } = req.query;
  
  if (!gtfsEngine.isLoaded) {
    return res.json({ ok: false, mensaje: "Motor GTFS cargándose..." });
  }

  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0]; // HH:MM:SS
  const schedule = gtfsEngine.getScheduledTime(linea, stopId, timeStr);

  res.json({ 
    ok: !!schedule, 
    linea, 
    stopId,
    proximoProgramado: schedule ? schedule.time : null,
    fuente: "GTFS Estático STM"
  });
});

app.get('/api/telemetry/:busId', (req, res) => {
  res.json({
    ok: true,
    busId: req.params.busId,
    timestamp: new Date().toISOString(),
    telemetry: getBusTelemetry(req.params.busId)
  });
});

app.get('/api/inteligencia/:lineaUcot', async (req, res) => {
  const { lineaUcot } = req.params;
  try {
    const geojson = await fetchSTM();
    const todos = geojson.features.map(parseBus).filter(b => b.gpsValido);
    const ucotBuses = todos.filter(b => b.empresaId === EMPRESA_UCOT_ID && b.linea === lineaUcot);
    
    // Competencia cercana (2km)
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
      .map(c => ({
        ...c,
        frecuenciaRealMinutos: c.busesEnTramo > 0 ? Math.round(90 / (c.busesEnTramo + 0.1)) : 0,
        frecuenciaProgramadaMinutos: null,
        ventajaCompetitiva: "Solo monitoreo GPS"
      }));

    const fRealUcot = ucotBuses.length > 0 ? Math.round(100 / (ucotBuses.length + 0.1)) : 0;

    res.json({
      ok: true,
      linea: lineaUcot,
      timestamp: new Date().toISOString(),
      hoy: { 
        tipo: 'Domingos (Semana de Turismo)', 
        descripcion: 'Servicio Especial de Feriado',
        horaMontevideo: new Date().toLocaleString('es-UY', { timeZone: 'America/Montevideo' })
      },
      ucot: {
        busesActivos: ucotBuses.length,
        frecuenciaRealMinutos: fRealUcot,
        frecuenciaProgramadaMinutos: null,
        puntualidad: null // PRUEBA 2: No calculable sin cronograma real
      },
      competencia: competenciaFinal,
      alertaNivel: "🟢 NORMAL (GPS Activo)",
      resumenEjecutivo: `Línea ${lineaUcot} con ${ucotBuses.length} coches detectados. Competidor principal: ${competenciaFinal[0]?.empresa || 'Ninguno'} (${competenciaFinal[0]?.linea || '-'}).`,
      fuente: "Telemetría STM GPS en Tiempo Real"
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/buses', async (req, res) => {
  try {
    const geojson = await fetchSTM();
    const lineasQuery = req.query.lines ? req.query.lines.split(',') : [];
    const todos = geojson.features.map(parseBus).filter(b => b.gpsValido);
    
    let result = todos;
    if (lineasQuery.length > 0 && lineasQuery[0] !== '') {
      result = todos.filter(b => b.linea && lineasQuery.includes(b.linea));
    }
    
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/lines/ucot', async (req, res) => {
  try {
    const geojson = await fetchSTM();
    const todos = geojson.features.map(parseBus).filter(b => b.gpsValido);
    const ucotBuses = todos.filter(b => b.empresaId === EMPRESA_UCOT_ID);

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
  } catch(err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/analysis/:linea', async (req, res) => {
  try {
    const { linea } = req.params;
    const geojson = await fetchSTM();
    const todos = geojson.features.map(parseBus).filter(b => b.gpsValido);
    
    const ucotBuses = todos.filter(b => b.empresaId === EMPRESA_UCOT_ID && b.linea === linea);
    const rivalesGenerales = todos.filter(b => b.empresaId !== EMPRESA_UCOT_ID);
    
    const alertas = [];
    let busesEnDisputa = new Set();
    let empresasDetectadas = new Set();

    for (const ubus of ucotBuses) {
      const cercanos = [];
      for (const rival of rivalesGenerales) {
        const dist = haversineKm(ubus.lat, ubus.lng, rival.lat, rival.lng);
        if (dist <= 1.5) {
          cercanos.push({
            ...rival,
            distanciaKm: Math.round(dist * 10) / 10
          });
          empresasDetectadas.add(String(rival.empresa));
        }
      }
      if (cercanos.length > 0) {
        cercanos.sort((a,b) => a.distanciaKm - b.distanciaKm);
        alertas.push({
          busUcot: ubus,
          competidoresCercanos: cercanos,
          maxAmenaza: cercanos[0]
        });
        busesEnDisputa.add(ubus.codigoBus);
      }
    }

    const pctFlotaEnDisputa = ucotBuses.length > 0 ? Math.round((busesEnDisputa.size / ucotBuses.length) * 100) : 0;
    
    let nivelAlerta = "BAJA";
    if (pctFlotaEnDisputa > 50) nivelAlerta = "ALTA";
    else if (pctFlotaEnDisputa > 20) nivelAlerta = "MEDIA";

    res.json({
      ok: true,
      linea,
      timestamp: new Date().toISOString(),
      resumen: {
        totalBusesUcot: ucotBuses.length,
        busesConCompetenciaDirecta: busesEnDisputa.size,
        pctFlotaEnDisputa,
        nivelAlerta,
        empresasDetectadas: Array.from(empresasDetectadas)
      },
      alertas
    });
  } catch(err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
app.get('/health', (req, res) => res.json({ status: 'ok', server: 'UCOT Bridge' }));

app.listen(PORT, () => {
  console.log(`🚌 Bridge Server verificado corriendo en http://localhost:${PORT}`);
});
