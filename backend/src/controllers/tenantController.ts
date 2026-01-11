
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getAllTenants = async (req: Request, res: Response) => {
    try {
        const tenants = await prisma.tenant.findMany({
            where: { isActive: true },
            orderBy: { name: 'asc' }
        });
        res.json(tenants);
    } catch (error) {
        console.error('Error fetching tenants:', error);
        res.status(500).json({ error: 'Error al obtener empresas' });
    }
};

export const createTenant = async (req: Request, res: Response) => {
    const { name, slug } = req.body;
    try {
        const existing = await prisma.tenant.findUnique({ where: { slug } });
        if (existing) {
            return res.status(400).json({ error: 'El slug ya existe' });
        }

        const tenant = await prisma.tenant.create({
            data: { name, slug }
        });
        res.status(201).json(tenant);
    } catch (error) {
        console.error('Error creating tenant:', error);
        res.status(500).json({ error: 'Error al crear empresa' });
    }
};

export const updateTenant = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, isActive } = req.body;
    try {
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
