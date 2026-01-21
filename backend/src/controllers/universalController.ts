
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// WHITELIST DE ENTIDADES PERMITIDAS
// Mapea el nombre de la URL al nombre del modelo en Prisma (camelCase)
const ALLOWED_ENTITIES: Record<string, string> = {
    'users': 'user',
    'vehicles': 'vehicle',
    'stock': 'vehicle', // Alias for STOCK entity
    'departments': 'department',
    'roles': 'jobRole', // Corrected from 'role' to 'jobRole' based on schema
    'penalties': 'penaltyRule', // Likely mapped to PenaltyRule
    'maintenance': 'maintenanceReport', // Likely mapped to MaintenanceReport
    'service-definitions': 'serviceDefinition',
    'services': 'serviceDefinition', // Alias for SERVICES entity
    'rotation': 'serviceDefinition', // Alias for ROTATION entity (Uses same table but different columns)
    'bulletins': 'serviceDefinition', // Alias for BULLETINS entity
    'roadAlerts': 'roadAlert', // Mapped to RoadAlert
    'plannedDetours': 'plannedDetour', // Mapped to PlannedDetour
    'masterRoutes': 'masterRoute',
    'radars': 'radar',
    'tariffs': 'tariffZone',
    'parts': 'part'
};

export const UniversalController = {
    list: async (req: Request, res: Response) => {
        try {
            const { entity } = req.params;
            const modelName = ALLOWED_ENTITIES[entity];

            if (!modelName) {
                return res.status(400).json({ message: `Entity '${entity}' not allowed or unknown.` });
            }

            // Pagination params
            const page = Number(req.query.page) || 1;
            const pageSize = Number(req.query.limit) || 50;
            const skip = (page - 1) * pageSize;

            // Dynamic Prisma Call
            // @ts-ignore - Prisma dynamic access
            const delegate = prisma[modelName];

            if (!delegate) {
                return res.status(500).json({ message: `Prisma model '${modelName}' not found.` });
            }

            const [data, total] = await Promise.all([
                delegate.findMany({
                    take: pageSize,
                    skip: skip,
                    orderBy: { id: 'desc' } // Default sort, assumes ID exists
                }),
                delegate.count()
            ]);

            res.json({
                data,
                meta: { total, page, pageSize }
            });

        } catch (error) {
            console.error('Universal List Error:', error);
            res.status(500).json({ message: 'Error fetching data', error: String(error) });
        }
    },

    import: async (req: Request, res: Response) => {
        try {
            const { entity } = req.params;
            const modelName = ALLOWED_ENTITIES[entity];
            const { data } = req.body; // Array of objects

            if (!modelName || !Array.isArray(data)) {
                return res.status(400).json({ message: 'Invalid entity or data format.' });
            }

            // @ts-ignore
            const delegate = prisma[modelName];

            // Bulk create / Upsert logic
            // For simplicity in this universal importer, we'll try createMany first if supported, 
            // otherwise loop. Prisma createMany is supported for most SQL DBs.

            const result = await delegate.createMany({
                data: data,
                skipDuplicates: true // Simple conflict resolution
            });

            res.json({ message: 'Import successful', count: result.count });

        } catch (error) {
            console.error('Universal Import Error:', error);
            res.status(500).json({ message: 'Error importing data', error: String(error) });
        }
    },

    // Basic CRUD support for the UI editor
    create: async (req: Request, res: Response) => {
        try {
            const { entity } = req.params;
            const modelName = ALLOWED_ENTITIES[entity];
            // @ts-ignore
            const result = await prisma[modelName].create({ data: req.body });
            res.json(result);
        } catch (error) {
            res.status(500).json({ message: String(error) });
        }
    },

    update: async (req: Request, res: Response) => {
        try {
            const { entity, id } = req.params;
            const modelName = ALLOWED_ENTITIES[entity];
            // @ts-ignore
            const result = await prisma[modelName].update({
                where: { id: Number(id) },
                data: req.body
            });
            res.json(result);
        } catch (error) {
            res.status(500).json({ message: String(error) });
        }
    },

    delete: async (req: Request, res: Response) => {
        try {
            const { entity, id } = req.params;
            const modelName = ALLOWED_ENTITIES[entity];
            const numericId = Number(id);

            // SPECIAL CASCADE LOGIC
            if (modelName === 'masterRoute') {
                const route = await prisma.masterRoute.findUnique({ where: { id: numericId } });
                if (route) {
                    // 1. Delete associated RoadAlerts
                    await prisma.roadAlert.deleteMany({
                        where: { affectedLine: route.line }
                    });
                    // 2. TariffZones are already Cascade in DB, so no need here if correctly set in schema.
                }
            }

            // @ts-ignore
            await prisma[modelName].delete({ where: { id: numericId } });
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ message: String(error) });
        }
    }
};
