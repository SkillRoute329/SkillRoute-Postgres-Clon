
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Hardcoded mock route strictly for fallback if DB empty
const FALLBACK_ROUTE: [number, number][] = [
    [-34.895, -56.165], [-34.896, -56.166], [-34.897, -56.168], [-34.900, -56.170]
];

export const getRoute = async (req: Request, res: Response) => {
    try {
        const { line } = req.params;
        const now = new Date();
        const currentDay = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'][now.getDay()];
        const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

        console.log(`[Navigation] Getting route for line ${line} at ${currentDay} ${currentTime}`);

        // 1. Get Master Route from DB
        const masterRoute = await prisma.masterRoute.findFirst({
            where: { line: line, isActive: true },
            include: { tariffZones: { orderBy: { order: 'asc' } } }
        });

        const baseRoute = masterRoute ? JSON.parse(masterRoute.geometry) : FALLBACK_ROUTE;
        const tariffZones = (masterRoute?.tariffZones || []).map(tz => ({
            ...tz,
            geometry: tz.geometry ? JSON.parse(tz.geometry) : null
        }));

        // 2. Find Active Planned Detours
        const allDetours = await prisma.plannedDetour.findMany({
            where: { isActive: true }
        });

        const activeDetours = allDetours.filter(detour => {
            // Check Line
            const lines = detour.affectedLines.includes('[')
                ? JSON.parse(detour.affectedLines)
                : detour.affectedLines.split(',').map(s => s.trim());

            if (!lines.includes(line)) return false;

            // Check Day
            const days = detour.days.includes('[')
                ? JSON.parse(detour.days)
                : detour.days.split(',').map(s => s.trim());

            if (!days.includes(currentDay)) return false;

            // Check Time
            if (detour.startTime && detour.endTime) {
                return currentTime >= detour.startTime && currentTime <= detour.endTime;
            }

            return true;
        });

        // 3. Fetch Radars (Optimize with PostGIS later, now fetch all)
        const radars = await prisma.radar.findMany();

        // 4. Return Combined Data
        res.json({
            line,
            origin: masterRoute?.origin || 'Unknown',
            destination: masterRoute?.destination || 'Unknown',
            baseRoute,
            tariffZones,
            radars,
            activeDetours: activeDetours.map(d => ({
                id: d.id,
                name: d.name,
                geometry: JSON.parse(d.geometry)
            }))
        });

    } catch (error) {
        console.error('Error fetching route:', error);
        res.status(500).json({ error: 'Failed to fetch route' });
    }
};

export const forceSeed = async (req: Request, res: Response) => {
    try {
        console.log('--- Debug: Force Seeding Master Routes ---');
        const { seedMasterRoutes } = await import('../seeds/SeedMasterRoutes');
        await seedMasterRoutes();
        res.json({ message: 'Seed de rutas maestras ejecutado con éxito' });
    } catch (error) {
        console.error('Force Seed Error:', error);
        res.status(500).json({ message: 'Error al ejecutar seed de rutas', error: String(error) });
    }
};
