"use strict";
/**
 * tenantsController — /api/tenants (FASE 5.28, 2026-05-19)
 *
 * Antes 404 (TenantsManager). Devuelve los 4 operadores reales desde la
 * tabla `empresas`. El POST crea un tenant nuevo si vinieran agency_id y
 * nombre; lo principal hoy es el GET para mostrar los 4 operadores
 * existentes (UCOT 70, CUTCSA 50, COME 20, COETC 10).
 *
 * Shape esperado por el frontend (TenantsManager):
 *   { id, name, slug, ... }
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listTenants = listTenants;
exports.createTenant = createTenant;
const database_1 = __importDefault(require("../config/database"));
const logger_1 = __importDefault(require("../config/logger"));
async function listTenants(_req, res) {
    try {
        const rows = await (0, database_1.default)('empresas').select('*').orderBy('agency_id');
        const tenants = rows.map((r) => ({
            id: r.agency_id, // agency_id como id principal
            agency_id: r.agency_id,
            name: r.nombre,
            nombre: r.nombre,
            slug: r.agency_id,
            created_at: r.created_at,
        }));
        res.json({ ok: true, data: tenants, total: tenants.length });
    }
    catch (err) {
        logger_1.default.error('[tenants/list]', { error: String(err) });
        res.status(500).json({ ok: false, error: 'Error listando tenants', data: [] });
    }
}
async function createTenant(req, res) {
    try {
        const body = (req.body ?? {});
        const nombre = body.name?.trim();
        const agencyId = (body.agency_id ?? body.slug)?.trim();
        if (!nombre || !agencyId) {
            res.status(400).json({ ok: false, error: 'Faltan name y slug/agency_id' });
            return;
        }
        const exists = await (0, database_1.default)('empresas').where('agency_id', agencyId).first();
        if (exists) {
            res.status(409).json({ ok: false, error: 'agency_id ya existe' });
            return;
        }
        await (0, database_1.default)('empresas').insert({ agency_id: agencyId, nombre });
        res.json({ ok: true, data: { id: agencyId, agency_id: agencyId, name: nombre, slug: agencyId } });
    }
    catch (err) {
        logger_1.default.error('[tenants/create]', { error: String(err) });
        res.status(500).json({ ok: false, error: 'Error creando tenant' });
    }
}
