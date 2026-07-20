"use strict";
/**
 * adminPersonalController — Módulo 10: RRHH Uruguay (Grupo 13)
 * ─────────────────────────────────────────────────────────────
 * Endpoints:
 *   GET  /api/admin/personal              → listPersonal (con paginación y filtros)
 *   PUT  /api/admin/personal/:id          → updatePersonal (incluye registro de ausencia coercitiva)
 *   GET  /api/admin/personal/:id/legajo   → getDetalleLaboralEmpleado (vista v_legajo_laboral)
 *
 * Restricción de no-regresión:
 *   • Ningún cálculo de antigüedad, licencia o aguinaldo se realiza en el cliente.
 *   • La función SQL fn_dias_licencia_grupo13() y la vista v_legajo_laboral
 *     son la única fuente de verdad. OWASP A02: nunca se devuelven campos sensibles.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listPersonal = listPersonal;
exports.getDetalleLaboralEmpleado = getDetalleLaboralEmpleado;
exports.updatePersonal = updatePersonal;
const database_1 = __importDefault(require("../config/database"));
const logger_1 = __importDefault(require("../config/logger"));
/** Estados que bloquean coercitivamente la asignación en listería */
const ESTADOS_BLOQUEANTES = ['ausente', 'enfermo', 'licencia'];
// ── Helpers ────────────────────────────────────────────────────────────────
const SENSITIVE_FIELDS = new Set([
    'password', 'password_hash', 'pwd', 'token', 'api_key', 'apiKey', 'secret',
]);
function stripSensitive(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        if (!SENSITIVE_FIELDS.has(k))
            out[k] = v;
    }
    return out;
}
function flatten(row) {
    const out = { ...row };
    const j = row.data_jsonb;
    if (j && typeof j === 'object') {
        const safeJ = stripSensitive(j);
        out['data_jsonb'] = safeJ;
        for (const [k, v] of Object.entries(safeJ)) {
            if (!(k in out) || out[k] == null)
                out[k] = v;
        }
    }
    for (const k of SENSITIVE_FIELDS)
        delete out[k];
    if (out.full_name && !out.nombre)
        out.nombre = out.full_name;
    if (out.internal_number && !out.interno)
        out.interno = out.internal_number;
    return out;
}
// ── Controllers ────────────────────────────────────────────────────────────
async function listPersonal(req, res) {
    try {
        const limit = Math.min(5000, Math.max(1, parseInt(req.query.limit ?? '500', 10)));
        const offset = Math.max(0, parseInt(req.query.offset ?? '0', 10));
        const agencyId = req.query.agency_id;
        const rol = req.query.rol;
        const estado = req.query.estado;
        const q = req.query.q;
        let baseQ = (0, database_1.default)('personal').select('*');
        if (agencyId)
            baseQ = baseQ.where('agency_id', agencyId);
        if (rol)
            baseQ = baseQ.where('role', rol);
        if (estado)
            baseQ = baseQ.where('estado_hoy', estado);
        if (q) {
            baseQ = baseQ.where((b) => {
                b.where('full_name', 'ilike', `%${q}%`)
                    .orWhere('internal_number', 'ilike', `%${q}%`);
            });
        }
        const rows = await baseQ
            .orderBy([{ column: 'agency_id' }, { column: 'internal_number' }])
            .limit(limit)
            .offset(offset);
        const empleados = rows.map((r) => flatten(r));
        res.json({ ok: true, total: empleados.length, empleados });
    }
    catch (err) {
        logger_1.default.error('[admin/personal] list', { error: String(err) });
        res.status(500).json({ ok: false, error: 'Error listando personal', empleados: [], total: 0 });
    }
}
// ── GET /api/admin/personal/:id/legajo ────────────────────────────────────
/**
 * getDetalleLaboralEmpleado
 *
 * Recupera el legajo completo del empleado desde la vista v_legajo_laboral,
 * que computa en PostgreSQL:
 *   - Antigüedad exacta (EXTRACT YEAR/MONTH FROM AGE)
 *   - Días de licencia por Ley 12.590 / Grupo 13:
 *       < 5 años → 20 días base
 *       ≥ 5 años → 20 + 1 + FLOOR((años - 5) / 4)
 *   - Monto de licencia (jornal × días)
 *   - Provisión aguinaldo mensual (jornal × 30 / 12)
 *
 * Toda la aritmética laboral corre en el servidor. El cliente recibe únicamente
 * resultados ya calculados. Cero constantes hardcodeadas en React.
 */
async function getDetalleLaboralEmpleado(req, res) {
    const { id } = req.params;
    if (!id) {
        res.status(400).json({ ok: false, error: 'Parámetro id es obligatorio.' });
        return;
    }
    try {
        // Leer desde la vista que computa todo en PostgreSQL
        const legajo = await (0, database_1.default)('v_legajo_laboral').where('id', id).first();
        if (!legajo) {
            // Puede ser que el empleado tenga fecha_egreso (no aparece en la vista)
            const dado_de_baja = await (0, database_1.default)('personal').where('id', id).first();
            if (dado_de_baja) {
                res.status(200).json({
                    ok: true,
                    legajo: null,
                    advertencia: 'Empleado dado de baja (fecha_egreso registrada). No aparece en legajos activos.',
                });
                return;
            }
            res.status(404).json({ ok: false, error: 'Empleado no encontrado.' });
            return;
        }
        // Calcular asignaciones activas bloqueadas (informativo para el frontend)
        const asignacionesActivas = await (0, database_1.default)('roster_assignments')
            .where('driver_id', id)
            .whereNotIn('estado', ['FINALIZADO', 'CANCELADO'])
            .select('id', 'estado', 'hora_inicio', 'hora_fin', 'linea_id');
        // Recuperar el historial de tramos laborales para certificar antigüedad
        const tramosLaborales = await (0, database_1.default)('personal_periods')
            .where('personal_id', id)
            .orderBy('fecha_ingreso', 'desc');
        res.json({
            ok: true,
            legajo: {
                ...stripSensitive(legajo),
                asignaciones_activas: asignacionesActivas,
                tramos_laborales: tramosLaborales,
                esta_bloqueado: ESTADOS_BLOQUEANTES.includes(legajo.estado_hoy),
            },
        });
    }
    catch (err) {
        logger_1.default.error('[admin/personal] legajo', { id, error: String(err) });
        res.status(500).json({ ok: false, error: 'Error recuperando legajo laboral.' });
    }
}
// ── PUT /api/admin/personal/:id ───────────────────────────────────────────
/**
 * updatePersonal
 *
 * Columnas permitidas (whitelist).  Todo lo demás va a data_jsonb.
 * Coerción de ausencias: si estado_hoy pasa a 'ausente' | 'enfermo' | 'licencia',
 * se cancela coactivamente cualquier asignación PROGRAMADA del conductor
 * en roster_assignments para evitar turnos fantasma.
 */
async function updatePersonal(req, res) {
    const id = req.params.id;
    const body = (req.body ?? {});
    if (!id) {
        res.status(400).json({ ok: false, error: 'Falta id' });
        return;
    }
    const TOP = {
        cargo: 'data_jsonb',
        rol: 'role',
        role: 'role',
        telefono: 'telefono',
        estado: 'estado_hoy',
        estado_hoy: 'estado_hoy',
        full_name: 'full_name',
        nombre: 'full_name',
        internal_number: 'internal_number',
        interno: 'internal_number',
        motivo_ausencia: 'motivo_ausencia',
        ausencia_fecha: 'ausencia_fecha',
        ausencia_registrada_por: 'ausencia_registrada_por',
        es_conductor_reserva: 'es_conductor_reserva',
        regimen_rotacion: 'regimen_rotacion',
        is_en_lista: 'is_en_lista',
        patron_descanso: 'patron_descanso',
        // Nuevas columnas Módulo 10
        fecha_ingreso: 'fecha_ingreso',
        fecha_egreso: 'fecha_egreso',
        categoria_laboral: 'categoria_laboral',
        sueldo_jornal_base: 'sueldo_jornal_base',
    };
    const setTop = {};
    const setJson = {};
    for (const [k, v] of Object.entries(body)) {
        if (SENSITIVE_FIELDS.has(k))
            continue; // OWASP A02
        const dest = TOP[k];
        if (dest === 'data_jsonb')
            setJson[k] = v;
        else if (dest)
            setTop[dest] = v;
        else
            setJson[k] = v;
    }
    if (Object.keys(setTop).length === 0 && Object.keys(setJson).length === 0) {
        res.status(400).json({ ok: false, error: 'Body vacío' });
        return;
    }
    // Merge data_jsonb existente
    if (Object.keys(setJson).length > 0) {
        setTop['data_jsonb'] = database_1.default.raw("COALESCE(data_jsonb, '{}'::jsonb) || ?::jsonb", [JSON.stringify(setJson)]);
    }
    setTop['updated_at'] = database_1.default.fn.now();
    // ── Transacción ACID: actualizar + bloqueo coercitivo de listería ────────
    const trx = await database_1.default.transaction();
    try {
        const n = await trx('personal').where('id', id).update(setTop);
        if (n === 0) {
            await trx.rollback();
            res.status(404).json({ ok: false, error: 'Empleado no encontrado' });
            return;
        }
        // Bloqueo coercitivo + Motor de Auto-Asignación de Contingencia (Escenario 1)
        const nuevoEstado = (setTop['estado_hoy'] ?? '');
        let asignacionesCanceladas = 0;
        let retenAsignado = null;
        const alertasGeneradas = [];
        if (ESTADOS_BLOQUEANTES.includes(nuevoEstado)) {
            // 1. Recuperar la agencia del conductor ausente (necesaria para aislar retenes y alertas)
            const conductorAusente = await trx('personal')
                .where('id', id)
                .select('agency_id', 'full_name', 'internal_number')
                .first();
            const agencyId = conductorAusente?.agency_id ?? '';
            // 2. Obtener todas las asignaciones PROGRAMADAS del conductor que falta
            const asignacionesProgramadas = await trx('roster_assignments')
                .where('driver_id', id)
                .where('estado', 'PROGRAMADO')
                .select('id', 'linea_id', 'hora_inicio', 'hora_fin', 'coche_id');
            if (asignacionesProgramadas.length > 0) {
                // 3. Buscar el PRIMER conductor de retén disponible en la misma agencia
                //    Criterio: categoria_laboral = 'RETEN' OR es_conductor_reserva = TRUE
                //              AND estado_hoy = 'disponible'
                const retenDisponible = await trx('personal')
                    .where('agency_id', agencyId)
                    .where('estado_hoy', 'disponible')
                    .where((b) => {
                    b.where('categoria_laboral', 'RETEN')
                        .orWhere('es_conductor_reserva', true);
                })
                    .whereNull('fecha_egreso')
                    .select('id', 'full_name', 'internal_number')
                    .first();
                for (const asignacion of asignacionesProgramadas) {
                    if (retenDisponible && !retenAsignado) {
                        // ── RAMA A: Retén disponible → Auto-asignación atómica ────────────
                        await trx('roster_assignments')
                            .where('id', asignacion.id)
                            .update({
                            driver_id: retenDisponible.id,
                            estado: 'PROGRAMADO', // se mantiene activa, nuevo conductor
                            updated_at: trx.fn.now(),
                        });
                        // Marcar al retén como en servicio para que no sea reasignado de nuevo
                        await trx('personal')
                            .where('id', retenDisponible.id)
                            .update({
                            estado_hoy: 'en_servicio',
                            updated_at: trx.fn.now(),
                        });
                        retenAsignado = retenDisponible.id;
                        logger_1.default.info('[admin/personal] RETEN AUTO-ASIGNADO', {
                            driver_ausente: id,
                            reten_id: retenDisponible.id,
                            asignacion_id: asignacion.id,
                            linea_id: asignacion.linea_id,
                        });
                    }
                    else {
                        // ── RAMA B: Sin retén → Cancelar + insertar alerta CRITICA ───────
                        await trx('roster_assignments')
                            .where('id', asignacion.id)
                            .update({
                            estado: 'CANCELADO',
                            updated_at: trx.fn.now(),
                        });
                        asignacionesCanceladas++;
                        const horaInicio = asignacion.hora_inicio
                            ? new Date(asignacion.hora_inicio).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })
                            : 'N/D';
                        const mensajeAlerta = `VACANTE CRÍTICA — Línea ${asignacion.linea_id ?? '?'} a las ${horaInicio}. ` +
                            `El conductor ${conductorAusente?.full_name ?? id} (Int. ${conductorAusente?.internal_number ?? ''}) ` +
                            `marcado como "${nuevoEstado}". No hay retenes disponibles en la agencia.`;
                        const [alertaId] = await trx('traffic_alerts').insert({
                            agency_id: agencyId,
                            linea_id: asignacion.linea_id ?? null,
                            servicio_id: asignacion.id,
                            tipo_alerta: 'VACANTE_SIN_RETEN',
                            nivel_gravedad: 'CRITICO',
                            mensaje: mensajeAlerta,
                            driver_ausente_id: id,
                            reten_asignado_id: null,
                            resuelta: false,
                        }).returning('id');
                        alertasGeneradas.push(alertaId);
                        logger_1.default.error('[admin/personal] ALERTA CRITICA VACANTE_SIN_RETEN', {
                            alerta_id: alertaId,
                            agency_id: agencyId,
                            linea_id: asignacion.linea_id,
                            driver_ausente: id,
                        });
                    }
                }
            }
        }
        await trx.commit();
        res.json({
            ok: true,
            id,
            updated: true,
            bloqueo_coercitivo_aplicado: asignacionesCanceladas > 0 || retenAsignado !== null,
            asignaciones_canceladas: asignacionesCanceladas,
            reten_auto_asignado: retenAsignado,
            alertas_criticas_emitidas: alertasGeneradas.length,
            alertas_ids: alertasGeneradas,
        });
    }
    catch (err) {
        await trx.rollback();
        logger_1.default.error('[admin/personal] update error', { id, error: String(err) });
        res.status(500).json({ ok: false, error: 'Error actualizando personal' });
    }
}
