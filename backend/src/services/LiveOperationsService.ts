
import { PrismaClient } from '@prisma/client';
import { StmIntegrationService } from './StmIntegrationService';

const prisma = new PrismaClient();

export class LiveOperationsService {

    // Get internal and external services near a location
    static async getServicesAtPoint(lat: number, lng: number, radius = 1000) {
        console.log(`📡 OPS: Scanning Traffic near ${lat}, ${lng}...`);

        // 1. Fetch our active trips (Mocking internal fleet for now)
        // In reality: query Redis or spatial DB
        const myFleet = [
            { id: 'trip-101', carNumber: '101', line: '300', lat: lat + 0.001, lng: lng + 0.001 }
        ];

        // 2. Fetch competitors
        // Assume we scan for lines that compete with 300 (e.g. 306)
        const competitors = await StmIntegrationService.fetchCompetitorPositions("306");

        const nearbyCompetitors = competitors.filter(c => {
            const dist = StmIntegrationService.calculateDistance(lat, lng, c.latitud, c.longitud);
            return dist < radius;
        });

        // 3. Enrich internal fleet data with threats
        const fleetWithIntel = myFleet.map(bus => {
            // Check if any competitor is close to this bus
            const threats = nearbyCompetitors.filter(c =>
                StmIntegrationService.calculateDistance(bus.lat, bus.lng, c.latitud, c.longitud) < 500
            );

            return {
                ...bus,
                competitor_detected: threats.length > 0,
                threat_details: threats.length > 0 ? threats[0] : null
            };
        });

        return {
            internal: fleetWithIntel,
            external: nearbyCompetitors
        };
    }

    static async authorizeAdjustment(tripId: string, minutes: number, inspectorId: string, reason: string) {
        console.log(`👮 OPS: Inspector ${inspectorId} authorizing adjustment of ${minutes}m for Trip ${tripId}`);

        // 1. Persist the Order
        const event = await prisma.controlEvent.create({
            data: {
                tripId,
                inspectorId,
                type: minutes > 0 ? 'REGULATION_PLUS' : 'REGULATION_MINUS',
                minutes,
                reason,
                metadata: { authorized_at: new Date() }
            }
        });

        // 2. Apply Logic (Update Trip Schedule downstream)
        // This is where we would update the realtime ETA system

        return event;
    }
}
