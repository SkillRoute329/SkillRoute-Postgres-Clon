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
exports.registerAdminSeedRoutes = registerAdminSeedRoutes;
/**
 * /api/admin/seed-* y /api/admin/personal — carga inicial de datos UCOT + admin de personal
 *
 * Endpoints de administración para sembrar datos desde JSON bundled y
 * actualizar registros de personal.
 *
 * Data JSON queda en functions/src/data/ (junto con el build).
 *
 * Extraído de `intelligenceApi.ts` el 2026-04-24 como parte de la división
 * por dominio (ADR 003).
 */
const admin = __importStar(require("firebase-admin"));
const authMiddleware_1 = require("./authMiddleware");
const getDb = () => admin.firestore();
// Data bundled — requires se resuelven contra functions/src/data/
// eslint-disable-next-line @typescript-eslint/no-var-requires
const UCOT_PERSONAL_RAW = require('../data/ucot_personal.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const UCOT_VEHICLES_RAW = require('../data/ucot_vehicles.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const UCOT_SERVICIOS_HABILES = require('../data/ucot_servicios_habiles.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const UCOT_SERVICIOS_SABADO = require('../data/ucot_servicios_sabado.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const UCOT_BOLETIN = require('../data/ucot_boletin.json');
/**
 * Registra rutas de administración: seeds y CRUD básico de personal.
 */
function registerAdminSeedRoutes(app) {
    // POST /api/admin/seed-personal-ucot — 691 empleados reales, idempotente (merge:true)
    app.post('/api/admin/seed-personal-ucot', authMiddleware_1.requireAdmin, async (_req, res) => {
        try {
            const db = getDb();
            const BATCH_SIZE = 450;
            let total = 0;
            const chunks = [];
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
                    batchPersonal.set(db.collection('personal').doc(docId), empleadoData, { merge: true });
                    batchUsers.set(db.collection('users').doc(docId), Object.assign(Object.assign({}, empleadoData), { fromExcel: true }), { merge: true });
                    total++;
                }
                await Promise.all([batchPersonal.commit(), batchUsers.commit()]);
            }
            res.json({ ok: true, message: `${total} empleados UCOT cargados en 'personal' y 'users'`, total });
        }
        catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });
    // POST /api/admin/seed-vehicles-ucot
    app.post('/api/admin/seed-vehicles-ucot', authMiddleware_1.requireAdmin, async (_req, res) => {
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
                        agencyId: 70,
                        empresa: 70,
                        fuenteDatos: 'cartones_ucot_2026',
                        importadoEn: admin.firestore.FieldValue.serverTimestamp(),
                    };
                    batchV.set(db.collection('vehicles').doc(v.interno), vehicleData, { merge: true });
                    batchVeh.set(db.collection('vehiculos').doc(v.interno), vehicleData, { merge: true });
                    total++;
                }
                await Promise.all([batchV.commit(), batchVeh.commit()]);
            }
            res.json({ ok: true, message: `${total} vehículos cargados en 'vehicles' y 'vehiculos'`, total });
        }
        catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });
    // POST /api/admin/seed-horarios-ucot — servicios hábiles (cartones)
    app.post('/api/admin/seed-horarios-ucot', authMiddleware_1.requireAdmin, async (_req, res) => {
        var _a, _b, _c, _d, _e, _f, _g;
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
                        primeraSalida: (_c = (_b = (_a = s.vueltas[0]) === null || _a === void 0 ? void 0 : _a.paradas[0]) === null || _b === void 0 ? void 0 : _b.hora) !== null && _c !== void 0 ? _c : null,
                        ultimaLlegada: (_g = (_f = (_e = (_d = s.vueltas[s.vueltas.length - 1]) === null || _d === void 0 ? void 0 : _d.paradas) === null || _e === void 0 ? void 0 : _e.slice(-1)[0]) === null || _f === void 0 ? void 0 : _f.hora) !== null && _g !== void 0 ? _g : null,
                        importadoEn: admin.firestore.FieldValue.serverTimestamp(),
                    }, { merge: true });
                    total++;
                }
                await batch.commit();
            }
            res.json({ ok: true, message: `${total} servicios hábiles UCOT cargados en 'servicios_ucot'`, total });
        }
        catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });
    // GET /api/admin/personal — lista paginada de empleados (ordenada por interno)
    app.get('/api/admin/personal', authMiddleware_1.requireAdmin, async (req, res) => {
        var _a;
        try {
            const limit = Math.min(parseInt(String((_a = req.query.limit) !== null && _a !== void 0 ? _a : '200')), 700);
            const rol = req.query.rol ? String(req.query.rol) : null;
            const db = getDb();
            const col = db.collection('personal');
            const docIdField = admin.firestore.FieldPath.documentId();
            const snap = await col
                .where(docIdField, '>=', 'P')
                .where(docIdField, '<', 'Q')
                .limit(700)
                .get();
            let docs = snap.docs.map(d => (Object.assign({ id: d.id }, d.data())));
            if (rol)
                docs = docs.filter((d) => d.rol === rol || d.role === rol);
            docs = docs
                .sort((a, b) => {
                var _a, _b, _c, _d;
                const na = parseInt((_b = (_a = a.internalNumber) !== null && _a !== void 0 ? _a : a.interno) !== null && _b !== void 0 ? _b : '9999');
                const nb = parseInt((_d = (_c = b.internalNumber) !== null && _c !== void 0 ? _c : b.interno) !== null && _d !== void 0 ? _d : '9999');
                return na - nb;
            })
                .slice(0, limit);
            res.json({ ok: true, total: docs.length, empleados: docs });
        }
        catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });
    // PUT /api/admin/personal/:id — actualiza campos editables
    app.put('/api/admin/personal/:id', authMiddleware_1.requireAdmin, async (req, res) => {
        try {
            const db = getDb();
            const id = String(req.params.id);
            const { cargo, rol, telefono, estado } = req.body;
            const update = { actualizadoEn: admin.firestore.FieldValue.serverTimestamp() };
            if (cargo !== undefined)
                update.cargo = cargo;
            if (rol !== undefined) {
                update.rol = rol;
                update.role = rol;
            }
            if (telefono !== undefined)
                update.telefono = telefono;
            if (estado !== undefined)
                update.estado = estado;
            await db.collection('personal').doc(id).update(update);
            res.json({ ok: true });
        }
        catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });
    // POST /api/admin/seed-sabado-ucot — servicios de sábado (verano)
    app.post('/api/admin/seed-sabado-ucot', authMiddleware_1.requireAdmin, async (_req, res) => {
        var _a, _b, _c;
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
                        primeraSalida: (_c = (_b = (_a = s.vueltas[0]) === null || _a === void 0 ? void 0 : _a.paradas[0]) === null || _b === void 0 ? void 0 : _b.hora) !== null && _c !== void 0 ? _c : null,
                        importadoEn: admin.firestore.FieldValue.serverTimestamp(),
                    }, { merge: true });
                    total++;
                }
                await batch.commit();
            }
            res.json({ ok: true, message: `${total} servicios sábado cargados en 'servicios_ucot'`, total });
        }
        catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });
    // POST /api/admin/seed-boletin-ucot — boletín oficial
    app.post('/api/admin/seed-boletin-ucot', authMiddleware_1.requireAdmin, async (_req, res) => {
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
            res.json({ ok: true, message: `${total} líneas del boletín cargadas (${Object.values(UCOT_BOLETIN).reduce((a, l) => a + l.servicios.length, 0)} servicios)`, total });
        }
        catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });
    // ── Configuración Salarial ─────────────────────────────────────────────────
    // GET /api/admin/config-salarial — lee turnos_vigentes y descuentos
    app.get('/api/admin/config-salarial', authMiddleware_1.requireAdmin, async (_req, res) => {
        try {
            const db = getDb();
            const [turnosDoc, descuentosDoc] = await Promise.all([
                db.collection('config_salarial').doc('turnos_vigentes').get(),
                db.collection('config_salarial').doc('descuentos').get(),
            ]);
            res.json({
                ok: true,
                turnos: turnosDoc.exists ? turnosDoc.data() : null,
                descuentos: descuentosDoc.exists ? descuentosDoc.data() : null,
            });
        }
        catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });
    // PUT /api/admin/config-salarial/turnos — actualiza valores de jornal por categoría
    app.put('/api/admin/config-salarial/turnos', authMiddleware_1.requireAdmin, async (req, res) => {
        try {
            const db = getDb();
            const { categorias, vigenciaDesde, nota } = req.body;
            if (!categorias) {
                res.status(400).json({ ok: false, error: 'categorias requerido' });
                return;
            }
            await db.collection('config_salarial').doc('turnos_vigentes').set({
                categorias,
                vigenciaDesde: vigenciaDesde !== null && vigenciaDesde !== void 0 ? vigenciaDesde : new Date().toISOString().slice(0, 10),
                moneda: 'UYU',
                nota: nota !== null && nota !== void 0 ? nota : '',
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            res.json({ ok: true, message: 'Turnos actualizados' });
        }
        catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });
    // PUT /api/admin/config-salarial/descuentos — actualiza reglas de descuento
    app.put('/api/admin/config-salarial/descuentos', authMiddleware_1.requireAdmin, async (req, res) => {
        try {
            const db = getDb();
            const { items, vigenciaDesde, nota } = req.body;
            if (!items || !Array.isArray(items)) {
                res.status(400).json({ ok: false, error: 'items (array) requerido' });
                return;
            }
            await db.collection('config_salarial').doc('descuentos').set({
                items,
                vigenciaDesde: vigenciaDesde !== null && vigenciaDesde !== void 0 ? vigenciaDesde : new Date().toISOString().slice(0, 10),
                nota: nota !== null && nota !== void 0 ? nota : '',
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            res.json({ ok: true, message: 'Descuentos actualizados' });
        }
        catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });
}
