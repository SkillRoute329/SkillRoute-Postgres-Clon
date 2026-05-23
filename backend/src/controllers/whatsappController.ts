/**
 * whatsappController — /api/whatsapp/{status,restart} (FASE 5.28, 2026-05-19)
 *
 * Antes 404 (AdminWhatsApp, AdminWhatsAppSettings). No tenemos servicio
 * WhatsApp activo todavía (whatsapp-web.js no está corriendo en este
 * stack). Para no romper la UI ni mentir, los endpoints declaran honestamente
 * que el servicio NO está conectado, e incluyen `nota` explicando la razón.
 *
 * Cuando se integre un servicio WhatsApp real, esta capa puede consultar a
 * un microservicio (típicamente :3199) y devolver el estado real + QR.
 */

import { Request, Response } from 'express';
import logger from '../config/logger';

const SERVICIO_DISPONIBLE = false;

interface RestartLog {
  ts: string;
  clean: boolean;
  by: string | null;
}
const restartLog: RestartLog[] = [];

export function getWhatsappStatus(_req: Request, res: Response): void {
  if (SERVICIO_DISPONIBLE) {
    // Aquí iría la consulta al microservicio real.
    res.json({ status: 'DISCONNECTED', qrCode: null });
    return;
  }
  res.json({
    status: 'DISCONNECTED',
    qrCode: null,
    nota: 'Servicio WhatsApp no integrado en este stack. Activar microservicio para conectar.',
    restarts: restartLog.slice(-5),
  });
}

export function postWhatsappRestart(req: Request, res: Response): void {
  const clean = Boolean(req.body?.clean);
  restartLog.push({
    ts: new Date().toISOString(),
    clean,
    by: (req as Request & { user?: { id?: string } }).user?.id ?? null,
  });
  logger.info('[whatsapp] restart solicitado', { clean });
  res.json({
    ok: true,
    status: 'INITIALIZING',
    nota: 'Solicitud de reinicio registrada. Servicio WhatsApp aún no integrado en este stack.',
  });
}
