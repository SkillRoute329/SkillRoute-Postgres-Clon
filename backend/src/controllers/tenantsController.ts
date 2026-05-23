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

import { Request, Response } from 'express';
import sqlDb from '../config/database';
import logger from '../config/logger';

export async function listTenants(_req: Request, res: Response): Promise<void> {
  try {
    const rows: Array<{ id: number; agency_id: string; nombre: string; created_at: Date }>
      = await sqlDb('empresas').select('*').orderBy('agency_id');
    const tenants = rows.map((r) => ({
      id: r.agency_id,                       // agency_id como id principal
      agency_id: r.agency_id,
      name: r.nombre,
      nombre: r.nombre,
      slug: r.agency_id,
      created_at: r.created_at,
    }));
    res.json({ ok: true, data: tenants, total: tenants.length });
  } catch (err) {
    logger.error('[tenants/list]', { error: String(err) });
    res.status(500).json({ ok: false, error: 'Error listando tenants', data: [] });
  }
}

export async function createTenant(req: Request, res: Response): Promise<void> {
  try {
    const body = (req.body ?? {}) as { name?: string; slug?: string; agency_id?: string };
    const nombre = body.name?.trim();
    const agencyId = (body.agency_id ?? body.slug)?.trim();
    if (!nombre || !agencyId) {
      res.status(400).json({ ok: false, error: 'Faltan name y slug/agency_id' });
      return;
    }
    const exists = await sqlDb('empresas').where('agency_id', agencyId).first();
    if (exists) {
      res.status(409).json({ ok: false, error: 'agency_id ya existe' });
      return;
    }
    await sqlDb('empresas').insert({ agency_id: agencyId, nombre });
    res.json({ ok: true, data: { id: agencyId, agency_id: agencyId, name: nombre, slug: agencyId } });
  } catch (err) {
    logger.error('[tenants/create]', { error: String(err) });
    res.status(500).json({ ok: false, error: 'Error creando tenant' });
  }
}
