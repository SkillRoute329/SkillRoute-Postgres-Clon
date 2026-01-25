
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { StorageService } from '../services/storageService';

const prisma = new PrismaClient();

export const updateIncident = async (req: Request, res: Response) => {
    try {
        // Extract ID (params) and Data (body)
        const { id } = req.params;
        const { status, note, priority } = req.body;
        const actorId = (req as any).user.id;

        // "Atomic" Transaction
        const result = await prisma.$transaction(async (tx) => {
            // 1. Get Current Incident
            const current = await tx.incident.findUnique({ where: { id: Number(id) } });
            if (!current) throw new Error('Incident not found');

            let photoPath = current.photoUrl;

            // 2. Handle File Upload (Multer puts file in req.file)
            if (req.file) {
                // Delete old if exists
                if (current.photoUrl) {
                    StorageService.deleteFile(current.photoUrl);
                }

                // Save new
                photoPath = StorageService.saveFile(
                    req.file.buffer,
                    req.file.originalname,
                    'incidents'
                );
            }

            // 3. Update Incident
            const updated = await tx.incident.update({
                where: { id: Number(id) },
                data: {
                    status: status || current.status,
                    priority: priority || current.priority,
                    photoUrl: photoPath
                }
            });

            // 4. Create Log
            let actionDescription = 'UPDATE';
            if (req.file) actionDescription = 'UPDATE_WITH_PHOTO';
            if (status && status !== current.status) actionDescription = `STATUS_CHANGE_TO_${status}`;

            await tx.incidentLog.create({
                data: {
                    incidentId: updated.id,
                    actorId: actorId,
                    action: actionDescription,
                    note: note || (req.file ? 'Photo updated' : 'Details updated')
                }
            });

            return updated;
        });

        res.json(result);

    } catch (error: any) {
        console.error('Incident Update Error:', error);
        res.status(500).json({ message: error.message });
    }
};

export const createIncident = async (req: Request, res: Response) => {
    try {
        const { title, description, priority } = req.body;
        const reporterId = (req as any).user.id;
        const tenantId = (req as any).user.tenantId;

        let photoPath = null;
        if (req.file) {
            photoPath = StorageService.saveFile(
                req.file.buffer,
                req.file.originalname,
                'incidents'
            );
        }

        const incident = await prisma.incident.create({
            data: {
                tenantId,
                title,
                description,
                priority: priority || 'MEDIUM',
                photoUrl: photoPath,
                reportedBy: reporterId
            }
        });

        // Initial Log
        await prisma.incidentLog.create({
            data: {
                incidentId: incident.id,
                actorId: reporterId,
                action: 'CREATE',
                note: 'Incident created'
            }
        });

        res.status(201).json(incident);

    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Error creating incident' });
    }
};

export const getIncidents = async (req: Request, res: Response) => {
    try {
        const incidents = await prisma.incident.findMany({
            include: { reporter: { select: { fullName: true } } },
            orderBy: { createdAt: 'desc' },
            take: 50
        });
        res.json(incidents);
    } catch (e) {
        res.status(500).json({ message: 'Error fetching' });
    }
}
