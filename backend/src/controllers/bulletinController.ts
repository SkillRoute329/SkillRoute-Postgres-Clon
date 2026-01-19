
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Existing Methods...
export const saveBulletinEntries = async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).user.tenantId;
        const inspectorId = (req as any).user.id;
        const { date, entries } = req.body;

        if (!date || !Array.isArray(entries)) {
            return res.status(400).json({ message: 'Datos inválidos' });
        }

        const operationDate = new Date(date);

        // Transaction to save all
        const createdEntries = await prisma.$transaction(
            entries.map((e: any) =>
                prisma.bulletinEntry.create({
                    data: {
                        tenantId,
                        inspectorId,
                        date: operationDate,
                        serviceNumber: e.serviceNumber,
                        location: e.location || 'Unknown',
                        scheduledTime: e.scheduledTime,
                        actualTime: e.actualTime,
                        delayMinutes: Number(e.delay || 0),
                        busNumber: e.busNumber,
                        occupancyCount: Number(e.occupancyCount || 0),
                        occupancyLevel: e.occupancy,
                        status: e.status || 'Pending'
                    }
                })
            )
        );

        res.json(createdEntries);
    } catch (error) {
        console.error("Bulletin Save Error:", error);
        res.status(500).json({ message: 'Error al guardar boletín' });
    }
};

export const getMyStats = async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).user.tenantId;
        const userId = (req as any).user.id;

        // 1. Get Shifts assigned to me
        const myShifts = await prisma.shift.findMany({
            where: { tenantId, assignedTo: userId },
            select: { serviceNumber: true, date: true, totalValue: true }
        });

        if (myShifts.length === 0) {
            return res.json({
                avgDelay: 0,
                avgOccupancy: 0,
                totalTrips: 0,
                onTimeRate: 0
            });
        }

        // 2. Find Bulletins matching my services
        // Ideally we would do a join, but let's do simple matching for now
        // Or finding bulletins where serviceNumber IN myShifts.serviceNumber AND date matches
        // This can be heavy if many shifts. Let's limit to last 30 days?

        // Let's get "Global Average" first for comparison? 
        // User asked for "My Space" stats.

        // We need to match precise dates.
        // Prisma doesn't support complex join on non-FK easily. 
        // We will fetch all bulletins for the service numbers involved in the last 30 days.

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentShifts = myShifts.filter(s => new Date(s.date) >= thirtyDaysAgo);
        const serviceNumbers = recentShifts.map(s => s.serviceNumber);

        const bulletins = await prisma.bulletinEntry.findMany({
            where: {
                tenantId,
                date: { gte: thirtyDaysAgo },
                serviceNumber: { in: serviceNumbers },
                actualTime: { not: null } // Only executed ones
            }
        });

        // 3. Match precisely
        const myBulletins = bulletins.filter(b =>
            recentShifts.some(s => s.serviceNumber === b.serviceNumber && new Date(s.date).toDateString() === new Date(b.date).toDateString())
        );

        if (myBulletins.length === 0) {
            return res.json({
                avgDelay: 0,
                avgOccupancy: 0,
                totalTrips: recentShifts.length,
                onTimeRate: 0
            });
        }

        // 4. Calculate Stats
        const totalDelay = myBulletins.reduce((acc, b) => acc + (b.delayMinutes || 0), 0);
        const totalPax = myBulletins.reduce((acc, b) => acc + (b.occupancyCount || 0), 0);
        const onTimeCount = myBulletins.filter(b => (b.delayMinutes || 0) < 5).length; // < 5 min delay is OnTime

        res.json({
            avgDelay: Math.round(totalDelay / myBulletins.length),
            avgOccupancy: Math.round(totalPax / myBulletins.length),
            totalTrips: recentShifts.length,
            onTimeRate: Math.round((onTimeCount / myBulletins.length) * 100)
        });

    } catch (error) {
        console.error("Stats Error:", error);
        res.status(500).json({ message: 'Error retrieving stats' });
    }
};

export const getVehicleStats = async (req: Request, res: Response) => {
    // For Traffic Chief / Admin
    try {
        const tenantId = (req as any).user.tenantId;
        const { carNumber } = req.query;

        if (!carNumber) return res.status(400).json({ message: "Falta número de coche" });

        const bulletins = await prisma.bulletinEntry.findMany({
            where: {
                tenantId,
                busNumber: String(carNumber),
                actualTime: { not: null }
            },
            take: 100, // Last 100 records
            orderBy: { date: 'desc' }
        });

        const totalDelay = bulletins.reduce((acc, b) => acc + (b.delayMinutes || 0), 0);
        const totalPax = bulletins.reduce((acc, b) => acc + (b.occupancyCount || 0), 0);

        res.json({
            avgDelay: bulletins.length ? Math.round(totalDelay / bulletins.length) : 0,
            avgOccupancy: bulletins.length ? Math.round(totalPax / bulletins.length) : 0,
            sampleSize: bulletins.length
        });

    } catch (error) {
        res.status(500).json({ message: 'Error' });
    }
}

// --- NEW SYNC METHODS ---

// 1. Generate Carton FROM Bulletin Logs (Reverse Engineer)
export const generateCartonFromBulletin = async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).user.tenantId;
        const { serviceNumber, date } = req.body; // e.g., '2290', '2026-01-18'

        // 1. Fetch real entries
        const records = await prisma.bulletinEntry.findMany({
            where: {
                tenantId,
                serviceNumber,
                // If date is provided, filter by it, otherwise take latest? 
                // Let's assume precise date for now or use range
                date: date ? new Date(date) : undefined
            },
            orderBy: { scheduledTime: 'asc' } // Or actualTime? Scheduled is safer for structure
        });

        if (records.length === 0) return res.status(404).json({ message: "No se encontraron registros de boletín para generar cartón." });

        // 2. Build Route Data Structure
        // This is tricky because we need to group into rows if it's a cyclic service.
        // For '2290', we know it has structure. 
        // We will attempt to create a "Raw" structure that the user can then edit in AdminCartones.

        // Assumption: Steps are sequential in time.
        // We need to infer headers. If records have 'location', we can collect unique locations in order?
        // No, that puts all locations in headers. A carton typically has H headers and R rows.
        // A single trip (Ida) might touch H headers. 
        // A sequential list of N records might represent R trips over H headers.

        // Heuristic:
        // Group records by 'ScheduledTime' closeness? No.
        // Let's assume the Bulletin Entry order IS the sequence.

        // For the MVP tool requested: We will return a "Suggested" JSON that fits the 'ServiceDefinition' model
        // but perhaps flattened or simple, and let the user refine it.

        const headers = Array.from(new Set(records.map(r => r.location))).map((loc, i) => ({
            id: `h${i + 1}`,
            location: loc,
            isStop: true
        }));

        // This is a naive reconstruction. A better one would be to group by 'Trip ID' if we had it.
        // Since we don't, we will create ONE single row with ALL the times if it fits,
        // OR we try to detect cycles.

        // Let's just return the raw data formatted as a new "Draft" ServiceDefinition
        const newCarton = {
            serviceNumber: serviceNumber + '-DRAFT',
            line: '370', // Placeholder
            variant: `Generado de Boletín ${date || 'Histórico'}`,
            startTime: records[0].actualTime || records[0].scheduledTime,
            endTime: records[records.length - 1].actualTime || records[records.length - 1].scheduledTime,
            routeData: {
                headers: headers,
                rows: [{
                    id: 'r1',
                    times: records.reduce((acc: any, r) => {
                        // Find header id for this location
                        const h = headers.find(h => h.location === r.location);
                        if (h) acc[h.id] = r.actualTime || r.scheduledTime;
                        return acc;
                    }, {})
                }]
            }
        };

        res.json(newCarton);

    } catch (e) {
        console.error(e);
        res.status(500).json({ message: "Error generating carton from bulletin" });
    }
};

// 2. Get Template for Bulletin FROM Carton (Baseline)
export const getBulletinTemplate = async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).user.tenantId;
        const { serviceNumber, seasonId } = req.query; // e.g. 2290

        if (!serviceNumber) return res.status(400).json({ message: "Falta serviceNumber" });

        // Find the active carton
        const carton = await prisma.serviceDefinition.findFirst({
            where: {
                tenantId,
                serviceNumber: String(serviceNumber),
                seasonId: seasonId ? Number(seasonId) : undefined
            }
        });

        if (!carton) return res.status(404).json({ message: "No existe cartón para este servicio" });

        // Parse Route Data to flatten into a sequential list of steps for the Bulletin Form
        const routeData = JSON.parse(carton.routeData);
        // headers: [{id: h1, location: '...'}], rows: [{id: r1, times: {h1: '10:00'}}]

        const steps: any[] = [];

        if (routeData.rows && routeData.headers) {
            routeData.rows.forEach((row: any) => {
                // Iterate headers in order
                routeData.headers.forEach((h: any) => {
                    const time = row.times[h.id];
                    if (time) {
                        steps.push({
                            location: h.location,
                            scheduledTime: time,
                            serviceNumber: carton.serviceNumber,
                            // placeholders
                            actualTime: '',
                            delay: 0,
                            status: 'Pending'
                        });
                    }
                });
            });
        }

        // Sort by time to be safe? usually row order + header order is correct time flow.

        res.json(steps);

    } catch (e) {
        console.error(e);
        res.status(500).json({ message: "Error fetching template" });
    }
};
