
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// --- Vehicles ---

export const getVehicles = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const vehicles = await (prisma.vehicle as any).findMany({
            where: { tenantId: user.tenantId },
            include: {
                assignedDrivers: {
                    select: { id: true, fullName: true, internalNumber: true }
                },
                rotationScheme: {
                    select: { id: true, name: true }
                }
            },
            orderBy: { internalNumber: 'asc' }
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
        const {
            internalNumber, carNumber, plate, make, brand, model,
            year, status, rotationSchemeId, driverIds, features
        } = req.body;
        const finalNumber = internalNumber || carNumber;

        if (user.role !== 'Admin' && user.role !== 'SuperAdmin') {
            return res.status(403).json({ message: 'No autorizado' });
        }

        if (!finalNumber) {
            return res.status(400).json({ message: 'Número de coche requerido' });
        }

        const featuresString = typeof features === 'object' ? JSON.stringify(features) : features;

        const vehicle = await prisma.$transaction(async (tx) => {
            // 1. Upsert Vehicle
            const v = await (tx.vehicle as any).upsert({
                where: {
                    tenantId_internalNumber: {
                        tenantId: user.tenantId,
                        internalNumber: finalNumber
                    }
                },
                update: {
                    plate,
                    make: make || brand,
                    model,
                    year: year ? Number(year) : undefined,
                    status: status || 'OPERATIONAL',
                    rotationSchemeId: rotationSchemeId ? Number(rotationSchemeId) : null,
                    features: featuresString
                },
                create: {
                    tenantId: user.tenantId,
                    internalNumber: finalNumber,
                    plate,
                    make: make || brand,
                    model,
                    year: year ? Number(year) : undefined,
                    status: status || 'OPERATIONAL',
                    rotationSchemeId: rotationSchemeId ? Number(rotationSchemeId) : null,
                    features: featuresString
                }
            });

            // 2. Manage Driver Assignments
            if (Array.isArray(driverIds)) {
                // First, remove this vehicle from ANY user currently assigned to it
                await (tx.user as any).updateMany({
                    where: { assignedVehicleId: v.id, tenantId: user.tenantId },
                    data: { assignedVehicleId: null }
                });

                // Then, assign requested drivers
                if (driverIds.length > 0) {
                    await (tx.user as any).updateMany({
                        where: {
                            id: { in: driverIds.map(Number) },
                            tenantId: user.tenantId
                        },
                        data: { assignedVehicleId: v.id }
                    });
                }
            }

            return v;
        });

        res.status(200).json(vehicle);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al guardar vehículo' });
    }
};

export const getRotationSchemes = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const schemes = await (prisma as any).rotationScheme.findMany({
            where: { tenantId: user.tenantId },
            select: { id: true, name: true }
        });
        res.json(schemes);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener esquemas de rotación' });
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

export const createVehicleCheck = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const { cocheId, photos, notes, estado } = req.body;

        // EMERGENCY: No complex validation, just save the raw data (Base64 supported via Json)
        console.log(`[DEBUG] Saving VehicleCheck for Coche: ${cocheId} | User: ${user?.id}`);

        const check = await (prisma as any).vehicleCheck.create({
            data: {
                tenantId: user?.tenantId || 1,
                userId: user?.id || 0,
                cocheId: String(cocheId || 'S/N'),
                fotos: photos || [],
                notas: notes || '',
                estado: estado || 'OK'
            }
        });

        res.status(201).json(check);
    } catch (error) {
        console.error('CRITICAL VehicleCheck Error:', error);
        res.status(500).json({ message: 'Error de emergencia al registrar revisión', error: String(error) });
    }
};
