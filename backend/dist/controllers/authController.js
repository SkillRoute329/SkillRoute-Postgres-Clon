"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = void 0;
const db_1 = __importDefault(require("../db"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const login = async (req, res) => {
    const { internalNumber, password } = req.body;
    try {
        // --- TEMPORARY DEBUG BACKDOOR ---
        const cleanInternal = String(internalNumber).trim();
        const query = `SELECT * FROM "User" WHERE internalnumber = $1`;
        const result = await db_1.default.query(query, [cleanInternal]);
        if (result.rowCount === 0) {
            return res.status(401).json({ message: 'Usuario no encontrado' });
        }
        const user = result.rows[0];
        const passwordMatch = await bcryptjs_1.default.compare(password, user.passwordHash);
        if (!passwordMatch) {
            return res.status(401).json({ message: 'Contraseña incorrecta' });
        }
        if (!user.tenantId) {
            console.error(`Login failed: User ${user.internalNumber} has no tenantId`);
            return res.status(500).json({ message: 'Error de configuración de cuenta (Sin Empresa)' });
        }
        const token = jsonwebtoken_1.default.sign({ id: user.id, internalNumber: user.internalNumber, role: user.role, tenantId: user.tenantId }, process.env.JWT_SECRET || 'secret_de_emergencia_para_produccion_2026', { expiresIn: '2h' });
        const userInfo = {
            id: user.id,
            internalNumber: user.internalNumber,
            fullName: user.fullName,
            role: user.role,
        };
        return res.json({ token, user: userInfo });
    }
    catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ message: 'Error interno del servidor' });
    }
};
exports.login = login;
