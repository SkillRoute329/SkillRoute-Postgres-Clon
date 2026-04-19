import { db } from '../config/firebase';
import { collection, addDoc, getDocs, query, where, Timestamp, orderBy } from 'firebase/firestore';

export type AlertType = 'ACCIDENT' | 'TRAFFIC' | 'POLICE' | 'DETOUR' | 'WEATHER' | 'OTHER';

export interface TrafficAlert {
  id?: string;
  type: AlertType;
  lat: number;
  lng: number;
  description: string;
  reportedBy: string; // User ID
  reportedAt: any; // Timestamp
  expiresAt: any; // Timestamp
  line?: string; // Optional: Specific to a line
}

export const TrafficService = {
  // Report a new alert
  reportAlert: async (alert: Omit<TrafficAlert, 'id' | 'reportedAt' | 'expiresAt'>) => {
    try {
      const now = new Date();
      const expiration = new Date(now.getTime() + 2 * 60 * 60 * 1000); // Expires in 2 hours by default

      await addDoc(collection(db, 'traffic_alerts'), {
        ...alert,
        reportedAt: Timestamp.fromDate(now),
        expiresAt: Timestamp.fromDate(expiration),
      });
      return true;
    } catch (e) {
      console.error('Error reporting alert', e);
      return false;
    }
  },

  // Get Active Alerts (Real-time listener recommended instead)
  getActiveAlerts: async () => {
    try {
      const now = Timestamp.fromDate(new Date());
      const q = query(
        collection(db, 'traffic_alerts'),
        where('expiresAt', '>', now),
        orderBy('expiresAt', 'desc'),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  // 📡 BROADCAST POSITION (For Admin Fleet View)
  broadcastPosition: async (
    uid: string,
    line: string,
    lat: number,
    lng: number,
    speed: number,
    heading: number,
  ) => {
    try {
      const { doc, setDoc, getFirestore } = await import('firebase/firestore');
      const db = getFirestore();

      await setDoc(
        doc(db, 'fleet_positions', uid),
        {
          line,
          lat,
          lng,
          speed,
          heading,
          lastUpdate: Timestamp.now(),
          status: 'ONLINE',
        },
        { merge: true },
      );
    } catch (e) {
      console.error('GPS Broadcast Error', e);
    }
  },

  // 🕵️ FETCH COMPETITOR POSITIONS
  fetchCompetitorPositions: async (lines: string[]): Promise<any[]> => {
    try {
      const PROXY_BASE = 'https://us-central1-ucot-gestor-cloud.cloudfunctions.net/montevideoProxy';
      const endpoint = `api/transportepublico/buses?lines=${lines.join(',')}`;
      const url = `${PROXY_BASE}?endpoint=${encodeURIComponent(endpoint)}`;

      const response = await fetch(url);
      if (!response.ok) throw new Error('API Proxy Error');

      return await response.json();
    } catch (e) {
      console.error('Competitor Fetch Error', e);
      return [];
    }
  },

  // 🚍 FETCH UCOT REAL POSITIONS VIA IMM API
  fetchUcotPositions: async (lines: string[]): Promise<any[]> => {
    try {
      const PROXY_BASE = 'https://us-central1-ucot-gestor-cloud.cloudfunctions.net/montevideoProxy';
      const endpoint = `api/transportepublico/buses?lines=${lines.join(',')}`;
      const url = `${PROXY_BASE}?endpoint=${encodeURIComponent(endpoint)}`;

      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('API Proxy Error');

      const data = await response.json();
      return data.filter(
        (bus: any) =>
          bus.empresa === 'UCOT' ||
          bus.empresa === 70 ||
          bus.empresaId === 70 ||
          bus.codigoEmpresa === 70 ||
          (bus.nombreEmpresa && bus.nombreEmpresa.toUpperCase() === 'UCOT'),
      );
    } catch (e) {
      console.error('UCOT Proxy Fetch Error', e);
      return [];
    }
  },

  // 🚍 FETCH UCOT REAL FLEET POSITIONS
  fetchFleetPositions: async (lines: string[]): Promise<any[]> => {
    if (!lines || lines.length === 0) return [];
    try {
      const chunks = [];
      // Firestore 'in' solo soporta max 10
      for (let i = 0; i < lines.length; i += 10) {
        chunks.push(lines.slice(i, i + 10));
      }

      const results: any[] = [];
      const fifteenMinsAgo = Timestamp.fromDate(new Date(Date.now() - 15 * 60000));

      for (const chunk of chunks) {
        const q = query(
          collection(db, 'fleet_positions'),
          where('line', 'in', chunk),
          where('lastUpdate', '>', fifteenMinsAgo),
        );
        const snap = await getDocs(q);
        results.push(...snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      }
      return results;
    } catch (e) {
      console.error('Fleet Fetch Error', e);
      return [];
    }
  },
};
