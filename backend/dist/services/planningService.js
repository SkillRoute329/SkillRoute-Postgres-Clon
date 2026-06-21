"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.planningService = exports.PlanningService = exports.MONTEVIDEO_BARRIOS = void 0;
// 11 barrios clave de Montevideo con límites aproximados y datos demográficos realistas
exports.MONTEVIDEO_BARRIOS = [
    {
        nombre: 'Ciudad Vieja',
        population: 14000,
        avgIncome: 45000,
        avgAge: 39,
        povertyRate: 5.0,
        polygon: [
            [-34.9080, -56.2150],
            [-34.9040, -56.2100],
            [-34.9060, -56.1950],
            [-34.9120, -56.2000]
        ]
    },
    {
        nombre: 'Centro',
        population: 45000,
        avgIncome: 58000,
        avgAge: 41,
        povertyRate: 2.5,
        polygon: [
            [-34.9060, -56.1950],
            [-34.9000, -56.1900],
            [-34.9020, -56.1800],
            [-34.9080, -56.1850]
        ]
    },
    {
        nombre: 'Tres Cruces',
        population: 28000,
        avgIncome: 62000,
        avgAge: 38,
        povertyRate: 3.0,
        polygon: [
            [-34.8980, -56.1680],
            [-34.8920, -56.1640],
            [-34.8940, -56.1550],
            [-34.9000, -56.1600]
        ]
    },
    {
        nombre: 'Pocitos',
        population: 112000,
        avgIncome: 110000,
        avgAge: 43,
        povertyRate: 1.0,
        polygon: [
            [-34.9150, -56.1550],
            [-34.9050, -56.1500],
            [-34.9080, -56.1350],
            [-34.9180, -56.1420]
        ]
    },
    {
        nombre: 'Carrasco',
        population: 30000,
        avgIncome: 165000,
        avgAge: 40,
        povertyRate: 0.5,
        polygon: [
            [-34.8950, -56.0400],
            [-34.8850, -56.0350],
            [-34.8880, -56.0200],
            [-34.8980, -56.0250]
        ]
    },
    {
        nombre: 'Cerro',
        population: 85000,
        avgIncome: 22000,
        avgAge: 31,
        povertyRate: 19.5,
        polygon: [
            [-34.8950, -56.2700],
            [-34.8850, -56.2650],
            [-34.8880, -56.2500],
            [-34.8980, -56.2550]
        ]
    },
    {
        nombre: 'Casavalle',
        population: 78000,
        avgIncome: 19500,
        avgAge: 28,
        povertyRate: 26.0,
        polygon: [
            [-34.8300, -56.1700],
            [-34.8150, -56.1650],
            [-34.8180, -56.1500],
            [-34.8330, -56.1550]
        ]
    },
    {
        nombre: 'La Teja',
        population: 40000,
        avgIncome: 26000,
        avgAge: 34,
        povertyRate: 13.0,
        polygon: [
            [-34.8750, -56.2300],
            [-34.8650, -56.2250],
            [-34.8680, -56.2100],
            [-34.8780, -56.2150]
        ]
    },
    {
        nombre: 'Unión',
        population: 65000,
        avgIncome: 36000,
        avgAge: 36,
        povertyRate: 8.5,
        polygon: [
            [-34.8800, -56.1450],
            [-34.8700, -56.1400],
            [-34.8720, -56.1250],
            [-34.8820, -56.1300]
        ]
    },
    {
        nombre: 'Paso de la Arena',
        population: 48000,
        avgIncome: 23500,
        avgAge: 32,
        povertyRate: 16.0,
        polygon: [
            [-34.8600, -56.2900],
            [-34.8450, -56.2850],
            [-34.8480, -56.2700],
            [-34.8630, -56.2750]
        ]
    },
    {
        nombre: 'Malvín',
        population: 52000,
        avgIncome: 88000,
        avgAge: 39,
        povertyRate: 2.0,
        polygon: [
            [-34.8980, -56.1150],
            [-34.8880, -56.1100],
            [-34.8900, -56.0950],
            [-34.9000, -56.1000]
        ]
    }
];
class PlanningService {
    /**
     * Algoritmo Ray-Casting para determinar si un punto lat/lng está dentro de un polígono
     */
    isPointInPolygon(point, polygon) {
        const x = point.lng;
        const y = point.lat;
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i][1];
            const yi = polygon[i][0];
            const xj = polygon[j][1];
            const yj = polygon[j][0];
            const intersect = ((yi > y) !== (yj > y)) &&
                (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
            if (intersect)
                inside = !inside;
        }
        return inside;
    }
    /**
     * Calcula la distancia de Haversine en kilómetros entre dos puntos
     */
    haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Radio de la Tierra en km
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLon = (lon2 - lon1) * (Math.PI / 180);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * (Math.PI / 180)) *
                Math.cos(lat2 * (Math.PI / 180)) *
                Math.sin(dLon / 2) *
                Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
    /**
     * Calcula la longitud total de un trazado en km
     */
    calculateRouteLength(points) {
        let totalLength = 0;
        for (let i = 0; i < points.length - 1; i++) {
            totalLength += this.haversineDistance(points[i].lat, points[i].lng, points[i + 1].lat, points[i + 1].lng);
        }
        return totalLength;
    }
    /**
     * Identifica los barrios cruzados por la ruta (ya sea por trazado o por paradas)
     */
    getCrossedBarrios(points, paradas) {
        const crossed = new Set();
        // Verificar las paradas
        for (const stop of paradas) {
            if (stop.lat === 0 || stop.lng === 0)
                continue;
            const found = exports.MONTEVIDEO_BARRIOS.find((barrio) => this.isPointInPolygon({ lat: stop.lat, lng: stop.lng }, barrio.polygon));
            if (found) {
                crossed.add(found);
            }
        }
        // Verificar puntos clave del recorrido por si no hay paradas en esa zona pero sí pasa la línea
        for (let i = 0; i < points.length; i += Math.max(1, Math.floor(points.length / 20))) {
            const pt = points[i];
            const found = exports.MONTEVIDEO_BARRIOS.find((barrio) => this.isPointInPolygon(pt, barrio.polygon));
            if (found) {
                crossed.add(found);
            }
        }
        // Si está vacío (línea no entra en polígonos estrictos), asociar el más cercano a las paradas
        if (crossed.size === 0 && paradas.length > 0) {
            const firstStop = paradas[0];
            let minDistance = Infinity;
            let closestBarrio = null;
            for (const barrio of exports.MONTEVIDEO_BARRIOS) {
                // Calcular distancia al primer vértice del polígono
                const d = this.haversineDistance(firstStop.lat, firstStop.lng, barrio.polygon[0][0], barrio.polygon[0][1]);
                if (d < minDistance) {
                    minDistance = d;
                    closestBarrio = barrio;
                }
            }
            if (closestBarrio) {
                crossed.add(closestBarrio);
            }
        }
        return Array.from(crossed);
    }
    /**
     * Ejecuta el análisis de equidad de la ruta
     */
    analyzeEquity(points, paradas, frecuenciaDiaria) {
        const crossed = this.getCrossedBarrios(points, paradas);
        if (crossed.length === 0) {
            return {
                crossedBarrios: [],
                socialCoverageIndex: 0, // %
                avgIncomeServed: 0,
                accessibilityScore: 0,
                disproportionateImpact: 'Bajo impacto',
                equityScore: 50,
                explanation: 'Sin cobertura de red detectada.'
            };
        }
        const lowIncomeBarrios = crossed.filter(b => b.avgIncome < 30000 || b.povertyRate > 10.0);
        const highIncomeBarrios = crossed.filter(b => b.avgIncome >= 30000 && b.povertyRate <= 10.0);
        const socialCoverageIndex = Math.round((lowIncomeBarrios.length / Math.max(1, lowIncomeBarrios.length + highIncomeBarrios.length)) * 100);
        const avgIncomeServed = Math.round(crossed.reduce((acc, curr) => acc + curr.avgIncome, 0) / crossed.length);
        // Calcular accesibilidad aproximada en minutos a áreas centrales
        // Cuanto más cerca esté de Centro (-34.902, -56.185) y Tres Cruces (-34.895, -56.160), mejor
        let avgDistToCenter = 0;
        crossed.forEach(b => {
            const dist1 = this.haversineDistance(b.polygon[0][0], b.polygon[0][1], -34.902, -56.185);
            const dist2 = this.haversineDistance(b.polygon[0][0], b.polygon[0][1], -34.895, -56.160);
            avgDistToCenter += Math.min(dist1, dist2);
        });
        avgDistToCenter = avgDistToCenter / crossed.length;
        // Accesibilidad index de 0 a 100 (inversa a distancia, max 15km)
        const accessibilityScore = Math.max(10, Math.min(100, Math.round(100 - (avgDistToCenter / 15) * 90)));
        // Determinar Impacto Desproporcionado (Title VI adaptado)
        // Si la ruta no cubre zonas vulnerables pero tiene alta frecuencia, puede haber desatención
        let disproportionateImpact = 'Bajo impacto';
        let equityScore = 50;
        let explanation = 'La distribución del servicio cubre tanto áreas de ingresos medios como bajos sin desbalances significativos.';
        if (socialCoverageIndex < 20 && frecuenciaDiaria > 60) {
            disproportionateImpact = 'Crítico (Exclusión)';
            equityScore = 25;
            explanation = 'Alta frecuencia concentrada exclusivamente en zonas de altos ingresos. Posible brecha de servicio para poblaciones vulnerables.';
        }
        else if (socialCoverageIndex >= 50) {
            disproportionateImpact = 'Favorable (Mitigación)';
            equityScore = 85;
            explanation = 'Excelente cobertura de zonas de bajos ingresos y alta vulnerabilidad. Contribuye activamente a la reducción de desiertos de tránsito.';
        }
        else if (socialCoverageIndex > 30) {
            disproportionateImpact = 'Neutral';
            equityScore = 65;
            explanation = 'La red atiende de forma equilibrada a sectores de menores recursos, cumpliendo estándares metropolitanos.';
        }
        return {
            crossedBarrios: crossed.map(b => ({
                nombre: b.nombre,
                population: b.population,
                avgIncome: b.avgIncome,
                avgAge: b.avgAge,
                povertyRate: b.povertyRate
            })),
            socialCoverageIndex,
            avgIncomeServed,
            accessibilityScore,
            disproportionateImpact,
            equityScore,
            explanation
        };
    }
    /**
     * Calcula el simulador financiero en tiempo real
     */
    calculateFinancialImpact(points, paradas, frecuenciaDiaria, costoKmOperativo = 90, // UYU por km
    tarifaUrbana = 56 // UYU por boleto
    ) {
        const lengthKm = this.calculateRouteLength(points);
        const dailyKm = lengthKm * frecuenciaDiaria;
        const dailyCost = dailyKm * costoKmOperativo;
        const monthlyCost = dailyCost * 22; // Asumiendo 22 días hábiles de alta operatividad
        // Calcular pasajeros diarios estimados a partir de los barrios cruzados
        const crossed = this.getCrossedBarrios(points, paradas);
        let totalPotentialRiders = 0;
        crossed.forEach((barrio) => {
            // Los barrios de bajos ingresos tienen un factor multiplicador más alto para el transporte público
            const povertyFactor = barrio.povertyRate / 100 * 1.8 + 0.15;
            totalPotentialRiders += barrio.population * povertyFactor;
        });
        // Pasajeros diarios son una porción de los potenciales por frecuencia (máximo 80 pasajeros promedio por coche-viaje)
        const passengerRatio = 0.00065; // ratio de captura metropolitana
        const rawDailyPassengers = totalPotentialRiders * passengerRatio * frecuenciaDiaria;
        const dailyPassengers = Math.round(Math.min(frecuenciaDiaria * 80, Math.max(frecuenciaDiaria * 5, rawDailyPassengers)));
        const dailyRevenue = dailyPassengers * tarifaUrbana;
        const monthlyRevenue = dailyRevenue * 22;
        const netDailyIncome = dailyRevenue - dailyCost;
        const netMonthlyIncome = monthlyRevenue - monthlyCost;
        const roi = dailyCost > 0 ? (netDailyIncome / dailyCost) * 100 : 0;
        return {
            lengthKm: Number(lengthKm.toFixed(2)),
            dailyKm: Number(dailyKm.toFixed(2)),
            dailyCost: Math.round(dailyCost),
            monthlyCost: Math.round(monthlyCost),
            dailyPassengers,
            dailyRevenue: Math.round(dailyRevenue),
            monthlyRevenue: Math.round(monthlyRevenue),
            netDailyIncome: Math.round(netDailyIncome),
            netMonthlyIncome: Math.round(netMonthlyIncome),
            roi: Number(roi.toFixed(1))
        };
    }
}
exports.PlanningService = PlanningService;
exports.planningService = new PlanningService();
