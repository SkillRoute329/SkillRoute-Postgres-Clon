
import { PrismaClient } from '@prisma/client';
import { SYSTEM_DNA } from '../config/SystemDNA';
import { EmergencyController } from '../controllers/EmergencyController';

const prisma = new PrismaClient();

/**
 * 🤖 SELF-AWARENESS SERVICE
 * The machine that knows itself. Responsible for identity verification and data integrity.
 */
export class SelfAwarenessService {

    static async boot() {
        console.log("🤖 SELF-AWARENESS: Waking up...");

        try {
            // 1. IDENTITY VERIFICATION: The 0000 User must exist.
            await this.ensureGodModeUser();

            // 2. DATA ENVIRONMENT VERIFICATION: Routes must exist.
            await this.ensureCriticalRoutes();

            // 3. UI INTEGRITY: (Logical check, ensured via Manifest)
            console.log("🏁 SELF-AWARENESS: System is fully conscious and operational.");

        } catch (error) {
            console.error("💥 SELF-AWARENESS CRITICAL FAILURE:", error);
        }
    }

    private static async ensureGodModeUser() {
        const dna = SYSTEM_DNA.GOD_MODE;
        console.log(`🧬 [DNA] Ensuring God Mode User: ${dna.email}`);

        await prisma.tenant.upsert({
            where: { id: SYSTEM_DNA.CRITICAL_DATA.default_tenant.id },
            update: { name: SYSTEM_DNA.CRITICAL_DATA.default_tenant.name },
            create: {
                id: SYSTEM_DNA.CRITICAL_DATA.default_tenant.id,
                name: SYSTEM_DNA.CRITICAL_DATA.default_tenant.name,
                slug: SYSTEM_DNA.CRITICAL_DATA.default_tenant.slug,
                isActive: true
            }
        });

        await prisma.user.upsert({
            where: {
                tenantId_internalNumber: {
                    tenantId: SYSTEM_DNA.CRITICAL_DATA.default_tenant.id,
                    internalNumber: dna.internalNumber
                }
            },
            update: {
                role: 'ADMIN',
                isActive: true,
                metadata: { type: 'GOD_MODE', preservation: 'DNA_ENFORCED' }
            },
            create: {
                tenantId: SYSTEM_DNA.CRITICAL_DATA.default_tenant.id,
                internalNumber: dna.internalNumber,
                firstName: 'System',
                lastName: 'Root',
                fullName: 'System Root (DNA)',
                passwordHash: dna.password_hash,
                role: 'ADMIN',
                isActive: true,
                metadata: { type: 'GOD_MODE', source: 'DNA' }
            }
        });
        console.log("✅ IDENTITY: God Mode User confirmed in DB.");
    }

    private static async ensureCriticalRoutes() {
        const criticalNames = SYSTEM_DNA.CRITICAL_DATA.min_routes;
        const currentCount = await prisma.route.count();

        // Check if at least the core ones exist
        if (currentCount < criticalNames.length) {
            console.warn(`⚠️ INTEGRITY: Found ${currentCount} routes. Expected minimum ${criticalNames.length}.`);
            console.log("🚑 ACTION: High-Level Pulse detected. Triggering Emergency Seed...");

            const mockRes = {
                json: (data: any) => console.log("✅ AUTO-REPAIR:", data.message),
                status: (code: number) => ({
                    json: (data: any) => console.error(`❌ AUTO-REPAIR FAILED (${code}):`, data.message)
                })
            } as any;

            await EmergencyController.seedTenant1({} as any, mockRes);
        } else {
            console.log("✅ INTEGRITY: Core routes verified.");
        }
    }
}
