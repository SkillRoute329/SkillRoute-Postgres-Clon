"use strict";
/**
 * Controladores para endpoints del sistema
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.systemDoctor = systemDoctor;
exports.healthCheck = healthCheck;
exports.getVersion = getVersion;
const database_1 = __importStar(require("../config/database"));
const constants_1 = require("../config/constants");
const logger_1 = __importDefault(require("../config/logger"));
/**
 * GET /api/doctor - Diagnóstico del sistema
 *
 * Política de datos (regla -2 NO SIMULACIÓN):
 *  - vehicleCount: PostgreSQL local (tabla `vehiculos`) — fuente soberana.
 *  - cartonCount:  Firestore (`cartones_completados`) — migración pendiente FASE 2;
 *                  si Firestore es inalcanzable se loggea WARN y se devuelve 0,
 *                  el doctor sigue HEALTHY mientras Postgres responda.
 *
 * No regresión (regla -1): el shape de la respuesta se mantiene idéntico
 * al previo a la migración FASE 0 (campos `vehicleCount` y `cartonCount`
 * dentro de `data.database`).
 */
async function systemDoctor(_req, res) {
    try {
        // Vehículos — Postgres soberano (migrado de Firestore en FASE 0)
        const vRow = await (0, database_1.default)('vehiculos')
            .count({ count: '*' })
            .first();
        const vehicleCount = parseInt(vRow?.count ?? '0', 10);
        // Cartones — Firestore (TODO FASE 2). Tolerante a fallos: si Firebase está
        // caído, devolvemos 0 + warn, no rompemos el doctor.
        let cartonCount = 0;
        try {
            const snap = await database_1.db.collection(constants_1.Config.Collections.CARTONES).get();
            cartonCount = snap.size;
        }
        catch (firebaseErr) {
            const msg = firebaseErr instanceof Error ? firebaseErr.message : String(firebaseErr);
            logger_1.default.warn('[doctor] Firestore inalcanzable para cartones, devolviendo 0', {
                error: msg,
                action: 'pendiente migración FASE 2 a Postgres',
            });
        }
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
        const msg = error instanceof Error ? error.message : String(error);
        const code = error?.code;
        logger_1.default.error('[doctor] SICK — Postgres inalcanzable', { error: msg, code });
        // Endpoint de diagnóstico: incluir detalle del error en el body para que
        // un operador pueda diagnosticar sin entrar a los logs del servidor.
        // No expone PII ni secrets; solo el mensaje del driver y código (ej. ECONNREFUSED, 28P01).
        const response = {
            ok: false,
            error: 'SICK',
            timestamp: new Date().toISOString(),
            details: { message: msg, code },
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
