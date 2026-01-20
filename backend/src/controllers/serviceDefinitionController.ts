
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const createServiceDefinition = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const tenantId = user.tenantId;
        const {
            seasonId, serviceNumber, line, variant,
            startTime, endTime, totalHours, liquidHours, kilometers,
            routeData
        } = req.body;

        // Validations
        if (!serviceNumber || !seasonId) {
            return res.status(400).json({ message: 'Número de servicio y temporada requeridos' });
        }

        // Upsert logic (Update if exists, else Create)
        const definition = await prisma.serviceDefinition.upsert({
            where: {
                tenantId_seasonId_serviceNumber: {
                    tenantId,
                    seasonId: Number(seasonId),
                    serviceNumber
                }
            },
            update: {
                line,
                variant,
                startTime,
                endTime,
                totalHours,
                liquidHours,
                kilometers,
                routeData: JSON.stringify(routeData)
            },
            create: {
                tenantId,
                seasonId: Number(seasonId),
                serviceNumber,
                line,
                variant,
                startTime,
                endTime,
                totalHours,
                liquidHours,
                kilometers,
                routeData: JSON.stringify(routeData)
            }
        });

        res.status(200).json(definition);
    } catch (error) {
        console.error('Create Service Def Error:', error);
        res.status(500).json({ message: 'Error al guardar definición de servicio' });
    }
};

export const getServiceDefinitions = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const { seasonId, dayType } = req.query;

        const where: any = { tenantId: user.tenantId };

        // 1. Filtrar por Season
        if (seasonId) where.seasonId = Number(seasonId);

        // 2. Filtrar por Tipo de Día (HABIL, SABADO, DOMINGO)
        // Si no se envía dayType, devuelve todo (útil para administración general)
        if (dayType) where.dayType = String(dayType).toUpperCase();

        const definitions = await prisma.serviceDefinition.findMany({
            where,
            orderBy: { serviceNumber: 'asc' } // Mantener orden visual
        });

        // Parse JSON back to object
        const parsed = definitions.map(d => {
            let parsedRoute = {};
            try {
                parsedRoute = JSON.parse(d.routeData);
            } catch (e) {
                console.warn(`Error parsing routeData for Service ${d.serviceNumber}`);
            }
            return {
                ...d,
                routeData: parsedRoute
            };
        });

        res.json(parsed);
    } catch (error) {
        console.error('Error fetching Service Definitions:', error);
        res.status(500).json({ message: 'Error al obtener definiciones', details: String(error) });
    }
};

export const deleteServiceDefinition = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const user = (req as any).user;

        await prisma.serviceDefinition.deleteMany({
            where: {
                id: Number(id),
                tenantId: user.tenantId
            }
        });

        res.json({ message: 'Eliminado correctamente' });
    } catch (error) {
        res.status(500).json({ message: 'Error al eliminar' });
    }
};
