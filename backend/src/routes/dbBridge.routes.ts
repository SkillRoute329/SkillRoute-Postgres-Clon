/**
 * dbBridge.routes.ts — Endpoint REST genérico para el shim Firestore (FASE 4)
 * Mount point: /api/db/*
 * Todas auth-gated con JWT.
 */

import { Router } from 'express';
import { verifyAuth } from '../middleware/auth';
import {
  listAvailableCollections,
  listCollection,
  getDoc,
  createDoc,
  updateDoc,
  deleteDoc,
} from '../controllers/dbBridgeController';

const router = Router();

// GET /api/db                          → lista de colecciones permitidas
router.get('/', verifyAuth, listAvailableCollections);

// GET /api/db/:collection              → lista con filtros / orden / paginación
router.get('/:collection', verifyAuth, listCollection);

// GET /api/db/:collection/:id          → un documento
router.get('/:collection/:id', verifyAuth, getDoc);

// POST /api/db/:collection             → crear documento
router.post('/:collection', verifyAuth, createDoc);

// PUT /api/db/:collection/:id          → actualizar / upsert
router.put('/:collection/:id', verifyAuth, updateDoc);

// DELETE /api/db/:collection/:id       → borrar
router.delete('/:collection/:id', verifyAuth, deleteDoc);

export default router;
