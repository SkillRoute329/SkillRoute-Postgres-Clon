import { apiClient } from '../clients/apiClient';

export type AlertType = 'ACCIDENT' | 'TRAFFIC' | 'POLICE' | 'DETOUR' | 'WEATHER' | 'OTHER';

export interface TrafficAlert {
  id?: string;
  type: AlertType;
  lat: number;
  lng: number;
  description: string;
  reportedBy: string; // User ID
  reportedAt: string; // ISO timestamp
  expiresAt: string; // ISO timestamp
  line?: string; // Optional: Specific to a line
}

export const TrafficService = {
  // Report a new alert
  reportAlert: async (alert: Omit<TrafficAlert, 'id' | 'reportedAt' | 'expiresAt'>) => {
    try {
      const now = new Date();
      const expiration = new Date(now.getTime() + 2 * 60 * 60 * 1000); // Expires in 2 hours by default

      await apiClient.post('/api/db/traffic_alerts', {
        ...alert,
        reportedAt: now.toISOString(),
        expiresAt: expiration.toISOString(),
      });
      return true;
    } catch (e) {
      console.error('Error reporting alert', e);
      return false;
    }
  },

  // Get Active Alerts
  getActiveAlerts: async () => {
    try {
      const now = new Date().toISOString();
      const raw = await apiClient.get('/api/db/traffic_alerts', {
        query: { where: `expiresAt>${now}`, orderBy: 'expiresAt:desc', limit: 500 },
      }) as any[];
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  // BROADCAST POSITION (For Admin Fleet View)
  broadcastPosition: async (
    uid: string,
    line: string,
    lat: number,
    lng: number,
    speed: number,
    heading: number,
  ) => {
    try {
      await apiClient.put('/api/db/fleet_positions/' + encodeURIComponent(uid), {
        line,
        lat,
        lng,
        speed,
        heading,
        lastUpdate: new Date().toISOString(),
        status: 'ONLINE',
      });
    } catch (e) {
      console.error('GPS Broadcast Error', e);
    }
  },

  // FETCH COMPETITOR POSITIONS
  fetchCompetitorPositions: async (lines: string[]): Promise<any[]> => {
    try {
      const response = await fetch('/api/positions');
      if (!response.ok) {
        throw new Error(`API positions error: ${response.status}`);
      }
      const data = await response.json();
      if (!data || !data.buses) return [];

      const cleanLines = lines.map((l) => l.toString().replace(/[ab]$/i, ''));
      const activeRivals = data.buses.filter((b: any) =>
        cleanLines.includes(String(b.linea).replace(/[ab]$/i, '')),
      );

      return activeRivals.map((b: any) => ({
        id: String(b.codigoBus || b.idBus),
        codigoLinea: String(b.linea),
        linea: String(b.linea),
        latitud: Number(b.lat),
        longitud: Number(b.lng),
        lat: Number(b.lat),
        lng: Number(b.lng),
        heading: 0,
        empresa: b.empresa,
      }));
    } catch (e) {
      console.error('Competitor Fetch Error', e);
      return [];
    }
  },

  // FETCH UCOT REAL POSITIONS VIA IMM API
  fetchUcotPositions: async (lines: string[]): Promise<any[]> => {
    try {
      const response = await fetch('/api/positions');
      if (!response.ok) {
        throw new Error(`API positions error: ${response.status}`);
      }
      const data = await response.json();
      if (!data || !data.buses) return [];

      const cleanLines = lines.map((l) => l.toString().replace(/[ab]$/i, ''));
      const activeUcot = data.buses.filter((b: any) =>
        b.empresaId === 70 && cleanLines.includes(String(b.linea).replace(/[ab]$/i, '')),
      );

      return activeUcot.map((b: any) => ({
        id: String(b.codigoBus || b.idBus),
        codigoLinea: String(b.linea),
        linea: String(b.linea),
        latitud: Number(b.lat),
        longitud: Number(b.lng),
        lat: Number(b.lat),
        lng: Number(b.lng),
        heading: 0,
        empresa: 'UCOT',
      }));
    } catch (e) {
      console.error('UCOT Proxy Fetch Error', e);
      return [];
    }
  },

  // FETCH UCOT REAL FLEET POSITIONS
  fetchFleetPositions: async (lines: string[]): Promise<any[]> => {
    if (!lines || lines.length === 0) return [];
    try {
      const fifteenMinsAgo = new Date(Date.now() - 15 * 60000).toISOString();
      const results: any[] = [];
      // Process in chunks for compatibility
      const chunks: string[][] = [];
      for (let i = 0; i < lines.length; i += 10) {
        chunks.push(lines.slice(i, i + 10));
      }
      for (const chunk of chunks) {
        // Fetch fleet positions filtered by line, then filter by lastUpdate client-side
        const raw = await apiClient.get('/api/db/fleet_positions', {
          query: { limit: 5000 },
        }) as any[];
        const arr = Array.isArray(raw) ? raw : [];
        arr.forEach((d: any) => {
          if (
            chunk.includes(d.line) &&
            d.lastUpdate &&
            d.lastUpdate >= fifteenMinsAgo
          ) {
            results.push(d);
          }
        });
      }
      return results;
    } catch (e) {
      console.error('Fleet Fetch Error', e);
      return [];
    }
  },
};
