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
exports.registerListeroRoutes = registerListeroRoutes;
/**
 * /api/listero/* — Programación Diaria y Cascada Operativa
 *
 * Endpoints para:
 * - Gestión de turnos del día
 * - Registro de ausencias de conductores
 * - Asignación de reservas y vehículos de taller
 * - Alertas operativas
 * - Auto-generación de programación diaria
 *
 * Extraído de `intelligenceApi.ts` el 2026-04-24 como parte de la división
 * por dominio (ADR 003).
 */
const admin = __importStar(require("firebase-admin"));
const timeUtils_1 = require("../shared/timeUtils");
const getDb = () => admin.firestore();
// Importancia operativa por línea (para priorización de cobertura)
const IMPORTANCIA_LINEA_MAP = {
    '300': 5, '306': 5, '329': 4, '330': 4, '17': 4,
    '316': 4, '328': 3, '370': 3, '79': 3, '396': 2,
};
/**
 * Registra todas las rutas /api/listero/* en la app Express provista.
 */
function registerListeroRoutes(app) {
    // GET /api/listero/turnos?fecha=&turno=&agencyId=
    // agencyId opcional — si presente filtra por operador. Si ausente, devuelve
    // todos (compat con clientes legacy que no envían agencyId).
    app.get('/api/listero/turnos', async (req, res) => {
        const fecha = String(req.query.fecha || (0, timeUtils_1.fechaHoyMVD)());
        const turno = req.query.turno;
        const agencyId = req.query.agencyId;
        try {
            let q = getDb().collection('turnos_dia').where('fecha', '==', fecha);
            if (turno && turno !== 'todos')
                q = q.where('turnoNombre', '==', turno);
            if (agencyId)
                q = q.where('agencyId', '==', String(agencyId));
            const snap = await q.get();
            const turnos = snap.docs.map((d) => (Object.assign({ id: d.id }, d.data())));
            res.json({ ok: true, turnos });
        }
        catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });
    // POST /api/listero/turnos
    app.post('/api/listero/turnos', async (req, res) => {
        try {
            const data = Object.assign(Object.assign({}, req.body), { creadoEn: admin.firestore.FieldValue.serverTimestamp() });
            data.fecha = data.fecha || (0, timeUtils_1.fechaHoyMVD)();
            data.estado = data.estado || 'programado';
            const ref = await getDb().collection('turnos_dia').add(data);
            res.json({ ok: true, id: ref.id });
        }
        catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });
    // PATCH /api/listero/turnos/:id
    app.patch('/api/listero/turnos/:id', async (req, res) => {
        try {
            await getDb().collection('turnos_dia').doc(req.params.id).update(Object.assign(Object.assign({}, req.body), { actualizadoEn: admin.firestore.FieldValue.serverTimestamp() }));
            res.json({ ok: true });
        }
        catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });
    // GET /api/listero/conductores?agencyId=
    app.get('/api/listero/conductores', async (req, res) => {
        const agencyId = req.query.agencyId;
        try {
            let q = getDb().collection('personal');
            if (agencyId)
                q = q.where('agencyId', '==', String(agencyId));
            const snap = await q.get();
            const conductores = snap.docs.map((d) => {
                var _a, _b, _c, _d, _e;
                const data = d.data();
                return {
                    id: d.id,
                    internalNumber: data.internalNumber || d.id,
                    fullName: data.fullName || data.nombre || 'Sin nombre',
                    rol: data.rol || data.role || 'Driver',
                    estadoHoy: data.estadoHoy || 'disponible',
                    turnoAsignado: (_a = data.turnoAsignado) !== null && _a !== void 0 ? _a : null,
                    lineaAsignada: (_b = data.lineaAsignada) !== null && _b !== void 0 ? _b : null,
                    vehiculoAsignado: (_c = data.vehiculoAsignado) !== null && _c !== void 0 ? _c : null,
                    esConductorReserva: (_d = data.esConductorReserva) !== null && _d !== void 0 ? _d : (data.rol === 'reserva'),
                    telefono: (_e = data.telefono) !== null && _e !== void 0 ? _e : null,
                };
            });
            res.json({ ok: true, conductores });
        }
        catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });
    // POST /api/listero/ausencia
    app.post('/api/listero/ausencia', async (req, res) => {
        const { conductorId, conductorNombre, motivo, fecha } = req.body;
        const fechaHoy = fecha || (0, timeUtils_1.fechaHoyMVD)();
        try {
            if (conductorId) {
                await getDb().collection('personal').doc(conductorId).set({ estadoHoy: 'ausente', motivoAusencia: motivo, fechaAusencia: fechaHoy }, { merge: true });
            }
            const turnosSnap = await getDb().collection('turnos_dia')
                .where('conductorId', '==', conductorId)
                .where('fecha', '==', fechaHoy)
                .get();
            const turnosAfectados = [];
            let lineaId = 'desconocida';
            let importanciaLinea = 3;
            for (const doc of turnosSnap.docs) {
                const td = doc.data();
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
            const reservasDisponibles = reservasSnap.docs.map((d) => (Object.assign({ id: d.id }, d.data())));
            let urgencia;
            let tipo;
            if (reservasDisponibles.length === 0 && importanciaLinea >= 4) {
                urgencia = 'critica';
                tipo = 'infraccion_imminente';
            }
            else if (importanciaLinea >= 5) {
                urgencia = 'critica';
                tipo = 'ausencia_conductor';
            }
            else if (importanciaLinea >= 4) {
                urgencia = 'alta';
                tipo = 'ausencia_conductor';
            }
            else {
                urgencia = 'media';
                tipo = 'ausencia_conductor';
            }
            await getDb().collection('alertas_operativas').add({
                tipo, urgencia, lineaId, conductorId,
                titulo: `Ausencia: ${conductorNombre || conductorId}`,
                mensaje: `${conductorNombre || conductorId} registró ausencia (${motivo}). Línea ${lineaId} afectada. ${reservasDisponibles.length} reservas disponibles.`,
                accionSugerida: reservasDisponibles.length > 0
                    ? `Asignar ${reservasDisponibles[0].fullName} como reserva`
                    : 'Contactar MTOP para permiso de frecuencia reducida',
                turnosAfectados,
                reservasDisponibles: reservasDisponibles.map((r) => ({ id: r.id, fullName: r.fullName })),
                impactoIngresosUSD: turnosAfectados.length * importanciaLinea * 30,
                atendida: false, fecha: fechaHoy,
                creadoEn: admin.firestore.FieldValue.serverTimestamp(),
            });
            const allSnap = await getDb().collection('turnos_dia').where('fecha', '==', fechaHoy).get();
            const total = allSnap.size;
            const sinConductor = allSnap.docs.filter((d) => d.data().estado === 'sin_conductor').length;
            if (total > 0 && sinConductor / total > 0.2) {
                await getDb().collection('alertas_operativas').add({
                    tipo: 'cobertura_critica', urgencia: 'critica', lineaId: null,
                    titulo: 'Cobertura de flota crítica',
                    mensaje: `${sinConductor} de ${total} turnos sin conductor (${Math.round((sinConductor / total) * 100)}% sin cubrir).`,
                    accionSugerida: 'Activar protocolo de emergencia: llamar al retén completo',
                    atendida: false, fecha: fechaHoy,
                    creadoEn: admin.firestore.FieldValue.serverTimestamp(),
                });
            }
            res.json({ ok: true, turnosAfectados, reservasDisponibles: reservasDisponibles.length, urgencia });
        }
        catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });
    // POST /api/listero/reserva
    app.post('/api/listero/reserva', async (req, res) => {
        const { turnoId, conductorReservaId, conductorReservaNombre } = req.body;
        try {
            await getDb().collection('turnos_dia').doc(turnoId).update({
                estado: 'cubierto_reserva',
                conductorReservaId, conductorReservaNombre,
                reservaActivada: true,
                actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
            });
            if (conductorReservaId) {
                await getDb().collection('personal').doc(conductorReservaId).set({ estadoHoy: 'en_servicio' }, { merge: true });
            }
            res.json({ ok: true });
        }
        catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });
    // GET /api/listero/vehiculos-reserva
    app.get('/api/listero/vehiculos-reserva', async (_req, res) => {
        try {
            const snap = await getDb().collection('vehicles').where('estadoHoy', '==', 'disponible').get();
            const vehiculos = snap.docs.map((d) => (Object.assign({ id: d.id }, d.data())));
            res.json({ ok: true, vehiculos });
        }
        catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });
    // POST /api/listero/vehiculo-taller
    app.post('/api/listero/vehiculo-taller', async (req, res) => {
        const { vehiculoId, vehiculoInterno, motivo, fecha } = req.body;
        const fechaHoy = fecha || (0, timeUtils_1.fechaHoyMVD)();
        try {
            if (vehiculoId) {
                await getDb().collection('vehicles').doc(vehiculoId).set({ estadoHoy: 'en_taller', motivoTaller: motivo }, { merge: true });
            }
            const turnosSnap = await getDb().collection('turnos_dia')
                .where('vehiculoId', '==', vehiculoId)
                .where('fecha', '==', fechaHoy)
                .get();
            const turnosAfectados = [];
            for (const doc of turnosSnap.docs) {
                const td = doc.data();
                if (td.estado === 'programado' || td.estado === 'activo') {
                    await doc.ref.update({ estado: 'sin_conductor', vehiculoEnTaller: true, actualizadoEn: admin.firestore.FieldValue.serverTimestamp() });
                    turnosAfectados.push(doc.id);
                }
            }
            await getDb().collection('alertas_operativas').add({
                tipo: 'vehiculo_en_taller', urgencia: 'alta', lineaId: null,
                titulo: `Coche ${vehiculoInterno || vehiculoId} en taller`,
                mensaje: `Coche ${vehiculoInterno || vehiculoId} enviado a taller: ${motivo}. ${turnosAfectados.length} turnos afectados.`,
                accionSugerida: 'Buscar vehículo de reemplazo en el parque disponible',
                turnosAfectados, atendida: false, fecha: fechaHoy,
                creadoEn: admin.firestore.FieldValue.serverTimestamp(),
            });
            res.json({ ok: true, turnosAfectados });
        }
        catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });
    // POST /api/listero/firma
    app.post('/api/listero/firma', async (req, res) => {
        const { turnoId, horaFirma } = req.body;
        try {
            await getDb().collection('turnos_dia').doc(turnoId).update({
                firmaConductor: true,
                horaFirma: horaFirma || (0, timeUtils_1.hhmmAhoraMontevideo)(),
                actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
            });
            res.json({ ok: true });
        }
        catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });
    // GET /api/listero/alertas?fecha=&agencyId=
    app.get('/api/listero/alertas', async (req, res) => {
        const fecha = String(req.query.fecha || (0, timeUtils_1.fechaHoyMVD)());
        const historial = req.query.historial === 'true';
        const agencyId = req.query.agencyId;
        try {
            let q = getDb().collection('alertas_operativas').where('fecha', '==', fecha);
            if (agencyId)
                q = q.where('agencyId', '==', String(agencyId));
            const snap = await q.get();
            const alertas = snap.docs
                .map((d) => (Object.assign({ id: d.id }, d.data())))
                .filter((a) => historial || !a.atendida)
                .sort((a, b) => { var _a, _b; return ((((_a = b.creadoEn) === null || _a === void 0 ? void 0 : _a.seconds) || 0) - (((_b = a.creadoEn) === null || _b === void 0 ? void 0 : _b.seconds) || 0)); })
                .slice(0, 50);
            res.json({ ok: true, alertas });
        }
        catch (err) {
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
        }
        catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });
    // GET /api/listero/resumen?fecha=&agencyId=
    app.get('/api/listero/resumen', async (req, res) => {
        const fecha = String(req.query.fecha || (0, timeUtils_1.fechaHoyMVD)());
        const agencyId = req.query.agencyId;
        const withAgency = (q) => agencyId ? q.where('agencyId', '==', String(agencyId)) : q;
        try {
            const [turnosSnap, conductoresSnap, vehiculosSnap, alertasSnap] = await Promise.all([
                withAgency(getDb().collection('turnos_dia').where('fecha', '==', fecha)).get(),
                withAgency(getDb().collection('personal')).get(),
                withAgency(getDb().collection('vehicles')).get(),
                withAgency(getDb().collection('alertas_operativas').where('fecha', '==', fecha).where('atendida', '==', false)).get(),
            ]);
            const turnos = turnosSnap.docs.map((d) => d.data());
            const conductores = conductoresSnap.docs.map((d) => d.data());
            const vehiculos = vehiculosSnap.docs.map((d) => d.data());
            const turnosTotal = turnos.length;
            const turnosCubiertos = turnos.filter((t) => ['activo', 'completado', 'programado', 'cubierto_reserva'].includes(t.estado)).length;
            const turnosSinConductor = turnos.filter((t) => t.estado === 'sin_conductor').length;
            const coberturaFlota = turnosTotal > 0 ? Math.round((turnosCubiertos / turnosTotal) * 100) : 100;
            const lineasEnRiesgoIMM = [
                ...new Set(turnos
                    .filter((t) => t.estado === 'sin_conductor' && (t.importanciaLinea || 0) >= 4)
                    .map((t) => t.lineaId)),
            ].filter(Boolean);
            res.json({
                ok: true,
                resumen: {
                    fecha, turnosTotal, turnosCubiertos, turnosSinConductor,
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
        }
        catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });
    // POST /api/listero/generar-programacion
    app.post('/api/listero/generar-programacion', async (req, res) => {
        var _a;
        const fecha = String(((_a = req.body) === null || _a === void 0 ? void 0 : _a.fecha) || (0, timeUtils_1.fechaHoyMVD)());
        try {
            const existSnap = await getDb().collection('turnos_dia').where('fecha', '==', fecha).get();
            if (!existSnap.empty) {
                res.json({ ok: true, message: `Ya existen ${existSnap.size} turnos para ${fecha}`, created: 0 });
                return;
            }
            let conductoresSnap = await getDb().collection('personal').get();
            if (conductoresSnap.empty)
                conductoresSnap = await getDb().collection('users').get();
            let vehiculosSnap = await getDb().collection('vehicles').get();
            if (vehiculosSnap.empty)
                vehiculosSnap = await getDb().collection('vehiculos').get();
            const conductores = conductoresSnap.docs
                .map((d) => (Object.assign({ id: d.id }, d.data())))
                .filter((c) => c.internalNumber || c.legajo || c.fullName || c.nombre);
            const vehiculos = vehiculosSnap.docs
                .map((d) => (Object.assign({ id: d.id }, d.data())))
                .filter((v) => v.interno || v.coche || v.numero);
            if (conductores.length === 0) {
                const seedBatch = getDb().batch();
                const nombres = ['Carlos Pérez', 'María González', 'Juan Rodríguez', 'Ana Martínez', 'Luis García', 'Rosa López', 'Miguel Fernández', 'Laura Díaz'];
                nombres.forEach((nombre, i) => {
                    const ref = getDb().collection('personal').doc(`C${String(i + 1).padStart(3, '0')}`);
                    const [n, a] = nombre.split(' ');
                    seedBatch.set(ref, {
                        internalNumber: String(100 + i),
                        fullName: nombre, firstName: n, lastName: a,
                        rol: i === 7 ? 'reserva' : 'Driver',
                        estadoHoy: 'disponible',
                        esConductorReserva: i >= 6,
                        telefono: `09${String(10000000 + i * 7)}`,
                        generadoPorSistema: true,
                    }, { merge: true });
                });
                await seedBatch.commit();
                const freshSnap = await getDb().collection('personal').get();
                conductores.push(...freshSnap.docs.map((d) => (Object.assign({ id: d.id }, d.data()))));
            }
            if (vehiculos.length === 0) {
                const vBatch = getDb().batch();
                for (let i = 0; i < 12; i++) {
                    const interno = String(115 + i * 7);
                    const ref = getDb().collection('vehicles').doc(`VEH${interno}`);
                    vBatch.set(ref, {
                        interno, numero: interno,
                        tipo: i < 4 ? 'electrico' : i < 8 ? 'hibrido' : 'diesel',
                        estadoHoy: 'disponible', capacidad: 80,
                        anio: 2018 + (i % 5),
                        generadoPorSistema: true,
                    }, { merge: true });
                }
                await vBatch.commit();
                const freshSnap = await getDb().collection('vehicles').get();
                vehiculos.push(...freshSnap.docs.map((d) => (Object.assign({ id: d.id }, d.data()))));
            }
            const lineasOperativas = [
                { id: '300', importancia: 5, terminal: 'Instrucciones - Plaza Zitarrosa' },
                { id: '306', importancia: 5, terminal: 'Parque Roosevelt - Casabó' },
                { id: '329', importancia: 4, terminal: 'Punta Carretas - Melilla' },
                { id: '330', importancia: 4, terminal: 'Instrucciones - Ciudadela' },
                { id: '17', importancia: 4, terminal: 'Punta Carretas - Casabó' },
                { id: '316', importancia: 4, terminal: 'Cno. Maldonado - Pocitos' },
                { id: '328', importancia: 3, terminal: 'Mendoza - Punta Carretas' },
                { id: '370', importancia: 3, terminal: 'Portones - Playa del Cerro' },
                { id: '79', importancia: 3, terminal: 'Pocitos - Paso de la Arena' },
            ];
            const bloquesTurno = [
                { nombre: 'madrugada', horas: ['04:30', '05:00', '05:30'] },
                { nombre: 'mañana', horas: ['06:00', '06:30', '07:00', '07:30', '08:00'] },
                { nombre: 'tarde', horas: ['12:00', '12:30', '13:00', '13:30'] },
                { nombre: 'noche', horas: ['18:00', '18:30', '19:00', '19:30'] },
            ];
            const batch = getDb().batch();
            let cIdx = 0, vIdx = 0, created = 0;
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
                            fecha, conductorId: c.id,
                            conductorNombre: c.fullName || c.nombre || `Cond ${c.internalNumber || c.legajo || cIdx}`,
                            conductorInterno: String(c.internalNumber || c.legajo || cIdx + 100),
                            vehiculoId: v.id,
                            vehiculoInterno: String(v.interno || v.coche || v.numero || vIdx + 100),
                            lineaId: linea.id, turnoNombre: bloque.nombre, turno: bloque.nombre,
                            horaSalida: hora, horaLlegadaEstimada: horaLlegada,
                            terminal: linea.terminal, estado: 'programado',
                            importanciaLinea: linea.importancia,
                            impactoIngresosEstimado: linea.importancia * 30,
                            firmaConductor: false, horaFirma: null,
                            reservaActivada: false,
                            conductorReservaId: null, conductorReservaNombre: null,
                            observaciones: null, generadoAutomaticamente: true,
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
        }
        catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });
}
