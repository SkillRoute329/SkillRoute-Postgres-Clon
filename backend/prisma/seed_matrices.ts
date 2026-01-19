
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Helper to add minutes to a time string "HH:MM"
const addMinutes = (time: string, mins: number): string => {
    const [h, m] = time.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m + mins, 0, 0);
    const newH = String(date.getHours()).padStart(2, '0');
    const newM = String(date.getMinutes()).padStart(2, '0');
    return `${newH}:${newM}`;
};

async function main() {
    console.log('🌱 Seeding Service Matrices (Cartones)...');

    // Ensure we have a tenant and season
    const tenant = await prisma.tenant.findFirst() || await prisma.tenant.create({
        data: { name: 'UCOT Demo', slug: 'ucot-demo' }
    });

    const season = await prisma.season.findFirst() || await prisma.season.create({
        data: {
            tenantId: tenant.id,
            name: 'Verano 2026',
            startDate: new Date('2026-01-01'),
            endDate: new Date('2026-03-31')
        }
    });

    // --- LINEA 300 ---
    console.log('Creating Line 300 Matriz...');
    const headers300 = [
        { id: 'h1', location: 'Instrucciones', isStop: true },
        { id: 'h2', location: 'Belloni', isStop: true },
        { id: 'h3', location: 'Intercambiador', isStop: true },
        { id: 'h4', location: '8 de Octubre', isStop: true },
        { id: 'h5', location: 'Tres Cruces', isStop: true },
        { id: 'h6', location: 'Centro', isStop: true },
        { id: 'h7', location: 'Cementerio Central', isStop: true }
    ];

    const rows300 = [];
    let startTime300 = "05:00";
    const travelTimes300 = [0, 10, 25, 35, 50, 60, 70]; // Cumulative minutes

    for (let i = 0; i < 20; i++) {
        const rowTime = addMinutes(startTime300, i * 15);
        const times: any = {};

        headers300.forEach((h, idx) => {
            times[h.id] = addMinutes(rowTime, travelTimes300[idx]);
        });

        rows300.push({ id: `r${i + 1}`, times });
    }

    await prisma.serviceDefinition.upsert({
        where: {
            tenantId_seasonId_serviceNumber: {
                tenantId: tenant.id,
                seasonId: season.id,
                serviceNumber: '300-SD' // Unique Identifier
            }
        },
        update: {}, // Don't duplicate if exists, maybe update? For now keep it safe.
        create: {
            tenantId: tenant.id,
            seasonId: season.id,
            serviceNumber: '300-SD',
            line: '300',
            variant: 'Instrucciones / Cementerio',
            startTime: rows300[0].times['h1'],
            endTime: rows300[rows300.length - 1].times['h7'],
            totalHours: '05:00', // Approx duration sum
            liquidHours: '04:30',
            kilometers: '150',
            routeData: JSON.stringify({
                startLocationDescription: 'Salida de Instrucciones',
                headers: headers300,
                rows: rows300
            })
        }
    });


    // --- LINEA 306 ---
    console.log('Creating Line 306 Matriz...');
    const headers306 = [
        { id: 'h1', location: 'Casabó', isStop: true },
        { id: 'h2', location: 'Terminal Cerro', isStop: true },
        { id: 'h3', location: 'La Teja', isStop: true },
        { id: 'h4', location: 'Paso Molino', isStop: true },
        { id: 'h5', location: 'Centro', isStop: true },
        { id: 'h6', location: 'Pocitos', isStop: true },
        { id: 'h7', location: 'Geant', isStop: true }
    ];

    const rows306 = [];
    let startTime306 = "04:30";
    const travelTimes306 = [0, 15, 25, 35, 60, 80, 110]; // Cumulative minutes

    for (let i = 0; i < 20; i++) {
        const rowTime = addMinutes(startTime306, i * 15);
        const times: any = {};

        headers306.forEach((h, idx) => {
            times[h.id] = addMinutes(rowTime, travelTimes306[idx]);
        });

        rows306.push({ id: `r${i + 1}`, times });
    }

    await prisma.serviceDefinition.upsert({
        where: {
            tenantId_seasonId_serviceNumber: {
                tenantId: tenant.id,
                seasonId: season.id,
                serviceNumber: '306-SD'
            }
        },
        update: {},
        create: {
            tenantId: tenant.id,
            seasonId: season.id,
            serviceNumber: '306-SD',
            line: '306',
            variant: 'Casabó / Geant',
            startTime: rows306[0].times['h1'],
            endTime: rows306[rows306.length - 1].times['h7'],
            totalHours: '06:00',
            liquidHours: '05:20',
            kilometers: '210',
            routeData: JSON.stringify({
                startLocationDescription: 'Salida de Casabó',
                headers: headers306,
                rows: rows306
            })
        }
    });

    console.log('✅ Matrices for 300 and 306 seeded successfully!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
