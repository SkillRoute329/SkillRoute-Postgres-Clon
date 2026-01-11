"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUser = exports.updateUser = exports.createUser = exports.getAllUsers = void 0;
const db_1 = __importDefault(require("../db"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = __importDefault(require("../prisma"));
const getAllUsers = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const users = await prisma_1.default.user.findMany({
            // @ts-ignore
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                internalNumber: true,
                firstName: true,
                lastName: true,
                fullName: true,
                // @ts-ignore
                phoneNumber: true,
                whatsappLink: true,
                role: true,
                isActive: true,
                createdAt: true,
                lastLogin: true
            }
        });
        res.json(users);
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
        if (!internalNumber || !firstName || !lastName || !password) {
            return res.status(400).json({ message: 'Campos requeridos' });
        }
        const passwordHash = await bcryptjs_1.default.hash(password, 10);
        const tenantId = req.user.tenantId;
        const newUser = await prisma_1.default.user.create({
            // @ts-ignore
            data: {
                internalNumber: String(internalNumber).trim(),
                firstName,
                lastName,
                fullName: `${firstName} ${lastName}`,
                phoneNumber: phoneNumber || null,
                whatsappLink: whatsappLink || null,
                passwordHash,
                role: role || 'User',
                isActive: true,
                tenantId: tenantId
            }
        });
        res.status(201).json(newUser);
    }
    catch (error) {
        console.error('User Create Error:', error);
        if (error.code === 'P2002') { // Unique constraint
            return res.status(409).json({ message: 'El número de interno ya existe' });
        }
        res.status(500).json({ message: 'Error al crear usuario', details: error.message });
    }
};
exports.createUser = createUser;
const updateUser = async (req, res) => {
    const { id } = req.params;
    const { internalNumber, firstName, lastName, phoneNumber, whatsappLink, password, role, isActive } = req.body;
    try {
        const fullName = `${firstName} ${lastName}`;
        let query = `
            UPDATE "user" 
            SET internalnumber = $1, firstname = $2, lastname = $3, fullname = $4, 
                phonenumber = $5, whatsapplink = $6, role = $7, isactive = $8
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
            const passwordHash = await bcryptjs_1.default.hash(password, 10);
            query += `, passwordhash = $${paramCount}`;
            values.push(passwordHash);
            paramCount++;
        }
        const tenantId = req.user.tenantId;
        query += ` WHERE id = $${paramCount} AND tenantid = $${paramCount + 1} RETURNING id, internalnumber as "internalNumber", firstname as "firstName", lastname as "lastName", fullname as "fullName", phonenumber as "phoneNumber", whatsapplink as "whatsappLink", role, isactive as "isActive", createdat as "createdAt"`;
        values.push(Number(id), tenantId);
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
        const tenantId = req.user.tenantId;
        const query = 'DELETE FROM "user" WHERE id = $1 AND tenantid = $2 RETURNING id, fullname as "fullName"';
        const result = await db_1.default.query(query, [Number(id), tenantId]);
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
