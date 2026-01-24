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

    // =========================================================================
    // 🛡️ GOD MODE / VIP BYPASS: Acceso Inmutable para Super Admin
    // ESTE BLOQUE GARANTIZA QUE EL USUARIO 0000 NUNCA PIERDA ACCESO,
    // INDEPENDIENTEMENTE DEL ESTADO DE LA DB.
    // =========================================================================
    if ((String(internalNumber).trim() === '0000' || String(internalNumber).trim() === 'admin@transformafacil.com') && password === 'admin123') {
        console.log("⚡ GOD MODE ACTIVATED: Validating '0000' without Database.");

        const godToken = jwt.sign(
            { id: 0, internalNumber: '0000', role: 'ADMIN', tenantId: 1 },
            process.env.JWT_SECRET || 'secret_de_emergencia_para_produccion_2026',
            { expiresIn: '24h' }
        );

        return res.json({
            token: godToken,
            user: {
                id: 0,
                internalNumber: '0000',
                fullName: 'System Root (GOD MODE)',
                role: 'ADMIN',
                tenant: {
                    id: 1,
                    name: 'Transporte Corporativo (Virtual)',
                    slug: 'transporte-corp'
                },
                permissions: ['ALL_ACCESS', 'UPLOAD_FILES', 'MANAGE_HR', 'VIEW_ANALYTICS', 'MANAGE_FLEET'],
                metadata: { type: 'GOD_MODE' }
            }
        });
    }
    // =========================================================================

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

        // Check if user exists (Internal Number OR CI)
        const user = await prisma.user.findFirst({
            where: {
                OR: [
                    { internalNumber: cleanInternal, tenantId: targetTenantId },
                    { ci: cleanInternal, tenantId: targetTenantId }
                ]
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
            ci: user.ci,
            photoUrl: user.photoUrl,
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

export const register = async (req: Request, res: Response) => {
    const { firstName, lastName, ci, internalNumber, password, role, position, photoUrl } = req.body;

    // VALIDATION
    if (!ci || !password || !firstName) {
        return res.status(400).json({ message: 'Faltan datos obligatorios (CI, Password, Nombre)' });
    }

    try {
        const passwordHash = await bcrypt.hash(password, 10);

        // TRANSACTION: User + Employee
        const result = await prisma.$transaction(async (tx) => {
            // 1. Create User
            const user = await tx.user.create({
                data: {
                    internalNumber: String(internalNumber || ci), // Fallback to CI if no internal number
                    ci: String(ci),
                    passwordHash,
                    role: role || 'User',
                    firstName,
                    lastName: lastName || '',
                    fullName: `${firstName} ${lastName || ''}`.trim(),
                    photoUrl: photoUrl,
                    tenantId: 1 // Default
                }
            });

            // 2. Create Employee Profile
            await tx.employee.create({
                data: {
                    firstName,
                    lastName: lastName || '',
                    ci: String(ci),
                    position: position || 'Sin Cargo',
                    photoUrl: photoUrl,
                    userId: user.id
                }
            });

            return user;
        });

        res.status(201).json({ message: 'Usuario y Empleado creados', user: result });

    } catch (error) {
        console.error('Register Error:', error);
        res.status(500).json({ message: 'Error al registrar', error: String(error) });
    }
};

export const getMe = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) return res.status(401).json({ message: 'No autenticado' });

        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { tenant: true, department: true, jobRole: true }
        });

        if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

        // clean password
        const { passwordHash, ...safeUser } = user;
        res.json(safeUser);
    } catch (error) {
        console.error('GetMe error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};
