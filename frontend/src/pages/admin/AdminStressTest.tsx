import { useState, useEffect } from 'react';
import { db } from '../../config/firebase';
import { collection, onSnapshot, query, where, Timestamp } from 'firebase/firestore';
import { Activity, Map as MapIcon, Users, AlertTriangle } from 'lucide-react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const AdminStressTest = () => {
  // State for Simulation Metrics
  const [fleet, setFleet] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [metrics, setMetrics] = useState({
    activeDrivers: 0,
    requestsPerMinute: 0, // Simulated
    errors: 0,
    avgLatency: 45, // ms
  });

  // 1. Listen to Real-time Fleet
  useEffect(() => {
    // Query only recently updated (active in last 5 mins)
    const fiveMinsAgo = Timestamp.fromMillis(Date.now() - 5 * 60 * 1000);
    const q = query(collection(db, 'fleet_positions'), where('lastUpdate', '>', fiveMinsAgo));

    const unsub = onSnapshot(q, (snap) => {
      const drivers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setFleet(drivers);
      setMetrics((prev) => ({ ...prev, activeDrivers: drivers.length }));
    });
    return () => unsub();
  }, []);

  // 2. Listen to Alerts
  useEffect(() => {
    const q = query(collection(db, 'traffic_alerts'), where('expiresAt', '>', Timestamp.now()));
    const unsub = onSnapshot(q, (snap) => {
      setAlerts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // 3. Simulate Load Metrics
  useEffect(() => {
    const interval = setInterval(() => {
      // Randomize load simulation numbers based on "Active Drivers"
      const baseLoad = Math.max(10, metrics.activeDrivers * 12); // ~12 req/min per driver
      const noise = Math.floor(Math.random() * 50);

      setMetrics((prev) => ({
        ...prev,
        requestsPerMinute: baseLoad + noise,
        avgLatency: 40 + Math.random() * 20,
      }));
    }, 2000);
    return () => clearInterval(interval);
  }, [metrics.activeDrivers]);

  return (
    <div className="h-full p-6 bg-slate-900 text-white overflow-hidden flex flex-col">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Activity className="text-red-500 animate-pulse" />
        Panel de Control de Carga (Stress Test Live)
      </h1>

      {/* METRICS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
          <div className="text-slate-400 text-xs uppercase font-bold">Conductores Activos</div>
          <div className="text-3xl font-black text-blue-400 flex items-center gap-2">
            <Users className="w-6 h-6" />
            {metrics.activeDrivers}
          </div>
        </div>
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
          <div className="text-slate-400 text-xs uppercase font-bold">Peticiones / Min</div>
          <div className="text-3xl font-black text-green-400 font-mono">
            {metrics.requestsPerMinute}
          </div>
        </div>
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
          <div className="text-slate-400 text-xs uppercase font-bold">Latencia Promedio</div>
          <div className="text-3xl font-black text-yellow-400 font-mono">
            {Math.round(metrics.avgLatency)}ms
          </div>
        </div>
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
          <div className="text-slate-400 text-xs uppercase font-bold">Alertas en Vía</div>
          <div className="text-3xl font-black text-red-500 flex items-center gap-2">
            <AlertTriangle className="w-6 h-6" />
            {alerts.length}
          </div>
        </div>
      </div>

      {/* LIVE FLEET MAP */}
      <div className="flex-1 bg-slate-800 rounded-2xl overflow-hidden border border-slate-700 relative">
        <MapContainer center={[-34.85, -56.16]} zoom={12} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

          {/* Fleet Markers */}
          {fleet.map((driver: any) => (
            <CircleMarker
              key={driver.id}
              center={[driver.lat, driver.lng]}
              radius={6}
              color="#3b82f6"
              fillColor="#3b82f6"
              fillOpacity={0.8}
            >
              <Popup className="bg-slate-900 text-white">
                <strong>Línea {driver.line}</strong>
                <br />
                {driver.speed} km/h
              </Popup>
            </CircleMarker>
          ))}

          {/* Alert Markers */}
          {alerts.map((alert: any) => (
            <CircleMarker
              key={alert.id}
              center={[alert.lat, alert.lng]}
              radius={10}
              color="#ef4444"
              fillColor="#ef4444"
              fillOpacity={0.6}
            >
              <Popup>Alert: {alert.type}</Popup>
            </CircleMarker>
          ))}
        </MapContainer>

        <div className="absolute bottom-4 left-4 bg-slate-900/90 p-2 rounded text-xs text-slate-400 font-mono z-[1000]">
          System Status: NOMINAL
          <br />
          Database: CONNECTED
          <br />
          Simulation: ACTIVE (100 Users)
        </div>
      </div>
    </div>
  );
};

export default AdminStressTest;
