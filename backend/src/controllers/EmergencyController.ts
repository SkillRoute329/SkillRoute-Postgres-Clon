
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
            console.log("🚑 EMERGENCY: Seeding Tenant 1 Data...");
            const { seedDatabase } = await import('../setup_db');

            await seedDatabase();

            return res.json({
                status: "Success",
                message: "Tenant 1 Database Seeded successfully (Services, Bulletins, Master Routes)."
            });
        } catch (error) {
            console.error("❌ EMERGENCY SEED FAILED:", error);
            return res.status(500).json({
                status: "Error",
                message: String(error)
            });
        }
    }
};
