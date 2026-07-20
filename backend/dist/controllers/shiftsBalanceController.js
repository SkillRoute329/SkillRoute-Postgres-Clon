"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBalanceOficialConductor = getBalanceOficialConductor;
const database_1 = __importDefault(require("../config/database"));
const logger_1 = __importDefault(require("../config/logger"));
const crypto_1 = __importDefault(require("crypto"));
async function getBalanceOficialConductor(req, res) {
    // Transacción ACID de Knex
    const trx = await database_1.default.transaction();
    try {
        const user = req.user;
        const userId = user?.id ?? user?.internalNumber;
        const agencyId = user?.agency_id;
        if (!userId || !agencyId) {
            await trx.rollback();
            res.status(401).json({ ok: false, error: 'No autenticado o sin agencia' });
            return;
        }
        // 1. Ingresos (M1: turnos_dia / shifts)
        const turnos = await trx('turnos_dia as t')
            .leftJoin('personal as p', 't.conductor_id', 'p.id')
            .where('t.agency_id', agencyId)
            .andWhere((b) => {
            b.where('t.conductor_id', userId)
                .orWhere('p.internal_number', userId);
        })
            .select('t.id', 't.monto_estimado', 't.fecha');
        const totalIngresos = turnos.reduce((sum, t) => sum + Number(t.monto_estimado || 0), 0);
        // 2. Costos de Taller imputables al conductor (M7: maintenance_work_logs)
        const deduccionesTaller = await trx('maintenance_work_logs as mwl')
            .join('maintenance_tickets as mt', 'mwl.ticket_id', 'mt.id')
            .where('mt.agency_id', agencyId)
            .andWhere('mwl.conductor_implicado_id', userId)
            .select('mwl.id', 'mwl.costo_repuestos');
        const totalTaller = deduccionesTaller.reduce((sum, d) => sum + Number(d.costo_repuestos || 0), 0);
        // 3. Suspensiones (M8: abl_red_numbers)
        // Supongamos que se calcula un monto fijo por cada suspensión o se guarda en la tabla
        const suspensiones = await trx('abl_red_numbers as arn')
            .where('arn.agency_id', agencyId)
            .andWhere('arn.conductor_id', userId)
            .andWhere('arn.estado_tramite', 'SANCIONADO')
            .select('arn.id');
        // Costo harcodeado por suspensión a nivel de lógica de BD (ej: 1500 por suspensión)
        const COSTO_POR_SUSPENSION = 1500;
        const totalSanciones = suspensiones.length * COSTO_POR_SUSPENSION;
        // Saldo Neto
        const totalDeducciones = totalTaller + totalSanciones;
        const saldoNeto = totalIngresos - totalDeducciones;
        // Persistir el cálculo en driver_ledger para auditoría posterior (opcional, si es flujo de cierre)
        // Aquí solo lo calculamos y devolvemos inmutable.
        await trx.commit();
        // Crear Hash Estructural
        const payloadParaHash = JSON.stringify({
            userId,
            agencyId,
            totalIngresos,
            totalDeducciones,
            saldoNeto,
            timestamp: new Date().toISOString()
        });
        const hashSHA256 = crypto_1.default.createHash('sha256').update(payloadParaHash).digest('hex');
        res.json({
            ok: true,
            balance: {
                totalIngresos,
                totalTaller,
                totalSanciones,
                totalDeducciones,
                saldoNeto,
                hashVerificacion: hashSHA256
            }
        });
    }
    catch (err) {
        await trx.rollback();
        logger_1.default.error('[getBalanceOficialConductor] Error', { error: String(err) });
        res.status(500).json({ ok: false, error: 'Error calculando balance' });
    }
}
