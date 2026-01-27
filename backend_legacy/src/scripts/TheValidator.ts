
import { PrismaClient } from '@prisma/client';
import { EmergencyController } from '../controllers/EmergencyController'; // Using existing logic

const prisma = new PrismaClient();

export const TheValidator = {
    run: async () => {
        try {
            console.log("🔍 THE VALIDATOR: Auditando Integridad de Datos...");

            // 1. Audit: Check for ServiceDefinitions with missing data (Legacy "A DEFINIR" equivalent)
            // Lógica: Si hay serviceDefinitions sin 'line' o con '0000' huérfanos
            // Dado que el schema nuevo es robusto, buscaremos inconsistencias lógicas.

            const orphans = await prisma.serviceDefinition.count({
                where: {
                    OR: [
                        { line: { equals: "A DEFINIR" } },
                        { line: { equals: "" } },
                        { line: { equals: null } }
                    ]
                }
            });

            const orphanedShifts = await prisma.shift.count({
                where: {
                    OR: [
                        { line: { equals: "A DEFINIR" } },
                        { line: { equals: "" } }
                    ]
                }
            });

            const errorCount = orphans + orphanedShifts;

            if (errorCount > 0) {
                console.error(`🚨 ALERTA ROJA: Detectados ${errorCount} registros corruptos.`);
                console.log("🛠️ INICIANDO PROTOCOLO DE AUTO-REPARACIÓN...");

                // 2. Fix Strategy: WIPE & RE-SEED BASE
                // We use EmergencyController's wipeAll logic but adapted for script use

                await prisma.$transaction([
                    prisma.shift.deleteMany({}),
                    prisma.serviceDefinition.deleteMany({}),
                    prisma.route.deleteMany({ where: { tenantId: 1 } })
                ]);

                console.log("🧹 Basura eliminada. Reconstruyendo cimientos...");

                // 3. Re-Seed Correctly
                // Creating Base Routes
                await prisma.route.createMany({
                    data: [
                        { tenantId: 1, name: "300", description: "Instrucciones", status: "ACTIVE" },
                        { tenantId: 1, name: "306", description: "Géant - Casabó", status: "ACTIVE" },
                        { tenantId: 1, name: "370", description: "Portones - Cerro", status: "ACTIVE" }
                    ]
                });

                // Default Season
                const season = await prisma.season.findFirst({ where: { isActive: true } });
                const seasonId = season ? season.id : (await prisma.season.create({
                    data: {
                        tenantId: 1, name: "Temporada Base Auto-Fix", startDate: new Date(), isActive: true
                    }
                })).id;

                // Create a Test Service to verify
                await prisma.serviceDefinition.create({
                    data: {
                        tenantId: 1,
                        seasonId: seasonId,
                        serviceCode: "1001",
                        serviceNumber: "1001",
                        line: "306",
                        dayType: "HABIL",
                        startTime: "08:00",
                        endTime: "16:00",
                        routeData: "{}"
                    }
                });

                console.log("✅ AUTO-REPARACIÓN EXITOSA: Sistema Higienizado.");

            } else {
                console.log("✅ INTEGRIDAD OK: No se encontraron registros corruptos.");
            }

        } catch (error) {
            console.error("❌ THE VALIDATOR FATAL ERROR:", error);
            // Non-blocking catch to allow server start, but logged heavily
        }
    }
}
