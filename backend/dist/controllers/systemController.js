"use strict";
/**
 * Controladores para endpoints del sistema
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.systemDoctor = systemDoctor;
exports.healthCheck = healthCheck;
exports.getVersion = getVersion;
const database_1 = __importDefault(require("../config/database"));
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
        // Cartones — Migrado a PostgreSQL Soberano (FASE 2)
        let cartonCount = 0;
        try {
            const cRow = await (0, database_1.default)('cartones_completados')
                .count({ count: '*' })
                .first();
            cartonCount = parseInt(cRow?.count ?? '0', 10);
        }
        catch (dbErr) {
            const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
            logger_1.default.warn('[doctor] Postgres error contando cartones, devolviendo 0', {
                error: msg,
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
