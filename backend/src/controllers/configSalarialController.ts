/**
 * configSalarialController — /api/admin/config-salarial (FASE 5.28, 2026-05-19)
 *
 * Antes 404 (ConfigSalarialTab). Persiste en system_config con dos keys:
 *   - config_salarial_turnos     → { categorias: {...}, vigenciaDesde }
 *   - config_salarial_descuentos → { items: [...],     vigenciaDesde }
 *
 *   GET  /api/admin/config-salarial             → { turnos, descuentos }
 *   PUT  /api/admin/config-salarial/turnos      body: { categorias, vigenciaDesde? }
 *   PUT  /api/admin/config-salarial/descuentos  body: { items, vigenciaDesde? }
 */

import { Request, Response } from 'express';
import sqlDb from '../config/database';
import logger from '../config/logger';
import { getMotorConfig, setMotorConfig } from '../services/motorConfigService';

const KEY_TURNOS = 'config_salarial_turnos';
const KEY_DESC = 'config_salarial_descuentos';

async function readConfig(key: string): Promise<Record<string, unknown> | null> {
  const row = await sqlDb('system_config').where('key', key).first();
  if (!row) return null;
  const v = (row as { value_jsonb?: unknown }).value_jsonb;
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

async function writeConfig(key: string, value: Record<string, unknown>): Promise<void> {
  const exists = await sqlDb('system_config').where('key', key).first();
  if (exists) {
    await sqlDb('system_config').where('key', key).update({ value_jsonb: value });
  } else {
    await sqlDb('system_config').insert({ key, value_jsonb: value });
  }
}

export async function getConfigSalarial(_req: Request, res: Response): Promise<void> {
  try {
    const [turnos, descuentos] = await Promise.all([readConfig(KEY_TURNOS), readConfig(KEY_DESC)]);
    res.json({
      ok: true,
      turnos: turnos ?? { categorias: {}, vigenciaDesde: null },
      descuentos: descuentos ?? { items: [], vigenciaDesde: null },
    });
  } catch (err) {
    logger.error('[config-salarial/get]', { error: String(err) });
    res.status(500).json({ ok: false, error: 'Error leyendo config salarial' });
  }
}

export async function putTurnos(req: Request, res: Response): Promise<void> {
  try {
    const body = (req.body ?? {}) as { categorias?: unknown; vigenciaDesde?: string | null };
    if (!body.categorias || typeof body.categorias !== 'object') {
      res.status(400).json({ ok: false, error: 'Falta categorias' });
      return;
    }
    await writeConfig(KEY_TURNOS, {
      categorias: body.categorias,
      vigenciaDesde: body.vigenciaDesde ?? null,
      updated_at: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (err) {
    logger.error('[config-salarial/turnos]', { error: String(err) });
    res.status(500).json({ ok: false, error: 'Error guardando turnos' });
  }
}

export async function putDescuentos(req: Request, res: Response): Promise<void> {
  try {
    const body = (req.body ?? {}) as { items?: unknown; vigenciaDesde?: string | null };
    if (!Array.isArray(body.items)) {
      res.status(400).json({ ok: false, error: 'Falta items[]' });
      return;
    }
    await writeConfig(KEY_DESC, {
      items: body.items,
      vigenciaDesde: body.vigenciaDesde ?? null,
      updated_at: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (err) {
    logger.error('[config-salarial/descuentos]', { error: String(err) });
    res.status(500).json({ ok: false, error: 'Error guardando descuentos' });
  }
}

// ─── FASE 5.32 (2026-05-21) Motor de consecuencias config ─────────────────

export async function getMotorConfigHandler(_req: Request, res: Response): Promise<void> {
  try {
    const cfg = await getMotorConfig();
    res.json({ ok: true, data: cfg, key: 'config_motor_consecuencias' });
  } catch (err) {
    logger.error('[config-motor/get]', { error: String(err) });
    res.status(500).json({ ok: false, error: 'Error leyendo config motor' });
  }
}

export async function putMotorConfigHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const partial: Record<string, number> = {};
    for (const [k, v] of Object.entries(body)) {
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
        partial[k] = v;
      }
    }
    if (Object.keys(partial).length === 0) {
      res.status(400).json({ ok: false, error: 'Body vacío o sin valores numéricos válidos' });
      return;
    }
    const merged = await setMotorConfig(partial);
    res.json({ ok: true, data: merged });
  } catch (err) {
    logger.error('[config-motor/put]', { error: String(err) });
    res.status(500).json({ ok: false, error: 'Error guardando config motor: ' + String(err).slice(0, 120) });
  }
}
