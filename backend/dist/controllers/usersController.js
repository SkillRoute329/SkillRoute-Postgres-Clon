"use strict";
/**
 * usersController — /api/users (FASE 5.28, 2026-05-19)
 *
 * Antes era 404 (AdminWhatsApp, Employees). Devuelve la tabla `users`
 * (1002 registros hoy) como array directo en shape camelCase compatible
 * con el shim Firestore.
 *
 * OWASP A02: password/secret/token NUNCA se exponen.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listUsers = listUsers;
const database_1 = __importDefault(require("../config/database"));
const logger_1 = __importDefault(require("../config/logger"));
const SENSITIVE = new Set([
    'password', 'password_hash', 'pwd', 'token', 'api_key', 'apiKey', 'secret',
]);
function flatten(row) {
    const out = { ...row };
    const j = row.data_jsonb;
    if (j && typeof j === 'object') {
        const safe = {};
        for (const [k, v] of Object.entries(j)) {
            if (!SENSITIVE.has(k))
                safe[k] = v;
        }
        out['data_jsonb'] = safe;
        for (const [k, v] of Object.entries(safe)) {
            if (!(k in out) || out[k] == null)
                out[k] = v;
        }
    }
    for (const k of SENSITIVE)
        delete out[k];
    // Aliases camelCase legacy Firestore.
    // En esta tabla `id` ES el número interno (no hay columna internal_number).
    if (out.full_name && !out.fullName)
        out.fullName = out.full_name;
    if (out.id && !out.internalNumber)
        out.internalNumber = out.id;
    if (out.agency_id && !out.agencyId)
        out.agencyId = out.agency_id;
    return out;
}
async function listUsers(req, res) {
    try {
        const limit = Math.min(5000, Math.max(1, parseInt(req.query.limit ?? '2000', 10)));
        const agencyId = req.query.agency_id;
        const role = req.query.role;
        let q = (0, database_1.default)('users').select('*').orderBy([{ column: 'agency_id' }, { column: 'id' }]);
        if (agencyId)
            q = q.where('agency_id', agencyId);
        if (role)
            q = q.where('role', role);
        q = q.limit(limit);
        const rows = await q;
        // El front (AdminWhatsApp) espera ARRAY directo, no { ok, data }.
        res.json(rows.map((r) => flatten(r)));
    }
    catch (err) {
        logger_1.default.error('[users] list', { error: String(err) });
        res.status(500).json([]); // array vacío para no romper la UI
    }
}
