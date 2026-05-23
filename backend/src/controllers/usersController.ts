/**
 * usersController — /api/users (FASE 5.28, 2026-05-19)
 *
 * Antes era 404 (AdminWhatsApp, Employees). Devuelve la tabla `users`
 * (1002 registros hoy) como array directo en shape camelCase compatible
 * con el shim Firestore.
 *
 * OWASP A02: password/secret/token NUNCA se exponen.
 */

import { Request, Response } from 'express';
import sqlDb from '../config/database';
import logger from '../config/logger';

const SENSITIVE = new Set([
  'password', 'password_hash', 'pwd', 'token', 'api_key', 'apiKey', 'secret',
]);

function flatten(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  const j = row.data_jsonb;
  if (j && typeof j === 'object') {
    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(j as Record<string, unknown>)) {
      if (!SENSITIVE.has(k)) safe[k] = v;
    }
    out['data_jsonb'] = safe;
    for (const [k, v] of Object.entries(safe)) {
      if (!(k in out) || out[k] == null) out[k] = v;
    }
  }
  for (const k of SENSITIVE) delete out[k];
  // Aliases camelCase legacy Firestore.
  // En esta tabla `id` ES el número interno (no hay columna internal_number).
  if (out.full_name && !out.fullName) out.fullName = out.full_name;
  if (out.id && !out.internalNumber) out.internalNumber = out.id;
  if (out.agency_id && !out.agencyId) out.agencyId = out.agency_id;
  return out;
}

export async function listUsers(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(5000, Math.max(1, parseInt((req.query.limit as string) ?? '2000', 10)));
    const agencyId = req.query.agency_id as string | undefined;
    const role = req.query.role as string | undefined;

    let q = sqlDb('users').select('*').orderBy([{ column: 'agency_id' }, { column: 'id' }]);
    if (agencyId) q = q.where('agency_id', agencyId);
    if (role) q = q.where('role', role);
    q = q.limit(limit);

    const rows = await q;
    // El front (AdminWhatsApp) espera ARRAY directo, no { ok, data }.
    res.json(rows.map((r: Record<string, unknown>) => flatten(r)));
  } catch (err) {
    logger.error('[users] list', { error: String(err) });
    res.status(500).json([]); // array vacío para no romper la UI
  }
}
