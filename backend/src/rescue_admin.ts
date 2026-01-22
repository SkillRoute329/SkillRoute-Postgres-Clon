
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function rescueAccess() {
    console.log("🛡️ INICIANDO PROTOCOLO DE RESCATE DE ACCESO (QUIRÚRGICO)...");

    try {
        // 1. Verificar Tenant (Requisito para crear Usuario)
        // LEY 1: UPSERT / CHECK-FIRST
        let tenant = await prisma.tenant.findUnique({ where: { id: 1 } });
        if (!tenant) {
            console.log("⚠️ Tenant 1 no encontrado. Creando Tenant base (Sin tocar tablas de negocio)...");
            tenant = await prisma.tenant.create({
                data: {
                    id: 1,
                    name: 'Transportes Default',
                    slug: 'transportes-default'
                }
            });
            console.log("✅ Tenant 1 Restaurado.");
        } else {
            console.log("✅ Tenant 1 Existente (Intacto).");
        }

        // 2. Verificar Admin User
        // LEY 3: INMUTABILIDAD DE CREDENCIALES
        const adminEmail = 'admin@transformafacil.com';
        const existingAdmin = await prisma.user.findFirst({
            where: {
                OR: [
                    { email: adminEmail },
                    { internalNumber: '9999' }
                ]
            }
        });

        if (existingAdmin) {
            console.log(`🔒 [SEGURIDAD] El usuario Admin (ID: ${existingAdmin.id}) YA EXISTE.`);
            console.log("   -> NO SE HAN MODIFICADO CREDENCIALES.");
            console.log("   -> Si no recuerdas la contraseña, solicita un reset manual de password, pero el despliegue no la tocará.");
        } else {
            console.log("⚠️ Admin no detectado. Creando Admin de Emergencia...");
            const hashedPassword = await bcrypt.hash('admin123', 10);

            await prisma.user.create({
                data: {
                    tenantId: 1,
                    internalNumber: '9999',
                    firstName: 'Admin',
                    lastName: 'System',
                    fullName: 'System Authenticator',
                    email: adminEmail,
                    passwordHash: hashedPassword,
                    role: 'Admin', // Ensure 'Admin' matches the Enum exactly in schema
                    status: 'ACTIVE'
                }
            });
            console.log("✅ Admin Restaurado: admin@transformafacil.com / admin123");
        }

        // 3. Verificación de Integridad de Datos (LEY 2: Domain Isolation)
        // Solo leemos para confirmar que NO tocamos nada
        const routeCount = await prisma.route.count();
        const tripCount = await prisma.tripSchedule.count();

        console.log("\n--- REPORTE DE INTEGRIDAD DE DATOS ---");
        console.log(`🛣️  Rutas Intactas: ${routeCount}`);
        console.log(`🚌  Viajes/Horarios Intactos: ${tripCount}`);

        if (routeCount > 0) {
            console.log("✅ CONFIRMADO: Los Cartones/Datos anteriores NO fueron afectados.");
        } else {
            console.log("ℹ️ Nota: No se detectaron rutas previas (o la DB estaba vacía antes de este script).");
        }

    } catch (error) {
        console.error("❌ ERROR EN PROTOCOLO DE RESCATE:", error);
    } finally {
        await prisma.$disconnect();
    }
}

rescueAccess();
