"use strict";
/**
 * Controladores para autenticación
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = login;
exports.getCurrentUser = getCurrentUser;
const authService_1 = require("../services/authService");
/**
 * POST /api/auth/login
 */
async function login(req, res, next) {
    try {
        const { internalNumber, password } = req.body;
        const loginResponse = await (0, authService_1.authenticateUser)({
            internalNumber,
            password,
        });
        const response = {
            ok: true,
            data: loginResponse,
            timestamp: new Date().toISOString(),
        };
        res.json(response);
    }
    catch (error) {
        // Pasar el error al middleware de error global para no tumbar node
        next(error);
    }
}
/**
 * GET /api/auth/me (obtener usuario actual)
 */
function getCurrentUser(req, res) {
    const response = {
        ok: true,
        data: req.user,
        timestamp: new Date().toISOString(),
    };
    res.json(response);
}
