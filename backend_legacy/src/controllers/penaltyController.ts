
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Get configured rules
export const getPenaltyRules = async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).user?.tenantId || 1;
        const rules = await prisma.penaltyRule.findMany({
            where: { tenantId, isActive: true }
        });
        res.json(rules);
    } catch (e) {
        res.status(500).json({ message: "Error fetching rules" });
    }
};

// Create or update a rule
export const savePenaltyRule = async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).user?.tenantId || 1;
        const { id, name, type, threshold, maxCount, periodDays, action, actionDuration } = req.body;

        if (id) {
            const updated = await prisma.penaltyRule.update({
                where: { id: Number(id) },
                data: { name, type, threshold, maxCount, periodDays, action, actionDuration }
            });
            res.json(updated);
        } else {
            const created = await prisma.penaltyRule.create({
                data: { tenantId, name, type, threshold, maxCount, periodDays, action, actionDuration }
            });
            res.json(created);
        }
    } catch (e) {
        res.status(500).json({ message: "Error saving rule" });
    }
};

export const deletePenaltyRule = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await prisma.penaltyRule.update({
            where: { id: Number(id) },
            data: { isActive: false }
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ message: "Error deleting rule" });
    }
};

// Analyze "Red Numbers" (Users who violated rules)
export const getRedNumbers = async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).user?.tenantId || 1;

        // 1. Get all active rules
        const rules = await prisma.penaltyRule.findMany({
            where: { tenantId, isActive: true }
        });

        // 2. Prepare result list
        const redList: any[] = [];

        // 3. Iterate rules and check violations (Simplified logic for MVP)
        // Ideally we should use raw SQL or aggregations for performance
        for (const rule of rules) {
            const periodStart = new Date();
            periodStart.setDate(periodStart.getDate() - rule.periodDays);

            // Find bulletin entries matching criteria
            // Example: EarlyArrival (ADELANTO) means actualTime < scheduledTime by X minutes

            // Since bulletin logic is complex with time strings "HH:MM", we will fetch basic stats for now
            // Or filter by delayMinutes (if negative = early).

            if (rule.type === 'EarlyArrival') {
                // delayMinutes < -threshold
                const violators = await prisma.bulletinEntry.groupBy({
                    by: ['inspectorId'], // Assuming inspectorId maps to Driver here, or we need driverId
                    where: {
                        tenantId,
                        date: { gte: periodStart },
                        delayMinutes: { lte: -rule.threshold } // e.g. -5 (5 min adelanto)
                    },
                    _count: {
                        id: true
                    },
                    having: {
                        id: {
                            _count: { gte: rule.maxCount }
                        }
                    }
                });

                for (const v of violators) {
                    const user = await prisma.user.findUnique({ where: { id: v.inspectorId } }); // Mapping inspector as driver for now
                    if (user) {
                        redList.push({
                            userId: user.id,
                            userName: user.fullName,
                            ruleName: rule.name,
                            count: v._count.id,
                            type: rule.type
                        });
                    }
                }
            }

            // Late Arrival
            if (rule.type === 'LateArrival') {
                const violators = await prisma.bulletinEntry.groupBy({
                    by: ['inspectorId'],
                    where: {
                        tenantId,
                        date: { gte: periodStart },
                        delayMinutes: { gte: rule.threshold }
                    },
                    _count: { id: true },
                    having: { id: { _count: { gte: rule.maxCount } } }
                });

                for (const v of violators) {
                    const user = await prisma.user.findUnique({ where: { id: v.inspectorId } });
                    if (user) {
                        redList.push({
                            userId: user.id,
                            userName: user.fullName,
                            ruleName: rule.name,
                            count: v._count.id,
                            type: rule.type
                        });
                    }
                }
            }
        }

        res.json(redList);

    } catch (e) {
        console.error(e);
        res.status(500).json({ message: "Error calculating red numbers" });
    }
};

// Get Penalties (History)
export const getPenalties = async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).user?.tenantId || 1;
        const penalties = await prisma.userPenalty.findMany({
            where: { tenantId },
            include: { user: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(penalties);
    } catch (e) {
        res.status(500).json({ message: "Error fetching penalties" });
    }
};

export const createPenalty = async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).user?.tenantId || 1;
        const { userId, reason, type, durationDays, notes } = req.body;

        const penalty = await prisma.userPenalty.create({
            data: {
                tenantId,
                userId: Number(userId),
                reason,
                type,
                durationDays: Number(durationDays),
                notes
            }
        });
        res.json(penalty);
    } catch (e) {
        res.status(500).json({ message: "Error creating penalty" });
    }
};
