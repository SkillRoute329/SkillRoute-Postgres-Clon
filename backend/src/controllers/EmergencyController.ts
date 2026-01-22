
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

            // 1. Cleanup existing routes for this tenant
            // Due to Cascade onDelete, this should clean variants, schedules, etc.
            await prisma.route.deleteMany({
                where: { tenantId: tenantId }
            });
            console.log("🧹 Cleanup: Existing routes deleted.");

            // 2. Create Line 300
            await prisma.route.create({
                data: {
                    tenantId: tenantId,
                    name: "300",
                    description: "Línea Central (Instrucciones Técnicas)",
                    status: "ACTIVE"
                }
            });

            // 3. Create Line 370
            await prisma.route.create({
                data: {
                    tenantId: tenantId,
                    name: "370",
                    description: "Línea de Conexión (Experimental)",
                    status: "ACTIVE"
                }
            });

            // 4. Create 5 Mock Shifts/Boletines
            // Fetch categories to get a valid one
            const categories = await prisma.shiftCategory.findMany({ where: { tenantId } });
            const catId = categories[0]?.id || 1;

            for (let i = 1; i <= 5; i++) {
                await prisma.shift.create({
                    data: {
                        tenantId: tenantId,
                        categoryId: catId,
                        serviceNumber: `S-${100 + i}`,
                        date: new Date(),
                        time: `${8 + i}:00`,
                        line: "306", // Reference line
                        carNumber: `${1000 + i}`,
                        totalValue: 0,
                        createdBy: 0, // God Mode marker
                        status: 'CONFIRMED'
                    }
                });
            }

            console.log("✅ EMERGENCY SEED: Data injected correctly.");

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
    }
};
