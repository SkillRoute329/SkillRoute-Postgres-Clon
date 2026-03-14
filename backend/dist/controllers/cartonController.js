"use strict";
/**
 * Controladores para cartones (servicios)
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllCartones = getAllCartones;
exports.getCartonById = getCartonById;
exports.saveCarton = saveCarton;
exports.deleteCarton = deleteCarton;
const cartonService = __importStar(require("../services/cartonService"));
/**
 * GET /api/cartones - Obtener todos los cartones
 */
async function getAllCartones(req, res) {
    try {
        const cartones = await cartonService.getAllCartones();
        const response = {
            ok: true,
            data: cartones,
            total: cartones.length,
            timestamp: new Date().toISOString(),
        };
        res.json(response);
    }
    catch (error) {
        throw error;
    }
}
/**
 * GET /api/cartones/:id - Obtener un cartón específico
 */
async function getCartonById(req, res) {
    try {
        const { id } = req.params;
        const carton = await cartonService.getCartonById(id);
        const response = {
            ok: true,
            data: carton,
            timestamp: new Date().toISOString(),
        };
        res.json(response);
    }
    catch (error) {
        throw error;
    }
}
/**
 * POST /api/cartones - Crear o actualizar un cartón
 */
async function saveCarton(req, res) {
    try {
        const cartonId = await cartonService.saveCarton(req.body, req.user?.id || 'anonymous');
        const response = {
            ok: true,
            data: { id: cartonId },
            message: 'Cartón guardado correctamente',
            timestamp: new Date().toISOString(),
        };
        res.json(response);
    }
    catch (error) {
        throw error;
    }
}
/**
 * DELETE /api/cartones/:id - Eliminar un cartón
 */
async function deleteCarton(req, res) {
    try {
        const { id } = req.params;
        await cartonService.deleteCarton(id, req.user?.id || 'anonymous');
        const response = {
            ok: true,
            message: 'Cartón eliminado correctamente',
            timestamp: new Date().toISOString(),
        };
        res.json(response);
    }
    catch (error) {
        throw error;
    }
}
