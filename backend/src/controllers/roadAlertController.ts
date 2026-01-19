
import { Request, Response } from 'express';
import prisma from '../prisma';

export const RoadAlertController = {
    // 1. Crear una alerta (Para Inspectores/Admin)
    async create(req: Request, res: Response) {
        try {
            const { title, description, type, affectedLine, severity, expiresAt } = req.body;
            // Assumes req.user is set by auth middleware
            const tenantId = (req as any).user?.tenantId || 1;
            const userId = (req as any).user?.userId;

            const alert = await prisma.roadAlert.create({
                data: {
                    tenantId,
                    title,
                    description,
                    type,
                    affectedLine: affectedLine || 'Todas',
                    severity: severity || 'MEDIUM',
                    createdBy: userId,
                    expiresAt: expiresAt ? new Date(expiresAt) : null,
                }
            });

            res.json(alert);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Error creating alert' });
        }
    },

    // 2. Obtener alertas activas (Para todos)
    async getActive(req: Request, res: Response) {
        try {
            const tenantId = (req as any).user?.tenantId || 1;

            const alerts = await prisma.roadAlert.findMany({
                where: {
                    tenantId,
                    isActive: true, // Only active
                    // Optional: Filter by expiry date if implemented
                    // OR: [ { expiresAt: { gt: new Date() } }, { expiresAt: null } ]
                    OR: [
                        { expiresAt: { gt: new Date() } },
                        { expiresAt: null }
                    ]
                },
                orderBy: { createdAt: 'desc' },
                take: 20
            });

            res.json(alerts);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Error fetching alerts' });
        }
    },

    // 3. Desactivar alerta (Resolver)
    async resolve(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const tenantId = (req as any).user?.tenantId || 1;

            await prisma.roadAlert.update({
                where: { id: Number(id) },
                data: { isActive: false }
            });

            res.json({ message: 'Alert resolved' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Error resolving alert' });
        }
    }
};
