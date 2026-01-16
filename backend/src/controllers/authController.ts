import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

export const login = async (req: Request, res: Response) => {
    const { internalNumber, password } = req.body;

    // Basic validation
    if (!internalNumber || !password) {
        return res.status(400).json({ message: 'Faltan credenciales' });
    }

    try {
        const cleanInternal = String(internalNumber).trim();
        console.log(`[AUTH DEBUG] Trying to log in with internal: '${cleanInternal}'`);

        // Use Prisma to find the user AND their tenant
        const user = await prisma.user.findFirst({
            where: { internalNumber: cleanInternal },
            include: { tenant: true } // Fetch tenant details
        });

        if (!user) {
            console.log(`[AUTH DEBUG] User not found for internal: ${cleanInternal}`);
            return res.status(401).json({ message: 'Usuario no encontrado' });
        }

        // Check password
        const passwordMatch = await bcrypt.compare(password, user.passwordHash);

        if (!passwordMatch) {
            console.log(`[AUTH DEBUG] Password incorrect for user: ${cleanInternal}`);
            return res.status(401).json({ message: 'Contraseña incorrecta' });
        }

        if (!user.tenantId) {
            console.error(`Login failed: User ${user.internalNumber} has no tenantId`);
            return res.status(500).json({ message: 'Error de configuración de cuenta (Sin Empresa)' });
        }

        const token = jwt.sign(
            { id: user.id, internalNumber: user.internalNumber, role: user.role, tenantId: user.tenantId },
            process.env.JWT_SECRET || 'secret_de_emergencia_para_produccion_2026',
            { expiresIn: '8h' }
        );

        const userInfo = {
            id: user.id,
            internalNumber: user.internalNumber,
            fullName: user.fullName,
            role: user.role,
            tenant: {
                id: user.tenant.id,
                name: user.tenant.name,
                slug: user.tenant.slug
            }
        };

        console.log(`[AUTH DEBUG] Login successful for: ${cleanInternal}`);
        return res.json({ token, user: userInfo });

    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ message: 'Error interno del servidor', error: String(error) });
    }
};
