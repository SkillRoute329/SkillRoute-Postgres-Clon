"use strict";
/**
 * Controladores para endpoints del sistema
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.systemDoctor = systemDoctor;
exports.healthCheck = healthCheck;
exports.getVersion = getVersion;
const firebase_1 = require("../config/firebase");
const constants_1 = require("../config/constants");
/**
 * GET /api/doctor - Diagnóstico del sistema
 */
async function systemDoctor(_req, res) {
    try {
        const vehicleCount = (await firebase_1.db.collection(constants_1.Config.Collections.VEHICLES).get()).size;
        const cartonCount = (await firebase_1.db.collection(constants_1.Config.Collections.CARTONES).get()).size;
        const response = {
            ok: true,
            data: {
                status: 'HEALTHY',
                timestamp: new Date().toISOString(),
                version: '2.0.1-MODULAR',
                environment: constants_1.Config.NODE_ENV,
                database: {
                    connected: true,
                    vehicleCount,
                    cartonCount,
                },
            },
        };
        res.json(response);
    }
    catch (error) {
        const response = {
            ok: false,
            error: 'SICK',
            timestamp: new Date().toISOString(),
        };
        res.status(500).json(response);
    }
}
/**
 * GET /api/health - Health check simple
 */
function healthCheck(_req, res) {
    const response = {
        ok: true,
        data: {
            status: 'UP',
            timestamp: new Date().toISOString(),
            version: '2.0.1-MODULAR',
        },
    };
    res.json(response);
}
/**
 * GET /api/version - Obtener versión
 */
function getVersion(_req, res) {
    const response = {
        ok: true,
        data: {
            version: '2.0.1-MODULAR',
            environment: constants_1.Config.NODE_ENV,
            timestamp: new Date().toISOString(),
        },
    };
    res.json(response);
}
