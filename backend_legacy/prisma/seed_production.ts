import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    console.log('🚀 INICIANDO CERTIFICACIÓN DE PRODUCCIÓN (UCOT 2026) 🚀');

    const tenantId = 1;

    // 1. Ensure Tenant
    await prisma.tenant.upsert({
        where: { id: 1 },
        update: {},
        create: { name: 'UCOT - Cooperativa', slug: 'ucot_uy', isActive: true }
    });

    // 2. Financial & HR Structure (Orden Maestra)
    const deptOps = await prisma.department.upsert({
        where: { tenantId_name: { tenantId, name: 'Operaciones' } },
        update: {},
        create: { tenantId, name: 'Operaciones', description: 'Personal de Plataforma' }
    });

    // Roles UCOT 2026
    const roleMicrero = await prisma.jobRole.upsert({
        where: { tenantId_departmentId_name: { tenantId, departmentId: deptOps.id, name: 'Micrero' } },
        update: { baseSalary: 3550.00, extraHourValue: 900.00 },
        create: {
            tenantId,
            departmentId: deptOps.id,
            name: 'Micrero',
            baseSalary: 3550.00, // $3.550 Salario Base
            extraHourValue: 900.00
        }
    });

    const roleConductor = await prisma.jobRole.upsert({
        where: { tenantId_departmentId_name: { tenantId, departmentId: deptOps.id, name: 'Conductor' } },
        update: { baseSalary: 2700.00, extraHourValue: 700.00 },
        create: {
            tenantId,
            departmentId: deptOps.id,
            name: 'Conductor',
            baseSalary: 2700.00, // $2.700 Salario Base
            extraHourValue: 700.00
        }
    });

    console.log('✅ Roles Financieros Configurados (Micrero $3550 / Conductor $2700)');

    // 3. Generate 50 Certified Users (Smoke Test)
    const hashedPassword = await bcrypt.hash('ucot2026', 10);

    console.log('👥 Generando 50 Usuarios de Prueba...');

    for (let i = 1; i <= 50; i++) {
        const internalStr = i.toString().padStart(3, '0'); // 001, 002...
        const isMicrero = i >= 40; // Last 10 are Micreros (Senior)
        const role = isMicrero ? roleMicrero : roleConductor;

        await prisma.user.upsert({
            where: { tenantId_internalNumber: { tenantId, internalNumber: internalStr } },
            update: {
                jobRoleId: role.id,
                driverStatus: 'A_LA_ORDEN' // Reset status
            },
            create: {
                tenantId,
                internalNumber: internalStr,
                firstName: isMicrero ? `Micrero` : `Conductor`,
                lastName: `Prueba ${internalStr}`,
                fullName: isMicrero ? `Micrero Prueba ${internalStr}` : `Conductor Prueba ${internalStr}`,
                passwordHash: hashedPassword,
                role: 'User',
                jobRoleId: role.id,
                departmentId: deptOps.id,
                driverStatus: 'A_LA_ORDEN'
            }
        });

        if (i % 10 === 0) console.log(`   Processed ${i}/50 users...`);
    }

    // 4. Create Fleet (UCOT Style)
    const fleetModels = ['Yutong ZK6128', 'Yutong E12 Pro', 'Marcopolo Gran Viale'];

    console.log('🚌 Generando Flota...');
    for (let i = 1000; i < 1020; i++) {
        await prisma.vehicle.upsert({
            where: { tenantId_internalNumber: { tenantId, internalNumber: i.toString() } },
            update: {},
            create: {
                tenantId,
                internalNumber: i.toString(),
                plate: `STP ${i}`,
                make: 'Yutong',
                model: fleetModels[i % 3],
                year: 2024,
                status: 'OPERATIONAL'
            }
        });
    }

    console.log('✅ Certificación de Datos Completada.');
    console.log('   - 50 Usuarios listos para Login (Pass: ucot2026)');
    console.log('   - Finanzas configuradas para liquidación diaria.');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
