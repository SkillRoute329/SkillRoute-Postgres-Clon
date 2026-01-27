
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Simulation Types
interface GPSEvent {
    lat: number;
    lng: number;
    timestamp: Date;
    speed: number;
}

export const SimulateTraffic = async () => {
    console.log("🚦 Starting Traffic Simulation...");

    // 1. Get Active Shifts/Trips
    // In a real scenario, we'd join Shift -> Service -> Trip. 
    // For this mock, we pretend all Shifts have active GPS trackers.
    const shifts = await prisma.shift.findMany({
        where: { status: 'CONFIRMED' },
        take: 50
    });

    if (shifts.length === 0) {
        console.log("⚠️ No active shifts to simulate.");
        return;
    }

    // 2. Generate GPS Positions
    // Clean old positions (mock table usage, assume Radar/RoadAlerts for now or just log)
    // We will use RoadAlerts to simulate "Incidents"

    // Clear old alerts
    await prisma.roadAlert.deleteMany({ where: { type: 'SIMULATION' } });

    let incidents = 0;

    for (const shift of shifts) {
        // Random chance of delay/incident
        if (Math.random() > 0.9) {
            // INCIDENT
            await prisma.roadAlert.create({
                data: {
                    tenant: { connect: { id: 1 } },
                    latitude: -34.89 + (Math.random() * 0.01),
                    longitude: -56.16 + (Math.random() * 0.01),
                    type: 'SIMULATION',
                    description: `Retraso simulado: Coche ${shift.carNumber} en Línea ${shift.line}`,
                    title: `Retraso simulado: Coche ${shift.carNumber}`,
                    isActive: true,
                    createdBy: 1
                }
            });
            incidents++;
        }
    }

    // 3. Driver Performance scoring (Mock)
    // We don't have a DriverPerformance table, so we'll just log or update a custom field on User if needed.
    // For now, we assume this part generates data for the Report.

    console.log(`✅ Simulation Cycle Complete. Generated ${incidents} incidents.`);
};

// Auto-run if called directly
if (require.main === module) {
    SimulateTraffic()
        .then(() => prisma.$disconnect())
        .catch(console.error);
}
