"use strict";
/**
 * Motor de Consecuencias — Triggers automáticos (Firestore)
 * ===========================================================
 * Cuando algo real pasa en el sistema, el motor se dispara solo.
 * No requiere acción del usuario — la cascada se calcula y las
 * alertas aparecen automáticamente en el dashboard.
 *
 * Colecciones vigiladas:
 *  - licencias_personal  → onAbsenceCreated
 *  - daily_shifts        → onShiftAssigned
 *  - vehicle_events      → onVehicleStatusChanged
 *  - otp_daily           → onOTPUpdated
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.onOTPUpdated = exports.onVehicleStatusChanged = exports.onShiftAssigned = exports.onAbsenceCreated = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const firestore_2 = require("firebase-admin/firestore");
const consequenceEngine_1 = require("./consequenceEngine");
const index_1 = require("./rules/index");
// ── Helpers compartidos ───────────────────────────────────────────────────────
async function construirContextoFirestore(evento) {
    var _a, _b, _c, _d, _e, _f;
    const db = (0, firestore_2.getFirestore)();
    const empresaId = evento.empresaId;
    const conductorId = evento.conductorId;
    const lineaId = evento.lineaId;
    const fecha = (_a = evento.fecha) !== null && _a !== void 0 ? _a : new Date().toISOString().slice(0, 10);
    let ausenciasUltimos30Dias = 0;
    let reservasDisponibles = [];
    let otpActualLinea = 90;
    let busesEnLinea = 10;
    let viajesAfectados = 3;
    try {
        // Ausencias del conductor en los últimos 30 días
        if (conductorId) {
            const hace30 = new Date();
            hace30.setDate(hace30.getDate() - 30);
            const snap = await db.collection('licencias_personal')
                .where('employeeId', '==', conductorId)
                .where('empresaId', '==', empresaId)
                .where('startDate', '>=', hace30.toISOString().slice(0, 10))
                .get();
            ausenciasUltimos30Dias = snap.size;
        }
        // Conductores de reserva disponibles
        const res = await db.collection('daily_shifts')
            .where('empresaId', '==', empresaId)
            .where('date', '==', fecha)
            .where('estado', '==', 'reserva_disponible')
            .limit(5).get();
        reservasDisponibles = res.docs.map(d => {
            var _a;
            return ({
                id: d.id,
                nombre: (_a = d.data().conductorNombre) !== null && _a !== void 0 ? _a : 'Socio de reserva',
            });
        });
        // OTP actual de la línea
        if (lineaId) {
            const otp = await db.collection('otp_daily')
                .where('lineaId', '==', lineaId)
                .where('empresaId', '==', empresaId)
                .orderBy('fecha', 'desc').limit(1).get();
            if (!otp.empty)
                otpActualLinea = (_b = otp.docs[0].data().otp) !== null && _b !== void 0 ? _b : 90;
            // Buses activos en la línea
            const buses = await db.collection('vehicle_events')
                .where('lineaId', '==', lineaId)
                .where('empresaId', '==', empresaId)
                .where('estado', '==', 'activo')
                .get();
            busesEnLinea = buses.size || 10;
        }
        // Viajes del turno afectado
        const turnoId = evento.turnoId;
        if (turnoId) {
            const turno = await db.collection('daily_shifts').doc(turnoId).get();
            if (turno.exists) {
                viajesAfectados = (_d = (_c = turno.data()) === null || _c === void 0 ? void 0 : _c.tripCount) !== null && _d !== void 0 ? _d : 3;
                busesEnLinea = (_f = (_e = turno.data()) === null || _e === void 0 ? void 0 : _e.busesEnLinea) !== null && _f !== void 0 ? _f : busesEnLinea;
            }
        }
    }
    catch (_) { /* usar defaults */ }
    return { ausenciasUltimos30Dias, reservasDisponibles, otpActualLinea, busesEnLinea, viajesAfectados, pasajerosPromedio: 35 };
}
async function persistirCascada(resultado, sourceCollection, sourceDocId) {
    var _a, _b, _c, _d;
    const db = (0, firestore_2.getFirestore)();
    // 1. Guardar el resultado completo en consequence_events (trazabilidad)
    await db.collection('consequence_events').add(Object.assign(Object.assign({}, resultado), { sourceCollection,
        sourceDocId, createdAt: firestore_2.FieldValue.serverTimestamp() }));
    // 2. Escribir alertas críticas/con acción a alertas_regulacion (aparecen en el dashboard)
    const alertables = resultado.efectos.filter(e => e.severidad === 'critico' || e.severidad === 'advertencia' || e.requiereAccion);
    for (const efecto of alertables) {
        await db.collection('alertas_regulacion').add({
            tipo: 'CONSECUENCIA_OPERATIVA',
            dominio: efecto.dominio,
            titulo: efecto.titulo,
            mensaje: efecto.descripcion,
            urgencia: efecto.severidad === 'critico' ? 'critica' : 'alta',
            empresaId: resultado.evento.empresaId,
            accionSugerida: (_a = efecto.accionSugerida) !== null && _a !== void 0 ? _a : null,
            delta: (_b = efecto.delta) !== null && _b !== void 0 ? _b : null,
            unidad: (_c = efecto.unidad) !== null && _c !== void 0 ? _c : null,
            sourceEventType: resultado.evento.tipo,
            timestamp: firestore_2.FieldValue.serverTimestamp(),
            leido: false,
        });
    }
    // 3. Si hay impacto en subsidio: registrar en subsidy_ledger
    const subsidioEfecto = resultado.efectos.find(e => e.dominio === 'SUBSIDIO' && e.delta !== undefined);
    if (subsidioEfecto === null || subsidioEfecto === void 0 ? void 0 : subsidioEfecto.delta) {
        await db.collection('subsidy_ledger').add({
            empresaId: resultado.evento.empresaId,
            fecha: (_d = resultado.evento.fecha) !== null && _d !== void 0 ? _d : new Date().toISOString().slice(0, 10),
            tipo: 'IMPACTO_EVENTO',
            eventoTipo: resultado.evento.tipo,
            delta: subsidioEfecto.delta,
            descripcion: subsidioEfecto.descripcion,
            sourceDocId,
            createdAt: firestore_2.FieldValue.serverTimestamp(),
        });
    }
}
// ── Trigger 1: Conductor ausente (licencias_personal) ────────────────────────
exports.onAbsenceCreated = (0, firestore_1.onDocumentCreated)({ document: 'licencias_personal/{docId}', region: 'us-central1' }, async (event) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const data = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!data)
        return;
    const empresaId = (_b = data.empresaId) !== null && _b !== void 0 ? _b : '70';
    const reglas = (0, index_1.obtenerReglasEmpresa)(empresaId);
    if (!reglas)
        return;
    const evento = {
        tipo: 'CONDUCTOR_AUSENTE',
        empresaId,
        conductorId: (_d = (_c = data.employeeId) !== null && _c !== void 0 ? _c : data.conductorId) !== null && _d !== void 0 ? _d : 'desconocido',
        conductorNombre: (_f = (_e = data.employeeName) !== null && _e !== void 0 ? _e : data.conductorNombre) !== null && _f !== void 0 ? _f : 'Conductor',
        fecha: (_g = data.startDate) !== null && _g !== void 0 ? _g : new Date().toISOString().slice(0, 10),
        codigoAusencia: mapCodigoAusencia((_h = data.tipoLicencia) !== null && _h !== void 0 ? _h : data.codigoAusencia),
        turnoId: (_j = data.turnoId) !== null && _j !== void 0 ? _j : undefined,
        lineaId: (_k = data.lineaId) !== null && _k !== void 0 ? _k : undefined,
    };
    const contexto = await construirContextoFirestore(evento);
    const resultado = (0, consequenceEngine_1.propagarEvento)(evento, reglas, contexto);
    await persistirCascada(resultado, 'licencias_personal', event.params.docId);
});
// ── Trigger 2: Turno asignado (daily_shifts) ──────────────────────────────────
exports.onShiftAssigned = (0, firestore_1.onDocumentCreated)({ document: 'daily_shifts/{docId}', region: 'us-central1' }, async (event) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
    const data = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!data || !data.conductorId || data.estado === 'reserva_disponible')
        return;
    const empresaId = (_b = data.empresaId) !== null && _b !== void 0 ? _b : '70';
    const reglas = (0, index_1.obtenerReglasEmpresa)(empresaId);
    if (!reglas)
        return;
    const evento = {
        tipo: 'CONDUCTOR_ASIGNADO',
        empresaId,
        conductorId: data.conductorId,
        conductorNombre: (_c = data.conductorNombre) !== null && _c !== void 0 ? _c : 'Conductor',
        turnoId: event.params.docId,
        lineaId: (_e = (_d = data.lineaId) !== null && _d !== void 0 ? _d : data.linea) !== null && _e !== void 0 ? _e : '',
        cocheId: (_g = (_f = data.cocheId) !== null && _f !== void 0 ? _f : data.coche) !== null && _g !== void 0 ? _g : '',
        fecha: (_h = data.date) !== null && _h !== void 0 ? _h : new Date().toISOString().slice(0, 10),
        horaInicio: (_j = data.horaInicio) !== null && _j !== void 0 ? _j : 6,
        duracionHoras: (_k = data.duracionHoras) !== null && _k !== void 0 ? _k : 8,
        esTurnoPartido: (_l = data.esTurnoPartido) !== null && _l !== void 0 ? _l : false,
        tipoDia: (_m = data.tipoDia) !== null && _m !== void 0 ? _m : 'habil',
        kmEsperados: (_o = data.kmEsperados) !== null && _o !== void 0 ? _o : 100,
        aniosAntiguedad: (_p = data.aniosAntiguedad) !== null && _p !== void 0 ? _p : 0,
    };
    const contexto = await construirContextoFirestore(evento);
    const resultado = (0, consequenceEngine_1.propagarEvento)(evento, reglas, contexto);
    // Para asignaciones: no generar alertas (es info), pero sí guardar el cálculo salarial
    await (0, firestore_2.getFirestore)().collection('consequence_events').add(Object.assign(Object.assign({}, resultado), { sourceCollection: 'daily_shifts', sourceDocId: event.params.docId, createdAt: firestore_2.FieldValue.serverTimestamp() }));
    // Actualizar el documento del turno con el salario calculado
    const salario = reglas.calcularSalarioTurno(evento);
    await event.data.ref.update({
        salarioCalculado: salario,
        subsidioEsperado: reglas.calcularImpactoSubsidio((_q = evento.kmEsperados) !== null && _q !== void 0 ? _q : 0, (_r = evento.lineaId) !== null && _r !== void 0 ? _r : ''),
        updatedAt: firestore_2.FieldValue.serverTimestamp(),
    });
});
// ── Trigger 3: Vehículo fuera de servicio (vehicle_events) ────────────────────
exports.onVehicleStatusChanged = (0, firestore_1.onDocumentUpdated)({ document: 'vehicle_events/{docId}', region: 'us-central1' }, async (event) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    const before = (_b = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before) === null || _b === void 0 ? void 0 : _b.data();
    const after = (_d = (_c = event.data) === null || _c === void 0 ? void 0 : _c.after) === null || _d === void 0 ? void 0 : _d.data();
    if (!after)
        return;
    const fueraDespues = after.estado === 'fuera_de_servicio' || after.estado === 'averia';
    const fueraBefore = (before === null || before === void 0 ? void 0 : before.estado) === 'fuera_de_servicio' || (before === null || before === void 0 ? void 0 : before.estado) === 'averia';
    if (!fueraDespues || fueraBefore)
        return; // solo cuando recién entra en estado fuera
    const empresaId = (_e = after.empresaId) !== null && _e !== void 0 ? _e : '70';
    const reglas = (0, index_1.obtenerReglasEmpresa)(empresaId);
    if (!reglas)
        return;
    const evento = {
        tipo: 'VEHICULO_FUERA_DE_SERVICIO',
        empresaId,
        cocheId: event.params.docId,
        cocheNumero: (_g = (_f = after.codigoVehiculo) !== null && _f !== void 0 ? _f : after.numero) !== null && _g !== void 0 ? _g : '?',
        motivo: mapMotivoVehiculo(after.estado, after.motivo),
        lineaId: (_j = (_h = after.lineaId) !== null && _h !== void 0 ? _h : after.linea) !== null && _j !== void 0 ? _j : undefined,
        turnoAfectadoId: (_k = after.turnoId) !== null && _k !== void 0 ? _k : undefined,
        conductorAfectadoId: (_l = after.conductorId) !== null && _l !== void 0 ? _l : undefined,
        horasEstimadas: (_m = after.horasEstimadas) !== null && _m !== void 0 ? _m : 4,
    };
    const contexto = await construirContextoFirestore(evento);
    const resultado = (0, consequenceEngine_1.propagarEvento)(evento, reglas, contexto);
    await persistirCascada(resultado, 'vehicle_events', event.params.docId);
});
// ── Trigger 4: OTP daily actualizado ─────────────────────────────────────────
exports.onOTPUpdated = (0, firestore_1.onDocumentCreated)({ document: 'otp_daily/{docId}', region: 'us-central1' }, async (event) => {
    var _a, _b, _c;
    const data = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!data)
        return;
    const otp = (_b = data.otp) !== null && _b !== void 0 ? _b : 100;
    const umbral = 85; // TODO: leer de parámetros operativos por empresa
    // Solo generar alerta si el OTP cae bajo umbral
    if (otp >= umbral)
        return;
    const db = (0, firestore_2.getFirestore)();
    await db.collection('alertas_regulacion').add({
        tipo: 'OTP_BAJO_UMBRAL',
        dominio: 'OTP',
        titulo: `OTP bajo umbral — Línea ${data.lineaId}`,
        mensaje: `OTP del día: ${otp.toFixed(1)}% (umbral STM: ${umbral}%). Riesgo de penalidad en subsidio mensual.`,
        urgencia: otp < 80 ? 'critica' : 'alta',
        empresaId: (_c = data.empresaId) !== null && _c !== void 0 ? _c : '70',
        lineaId: data.lineaId,
        otpValue: otp,
        umbral,
        accionSugerida: 'Revisar distribución de frecuencias. Evaluar ajuste de tiempos en boletín.',
        timestamp: firestore_2.FieldValue.serverTimestamp(),
        leido: false,
    });
});
// ── Mappers de códigos ────────────────────────────────────────────────────────
function mapCodigoAusencia(raw) {
    const map = {
        medica: 'licencia_medica',
        enfermedad: 'licencia_medica',
        gremial: 'licencia_gremial',
        accidente: 'accidente_trabajo',
        injustificada: 'ausencia_injustificada',
        justificada: 'ausencia_justificada',
    };
    if (!raw)
        return 'ausencia_justificada';
    const key = raw.toLowerCase().replace(/[_\s]/g, '');
    for (const [k, v] of Object.entries(map)) {
        if (key.includes(k))
            return v;
    }
    return raw; // pasar tal cual si ya está en formato correcto
}
function mapMotivoVehiculo(estado, motivo) {
    if (motivo)
        return motivo;
    if (estado === 'averia')
        return 'averia';
    if (estado === 'mantenimiento')
        return 'mantenimiento_preventivo';
    if (estado === 'accidente')
        return 'accidente';
    return 'averia';
}
