"use strict";
/**
 * Middleware de validación de entrada
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateJson = exports.validateParams = exports.validateBody = void 0;
const index_1 = require("../types/index");
/**
 * Validar que el body tenga los campos requeridos
 */
const validateBody = (requiredFields) => {
    return (req, res, next) => {
        const missingFields = requiredFields.filter((field) => !(field in req.body));
        if (missingFields.length > 0) {
            const error = new index_1.AppError(400, 'Missing required fields', { missingFields });
            return res.status(error.statusCode).json({
                ok: false,
                error: error.message,
                details: error.details,
            });
        }
        next();
    };
};
exports.validateBody = validateBody;
/**
 * Validar que los parámetros sean válidos
 */
const validateParams = (rules) => {
    return (req, res, next) => {
        const errors = {};
        for (const [param, validate] of Object.entries(rules)) {
            const value = req.body[param];
            if (!validate(value)) {
                errors[param] = `Invalid value for ${param}`;
            }
        }
        if (Object.keys(errors).length > 0) {
            const error = new index_1.AppError(400, 'Validation failed', errors);
            return res.status(error.statusCode).json({
                ok: false,
                error: error.message,
                details: error.details,
            });
        }
        next();
    };
};
exports.validateParams = validateParams;
/**
 * Validar JSON structure
 */
const validateJson = (req, res, next) => {
    try {
        if (req.is('json') && !req.is('application/json')) {
            throw new Error('Invalid content type');
        }
        next();
    }
    catch (err) {
        const error = new index_1.AppError(400, 'Invalid JSON in request body');
        return res.status(error.statusCode).json({
            ok: false,
            error: error.message,
        });
    }
};
exports.validateJson = validateJson;
