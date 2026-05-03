import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import axios from 'axios';
import cors from 'cors';
import * as Papa from 'papaparse';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

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

// ─── Lógica interna de Sincronización UCOT ─────────────────────────────────────
const performSyncUCOTLines = async () => {
  const lineasUCOT = ['300', '306', '316', '317', '328', '329', '330', '370', 'CE1'];
  const resultados: Record<string, unknown> = {};
  const batch = db.batch();
  let sincronizadas = 0;

  for (const codigo of lineasUCOT) {
    try {
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

        if (codigo === 'CE1') break;
      }
    } catch (err) {
      resultados[codigo] = `Error: ${err instanceof Error ? err.message : 'desconocido'}`;
    }
  }

  await batch.commit();
  return { sincronizadas, total: lineasUCOT.length, resultados };
};

// ─── SYNC: Sincronizar líneas UCOT desde API Montevideo → Firestore ───────────
// Ejecutar manualmente: POST /syncUCOTLines
export const syncUCOTLines = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    try {
      const result = await performSyncUCOTLines();
      res.json({
        ok: true,
        ...result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Error' });
    }
  });
});

export const syncUCOTLinesCron = functions.pubsub.schedule('0 3 * * *')
  .timeZone('America/Montevideo')
  .onRun(async (_context) => {
    // api.montevideo.gub.uy devuelve 403 — cron deshabilitado hasta que el endpoint sea accesible
    console.warn('[CRON] syncUCOTLinesCron: endpoint 403, skipping');
    return null;
  });


// ─── Lógica interna de Sincronización Paradas ─────────────────────────────────
const performSyncParadasSTM = async () => {
  const response = await axios.get(`${IMM_API}/getStops`, { timeout: 15000 });
  const paradas = response.data;

  if (!Array.isArray(paradas)) throw new Error('Formato inesperado de API');

  const batch = db.batch();
  let count = 0;

  for (const parada of paradas.slice(0, 500)) {
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
  return { count };
};

// ─── SYNC: Sincronizar paradas STM completas ──────────────────────────────────
export const syncParadasSTM = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    try {
      const result = await performSyncParadasSTM();
      res.json({ ok: true, paradasSincronizadas: result.count });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Error' });
    }
  });
});

export const syncParadasSTMCron = functions.pubsub.schedule('30 3 * * *')
  .timeZone('America/Montevideo')
  .onRun(async (_context) => {
    // api.montevideo.gub.uy devuelve 403 — cron deshabilitado hasta que el endpoint sea accesible
    console.warn('[CRON] syncParadasSTMCron: endpoint 403, skipping');
    return null;
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

// ─── GEOSERVER PROXY: Acceso a rutas por variante del Geoserver IMM ──────────
// El Geoserver de Montevideo provee recorridos diferenciados por cod_variante.
// Desde el browser directo suele estar bloqueado por CORS/firewall, por eso
// usamos esta Cloud Function como proxy.
const GEOSERVER_BASE = 'https://geoserver.montevideo.gub.uy/geoserver/imm/ows';

export const geoserverProxy = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    try {
      const codVariante = req.query.cod_variante as string;
      const typeName = (req.query.typeName as string) || 'imm:v_uptu_sentido_variante';

      if (!codVariante) {
        res.status(400).json({ error: 'cod_variante requerido' });
        return;
      }

      const url = `${GEOSERVER_BASE}?service=WFS&version=2.0.0&request=GetFeature&typeName=${typeName}&CQL_FILTER=cod_variante=${codVariante}&outputFormat=application/json&srsname=EPSG:4326`;
      console.log(`[geoProxy] GET ${url}`);

      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'UCOT-Gestor/2.0',
        },
      });

      res.json(response.data);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error geoserver proxy';
      console.error('[geoProxy] Error:', msg);
      res.status(500).json({ error: msg });
    }
  });
});

// ─── UTM Zone 21S (EPSG:32721) → WGS84 (EPSG:4326) conversion ───────────────
// Implementación directa sin depender de proj4 para mantener el bundle ligero.
function utmToLatLng(easting: number, northing: number, zone = 21, southern = true): { lat: number; lng: number } {
  const a = 6378137; // WGS84 semi-major axis
  const f = 1 / 298.257223563; // WGS84 flattening
  const k0 = 0.9996;
  const e = Math.sqrt(2 * f - f * f);
  const e2 = e * e;
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

  const x = easting - 500000;
  const y = southern ? northing - 10000000 : northing;

  const M = y / k0;
  const mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256));
  const phi1 = mu + (3 * e1 / 2 - 27 * e1 * e1 * e1 / 32) * Math.sin(2 * mu)
    + (21 * e1 * e1 / 16 - 55 * e1 * e1 * e1 * e1 / 32) * Math.sin(4 * mu)
    + (151 * e1 * e1 * e1 / 96) * Math.sin(6 * mu);

  const sinPhi = Math.sin(phi1);
  const cosPhi = Math.cos(phi1);
  const tanPhi = sinPhi / cosPhi;
  const N1 = a / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  const T1 = tanPhi * tanPhi;
  const C1 = (e2 / (1 - e2)) * cosPhi * cosPhi;
  const R1 = a * (1 - e2) / Math.pow(1 - e2 * sinPhi * sinPhi, 1.5);
  const D = x / (N1 * k0);

  const lat = phi1 - (N1 * tanPhi / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * (e2 / (1 - e2))) * D * D * D * D / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * (e2 / (1 - e2)) - 3 * C1 * C1) * D * D * D * D * D * D / 720);

  const lng = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180
    + (D - (1 + 2 * T1 + C1) * D * D * D / 6
    + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * (e2 / (1 - e2)) + 24 * T1 * T1) * D * D * D * D * D / 120) / cosPhi;

  return {
    lat: Number((lat * 180 / Math.PI).toFixed(6)),
    lng: Number((lng * 180 / Math.PI).toFixed(6)),
  };
}

// ─── Mapeo de cod_variante del Geoserver para líneas UCOT ─────────────────────
// Estos IDs se obtienen de la página STM: https://www.montevideo.gub.uy/app/stm/horarios/
// Cada línea tiene N variantes (IDA, VUELTA, y a veces sub-variantes cortadas)
// Formato: { lineId: string, variants: { code: 'a'|'b', codVariante: number, sentido: 'IDA'|'VUELTA', desc: string }[] }
const UCOT_GEOSERVER_VARIANTS: {
  lineId: string;
  variants: { code: string; codVariante: number; sentido: string; terminalOrigen: string; terminalDestino: string }[];
}[] = [
  {
    lineId: '370',
    variants: [
      { code: 'a', codVariante: 3626, sentido: 'IDA', terminalOrigen: 'Portones', terminalDestino: 'Playa del Cerro' },
      { code: 'b', codVariante: 3627, sentido: 'VUELTA', terminalOrigen: 'Playa del Cerro', terminalDestino: 'Portones' },
    ],
  },
  // TODO: Agregar más líneas a medida que se descubren los cod_variante
  // Se pueden encontrar inspeccionando la página STM 
  // Los IDs se ven en el onclick de los botones de "Recorrido" en la tabla de horarios
];

// ─── SYNC VARIANT ROUTES: Sincroniza recorridos por variante desde Geoserver ──
export const syncVariantRoutes = functions
  .runWith({ timeoutSeconds: 120 })
  .https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
      try {
        const lineFilter = req.query.line as string | undefined;
        const results: Record<string, string> = {};
        let synced = 0;

        const linesToSync = lineFilter
          ? UCOT_GEOSERVER_VARIANTS.filter(l => l.lineId === lineFilter)
          : UCOT_GEOSERVER_VARIANTS;

        for (const line of linesToSync) {
          for (const variant of line.variants) {
            const docId = `${line.lineId}${variant.code}`;
            try {
              // Pedir al Geoserver en EPSG:4326 (lat/lng directo)
              const url4326 = `${GEOSERVER_BASE}?service=WFS&version=2.0.0&request=GetFeature&typeName=imm:v_uptu_sentido_variante&CQL_FILTER=cod_variante=${variant.codVariante}&outputFormat=application/json&srsname=EPSG:4326`;
              
              let geoData: { features?: Array<{ geometry?: { type?: string; coordinates?: number[][] } }> };
              try {
                const resp = await axios.get(url4326, { timeout: 15000, headers: { 'User-Agent': 'UCOT-Gestor/2.0' } });
                geoData = resp.data;
              } catch {
                // Fallback: pedir en UTM y convertir
                const urlUtm = `${GEOSERVER_BASE}?service=WFS&version=2.0.0&request=GetFeature&typeName=imm:v_uptu_sentido_variante&CQL_FILTER=cod_variante=${variant.codVariante}&outputFormat=application/json&srsname=EPSG:32721`;
                const resp = await axios.get(urlUtm, { timeout: 15000, headers: { 'User-Agent': 'UCOT-Gestor/2.0' } });
                geoData = resp.data;
                // Convertir UTM → WGS84
                if (geoData.features?.[0]?.geometry?.coordinates) {
                  geoData.features[0].geometry.coordinates = geoData.features[0].geometry.coordinates.map(
                    (coord: number[]) => {
                      const { lat, lng } = utmToLatLng(coord[0], coord[1]);
                      return [lng, lat];
                    }
                  );
                }
              }

              if (!geoData.features || geoData.features.length === 0) {
                results[docId] = 'Sin datos en Geoserver';
                continue;
              }

              const feature = geoData.features[0];
              const coords = feature.geometry?.coordinates || [];
              
              // Convertir GeoJSON [lng, lat] → recorrido [{lat, lng}]
              const recorrido: Array<{ lat: number; lng: number }> = [];
              
              if (feature.geometry?.type === 'MultiLineString') {
                // MultiLineString: array de arrays de coords
                for (const lineString of coords as unknown as number[][][]) {
                  for (const coord of lineString) {
                    recorrido.push({ lat: Number(coord[1]), lng: Number(coord[0]) });
                  }
                }
              } else {
                // LineString: array simple de coords
                for (const coord of coords) {
                  if (Array.isArray(coord) && coord.length >= 2) {
                    recorrido.push({ lat: Number(coord[1]), lng: Number(coord[0]) });
                  }
                }
              }

              if (recorrido.length === 0) {
                results[docId] = 'Recorrido vacío';
                continue;
              }

              // Guardar en Firestore
              const docRef = db.collection('lineas_ucot').doc(docId);
              await docRef.set({
                codigo: line.lineId,
                nombre: `Línea ${line.lineId} ${variant.sentido}`,
                numeroAPI: line.lineId,
                varianteIdx: variant.code === 'a' ? 0 : 1,
                sentido: variant.sentido,
                origen: variant.terminalOrigen,
                destino: variant.terminalDestino,
                terminalSalida: variant.terminalOrigen,
                terminalLlegada: variant.terminalDestino,
                recorrido,
                empresa: 'UCOT',
                activa: true,
                fuenteGeoserver: true,
                codVarianteGeoserver: variant.codVariante,
                ultimaActualizacion: admin.firestore.FieldValue.serverTimestamp(),
              }, { merge: true });

              synced++;
              results[docId] = `OK (${recorrido.length} puntos, ${variant.sentido}: ${variant.terminalOrigen} → ${variant.terminalDestino})`;
            } catch (err) {
              results[docId] = `Error: ${err instanceof Error ? err.message : 'desconocido'}`;
            }
          }
        }

        res.json({
          ok: true,
          synced,
          results,
          timestamp: new Date().toISOString(),
        });
      } catch (error: unknown) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Error' });
      }
    });
  });

// ─── DISCOVER VARIANTS: Busca todas las variantes de una línea en Geoserver ───
// Útil para descubrir los cod_variante de nuevas líneas
export const discoverVariants = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    try {
      const lineNumber = req.query.line as string;
      if (!lineNumber) {
        res.status(400).json({ error: 'line requerido (ej: ?line=370)' });
        return;
      }

      // Buscar todas las variantes que contengan el número de línea en su descripción
      const url = `${GEOSERVER_BASE}?service=WFS&version=2.0.0&request=GetFeature&typeName=imm:v_uptu_sentido_variante&CQL_FILTER=desc_linea='${lineNumber}'&outputFormat=application/json&srsname=EPSG:4326&propertyName=cod_variante,desc_variante,desc_linea,sentido`;
      
      console.log(`[discover] GET ${url}`);
      const response = await axios.get(url, {
        timeout: 15000,
        headers: { 'User-Agent': 'UCOT-Gestor/2.0' },
      });

      const features = response.data?.features || [];
      const variants = features.map((f: { properties: Record<string, unknown> }) => f.properties);

      res.json({
        line: lineNumber,
        variantsFound: variants.length,
        variants,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error';
      console.error('[discover] Error:', msg);
      res.status(500).json({ error: msg });
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

// ─── Módulo de Detección de Desvíos GPS (Skill 3 + SRE) ──────────────────────
// Incluye: gpsWebhookV2, expirarDesvios, alertasVencimientosDocumentales, alertaSoCBajo
export {
  gpsWebhookV2,
  expirarDesvios,
  alertasVencimientosDocumentales,
  alertaSoCBajo,
} from './detectarDesvio';

// ─── Shadow Dispatcher — Agentes Autónomos de Línea (Skill: shadow-dispatcher) ─
// Incluye: shadowDispatcherTick, rivalPingIngestion, limpiarPingsRivales, onAlertaRegulacion
export {
  shadowDispatcherTick,
  rivalPingIngestion,
  limpiarPingsRivales,
  onAlertaRegulacion,
} from './shadowDispatcher';

// ─── Ingesta IMM — Motor de Datos Públicos STM (Skill: ingesta-bigdata-realtime) ─
// Consulta la API pública de la IMM cada 60s para obtener posiciones GPS de TODOS
// los buses de Montevideo. Elimina la dependencia de cartones internos.
export {
  ingestaIMMTick,
  testIngestaIMM,
} from './ingestaIMM';

// ─── PROXY: API STM Online (POST) ─────────────────────────────────────────────
// Resuelve CORS para el live map (POST a /buses/rest/stm-online) en producción
export const stmOnlineProxy = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    try {
      const url = 'https://www.montevideo.gub.uy/buses/rest/stm-online';
      const response = await axios.post(url, req.body, {
        timeout: 15000,
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://www.montevideo.gub.uy',
          'Referer': 'https://www.montevideo.gub.uy/buses/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      });
      res.json(response.data);
    } catch (error: any) {
      console.error('[stmOnlineProxy] Error:', error.message);
      res.status(502).json({ error: error.message });
    }
  });
});

// ─── DATA LAKE: Ingesta Masiva de Datos Históricos (CSV) ──────────────────────
export const parseBulkTicketsStorage = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .storage.object().onFinalize(async (object) => {
    try {
      const filePath = object.name;
      const bucketName = object.bucket;

      if (!filePath || !filePath.startsWith('data_lake/uploads/') || !filePath.endsWith('.csv')) {
        return null;
      }

      console.log(`[DataLake] Comenzando ingesta para: ${filePath}`);
      const bucket = admin.storage().bucket(bucketName);
      const tempFilePath = path.join(os.tmpdir(), path.basename(filePath));

      await bucket.file(filePath).download({ destination: tempFilePath });
      const fileContent = fs.readFileSync(tempFilePath, 'utf8');

      // Leer CSV
      const result = Papa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
      });

      console.log(`[DataLake] Archivo procesado, ${result.data.length} filas encontradas.`);

      const collectionRef = db.collection('data_lake_tickets');
      let batch = db.batch();
      let count = 0;

      for (const row of result.data) {
        const id = collectionRef.doc().id;
        const ref = collectionRef.doc(id);
        
        batch.set(ref, {
          ...row as any,
          ingestedAt: admin.firestore.FieldValue.serverTimestamp(),
          sourceFile: path.basename(filePath),
        });

        count++;
        // Límite de batch Firestore: 500
        if (count % 500 === 0) {
          await batch.commit();
          batch = db.batch();
        }
      }

      if (count % 500 !== 0) {
        await batch.commit();
      }

      console.log(`[DataLake] Ingestados ${count} tickets exitosamente.`);
      fs.unlinkSync(tempFilePath); // Cleanup
      
      // Mover a procesados (Evita re-ejecuciones accidentales)
      const processedFilePath = filePath.replace('data_lake/uploads/', 'data_lake/processed/');
      await bucket.file(filePath).move(processedFilePath);
      console.log(`[DataLake] Archivo movido a ${processedFilePath}`);
      
      return count;
    } catch (e) {
      console.error('[DataLake] Error procesando archivo:', e);
      return null;
    }
  });

// ─── PROXY: STM Horarios (JSF) ────────────────────────────────────────────────
// Resuelve CORS para el scraping de horarios JSF desde producción.
// Vite proxy maneja /proxy-horarios/* en local, en prod Firebase rewrite apunta acá.
export const stmHorariosProxy = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    try {
      // req.originalUrl is strictly the full path starting with /proxy-horarios
      const targetPath = req.originalUrl.replace(/^\/proxy-horarios/, '');
      const url = `https://www.montevideo.gub.uy${targetPath}`;
      
      const isPost = req.method === 'POST';
      
      const headersKeysToForward = ['content-type', 'faces-request', 'x-requested-with', 'accept'];
      const headers: any = {
        'Origin': 'https://www.montevideo.gub.uy',
        'Referer': 'https://www.montevideo.gub.uy/app/stm/horarios/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      };

      for (const k of headersKeysToForward) {
        if (req.headers[k]) {
          headers[k] = req.headers[k];
        }
      }

      console.log(`[stmHorariosProxy] ${req.method} ${url}`);
      
      const config: any = {
        method: req.method,
        url,
        headers,
        timeout: 15000,
        responseType: 'arraybuffer' // to handle strings/html/xml correctly
      };

      if (isPost && req.rawBody) {
        config.data = req.rawBody;
      }

      const response = await axios(config);
      
      // Copy content-type from STM
      res.set('Content-Type', String(response.headers['content-type'] || 'text/html; charset=UTF-8'));
      
      // Send raw buffer back
      res.send(response.data);
    } catch (error: any) {
      console.error('[stmHorariosProxy] Error:', error.message);
      res.status(502).json({ error: error.message });
    }
  });
});

export { intelligenceApi } from './intelligenceApi';

// ─── Horarios oficiales UCOT (scraper JSF diario) ─────────────────────────────
export {
  refreshHorariosUcotTick,
  refreshHorariosUcotNow,
} from './refreshHorariosUcot';

// ─── Refresh entidad-nivel `competidores` cada 10min ─────────────────────────
// Complementa ingestaIMMTick (cada 60s, pings GPS por bus): aquí mantenemos
// el documento agregado por empresa que consume competitionService.
export {
  refreshCompetidoresTick,
  refreshCompetidoresNow,
} from './refreshCompetidores';

// ─── AutoStats Collector — GPS+GTFS cada 5min ─────────────────────────────────
// Acumula historial de cumplimiento horario sin inspectores.
// Funciona para UCOT, CUTCSA, COETC, COME simultáneamente.
export {
  autoStatsCollectorTick,
  autoStatsCollectorNow,
} from './autoStatsCollector';

// ─── Refresh horarios STM completo (todas las empresas, todas las líneas) ─────
export {
  refreshAllStmHorariosNow,
  refreshAllStmHorariosTick,
} from './refreshAllStmHorarios';

// ─── Schedule Adherence Engine — OTP planificado vs real ──────────────────────
// Cruza vehicle_events (GPS real) contra horarios_stm (programación oficial)
// y produce auto_stats_diarios/{YYYY-MM-DD}_{agencyId} con OTP real UITP.
// Métrica canónica: |desviación| ≤ 5 min = A_TIEMPO.
// Cron horario procesa la hora previa; endpoint manual permite recalcular días.
export {
  computeAdherenceNow,
  computeAdherenceCron,
} from './scheduleAdherence';

// ─── Market Penetration — snapshot diario de cuota cross-operador ─────────────
// Cron 23:45 Mvd toma snapshot de buses observados por (línea × agencyId)
// y persiste en penetracion_diaria/{ymd}_{linea}. Permite reconstruir
// histórico de penetración sin mantener cartones detallados.
// HTTP /penetrationHistoric?agencyId=X&days=N&topLineas=M para el dashboard.
export {
  computePenetrationNow,
  computePenetrationCron,
  penetrationHistoric,
} from './marketPenetration';

// ─── Service Delivery Engine — KPI canónico UITP cartones plan/ejec ───────────
// Cruza cartones planificados vs cartones_completados y produce
// service_delivery_diaria/{ymd}_{agencyId} con SD = ejec/plan.
// Cron 23:30 Mvd procesa el día. HTTP manual permite recalcular días específicos.
export {
  computeServiceDeliveryNow,
  computeServiceDeliveryCron,
} from './serviceDeliveryEngine';

// ─── Audit Log — trazabilidad de cambios sobre colecciones críticas ───────────
// Trigger onWrite registra cada cambio (create/update/delete) en audit_log/
// con before/after/diff/uid/email para compliance y debugging.
export {
  auditLogParametrosOperativos,
  auditLogParametrosOperativosHistorial,
  auditLogLineasUcot,
  auditLogLineas,
  auditLogVehicles,
  auditLogVehiculos,
  auditLogUsers,
  auditLogReglasRotacion,
  auditLogServiceDefinitions,
  auditLogServiceMatrices,
  auditLogQuery,
} from './auditLog';

// ─── Archive Vehicle Events — Rotativo semanal a Storage ─────────────────────
// Exporta vehicle_events a Firebase Storage y purga Firestore.
// Mantiene Firestore pequeño (7 días) y el historial en Storage (ilimitado, barato).
export {
  archiveVehicleEventsTick,
  archiveVehicleEventsNow,
  listVehicleArchives,
} from './archiveVehicleEvents';

// ─── Shape Reconstruction — shapes cross-operador desde vehicle_events ────────
// DIRECTRIZ 2026-04-24: SkillRoute analiza el sistema metropolitano completo.
// Reconstruye polilíneas de UCOT/CUTCSA/COME/COETC desde el histórico GPS.
// Base para la matriz DRO (v2) y snap-to-shape en ShadowRadar.
export {
  reconstructShapesTick,
  reconstructShapesNow,
} from './shapeReconstruction';

// ─── DRO Matrix — Directional Route Overlap entre shapes ─────────────────────
// Consume shapes_cross_operator y produce corridor_overlap con pctAInB,
// sharedKm, sameEmpresa (para intra-empresa canibalización).
// Reemplaza la heurística de destino/heading en ShadowRadar.
export {
  droMatrixTick,
  recomputeDroMatrixNow,
} from './droMatrix';

// ─── FCM Alert Dispatcher — push al conductor + ACK loop ──────────────────────

// ─── Histórico de KPIs (CEO V7 fase 2) ────────────────────────────────────────
// Series diarias para los botones 7D/30D del Centro de Mando.
// /historicOtp?days=N&agencyId=X → puntualidad por día
// /historicBunching?days=N&agencyId=X → aglomeración por día
export {
  historicOtp,
  historicBunching,
} from './historicMetrics';
// DIRECTRIZ 2026-04-24: cierra el loop operacional (Swiftly/Optibus-style).
// onAlertaCreated: dispara FCM cada vez que se crea un doc en alertas_regulacion.
// acknowledgeAlerta: HTTP endpoint que marca ack_at + response_time_sec cuando
// el chofer toca "OK" en la notificación.
export {
  onAlertaCreated,
  acknowledgeAlerta,
} from './fcmAlertDispatcher';

// FCM para incidencias: notifica supervisores y (si es urgente) conductores de la línea
export { onIncidenciaCreated } from './incidenciaDispatcher';

// ─── GTFS-Realtime Publisher ─────────────────────────────────────────────────
// Fase 1 #5 (2026-04-23): publica VehiclePositions GTFS-RT para integración
// con Google Maps, Moovit, Citymapper y cualquier agregador MaaS.
// URLs tras deploy:
//   /gtfsRealtime/vehicle-positions.pb   — protobuf (producción)
//   /gtfsRealtime/vehicle-positions.json — JSON (debug)
//   /gtfsRealtime/feed-info              — metadata
export { gtfsRealtime, refreshGtfsRtAlerts } from './gtfsRealtime';

// ─── Compliance Reporting (Sprint 1, 2026-04-25) ─────────────────────────────
// GET/POST /regulatorio/export — PDF estructurado cumplimiento OTP + KPIs UITP
// Auth: ADMIN/SUPERADMIN
export { regulatorio } from './api/regulatorio';


// ─── GTFS-Static Publisher ───────────────────────────────────────────────────
// Trim+ #1 (2026-04-23): dataset estático (routes, stops, trips, shapes) que
// complementa GTFS-RT. Agregadores MaaS consumen ambos.
//   /gtfsStatic/feed.zip    — application/zip (producción)
//   /gtfsStatic/feed-info   — metadata JSON
export { gtfsStatic } from './gtfsStatic';

// ─── SIRI-Lite Publisher (mercado UE) ────────────────────────────────────────
// Trim+ #68 (2026-04-23): VehicleMonitoring + StopMonitoring en formato SIRI-Lite JSON
// para agregadores MaaS europeos.
//   /siriRealtime/vm.json
//   /siriRealtime/sm.json
//   /siriRealtime/discovery.json
export { siriRealtime } from './siriRealtime';

// ─── System Health Monitoring (operational observability) ────────────────────
// Trim+ #72 (2026-04-23): agrega estado de todos los componentes en un JSON.
//   /systemHealth          — estado completo (cache 30s)
//   /systemHealth?fresh=1  — force refresh
export { systemHealth } from './systemHealth';

// ─── NeTEx Framework Discovery (EU/Interop stds) ─────────────────────────────
// GET /netexEndpoint/discovery.{xml,json} para agregadores MaaS europeos.
export { netexEndpoint } from './netexEndpoint';

// ─── GPS History Accumulator — acumula pings GPS con TTL 7 días ──────────────
// Cron 60s: muestrea todos los buses del sistema y persiste en gps_pings_raw.
// Fuente primaria para shapeBuilder (shapes GPS-derived cross-operador).
export { gpsHistoryAccumulatorTick } from './gpsHistoryAccumulator';

// ─── Shape Builder — reconstruye shapes desde historial GPS ──────────────────
// Cron 1h: lee gps_pings_raw, aplica Douglas-Peucker, materializa en
// shapes_cross_operator/{agencyId}_{linea}_{variante} con agencyId correcto.
// HTTP /shapeBuilderRun?agencyId=70&linea=300 para forzar reconstrucción puntual.
export { shapeBuilderTick, shapeBuilderRun } from './shapeBuilder';

// ─── Compliance Alerts — detecta líneas con cumplimiento degradado ────────────
// Cron 6h: lee vehicle_events últimas 24h, escribe en compliance_alerts,
// envía FCM a ADMIN/TRAFFIC si hay alertas CRITICO (< 50%).
export { complianceAlertsTick } from './complianceAlertsTick';

// ─── IMM — Integración API oficial Intendencia de Montevideo ─────────────────
// OAuth2 authorization_code: /immAuthorize inicia flujo, /immOAuthCallback recibe code
// y almacena tokens en Firestore (imm_config/oauth_token) para uso por getImmToken().
// Variantes: ingesta diaria 4AM + /seedVariantes (POST) para refresh manual.
export { immOAuthCallback }        from './immOAuthCallback';
export { immAuthorize }            from './immAuthorize';
export { refreshVariantesTick, seedVariantes }        from './immVariantesService';
export { immEta, seedParadas, refreshParadasTick, immParadasList } from './immParadasService';
export { immBusesLive }                               from './immBusesService';
export { gtfsImportTick, gtfsImportRun, gtfsDebug }   from './gtfsImporter';
export { otpTick, computeOtpNow }                     from './otpEngine';

// ─── HRR Engine — Headway-to-Rival Ratio cross-operador ──────────────────────
// Cron 10min: calcula HRR para todos los pares T1+T2 del corridor_overlap.
// HTTP /hrrQueryNow — fuerza recálculo y devuelve resumen.
// HTTP /hrrData?agencyId=70 — datos actuales sin recalcular.
export { hrrTick, hrrQueryNow, hrrData }              from './hrrEngine';

// ─── Seat-km Calculator — market share por oferta cross-operador ──────────────
// Cron 06:00 AM Mvd: calcula seat_km_snapshot/{YYYY-MM-DD} desde GTFS + shapes.
// HTTP /seatKmCalculatorNow?date=YYYY-MM-DD — recálculo manual.
// HTTP /seatKmSnapshotQuery?date=YYYY-MM-DD — consulta snapshot guardado.
export { seatKmCalculatorCron, seatKmCalculatorNow, seatKmSnapshotQuery } from './seatKmCalculator';

// ─── Conductor Stats — cruce distribuciones × vehicle_events por conductor ────
// Cron 23:30 Mvd: lee vehicle_events del día para UCOT, cruza con
// distribuciones_diarias/{hoy}/registros, escribe conductor_stats/{70_interno}.
export { conductorStatsTick } from './conductorStatsTick';

// ─── Vehicle Stats — perfil de coches para las 4 empresas del sistema ─────────
// Cron 23:45 Mvd: lee vehicle_events de hoy para COETC/COME/CUTCSA/UCOT,
// enriquece UCOT con distribuciones cuando existen, escribe vehicle_stats/{agencyId_idBus}.
export { vehicleStatsTick } from './vehicleStatsTick';

// ─── Motor de Consecuencias — grafo de dependencias operativas ────────────────
// HTTP POST /consequencePreview — simula cascada de efectos de un evento operativo.
// Triggers automáticos — se disparan cuando cambia Firestore (sin intervención del usuario).
// Empresas con reglas configuradas: UCOT (70). Resto: pendiente.
export { consequencePreview } from './consequenceApi';
export {
  onAbsenceCreated,
  onShiftAssigned,
  onVehicleStatusChanged,
  onOTPUpdated,
} from './consequenceTriggers';
