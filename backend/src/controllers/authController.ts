import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

export const login = async (req: Request, res: Response) => {
    const { internalNumber, password, companySlug } = req.body;

    // Basic validation
    if (!internalNumber || !password) {
        return res.status(400).json({ message: 'Faltan credenciales' });
    }

    try {
        const cleanInternal = String(internalNumber).trim();
        let targetTenantId = 1; // Default to UCOT/First Company

        // check if companySlug is provided override target
        if (companySlug) {
            const tenant = await prisma.tenant.findUnique({
                where: { slug: companySlug }
            });
            if (!tenant) {
                return res.status(404).json({ message: 'Código de empresa inválido' });
            }
            targetTenantId = tenant.id;
        }

        console.log(`[AUTH DEBUG] Login attempt: User '${cleanInternal}' inside Tenant ID: ${targetTenantId}`);

        // Use Prisma to find the user in the SPECIFIC Tenant
        const user = await prisma.user.findUnique({
            where: {
                tenantId_internalNumber: {
                    tenantId: targetTenantId,
                    internalNumber: cleanInternal
                }
            },
            include: { tenant: true }
        });

        if (!user) {
            console.log(`[AUTH DEBUG] User not found (Tenant ${targetTenantId}): ${cleanInternal}`);
            return res.status(401).json({ message: 'Usuario no encontrado en esta empresa' });
        }

        // Check password
        const passwordMatch = await bcrypt.compare(password, user.passwordHash);

        if (!passwordMatch) {
            console.log(`[AUTH DEBUG] Password incorrect`);
            return res.status(401).json({ message: 'Contraseña incorrecta' });
        }

        if (!user.isActive || !user.tenant.isActive) {
            return res.status(403).json({ message: 'Cuenta o Empresa desactivada' });
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

        return res.json({ token, user: userInfo });

    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ message: 'Error interno del servidor' });
    }
};
