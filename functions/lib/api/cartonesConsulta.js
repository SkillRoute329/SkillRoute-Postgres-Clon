"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCartonesConsultaRoutes = registerCartonesConsultaRoutes;
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
const admin = __importStar(require("firebase-admin"));
const getDb = () => admin.firestore();
/**
 * Registra las rutas de consulta operativa (cartones, boletines, personal, rotación)
 * y los seeds relacionados.
 */
function registerCartonesConsultaRoutes(app) {
    // GET /api/cartones/oficiales?linea=&tipo=&limit=&agencyId=
    // agencyId opcional — filtra por operador propio. Si ausente, devuelve
    // todos (compat con clientes legacy). Para operadores no-UCOT usa la
    // colección genérica `cartones` filtrada por agencyId, ya que
    // `servicios_ucot` es legacy UCOT-only.
    app.get('/api/cartones/oficiales', async (req, res) => {
        var _a;
        try {
            const db = getDb();
            const linea = req.query.linea ? String(req.query.linea) : null;
            const tipo = req.query.tipo ? String(req.query.tipo) : null;
            const limit = Math.min(parseInt(String((_a = req.query.limit) !== null && _a !== void 0 ? _a : '300')), 500);
            const agencyId = req.query.agencyId ? String(req.query.agencyId) : null;
            // UCOT (default) usa la colección legacy `servicios_ucot`. Otros
            // operadores usan `cartones` (genérica) filtrada por agencyId.
            const useLegacy = !agencyId || agencyId === '70';
            const collectionName = useLegacy ? 'servicios_ucot' : 'cartones';
            let query = db.collection(collectionName).limit(limit);
            if (linea)
                query = query.where('linea', '==', linea);
            if (tipo)
                query = query.where('tipoServicio', '==', tipo);
            if (!useLegacy && agencyId)
                query = query.where('agencyId', '==', agencyId);
            const snap = await query.get();
            const cartones = snap.docs.map(d => {
                var _a, _b, _c;
                const data = d.data();
                return {
                    id: d.id,
                    servicio: data.servicio,
                    linea: data.linea,
                    tipoServicio: data.tipoServicio,
                    temporada: data.temporada,
                    totalVueltas: (_a = data.totalVueltas) !== null && _a !== void 0 ? _a : (data.vueltas || []).length,
                    totalEtapas: (data.etapas || []).length,
                    primeraSalida: (_b = data.primeraSalida) !== null && _b !== void 0 ? _b : null,
                    ultimaLlegada: (_c = data.ultimaLlegada) !== null && _c !== void 0 ? _c : null,
                    instrucciones: (data.instrucciones || []).join(' | '),
                };
            });
            res.json({ ok: true, total: cartones.length, cartones });
        }
        catch (err) {
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
                if (snap.empty)
                    return res.status(404).json({ ok: false, error: 'Cartón no encontrado' });
                doc = snap.docs[0];
            }
            res.json({ ok: true, carton: Object.assign({ id: doc.id }, doc.data()) });
        }
        catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });
    // GET /api/boletin/:linea — horarios del boletín para una línea/dirección (ej: "300a")
    app.get('/api/boletin/:linea', async (req, res) => {
        try {
            const doc = await getDb().collection('boletin_oficial').doc(req.params.linea).get();
            if (!doc.exists)
                return res.status(404).json({ ok: false, error: 'Línea no encontrada en boletín' });
            res.json({ ok: true, boletin: Object.assign({ id: doc.id }, doc.data()) });
        }
        catch (err) {
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
                if (snap.empty)
                    return res.status(404).json({ ok: false, error: 'Empleado no encontrado' });
                doc = snap.docs[0];
            }
            res.json({ ok: true, empleado: Object.assign({ id: doc.id }, doc.data()) });
        }
        catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });
    // POST /api/admin/seed-rotacion-ucot — carga rotación coche→servicio desde data/ucot_rotacion.json
    app.post('/api/admin/seed-rotacion-ucot', async (_req, res) => {
        try {
            const data = require('../data/ucot_rotacion.json');
            const db = getDb();
            const batch = db.batch();
            let total = 0;
            for (const [fecha, rotacion] of Object.entries(data)) {
                const docRef = db.collection('rotacion_diaria').doc(fecha);
                batch.set(docRef, {
                    fecha,
                    archivo: rotacion.archivo,
                    totalCoches: rotacion.totalCoches,
                    actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
                for (const coche of rotacion.coches) {
                    const cocheRef = docRef.collection('coches').doc(coche.coche);
                    batch.set(cocheRef, {
                        coche: coche.coche,
                        servicio: coche.servicio,
                        horaSalida: coche.horaSalida,
                        linea: coche.linea,
                    }, { merge: true });
                    total++;
                    if (total % 400 === 0)
                        await batch.commit();
                }
            }
            await batch.commit();
            res.json({ ok: true, message: `Rotación cargada: ${total} asignaciones coche→servicio en ${Object.keys(data).length} fechas` });
        }
        catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });
    // POST /api/admin/seed-boletin-verano-ucot — carga Matriz de Inspección verano 2026
    app.post('/api/admin/seed-boletin-verano-ucot', async (_req, res) => {
        try {
            const data = require('../data/ucot_boletin_verano.json');
            const db = getDb();
            let total = 0;
            for (const [sheetName, boletin] of Object.entries(data)) {
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
        }
        catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });
    // GET /api/rotacion/:fecha — rotación coche→servicio de una fecha (YYYY-MM-DD)
    app.get('/api/rotacion/:fecha', async (req, res) => {
        try {
            const db = getDb();
            const docRef = db.collection('rotacion_diaria').doc(req.params.fecha);
            const doc = await docRef.get();
            if (!doc.exists)
                return res.status(404).json({ ok: false, error: 'Fecha no encontrada' });
            const coches = await docRef.collection('coches').get();
            res.json({
                ok: true,
                fecha: req.params.fecha,
                meta: doc.data(),
                coches: coches.docs.map(d => d.data()),
            });
        }
        catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });
    // GET /api/boletin-verano/:lineaDir — boletín verano para una línea-dirección (ej: "300a")
    app.get('/api/boletin-verano/:lineaDir', async (req, res) => {
        try {
            const doc = await getDb().collection('boletin_verano_2026').doc(req.params.lineaDir).get();
            if (!doc.exists)
                return res.status(404).json({ ok: false, error: 'Línea-dirección no encontrada' });
            res.json({ ok: true, boletin: Object.assign({ id: doc.id }, doc.data()) });
        }
        catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });
    // GET /api/personal/:interno — datos de un empleado por número interno
}
