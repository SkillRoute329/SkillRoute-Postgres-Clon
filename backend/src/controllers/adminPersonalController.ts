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

import { Request, Response } from 'express';
import sqlDb from '../config/database';
import logger from '../config/logger';

// ── Tipos ──────────────────────────────────────────────────────────────────

/** Estados laborales válidos del sistema (refleja CHECK de la tabla) */
type EstadoHoy =
  | 'disponible'
  | 'en_servicio'
  | 'ausente'
  | 'reserva'
  | 'franco'
  | 'licencia'
  | 'enfermo';

/** Estados que bloquean coercitivamente la asignación en listería */
const ESTADOS_BLOQUEANTES: EstadoHoy[] = ['ausente', 'enfermo', 'licencia'];

/** Categorías habilitadas Grupo 13 MTSS */
type CategoriaLaboral =
  | 'CONDUCTOR_1'
  | 'CONDUCTOR_2'
  | 'RETEN'
  | 'LARGADOR'
  | 'ADMINISTRATIVO';

interface LegajoLaboral {
  id: string;
  agency_id: string;
  internal_number: string;
  full_name: string;
  role: string;
  categoria_laboral: CategoriaLaboral | null;
  sueldo_jornal_base: number;
  fecha_ingreso: string; // ISO DATE
  fecha_egreso: string | null;
  estado_hoy: EstadoHoy;
  motivo_ausencia: string | null;
  antiguedad_anios: number;
  antiguedad_meses: number;
  dias_licencia_generados: number;
  monto_licencia_uyun: number;
  provision_aguinaldo_mensual: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const SENSITIVE_FIELDS = new Set([
  'password', 'password_hash', 'pwd', 'token', 'api_key', 'apiKey', 'secret',
]);

function stripSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!SENSITIVE_FIELDS.has(k)) out[k] = v;
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
  for (const k of SENSITIVE_FIELDS) delete (out as Record<string, unknown>)[k];
  if (out.full_name && !out.nombre) out.nombre = out.full_name;
  if (out.internal_number && !out.interno) out.interno = out.internal_number;
  return out;
}

// ── Controllers ────────────────────────────────────────────────────────────

export async function listPersonal(req: Request, res: Response): Promise<void> {
  try {
    const limit  = Math.min(5000, Math.max(1, parseInt((req.query.limit  as string) ?? '500', 10)));
    const offset = Math.max(0,    parseInt((req.query.offset as string) ?? '0',   10));
    const agencyId = req.query.agency_id as string | undefined;
    const rol      = req.query.rol       as string | undefined;
    const estado   = req.query.estado    as string | undefined;
    const q        = req.query.q         as string | undefined;

    let baseQ = sqlDb('personal').select('*');
    if (agencyId) baseQ = baseQ.where('agency_id', agencyId);
    if (rol)      baseQ = baseQ.where('role', rol);
    if (estado)   baseQ = baseQ.where('estado_hoy', estado);
    if (q) {
      baseQ = baseQ.where((b) => {
        b.where('full_name',       'ilike', `%${q}%`)
         .orWhere('internal_number', 'ilike', `%${q}%`);
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
export async function getDetalleLaboralEmpleado(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  if (!id) {
    res.status(400).json({ ok: false, error: 'Parámetro id es obligatorio.' });
    return;
  }

  try {
    // Leer desde la vista que computa todo en PostgreSQL
    const legajo = await sqlDb('v_legajo_laboral').where('id', id).first() as LegajoLaboral | undefined;

    if (!legajo) {
      // Puede ser que el empleado tenga fecha_egreso (no aparece en la vista)
      const dado_de_baja = await sqlDb('personal').where('id', id).first();
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
    const asignacionesActivas = await sqlDb('roster_assignments')
      .where('driver_id', id)
      .whereNotIn('estado', ['FINALIZADO', 'CANCELADO'])
      .select('id', 'estado', 'hora_inicio', 'hora_fin', 'linea_id');

    res.json({
      ok: true,
      legajo: {
        ...stripSensitive(legajo as unknown as Record<string, unknown>),
        asignaciones_activas: asignacionesActivas,
        esta_bloqueado: ESTADOS_BLOQUEANTES.includes(legajo.estado_hoy as EstadoHoy),
      },
    });
  } catch (err) {
    logger.error('[admin/personal] legajo', { id, error: String(err) });
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
export async function updatePersonal(req: Request, res: Response): Promise<void> {
  const id   = req.params.id;
  const body = (req.body ?? {}) as Record<string, unknown>;

  if (!id) {
    res.status(400).json({ ok: false, error: 'Falta id' });
    return;
  }

  const TOP: Record<string, string> = {
    cargo:                'data_jsonb',
    rol:                  'role',
    role:                 'role',
    telefono:             'telefono',
    estado:               'estado_hoy',
    estado_hoy:           'estado_hoy',
    full_name:            'full_name',
    nombre:               'full_name',
    internal_number:      'internal_number',
    interno:              'internal_number',
    motivo_ausencia:      'motivo_ausencia',
    ausencia_fecha:       'ausencia_fecha',
    ausencia_registrada_por: 'ausencia_registrada_por',
    es_conductor_reserva: 'es_conductor_reserva',
    regimen_rotacion:     'regimen_rotacion',
    is_en_lista:          'is_en_lista',
    patron_descanso:      'patron_descanso',
    // Nuevas columnas Módulo 10
    fecha_ingreso:        'fecha_ingreso',
    fecha_egreso:         'fecha_egreso',
    categoria_laboral:    'categoria_laboral',
    sueldo_jornal_base:   'sueldo_jornal_base',
  };

  const setTop:  Record<string, unknown> = {};
  const setJson: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(body)) {
    if (SENSITIVE_FIELDS.has(k)) continue;          // OWASP A02
    const dest = TOP[k];
    if (dest === 'data_jsonb') setJson[k] = v;
    else if (dest)             setTop[dest] = v;
    else                       setJson[k] = v;
  }

  if (Object.keys(setTop).length === 0 && Object.keys(setJson).length === 0) {
    res.status(400).json({ ok: false, error: 'Body vacío' });
    return;
  }

  // Merge data_jsonb existente
  if (Object.keys(setJson).length > 0) {
    setTop['data_jsonb'] = sqlDb.raw(
      "COALESCE(data_jsonb, '{}'::jsonb) || ?::jsonb",
      [JSON.stringify(setJson)]
    );
  }
  setTop['updated_at'] = sqlDb.fn.now();

  // ── Transacción ACID: actualizar + bloqueo coercitivo de listería ────────
  const trx = await sqlDb.transaction();
  try {
    const n = await trx('personal').where('id', id).update(setTop);
    if (n === 0) {
      await trx.rollback();
      res.status(404).json({ ok: false, error: 'Empleado no encontrado' });
      return;
    }

    // Bloqueo coercitivo: si el nuevo estado es bloqueante, cancelar turnos PROGRAMADOS
    const nuevoEstado = (setTop['estado_hoy'] ?? '') as string;
    let asignacionesCanceladas = 0;

    if (ESTADOS_BLOQUEANTES.includes(nuevoEstado as EstadoHoy)) {
      asignacionesCanceladas = await trx('roster_assignments')
        .where('driver_id', id)
        .where('estado', 'PROGRAMADO')
        .update({
          estado: 'CANCELADO',
          updated_at: trx.fn.now(),
        });

      logger.warn('[admin/personal] BLOQUEO COERCITIVO de listería', {
        driver_id: id,
        nuevo_estado: nuevoEstado,
        asignaciones_canceladas: asignacionesCanceladas,
      });
    }

    await trx.commit();

    res.json({
      ok: true,
      id,
      updated: true,
      bloqueo_coercitivo_aplicado: asignacionesCanceladas > 0,
      asignaciones_canceladas: asignacionesCanceladas,
    });
  } catch (err) {
    await trx.rollback();
    logger.error('[admin/personal] update error', { id, error: String(err) });
    res.status(500).json({ ok: false, error: 'Error actualizando personal' });
  }
}
