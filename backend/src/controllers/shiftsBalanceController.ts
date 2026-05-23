/**
 * shiftsBalanceController — endpoints de balance y pagos (FASE 5.28, 2026-05-19)
 *
 * Antes 404 (AdminBalances modal de pagos). Ahora consulta `shifts` +
 * `shift_payments` con la fórmula:
 *
 *   balance(U) = SUM(shifts asignados a U).totalValue
 *              - SUM(shifts cedidos por U).totalValue
 *              - SUM(shift_payments).monto
 *
 * Si shifts está vacío (no hay operación cargada), devuelve totals 0 y
 * lista vacía — vacío honesto, no inventado.
 *
 *   GET  /api/shifts/balances          → { globals, users }
 *   GET  /api/shifts/unpaid/:userId    → array de shifts no pagados
 *   POST /api/shifts/payment           → registra pago/cobro parcial
 *   POST /api/shifts/pay               → marca todo como saldado (balance=0)
 */

import { Request, Response } from 'express';
import sqlDb from '../config/database';
import logger from '../config/logger';
import { v4 as uuidv4 } from 'uuid';

interface ShiftRow {
  id: string;
  user_id: string | null;
  agency_id: string | null;
  fecha: string | null;
  estado: string | null;
  data_jsonb: Record<string, unknown> | null;
}

function readJsonb(r: ShiftRow): Record<string, unknown> {
  return r.data_jsonb && typeof r.data_jsonb === 'object' ? r.data_jsonb : {};
}

function totalValueOf(r: ShiftRow): number {
  const j = readJsonb(r);
  const v = Number(j.totalValue ?? j.valor ?? j.monto ?? 0);
  return Number.isFinite(v) ? v : 0;
}

function isPaid(r: ShiftRow): boolean {
  const j = readJsonb(r);
  return j.paid === true || j.pagado === true || j.estado === 'pagado' || r.estado === 'pagado';
}

function createdBy(r: ShiftRow): string | null {
  const j = readJsonb(r);
  return (j.createdBy as string) ?? (j.created_by as string) ?? null;
}

function assignedTo(r: ShiftRow): string | null {
  if (r.user_id) return r.user_id;
  const j = readJsonb(r);
  return (j.assignedTo as string) ?? (j.userId as string) ?? null;
}

// ─── GET /api/shifts/balances ─────────────────────────────────────────────

export async function getBalances(_req: Request, res: Response): Promise<void> {
  try {
    const shifts: ShiftRow[] = await sqlDb('shifts').select('*');
    const payments: Array<{ user_id: string; monto: string | number }> = await sqlDb('shift_payments')
      .select('user_id', 'monto');
    // `users` no tiene columna internal_number — el id ES el número interno.
    const users: Array<{ id: string; full_name: string | null; agency_id: string | null }>
      = await sqlDb('users').select('id', 'full_name', 'agency_id');

    const tomadoBy = new Map<string, number>(); // userId -> sum
    const cedidoBy = new Map<string, number>();
    let totalTomados = 0;
    let totalCedidos = 0;

    for (const s of shifts) {
      const value = totalValueOf(s);
      const a = assignedTo(s);
      const c = createdBy(s);
      if (a) {
        tomadoBy.set(a, (tomadoBy.get(a) ?? 0) + value);
        totalTomados += value;
      }
      if (c && c !== a) {
        cedidoBy.set(c, (cedidoBy.get(c) ?? 0) + value);
        totalCedidos += value;
      }
    }

    const paidBy = new Map<string, number>();
    for (const p of payments) {
      const v = Number(p.monto) || 0;
      paidBy.set(p.user_id, (paidBy.get(p.user_id) ?? 0) + v);
    }

    const usersOut = users.map((u) => {
      const tom = tomadoBy.get(u.id) ?? 0;
      const ced = cedidoBy.get(u.id) ?? 0;
      const pay = paidBy.get(u.id) ?? 0;
      const balance = tom - ced - pay;
      const [first, ...rest] = (u.full_name ?? '').split(/\s+/);
      return {
        user_id: u.id,
        internalNumber: u.id,            // en este schema id = número interno
        firstName: first ?? '',
        lastName: rest.join(' '),
        agency_id: u.agency_id,
        totalTomados: tom,
        totalCedidos: ced,
        totalPagado: pay,
        balance,
      };
    }).filter((u) => u.totalTomados !== 0 || u.totalCedidos !== 0 || u.totalPagado !== 0);

    res.json({
      ok: true,
      globals: {
        totalTomados,
        totalCedidos,
        totalPagado: Array.from(paidBy.values()).reduce((s, v) => s + v, 0),
      },
      users: usersOut,
      hint: shifts.length === 0 ? 'No hay turnos cargados todavía. Generar desde Distribución.' : undefined,
    });
  } catch (err) {
    logger.error('[shifts/balances]', { error: String(err) });
    res.status(500).json({ ok: false, error: 'Error calculando balances', globals: { totalTomados: 0, totalCedidos: 0, totalPagado: 0 }, users: [] });
  }
}

// ─── GET /api/shifts/unpaid/:userId ────────────────────────────────────────

export async function getUnpaidShifts(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.params.userId;
    const shifts: ShiftRow[] = await sqlDb('shifts').select('*').where('user_id', userId);
    const out = shifts
      .filter((s) => !isPaid(s))
      .map((s) => ({
        id: s.id,
        user_id: s.user_id,
        agency_id: s.agency_id,
        fecha: s.fecha,
        estado: s.estado,
        totalValue: totalValueOf(s),
        paid: false,
        ...readJsonb(s),
      }));
    res.json(out); // ARRAY directo (la UI lo espera así)
  } catch (err) {
    logger.error('[shifts/unpaid]', { error: String(err) });
    res.status(500).json([]);
  }
}

// ─── POST /api/shifts/payment ──────────────────────────────────────────────
// Body: { userId, amount, motivo? }
// Convención de signo: amount > 0 = pago al chofer; amount < 0 = cobro al chofer.

export async function postPayment(req: Request, res: Response): Promise<void> {
  try {
    const { userId, amount, motivo } = (req.body ?? {}) as { userId?: string; amount?: number; motivo?: string };
    if (!userId || typeof amount !== 'number' || !Number.isFinite(amount) || amount === 0) {
      res.status(400).json({ ok: false, error: 'Faltan userId/amount o amount es 0' });
      return;
    }
    const user = await sqlDb('users').select('agency_id').where('id', userId).first();
    const id = uuidv4();
    await sqlDb('shift_payments').insert({
      id,
      user_id: userId,
      agency_id: user?.agency_id ?? null,
      monto: amount,
      tipo: 'parcial',
      motivo: motivo ?? null,
      registrado_por: (req as Request & { user?: { id?: string } }).user?.id ?? null,
      fecha: new Date().toISOString().slice(0, 10),
    });
    res.json({ ok: true, id, userId, amount });
  } catch (err) {
    logger.error('[shifts/payment]', { error: String(err) });
    res.status(500).json({ ok: false, error: 'Error registrando pago' });
  }
}

// ─── POST /api/shifts/pay ─────────────────────────────────────────────────
// Body: { userId }
// Salda el balance actual del usuario: calcula su balance y registra una
// transacción que lo lleve a 0. Si no hay balance, no-op.

export async function postPayAll(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = (req.body ?? {}) as { userId?: string };
    if (!userId) {
      res.status(400).json({ ok: false, error: 'Falta userId' });
      return;
    }
    const shifts: ShiftRow[] = await sqlDb('shifts').select('*').where('user_id', userId);
    const tom = shifts.reduce((s, r) => s + totalValueOf(r), 0);
    const ceded: ShiftRow[] = await sqlDb('shifts')
      .select('*')
      .whereRaw("(data_jsonb->>'createdBy' = ?)", [userId]);
    const ced = ceded.filter((r) => assignedTo(r) !== userId).reduce((s, r) => s + totalValueOf(r), 0);
    const payments: Array<{ monto: string | number }> = await sqlDb('shift_payments')
      .select('monto')
      .where('user_id', userId);
    const pay = payments.reduce((s, p) => s + (Number(p.monto) || 0), 0);
    const balance = tom - ced - pay;
    if (balance === 0) {
      res.json({ ok: true, userId, balance: 0, note: 'Balance ya estaba en 0; sin cambios' });
      return;
    }
    const user = await sqlDb('users').select('agency_id').where('id', userId).first();
    const id = uuidv4();
    await sqlDb('shift_payments').insert({
      id,
      user_id: userId,
      agency_id: user?.agency_id ?? null,
      monto: balance,                 // balance positivo → pago al chofer; negativo → cobro
      tipo: 'saldo_total',
      motivo: balance >= 0 ? 'Saldo final pagado' : 'Saldo final cobrado',
      registrado_por: (req as Request & { user?: { id?: string } }).user?.id ?? null,
      fecha: new Date().toISOString().slice(0, 10),
    });
    res.json({ ok: true, userId, paidNow: balance, balance: 0 });
  } catch (err) {
    logger.error('[shifts/pay]', { error: String(err) });
    res.status(500).json({ ok: false, error: 'Error procesando saldo total' });
  }
}
