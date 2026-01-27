import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEPARTMENTS = [
    { name: 'Transito', description: 'Realiza modificaciones en los servicios, horarios, etapas' },
    { name: 'Distribucion', description: 'Distribuye los turnos por sistema o realiza reasignaciones manuales' },
    { name: 'Taller', description: 'Mantenimiento mecanico' },
    { name: 'Electricidad', description: 'Mantenimiento electrico' },
    { name: 'Carroseria', description: 'Mantenimiento carroceria' },
    { name: 'Gomeria', description: 'Mantenimiento neumaticos' }
];

async function main() {
    console.log('Seeding departments...');
    for (const dep of DEPARTMENTS) {
        // Check if it exists
        // Note: We use findFirst to avoid TS errors if the unique compound index isn't recognized by the linter yet
        const exists = await prisma.department.findFirst({
            where: {
                tenantId: 1,
                name: dep.name
            }
        });

        if (!exists) {
            await prisma.department.create({
                data: {
                    name: dep.name,
                    description: dep.description,
                    tenantId: 1
                }
            });
            console.log(`Created department: ${dep.name}`);
        } else {
            console.log(`Department already exists: ${dep.name}`);
        }
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
