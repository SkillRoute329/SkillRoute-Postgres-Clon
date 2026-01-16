
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export const getAllTenants = async (req: Request, res: Response) => {
    try {
        // Only SuperAdmin should see all (or maybe strict filtering later)
        const tenants = await prisma.tenant.findMany({
            where: { isActive: true },
            orderBy: { name: 'asc' },
            include: {
                _count: {
                    select: { users: true }
                }
            }
        });
        res.json(tenants);
    } catch (error) {
        console.error('Error fetching tenants:', error);
        res.status(500).json({ error: 'Error al obtener empresas' });
    }
};

export const createTenant = async (req: Request, res: Response) => {
    const {
        name,
        slug,
        adminInternalNumber,
        adminFirstName,
        adminLastName,
        adminPassword
    } = req.body;

    // Validation
    if (!name || !slug || !adminInternalNumber || !adminPassword) {
        return res.status(400).json({ message: 'Faltan datos obligatorios (Nombre, Slug, Admin, Contraseña)' });
    }

    try {
        // Enforce SuperAdmin only (Double check)
        const user = (req as any).user;
        if (user.role !== 'SuperAdmin') {
            return res.status(403).json({ message: 'Acceso denegado. Solo SuperAdmin.' });
        }

        const existing = await prisma.tenant.findUnique({ where: { slug } });
        if (existing) {
            return res.status(409).json({ message: 'El ID/Código de empresa (slug) ya existe.' });
        }

        const passwordHash = await bcrypt.hash(adminPassword, 10);

        // Transaction: Create Tenant + First Admin
        const result = await prisma.$transaction(async (tx) => {
            // 1. Create Tenant
            const newTenant = await tx.tenant.create({
                data: {
                    name,
                    slug,
                    isActive: true
                }
            });

            // 2. Create Admin User
            const newAdmin = await tx.user.create({
                data: {
                    tenantId: newTenant.id,
                    internalNumber: String(adminInternalNumber),
                    firstName: adminFirstName || 'Admin',
                    lastName: adminLastName || 'Empresa',
                    fullName: `${adminFirstName || 'Admin'} ${adminLastName || 'Empresa'}`,
                    passwordHash,
                    role: 'Admin',
                    isActive: true
                }
            });

            // 3. Create Default ShiftCategories (Optional but helpful)
            await tx.shiftCategory.createMany({
                data: [
                    { tenantId: newTenant.id, name: 'Normal', baseValue: 0, extraHourValue: 0 },
                    { tenantId: newTenant.id, name: 'Feriado', baseValue: 0, extraHourValue: 0 }
                ]
            });

            return { tenant: newTenant, admin: newAdmin };
        });

        res.status(201).json({
            message: 'Empresa creada exitosamente',
            tenant: result.tenant,
            admin: {
                id: result.admin.id,
                internalNumber: result.admin.internalNumber,
                fullName: result.admin.fullName
            },
            inviteLink: `https://transformafacil-20-production.up.railway.app/register?code=${slug}`
        });

    } catch (error) {
        console.error('Error creating tenant:', error);
        res.status(500).json({ message: 'Error al crear empresa', details: String(error) });
    }
};

export const updateTenant = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, isActive } = req.body;
    try {
        // SuperAdmin check
        const user = (req as any).user;
        if (user.role !== 'SuperAdmin') return res.status(403).json({ message: 'Denegado' });

        const tenant = await prisma.tenant.update({
            where: { id: Number(id) },
            data: { name, isActive }
        });
        res.json(tenant);
    } catch (error) {
        console.error('Error updating tenant:', error);
        res.status(500).json({ error: 'Error al actualizar empresa' });
    }
};

export const deleteTenant = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const user = (req as any).user;
        if (user.role !== 'SuperAdmin') return res.status(403).json({ message: 'Denegado' });

        // Soft delete
        await prisma.tenant.update({
            where: { id: Number(id) },
            data: { isActive: false }
        });
        res.json({ message: 'Empresa desactivada correctamente' });
    } catch (error) {
        console.error('Error deleting tenant:', error);
        res.status(500).json({ error: 'Error al eliminar empresa' });
    }
};
