
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    console.log("🔐 MASTER KEY PROTOCOL INITIATED");
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const tenantId = 1;

    // 0. Ensure Tenant 1 Exists (Fail-safe)
    const tenant = await prisma.tenant.upsert({
        where: { id: tenantId },
        update: {},
        create: {
            id: tenantId,
            name: 'Transporte Corporativo',
            slug: 'transporte-corp',
            isActive: true
        }
    });
    console.log(`🏢 Tenant Verified: ${tenant.name}`);

    // 1. Restoring User '0000' (Primary Request)
    try {
        await prisma.user.upsert({
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
                status: 'ACTIVE',
                // metadata: {} // Don't wipe metadata on update
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
                status: 'ACTIVE',
                metadata: {
                    classification: 'ADMIN' // Fallback if needed
                },
                driverStatus: 'A_LA_ORDEN'
            }
        });
        console.log("✅ User '0000' restored with password 'admin123'.");
    } catch (e) {
        console.error("❌ Failed to restore '0000':", e);
    }

    // 2. Restoring 'admin@transformafacil.com' (Backup)
    try {
        await prisma.user.upsert({
            where: {
                tenantId_email: {
                    tenantId: tenantId,
                    email: 'admin@transformafacil.com'
                }
            },
            update: {
                passwordHash: hashedPassword,
                role: 'ADMIN',
                isActive: true,
                status: 'ACTIVE'
            },
            create: {
                tenantId: tenantId,
                internalNumber: 'ADMIN_BACKUP',
                email: 'admin@transformafacil.com',
                firstName: 'Respaldo',
                lastName: 'Técnico',
                fullName: 'Respaldo Técnico',
                passwordHash: hashedPassword,
                role: 'ADMIN',
                isActive: true,
                status: 'ACTIVE',
                metadata: {},
                driverStatus: 'A_LA_ORDEN'
            }
        });
        console.log("✅ User 'admin@transformafacil.com' restored.");
    } catch (e) {
        console.error("❌ Failed to restore backup admin:", e);
    }
}

main()
    .catch((e) => {
        console.error("CRITICAL ERROR IN ACCESS SCRIPT:", e);
        process.exit(1);
    })
    .finally(async () => await prisma.$disconnect());
