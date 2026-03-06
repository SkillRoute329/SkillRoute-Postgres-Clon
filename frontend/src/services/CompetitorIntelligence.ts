import { TrafficService } from './trafficService';

export interface CompetitorThreat {
  detected: boolean;
  competitorLine?: string;
  gapMinutes?: number;
  distance?: number;
  recommendation?: 'DELAY' | 'SPEED_UP' | 'ON_TIME';
  message: string;
}

const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371e3; // metres
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Map of UCOT lines to their main competitors
const COMPETITOR_MAP: Record<string, string[]> = {
  '300': ['103', '110'],
  '306': ['185', '76'],
  '316': ['100', '103'],
  '328': ['102', '106'],
  CE1: ['121', '116'],
};

export const checkCompetitorProximity = async (
  lineId: string,
  lat: number,
  lng: number,
): Promise<CompetitorThreat> => {
  const cleanLine = lineId.replace(/[ab]$/i, '');
  const rivals = COMPETITOR_MAP[cleanLine] || [];

  if (rivals.length === 0) {
    return { detected: false, message: '✅ No hay competencia crítica definida para esta línea.' };
  }

  try {
    const positions = await TrafficService.fetchCompetitorPositions(rivals);

    let nearest: any = null;
    let minDistance = Infinity;

    positions.forEach((bus: any) => {
      const dist = calculateDistance(lat, lng, bus.latitud, bus.longitud);
      // Only care if it's "close" (e.g. < 1km)
      if (dist < 1000 && dist < minDistance) {
        minDistance = dist;
        nearest = bus;
      }
    });

    if (nearest) {
      const gapMins = Math.round(minDistance / 300); // Rough estimate: 300m per minute in traffic
      const isAhead = true; // For now we assume they are ahead if detected close

      return {
        detected: true,
        competitorLine: nearest.linea,
        distance: Math.round(minDistance),
        gapMinutes: gapMins,
        recommendation: gapMins < 3 ? 'DELAY' : 'ON_TIME',
        message: `⚠️ Competencia (${nearest.empresa} ${nearest.linea}) a ${Math.round(minDistance)}m. Brécha est: ${gapMins} min.`,
      };
    }

    return { detected: false, message: '✅ Vía libre. Sin competencia cercana detectada.' };
  } catch (e) {
    console.error('Competitor Intel Error', e);
    return { detected: false, message: '⚠️ Error al escanear competencia.' };
  }
};
