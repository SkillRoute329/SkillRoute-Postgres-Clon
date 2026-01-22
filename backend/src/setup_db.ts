import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import util from 'util';
import bcrypt from 'bcryptjs';
import { seedMasterRoutes } from './seeds/SeedMasterRoutes';

const execPromise = util.promisify(exec);
const prisma = new PrismaClient();

/**
 * Runs database migrations/push.
 * Uses 'prisma db push' which is safer for rapid iteration/prototyping environments
 * where schema changes might occur. For strict production, 'migrate deploy' is better.
 */
export async function runMigration(force = false) {
    console.log('🔄 [MIGRATION] Checking Database Compatibility...');

    const isProduction = process.env.NODE_ENV === 'production';
    const shouldRun = force || process.env.INIT_DB_SCHEMA === 'true';

    if (isProduction && !shouldRun) {
        console.log('⚠️ [MIGRATION] Production environment detected. Skipping "db push".');
        console.log('   To force migration (first run), set INIT_DB_SCHEMA=true variable or run the init script.');
        return;
    }

    try {
        console.log('🔄 [MIGRATION] Starting Database Push...');
        // In production, we might want 'migrate deploy' but 'db push' is often used in these setups for simplicity.
        // We accept data loss only if not production or if forced explicitly
        const flags = '--accept-data-loss --skip-generate';
        await execPromise(`npx prisma db push ${flags}`);
        console.log('✅ [MIGRATION] Database Push Completed.');
    } catch (error) {
        console.error('❌ [MIGRATION] Failed:', error);
        // Do not throw, allow app to attempt start anyway
    }
}

/**
 * Seeds the database with essential initial data:
 * 1. Default Tenant (CRITICAL: Must be first)
 * 2. Default Categories
 * 3. Default Admin User
 */
export async function seedDatabase() {
    console.log('🌱 [SEED] Starting Database Seeding...');

    try {
        // 1. Ensure Tenant Exists (Default Tenant) - MUST BE FIRST
        const existingTenant = await prisma.tenant.findUnique({ where: { id: 1 } });
        if (!existingTenant) {
            console.log('🌱 [SEED] Creating Default Tenant (ID: 1)...');
            await prisma.tenant.create({
                data: {
                    id: 1,
                    name: 'Transportes Default',
                    slug: 'transportes-default'
                }
            });
            console.log('✅ [SEED] Default Tenant Created.');
        } else {
            console.log('✅ [SEED] Default Tenant exists.');
        }

        // 2. Seed Categories
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

        // 3. Seed Admin User (Depends on Tenant)
        const adminEmail = 'admin@transformafacil.com';
        const existingAdmin = await prisma.user.findFirst({
            where: { internalNumber: '9999', tenantId: 1 }
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

        // --- NEW: Traffic Department Seeds (Services & Bulletins) ---
        console.log('🌱 [SEED] Running Traffic Department massive seeds...');
        // Dynamic imports to avoid issues with rootDir if prisma is outside src
        const { seedServicesVerano2026 } = await import('./seeds/services_verano_2026');
        const { seedBoletinesData } = await import('./seeds/boletines_data');

        await seedServicesVerano2026(prisma);
        await seedBoletinesData(prisma);

        const routeCount = await prisma.route.count();
        if (routeCount === 0) {
            console.log('🌱 [SEED] Master Routes table is empty. Running Master Routes seed (UCOT Clean Slate)...');
            await seedMasterRoutes();
        } else {
            console.log('✅ [SEED] Master Routes already exist. Skipping seed.');
        }

        console.log('✅ [SEED] Traffic Department seeds completed.');

    } catch (error) {
        console.error('❌ [SEED] Seeding Failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}
