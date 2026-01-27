
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const IngestController = {
    ingestJson: async (req: Request, res: Response) => {
        try {
            const { lines, services } = req.body;

            if (!lines || !services) {
                return res.status(400).json({ message: "Payload inválido. Se requieren 'lines' y 'services'." });
            }

            console.log(`📥 INGEST: Recibiendo ${lines.length} Líneas y ${services.length} Servicios.`);

            // 0. Obtener Temporada Activa (Default)
            let season = await prisma.season.findFirst({
                where: { isActive: true }
            });

            if (!season) {
                const seasonName = `Importación ${new Date().toLocaleDateString()}`;
                console.log(`⚠️ No active season found. Creating season '${seasonName}'.`);
                season = await prisma.season.create({
                    data: {
                        tenantId: 1,
                        name: seasonName,
                        startDate: new Date(),
                        isActive: true
                    }
                });
            }

            // 1. TRANSACTION ATÓMICA
            const result = await prisma.$transaction(async (tx) => {

                // A. UPSERT LÍNEAS (Padres)
                const lineMap = new Map<string, number>();

                for (const lineData of lines) {
                    const line = await tx.route.upsert({
                        where: {
                            tenantId_name: {
                                tenantId: 1,
                                name: lineData.code
                            }
                        },
                        update: {}, // No cambia nada si existe
                        create: {
                            tenantId: 1,
                            name: lineData.code,
                            description: lineData.name,
                            type: 'URBANA',
                            status: 'ACTIVE'
                        }
                    });
                    lineMap.set(lineData.code, line.id);
                }

                console.log(`✅ LÍNEAS: ${lineMap.size} procesadas.`);

                // B. CREATE SERVICIOS (Hijos)
                // Primero borramos servicios existentes que coincidan (para evitar duplicados o stale data en re-import)
                // OJO: Esto es peligroso si se quiere "agregar". Asumiremos "Carga Masiva" = "Estado Deseado".
                // Para seguridad, usaremos upserts o createMany ignorando duplicados si el schema lo permitiera.
                // Dado el constraint unique [tenantId, seasonId, serviceCode, dayType], usaremos upsert loop.

                let createdCount = 0;
                let updatedCount = 0;

                for (const svc of services) {
                    // Unique Code Strategy: Number + Variant (e.g. "105A")
                    const serviceCode = svc.variant
                        ? `${svc.serviceNumber}${svc.variant}`
                        : svc.serviceNumber;

                    const dayType = svc.dayType || "HABIL";

                    // Vehicle Lookup or Create (if provided in Rotation Sheet)
                    let assignedVehicleId = null;
                    if (svc.vehicleInternalNumber) {
                        const cleanNumber = String(svc.vehicleInternalNumber).trim();
                        if (cleanNumber.length > 0) {
                            // Try to find
                            let v = await tx.vehicle.findFirst({
                                where: { tenantId: 1, internalNumber: cleanNumber }
                            });

                            // If not found, CREATE IT (Auto-Discovery)
                            if (!v) {
                                console.log(`🚚 Creating new vehicle from import: ${cleanNumber}`);
                                v = await tx.vehicle.create({
                                    data: {
                                        tenantId: 1,
                                        internalNumber: cleanNumber,
                                        plate: `IMPORT-${cleanNumber}`, // Placeholder
                                        make: 'GENERIC',
                                        model: 'IMPORT',
                                        status: 'OPERATIONAL',
                                    }
                                });
                            }

                            assignedVehicleId = v.id;
                        }
                    }

                    // Prepare Data Payload
                    // Use a dynamic object to conditionally add 'routeData' only if it has content
                    // (To avoid overwriting full matrix data with empty rotation data)
                    const hasRouteData = svc.routeData && svc.routeData.length > 0;

                    const updateData: any = {
                        line: svc.lineCode,
                        variant: svc.variant || 'A',
                        dayType: dayType,
                        startTime: svc.startTime,
                        endTime: svc.endTime || "00:00",
                    };

                    if (hasRouteData) {
                        updateData.routeData = JSON.stringify(svc.routeData);
                    }

                    if (assignedVehicleId) {
                        updateData.assignedVehicleId = assignedVehicleId;
                    }

                    const createData: any = {
                        tenantId: 1,
                        seasonId: season!.id,
                        serviceCode: serviceCode,
                        serviceNumber: svc.serviceNumber,
                        line: svc.lineCode,
                        variant: svc.variant || 'A',
                        dayType: dayType,
                        startTime: svc.startTime,
                        endTime: svc.endTime || "00:00",
                        routeData: JSON.stringify(svc.routeData || [])
                    };

                    if (assignedVehicleId) {
                        createData.assignedVehicleId = assignedVehicleId;
                    }

                    await tx.serviceDefinition.upsert({
                        where: {
                            tenantId_seasonId_serviceCode_dayType: {
                                tenantId: 1,
                                seasonId: season!.id,
                                serviceCode: serviceCode,
                                dayType: dayType
                            }
                        },
                        update: updateData,
                        create: createData
                    });
                    createdCount++;
                }

                return { lines: lineMap.size, services: createdCount };
            }, {
                maxWait: 10000, // 10s wait for connection
                timeout: 60000  // 60s transaction timeout
            });

            console.log(`🚀 INGEST SUCCESS: ${result.lines} Lines, ${result.services} Services.`);
            return res.json({
                message: "Importación Exitosa",
                details: result
            });

        } catch (error) {
            console.error("❌ INGEST FAILED:", error);
            return res.status(500).json({
                message: "Error Transaccional en Ingesta",
                error: String(error)
            });
        }
    },

    clearAllData: async (req: Request, res: Response) => {
        try {
            console.log("🧹 CLEAR: Iniciando limpieza de datos operativos...");

            const result = await prisma.$transaction([
                prisma.shift.deleteMany({ where: { tenantId: 1 } }),
                prisma.serviceDefinition.deleteMany({ where: { tenantId: 1 } }),
                prisma.route.deleteMany({ where: { tenantId: 1 } }),
                // Don't delete Vehicles or Users as they are masters
            ]);

            console.log("✅ CLEAR SUCCESS: Datos operativos eliminados.");
            return res.json({
                message: "Datos operativos eliminados correctamente.",
                details: result
            });

        } catch (error) {
            console.error("❌ CLEAR FAILED:", error);
            return res.status(500).json({
                message: "Error al limpiar datos",
                error: String(error)
            });
        }
    }
};
