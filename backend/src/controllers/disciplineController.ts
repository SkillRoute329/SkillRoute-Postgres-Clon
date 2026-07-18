import { Request, Response } from 'express';
import { AuthRequest } from '../types/index';
import { logger } from '../config/logger';
import sqlDb from '../config/database';
import { v4 as uuidv4 } from 'uuid';

export const disciplineController = {
  /**
   * Método interno invocado asíncronamente por M2/M4/M6
   */
  async generarAlertaAutomatica(
    agency_id: string,
    conductor_id: string,
    tipo_alerta: 'EXCESO_VELOCIDAD' | 'ENGAÑO_HORARIO' | 'FRAUDE_INSPECCION' | 'MANUAL',
    evidencia_jsonb: any
  ): Promise<void> {
    try {
      await sqlDb('abl_red_numbers').insert({
        id: uuidv4(),
        agency_id,
        conductor_id,
        tipo_alerta,
        evidencia_jsonb: JSON.stringify(evidencia_jsonb),
        estado_tramite: 'PENDIENTE_DESCARGO',
        fecha_apertura: sqlDb.fn.now(),
        data_jsonb: JSON.stringify({})
      });
      logger.info(`[M8 Disciplina] Alerta generada para conductor ${conductor_id}: ${tipo_alerta}`);
    } catch (error: any) {
      logger.error(`Error en generarAlertaAutomatica: ${error?.message || error}`);
    }
  },

  /**
   * POST /api/disciplina/descargo
   * Permite al conductor autenticado inyectar su justificación inmutable
   */
  async presentarDescargoConductor(req: AuthRequest, res: Response): Promise<void> {
    const { alerta_id, descargo } = req.body;
    const conductor_id = req.user?.id;

    if (!alerta_id || !descargo || !conductor_id) {
      res.status(400).json({ error: 'Faltan parámetros obligatorios.' });
      return;
    }

    try {
      await sqlDb.transaction(async (trx) => {
        // Verificar existencia y pertenencia
        const alerta = await trx('abl_red_numbers')
          .where({ id: alerta_id, conductor_id })
          .first();

        if (!alerta) {
          throw new Error('Alerta no encontrada o no pertenece al conductor.');
        }

        if (alerta.estado_tramite !== 'PENDIENTE_DESCARGO') {
          throw new Error('El descargo ya fue presentado o el trámite está cerrado.');
        }

        // Estampar descargo de forma inmutable
        await trx('abl_red_numbers')
          .where({ id: alerta_id })
          .update({
            descargo_conductor: descargo,
            fecha_descargo: trx.fn.now(),
            estado_tramite: 'PRESENTADO'
          });
      });

      res.status(200).json({ success: true, message: 'Descargo presentado inmutablemente.' });
    } catch (error: any) {
      logger.error(`Error en presentarDescargoConductor: ${error?.message || error}`);
      res.status(400).json({ error: error?.message || 'Error interno.' });
    }
  },

  /**
   * GET /api/disciplina/mis-alertas
   */
  async obtenerMisAlertas(req: AuthRequest, res: Response): Promise<void> {
    const conductor_id = req.user?.id;

    if (!conductor_id) {
      res.status(401).json({ error: 'No autenticado.' });
      return;
    }

    try {
      const alertas = await sqlDb('abl_red_numbers')
        .where({ conductor_id })
        .orderBy('fecha_apertura', 'desc');

      res.status(200).json({ success: true, alertas });
    } catch (error: any) {
      logger.error(`Error en obtenerMisAlertas: ${error?.message || error}`);
      res.status(500).json({ error: 'Error interno.' });
    }
  },

  /**
   * GET /api/disciplina/listado
   * Para el panel administrativo (PenalizationsPage)
   */
  async obtenerAlertasGlobales(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { agency_id } = req.query;
      const q = sqlDb('abl_red_numbers as a')
        .select('a.*', 'u.email as conductor_email', 'u.internal_number as conductor_interno')
        .leftJoin('users as u', 'a.conductor_id', 'u.id')
        .orderBy('a.fecha_apertura', 'desc');

      if (agency_id) {
        q.where('a.agency_id', agency_id);
      }

      const alertas = await q;
      res.status(200).json({ success: true, alertas });
    } catch (error: any) {
      logger.error(`Error en obtenerAlertasGlobales: ${error?.message || error}`);
      res.status(500).json({ error: 'Error interno.' });
    }
  }
};
