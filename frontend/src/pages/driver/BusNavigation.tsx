import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { TrafficService } from '../../services/trafficService';

import { Navigation, AlertTriangle, CloudRain, Shield, AlertOctagon, Locate } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../config/firebase';
import { collection, onSnapshot, query, where, Timestamp, limit, addDoc, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { getAllLines, getVariants, type GeoLine } from '../../data/geo/lines';
import { updateDoc, doc } from 'firebase/firestore';

// Helper to center map on User
const RecenterMap = ({ lat, lng }: { lat: number; lng: number }) => {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], 15, { animate: true });
  }, [lat, lng, map]);
  return null;
};

const BusNavigation = () => {
  const { user } = useAuth();

  // Selection State
  const [selectedLineCode, setSelectedLineCode] = useState<string>('300');
  const [currentGeo, setCurrentGeo] = useState<GeoLine>(getVariants('300')[0]);
  const [showLineSelector, setShowLineSelector] = useState(false);

  // Detour & Report State
  const [showReportMenu, setShowReportMenu] = useState(false);
  const [showDetourModal, setShowDetourModal] = useState(false);
  const [detourType, setDetourType] = useState<'EVENTUAL' | 'PROGRAMADO'>('EVENTUAL');

  // Helpers
  const availableLines = getAllLines();
  const availableVariants = getVariants(selectedLineCode);

  // Position & Sensors
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [heading, setHeading] = useState(0);
  const [speed, setSpeed] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [alerts, setAlerts] = useState<any[]>([]);

  // Shadow Agent FCM Alerta
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [tacticalAlert, setTacticalAlert] = useState<any | null>(null);

  // --- WAKE LOCK (DRIVER SAFETY) ---
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          wakeLock = await (navigator as any).wakeLock.request('screen');
        } catch (err) {
          console.warn(err);
        }
      }
    };
    requestWakeLock();
    document.addEventListener('visibilitychange', async () => {
      if (wakeLock !== null && document.visibilityState === 'visible') await requestWakeLock();
    });
    return () => {
      if (wakeLock) wakeLock.release();
    };
  }, []);

  // --- GPS WATCHER ---
  useEffect(() => {
    if (!navigator.geolocation) return;

    // Initial Fix with timeout fallback
    navigator.geolocation.getCurrentPosition(
      (pos) => setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => console.warn('GPS Initial Error', err),
      { enableHighAccuracy: true, timeout: 5000 },
    );

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        if (pos.coords.heading) setHeading(pos.coords.heading);
        if (pos.coords.speed) setSpeed(Math.round(pos.coords.speed * 3.6));
      },
      (err) => console.error(err),
      { enableHighAccuracy: true, maximumAge: 1000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // --- FLEET BROADCAST (INTERVAL 30s) ---
  useEffect(() => {
    if (!user || !position) return;

    const interval = setInterval(() => {
      TrafficService.broadcastPosition(
        user.uid || 'anon',
        selectedLineCode,
        position.lat,
        position.lng,
        speed,
        heading,
      );
    }, 30000); // 30 seconds to save costs/bandwidth

    return () => clearInterval(interval);
  }, [user, position, selectedLineCode, speed, heading]);

  // --- ALERTS LISTENER ---
  useEffect(() => {
    const now = Timestamp.fromDate(new Date());
    const q = query(collection(db, 'traffic_alerts'), where('expiresAt', '>', now), limit(50));
    const unsub = onSnapshot(q, (snap) => {
      setAlerts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // --- TACTICAL SHADOW ALERTS LISTENER ---
  useEffect(() => {
    if (!user?.assignedVehicleId) return;

    const q = query(
      collection(db, 'alertas_regulacion'),
      where('coche_id', '==', user.assignedVehicleId),
      where('leido', '==', false),
      limit(1),
    );

    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const data = snap.docs[0].data();
        const alertId = snap.docs[0].id;

        // Play very loud alarm
        try {
          const audio = new Audio('/alarm.mp3'); // We'll assume the file exists or browser fails silently
          audio.volume = 1.0;
          audio.play().catch((e) => console.warn('Audio play restricted by browser:', e));
        } catch (e) {
          console.warn('Audio falló', e);
        }

        setTacticalAlert({ id: alertId, ...data });

        // Vibrate if supported
        if ('vibrate' in navigator) {
          navigator.vibrate([500, 200, 500, 200, 1000]);
        }
      } else {
        setTacticalAlert(null);
      }
    });
    return () => unsub();
  }, [user]);

  const markTacticalAlertRead = async () => {
    if (!tacticalAlert) return;
    try {
      await updateDoc(doc(db, 'alertas_regulacion', tacticalAlert.id), {
        leido: true,
      });
      setTacticalAlert(null);
    } catch {
      toast.error('Error confirming order');
    }
  };

  const handleReport = async (type: string, desc: string) => {
    setShowReportMenu(false);
    if (!position) {
      toast.error('Sin señal GPS');
      return;
    }
    await TrafficService.reportAlert({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      type: type as any,
      lat: position.lat,
      lng: position.lng,
      description: desc,
      reportedBy: user?.uid || 'anon',
      line: selectedLineCode,
    });
    toast.success('Reporte enviado');
  };

  // Pre-CUTCSA #6 (2026-04-23): antes mostraba toast de éxito SIN escribir en
  // Firestore ("we simulate success"). Ahora persiste en `desvios_reportados`
  // para que el reporte quede realmente registrado y auditable.
  const handleDetourSubmit = async () => {
    try {
      await addDoc(collection(db, 'desvios_reportados'), {
        tipo: detourType, // 'EVENTUAL' | 'PROGRAMADO'
        lineaCodigo: selectedLineCode,
        varianteId: currentGeo?.id ?? null,
        lat: position?.lat ?? null,
        lng: position?.lng ?? null,
        reportedBy: user?.uid ?? 'anon',
        createdAt: serverTimestamp(),
        estado: 'activo', // activo | cerrado | expirado
        source: 'BusNavigation',
      });
      toast.success(`Desvío ${detourType} registrado. La flota ha sido notificada.`);
      setShowDetourModal(false);
    } catch (err) {
      console.error('[BusNavigation] Error registrando desvío:', err);
      toast.error('No se pudo registrar el desvío. Reintentá o usá radio.');
    }
  };

  return (
    <div className="h-[calc(100vh-64px)] w-full relative bg-slate-900 overflow-hidden flex flex-col">
      {/* TACTICAL FULLSCREEN ALERT (AGENTE SOMBRA) */}
      {tacticalAlert && (
        <div className="fixed inset-0 z-[99999] bg-red-600 flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in duration-300">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/diagonal-striped-brick.png')] opacity-20 pointer-events-none mix-blend-multiply"></div>

          <div className="relative z-10 flex flex-col items-center text-center max-w-2xl">
            <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center mb-8 shadow-[0_0_100px_rgba(255,255,255,0.5)] animate-pulse">
              <AlertTriangle className="w-20 h-20 text-red-600" />
            </div>

            <h1 className="text-5xl md:text-7xl font-black text-white uppercase tracking-tighter mb-4 drop-shadow-2xl leading-none">
              ¡ATENCIÓN!
            </h1>
            <h2 className="text-3xl font-bold text-red-200 mb-8 uppercase tracking-widest bg-black/40 px-6 py-2 rounded-2xl backdrop-blur-sm border border-red-400">
              {tacticalAlert.tipo.replace(/_/g, ' ')}
            </h2>

            <p className="text-4xl md:text-5xl font-black text-white mb-12 leading-tight drop-shadow-lg">
              "{tacticalAlert.mensaje_chofer}"
            </p>

            <button
              onClick={markTacticalAlertRead}
              className="w-full sm:w-auto bg-black text-white hover:bg-slate-900 active:scale-95 transition-transform px-12 py-8 rounded-[2rem] font-black text-3xl uppercase tracking-widest border-4 border-slate-700 shadow-2xl"
            >
              Copiado / Enterado
            </button>
          </div>
        </div>
      )}
      {/* HEADS UP DISPLAY (HUD) */}
      <div className="absolute top-0 left-0 right-0 z-[1000] p-4 pointer-events-none">
        <div className="flex justify-between items-start">
          {/* Line & Dest Selector */}
          <button
            onClick={() => setShowLineSelector(true)}
            className="bg-slate-900/90 backdrop-blur-md p-4 rounded-2xl border border-slate-700 shadow-2xl pointer-events-auto text-left active:scale-95 transition-transform max-w-[70%] group relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-shimmer" />
            <div className="flex items-center gap-3 mb-1">
              <div
                className={clsx(
                  'w-10 h-10 rounded-lg flex items-center justify-center font-black text-white text-lg border-2 border-white/20 transition-colors shrink-0 shadow-lg',
                  currentGeo.type === 'SUBURBANA' ? 'bg-emerald-600' : 'bg-blue-600',
                )}
              >
                {currentGeo.line}
              </div>
              <div className="min-w-0">
                <h2 className="text-white font-bold leading-tight truncate">
                  {currentGeo.destination}
                </h2>
                <p className="text-[10px] text-slate-400 font-mono truncate">
                  {currentGeo.description}
                </p>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-800 border border-slate-600">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] text-slate-300 font-bold">En Ruta</span>
              </div>
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider animate-pulse ml-auto">
                Cambiar ↻
              </span>
            </div>
          </button>

          {/* Speedometer */}
          <div className="bg-slate-900/80 backdrop-blur rounded-full w-20 h-20 flex flex-col items-center justify-center border-4 border-slate-700 shadow-xl pointer-events-auto">
            <span className="text-3xl font-black text-white leading-none">{speed}</span>
            <span className="text-[10px] uppercase font-bold text-slate-400">km/h</span>
          </div>
        </div>
      </div>

      {/* LINE SELECTION MODAL */}
      {showLineSelector && (
        <div className="absolute inset-0 z-[3000] bg-slate-950/90 backdrop-blur-xl flex flex-col p-6 animate-in fade-in">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-white">Configurar Viaje</h2>
            <button
              onClick={() => setShowLineSelector(false)}
              className="bg-slate-800 p-2 rounded-full text-white"
            >
              ✕
            </button>
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
                1. Seleccione Línea
              </h3>
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {availableLines.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => setSelectedLineCode(l.code)}
                    className={clsx(
                      'px-4 py-3 rounded-xl font-black text-lg transition-all border-2 shrink-0 min-w-[4rem]',
                      selectedLineCode === l.code
                        ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-900/50'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700',
                    )}
                  >
                    {l.code}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
                2. Seleccione Destino
              </h3>
              <div className="space-y-2 max-h-[40vh] overflow-y-auto custom-scrollbar">
                {availableVariants.map((v, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setCurrentGeo(v);
                      setShowLineSelector(false);
                      toast.success(`Ruta ${v.line} a ${v.destination} cargada`);
                    }}
                    className={clsx(
                      'w-full p-4 rounded-xl border flex items-center gap-4 transition-all text-left group',
                      currentGeo === v
                        ? 'bg-emerald-600/20 border-emerald-500 shadow-lg'
                        : 'bg-slate-900 border-slate-800 hover:bg-slate-800',
                    )}
                  >
                    <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center font-bold text-white border border-slate-600 group-hover:border-slate-500 transition-colors">
                      {v.variant}
                    </div>
                    <div>
                      <div className="font-bold text-white text-lg">{v.destination}</div>
                      <div className="text-xs text-slate-400">{v.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DETOUR MODAL */}
      {showDetourModal && (
        <div className="absolute inset-0 z-[3000] bg-slate-950/90 backdrop-blur-xl flex flex-col items-center justify-center p-6 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <AlertOctagon className="text-yellow-500" />
                Gestión de Desvíos
              </h2>
              <button
                onClick={() => setShowDetourModal(false)}
                className="bg-slate-800 p-2 rounded-full text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setDetourType('EVENTUAL')}
                  className={clsx(
                    'p-4 rounded-xl border-2 font-bold transition-all',
                    detourType === 'EVENTUAL'
                      ? 'border-yellow-500 bg-yellow-500/10 text-white'
                      : 'border-slate-700 text-slate-400',
                  )}
                >
                  Eventual (Ahora)
                </button>
                <button
                  onClick={() => setDetourType('PROGRAMADO')}
                  className={clsx(
                    'p-4 rounded-xl border-2 font-bold transition-all',
                    detourType === 'PROGRAMADO'
                      ? 'border-blue-500 bg-blue-500/10 text-white'
                      : 'border-slate-700 text-slate-400',
                  )}
                >
                  Programado
                </button>
              </div>

              <div className="bg-slate-800 p-4 rounded-xl">
                <label className="text-xs text-slate-400 uppercase font-bold px-1">
                  Describe los cambios
                </label>
                <textarea
                  className="w-full bg-transparent text-white font-medium p-2 focus:outline-none min-h-[80px]"
                  placeholder="Ej: Calles cortadas por feria, se dobla en..."
                />
              </div>
            </div>

            <button
              onClick={handleDetourSubmit}
              className="w-full py-4 rounded-xl bg-yellow-600 hover:bg-yellow-500 text-white font-black text-lg shadow-lg active:scale-95 transition-transform"
            >
              CONFIRMAR DESVÍO
            </button>
          </div>
        </div>
      )}

      {/* MAP LAYER */}
      <div className="flex-1 w-full h-full">
        <MapContainer
          center={[-34.821, -56.223]}
          zoom={14}
          style={{ height: '100%', width: '100%', background: '#0f172a' }}
          zoomControl={false}
        >
          <TileLayer
            attribution="&copy; OSM"
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />

          {/* Driver Position (With Pulse) */}
          {position && (
            <>
              <CircleMarker
                center={[position.lat, position.lng]}
                radius={8}
                color="#3b82f6"
                fillColor="#3b82f6"
                fillOpacity={1}
              >
                <div className="user-marker-pulse absolute top-0 left-0 w-full h-full rounded-full bg-blue-500 opacity-50"></div>
              </CircleMarker>
              <RecenterMap lat={position.lat} lng={position.lng} />
            </>
          )}

          {/* Smoothed Route Geometry */}
          <Polyline
            positions={currentGeo.path as [number, number][]}
            color="#000000"
            weight={12}
            opacity={0.6}
            lineCap="round"
          />
          <Polyline
            positions={currentGeo.path as [number, number][]}
            color={currentGeo.color}
            weight={6}
            opacity={1}
            lineCap="round"
          />

          {/* Stops (Visible at High Zoom) */}
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {currentGeo.stops.map((stop: any) => (
            <CircleMarker
              key={stop.id}
              center={[stop.lat, stop.lng]}
              radius={5}
              color="#fff"
              fillColor="#10b981"
              fillOpacity={1}
            >
              <Popup className="bg-slate-900 text-white border-0">
                <strong>{stop.name}</strong>
              </Popup>
            </CircleMarker>
          ))}

          {/* Alerts on Map */}
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {alerts.map((alert: any) => (
            <CircleMarker
              key={alert.id}
              center={[alert.lat, alert.lng]}
              radius={14}
              color={
                alert.type === 'ACCIDENT'
                  ? '#ef4444'
                  : alert.type === 'POLICE'
                    ? '#3b82f6'
                    : '#fbbf24'
              }
              fillColor={
                alert.type === 'ACCIDENT'
                  ? '#ef4444'
                  : alert.type === 'POLICE'
                    ? '#3b82f6'
                    : '#fbbf24'
              }
              fillOpacity={0.8}
            >
              <Popup>
                <div className="p-1">
                  <strong className="block mb-1 font-black">{alert.type}</strong>
                  {alert.description}
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      {/* CONTROLS */}
      <div className="absolute bottom-6 right-6 z-[1000] flex flex-col gap-4">
        <button
          onClick={() => setPosition(position)}
          className="w-14 h-14 rounded-full bg-slate-800 text-white flex items-center justify-center shadow-xl border border-slate-600 active:scale-95 transition-transform"
          title="Centrar"
        >
          <Locate className="w-6 h-6" />
        </button>

        <button
          onClick={() => setShowDetourModal(true)}
          className="w-14 h-14 rounded-full bg-yellow-600 text-white flex items-center justify-center shadow-xl border border-yellow-500 active:scale-95 transition-transform animate-in zoom-in"
          title="Gestión de Desvíos"
        >
          <AlertOctagon className="w-6 h-6" />
        </button>

        <button
          onClick={() => setShowReportMenu(!showReportMenu)}
          title="Menú de Reportes"
          aria-label="Menú de Reportes"
          className="w-16 h-16 rounded-full bg-orange-600 text-white flex items-center justify-center shadow-xl border-4 border-orange-400 active:scale-95 transition-transform animate-in zoom-in"
        >
          <AlertTriangle className="w-8 h-8 fill-current" />
        </button>
      </div>

      {/* REPORT MENU */}
      {showReportMenu && (
        <div className="absolute bottom-0 left-0 right-0 z-[2000] bg-slate-900/95 backdrop-blur-xl border-t border-slate-700 p-6 rounded-t-3xl animate-in slide-in-from-bottom duration-300">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-white font-bold text-lg">Reportar Incidente</h3>
            <button onClick={() => setShowReportMenu(false)} className="text-slate-400 p-2">
              ✕
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[
              {
                id: 'TRAFFIC',
                label: 'Tráfico',
                icon: AlertOctagon,
                color: 'text-yellow-500',
                bg: 'bg-yellow-500/20',
              },
              {
                id: 'POLICE',
                label: 'Policía',
                icon: Shield,
                color: 'text-blue-500',
                bg: 'bg-blue-500/20',
              },
              {
                id: 'ACCIDENT',
                label: 'Accidente',
                icon: AlertTriangle,
                color: 'text-red-500',
                bg: 'bg-red-500/20',
              },
              {
                id: 'DETOUR',
                label: 'Desvío',
                icon: Navigation,
                color: 'text-orange-500',
                bg: 'bg-orange-500/20',
              },
              {
                id: 'WEATHER',
                label: 'Clima',
                icon: CloudRain,
                color: 'text-cyan-500',
                bg: 'bg-cyan-500/20',
              },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => handleReport(item.id, item.label)}
                className="flex flex-col items-center gap-2 p-4 bg-slate-800 rounded-xl active:bg-slate-700 transition-colors"
              >
                <div
                  className={clsx(
                    'w-12 h-12 rounded-full flex items-center justify-center',
                    item.bg,
                    item.color,
                  )}
                >
                  <item.icon className="w-6 h-6" />
                </div>
                <span className="text-xs font-bold text-slate-300">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default BusNavigation;
