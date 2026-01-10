import { Request, Response } from 'express';
import pool from '../db';
import bcrypt from 'bcrypt';

export const getAllUsers = async (req: Request, res: Response) => {
    try {
        // [MODIFIED] Extract tenantId from authenticated user
        const tenantId = (req as any).user.tenantId;

        // [MODIFIED] Added WHERE clause for tenant isolation
        // Old Query: SELECT ... FROM "User" ORDER BY ...
        const query = 'SELECT id, "internalNumber", "firstName", "lastName", "fullName", "phoneNumber", "whatsappLink", role, "isActive", "createdAt", "lastLogin" FROM "User" WHERE "tenantId" = $1 ORDER BY "createdAt" DESC';

        const result = await pool.query(query, [tenantId]);
        res.json(result.rows);
    } catch (error) {
        console.error('User Get Error:', error);
        res.status(500).json({ message: 'Error al obtener usuarios' });
    }
};

export const createUser = async (req: Request, res: Response) => {
    const { internalNumber, firstName, lastName, phoneNumber, whatsappLink, password, role } = req.body;

    try {
        // Validations
        if (!internalNumber || !firstName || !lastName || !password) {
            return res.status(400).json({ message: 'Campos requeridos: internalNumber, firstName, lastName, password' });
        }

        const fullName = `${firstName} ${lastName}`;
        const passwordHash = await bcrypt.hash(password, 10);

        const tenantId = (req as any).user.tenantId;

        const query = `
            INSERT INTO "User" 
            ("internalNumber", "firstName", "lastName", "fullName", "phoneNumber", "whatsappLink", "passwordHash", "role", "isActive", "tenantId")
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8::"Role", true, $9)
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
            role || 'User',
            tenantId
        ];

        const result = await pool.query(query, values);
        res.status(201).json(result.rows[0]);
    } catch (error: any) {
        console.error('User Create Error:', error);
        if (error.code === '23505') { // Unique violation
            return res.status(409).json({ message: 'El número de interno ya existe' });
        }
        res.status(500).json({ message: 'Error al crear usuario', details: error.message });
    }
};

export const updateUser = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { internalNumber, firstName, lastName, phoneNumber, whatsappLink, password, role, isActive } = req.body;

    try {
        const fullName = `${firstName} ${lastName}`;

        let query = `
            UPDATE "User" 
            SET "internalNumber" = $1, "firstName" = $2, "lastName" = $3, "fullName" = $4, 
                "phoneNumber" = $5, "whatsappLink" = $6, "role" = $7, "isActive" = $8
        `;

        const values: any[] = [
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
            const passwordHash = await bcrypt.hash(password, 10);
            query += `, "passwordHash" = $${paramCount}`;
            values.push(passwordHash);
            paramCount++;
        }

        const tenantId = (req as any).user.tenantId;

        query += ` WHERE id = $${paramCount} AND "tenantId" = $${paramCount + 1} RETURNING id, "internalNumber", "firstName", "lastName", "fullName", "phoneNumber", "whatsappLink", role, "isActive", "createdAt"`;
        values.push(Number(id), tenantId);

        const result = await pool.query(query, values);

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        res.json(result.rows[0]);
    } catch (error: any) {
        console.error('User Update Error:', error);
        if (error.code === '23505') {
            return res.status(409).json({ message: 'El número de interno ya existe' });
        }
        res.status(500).json({ message: 'Error al actualizar usuario' });
    }
};

export const deleteUser = async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        const tenantId = (req as any).user.tenantId;

        const query = 'DELETE FROM "User" WHERE id = $1 AND "tenantId" = $2 RETURNING id, "fullName"';
        const result = await pool.query(query, [Number(id), tenantId]);

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        res.json({ message: 'Usuario eliminado correctamente', user: result.rows[0] });
    } catch (error) {
        console.error('User Delete Error:', error);
        res.status(500).json({ message: 'Error al eliminar usuario. Verifique que no tenga turnos asociados.' });
    }
};
