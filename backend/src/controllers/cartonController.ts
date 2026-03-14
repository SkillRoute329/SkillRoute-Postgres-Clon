/**
 * Controladores para cartones (servicios)
 */

import { Response } from 'express';
import { AuthRequest, ApiResponse, ApiPaginatedResponse } from '../types/index';
import * as cartonService from '../services/cartonService';

/**
 * GET /api/cartones - Obtener todos los cartones
 */
export async function getAllCartones(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cartones = await cartonService.getAllCartones();

    const response: ApiPaginatedResponse = {
      ok: true,
      data: cartones,
      total: cartones.length,
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (error) {
    throw error;
  }
}

/**
 * GET /api/cartones/:id - Obtener un cartón específico
 */
export async function getCartonById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const carton = await cartonService.getCartonById(id);

    const response: ApiResponse = {
      ok: true,
      data: carton,
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (error) {
    throw error;
  }
}

/**
 * POST /api/cartones - Crear o actualizar un cartón
 */
export async function saveCarton(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cartonId = await cartonService.saveCarton(req.body, req.user?.id || 'anonymous');

    const response: ApiResponse = {
      ok: true,
      data: { id: cartonId },
      message: 'Cartón guardado correctamente',
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (error) {
    throw error;
  }
}

/**
 * DELETE /api/cartones/:id - Eliminar un cartón
 */
export async function deleteCarton(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    await cartonService.deleteCarton(id, req.user?.id || 'anonymous');

    const response: ApiResponse = {
      ok: true,
      message: 'Cartón eliminado correctamente',
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (error) {
    throw error;
  }
}
