import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import util from 'util';
import bcrypt from 'bcryptjs';

const execPromise = util.promisify(exec);
const prisma = new PrismaClient();

/**
 * Runs database migrations/push.
 * Uses 'prisma db push' which is safer for rapid iteration/prototyping environments
 * where schema changes might occur. For strict production, 'migrate deploy' is better.
 */
export async function runMigration() {
    console.log('🔄 [MIGRATION] Starting Database Push...');
    try {
        // --accept-data-loss is risky but necessary for auto-healing if schema drifted.
        await execPromise('npx prisma db push --accept-data-loss');
        console.log('✅ [MIGRATION] Database Push Completed.');
    } catch (error) {
        console.error('❌ [MIGRATION] Failed:', error);
        // Do not throw, allow app to attempt start anyway
    }
}

/**
 * Seeds the database with essential initial data:
 * 1. Default Categories (Shift Types)
 * 2. Default Admin User (if missing)
 */
export async function seedDatabase() {
    console.log('🌱 [SEED] Starting Database Seeding...');

    try {
        // 1. Seed Categories
        const categories = [
            { name: 'Turno Micro', baseValue: 3400, extraHourValue: 850 },
            { name: 'Turno Maniobra', baseValue: 2700, extraHourValue: 0 },
            { name: 'Turno Conductor', baseValue: 2600, extraHourValue: 650 },
            { name: 'Inspección', baseValue: 3000, extraHourValue: 820 },
            { name: 'Turno Guarda', baseValue: 2400, extraHourValue: 600 },
        ];

        for (const cat of categories) {
            await prisma.shiftCategory.upsert({
                where: {
                    tenantId_name: {
                        tenantId: 1,
                        name: cat.name
                    }
                },
                update: {}, // Don't overwrite if exists
                create: {
                    tenantId: 1,
                    name: cat.name,
                    baseValue: cat.baseValue,
                    extraHourValue: cat.extraHourValue
                }
            });
        }
        console.log('✅ [SEED] Categories Verified.');

        // 2. Seed Admin User
        const adminEmail = 'admin@transformafacil.com';
        const existingAdmin = await prisma.user.findFirst({
            where: { internalNumber: '9999' }
        });

        if (!existingAdmin) {
            console.log('⚠️ [SEED] Admin missing. Creating default admin...');
            const hashedPassword = await bcrypt.hash('admin123', 10);

            await prisma.user.create({
                data: {
                    internalNumber: '9999',
                    firstName: 'Admin',
                    lastName: 'System',
                    fullName: 'System Authenticator',
                    email: adminEmail,
                    passwordHash: hashedPassword,
                    role: 'Admin', // Ensure this matches enum case (Admin vs ADMIN)
                    tenantId: 1
                }
            });
            console.log('✅ [SEED] Default Admin Created (User: 9999 / Pass: admin123)');
        } else {
            console.log('✅ [SEED] Admin account exists.');
        }

        // 3. Ensure Tenant Exists (Default Tenant)
        const existingTenant = await prisma.tenant.findUnique({ where: { id: 1 } });
        if (!existingTenant) {
            await prisma.tenant.create({
                data: {
                    id: 1,
                    name: 'Transportes Default',
                    slug: 'transportes-default'
                }
            });
            console.log('✅ [SEED] Default Tenant Created.');
        }

    } catch (error) {
        console.error('❌ [SEED] Seeding Failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}
