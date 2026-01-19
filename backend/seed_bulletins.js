
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedShort() {
    const tenantId = 1;
    const inspectorId = 1;

    console.log("Seeding bulletins for Service 2290 at Pya.Cerro/Tnal...");

    // Match: Service 2290, Location "Pya.Cerro/Tnal", Scheduled "06:15"
    // Scenario: Real arrival 06:30 (+15 min delay)

    const entries = [
        { date: new Date(), delay: 15, actual: '06:30' },
        { date: new Date(Date.now() - 86400000), delay: 13, actual: '06:28' },
        { date: new Date(Date.now() - 172800000), delay: 14, actual: '06:29' }
    ];

    for (const entry of entries) {
        await prisma.bulletinEntry.create({
            data: {
                tenantId,
                inspectorId,
                date: entry.date,
                serviceNumber: '2290',
                location: 'Pya.Cerro/Tnal', // Match header h1
                scheduledTime: '06:15',     // Match row.times.h1
                actualTime: entry.actual,
                delayMinutes: entry.delay,
                status: 'Completed'
            }
        });
    }

    console.log('✅ Seeded 3 delayed bulletins properly.');
}

seedShort()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
