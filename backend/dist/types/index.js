"use strict";
/**
 * Definiciones de tipos TypeScript para TransformaFacil 2.0
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppError = void 0;
// ─── ERRORES PERSONALIZADOS ──────────────────────────────────────────────
class AppError extends Error {
    constructor(statusCode, message, details) {
        super(message);
        this.statusCode = statusCode;
        this.message = message;
        this.details = details;
        this.name = 'AppError';
    }
}
exports.AppError = AppError;
