
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class DriverScoreService {

    static async calculateScoreWithProtection(driverId: string, tripId: string, metrics: { punctuality: number, ecoDriving: number, attendance: number }) {
        console.log(`⚖️ HR_JUSTICE: Calculating Score for Driver ${driverId} (Trip ${tripId})...`);

        // 1. Check for Inspector Orders (Immunization)
        const authorizedEvent = await prisma.controlEvent.findFirst({
            where: { tripId: tripId }
        });

        let finalPunctuality = metrics.punctuality;

        if (authorizedEvent) {
            console.log("🛡️ IMMUNITY: Inspector Order detected. Neutralizing delay penalty.");
            // If punctuality was bad (late), we forgive it.
            // If they were -5m late but authorized -5m, then efficiency is effectively 100% relative to new plan.
            finalPunctuality = 100;
        }

        // 2. Standard Calculation
        // (Puntualidad * 0.5) + (EcoDriving * 0.3) + (Presentismo * 0.2)
        const score = (finalPunctuality * 0.5) + (metrics.ecoDriving * 0.3) + (metrics.attendance * 0.2);

        return {
            score: Math.round(score * 100) / 100,
            immunized: !!authorizedEvent,
            event: authorizedEvent
        };
    }
}
