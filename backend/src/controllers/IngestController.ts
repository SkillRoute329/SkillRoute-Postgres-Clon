
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
                    // This prevents collisions if Service 105 exists for both IDA and VUELTA
                    const serviceCode = svc.variant
                        ? `${svc.serviceNumber}${svc.variant}`
                        : svc.serviceNumber;

                    const dayType = svc.dayType || "HABIL";

                    await tx.serviceDefinition.upsert({
                        where: {
                            tenantId_seasonId_serviceCode_dayType: {
                                tenantId: 1,
                                seasonId: season!.id,
                                serviceCode: serviceCode,
                                dayType: dayType
                            }
                        },
                        update: {
                            line: svc.lineCode,
                            variant: svc.variant || 'A', // Default to A if missing
                            dayType: dayType,
                            startTime: svc.startTime,
                            endTime: svc.endTime || "00:00",
                            routeData: JSON.stringify(svc.routeData || [])
                        },
                        create: {
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
                        }
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
    }
};
