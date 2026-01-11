"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const authenticate = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ message: 'Acceso denegado' });
    }
    try {
        const payload = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'secret_de_emergencia_para_produccion_2026');
        if (!payload.tenantId) {
            return res.status(401).json({ message: 'Token obsoleto (Sin Tenant). Por favor reloguee.' });
        }
        req.user = {
            ...payload,
            tenantId: payload.tenantId
        };
        // console.log('[AUTH] User authenticated:', (req as any).user.internalNumber);
        next();
    }
    catch (error) {
        res.status(401).json({ message: 'Token inválido' });
    }
};
exports.authenticate = authenticate;
