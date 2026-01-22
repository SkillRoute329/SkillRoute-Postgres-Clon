
import axios from 'axios';

// Mock STM API Interface
interface StmBusPosition {
    linea: string;
    empresa: string;
    latitud: number;
    longitud: number;
    timestamp: string;
}

export class StmIntegrationService {
    private static STM_API_URL = process.env.STM_API_URL || 'https://m.montevideo.gub.uy/stmonline/rest/omnibuses';

    /**
     * Fetch positions of a specific line from competitive companies
     * @param line The bus line number (e.g., "306")
     */
    static async fetchCompetitorPositions(line: string): Promise<StmBusPosition[]> {
        console.log(`🕵️ STM_INTEL: Scanning external grid for Line ${line}...`);

        try {
            // Integration Placeholder
            // const response = await axios.get(`${this.STM_API_URL}?linea=${line}`);
            // return response.data;

            // MOCK RESPONSE (For Demo / Development)
            return [
                {
                    linea: line,
                    empresa: "COMPETENCIA_1",
                    latitud: -34.892,
                    longitud: -56.165,
                    timestamp: new Date().toISOString()
                },
                {
                    linea: line,
                    empresa: "COMPETENCIA_2",
                    latitud: -34.895,
                    longitud: -56.170,
                    timestamp: new Date().toISOString()
                }
            ];
        } catch (error) {
            console.error("❌ STM Connect Failed:", error);
            return [];
        }
    }

    static calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
        // Haversine formula stub
        const R = 6371e3; // metres
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lng2 - lng1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }
}
