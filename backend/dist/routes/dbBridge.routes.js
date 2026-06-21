"use strict";
/**
 * dbBridge.routes.ts — Endpoint REST genérico para el shim Firestore (FASE 4)
 * Mount point: /api/db/*
 * Todas auth-gated con JWT.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const dbBridgeController_1 = require("../controllers/dbBridgeController");
const router = (0, express_1.Router)();
// GET /api/db                          → lista de colecciones permitidas
router.get('/', auth_1.verifyAuth, dbBridgeController_1.listAvailableCollections);
// GET /api/db/:collection              → lista con filtros / orden / paginación
router.get('/:collection', auth_1.verifyAuth, dbBridgeController_1.listCollection);
// GET /api/db/:collection/:id          → un documento
router.get('/:collection/:id', auth_1.verifyAuth, dbBridgeController_1.getDoc);
// POST /api/db/:collection             → crear documento
router.post('/:collection', auth_1.verifyAuth, dbBridgeController_1.createDoc);
// PUT /api/db/:collection/:id          → actualizar / upsert
router.put('/:collection/:id', auth_1.verifyAuth, dbBridgeController_1.updateDoc);
// DELETE /api/db/:collection/:id       → borrar
router.delete('/:collection/:id', auth_1.verifyAuth, dbBridgeController_1.deleteDoc);
exports.default = router;
