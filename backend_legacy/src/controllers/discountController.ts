import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const discountController = {
    getAll: async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            const discounts = await prisma.discountCategory.findMany({
                where: { tenantId: user.tenantId, isActive: true }
            });
            res.json(discounts);
        } catch (error) {
            res.status(500).json({ message: 'Error fetching discounts' });
        }
    },

    create: async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            const { name, type, value } = req.body;

            const discount = await prisma.discountCategory.create({
                data: {
                    tenantId: user.tenantId,
                    name,
                    type, // PERCENTAGE or FIXED
                    value: Number(value)
                }
            });
            res.status(201).json(discount);
        } catch (error) {
            res.status(500).json({ message: 'Error creating discount' });
        }
    },

    update: async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const { name, type, value, isActive } = req.body;

            const discount = await prisma.discountCategory.update({
                where: { id: Number(id) },
                data: {
                    name,
                    type,
                    value: value !== undefined ? Number(value) : undefined,
                    isActive
                }
            });
            res.json(discount);
        } catch (error) {
            res.status(500).json({ message: 'Error updating discount' });
        }
    },

    delete: async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            await prisma.discountCategory.update({
                where: { id: Number(id) },
                data: { isActive: false }
            });
            res.json({ message: 'Discount deleted' });
        } catch (error) {
            res.status(500).json({ message: 'Error deleting discount' });
        }
    }
};
