
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface Suggestion {
    serviceNumber: string;
    line: string;
    location: string;
    scheduledTime: string;
    avgActualTime: string;
    diffMinutes: number;
    sampleSize: number;
    recommendation: string;
    severity: 'High' | 'Medium' | 'Low';
}

export const getOptimizationSuggestions = async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).user.tenantId;
        const { seasonId } = req.query;

        // 1. Get Active Service Definitions (Cartones)
        const whereClause: any = { tenantId };
        if (seasonId) whereClause.seasonId = Number(seasonId);

        const definitions = await prisma.serviceDefinition.findMany({
            where: whereClause
        });

        // 2. Fetch recent Bulletin Entries (Real Data) - Last 60 days
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

        const bulletins = await prisma.bulletinEntry.findMany({
            where: {
                tenantId,
                date: { gte: sixtyDaysAgo },
                status: 'Completed'
            },
            select: {
                serviceNumber: true,
                location: true,
                scheduledTime: true,
                actualTime: true,
                delayMinutes: true,
                occupancyCount: true // Added
            }
        });

        if (bulletins.length === 0) {
            return res.json([]);
        }

        // 3. Analyze
        const suggestions: Suggestion[] = [];
        const groupedByServiceLoc: Record<string, { delays: number[], loads: number[] }> = {};

        const getKey = (svc: string, loc: string, time: string) => `${svc}|${loc}|${time}`;

        // Group actual delays and LOADS
        bulletins.forEach(b => {
            const key = getKey(b.serviceNumber, b.location, b.scheduledTime);
            if (!groupedByServiceLoc[key]) groupedByServiceLoc[key] = { delays: [], loads: [] };

            groupedByServiceLoc[key].delays.push(b.delayMinutes);
            if (b.occupancyCount !== null) groupedByServiceLoc[key].loads.push(b.occupancyCount);
        });

        definitions.forEach(def => {
            let data: any;
            try {
                data = JSON.parse(def.routeData);
            } catch (e) { return; }

            // Normalize stops structure
            if (data.headers && data.rows && Array.isArray(data.rows) && data.rows.length > 0) {
                const headersMap: Record<string, string> = {};
                if (Array.isArray(data.headers)) {
                    data.headers.forEach((h: any) => {
                        if (h.id && h.location) headersMap[h.id] = h.location;
                    });
                }

                data.rows.forEach((row: any) => {
                    if (!row.times) return;

                    Object.keys(row.times).forEach(headerId => {
                        const time = row.times[headerId];
                        const location = headersMap[headerId];
                        if (time && location) {
                            processStop(def, location, time);
                        }
                    });
                });
            }
            else if (Array.isArray(data)) {
                data.forEach((stop: any) => {
                    if (stop.location && stop.time) {
                        processStop(def, stop.location, stop.time);
                    }
                });
            }

            function processStop(def: any, location: string, scheduledTime: string) {
                const key = getKey(def.serviceNumber, location, scheduledTime);
                const stats = groupedByServiceLoc[key];

                if (stats && stats.delays.length >= 3) {
                    const avgDelay = stats.delays.reduce((a, b) => a + b, 0) / stats.delays.length;

                    // Average Load Calculation
                    let avgLoad = 0;
                    if (stats.loads.length > 0) {
                        avgLoad = Math.round(stats.loads.reduce((a, b) => a + b, 0) / stats.loads.length);
                    }

                    // Complex Analysis: Balance Load vs Time
                    // Rule 1: High Load (>50 pax) AND Late (>5 min) => Critical Increase Time
                    // Rule 2: Low Load (<5 pax) AND Early (<-5 min) => Reduce Time significantly
                    // Rule 3: High Load but Early => Efficiency anomaly (maybe rushing?)

                    let recommendation = "";
                    let severity: 'High' | 'Medium' | 'Low' = 'Low';
                    let actionType = 'None';

                    const isLate = avgDelay > 3;
                    const isVeryLate = avgDelay > 10;
                    const isEarly = avgDelay < -3;
                    const isVeryEarly = avgDelay < -10;

                    const isCrowded = avgLoad > 40; // Example threshold
                    const isEmpty = avgLoad < 5;

                    if (isVeryLate) {
                        recommendation = `CRÍTICO: Atraso de ${Math.round(avgDelay)} min. ${isCrowded ? 'Alta carga ralentiza el servicio.' : ''} Sumar ${Math.round(avgDelay)} min al tramo anterior.`;
                        severity = 'High';
                        actionType = 'Increase';
                    } else if (isLate) {
                        recommendation = `Atraso leve (${Math.round(avgDelay)} min). Sumar 2-3 min para compensar.`;
                        severity = 'Medium';
                        actionType = 'Increase';
                    } else if (isVeryEarly) {
                        // If empty and early, reduce time
                        if (isEmpty) {
                            recommendation = `HOLGURA EXCESIVA: ${Math.abs(Math.round(avgDelay))} min de sobra y coche vacío. Quitar tiempo.`;
                            severity = 'High';
                            actionType = 'Decrease';
                        } else {
                            recommendation = `Adelanto excesivo (${Math.abs(Math.round(avgDelay))} min) con carga media. Ajustar espera.`;
                            severity = 'Medium';
                            actionType = 'Decrease';
                        }
                    } else if (isEarly) {
                        recommendation = `Adelanto leve. Ajustar 2 min.`;
                        severity = 'Low';
                        actionType = 'Decrease';
                    }

                    // Only push if there's a recommendation
                    if (recommendation) {
                        suggestions.push({
                            serviceNumber: def.serviceNumber,
                            line: def.line,
                            location: location,
                            scheduledTime: scheduledTime,
                            avgActualTime: `+${Math.round(avgDelay)} min`,
                            diffMinutes: Number(avgDelay.toFixed(1)),
                            sampleSize: stats.delays.length,
                            recommendation,
                            severity,
                            // Extra fields for UI
                            avgLoad: avgLoad,
                            loadStatus: isCrowded ? 'High' : isEmpty ? 'Low' : 'Normal'
                        } as any);
                    }
                }
            }
        });

        // Sort by Severity then Load
        const severityOrder = { 'High': 1, 'Medium': 2, 'Low': 3 };
        suggestions.sort((a, b) => {
            const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
            if (sevDiff !== 0) return sevDiff;
            // Secondary sort by load (High load priority)
            return (b as any).avgLoad - (a as any).avgLoad;
        });

        res.json(suggestions);

    } catch (error) {
        console.error("Optimization Analysis Error:", error);
        res.status(500).json({ message: 'Error al analizar optimizaciones' });
    }
};
