"use strict";
/**
 * miTurnoController — Endpoint para que el conductor obtenga su turno
 * activo de hoy (FASE 5.36, 2026-05-22).
 *
 *   GET /api/mi-turno  → busca en turnos_dia el turno asignado al user
 *                        autenticado para la fecha de hoy.
 *
 * Lo consume la vista `/dashboard/driver/mi-linea` para saber qué línea
 * y coche está corriendo el chofer en este momento y filtrar el feed de
 * cascadas a esa línea.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMiTurno = getMiTurno;
const database_1 = __importDefault(require("../config/database"));
const logger_1 = __importDefault(require("../config/logger"));
async function getMiTurno(req, res) {
    try {
        const user = req.user;
        const userId = user?.id ?? user?.internalNumber ?? '';
        if (!userId) {
            res.status(401).json({ ok: false, error: 'No autenticado' });
            return;
        }
        const hoy = new Date().toISOString().slice(0, 10);
        // turnos_dia.conductor_id es FK a personal(id). Buscamos por id directo
        // O por internal_number igual al userId (legacy).
        const row = await (0, database_1.default)('turnos_dia as t')
            .leftJoin('personal as p', 't.conductor_id', 'p.id')
            .select('t.id', 't.fecha', 't.linea_id', 't.vehiculo_id', 't.vehiculo_interno', 't.hora_salida', 't.hora_llegada_estimada', 't.estado', 't.agency_id', 't.firma_conductor', 't.hora_firma', 'p.full_name as conductor_nombre', 'p.internal_number as conductor_interno')
            .where('t.fecha', hoy)
            .andWhere((b) => {
            b.where('t.conductor_id', userId)
                .orWhere('p.internal_number', userId);
        })
            .orderBy('t.hora_salida', 'asc')
            .first();
        if (!row) {
            res.json({
                ok: true,
                turno: null,
                nota: `No hay turno asignado para hoy (${hoy}) al usuario ${userId}.`,
            });
            return;
        }
        // Módulo 9: Evaluador Espacial de Desvíos Proactivos.
        // Simulamos la traza oficial con un Point o LineString de ejemplo de la variante,
        // y cruzamos con route_detours activos para esta línea.
        // Si la tabla route_detours ya fue inyectada en BD por la migración, evaluamos la intersección.
        let has_detour = false;
        let detour_mensaje = null;
        let geom_alternativa = null;
        try {
            const activeDetour = await (0, database_1.default)('route_detours')
                .where('linea_id', row.linea_id)
                .where('fecha_inicio', '<=', database_1.default.fn.now())
                .where('fecha_fin', '>=', database_1.default.fn.now())
                .whereRaw(`ST_Intersects(
           -- Fake variante geom representativa del recorrido actual del coche o línea
           ST_SetSRID(ST_MakePoint(-56.16, -34.90), 4326), 
           geom_excluyente
        )`)
                .first('id', database_1.default.raw('ST_AsGeoJSON(geom_alternativa) as geojson'));
            if (activeDetour) {
                has_detour = true;
                detour_mensaje = "Alteración de recorrido detectada por Tránsito en este servicio";
                geom_alternativa = activeDetour.geojson;
            }
        }
        catch (e) {
            logger_1.default.warn(`[M9 Desvíos] Error evaluando ST_Intersects: ${e?.message}`);
        }
        res.json({
            ok: true,
            turno: row,
            has_detour,
            detour_mensaje,
            geom_alternativa
        });
    }
    catch (err) {
        logger_1.default.error('[mi-turno]', { error: String(err) });
        res.status(500).json({ ok: false, error: 'Error consultando turno' });
    }
}
