/**
 * Lógica de negocio para gestión de flota
 */

import * as admin from 'firebase-admin';
import { db } from '../config/firebase';
import { Vehicle, FleetCheck, AppError } from '../types/index';
import { Config } from '../config/constants';
import logger from '../config/logger';

/**
 * Obtener todos los vehículos
 */
export async function getAllVehicles(): Promise<Vehicle[]> {
  try {
    const snap = await db.collection(Config.Collections.VEHICLES).get();
    const vehicles = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    } as Vehicle));

    logger.debug(`[FLEET] Retrieved ${vehicles.length} vehicles`);
    return vehicles;
  } catch (error) {
    logger.error('[FLEET] Error getting vehicles', { error: String(error) });
    throw new AppError(500, 'Error en flota');
  }
}

/**
 * Obtener un vehículo específico
 */
export async function getVehicleById(id: string): Promise<Vehicle> {
  try {
    const doc = await db.collection(Config.Collections.VEHICLES).doc(id).get();

    if (!doc.exists) {
      throw new AppError(404, 'Vehículo no encontrado');
    }

    return {
      id: doc.id,
      ...doc.data(),
    } as Vehicle;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logger.error(`[FLEET] Error getting vehicle ${id}`, { error: String(error) });
    throw new AppError(500, 'Error al obtener vehículo');
  }
}

/**
 * Crear inspección de vehículo (fleet check)
 */
export async function createFleetCheck(check: FleetCheck, userId: string): Promise<string> {
  try {
    if (!check.vehicleId) {
      throw new AppError(400, 'vehicleId es requerido');
    }

    const checkRef = db.collection(Config.Collections.FLEET_CHECKS).doc();

    // Asegurar que el driverId venga del usuario autenticado (Zero-Trust)
    const checkData: FleetCheck = {
      ...check,
      driverId: userId,
      timestamp: new Date(),
    };

    await checkRef.set(checkData);

    // Actualizar estado del vehículo
    await db
      .collection(Config.Collections.VEHICLES)
      .doc(String(check.vehicleId))
      .set(
        {
          lastCheckStatus: check.status || 'OK',
          lastCheckDate: admin.firestore.FieldValue.serverTimestamp(),
          currentDriver: check.driverLegajo,
        },
        { merge: true },
      );

    logger.info(`[FLEET] Fleet check created: ${checkRef.id} for vehicle ${check.vehicleId}`);

    return checkRef.id;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logger.error('[FLEET] Error creating fleet check', { error: String(error) });
    throw new AppError(500, 'Error procesando inspección');
  }
}

/**
 * Obtener inspecciones de un vehículo
 */
export async function getVehicleChecks(vehicleId: string): Promise<FleetCheck[]> {
  try {
    const snap = await db
      .collection(Config.Collections.FLEET_CHECKS)
      .where('vehicleId', '==', vehicleId)
      .orderBy('timestamp', 'desc')
      .get();

    const checks = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    } as FleetCheck));

    logger.debug(`[FLEET] Retrieved ${checks.length} checks for vehicle ${vehicleId}`);
    return checks;
  } catch (error) {
    logger.error(`[FLEET] Error getting vehicle checks`, { error: String(error) });
    throw new AppError(500, 'Error al obtener inspecciones');
  }
}
