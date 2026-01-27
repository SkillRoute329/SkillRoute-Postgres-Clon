
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getNotifications = async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    try {
        const notifications = await prisma.notification.findMany({
            where: { userId: Number(userId) },
            orderBy: { createdAt: 'desc' },
            take: 50
        });
        res.json(notifications);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ message: 'Error al obtener notificaciones' });
    }
};

export const markAsRead = async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { id } = req.params;
    try {
        await prisma.notification.updateMany({
            where: {
                id: Number(id),
                userId: Number(userId)
            },
            data: { read: true }
        });
        res.json({ message: 'Marked as read' });
    } catch (error) {
        console.error('Error marking notification:', error);
        res.status(500).json({ message: 'Error al actualizar notificación' });
    }
};

// Helper internal function
export const createNotification = async (userId: number, message: string, tenantId?: number) => {
    try {
        // If no tenantId provided, try to find user's tenant (optional safety)
        let tId = tenantId;
        if (!tId) {
            const user = await prisma.user.findUnique({ where: { id: userId }, select: { tenantId: true } });
            tId = user?.tenantId;
        }

        // If still no tenantId, default to 1 (Migration safety) or skip
        if (!tId) tId = 1;

        await prisma.notification.create({
            data: {
                userId,
                message,
                read: false,
                tenantId: tId
            }
        });
    } catch (error) {
        console.error('Error creating internal notification:', error);
    }
};
