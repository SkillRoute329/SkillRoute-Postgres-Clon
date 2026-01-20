import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🚀 Iniciando Carga de Boletines de Demostración...');

    let inspector = await prisma.user.findFirst({
        where: { role: 'admin' }
    });

    if (!inspector) {
        inspector = await prisma.user.findFirst({ where: { role: 'SuperAdmin' } });
    }

    if (!inspector) {
        inspector = await prisma.user.findFirst(); // Fallback to ANY user
    }

    if (!inspector) {
        console.error('No se encontró inspector/admin para crear boletines.');
        return;
    }

    const tenantId = inspector.tenantId;
    const today = new Date();

    // Datos Ficticios para Demo
    const boletinesDemo = [
        {
            date: today,
            serviceNumber: "1001",
            location: "Instrucciones",
            scheduledTime: "06:30",
            actualTime: "06:32",
            delayMinutes: 2,
            busNumber: "101",
            occupancyLevel: "LOW",
            status: "Completed"
        },
        {
            date: today,
            serviceNumber: "1100",
            location: "Belloni",
            scheduledTime: "07:15",
            actualTime: "07:15",
            delayMinutes: 0,
            busNumber: "108",
            occupancyLevel: "MEDIUM",
            status: "Completed"
        },
        {
            date: today,
            serviceNumber: "1130",
            location: "Centro",
            scheduledTime: "08:00",
            actualTime: "08:10",
            delayMinutes: 10,
            busNumber: "205",
            occupancyLevel: "HIGH",
            status: "Late"
        }
    ];

    console.log(`📦 Insertando ${boletinesDemo.length} registros de boletín...`);

    for (const entry of boletinesDemo) {
        await prisma.bulletinEntry.create({
            data: {
                tenantId: tenantId,
                inspectorId: inspector.id,
                date: entry.date,
                serviceNumber: entry.serviceNumber,
                location: entry.location,
                scheduledTime: entry.scheduledTime,
                actualTime: entry.actualTime,
                delayMinutes: entry.delayMinutes,
                busNumber: entry.busNumber,
                occupancyLevel: entry.occupancyLevel,
                status: entry.status
            }
        });
    }

    console.log('✅ Carga de Boletines Finalizada.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
