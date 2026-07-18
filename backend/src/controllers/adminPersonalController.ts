/**
 * adminPersonalController — endpoint /api/admin/personal (FASE 5.27, 2026-05-19)
 *
 * Antes era 404. Lo consumen PersonalUcot.tsx y AdminRRHH.tsx para listar y
 * editar la planta de personal UCOT (879 registros en DB hoy).
 *
 * Shape acordado con el frontend:
 *   GET    → { ok: true, total, empleados: [...] }
 *   PUT    → { ok: true, id, updated: true }
 *
 * Sólo expone columnas top-level + alias del data_jsonb más comunes. No
 * inventa data.
 */

import { Request, Response } from 'express';
import sqlDb from '../config/database';
import logger from '../config/logger';

// OWASP A02: nunca devolver password ni tokens al cliente, ni dentro del jsonb.
const SENSITIVE_FIELDS = new Set([
  'password', 'password_hash', 'pwd', 'token', 'api_key', 'apiKey', 'secret',
]);

function stripSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

function flatten(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  const j = row.data_jsonb;
  if (j && typeof j === 'object') {
    const safeJ = stripSensitive(j as Record<string, unknown>);
    out['data_jsonb'] = safeJ;
    for (const [k, v] of Object.entries(safeJ)) {
      if (!(k in out) || out[k] == null) out[k] = v;
    }
  }
  // Quitar sensibles que pudieran haber llegado como columna top-level
  for (const k of SENSITIVE_FIELDS) delete (out as Record<string, unknown>)[k];
  // Aliases que el frontend espera
  if (out.full_name && !out.nombre) out.nombre = out.full_name;
  if (out.internal_number && !out.interno) out.interno = out.internal_number;
  return out;
}

export async function listPersonal(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(5000, Math.max(1, parseInt((req.query.limit as string) ?? '500', 10)));
    const offset = Math.max(0, parseInt((req.query.offset as string) ?? '0', 10));
    const agencyId = req.query.agency_id as string | undefined;
    const rol = req.query.rol as string | undefined;
    const estado = req.query.estado as string | undefined;
    const q = req.query.q as string | undefined;

    let baseQ = sqlDb('personal').select('*');
    if (agencyId) baseQ = baseQ.where('agency_id', agencyId);
    if (rol) baseQ = baseQ.where('role', rol);
    if (estado) baseQ = baseQ.where('estado_hoy', estado);
    if (q) {
      baseQ = baseQ.where((b) => {
        b.where('full_name', 'ilike', `%${q}%`).orWhere('internal_number', 'ilike', `%${q}%`);
      });
    }
    const rows = await baseQ
      .orderBy([{ column: 'agency_id' }, { column: 'internal_number' }])
      .limit(limit)
      .offset(offset);
    const empleados = rows.map((r: Record<string, unknown>) => flatten(r));
    res.json({ ok: true, total: empleados.length, empleados });
  } catch (err) {
    logger.error('[admin/personal] list', { error: String(err) });
    res.status(500).json({ ok: false, error: 'Error listando personal', empleados: [], total: 0 });
  }
}

export async function updatePersonal(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id;
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!id) {
      res.status(400).json({ ok: false, error: 'Falta id' });
      return;
    }
    // Solo permitir cambios sobre columnas conocidas; lo demás va a data_jsonb.
    const TOP: Record<string, string> = {
      cargo: 'data_jsonb',          // cargo no es top-level → va al jsonb
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
      es_conductor_reserva: 'es_conductor_reserva',
      regimen_rotacion: 'regimen_rotacion',
      is_en_lista: 'is_en_lista',
      patron_descanso: 'patron_descanso',
    };
    const setTop: Record<string, unknown> = {};
    const setJson: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      const dest = TOP[k];
      if (dest === 'data_jsonb') setJson[k] = v;
      else if (dest) setTop[dest] = v;
      else setJson[k] = v;
    }
    if (Object.keys(setTop).length === 0 && Object.keys(setJson).length === 0) {
      res.status(400).json({ ok: false, error: 'Body vacío' });
      return;
    }
    // Merge data_jsonb existente.
    if (Object.keys(setJson).length > 0) {
      setTop['data_jsonb'] = sqlDb.raw('COALESCE(data_jsonb, \'{}\'::jsonb) || ?::jsonb', [
        JSON.stringify(setJson),
      ]);
    }
    setTop['updated_at'] = sqlDb.fn.now();
    const n = await sqlDb('personal').where('id', id).update(setTop);
    if (n === 0) {
      res.status(404).json({ ok: false, error: 'Empleado no encontrado' });
      return;
    }
    res.json({ ok: true, id, updated: true });
  } catch (err) {
    logger.error('[admin/personal] update', { error: String(err) });
    res.status(500).json({ ok: false, error: 'Error actualizando personal' });
  }
}
