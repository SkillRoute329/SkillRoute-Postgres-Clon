"use strict";
/**
 * Controladores para gestión de flota
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
exports.getAllVehicles = getAllVehicles;
exports.getVehicleById = getVehicleById;
exports.createFleetCheck = createFleetCheck;
exports.getVehicleChecks = getVehicleChecks;
const fleetService = __importStar(require("../services/fleetService"));
/**
 * GET /api/fleet/vehicles - Obtener todos los vehículos
 */
async function getAllVehicles(req, res) {
    try {
        const vehicles = await fleetService.getAllVehicles();
        const response = {
            ok: true,
            data: vehicles,
            total: vehicles.length,
            timestamp: new Date().toISOString(),
        };
        res.json(response);
    }
    catch (error) {
        throw error;
    }
}
/**
 * GET /api/fleet/vehicles/:id - Obtener un vehículo específico
 */
async function getVehicleById(req, res) {
    try {
        const { id } = req.params;
        const vehicle = await fleetService.getVehicleById(id);
        const response = {
            ok: true,
            data: vehicle,
            timestamp: new Date().toISOString(),
        };
        res.json(response);
    }
    catch (error) {
        throw error;
    }
}
/**
 * POST /api/fleet/check - Crear una inspección de vehículo
 */
async function createFleetCheck(req, res) {
    try {
        const checkId = await fleetService.createFleetCheck(req.body, req.user?.id || 'anonymous');
        const response = {
            ok: true,
            data: { checkId },
            message: 'Inspección registrada correctamente',
            timestamp: new Date().toISOString(),
        };
        res.json(response);
    }
    catch (error) {
        throw error;
    }
}
/**
 * GET /api/fleet/vehicles/:id/checks - Obtener inspecciones de un vehículo
 */
async function getVehicleChecks(req, res) {
    try {
        const { id } = req.params;
        const checks = await fleetService.getVehicleChecks(id);
        const response = {
            ok: true,
            data: checks,
            total: checks.length,
            timestamp: new Date().toISOString(),
        };
        res.json(response);
    }
    catch (error) {
        throw error;
    }
}
