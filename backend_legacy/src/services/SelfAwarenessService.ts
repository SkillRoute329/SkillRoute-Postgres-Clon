
import { PrismaClient } from '@prisma/client';
import { SystemDNA } from '../config/SystemDNA';
import { EmergencyController } from '../controllers/EmergencyController';

const prisma = new PrismaClient();

/**
 * 🤖 SELF-AWARENESS SERVICE
 * Responsable de la auto-reparación y salud del sistema al arranque.
 */
export class SelfAwarenessService {

    static async boot() {
        console.log("🤖 SELF-AWARENESS: Iniciando secuencia de autonomía total...");

        try {
            // 1. AUTO-ALTA DE SUPER ADMIN (LEY 1)
            await this.ensureGodModeUser();

            // 2. AUTO-DIAGNÓSTICO Y CIRUGÍA (LEY 2)
            await this.checkAndRepairData();

            console.log("🏁 SELF-AWARENESS: Sistema en GOBERNANZA ESTABLE (DNA Enforced).");
            console.log("🚀 MODO AUTÓNOMO ACTIVADO: TRAFFIC, HR, INTELLIGENCE, OPERATIONS listos.");

        } catch (error) {
            console.error("💥 SELF-AWARENESS CRITICAL FAILURE:", error);
        }
    }

    private static async ensureGodModeUser() {
        const tenantId = SystemDNA.DEFAULT_TENANT.id;

        // Ensure Tenant 1 exists
        await prisma.tenant.upsert({
            where: { id: tenantId },
            update: { name: SystemDNA.DEFAULT_TENANT.name },
            create: {
                id: tenantId,
                name: SystemDNA.DEFAULT_TENANT.name,
                slug: SystemDNA.DEFAULT_TENANT.slug,
                isActive: true
            }
        });

        // Ensure 0000 exists
        await prisma.user.upsert({
            where: {
                tenantId_internalNumber: {
                    tenantId,
                    internalNumber: SystemDNA.GOD_MODE_USER
                }
            },
            update: {
                role: 'ADMIN',
                isActive: true,
                metadata: { type: 'GOD_MODE', preservation: 'DNA_ENFORCED' }
            },
            create: {
                tenantId,
                internalNumber: SystemDNA.GOD_MODE_USER,
                firstName: 'System',
                lastName: 'Manager',
                fullName: 'System Manager (God Mode)',
                passwordHash: SystemDNA.GOD_MODE_HASH,
                role: 'ADMIN',
                isActive: true,
                metadata: { type: 'GOD_MODE' }
            }
        });
        console.log(`✅ IDENTITY: User ${SystemDNA.GOD_MODE_USER} confirmed/repaired.`);
    }

    private static async checkAndRepairData() {
        const routeCount = await prisma.route.count();

        if (routeCount === 0 && SystemDNA.AUTO_REPAIR) {
            console.warn("⚠️ ALERTA: Base de datos VACÍA. Iniciando Auto-Cirugía (Emergency Seed)...");

            // Mock de res para el controlador
            const mockRes = {
                json: (data: any) => console.log("✅ AUTO-REPAIR SUCCESS:", data.message),
                status: (code: number) => ({
                    json: (data: any) => console.error(`❌ AUTO-REPAIR FAILED (${code}):`, data.message)
                })
            } as any;

            await EmergencyController.seedTenant1({} as any, mockRes);
        } else {
            console.log(`✅ DIAGNOSTIC: Data is present (Routes: ${routeCount}).`);
        }
    }
}
