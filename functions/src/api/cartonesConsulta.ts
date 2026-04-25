/**
 * /api/cartones/* /api/boletin/* /api/personal/* /api/rotacion/* — consultas operativas
 *
 * Endpoints read-only que leen cartones_de_servicio, boletin_oficial, personal,
 * rotacion_diaria y boletin_verano_2026.
 *
 * También contiene los POST /api/admin/seed-rotacion-ucot y seed-boletin-verano-ucot
 * (son del mismo dominio de consulta/seed de boletines).
 *
 * Extraído de `intelligenceApi.ts` el 2026-04-24 como parte de la división
 * por dominio (ADR 003).
 */
import * as admin from 'firebase-admin';
import type { Express } from 'express';

const getDb = () => admin.firestore();

/**
 * Registra las rutas de consulta operativa (cartones, boletines, personal, rotación)
 * y los seeds relacionados.
 */
export function registerCartonesConsultaRoutes(app: Express) {
  // GET /api/cartones/oficiales?linea=&tipo=&limit=&agencyId=
  // agencyId opcional — filtra por operador propio. Si ausente, devuelve
  // todos (compat con clientes legacy). Para operadores no-UCOT usa la
  // colección genérica `cartones` filtrada por agencyId, ya que
  // `servicios_ucot` es legacy UCOT-only.
  app.get('/api/cartones/oficiales', async (req, res) => {
    try {
      const db = getDb();
      const linea = req.query.linea ? String(req.query.linea) : null;
      const tipo = req.query.tipo ? String(req.query.tipo) : null;
      const limit = Math.min(parseInt(String(req.query.limit ?? '300')), 500);
      const agencyId = req.query.agencyId ? String(req.query.agencyId) : null;

      // UCOT (default) usa la colección legacy `servicios_ucot`. Otros
      // operadores usan `cartones` (genérica) filtrada por agencyId.
      const useLegacy = !agencyId || agencyId === '70';
      const collectionName = useLegacy ? 'servicios_ucot' : 'cartones';

      let query: FirebaseFirestore.Query = db.collection(collectionName).limit(limit);
      if (linea) query = query.where('linea', '==', linea);
      if (tipo) query = query.where('tipoServicio', '==', tipo);
      if (!useLegacy && agencyId) query = query.where('agencyId', '==', agencyId);

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
        const snap = await db.collection('personal').where('internalNumber', '==', req.params.interno).limit(1).get();
        if (snap.empty) return res.status(404).json({ ok: false, error: 'Empleado no encontrado' });
        doc = snap.docs[0] as any;
      }
      res.json({ ok: true, empleado: { id: doc.id, ...doc.data() } });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // POST /api/admin/seed-rotacion-ucot — carga rotación coche→servicio desde data/ucot_rotacion.json
  app.post('/api/admin/seed-rotacion-ucot', async (_req, res) => {
    try {
      const data: Record<string, any> = require('../data/ucot_rotacion.json');
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

        for (const coche of rotacion.coches as any[]) {
          const cocheRef = docRef.collection('coches').doc(coche.coche);
          batch.set(cocheRef, {
            coche: coche.coche,
            servicio: coche.servicio,
            horaSalida: coche.horaSalida,
            linea: coche.linea,
          }, { merge: true });
          total++;
          if (total % 400 === 0) await batch.commit();
        }
      }

      await batch.commit();
      res.json({ ok: true, message: `Rotación cargada: ${total} asignaciones coche→servicio en ${Object.keys(data).length} fechas` });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // POST /api/admin/seed-boletin-verano-ucot — carga Matriz de Inspección verano 2026
  app.post('/api/admin/seed-boletin-verano-ucot', async (_req, res) => {
    try {
      const data: Record<string, any> = require('../data/ucot_boletin_verano.json');
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

  // GET /api/personal/:interno — datos de un empleado por número interno
}
