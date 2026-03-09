import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import axios from 'axios';
import cors from 'cors';

admin.initializeApp();
const db = admin.firestore();
const corsHandler = cors({ origin: true });

// ─── API Montevideo Base URL ──────────────────────────────────────────────────
const IMM_API = 'https://api.montevideo.gub.uy/api/publictransport';

// ─── PROXY: API Montevideo → Frontend ────────────────────────────────────────
// Resuelve el problema de CORS al llamar la API del gobierno desde el browser
export const montevideoProxy = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    try {
      const endpoint = req.query.endpoint as string;
      if (!endpoint) {
        res.status(400).json({ error: 'endpoint requerido' });
        return;
      }

      const url = `${IMM_API}/${endpoint}`;
      console.log(`[proxy] GET ${url}`);

      const response = await axios.get(url, {
        timeout: 10000,
        headers: { 'Accept': 'application/json' },
      });

      res.json(response.data);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error proxy';
      console.error('[proxy] Error:', msg);
      res.status(500).json({ error: msg });
    }
  });
});

// ─── SYNC: Sincronizar líneas UCOT desde API Montevideo → Firestore ───────────
// Ejecutar manualmente: POST /syncUCOTLines
export const syncUCOTLines = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    try {
      // Líneas que opera UCOT
      const lineasUCOT = ['300', '306', '316', '317', '328', '329', '330', '370', 'CE1'];
      const resultados: Record<string, unknown> = {};
      const batch = db.batch();
      let sincronizadas = 0;

      for (const codigo of lineasUCOT) {
        try {
          // Intentar obtener variante 'a' y 'b'
          for (const variante of ['a', 'b']) {
            const lineaId = codigo === 'CE1' ? 'CE1' : `${codigo}${variante}`;
            try {
              const response = await axios.get(
                `${IMM_API}/getItineraries/${lineaId}`,
                { timeout: 8000 }
              );

              if (response.data) {
                const data = response.data;
                const paradas = extraerParadas(data);
                const recorrido = extraerRecorrido(data);

                const docRef = db.collection('lineas_ucot').doc(lineaId);
                batch.set(docRef, {
                  id: lineaId,
                  codigo,
                  variante: codigo === 'CE1' ? '' : variante,
                  nombre: data.nombre || data.name || `Línea ${codigo} ${variante.toUpperCase()}`,
                  empresa: 'UCOT',
                  activa: true,
                  paradas,
                  recorrido,
                  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                  fuente: 'api_montevideo',
                }, { merge: true });

                sincronizadas++;
                resultados[lineaId] = `OK (${paradas.length} paradas)`;
              }
            } catch {
              resultados[lineaId] = 'No disponible en API';
            }

            if (codigo === 'CE1') break; // CE1 no tiene variantes
          }
        } catch (err) {
          resultados[codigo] = `Error: ${err instanceof Error ? err.message : 'desconocido'}`;
        }
      }

      await batch.commit();

      res.json({
        ok: true,
        sincronizadas,
        total: lineasUCOT.length,
        resultados,
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Error' });
    }
  });
});

// ─── SYNC: Sincronizar paradas STM completas ──────────────────────────────────
export const syncParadasSTM = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    try {
      const response = await axios.get(`${IMM_API}/getStops`, { timeout: 15000 });
      const paradas = response.data;

      if (!Array.isArray(paradas)) {
        res.status(500).json({ error: 'Formato inesperado de API' });
        return;
      }

      const batch = db.batch();
      let count = 0;

      for (const parada of paradas.slice(0, 500)) { // Máximo 500 por batch
        const id = String(parada.stopId || parada.id || count);
        const ref = db.collection('paradas_stm').doc(id);
        batch.set(ref, {
          id,
          nombre: parada.stopName || parada.nombre || '',
          lat: Number(parada.lat || parada.latitude || 0),
          lng: Number(parada.lng || parada.longitude || parada.lon || 0),
          lineas: parada.routes || parada.lineas || [],
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        count++;
      }

      await batch.commit();
      res.json({ ok: true, paradasSincronizadas: count });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Error' });
    }
  });
});

// ─── SEED: Cargar datos base de UCOT en Firestore ────────────────────────────
// Usar cuando no hay datos reales disponibles todavía
export const seedUCOTData = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    try {
      const batch = db.batch();

      // Vehículos UCOT
      const vehiculos = [
        { id: '115', numero: '115', tipo: 'diesel', modelo: 'Marcopolo G7', año: 2018, status: 'activo', empresa: 'UCOT' },
        { id: '118', numero: '118', tipo: 'diesel', modelo: 'Marcopolo G7', año: 2018, status: 'activo', empresa: 'UCOT' },
        { id: '201', numero: '201', tipo: 'electrico', modelo: 'Yutong E12LF', año: 2020, status: 'activo', empresa: 'UCOT' },
        { id: '202', numero: '202', tipo: 'electrico', modelo: 'Yutong E12LF', año: 2020, status: 'activo', empresa: 'UCOT' },
        { id: '203', numero: '203', tipo: 'electrico', modelo: 'Yutong E12LF', año: 2020, status: 'activo', empresa: 'UCOT' },
        { id: '204', numero: '204', tipo: 'electrico', modelo: 'Yutong E12 Pro', año: 2024, status: 'activo', empresa: 'UCOT' },
        { id: '205', numero: '205', tipo: 'electrico', modelo: 'Yutong E12 Pro', año: 2024, status: 'activo', empresa: 'UCOT' },
        { id: '206', numero: '206', tipo: 'electrico', modelo: 'Yutong E12 Pro', año: 2024, status: 'activo', empresa: 'UCOT' },
        { id: '120', numero: '120', tipo: 'diesel', modelo: 'Busscar Urbanuss', año: 2019, status: 'activo', empresa: 'UCOT' },
        { id: '125', numero: '125', tipo: 'diesel', modelo: 'Busscar Urbanuss', año: 2019, status: 'mantenimiento', empresa: 'UCOT' },
        { id: '130', numero: '130', tipo: 'diesel', modelo: 'Marcopolo Torino', año: 2017, status: 'activo', empresa: 'UCOT' },
        { id: '135', numero: '135', tipo: 'hibrido', modelo: 'Volvo 7900H', año: 2021, status: 'activo', empresa: 'UCOT' },
      ];

      for (const v of vehiculos) {
        batch.set(db.collection('vehicles').doc(v.id), {
          ...v,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      // Personal / Conductores
      const personal = [
        { id: 'C001', legajo: '001', nombre: 'Carlos', apellido: 'García', rol: 'conductor', estado: 'activo', turno: 'mañana' },
        { id: 'C002', legajo: '002', nombre: 'María', apellido: 'López', rol: 'conductor', estado: 'activo', turno: 'tarde' },
        { id: 'C003', legajo: '003', nombre: 'Juan', apellido: 'Rodríguez', rol: 'conductor', estado: 'activo', turno: 'mañana' },
        { id: 'C004', legajo: '004', nombre: 'Ana', apellido: 'Martínez', rol: 'inspector', estado: 'activo', turno: 'rotativo' },
        { id: 'C005', legajo: '005', nombre: 'Pedro', apellido: 'Fernández', rol: 'conductor', estado: 'licencia', turno: 'noche' },
      ];

      for (const p of personal) {
        batch.set(db.collection('personal').doc(p.id), {
          ...p,
          nombreCompleto: `${p.nombre} ${p.apellido}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      // Líneas UCOT base
      const lineas = [
        { id: '300a', codigo: '300', variante: 'a', nombre: 'Maroñas - Centro (Ida)', empresa: 'UCOT', activa: true },
        { id: '300b', codigo: '300', variante: 'b', nombre: 'Centro - Maroñas (Vuelta)', empresa: 'UCOT', activa: true },
        { id: '306a', codigo: '306', variante: 'a', nombre: 'La Unión - Pocitos (Ida)', empresa: 'UCOT', activa: true },
        { id: '316a', codigo: '316', variante: 'a', nombre: 'Piedras Blancas - Centro (Ida)', empresa: 'UCOT', activa: true },
        { id: '328a', codigo: '328', variante: 'a', nombre: 'Manga - Tres Cruces (Ida)', empresa: 'UCOT', activa: true },
        { id: '329a', codigo: '329', variante: 'a', nombre: 'Melilla - Centro (Ida)', empresa: 'UCOT', activa: true },
        { id: '330a', codigo: '330', variante: 'a', nombre: 'Peñarol - Centro (Ida)', empresa: 'UCOT', activa: true },
        { id: 'CE1', codigo: 'CE1', variante: '', nombre: 'Diferencial Ciudad Vieja', empresa: 'UCOT', activa: true },
      ];

      for (const l of lineas) {
        batch.set(db.collection('lineas_ucot').doc(l.id), {
          ...l,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      await batch.commit();

      res.json({
        ok: true,
        mensaje: 'Datos base cargados en Firestore',
        vehiculos: vehiculos.length,
        personal: personal.length,
        lineas: lineas.length,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Error' });
    }
  });
});

// ─── GPS WEBHOOK: Recibe posición de dispositivos externos ───────────────────
export const gpsWebhook = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    try {
      const { vehicleId, lat, lng, speed, heading } = req.body;
      if (!vehicleId || lat == null || lng == null) {
        res.status(400).json({ error: 'vehicleId, lat y lng son requeridos' });
        return;
      }
      await db.collection('viajes_activos').doc(String(vehicleId)).set({
        cocheId: String(vehicleId),
        posicion: new admin.firestore.GeoPoint(Number(lat), Number(lng)),
        velocidad: speed ?? null,
        rumbo: heading ?? null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        estado: 'en_servicio',
        fuente: 'webhook_externo',
      }, { merge: true });
      res.json({ ok: true, vehicleId, ts: new Date().toISOString() });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Error' });
    }
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extraerParadas(data: Record<string, unknown>): Array<{ nombre: string; lat: number; lng: number }> {
  const paradas: Array<{ nombre: string; lat: number; lng: number }> = [];
  const raw = (data.stops || data.paradas || data.itinerary || []) as unknown[];
  if (Array.isArray(raw)) {
    for (const p of raw) {
      const punto = p as Record<string, unknown>;
      const lat = Number(punto.lat || punto.latitude || 0);
      const lng = Number(punto.lng || punto.longitude || punto.lon || 0);
      if (lat && lng) {
        paradas.push({ nombre: String(punto.name || punto.nombre || ''), lat, lng });
      }
    }
  }
  return paradas;
}

function extraerRecorrido(data: Record<string, unknown>): Array<{ lat: number; lng: number }> {
  const puntos: Array<{ lat: number; lng: number }> = [];
  const raw = (data.shape || data.recorrido || data.geometry || []) as unknown[];
  if (Array.isArray(raw)) {
    for (const p of raw) {
      const punto = p as Record<string, unknown>;
      const lat = Number(punto.lat || punto.latitude || 0);
      const lng = Number(punto.lng || punto.longitude || punto.lon || 0);
      if (lat && lng) puntos.push({ lat, lng });
    }
  }
  return puntos;
}
