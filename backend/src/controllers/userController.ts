import { Request, Response } from 'express';
import bcrypt from 'bcrypt';

export const getAllUsers = async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).user.tenantId;

        const users = await prisma.user.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                internalNumber: true,
                firstName: true,
                lastName: true,
                fullName: true,
                phoneNumber: true,
                whatsappLink: true,
                role: true,
                isActive: true,
                createdAt: true,
                lastLogin: true
            }
        });

        res.json(users);
    } catch (error) {
        console.error('User Get Error:', error);
        res.status(500).json({ message: 'Error al obtener usuarios' });
    }
};

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const createUser = async (req: Request, res: Response) => {
    const { internalNumber, firstName, lastName, phoneNumber, whatsappLink, password, role } = req.body;

    try {
        if (!internalNumber || !firstName || !lastName || !password) {
            return res.status(400).json({ message: 'Campos requeridos' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const tenantId = (req as any).user.tenantId;

        const newUser = await prisma.user.create({
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
    } catch (error: any) {
        console.error('User Create Error:', error);
        if (error.code === 'P2002') { // Unique constraint
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
