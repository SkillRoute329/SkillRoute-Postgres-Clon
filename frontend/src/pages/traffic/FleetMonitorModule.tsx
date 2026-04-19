/**
 * Centro de Control (Radar): monitoreo en tiempo real de vehículos activos.
 * Escucha viajes_activos con onSnapshot y muestra cada unidad en un mapa Leaflet.
 * Ruta: /dashboard/traffic/fleet-monitor
 */
import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { GeoPoint, Timestamp } from 'firebase/firestore';
import { Radio } from 'lucide-react';

const VIAJES_ACTIVOS_COL = 'viajes_activos';
const INACTIVITY_MS = 15 * 60 * 1000; // 15 minutos
const MONTEVIDEO_CENTER: [number, number] = [-34.9, -56.16];
const DEFAULT_ZOOM = 12;

export interface ViajeActivoDoc {
  id: string;
  empresa?: string;
  codigoLinea?: string;
  posicion?: GeoPoint;
  updatedAt?: Timestamp;
  estado?: string;
}

export interface VehiculoEnMapa {
  id: string;
  empresa: string;
  codigoLinea: string;
  lat: number;
  lng: number;
  updatedAtMs: number;
}

function toMillis(updatedAt: Timestamp | undefined): number {
  if (!updatedAt) return 0;
  return typeof (updatedAt as { toMillis?: () => number }).toMillis === 'function'
    ? (updatedAt as Timestamp).toMillis()
    : 0;
}

function formatHace(updatedAtMs: number): string {
  const sec = Math.floor((Date.now() - updatedAtMs) / 1000);
  if (sec < 60) return `hace ${sec} s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return `hace ${h} h`;
}

const busIcon = L.divIcon({
  html: `<span style="background:#0ea5e9;color:white;padding:2px 6px;border-radius:6px;font-size:11px;font-weight:bold;box-shadow:0 1px 4px rgba(0,0,0,0.3);display:inline-flex;align-items:center;gap:2px">🚌</span>`,
  className: 'fleet-marker',
  iconSize: [32, 24],
  iconAnchor: [16, 12],
});

export default function FleetMonitorModule() {
  const [vehiculos, setVehiculos] = useState<VehiculoEnMapa[]>([]);
  const [competidores, setCompetidores] = useState<VehiculoEnMapa[]>([]);
  const [listening, setListening] = useState(false);

  // 1. Listen for UCOT fleet in Firestore
  useEffect(() => {
    const colRef = collection(db, VIAJES_ACTIVOS_COL);
    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        setListening(true);
        const cutoff = Date.now() - INACTIVITY_MS;
        const list: VehiculoEnMapa[] = [];
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data() as ViajeActivoDoc;
          const updatedAtMs = toMillis(data.updatedAt);
          if (updatedAtMs < cutoff) return;
          const pos = data.posicion;
          if (!pos || typeof pos.latitude !== 'number' || typeof pos.longitude !== 'number') return;
          list.push({
            id: docSnap.id,
            empresa: String(data.empresa ?? 'UCOT').trim(),
            codigoLinea: String(data.codigoLinea ?? '').trim(),
            lat: pos.latitude,
            lng: pos.longitude,
            updatedAtMs,
          });
        });
        setVehiculos(list);
      },
      (err) => console.error('[FleetMonitor] Firestore error:', err),
    );
    return () => unsubscribe();
  }, []);

  // 2. Periodically fetch Competitors from IMM API
  useEffect(() => {
    const fetchCompetitors = async () => {
      const lines = ['103', '128', '110', '169', '185', '505', '522']; // Common rivals
      
      // Intentar Cloud Function proxy primero
      try {
        const PROXY_BASE =
          'https://us-central1-ucot-gestor-cloud.cloudfunctions.net/montevideoProxy';
        const endpoint = `api/transportepublico/buses?lines=${lines.join(',')}`;
        const url = `${PROXY_BASE}?endpoint=${encodeURIComponent(endpoint)}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`Proxy ${res.status}`);
        const data = await res.json();

        const list: VehiculoEnMapa[] = data.map(
          (b: {
            linea: string;
            interno: string;
            empresa?: string;
            latitud: number;
            longitud: number;
          }) => ({
            id: `comp-${b.linea}-${b.interno}`,
            empresa: b.empresa || 'Competencia',
            codigoLinea: b.linea,
            lat: b.latitud,
            lng: b.longitud,
            updatedAtMs: Date.now(),
          }),
        );
        setCompetidores(list);
        return; // éxito — no necesitamos fallback
      } catch (e) {
        console.warn('[FleetMonitor] Cloud proxy failed, trying STM relay:', e);
      }
      
      // Fallback: STM API directa via Vite proxy
      try {
        const { fetchSTMPosiciones } = await import('../../services/stmLiveService');
        const buses = await fetchSTMPosiciones({ empresa: -1 });
        const rivals = buses.filter(b => b.codigoEmpresa !== 70); // Excluir UCOT (código 70)
        const list: VehiculoEnMapa[] = rivals.map(b => ({
          id: `stm-${b.id}`,
          empresa: b.empresa || 'Competencia',
          codigoLinea: b.linea,
          lat: b.lat,
          lng: b.lng,
          updatedAtMs: Date.now(),
        }));
        setCompetidores(list);
      } catch (e2) {
        console.error('[FleetMonitor] Both competitor sources failed:', e2);
      }
    };

    fetchCompetitors();
    const interval = setInterval(fetchCompetitors, 30000); // Every 30s
    return () => clearInterval(interval);
  }, []);

  const competitorIcon = L.divIcon({
    html: `<span style="background:#ef4444;color:white;padding:2px 6px;border-radius:6px;font-size:11px;font-weight:bold;box-shadow:0 1px 4px rgba(0,0,0,0.3);display:inline-flex;align-items:center;gap:2px">🚩</span>`,
    className: 'fleet-marker',
    iconSize: [32, 24],
    iconAnchor: [16, 12],
  });

  const allVehiculos = [...vehiculos, ...competidores];

  return (
    <div className="h-full flex flex-col bg-slate-950 w-full max-w-full overflow-x-hidden">
      <div className="shrink-0 flex items-center justify-between gap-4 p-4 border-b border-slate-800 w-full max-w-full">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-600/20 flex items-center justify-center">
            <Radio className="w-5 h-5 text-primary-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Monitoreo de Flota (Radar)</h1>
            <p className="text-xs text-slate-400">
              {listening
                ? `${allVehiculos.length} unidades detectadas (UCOT + Competencia)`
                : 'Conectando…'}
            </p>
          </div>
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-2 text-blue-400">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            <span className="text-xs font-bold font-mono">{vehiculos.length} UCOT</span>
          </div>
          <div className="flex items-center gap-2 text-red-400">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            <span className="text-xs font-bold font-mono">{competidores.length} RIVALES</span>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-[280px] relative w-full z-[1]">
        <MapContainer
          center={MONTEVIDEO_CENTER}
          zoom={DEFAULT_ZOOM}
          className="h-full w-full rounded-b-xl min-h-[280px]"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          {vehiculos.map((v) => (
            <Marker key={v.id} position={[v.lat, v.lng]} icon={busIcon}>
              <Popup>
                <div className="text-sm text-slate-800 min-w-[160px]">
                  <div className="font-bold text-blue-600">
                    {v.empresa} – {v.codigoLinea}
                  </div>
                  <div className="text-slate-600 mt-1">{formatHace(v.updatedAtMs)}</div>
                </div>
              </Popup>
            </Marker>
          ))}
          {competidores.map((v) => (
            <Marker key={v.id} position={[v.lat, v.lng]} icon={competitorIcon}>
              <Popup>
                <div className="text-sm text-slate-800 min-w-[160px]">
                  <div className="font-bold text-red-600">
                    {v.empresa} – {v.codigoLinea} (Competencia)
                  </div>
                  <div className="text-slate-600 mt-1">Detectado en tiempo real</div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
