
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedRRHH() {
    console.log('🌱 Seeding RRHH Department and Roles...');

    const tenantId = 1;

    // 1. Create RRHH Department
    const rrhhDept = await prisma.department.upsert({
        where: {
            tenantId_name: {
                tenantId,
                name: 'Recursos Humanos'
            }
        },
        update: {},
        create: {
            tenantId,
            name: 'Recursos Humanos',
            description: 'Departamento encargado de la gestión de personal y RRHH.'
        }
    });

    console.log(`✅ Department: ${rrhhDept.name}`);

    // 2. Create Roles for RRHH
    const roles = [
        { name: 'Gerente de RRHH', baseSalary: 85000, extraHourValue: 1200 },
        { name: 'Asistente de Personal', baseSalary: 45000, extraHourValue: 600 },
        { name: 'Encargado de Liquidaciones', baseSalary: 60000, extraHourValue: 800 }
    ];

    for (const role of roles) {
        await prisma.jobRole.upsert({
            where: {
                tenantId_departmentId_name: {
                    tenantId,
                    departmentId: rrhhDept.id,
                    name: role.name
                }
            },
            update: {
                baseSalary: role.baseSalary,
                extraHourValue: role.extraHourValue
            },
            create: {
                tenantId,
                departmentId: rrhhDept.id,
                name: role.name,
                baseSalary: role.baseSalary,
                extraHourValue: role.extraHourValue
            }
        });
        console.log(`✅ JobRole: ${role.name}`);
    }

    // 3. Create Fleet Control Department (Since user needs it)
    const fleetDept = await prisma.department.upsert({
        where: {
            tenantId_name: {
                tenantId,
                name: 'Control de Flota'
            }
        },
        update: {},
        create: {
            tenantId,
            name: 'Control de Flota',
            description: 'Departamento encargado del mantenimiento y estado de las unidades.'
        }
    });

    console.log(`✅ Department: ${fleetDept.name}`);

    const fleetRoles = [
        { name: 'Encargado de Flota', baseSalary: 70000, extraHourValue: 1000 },
        { name: 'Inspector de Unidades', baseSalary: 40000, extraHourValue: 600 },
        { name: 'Mecánico', baseSalary: 55000, extraHourValue: 800 }
    ];

    for (const role of fleetRoles) {
        await prisma.jobRole.upsert({
            where: {
                tenantId_departmentId_name: {
                    tenantId,
                    departmentId: fleetDept.id,
                    name: role.name
                }
            },
            update: {
                baseSalary: role.baseSalary,
                extraHourValue: role.extraHourValue
            },
            create: {
                tenantId,
                departmentId: fleetDept.id,
                name: role.name,
                baseSalary: role.baseSalary,
                extraHourValue: role.extraHourValue
            }
        });
        console.log(`✅ JobRole: ${role.name}`);
    }

    console.log('🏁 RRHH and Fleet Seeds Completed.');
}

seedRRHH()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
