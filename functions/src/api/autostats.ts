/**
 * /api/autostats/* — GPS + GTFS sin inspectores
 *
 * Endpoints que leen `vehicle_events` (datos GPS crudos) + archivos GTFS
 * indexados para producir estadísticas de cumplimiento y operación.
 *
 * Extraído de `intelligenceApi.ts` el 2026-04-24 como parte de la división
 * por dominio (ADR 003).
 */
import * as admin from 'firebase-admin';
import type { Express } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gunzipAsync = promisify(zlib.gunzip);
const getDb = () => admin.firestore();

const AS_AGENCY_NAMES: Record<string, string> = {
  '10': 'COETC', '20': 'COME', '50': 'CUTCSA', '70': 'UCOT',
};
const AS_DATA_DIR = path.join(__dirname, '..', 'data', 'gtfs');

let _asSchedule: any = null;
function asSchedule() {
  if (!_asSchedule) _asSchedule = JSON.parse(fs.readFileSync(path.join(AS_DATA_DIR, 'schedule_index.json'), 'utf8'));
  return _asSchedule;
}
let _asRoutes: any = null;
function asRoutes() {
  if (!_asRoutes) _asRoutes = JSON.parse(fs.readFileSync(path.join(AS_DATA_DIR, 'routes_by_agency.json'), 'utf8'));
  return _asRoutes;
}

/**
 * Registra todas las rutas de /api/autostats/* en la app Express provista.
 * Se llama desde `intelligenceApi.ts` para mantener una única Cloud Function.
 */
export function registerAutostatsRoutes(app: Express) {
  // GET /api/autostats/agencies
  app.get('/api/autostats/agencies', async (_req, res) => {
    try {
      const r = asRoutes();
      const agencies = Object.keys(AS_AGENCY_NAMES).map(id => ({
        id, name: AS_AGENCY_NAMES[id],
        routes: Object.keys(r[id]?.routes ?? {}),
      }));
      res.json({ ok: true, agencies });
    } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // GET /api/autostats/routes/:agencyId
  app.get('/api/autostats/routes/:agencyId', async (req, res) => {
    try {
      const { agencyId } = req.params;
      const s = asSchedule();
      const agency = s[agencyId];
      if (!agency) return res.status(404).json({ ok: false, error: 'Agencia no encontrada' });
      const routes = Object.entries(agency.routes).map(([route, info]: [string, any]) => ({
        route, longName: info.route_long_name ?? route,
        totalHabiles: info.habiles?.length ?? 0,
        totalSabados: info.sabados?.length ?? 0,
        totalDomingos: info.domingos?.length ?? 0,
      }));
      res.json({ ok: true, agencyId, routes });
    } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // GET /api/autostats/compliance/:agencyId — snapshot en vivo desde Firestore (últimos 25 min)
  app.get('/api/autostats/compliance/:agencyId', async (req, res) => {
    try {
      const { agencyId } = req.params;
      const db = getDb();
      const since = new Date(Date.now() - 25 * 60 * 1000);
      const snap = await db.collection('vehicle_events')
        .where('agencyId', '==', agencyId)
        .where('timestampGPS', '>=', since.toISOString())
        .orderBy('timestampGPS', 'desc')
        .limit(500)
        .get();

      // Un registro por bus (el más reciente)
      const busMap = new Map<string, any>();
      for (const doc of snap.docs) {
        const d = doc.data();
        if (!busMap.has(d.idBus)) busMap.set(d.idBus, d);
      }
      const buses = Array.from(busMap.values()).map(d => ({
        idBus: d.idBus, linea: d.linea, empresa: d.empresa, agencyId: d.agencyId,
        lat: d.lat, lon: d.lon, velocidad: d.velocidad,
        estadoCumplimiento: d.estadoCumplimiento, desviacionMin: d.desviacionMin,
        proximaParadaControl: d.proximaParada ? { name: d.proximaParada, desc: '', lat: 0, lon: 0, arrival: '' } : null,
        distanciaParadaKm: null, timestampGPS: d.timestampGPS,
      }));

      // Resumen por línea
      const summary: Record<string, any> = {};
      for (const b of buses) {
        if (!summary[b.linea]) summary[b.linea] = { linea: b.linea, busesActivos: 0, enTiempo: 0, atrasados: 0, adelantados: 0, sinHorario: 0, pctCumplimiento: 0 };
        const s = summary[b.linea];
        s.busesActivos++;
        if (b.estadoCumplimiento === 'EN_TIEMPO') s.enTiempo++;
        else if (b.estadoCumplimiento === 'ATRASADO') s.atrasados++;
        else if (b.estadoCumplimiento === 'ADELANTADO') s.adelantados++;
        else s.sinHorario++;
      }
      for (const s of Object.values(summary) as any[]) {
        s.pctCumplimiento = s.busesActivos > 0 ? Math.round(((s.enTiempo + s.adelantados) / s.busesActivos) * 100) : 0;
      }

      res.json({ ok: true, agencyId, timestamp: new Date().toISOString(), totalBuses: buses.length, summary, buses });
    } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // GET /api/autostats/vehicle/:idBus — historial de un bus específico
  app.get('/api/autostats/vehicle/:idBus', async (req, res) => {
    try {
      const { idBus } = req.params;
      const days = Math.min(30, parseInt(req.query.days as string ?? '7', 10));
      const db = getDb();
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const snap = await db.collection('vehicle_events')
        .where('idBus', '==', idBus)
        .where('timestampGPS', '>=', since.toISOString())
        .orderBy('timestampGPS', 'desc')
        .limit(2000)
        .get();

      if (snap.empty) return res.json({ ok: true, idBus, days, summary: null, history: [] });

      const history = snap.docs.map(d => {
        const ev = d.data();
        return {
          idBus: ev.idBus, linea: ev.linea, empresa: ev.empresa,
          velocidad: ev.velocidad, estadoCumplimiento: ev.estadoCumplimiento,
          desviacionMin: ev.desviacionMin, proximaParada: ev.proximaParada,
          timestampGPS: ev.timestampGPS,
        };
      });

      const total = history.length;
      const enTiempo = history.filter(h => h.estadoCumplimiento === 'EN_TIEMPO').length;
      const atrasado = history.filter(h => h.estadoCumplimiento === 'ATRASADO').length;
      const adelantado = history.filter(h => h.estadoCumplimiento === 'ADELANTADO').length;
      const sinHorario = history.filter(h => h.estadoCumplimiento === 'SIN_HORARIO').length;
      const velocidades = history.map(h => h.velocidad).filter(v => v > 0);
      const desviaciones = history.map(h => h.desviacionMin).filter(v => v !== null) as number[];
      const lineas = [...new Set(history.map(h => h.linea))];

      const summary = {
        idBus, empresa: history[0]?.empresa ?? '', lineasOperadas: lineas, totalEventos: total,
        velocidadMedia: velocidades.length ? Math.round(velocidades.reduce((a, b) => a + b, 0) / velocidades.length) : 0,
        pctEnTiempo: Math.round((enTiempo / total) * 100),
        pctAtrasado: Math.round((atrasado / total) * 100),
        pctAdelantado: Math.round((adelantado / total) * 100),
        pctSinHorario: Math.round((sinHorario / total) * 100),
        ultimaActividad: history[0]?.timestampGPS ?? null,
        primeraActividad: history[history.length - 1]?.timestampGPS ?? null,
        desviacionMediaMin: desviaciones.length ? Math.round(desviaciones.reduce((a, b) => a + b, 0) / desviaciones.length * 10) / 10 : null,
      };

      res.json({ ok: true, idBus, days, summary, history });
    } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // GET /api/autostats/history/:agencyId — estadísticas históricas por línea
  app.get('/api/autostats/history/:agencyId', async (req, res) => {
    try {
      const { agencyId } = req.params;
      const days = Math.min(30, parseInt((req.query.days as string) ?? '7', 10));
      const db = getDb();
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const snap = await db.collection('vehicle_events')
        .where('agencyId', '==', agencyId)
        .where('timestampGPS', '>=', since)
        .orderBy('timestampGPS', 'desc')
        .limit(5000)
        .get();

      const byLine: Record<string, {
        buses: Set<string>; eventos: number;
        enTiempo: number; atrasado: number; adelantado: number; sinHorario: number;
        desviaciones: number[]; velocidades: number[]; ultimaActividad: string | null;
      }> = {};

      snap.docs.forEach(d => {
        const e = d.data();
        if (!byLine[e.linea]) {
          byLine[e.linea] = { buses: new Set(), eventos: 0, enTiempo: 0, atrasado: 0, adelantado: 0, sinHorario: 0, desviaciones: [], velocidades: [], ultimaActividad: null };
        }
        const l = byLine[e.linea];
        l.buses.add(e.idBus);
        l.eventos++;
        if (e.estadoCumplimiento === 'EN_TIEMPO') l.enTiempo++;
        else if (e.estadoCumplimiento === 'ATRASADO') l.atrasado++;
        else if (e.estadoCumplimiento === 'ADELANTADO') l.adelantado++;
        else l.sinHorario++;
        if (e.desviacionMin != null) l.desviaciones.push(e.desviacionMin);
        if (e.velocidad > 0) l.velocidades.push(e.velocidad);
        if (!l.ultimaActividad || e.timestampGPS > l.ultimaActividad) l.ultimaActividad = e.timestampGPS;
      });

      const lines = Object.entries(byLine).map(([linea, l]) => {
        const con = l.enTiempo + l.atrasado + l.adelantado;
        return {
          linea, totalEventos: l.eventos, busesUnicos: l.buses.size,
          pctEnTiempo:    con > 0 ? Math.round((l.enTiempo  / con) * 100) : 0,
          pctAtrasado:    con > 0 ? Math.round((l.atrasado   / con) * 100) : 0,
          pctAdelantado:  con > 0 ? Math.round((l.adelantado / con) * 100) : 0,
          pctSinHorario:  l.eventos > 0 ? Math.round((l.sinHorario / l.eventos) * 100) : 0,
          desviacionMediaMin: l.desviaciones.length > 0
            ? Math.round(l.desviaciones.reduce((a, b) => a + b, 0) / l.desviaciones.length * 10) / 10 : null,
          velocidadMedia: l.velocidades.length > 0
            ? Math.round(l.velocidades.reduce((a, b) => a + b, 0) / l.velocidades.length) : 0,
          ultimaActividad: l.ultimaActividad,
        };
      }).sort((a, b) => b.totalEventos - a.totalEventos);

      res.json({ ok: true, agencyId, days, lines });
    } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // GET /api/autostats/health — estado del endpoint GPS
  app.get('/api/autostats/health', async (_req, res) => {
    try {
      const db = getDb();
      const doc = await db.collection('system_status').doc('stm_gps').get();
      if (!doc.exists) {
        return res.json({ health: { status: 'UNKNOWN', lastCheck: null, downSince: null, upSince: null, consecutiveFailures: 0, lastSuccessfulCollection: null } });
      }
      const d = doc.data()!;
      const toISO = (v: any) => v?.toDate?.()?.toISOString?.() ?? null;
      res.json({ health: { status: d.status ?? 'UNKNOWN', lastCheck: toISO(d.lastCheck), downSince: toISO(d.downSince), upSince: toISO(d.upSince), consecutiveFailures: d.consecutiveFailures ?? 0, lastSuccessfulCollection: toISO(d.lastSuccessfulCollection) } });
    } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // GET /api/autostats/archives — lista de semanas archivadas en Storage
  app.get('/api/autostats/archives', async (_req, res) => {
    try {
      const bucket = admin.storage().bucket();
      const [files] = await bucket.getFiles({ prefix: 'archives/vehicle_events' });
      const archives = files
        .filter(f => f.name.endsWith('.json.gz'))
        .map(f => ({
          file: f.name,
          week: f.name.replace('archives/vehicle_events/', '').replace('.json.gz', ''),
          sizeKb: Math.round(Number(f.metadata.size ?? 0) / 1024),
        }))
        .sort((a, b) => b.week.localeCompare(a.week));
      res.json({ ok: true, archives, total: archives.length });
    } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // GET /api/autostats/archive/:week — stats agregadas de una semana archivada
  app.get('/api/autostats/archive/:week', async (req, res) => {
    try {
      const { week } = req.params;
      const agencyId = req.query.agencyId as string | undefined;

      const bucket = admin.storage().bucket();
      const file = bucket.file(`archives/vehicle_events/${week}.json.gz`);
      const [exists] = await file.exists();
      if (!exists) return res.status(404).json({ ok: false, error: 'Archivo no encontrado' });

      const [compressed] = await file.download();
      const raw = await gunzipAsync(compressed);
      const records = JSON.parse(raw.toString('utf8')) as Array<{
        id: string; idBus: string; agencyId: string; empresa: string; linea: string;
        velocidad: number; estado: string; desviacion: number | null; ts: string;
      }>;

      const filtered = agencyId ? records.filter(r => r.agencyId === agencyId) : records;

      const byLine: Record<string, {
        buses: Set<string>; eventos: number;
        enTiempo: number; atrasado: number; adelantado: number; sinHorario: number;
        desviaciones: number[]; velocidades: number[];
      }> = {};

      for (const r of filtered) {
        if (!byLine[r.linea]) byLine[r.linea] = { buses: new Set(), eventos: 0, enTiempo: 0, atrasado: 0, adelantado: 0, sinHorario: 0, desviaciones: [], velocidades: [] };
        const l = byLine[r.linea];
        l.buses.add(r.idBus);
        l.eventos++;
        if (r.estado === 'EN_TIEMPO')   l.enTiempo++;
        else if (r.estado === 'ATRASADO')   l.atrasado++;
        else if (r.estado === 'ADELANTADO') l.adelantado++;
        else l.sinHorario++;
        if (r.desviacion != null) l.desviaciones.push(r.desviacion);
        if (r.velocidad > 0) l.velocidades.push(r.velocidad);
      }

      const lines = Object.entries(byLine).map(([linea, l]) => {
        const con = l.enTiempo + l.atrasado + l.adelantado;
        return {
          linea,
          totalEventos: l.eventos,
          busesUnicos: l.buses.size,
          pctEnTiempo:    con > 0 ? Math.round((l.enTiempo  / con) * 100) : 0,
          pctAtrasado:    con > 0 ? Math.round((l.atrasado   / con) * 100) : 0,
          pctAdelantado:  con > 0 ? Math.round((l.adelantado / con) * 100) : 0,
          pctSinHorario:  l.eventos > 0 ? Math.round((l.sinHorario / l.eventos) * 100) : 0,
          desviacionMediaMin: l.desviaciones.length > 0
            ? Math.round(l.desviaciones.reduce((a, b) => a + b, 0) / l.desviaciones.length * 10) / 10 : null,
          velocidadMedia: l.velocidades.length > 0
            ? Math.round(l.velocidades.reduce((a, b) => a + b, 0) / l.velocidades.length) : 0,
          ultimaActividad: null,
        };
      }).sort((a, b) => b.totalEventos - a.totalEventos);

      res.json({ ok: true, week, agencyId: agencyId ?? 'all', totalRecords: filtered.length, lines });
    } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // GET /api/autostats/fleet-ranking/:agencyId — ranking de coches por cumplimiento
  // ?days=7 (máx 14) &offset=0 (máx 30, desplazamiento en días hacia atrás).
  // offset=7 devuelve el período anterior (para calcular tendencia semana a semana).
  app.get('/api/autostats/fleet-ranking/:agencyId', async (req, res) => {
    try {
      const { agencyId } = req.params;
      const days   = Math.min(14, parseInt((req.query.days   as string) ?? '7',  10));
      const offset = Math.min(30, parseInt((req.query.offset as string) ?? '0', 10));
      const db = getDb();
      const now = Date.now();
      const since = new Date(now - (days + offset) * 24 * 60 * 60 * 1000).toISOString();
      const until = offset > 0
        ? new Date(now - offset * 24 * 60 * 60 * 1000).toISOString()
        : null;

      let q = db.collection('vehicle_events')
        .where('agencyId', '==', agencyId)
        .where('timestampGPS', '>=', since)
        .orderBy('timestampGPS', 'desc');
      if (until) q = (q as any).where('timestampGPS', '<', until);

      const snap = await q.limit(4000).get();

      type BusAcc = {
        empresa: string; lineas: Set<string>;
        total: number; enTiempo: number; atrasado: number; adelantado: number;
        desviaciones: number[]; velocidades: number[];
        ultima: string | null; primera: string | null;
      };
      const byBus: Record<string, BusAcc> = {};

      snap.docs.forEach(d => {
        const e = d.data();
        const id: string = e.idBus;
        if (!byBus[id]) {
          byBus[id] = {
            empresa: e.empresa ?? e.codigoEmpresa ?? agencyId,
            lineas: new Set(),
            total: 0, enTiempo: 0, atrasado: 0, adelantado: 0,
            desviaciones: [], velocidades: [],
            ultima: e.timestampGPS ?? null, primera: e.timestampGPS ?? null,
          };
        }
        const b = byBus[id];
        if (e.linea) b.lineas.add(String(e.linea));
        b.total++;
        if (e.estadoCumplimiento === 'EN_TIEMPO') b.enTiempo++;
        else if (e.estadoCumplimiento === 'ATRASADO') b.atrasado++;
        else if (e.estadoCumplimiento === 'ADELANTADO') b.adelantado++;
        if (typeof e.desviacionMin === 'number') b.desviaciones.push(e.desviacionMin);
        if (typeof e.velocidad === 'number' && e.velocidad > 0) b.velocidades.push(e.velocidad);
        if (e.timestampGPS && e.timestampGPS < (b.primera ?? e.timestampGPS)) b.primera = e.timestampGPS;
      });

      const MIN_EVENTOS = 3;
      const vehicles = Object.entries(byBus)
        .filter(([, b]) => b.total >= MIN_EVENTOS)
        .map(([idBus, b]) => {
          const con = b.enTiempo + b.atrasado + b.adelantado;
          return {
            idBus,
            empresa: b.empresa,
            lineasOperadas: [...b.lineas].sort(),
            totalEventos: b.total,
            pctEnTiempo:   con > 0 ? Math.round((b.enTiempo  / con) * 100) : 0,
            pctAtrasado:   con > 0 ? Math.round((b.atrasado   / con) * 100) : 0,
            pctAdelantado: con > 0 ? Math.round((b.adelantado / con) * 100) : 0,
            pctSinHorario: b.total > 0 ? Math.round(((b.total - con) / b.total) * 100) : 0,
            desviacionMediaMin: b.desviaciones.length
              ? Math.round(b.desviaciones.reduce((a, v) => a + v, 0) / b.desviaciones.length * 10) / 10
              : null,
            velocidadMedia: b.velocidades.length
              ? Math.round(b.velocidades.reduce((a, v) => a + v, 0) / b.velocidades.length)
              : 0,
            ultimaActividad: b.ultima,
            primeraActividad: b.primera,
          };
        })
        .sort((a, b) => a.pctEnTiempo - b.pctEnTiempo);

      res.json({ ok: true, agencyId, days, totalVehiculos: vehicles.length, vehicles });
    } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // GET /api/autostats/conductor-ranking/:agencyId — ranking de conductores por OTP
  // Lee de la colección persistente `conductor_stats` (actualizada por conductorStatsTick diario).
  // ?limit=100 (máx 500)
  app.get('/api/autostats/conductor-ranking/:agencyId', async (req, res) => {
    try {
      const { agencyId } = req.params;
      const limit = Math.min(500, parseInt((req.query.limit as string) ?? '200', 10));
      const db = getDb();

      const snap = await db.collection('conductor_stats')
        .where('agencyId', '==', agencyId)
        .orderBy('pctEnTiempo', 'asc')
        .limit(limit)
        .get();

      const conductores = snap.docs.map(d => {
        const r = d.data();
        return {
          interno:            r.interno,
          nombre:             r.nombre ?? '',
          diasActivos:        r.diasActivos ?? 0,
          totalEventos:       r.totalEventos ?? 0,
          pctEnTiempo:        r.pctEnTiempo ?? 0,
          pctAtrasado:        r.pctAtrasado ?? 0,
          pctAdelantado:      r.pctAdelantado ?? 0,
          pctSinHorario:      r.pctSinHorario ?? 0,
          velocidadMedia:     r.velocidadMedia ?? 0,
          desviacionMediaMin: r.desviacionMediaMin ?? null,
          cochesOperados:     r.cochesOperados ?? [],
          lineasOperadas:     r.lineasOperadas ?? [],
          ultimaActividad:    r.ultimaActividad ?? null,
          historial:          r.historial ?? [],
        };
      });

      res.json({ ok: true, agencyId, totalConductores: conductores.length, conductores });
    } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // GET /api/autostats/vehicle-stats/:agencyId — perfil de coches (todas las empresas)
  // Lee de `vehicle_stats` (actualizada por vehicleStatsTick 23:45 diario).
  // Incluye enriquecimiento de conductor para UCOT cuando hay distribuciones disponibles.
  // ?sortBy=otp|actividad (default: otp asc) &limit=300 (máx 500)
  app.get('/api/autostats/vehicle-stats/:agencyId', async (req, res) => {
    try {
      const { agencyId } = req.params;
      const limit  = Math.min(500, parseInt((req.query.limit  as string) ?? '300', 10));
      const sortBy = (req.query.sortBy as string) ?? 'otp';
      const db = getDb();

      const orderField = sortBy === 'actividad' ? 'ultimaActividad' : 'pctEnTiempo';
      const orderDir   = sortBy === 'actividad'
        ? ('desc' as const)
        : ('asc'  as const);

      const snap = await db.collection('vehicle_stats')
        .where('agencyId', '==', agencyId)
        .orderBy(orderField, orderDir)
        .limit(limit)
        .get();

      const buses = snap.docs.map(d => {
        const r = d.data();
        return {
          idBus:                r.idBus,
          empresa:              r.empresa ?? agencyId,
          diasActivos:          r.diasActivos ?? 0,
          totalEventos:         r.totalEventos ?? 0,
          pctEnTiempo:          r.pctEnTiempo ?? 0,
          pctAtrasado:          r.pctAtrasado ?? 0,
          pctAdelantado:        r.pctAdelantado ?? 0,
          pctSinHorario:        r.pctSinHorario ?? 0,
          velocidadMedia:       r.velocidadMedia ?? 0,
          desviacionMediaMin:   r.desviacionMediaMin ?? null,
          lineasOperadas:       r.lineasOperadas ?? [],
          ultimaActividad:      r.ultimaActividad ?? null,
          // Conductor (null para empresas sin distribuciones)
          ultimoInterno:        r.ultimoInterno ?? null,
          ultimoNombre:         r.ultimoNombre  ?? null,
          conductoresConocidos: r.conductoresConocidos ?? [],
          historial:            r.historial ?? [],
        };
      });

      res.json({ ok: true, agencyId, totalBuses: buses.length, buses });
    } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
  });
}
