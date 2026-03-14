"use strict";
/**
 * Middleware centralizado de manejo de errores
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFoundHandler = exports.errorHandler = void 0;
const index_1 = require("../types/index");
const logger_1 = __importDefault(require("../config/logger"));
/**
 * Error handler middleware (debe ser el último middleware)
 */
const errorHandler = (err, _req, res, _next) => {
    // Log el error
    logger_1.default.error('Request error', {
        name: err.name,
        message: err.message,
        stack: err.stack,
    });
    // Si es un AppError, usar su statusCode
    if (err instanceof index_1.AppError) {
        const response = {
            ok: false,
            error: err.message,
            details: err.details,
            timestamp: new Date().toISOString(),
        };
        return res.status(err.statusCode).json(response);
    }
    // Error genérico (500)
    const response = {
        ok: false,
        error: 'Internal server error',
        timestamp: new Date().toISOString(),
    };
    // En desarrollo, mostrar detalles
    if (process.env.NODE_ENV === 'development') {
        response.details = err.message;
    }
    res.status(500).json(response);
};
exports.errorHandler = errorHandler;
/**
 * 404 Handler (no encontrado)
 */
const notFoundHandler = (_req, res) => {
    const response = {
        ok: false,
        error: 'Endpoint not found',
        timestamp: new Date().toISOString(),
    };
    res.status(404).json(response);
};
exports.notFoundHandler = notFoundHandler;
