import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Seeding Rotation & Fleet Data ---');

    const tenantId = 1;

    // 1. Create Vehicles
    const v101 = await prisma.vehicle.upsert({
        where: { tenantId_internalNumber: { tenantId, internalNumber: '101' } },
        update: {},
        create: {
            tenantId,
            internalNumber: '101',
            plate: 'STP 1101',
            make: 'Yutong',
            model: 'ZK6128BEVG',
            year: 2024,
            status: 'OPERATIONAL'
        }
    });

    const v102 = await prisma.vehicle.upsert({
        where: { tenantId_internalNumber: { tenantId, internalNumber: '102' } },
        update: {},
        create: {
            tenantId,
            internalNumber: '102',
            plate: 'STP 1102',
            make: 'Yutong',
            model: 'ZK6128BEVG',
            year: 2024,
            status: 'OPERATIONAL'
        }
    });

    console.log('Vehicles created.');

    // 2. Create Drivers
    const passHash = await bcrypt.hash('user123', 10);

    const driver1 = await prisma.user.upsert({
        where: { tenantId_internalNumber: { tenantId, internalNumber: '329' } },
        update: { assignedVehicleId: v101.id, driverType: 'FIXED' },
        create: {
            tenantId,
            internalNumber: '329',
            firstName: 'Carlos',
            lastName: 'Rodriguez',
            fullName: 'Carlos Rodriguez',
            passwordHash: passHash,
            role: 'User',
            driverType: 'FIXED',
            assignedVehicleId: v101.id
        }
    });

    const driver2 = await prisma.user.upsert({
        where: { tenantId_internalNumber: { tenantId, internalNumber: '330' } },
        update: { assignedVehicleId: v102.id, driverType: 'FIXED' },
        create: {
            tenantId,
            internalNumber: '330',
            firstName: 'Ana',
            lastName: 'Lopez',
            fullName: 'Ana Lopez',
            passwordHash: passHash,
            role: 'User',
            driverType: 'FIXED',
            assignedVehicleId: v102.id
        }
    });

    console.log('Drivers created and assigned to vehicles.');

    // 3. Create Season
    const season = await prisma.season.upsert({
        where: { id: 1 }, // Just a fixed ID for simplicity in testing
        update: {},
        create: {
            id: 1,
            tenantId,
            name: 'Verano 2026',
            startDate: new Date('2026-01-01'),
            isActive: true
        }
    });

    console.log('Season created.');

    // 4. Create Service Definitions (Cartones)
    const carton2290 = await prisma.serviceDefinition.upsert({
        where: { tenantId_seasonId_serviceNumber: { tenantId, seasonId: season.id, serviceNumber: '2290' } },
        update: {},
        create: {
            tenantId,
            seasonId: season.id,
            serviceNumber: '2290',
            line: '370',
            variant: 'Habiles',
            startTime: '04:25',
            endTime: '20:24',
            routeData: JSON.stringify({
                headers: [{ location: 'Tnal Cerro' }, { location: 'Portones' }],
                rows: [{ times: { h1: '06:15', h2: '07:58' } }]
            })
        }
    });

    const carton2291 = await prisma.serviceDefinition.upsert({
        where: { tenantId_seasonId_serviceNumber: { tenantId, seasonId: season.id, serviceNumber: '2291' } },
        update: {},
        create: {
            tenantId,
            seasonId: season.id,
            serviceNumber: '2291',
            line: '370',
            variant: 'Habiles',
            startTime: '05:30',
            endTime: '21:15',
            routeData: JSON.stringify({
                headers: [{ location: 'Tnal Cerro' }, { location: 'Portones' }],
                rows: [{ times: { h1: '05:30', h2: '07:15' } }]
            })
        }
    });

    console.log('Service definitions created.');

    // 5. Create Rotation Scheme
    const rotation = await prisma.rotationScheme.upsert({
        where: { id: 1 },
        update: {},
        create: {
            id: 1,
            tenantId,
            seasonId: season.id,
            name: 'Rotación Linea 370',
            frequency: 'Weekly',
            daysOfWeek: 'Mon-Sun',
            cycleLength: 2,
            sequenceData: JSON.stringify([
                { step: 1, serviceNumber: '2290' },
                { step: 2, serviceNumber: '2291' }
            ])
        }
    });

    console.log('Rotation scheme created.');
    console.log('--- Seed Completed ---');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
