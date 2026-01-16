
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// --- Vehicles ---

export const getVehicles = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const vehicles = await prisma.vehicle.findMany({
            where: { tenantId: user.tenantId },
            orderBy: { carNumber: 'asc' }
        });
        res.json(vehicles);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al obtener vehículos' });
    }
};

export const createVehicle = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const { carNumber, plate, brand, model, year } = req.body;

        if (user.role !== 'Admin' && user.role !== 'SuperAdmin') {
            return res.status(403).json({ message: 'No autorizado' });
        }

        const existing = await prisma.vehicle.findFirst({
            where: { tenantId: user.tenantId, carNumber }
        });

        if (existing) {
            return res.status(409).json({ message: 'Ya existe un vehículo con este número' });
        }

        const vehicle = await prisma.vehicle.create({
            data: {
                tenantId: user.tenantId,
                carNumber, plate, brand, model, year: year ? Number(year) : undefined
            }
        });
        res.status(201).json(vehicle);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al crear vehículo' });
    }
};

// --- Inspections (The Core Logic) ---

export const getLastInspection = async (req: Request, res: Response) => {
    try {
        const { vehicleId } = req.params;
        const inspection = await prisma.inspection.findFirst({
            where: { vehicleId: Number(vehicleId) },
            orderBy: { createdAt: 'desc' },
            include: { damages: true, user: { select: { fullName: true, internalNumber: true } } }
        });
        res.json(inspection || null);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching inspection' });
    }
};

export const createInspection = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const { vehicleId, type, odometer, fuelLevel, status, notes, newDamages } = req.body;
        // newDamages is an array of { zone, description, photoUrl, severity }

        // Transaction to save inspection AND damages atomically
        const result = await prisma.$transaction(async (tx) => {
            const inspection = await tx.inspection.create({
                data: {
                    tenantId: user.tenantId,
                    vehicleId: Number(vehicleId),
                    userId: user.id,
                    type,
                    odometer: odometer ? Number(odometer) : null,
                    fuelLevel,
                    status,
                    notes
                }
            });

            if (newDamages && newDamages.length > 0) {
                await tx.damageReport.createMany({
                    data: newDamages.map((d: any) => ({
                        inspectionId: inspection.id,
                        zone: d.zone,
                        description: d.description,
                        severity: d.severity || 'Medium',
                        photoUrl: d.photoUrl
                    }))
                });
            }

            // If status is NOT OK, maybe update Vehicle status?
            if (status === 'WithDamages') {
                // Logic to flag vehicle if critical? For now just logging.
            }

            return inspection;
        });

        res.status(201).json(result);

    } catch (error) {
        console.error('Inspection Error:', error);
        res.status(500).json({ message: 'Error al guardar inspección' });
    }
};
