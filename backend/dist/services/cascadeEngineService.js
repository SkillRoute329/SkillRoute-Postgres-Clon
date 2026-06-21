"use strict";
/**
 * cascadeEngineService — Motor de reactividad operativa UCOT
 *
 * FASE 2.5 (2026-05-10): Migrado de Firestore a PostgreSQL local.
 * Las alertas se persisten en `alertas_operativas` (schema_fase2.sql) y se
 * emiten en tiempo real por Socket.io a los clientes conectados.
 *
 * Cada evento operativo (ausencia conductor, vehículo a taller, gap GPS)
 * dispara una cadena automática:
 *
 *   Evento → Evaluar impacto → Buscar solución → Crear alerta → Emitir Socket.io
 *
 * El largador / inspector reciben la alerta en tiempo real y confirman
 * la acción sugerida. El sistema nunca actúa sin confirmación humana —
 * solo propone y alerta.
 *
 * Nota arquitectural:
 *   - Para reactividad cross-instancia (varios backends detrás de un LB),
 *     reemplazar emit-socket directo por Postgres LISTEN/NOTIFY o Redis pub/sub.
 *     Hoy con una sola instancia el emit directo basta.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setSocketServer = setSocketServer;
exports.procesarAusenciaConductor = procesarAusenciaConductor;
exports.procesarVehiculoEnTaller = procesarVehiculoEnTaller;
exports.analizarFrecuenciasGPS = analizarFrecuenciasGPS;
exports.atenderAlerta = atenderAlerta;
exports.getAlertasActivas = getAlertasActivas;
exports.getHistorialAlertas = getHistorialAlertas;
const database_1 = __importDefault(require("../config/database"));
const logger_1 = __importDefault(require("../config/logger"));
const uuid_1 = require("uuid");
const listeroService_1 = require("./listeroService");
const immRealtimeService_1 = require("./immRealtimeService");
function rowToAlerta(r) {
    return {
        id: r.id,
        fecha: typeof r.fecha === 'string' ? r.fecha : r.fecha.toISOString?.().slice(0, 10) ?? r.fecha,
        tipo: r.tipo,
        urgencia: r.urgencia,
        lineaId: r.linea_id,
        conductorId: r.conductor_id,
        vehiculoId: r.vehiculo_id,
        turnoId: r.turno_id,
        titulo: r.titulo,
        mensaje: r.mensaje,
        accionSugerida: r.accion_sugerida,
        datosExtra: (r.datos_extra ?? {}),
        atendida: r.atendida,
        atendidaPor: r.atendida_por,
        horaAtendida: r.hora_atendida,
        impactoIngresosUSD: r.impacto_ingresos_usd != null ? Number(r.impacto_ingresos_usd) : null,
        createdAt: r.created_at ?? null,
    };
}
// ─── Singleton de la instancia Socket.io ─────────────────────────────────────
let _io = null;
function setSocketServer(io) {
    _io = io;
}
function emitAlerta(alerta) {
    if (_io) {
        _io.emit('alerta-operativa', alerta);
        logger_1.default.info(`[CASCADE] Socket emitido: ${alerta.tipo} urgencia=${alerta.urgencia}`);
    }
}
function emitResumenActualizado(resumen) {
    if (_io)
        _io.emit('resumen-diario-actualizado', resumen);
}
// ─── Crear y persistir alerta ─────────────────────────────────────────────────
async function crearAlerta(alerta) {
    try {
        const id = (0, uuid_1.v4)();
        const row = {
            id,
            fecha: alerta.fecha,
            tipo: alerta.tipo,
            urgencia: alerta.urgencia,
            linea_id: alerta.lineaId,
            conductor_id: alerta.conductorId,
            vehiculo_id: alerta.vehiculoId,
            turno_id: alerta.turnoId,
            titulo: alerta.titulo,
            mensaje: alerta.mensaje,
            accion_sugerida: alerta.accionSugerida,
            datos_extra: JSON.stringify(alerta.datosExtra ?? {}),
            atendida: false,
            atendida_por: null,
            hora_atendida: null,
            impacto_ingresos_usd: alerta.impactoIngresosUSD,
        };
        await (0, database_1.default)('alertas_operativas').insert(row);
        const persisted = {
            ...alerta,
            id,
            atendida: false,
            atendidaPor: null,
            horaAtendida: null,
            createdAt: new Date(),
        };
        emitAlerta(persisted);
        return id;
    }
    catch (error) {
        logger_1.default.error('[CASCADE] Error persistiendo alerta', { error: String(error), tipo: alerta.tipo });
        throw error;
    }
}
// ─── CASCADA 1: Ausencia de conductor ────────────────────────────────────────
async function procesarAusenciaConductor(conductorId, conductorNombre, fecha, motivo, registradoPor) {
    logger_1.default.warn(`[CASCADE] Inicio cascada ausencia: ${conductorNombre} (${conductorId})`);
    const { turnosAfectados, reservasDisponibles } = await (0, listeroService_1.marcarAusencia)(conductorId, fecha, motivo, registradoPor);
    if (turnosAfectados.length === 0) {
        logger_1.default.info('[CASCADE] Ausencia registrada sin turnos asignados hoy');
        return;
    }
    for (const turno of turnosAfectados) {
        const importancia = turno.importanciaLinea ?? 2;
        const urgencia = importancia >= 5 ? 'critica' : importancia >= 4 ? 'alta' : importancia >= 3 ? 'media' : 'baja';
        if (reservasDisponibles.length > 0) {
            const reserva = reservasDisponibles[0];
            await crearAlerta({
                fecha,
                tipo: 'reserva_disponible',
                urgencia: 'media',
                lineaId: turno.lineaId,
                conductorId,
                vehiculoId: turno.vehiculoId,
                turnoId: turno.id ?? null,
                titulo: `Reserva disponible — L${turno.lineaId} ${turno.horaSalida}`,
                mensaje: `${conductorNombre} ausente (${motivo}). Coche ${turno.vehiculoInterno}, salida ${turno.horaSalida}. Reserva disponible: ${reserva.fullName}.`,
                accionSugerida: `Asignar a ${reserva.fullName} (INT ${reserva.internalNumber})`,
                datosExtra: {
                    conductorAusenteNombre: conductorNombre,
                    reservaId: reserva.id,
                    reservaNombre: reserva.fullName,
                    reservaInterno: reserva.internalNumber,
                    motivoAusencia: motivo,
                },
                impactoIngresosUSD: turno.impactoIngresosEstimado,
            });
        }
        else {
            const esCritica = importancia >= 4;
            await crearAlerta({
                fecha,
                tipo: esCritica ? 'infraccion_imminente' : 'ausencia_conductor',
                urgencia,
                lineaId: turno.lineaId,
                conductorId,
                vehiculoId: turno.vehiculoId,
                turnoId: turno.id ?? null,
                titulo: `${esCritica ? 'RIESGO IMM' : 'Sin cobertura'} — L${turno.lineaId} ${turno.horaSalida}`,
                mensaje: `${conductorNombre} ausente. Coche ${turno.vehiculoInterno} sin conductor para salida ${turno.horaSalida}. Sin reservas disponibles. ${esCritica ? 'Gap de frecuencia probable — riesgo de infracción IMM.' : ''}`,
                accionSugerida: esCritica
                    ? 'Contactar al Jefe de Tráfico inmediatamente. Evaluar redistribución de servicios.'
                    : 'Verificar si otro conductor puede extender su turno (con autorización)',
                datosExtra: {
                    conductorAusenteNombre: conductorNombre,
                    motivoAusencia: motivo,
                    reservasDisponibles: 0,
                    riesgoIMM: esCritica,
                },
                impactoIngresosUSD: turno.impactoIngresosEstimado,
            });
        }
    }
    const resumen = await (0, listeroService_1.getResumenDiario)(fecha);
    emitResumenActualizado(resumen);
    if (resumen.coberturaFlota < 80) {
        await crearAlerta({
            fecha,
            tipo: 'cobertura_critica',
            urgencia: 'critica',
            lineaId: null,
            conductorId: null,
            vehiculoId: null,
            turnoId: null,
            titulo: `Cobertura de flota crítica: ${resumen.coberturaFlota}%`,
            mensaje: `La cobertura operativa cayó al ${resumen.coberturaFlota}%. ${resumen.turnosSinConductor} servicios sin cobertura. Impacto estimado: USD ${resumen.impactoIngresosRiesgoUSD}. Líneas en riesgo IMM: ${resumen.lineasEnRiesgoIMM.join(', ') || 'ninguna aún'}.`,
            accionSugerida: 'Reunión urgente con Jefe de Tráfico. Activar protocolo de emergencia operativa.',
            datosExtra: resumen,
            impactoIngresosUSD: resumen.impactoIngresosRiesgoUSD,
        });
    }
}
// ─── CASCADA 2: Vehículo a taller ────────────────────────────────────────────
async function procesarVehiculoEnTaller(vehiculoId, vehiculoInterno, motivo, registradoPor, fecha) {
    logger_1.default.warn(`[CASCADE] Inicio cascada vehículo en taller: interno ${vehiculoInterno}`);
    const { turnosAfectados, vehiculosReservaDisponibles } = await (0, listeroService_1.marcarVehiculoEnTaller)(vehiculoId, motivo, registradoPor, fecha);
    for (const turno of turnosAfectados) {
        const importancia = turno.importanciaLinea ?? 2;
        const urgencia = importancia >= 4 ? 'alta' : 'media';
        if (vehiculosReservaDisponibles.length > 0) {
            const reemplazo = vehiculosReservaDisponibles[0];
            await crearAlerta({
                fecha,
                tipo: 'vehiculo_en_taller',
                urgencia: 'media',
                lineaId: turno.lineaId,
                conductorId: turno.conductorId,
                vehiculoId,
                turnoId: turno.id ?? null,
                titulo: `Coche ${vehiculoInterno} a taller — reemplazo disponible`,
                mensaje: `Coche ${vehiculoInterno} enviado a taller (${motivo}). Afecta L${turno.lineaId} salida ${turno.horaSalida}. Coche de reserva disponible: interno ${reemplazo.interno}.`,
                accionSugerida: `Reasignar a coche ${reemplazo.interno}. El conductor ${turno.conductorNombre ?? ''} puede continuar con el vehículo de reserva.`,
                datosExtra: {
                    vehiculoAveriado: vehiculoInterno,
                    motivoBaja: motivo,
                    reemplazoCocheInterno: reemplazo.interno,
                    reemplazoCocheId: reemplazo.id,
                    tipoReemplazo: reemplazo.tipo,
                },
                impactoIngresosUSD: null,
            });
        }
        else {
            await crearAlerta({
                fecha,
                tipo: importancia >= 4 ? 'infraccion_imminente' : 'vehiculo_en_taller',
                urgencia,
                lineaId: turno.lineaId,
                conductorId: turno.conductorId,
                vehiculoId,
                turnoId: turno.id ?? null,
                titulo: `${urgencia === 'alta' ? '[CRÍTICO] ' : ''}Coche ${vehiculoInterno} a taller — sin reemplazo`,
                mensaje: `Coche ${vehiculoInterno} enviado a taller (${motivo}). Sin vehículos de reserva disponibles. L${turno.lineaId} salida ${turno.horaSalida} en riesgo.`,
                accionSugerida: 'Verificar taller para liberación urgente. Evaluar redistribución de servicios en la línea.',
                datosExtra: {
                    vehiculoAveriado: vehiculoInterno,
                    motivoBaja: motivo,
                    reservasDisponibles: 0,
                },
                impactoIngresosUSD: turno.impactoIngresosEstimado,
            });
        }
    }
    const resumen = await (0, listeroService_1.getResumenDiario)(fecha);
    emitResumenActualizado(resumen);
}
// ─── CASCADA 3: Monitoreo GPS — gap de frecuencia y bunching ──────────────────
const UMBRAL_BUNCHING_KM = 0.8;
function distanciaKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
async function analizarFrecuenciasGPS(fecha) {
    try {
        const geoJson = await (0, immRealtimeService_1.fetchBusesLive)(immRealtimeService_1.EMPRESA_CODES.UCOT);
        const features = geoJson?.features ?? [];
        if (features.length === 0)
            return;
        const porLinea = new Map();
        for (const f of features) {
            const props = f.properties;
            const linea = String(props.linea ?? '');
            if (!linea)
                continue;
            if (!porLinea.has(linea))
                porLinea.set(linea, []);
            const [lng, lat] = f.geometry.coordinates;
            porLinea.get(linea).push({
                interno: String(props.codigoBus ?? ''),
                lat,
                lng,
                linea,
            });
        }
        const alertasEmitidas = new Set();
        for (const [lineaId, buses] of porLinea.entries()) {
            if (buses.length < 2)
                continue;
            for (let i = 0; i < buses.length; i++) {
                for (let j = i + 1; j < buses.length; j++) {
                    const dist = distanciaKm(buses[i].lat, buses[i].lng, buses[j].lat, buses[j].lng);
                    const key = `bunching-${lineaId}-${buses[i].interno}-${buses[j].interno}`;
                    if (dist < UMBRAL_BUNCHING_KM && !alertasEmitidas.has(key)) {
                        alertasEmitidas.add(key);
                        // Verificar si ya hay alerta reciente de este tipo en Postgres (últimas 2h)
                        const hace2h = new Date(Date.now() - 2 * 60 * 60 * 1000);
                        const existente = await (0, database_1.default)('alertas_operativas')
                            .where('tipo', 'bunching')
                            .where('linea_id', lineaId)
                            .where('created_at', '>', hace2h)
                            .first();
                        if (existente)
                            continue;
                        await crearAlerta({
                            fecha,
                            tipo: 'bunching',
                            urgencia: 'alta',
                            lineaId,
                            conductorId: null,
                            vehiculoId: null,
                            turnoId: null,
                            titulo: `Bunching detectado — Línea ${lineaId}`,
                            mensaje: `Internos ${buses[i].interno} y ${buses[j].interno} separados por ${dist.toFixed(2)}km (umbral: ${UMBRAL_BUNCHING_KM}km). Gap de frecuencia en tramos anteriores.`,
                            accionSugerida: `Inspector: ordenar al interno ${buses[i].interno} que espere en próxima parada. Al ${buses[j].interno} que acelere el ritmo.`,
                            datosExtra: {
                                bus1: buses[i].interno,
                                bus2: buses[j].interno,
                                distanciaKm: dist,
                                lat1: buses[i].lat,
                                lng1: buses[i].lng,
                                lat2: buses[j].lat,
                                lng2: buses[j].lng,
                            },
                            impactoIngresosUSD: null,
                        });
                    }
                }
            }
        }
    }
    catch (err) {
        logger_1.default.error('[CASCADE] Error analizando frecuencias GPS', { err: String(err) });
    }
}
// ─── Marcar alerta como atendida ──────────────────────────────────────────────
async function atenderAlerta(alertaId, atendidaPor) {
    try {
        const hora = new Date().toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' });
        await (0, database_1.default)('alertas_operativas').where('id', alertaId).update({
            atendida: true,
            atendida_por: atendidaPor,
            hora_atendida: hora,
        });
        if (_io)
            _io.emit('alerta-atendida', { alertaId, atendidaPor, hora });
        logger_1.default.info(`[CASCADE] Alerta ${alertaId} atendida por ${atendidaPor}`);
    }
    catch (error) {
        logger_1.default.error(`[CASCADE] Error atenderAlerta(${alertaId})`, { error: String(error) });
        throw error;
    }
}
// ─── Obtener alertas activas ──────────────────────────────────────────────────
async function getAlertasActivas(fecha) {
    try {
        const rows = await (0, database_1.default)('alertas_operativas')
            .where('fecha', fecha)
            .where('atendida', false)
            .orderBy('created_at', 'desc')
            .limit(50);
        return rows.map(rowToAlerta);
    }
    catch (error) {
        logger_1.default.error(`[CASCADE] Error getAlertasActivas(${fecha})`, { error: String(error) });
        return [];
    }
}
async function getHistorialAlertas(fecha) {
    try {
        const rows = await (0, database_1.default)('alertas_operativas')
            .where('fecha', fecha)
            .orderBy('created_at', 'desc')
            .limit(100);
        return rows.map(rowToAlerta);
    }
    catch (error) {
        logger_1.default.error(`[CASCADE] Error getHistorialAlertas(${fecha})`, { error: String(error) });
        return [];
    }
}
