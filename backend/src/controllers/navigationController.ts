
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Hardcoded mock route for '370' for MVP
// In production this would come from the database (Route table)
const MOCK_ROUTES: Record<string, [number, number][]> = {
    '370': [
        [-34.895, -56.165],
        [-34.896, -56.166],
        [-34.897, -56.168],
        [-34.900, -56.170],
        [-34.905, -56.175],
        [-34.910, -56.180],
        [-34.915, -56.185],
        [-34.920, -56.190]
    ]
};

export const getRoute = async (req: Request, res: Response) => {
    try {
        const { line } = req.params;
        const now = new Date();
        const currentDay = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'][now.getDay()]; // Verify consistency with ENUM
        const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

        console.log(`[Navigation] Getting route for line ${line} at ${currentDay} ${currentTime}`);

        // 1. Get Base Route
        const baseRoute = MOCK_ROUTES[line] || MOCK_ROUTES['370']; // Default to 370 if not found for demo

        // 2. Find Active Planned Detours
        // Need to parse 'affectedLines' JSON/String and 'days'.
        // This is a naive implementation. For prod, use database JSON queries if supported or normalize tables.
        const allDetours = await prisma.plannedDetour.findMany({
            where: {
                isActive: true
            }
        });

        const activeDetours = allDetours.filter(detour => {
            // Check Line
            const lines = detour.affectedLines.includes('[')
                ? JSON.parse(detour.affectedLines)
                : detour.affectedLines.split(',').map(s => s.trim());

            if (!lines.includes(line)) return false;

            // Check Day
            // Assuming 'days' string "LUN,MAR" or JSON
            const days = detour.days.includes('[')
                ? JSON.parse(detour.days)
                : detour.days.split(',').map(s => s.trim());

            if (!days.includes(currentDay)) return false;

            // Check Time (Simple String Comparison HH:MM)
            if (detour.startTime && detour.endTime) {
                return currentTime >= detour.startTime && currentTime <= detour.endTime;
            }

            return true;
        });

        // 3. Return Combined Data
        res.json({
            line,
            baseRoute,
            activeDetours: activeDetours.map(d => ({
                id: d.id,
                name: d.name,
                geometry: JSON.parse(d.geometry) // Ensure it's returned as object
            }))
        });

    } catch (error) {
        console.error('Error fetching route:', error);
        res.status(500).json({ error: 'Failed to fetch route' });
    }
};
