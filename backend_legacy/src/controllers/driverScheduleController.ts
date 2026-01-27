
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, parseISO, format } from 'date-fns';

const prisma = new PrismaClient();

export const getDriverSchedule = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const { month, year, viewMode } = req.query; // viewMode: 'month' | 'week'

        if (!user) return res.status(401).json({ message: 'Unauthorized' });

        const now = new Date();
        const targetYear = year ? Number(year) : now.getFullYear();
        const targetMonth = month ? Number(month) - 1 : now.getMonth();

        let startDate = startOfMonth(new Date(targetYear, targetMonth));
        let endDate = endOfMonth(new Date(targetYear, targetMonth));

        if (viewMode === 'week') {
            const current = new Date();
            startDate = startOfWeek(current, { weekStartsOn: 1 });
            endDate = endOfWeek(current, { weekStartsOn: 1 });
        }

        // 1. Get Shifts for the user in range
        const shifts = await prisma.shift.findMany({
            where: {
                tenantId: user.tenantId,
                assignedTo: user.id,
                date: {
                    gte: startDate,
                    lte: endDate
                },
                // Exclude cancelled?
                status: { not: 'Cancelled' }
            },
            orderBy: {
                date: 'asc'
            }
        });

        // 2. Get Active Season for Metadata lookup (Variant, etc)
        const activeSeason = await prisma.season.findFirst({
            where: { tenantId: user.tenantId, isActive: true }
        });

        // 3. Enhance Data (Soft Join with ServiceDefinition)
        // We fetch all relevant definitions to avoid N+1
        const serviceNumbers = shifts.map(s => s.serviceNumber);
        const definitions = await prisma.serviceDefinition.findMany({
            where: {
                tenantId: user.tenantId,
                seasonId: activeSeason?.id,
                serviceNumber: { in: serviceNumbers }
            }
        });

        const defMap = new Map();
        definitions.forEach(d => {
            // Key by ServiceNumber AND DayType if possible, but Shift table doesn't have dayType explicitly stored usually
            // We'll map by ServiceNumber for now. 
            // IMPROVEMENT: Check if Shift date is Sat/Sun to pick correct definition
            // But for now, simple map by number. If multiple (Habil/Sabado), we might need logic.
            // Let's store an array or Map<ServiceNum, {HABIL: ..., SABADO: ...}>
            if (!defMap.has(d.serviceNumber)) {
                defMap.set(d.serviceNumber, {});
            }
            defMap.get(d.serviceNumber)[d.dayType] = d;
        });

        const enhancedSchedule = shifts.map(s => {
            // Determine DayType of the Shift Date
            const dateObj = new Date(s.date);
            const day = dateObj.getDay(); // 0 = Sun, 6 = Sat
            let dayType = 'HABIL';
            if (day === 0 || isHoliday(dateObj)) dayType = 'DOMINGO';
            else if (day === 6) dayType = 'SABADO';

            const defs = defMap.get(s.serviceNumber) || {};
            // Fallback: Try exact match, then any
            const def = defs[dayType] || Object.values(defs)[0] || {};

            // Determine if AM or PM (Matutino/Vespertino)
            // Simple heuristic: Start time before 13:00 is Matutino
            const hour = parseInt(s.time.split(':')[0] || '0');
            const shiftType = hour < 14 ? 'MATUTINO' : 'VESPERTINO';

            return {
                id: s.id,
                date: s.date,
                dateStr: format(dateObj, 'yyyy-MM-dd'),
                dayOfWeek: format(dateObj, 'EEE'), // Mon, Tue...
                serviceNumber: s.serviceNumber,
                line: s.line,
                startTime: s.time,
                endTime: s.endTime || def.endTime || '?',
                vehicle: s.carNumber, // The actual assigned car in Shift
                variant: def.variant || 'Standard',
                notes: def.routeData ? 'Ver detalle de recorrido...' : '', // Check if routeData exists
                shiftType, // MATUTINO / VESPERTINO
                isHolidays: dayType === 'DOMINGO' // Just flags
            };
        });

        res.json(enhancedSchedule);

    } catch (error) {
        console.error('Driver Schedule Error:', error);
        res.status(500).json({ message: 'Error fetching schedule' });
    }
};

// Helper dummy
function isHoliday(d: Date) {
    return false; // Implement real holiday logic if needed
}
