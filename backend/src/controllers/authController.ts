import { Request, Response } from 'express';
import pool from '../db';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

export const login = async (req: Request, res: Response) => {
    const { internalNumber, password } = req.body;

    try {
        // --- TEMPORARY DEBUG BACKDOOR ---
        const cleanInternal = String(internalNumber).trim();


        const query = `SELECT * FROM "User" WHERE "internalNumber" = $1`;
        const result = await pool.query(query, [cleanInternal]);

        if (result.rowCount === 0) {

            return res.status(401).json({ message: 'Usuario no encontrado' });
        }

        const user = result.rows[0];

        const passwordMatch = await bcrypt.compare(password, user.passwordHash);

        if (!passwordMatch) {
            return res.status(401).json({ message: 'Contraseña incorrecta' });
        }
        if (!user.tenantId) {
            console.error(`Login failed: User ${user.internalNumber} has no tenantId`);
            return res.status(500).json({ message: 'Error de configuración de cuenta (Sin Empresa)' });
        }

        const token = jwt.sign(
            { id: user.id, internalNumber: user.internalNumber, role: user.role, tenantId: user.tenantId },
            process.env.JWT_SECRET || 'secret_de_emergencia_para_produccion_2026',
            { expiresIn: '2h' }
        );
        const userInfo = {
            id: user.id,
            internalNumber: user.internalNumber,
            fullName: user.fullName,
            role: user.role,
        };
        return res.json({ token, user: userInfo });
    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ message: 'Error interno del servidor' });
    }
};
