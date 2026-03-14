/**
 * Lógica de negocio para cartones (servicios completados)
 */

import * as admin from 'firebase-admin';
import { db } from '../config/firebase';
import { Carton, AppError } from '../types/index';
import { Config } from '../config/constants';
import logger from '../config/logger';

/**
 * Obtener todos los cartones
 */
export async function getAllCartones(): Promise<Carton[]> {
  try {
    const snap = await db.collection(Config.Collections.CARTONES).get();
    const cartones = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    } as Carton));

    logger.debug(`[CARTONES] Retrieved ${cartones.length} cartones`);
    return cartones;
  } catch (error) {
    logger.error('[CARTONES] Error getting all cartones', { error: String(error) });
    throw new AppError(500, 'Error al obtener cartones');
  }
}

/**
 * Obtener un cartón específico
 */
export async function getCartonById(id: string): Promise<Carton> {
  try {
    const doc = await db.collection(Config.Collections.CARTONES).doc(id).get();

    if (!doc.exists) {
      throw new AppError(404, 'Cartón no encontrado');
    }

    return {
      id: doc.id,
      ...doc.data(),
    } as Carton;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logger.error(`[CARTONES] Error getting carton ${id}`, { error: String(error) });
    throw new AppError(500, 'Error al obtener cartón');
  }
}

/**
 * Crear o actualizar un cartón
 */
export async function saveCarton(carton: Carton, userId: string): Promise<string> {
  try {
    if (!carton.serviceNumber) {
      throw new AppError(400, 'serviceNumber es requerido');
    }

    const docId = `${carton.serviceNumber}_${carton.line || '300'}`;

    const cartonData = {
      ...carton,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: userId,
    };

    await db
      .collection(Config.Collections.CARTONES)
      .doc(docId)
      .set(cartonData, { merge: true });

    logger.info(`[CARTONES] Saved carton: ${docId} by user ${userId}`);

    return docId;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logger.error('[CARTONES] Error saving carton', { error: String(error) });
    throw new AppError(500, 'Error al guardar cartón');
  }
}

/**
 * Eliminar un cartón
 */
export async function deleteCarton(id: string, userId: string): Promise<void> {
  try {
    const doc = await db.collection(Config.Collections.CARTONES).doc(id).get();

    if (!doc.exists) {
      throw new AppError(404, 'Cartón no encontrado');
    }

    await db.collection(Config.Collections.CARTONES).doc(id).delete();

    logger.info(`[CARTONES] Deleted carton: ${id} by user ${userId}`);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logger.error(`[CARTONES] Error deleting carton ${id}`, { error: String(error) });
    throw new AppError(500, 'Error al eliminar cartón');
  }
}
