"use strict";
/**
 * listeroService — Motor de programación diaria de UCOT
 *
 * FASE 2.3 (2026-05-10): Migrado de Firestore a PostgreSQL local.
 * Tablas: turnos_dia, personal, vehiculos, alertas_operativas (schema_fase2.sql).
 *
 * Flujo real:
 *   Listero arma turnos_dia (conductor + vehículo + línea + horario)
 *   → Conductor se presenta o falta
 *   → Si falta: cascadeEngine busca reserva + genera alertas
 *   → Largador confirma sustitución o cancela el servicio
 *   → KPIs se actualizan en tiempo real
 *
 * Política de datos (regla -2): toda salida desde tablas Postgres reales,
 * nunca placeholders. Si la tabla está vacía devuelve [].
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTurnosByFecha = getTurnosByFecha;
exports.createTurno = createTurno;
exports.updateTurno = updateTurno;
exports.deleteTurno = deleteTurno;
exports.getConductoresDia = getConductoresDia;
exports.marcarAusencia = marcarAusencia;
exports.buscarReservasDisponibles = buscarReservasDisponibles;
exports.asignarReserva = asignarReserva;
exports.marcarVehiculoEnTaller = marcarVehiculoEnTaller;
exports.buscarVehiculosReserva = buscarVehiculosReserva;
exports.registrarFirma = registrarFirma;
exports.getResumenDiario = getResumenDiario;
const database_1 = __importDefault(require("../config/database"));
const index_1 = require("../types/index");
const logger_1 = __importDefault(require("../config/logger"));
const uuid_1 = require("uuid");
// ─── Importancia de línea (para priorizar reservas) ──────────────────────────
const IMPORTANCIA_LINEA = {
    '300': 5,
    '306': 5,
    '329': 4,
    '330': 4,
    '17': 4,
    '316': 4,
    '328': 3,
    '370': 3,
    '79': 3,
    '396': 2,
    default: 2,
};
const PASAJEROS_POR_SERVICIO = {
    '300': 45,
    '306': 40,
    '329': 38,
    '330': 35,
    '17': 42,
    '316': 36,
    '328': 30,
    '370': 28,
    '79': 25,
    default: 20,
};
const TARIFA_PROMEDIO_UYU = 38;
const TIPO_CAMBIO_USD = 40;
function calcularImpactoIngresosUSD(lineaId) {
    const pasajeros = PASAJEROS_POR_SERVICIO[lineaId] ?? PASAJEROS_POR_SERVICIO.default;
    return Math.round((pasajeros * TARIFA_PROMEDIO_UYU) / TIPO_CAMBIO_USD);
}
// ─── Helpers ─────────────────────────────────────────────────────────────────
function horaAMinutos(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
}
function minutosDescansoEntre(horaFin, horaInicio) {
    const fin = horaAMinutos(horaFin);
    const ini = horaAMinutos(horaInicio);
    return ini >= fin ? ini - fin : 24 * 60 - fin + ini;
}
function rowToTurno(r) {
    return {
        id: r.id,
        fecha: typeof r.fecha === 'string' ? r.fecha : r.fecha.toISOString?.().slice(0, 10) ?? r.fecha,
        conductorId: r.conductor_id,
        conductorNombre: r.conductor_nombre,
        conductorInterno: r.conductor_interno,
        vehiculoId: r.vehiculo_id,
        vehiculoInterno: r.vehiculo_interno,
        lineaId: r.linea_id,
        varianteKey: r.variante_key,
        turno: r.turno,
        horaSalida: r.hora_salida,
        horaLlegadaEstimada: r.hora_llegada_estimada,
        terminal: r.terminal,
        estado: r.estado,
        reservaActivada: r.reserva_activada,
        conductorReservaId: r.conductor_reserva_id,
        conductorReservaNombre: r.conductor_reserva_nombre,
        importanciaLinea: r.importancia_linea,
        impactoIngresosEstimado: r.impacto_ingresos_estimado != null ? Number(r.impacto_ingresos_estimado) : null,
        observaciones: r.observaciones,
        firmaConductor: r.firma_conductor,
        horaFirma: r.hora_firma,
        createdAt: r.created_at ?? null,
        updatedAt: r.updated_at ?? null,
    };
}
function rowToConductor(r, turno) {
    return {
        id: r.id,
        internalNumber: r.internal_number ?? '',
        fullName: r.full_name ?? '',
        rol: r.role ?? 'conductor',
        estadoHoy: (r.estado_hoy ?? 'disponible'),
        turnoAsignado: turno ? turno.turno : null,
        lineaAsignada: turno ? turno.lineaId : null,
        vehiculoAsignado: turno ? turno.vehiculoInterno : null,
        horaUltimoServicio: r.hora_ultimo_servicio,
        esConductorReserva: r.es_conductor_reserva ?? false,
        telefono: r.telefono,
    };
}
function rowToVehiculoDia(r) {
    const d = (r.data_jsonb ?? {});
    return {
        id: r.id,
        interno: r.internal_number ?? d.interno ?? r.id,
        patente: r.plate ?? d.patente ?? null,
        tipo: (d.tipo ?? 'diesel'),
        estadoHoy: (d.estadoHoy ?? 'disponible'),
        lineaAsignada: d.lineaAsignada ?? null,
        conductorAsignado: d.conductorAsignado ?? null,
        bateriaActual: d.bateriaActual ?? null,
        kilometrajeHoy: d.kilometrajeHoy ?? null,
        ultimaInspeccion: d.lastCheckDate ?? d.ultimaInspeccion ?? null,
        motivoBaja: d.motivoBaja ?? null,
    };
}
// ─── CRUD Turnos ─────────────────────────────────────────────────────────────
async function getTurnosByFecha(fecha) {
    try {
        const rows = await (0, database_1.default)('turnos_dia')
            .where('fecha', fecha)
            .orderBy('hora_salida', 'asc');
        return rows.map(rowToTurno);
    }
    catch (error) {
        logger_1.default.error(`[LISTERO] Error getTurnosByFecha(${fecha})`, { error: String(error) });
        throw new index_1.AppError(500, 'Error al obtener turnos');
    }
}
async function createTurno(turno) {
    try {
        const id = (0, uuid_1.v4)();
        await (0, database_1.default)('turnos_dia').insert({
            id,
            fecha: turno.fecha,
            conductor_id: turno.conductorId,
            conductor_nombre: turno.conductorNombre,
            conductor_interno: turno.conductorInterno,
            vehiculo_id: turno.vehiculoId,
            vehiculo_interno: turno.vehiculoInterno,
            linea_id: turno.lineaId,
            variante_key: turno.varianteKey,
            turno: turno.turno,
            hora_salida: turno.horaSalida,
            hora_llegada_estimada: turno.horaLlegadaEstimada,
            terminal: turno.terminal,
            estado: turno.estado ?? 'programado',
            reserva_activada: false,
            conductor_reserva_id: null,
            conductor_reserva_nombre: null,
            firma_conductor: false,
            hora_firma: null,
            importancia_linea: turno.importanciaLinea ?? (IMPORTANCIA_LINEA[turno.lineaId] ?? 2),
            impacto_ingresos_estimado: calcularImpactoIngresosUSD(turno.lineaId),
            observaciones: turno.observaciones,
            data_jsonb: JSON.stringify({}),
        });
        logger_1.default.info(`[LISTERO] Turno creado ${id} — L${turno.lineaId} coche ${turno.vehiculoInterno} ${turno.horaSalida}`);
        return id;
    }
    catch (error) {
        logger_1.default.error('[LISTERO] Error createTurno', { error: String(error) });
        throw new index_1.AppError(500, 'Error al crear turno');
    }
}
async function updateTurno(turnoId, cambios) {
    try {
        const dbCambios = {};
        if (cambios.estado !== undefined)
            dbCambios.estado = cambios.estado;
        if (cambios.reservaActivada !== undefined)
            dbCambios.reserva_activada = cambios.reservaActivada;
        if (cambios.conductorReservaId !== undefined)
            dbCambios.conductor_reserva_id = cambios.conductorReservaId;
        if (cambios.conductorReservaNombre !== undefined)
            dbCambios.conductor_reserva_nombre = cambios.conductorReservaNombre;
        if (cambios.firmaConductor !== undefined)
            dbCambios.firma_conductor = cambios.firmaConductor;
        if (cambios.horaFirma !== undefined)
            dbCambios.hora_firma = cambios.horaFirma;
        if (cambios.observaciones !== undefined)
            dbCambios.observaciones = cambios.observaciones;
        if (Object.keys(dbCambios).length > 0) {
            await (0, database_1.default)('turnos_dia').where('id', turnoId).update(dbCambios);
        }
    }
    catch (error) {
        logger_1.default.error(`[LISTERO] Error updateTurno(${turnoId})`, { error: String(error) });
        throw new index_1.AppError(500, 'Error al actualizar turno');
    }
}
async function deleteTurno(turnoId) {
    try {
        await (0, database_1.default)('turnos_dia').where('id', turnoId).delete();
    }
    catch (error) {
        logger_1.default.error(`[LISTERO] Error deleteTurno(${turnoId})`, { error: String(error) });
        throw new index_1.AppError(500, 'Error al eliminar turno');
    }
}
// ─── Conductores del día ──────────────────────────────────────────────────────
async function getConductoresDia(fecha) {
    try {
        const [personalRows, turnosRows] = await Promise.all([
            (0, database_1.default)('personal').select('*'),
            (0, database_1.default)('turnos_dia').where('fecha', fecha),
        ]);
        const turnosPorConductor = new Map();
        for (const r of turnosRows) {
            const t = rowToTurno(r);
            if (t.conductorId)
                turnosPorConductor.set(t.conductorId, t);
            if (t.conductorReservaId)
                turnosPorConductor.set(t.conductorReservaId, t);
        }
        return personalRows
            .map((p) => rowToConductor(p, turnosPorConductor.get(p.id)))
            .filter((c) => /conductor|driver|chofer|micrero|guarda/i.test(c.rol));
    }
    catch (error) {
        logger_1.default.error(`[LISTERO] Error getConductoresDia(${fecha})`, { error: String(error) });
        throw new index_1.AppError(500, 'Error al obtener conductores del día');
    }
}
// ─── Marcar ausencia (dispara cascada) ───────────────────────────────────────
async function marcarAusencia(conductorId, fecha, motivo, registradoPor) {
    try {
        await (0, database_1.default)('personal').where('id', conductorId).update({
            estado_hoy: 'ausente',
            motivo_ausencia: motivo,
            ausencia_registrada_por: registradoPor,
            ausencia_fecha: fecha,
        });
        const turnosRows = await (0, database_1.default)('turnos_dia')
            .where('fecha', fecha)
            .where('conductor_id', conductorId);
        const turnosAfectados = [];
        for (const r of turnosRows) {
            await (0, database_1.default)('turnos_dia').where('id', r.id).update({ estado: 'sin_conductor' });
            turnosAfectados.push({ ...rowToTurno(r), estado: 'sin_conductor' });
        }
        const reservasDisponibles = await buscarReservasDisponibles(fecha, turnosAfectados);
        logger_1.default.warn(`[LISTERO] Ausencia registrada: conductor ${conductorId} — ${turnosAfectados.length} turnos sin cobertura`);
        return { turnosAfectados, reservasDisponibles };
    }
    catch (error) {
        logger_1.default.error(`[LISTERO] Error marcarAusencia(${conductorId})`, { error: String(error) });
        throw new index_1.AppError(500, 'Error al registrar ausencia');
    }
}
// ─── Buscar conductores de reserva ───────────────────────────────────────────
async function buscarReservasDisponibles(fecha, turnosAfectados) {
    const conductoresDia = await getConductoresDia(fecha);
    return conductoresDia.filter((c) => {
        if (c.estadoHoy !== 'disponible' && c.estadoHoy !== 'reserva')
            return false;
        if (c.horaUltimoServicio && turnosAfectados.length > 0) {
            const primerTurno = turnosAfectados[0];
            const descanso = minutosDescansoEntre(c.horaUltimoServicio, primerTurno.horaSalida);
            if (descanso < 540)
                return false;
        }
        return true;
    });
}
// ─── Asignar conductor de reserva ────────────────────────────────────────────
async function asignarReserva(turnoId, conductorReservaId, conductorReservaNombre, asignadoPor) {
    try {
        await (0, database_1.default)('turnos_dia').where('id', turnoId).update({
            estado: 'cubierto_reserva',
            reserva_activada: true,
            conductor_reserva_id: conductorReservaId,
            conductor_reserva_nombre: conductorReservaNombre,
        });
        await (0, database_1.default)('personal').where('id', conductorReservaId).update({
            estado_hoy: 'en_servicio',
        });
        logger_1.default.info(`[LISTERO] Reserva activada: turno ${turnoId} → conductor ${conductorReservaId} por ${asignadoPor}`);
    }
    catch (error) {
        logger_1.default.error(`[LISTERO] Error asignarReserva(${turnoId})`, { error: String(error) });
        throw new index_1.AppError(500, 'Error al asignar reserva');
    }
}
// ─── Marcar vehículo en taller ────────────────────────────────────────────────
async function marcarVehiculoEnTaller(vehiculoId, motivo, registradoPor, fecha) {
    try {
        // Update del data_jsonb del vehículo (tabla `vehiculos` ya existente).
        await (0, database_1.default)('vehiculos')
            .where('id', vehiculoId)
            .update({
            data_jsonb: database_1.default.raw('data_jsonb || ?', [
                JSON.stringify({
                    estadoHoy: 'en_taller',
                    motivoBaja: motivo,
                    bajaRegistradaPor: registradoPor,
                    bajaFecha: fecha,
                }),
            ]),
        });
        const turnosRows = await (0, database_1.default)('turnos_dia')
            .where('fecha', fecha)
            .where('vehiculo_id', vehiculoId);
        const turnosAfectados = [];
        for (const r of turnosRows) {
            await (0, database_1.default)('turnos_dia').where('id', r.id).update({ estado: 'sin_conductor' });
            turnosAfectados.push({ ...rowToTurno(r), estado: 'sin_conductor' });
        }
        const vehiculosReservaDisponibles = await buscarVehiculosReserva(fecha);
        logger_1.default.warn(`[LISTERO] Vehículo ${vehiculoId} a taller — ${turnosAfectados.length} turnos afectados`);
        return { turnosAfectados, vehiculosReservaDisponibles };
    }
    catch (error) {
        logger_1.default.error(`[LISTERO] Error marcarVehiculoEnTaller(${vehiculoId})`, { error: String(error) });
        throw new index_1.AppError(500, 'Error al marcar vehículo en taller');
    }
}
// ─── Buscar vehículos de reserva ──────────────────────────────────────────────
async function buscarVehiculosReserva(fecha) {
    try {
        const turnosRows = await (0, database_1.default)('turnos_dia').where('fecha', fecha).select('vehiculo_id');
        const vehiculosEnUso = new Set(turnosRows.map((r) => r.vehiculo_id));
        const todos = await (0, database_1.default)('vehiculos').select('*');
        return todos
            .filter((v) => {
            const estado = (v.data_jsonb ?? {}).estadoHoy ?? 'disponible';
            return (estado === 'disponible' || estado === 'reserva') && !vehiculosEnUso.has(v.id);
        })
            .map(rowToVehiculoDia);
    }
    catch (error) {
        logger_1.default.error(`[LISTERO] Error buscarVehiculosReserva(${fecha})`, { error: String(error) });
        throw new index_1.AppError(500, 'Error al buscar vehículos de reserva');
    }
}
// ─── Firma de conductor (cartón digital) ─────────────────────────────────────
async function registrarFirma(turnoId, conductorId, horaFirma) {
    try {
        const turnoRow = await (0, database_1.default)('turnos_dia').where('id', turnoId).first();
        if (!turnoRow)
            throw new index_1.AppError(404, 'Turno no encontrado');
        if (turnoRow.conductor_id !== conductorId && turnoRow.conductor_reserva_id !== conductorId) {
            throw new index_1.AppError(403, 'El conductor no está asignado a este turno');
        }
        await (0, database_1.default)('turnos_dia').where('id', turnoId).update({
            firma_conductor: true,
            hora_firma: horaFirma,
            estado: 'activo',
        });
        logger_1.default.info(`[LISTERO] Firma registrada: turno ${turnoId} conductor ${conductorId} a las ${horaFirma}`);
    }
    catch (error) {
        if (error instanceof index_1.AppError)
            throw error;
        logger_1.default.error(`[LISTERO] Error registrarFirma(${turnoId})`, { error: String(error) });
        throw new index_1.AppError(500, 'Error al registrar firma');
    }
}
// ─── Resumen del día ──────────────────────────────────────────────────────────
async function getResumenDiario(fecha) {
    try {
        const [turnos, conductores, alertasCountRow, vehiculosRows] = await Promise.all([
            getTurnosByFecha(fecha),
            getConductoresDia(fecha),
            (0, database_1.default)('alertas_operativas')
                .where('fecha', fecha)
                .where('atendida', false)
                .count({ count: '*' })
                .first(),
            (0, database_1.default)('vehiculos').select('*'),
        ]);
        const turnosSinConductor = turnos.filter((t) => t.estado === 'sin_conductor' || t.estado === 'cancelado');
        const impactoTotal = turnosSinConductor.reduce((acc, t) => acc + (t.impactoIngresosEstimado ?? 0), 0);
        const lineasEnRiesgo = [
            ...new Set(turnosSinConductor.filter((t) => t.importanciaLinea >= 4).map((t) => t.lineaId)),
        ];
        const vehiculosEstadoHoy = vehiculosRows.map((r) => {
            const d = (r.data_jsonb ?? {});
            return d.estadoHoy ?? 'disponible';
        });
        const vehiculosEnTaller = vehiculosEstadoHoy.filter((e) => e === 'en_taller').length;
        const vehiculosDisponibles = vehiculosEstadoHoy.filter((e) => e === 'disponible' || e === 'en_servicio').length;
        const coberturaFlota = turnos.length > 0
            ? Math.round((turnos.filter((t) => t.estado !== 'sin_conductor' && t.estado !== 'cancelado').length /
                turnos.length) *
                100)
            : 100;
        const alertasActivas = parseInt(alertasCountRow?.count ?? '0', 10);
        return {
            fecha,
            turnosTotal: turnos.length,
            turnosCubiertos: turnos.filter((t) => t.estado === 'activo' ||
                t.estado === 'cubierto_reserva' ||
                t.estado === 'completado').length,
            turnosSinConductor: turnosSinConductor.length,
            turnosCanceladosTotal: turnos.filter((t) => t.estado === 'cancelado').length,
            conductoresDisponibles: conductores.filter((c) => c.estadoHoy === 'disponible').length,
            conductoresAusentes: conductores.filter((c) => c.estadoHoy === 'ausente').length,
            conductoresReservaLibres: conductores.filter((c) => c.estadoHoy === 'reserva' || (c.estadoHoy === 'disponible' && c.esConductorReserva)).length,
            vehiculosDisponibles,
            vehiculosEnTaller,
            coberturaFlota,
            alertasActivas,
            impactoIngresosRiesgoUSD: impactoTotal,
            lineasEnRiesgoIMM: lineasEnRiesgo,
        };
    }
    catch (error) {
        logger_1.default.error(`[LISTERO] Error getResumenDiario(${fecha})`, { error: String(error) });
        throw new index_1.AppError(500, 'Error al generar resumen diario');
    }
}
