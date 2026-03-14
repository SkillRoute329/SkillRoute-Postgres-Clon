/**
 * Controladores para gestión de flota
 */

import { Response } from 'express';
import { AuthRequest, ApiResponse, ApiPaginatedResponse } from '../types/index';
import * as fleetService from '../services/fleetService';

/**
 * GET /api/fleet/vehicles - Obtener todos los vehículos
 */
export async function getAllVehicles(req: AuthRequest, res: Response): Promise<void> {
  try {
    const vehicles = await fleetService.getAllVehicles();

    const response: ApiPaginatedResponse = {
      ok: true,
      data: vehicles,
      total: vehicles.length,
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (error) {
    throw error;
  }
}

/**
 * GET /api/fleet/vehicles/:id - Obtener un vehículo específico
 */
export async function getVehicleById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const vehicle = await fleetService.getVehicleById(id);

    const response: ApiResponse = {
      ok: true,
      data: vehicle,
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (error) {
    throw error;
  }
}

/**
 * POST /api/fleet/check - Crear una inspección de vehículo
 */
export async function createFleetCheck(req: AuthRequest, res: Response): Promise<void> {
  try {
    const checkId = await fleetService.createFleetCheck(req.body, req.user?.id || 'anonymous');

    const response: ApiResponse = {
      ok: true,
      data: { checkId },
      message: 'Inspección registrada correctamente',
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (error) {
    throw error;
  }
}

/**
 * GET /api/fleet/vehicles/:id/checks - Obtener inspecciones de un vehículo
 */
export async function getVehicleChecks(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const checks = await fleetService.getVehicleChecks(id);

    const response: ApiPaginatedResponse = {
      ok: true,
      data: checks,
      total: checks.length,
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (error) {
    throw error;
  }
}
