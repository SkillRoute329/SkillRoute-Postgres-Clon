
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export const EmergencyController = {
    restoreAdmin: async (req: Request, res: Response) => {
        try {
            console.log("🚑 EMERGENCY: Request received to restore user '0000'");

            const hashedPassword = await bcrypt.hash('admin123', 10);
            const tenantId = 1;

            // Ensure Tenant 1 exists
            await prisma.tenant.upsert({
                where: { id: tenantId },
                update: {},
                create: { id: tenantId, name: 'Transporte Corporativo', slug: 'transporte-corp', isActive: true }
            });

            // Restore User '0000'
            const user = await prisma.user.upsert({
                where: {
                    tenantId_internalNumber: {
                        tenantId: tenantId,
                        internalNumber: '0000'
                    }
                },
                update: {
                    passwordHash: hashedPassword,
                    role: 'ADMIN',
                    isActive: true,
                    // status: 'ACTIVE', // Removed if column missing
                    metadata: {
                        status: 'ACTIVE',
                        classification: 'ADMIN',
                        emergency_restore: new Date().toISOString()
                    }
                    // driverStatus handled if column exists, else ignored in update
                },
                create: {
                    tenantId: tenantId,
                    internalNumber: '0000',
                    firstName: 'Super',
                    lastName: 'Admin',
                    fullName: 'Super Admin 0000',
                    passwordHash: hashedPassword,
                    role: 'ADMIN',
                    isActive: true,
                    // status: 'ACTIVE',
                    metadata: {
                        status: 'ACTIVE',
                        classification: 'ADMIN',
                        created_via: 'EMERGENCY_API'
                    },
                    driverStatus: 'A_LA_ORDEN'
                }
            });

            console.log("✅ EMERGENCY SUCCESS: User 0000 restored.");

            return res.json({
                status: "Success",
                message: "User 0000 restored with password admin123",
                details: {
                    id: user.id,
                    internalNumber: user.internalNumber,
                    role: user.role
                }
            });

        } catch (error) {
            console.error("❌ EMERGENCY FAILED:", error);
            return res.status(500).json({
                status: "Error",
                message: String(error)
            });
        }
    },

    seedTenant1: async (req: Request, res: Response) => {
        try {
            console.log("🚑 EMERGENCY: Forced Re-Seed for Tenant 1 Initiated.");
            const tenantId = 1;

            // USE TRANSACTION FOR ATOMICITY
            await prisma.$transaction(async (tx) => {
                // 1. Cleanup
                await tx.shift.deleteMany({ where: { tenantId } });
                await tx.route.deleteMany({ where: { tenantId } });
                // Note: routeVariant and others cascade delete usually, if setup in schema. 
                // If not, we might need manual delete, but assuming cascade or clean slate.

                console.log("🧹 Cleanup: Existing routes deleted.");

                // 2. Create Lines
                await tx.route.create({
                    data: {
                        tenantId,
                        name: "300",
                        description: "Línea Central (Instrucciones Técnicas)",
                        status: "ACTIVE"
                    }
                });

                await tx.route.create({
                    data: {
                        tenantId,
                        name: "370",
                        description: "Línea de Conexión (Experimental)",
                        status: "ACTIVE"
                    }
                });

                // 3. Create Mock Shifts
                // Need a valid category
                let catId = 1;
                const cat = await tx.shiftCategory.findFirst({ where: { tenantId } });
                if (cat) {
                    catId = cat.id;
                } else {
                    const newCat = await tx.shiftCategory.create({
                        data: { tenantId, name: 'General', baseValue: 0, extraHourValue: 0 }
                    });
                    catId = newCat.id;
                }

                for (let i = 1; i <= 5; i++) {
                    await tx.shift.create({
                        data: {
                            tenantId,
                            categoryId: catId,
                            serviceNumber: `S-${100 + i}`,
                            date: new Date(),
                            time: `${8 + i}:00`,
                            line: "306",
                            carNumber: `${1000 + i}`,
                            totalValue: 0,
                            createdBy: 0,
                            status: 'CONFIRMED'
                        }
                    });
                }
            });

            console.log("✅ EMERGENCY SEED: Data injected correctly (Atomic).");

            return res.json({
                status: "Success",
                message: "Datos inyectados correctamente: Líneas 300, 370 y 5 servicios de prueba creados.",
                details: {
                    routesCreated: ["300", "370"],
                    shiftsCreated: 5
                }
            });
        } catch (error: any) {
            console.error("❌ EMERGENCY SEED FAILED:", error);
            return res.status(500).json({
                status: "Error",
                message: `Failed to seed data: ${error.message || String(error)}`
            });
        }
    },

    wipeAll: async (req: Request, res: Response) => {
        try {
            console.log("🔥 EMERGENCY: PURGE ALL DATA INITIATED (WIPE)");
            const tenantId = 1;

            await prisma.$transaction([
                // Ordered deletions to respect foreign keys
                prisma.shift.deleteMany({ where: { tenantId } }),
                prisma.serviceDefinition.deleteMany({ where: { tenantId } }),
                prisma.tripSchedule.deleteMany({}), // If tenant context exists, filter
                prisma.routeVariant.deleteMany({}),
                prisma.route.deleteMany({ where: { tenantId } }),
                prisma.vehicle.deleteMany({ where: { tenantId } }),
                // Keep users but clean assignments
                prisma.user.updateMany({
                    where: { tenantId },
                    data: { assignedVehicleId: null }
                })
            ]);

            console.log("✅ WIPE COMPLETE. System is clean.");
            return res.json({ message: "Sistema purgado correctamente. Listo para re-importación." });

        } catch (error) {
            console.error("❌ WIPE FAILED:", error);
            return res.status(500).json({ message: "Error crítico al purgar", error });
        }
    }
};
