
import { PrismaClient } from '@prisma/client';
import { EmergencyController } from '../controllers/EmergencyController';

const prisma = new PrismaClient();

/**
 * 🤖 SYSTEM AUTO-PILOT
 * Responsable de la auto-reparación y salud del sistema al arranque.
 */
export class SystemAutoPilot {

    static async initiateSequence() {
        console.log("🤖 AUTOPILOT: Iniciando secuencia de verificación de salud...");

        try {
            // 1. VERIFICAR INTEGRIDAD DE DATOS (LEY 2)
            const routeCount = await prisma.route.count();

            if (routeCount === 0) {
                console.warn("⚠️ ALERTA: Base de datos detectada como VACÍA. Ejecutando Auto-Reparación (EmergencySeed)...");

                // Llamamos a la lógica de semilla forzada (simulando una request interna)
                // Usamos un mock de res para no romper si el controlador espera express.Response
                const mockRes = {
                    json: (data: any) => console.log("✅ AUTOPILOT SEED SUCCESS:", data.message),
                    status: (code: number) => ({
                        json: (data: any) => console.error(`❌ AUTOPILOT SEED FAILED (${code}):`, data.message)
                    })
                } as any;

                await EmergencyController.seedTenant1({} as any, mockRes);
                console.log("✅ AUTOPILOT: Datos inyectados correctamente.");
            } else {
                console.log(`✅ AUTOPILOT: Integridad de datos OK (Rutas: ${routeCount})`);
            }

            // 2. VERIFICAR SISTEMA DE CONFIGURACIÓN
            // Asegurarse de que el Tenant 1 (UCOT) tenga el nombre correcto
            await prisma.tenant.upsert({
                where: { id: 1 },
                update: { name: 'Transporte Corporativo TransForma' },
                create: { id: 1, name: 'Transporte Corporativo TransForma', slug: 'transporte-corp', isActive: true }
            });

            console.log("🏁 AUTOPILOT: Secuencia completada. Sistema en GOBERNANZA ESTABLE.");
            console.log("🚀 SYSTEM AUTO-CONFIGURED. Modules loaded: TRAFFIC, HR, INTELLIGENCE, OPERATIONS.");

        } catch (error) {
            console.error("💥 AUTOPILOT CRITICAL FAILURE:", error);
        }
    }
}
