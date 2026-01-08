"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUser = exports.updateUser = exports.createUser = exports.getAllUsers = void 0;
const db_1 = __importDefault(require("../db"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const getAllUsers = async (req, res) => {
    try {
        const query = 'SELECT id, "internalNumber", "firstName", "lastName", "fullName", "phoneNumber", "whatsappLink", role, "isActive", "createdAt", "lastLogin" FROM "User" ORDER BY "createdAt" DESC';
        const result = await db_1.default.query(query);
        res.json(result.rows);
    }
    catch (error) {
        console.error('User Get Error:', error);
        res.status(500).json({ message: 'Error al obtener usuarios' });
    }
};
exports.getAllUsers = getAllUsers;
const createUser = async (req, res) => {
    const { internalNumber, firstName, lastName, phoneNumber, whatsappLink, password, role } = req.body;
    try {
        // Validations
        if (!internalNumber || !firstName || !lastName || !password) {
            return res.status(400).json({ message: 'Campos requeridos: internalNumber, firstName, lastName, password' });
        }
        const fullName = `${firstName} ${lastName}`;
        const passwordHash = await bcrypt_1.default.hash(password, 10);
        const query = `
            INSERT INTO "User" 
            ("internalNumber", "firstName", "lastName", "fullName", "phoneNumber", "whatsappLink", "passwordHash", "role", "isActive")
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
            RETURNING id, "internalNumber", "firstName", "lastName", "fullName", "phoneNumber", "whatsappLink", role, "isActive", "createdAt"
        `;
        const values = [
            String(internalNumber).trim(),
            firstName,
            lastName,
            fullName,
            phoneNumber || null,
            whatsappLink || null,
            passwordHash,
            role || 'User'
        ];
        const result = await db_1.default.query(query, values);
        res.status(201).json(result.rows[0]);
    }
    catch (error) {
        console.error('User Create Error:', error);
        if (error.code === '23505') { // Unique violation
            return res.status(409).json({ message: 'El número de interno ya existe' });
        }
        res.status(500).json({ message: 'Error al crear usuario' });
    }
};
exports.createUser = createUser;
const updateUser = async (req, res) => {
    const { id } = req.params;
    const { internalNumber, firstName, lastName, phoneNumber, whatsappLink, password, role, isActive } = req.body;
    try {
        const fullName = `${firstName} ${lastName}`;
        let query = `
            UPDATE "User" 
            SET "internalNumber" = $1, "firstName" = $2, "lastName" = $3, "fullName" = $4, 
                "phoneNumber" = $5, "whatsappLink" = $6, "role" = $7, "isActive" = $8
        `;
        const values = [
            internalNumber,
            firstName,
            lastName,
            fullName,
            phoneNumber || null,
            whatsappLink || null,
            role || 'User',
            isActive !== undefined ? isActive : true
        ];
        let paramCount = 9;
        // Only update password if provided
        if (password) {
            const passwordHash = await bcrypt_1.default.hash(password, 10);
            query += `, "passwordHash" = $${paramCount}`;
            values.push(passwordHash);
            paramCount++;
        }
        query += ` WHERE id = $${paramCount} RETURNING id, "internalNumber", "firstName", "lastName", "fullName", "phoneNumber", "whatsappLink", role, "isActive", "createdAt"`;
        values.push(Number(id));
        const result = await db_1.default.query(query, values);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }
        res.json(result.rows[0]);
    }
    catch (error) {
        console.error('User Update Error:', error);
        if (error.code === '23505') {
            return res.status(409).json({ message: 'El número de interno ya existe' });
        }
        res.status(500).json({ message: 'Error al actualizar usuario' });
    }
};
exports.updateUser = updateUser;
const deleteUser = async (req, res) => {
    const { id } = req.params;
    try {
        const query = 'DELETE FROM "User" WHERE id = $1 RETURNING id, "fullName"';
        const result = await db_1.default.query(query, [Number(id)]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }
        res.json({ message: 'Usuario eliminado correctamente', user: result.rows[0] });
    }
    catch (error) {
        console.error('User Delete Error:', error);
        res.status(500).json({ message: 'Error al eliminar usuario. Verifique que no tenga turnos asociados.' });
    }
};
exports.deleteUser = deleteUser;
//# sourceMappingURL=userController.js.map