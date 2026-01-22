
import { PrismaClient } from '@prisma/client';
import { StmIntegrationService } from '../../services/StmIntegrationService'; // Reusing previous logic

const prisma = new PrismaClient();

export class CompetitorTracker {

    // Check for headway conflicts
    // Returns list of alerts generated
    static async checkHeadwayConflict(myBusLocation: { lat: number, lng: number, routeId: string, tripId: string }, competitorLine: string) {
        console.log(`🕵️ INTELLIGENCE: Scanning competition for Route ${myBusLocation.routeId}...`);

        // 1. Fetch competitors
        const rivals = await StmIntegrationService.fetchCompetitorPositions(competitorLine); // e.g. "306"

        const alerts = [];

        for (const rival of rivals) {
            const distance = StmIntegrationService.calculateDistance(
                myBusLocation.lat,
                myBusLocation.lng,
                rival.latitud,
                rival.longitud
            );

            // THREAT DETECTION: < 500m ahead
            if (distance < 500) {
                console.log(`🚨 THREAT DETECTED: ${rival.empresa} Line ${rival.linea} is ${Math.round(distance)}m close!`);

                // Persist Alert (Hybrid JSONB strategy in RoadAlert or Notification)
                // Assuming we use Notification or RoadAlert model
                // For simplicity, let's log to RoadAlert

                /*
                const alert = await prisma.roadAlert.create({
                    data: {
                        routeId: parseInt(myBusLocation.routeId) || undefined, 
                         // ... needs schema alignment
                        type: 'COMPETITION',
                        description: `Competencia (${rival.empresa}) detectada a ${Math.round(distance)}m.`,
                        lat: myBusLocation.lat,
                        lng: myBusLocation.lng,
                        metadata: {
                            strategy: 'RETENCION_ESTRATEGICA',
                            action: 'SLOW_DOWN',
                            target_headway_adjust: '+2min'
                        }
                    }
                });
                alerts.push(alert);
                */
                alerts.push({ type: 'THREAT', distance, rival });
            }
        }
        return alerts;
    }
}
