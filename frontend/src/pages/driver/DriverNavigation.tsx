
import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, Circle, Polygon, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import io from 'socket.io-client';
import { AlertTriangle, Navigation, Plus, Camera } from 'lucide-react';
import { API_URL } from '../../services/api';

// Fix Leaflet icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Types
interface AlertType {
    id?: number;
    type: 'ACCIDENTE' | 'CALLE_CORTADA' | 'INSPECTOR' | 'TRAFICO' | 'OBRAS';
    lat: number;
    lng: number;
    description?: string;
}

interface PlannedDetour {
    id: number;
    name: string;
    geometry: [number, number][];
}

interface TariffZone {
    id: number;
    name: string;
    price: number | null;
    type: 'POINT' | 'POLYGON' | 'CIRCLE';
    latitude: number;
    longitude: number;
    geometry: [number, number][] | null;
    radiusMeters: number;
}

interface Radar {
    id: number;
    name: string;
    latitude: number;
    longitude: number;
    speedLimit: number;
    type: string;
}

interface RouteData {
    line: string;
    origin: string;
    destination: string;
    baseRoute: [number, number][];
    tariffZones: TariffZone[];
    radars: Radar[];
    activeDetours: PlannedDetour[];
}

// Map Updater Component
const MapController = ({ center }: { center: [number, number] }) => {
    const map = useMap();
    useEffect(() => {
        map.setView(center, 18, { animate: true });
    }, [center, map]);
    return null;
};

// Map Events Listener for "Price Lookup"
const MapEvents = ({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) => {
    useMapEvents({
        click: (e) => {
            onMapClick(e.latlng.lat, e.latlng.lng);
        },
    });
    return null;
};

// Icons
const busIcon = new L.DivIcon({
    className: 'custom-bus-icon',
    html: `<div style="background-color: #3b82f6; width: 24px; height: 24px; border-radius: 50%; border: 4px solid white; box-shadow: 0 0 15px rgba(0,0,0,0.5);"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
});

const radarIcon = new L.DivIcon({
    className: 'custom-radar-icon',
    html: `<div style="background-color: red; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; color: white; font-size: 8px; font-weight: bold;">R</div>`,
    iconSize: [16, 16]
});

// Helper: Haversine Distance (Meters)
const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

// Helper: Point in Polygon (Ray Casting)
const isPointInPolygon = (point: [number, number], polygon: [number, number][]) => {
    let x = point[0], y = point[1];
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        let xi = polygon[i][0], yi = polygon[i][1];
        let xj = polygon[j][0], yj = polygon[j][1];
        let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
};

const DriverNavigation = () => {
    // State
    const [selectedLine, setSelectedLine] = useState('');
    const [position, setPosition] = useState<[number, number] | null>(null);
    const [heading, setHeading] = useState(0);
    const [speed, setSpeed] = useState(0);
    const [alerts, setAlerts] = useState<AlertType[]>([]);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [socket, setSocket] = useState<any>(null);
    const [routeData, setRouteData] = useState<RouteData | null>(null);

    // Dynamic Lines
    const [availableLines, setAvailableLines] = useState<string[]>(['71', '11A']); // Fallback

    // Revenue States
    const [currentTariff, setCurrentTariff] = useState('MONTEVIDEO');
    const [preAviso, setPreAviso] = useState<string | null>(null);
    const [lookupResult, setLookupResult] = useState<string | null>(null);
    const [radarAlert, setRadarAlert] = useState<Radar | null>(null);

    // Audio
    const audioRef = useRef<Record<string, HTMLAudioElement>>({});

    useEffect(() => {
        // Fetch Available Master Routes
        fetch(`${API_URL}/universal/masterRoutes/list?limit=100`)
            .then(res => res.json())
            .then(data => {
                if (data && data.data && Array.isArray(data.data)) {
                    // Assuming masterRoutes has a 'lineName' or 'name' field
                    const lines = data.data.map((r: any) => r.lineName || r.name).filter(Boolean);
                    if (lines.length > 0) setAvailableLines(Array.from(new Set(lines)));
                }
            })
            .catch(err => console.error("Error fetching lines", err));
    }, []);

    useEffect(() => {
        if (!selectedLine) return;
        const loadRoute = async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await fetch(`${API_URL}/navigation/route/${selectedLine}`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {}
                });
                const data = await res.json();
                setRouteData(data);
                setCurrentTariff('MONTEVIDEO');
            } catch (error) { console.error(error); }
        };
        loadRoute();
        if (socket) socket.emit('join_line', selectedLine);
    }, [selectedLine, socket]);

    useEffect(() => {
        const newSocket = io(API_URL.replace('/api', ''));
        setSocket(newSocket);
        newSocket.on('new_alert', (alert: AlertType) => setAlerts(prev => [...prev, alert]));

        audioRef.current['radar'] = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
        audioRef.current['tariff'] = new Audio('https://actions.google.com/sounds/v1/foley/car_door_chime.ogg');

        return () => { newSocket.disconnect(); };
    }, []);

    // Core Logic: GPS Tracking & Geo-Analysis
    useEffect(() => {
        if (!navigator.geolocation) return;
        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                const spdKm = (pos.coords.speed || 0) * 3.6;

                setPosition([lat, lng]);
                if (pos.coords.heading) setHeading(pos.coords.heading);
                setSpeed(Math.round(spdKm));

                if (!routeData) return;

                // 1. Radar Check
                const nearestRadar = routeData.radars.find(r => getDistance(lat, lng, r.latitude, r.longitude) < 300);
                if (nearestRadar) {
                    if (!radarAlert) audioRef.current['radar']?.play().catch(() => { });
                    setRadarAlert(nearestRadar);
                } else setRadarAlert(null);

                // 2. Tariff Geography Check
                let newTariff = 'MONTEVIDEO';
                let alertMsg: string | null = null;

                for (const zone of routeData.tariffZones) {
                    const dist = getDistance(lat, lng, zone.latitude, zone.longitude);

                    // Pre-Aviso (250m before cross-point)
                    if (zone.type === 'POINT' && dist < 300 && dist > zone.radiusMeters) {
                        alertMsg = `PRÓXIMO: ${zone.name}`;
                    }

                    // Detection
                    if (zone.type === 'POLYGON' && zone.geometry && isPointInPolygon([lat, lng], zone.geometry)) {
                        newTariff = zone.name;
                    } else if (zone.type === 'CIRCLE' && dist < zone.radiusMeters) {
                        newTariff = zone.name;
                    } else if (zone.type === 'POINT' && dist < zone.radiusMeters) {
                        // For points, we assume sequential order defines the current zone
                        // In a real app we'd track "last passed point"
                        newTariff = zone.name;
                    }
                }

                if (newTariff !== currentTariff) {
                    audioRef.current['tariff']?.play().catch(() => { });
                    setCurrentTariff(newTariff);
                }
                setPreAviso(alertMsg);
            },
            (err) => console.error(err),
            { enableHighAccuracy: true, maximumAge: 1000 }
        );
        return () => navigator.geolocation.clearWatch(watchId);
    }, [routeData, radarAlert, currentTariff]);

    const handleMapLookup = (lat: number, lng: number) => {
        if (!routeData) return;
        let result = "Tarifa Común";
        for (const zone of routeData.tariffZones) {
            const dist = getDistance(lat, lng, zone.latitude, zone.longitude);
            if (zone.type === 'POLYGON' && zone.geometry && isPointInPolygon([lat, lng], zone.geometry)) {
                result = `${zone.name}`;
                break;
            }
            if (zone.type === 'CIRCLE' && dist < zone.radiusMeters) {
                result = `${zone.name}`;
                break;
            }
            if (zone.type === 'POINT' && dist < 500) {
                result = `${zone.name}`;
                break;
            }
        }
        setLookupResult(result);
        setTimeout(() => setLookupResult(null), 4000);
    };

    const handleReport = (type: AlertType['type']) => {
        if (!position || !socket) return;
        const newAlert = { type, lat: position[0], lng: position[1], line: selectedLine, description: `Reporte de ${type}` };
        socket.emit('report_alert', newAlert);
        setAlerts(prev => [...prev, newAlert]);
        setIsMenuOpen(false);
    };

    if (!selectedLine) {
        return (
            <div className="h-screen bg-slate-900 flex flex-col items-center justify-center text-white gap-8 p-4">
                <div className="text-center">
                    <Navigation className="w-20 h-20 text-blue-500 mx-auto mb-4" />
                    <h1 className="text-4xl font-bold mb-2">BusNavigator 2.0</h1>
                    <p className="text-slate-400">Revenue Specialist & Geo-Alerts</p>
                </div>
                <div className="grid grid-cols-3 md:grid-cols-4 gap-4 w-full max-w-2xl px-4">
                    {availableLines.length > 0 ? availableLines.map(line => (
                        <button key={line} onClick={() => setSelectedLine(line)} className="bg-slate-800 hover:bg-slate-700 text-2xl font-bold py-6 rounded-xl border border-slate-700 active:scale-95 text-blue-400">
                            {line}
                        </button>
                    )) : <div className="col-span-3 text-slate-500 text-center">No hay recorridos disponibles.</div>}
                </div>
            </div>
        );
    }

    if (!position) return <div className="h-screen flex items-center justify-center bg-slate-900 text-white animate-pulse">📡 Sincronizando GPS...</div>;

    const isOverSpeed = radarAlert ? speed > radarAlert.speedLimit : speed > 60;
    const isSpecialZone = ['CÉNTRICA', 'ZONAL E', 'ZONAL L'].includes(currentTariff);

    return (
        <div className="relative w-full h-screen bg-slate-900 overflow-hidden font-sans">
            <MapContainer center={position} zoom={18} className="w-full h-full z-0" zoomControl={false}>
                <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution='&copy; CARTO' />
                <MapController center={position} />
                <MapEvents onMapClick={handleMapLookup} />

                {/* 2. Neon Polyline (Double Layer for 3D/Glow Effect) */}
                {routeData?.baseRoute && (
                    <>
                        {/* Outer Glow / Border (Black/Darker) */}
                        <Polyline positions={routeData.baseRoute} color="#000000" weight={10} opacity={0.8} />
                        {/* Core Neon Line */}
                        <Polyline positions={routeData.baseRoute} color="#00ff00" weight={5} opacity={1} />
                    </>
                )}

                {/* Detours (Radioactive Orange Dashed) */}
                {routeData?.activeDetours?.map(detour => (
                    <Polyline key={detour.id} positions={detour.geometry} color="#ff4500" weight={5} dashArray="10, 10" opacity={0.9} />
                ))}

                {/* Draw Specialized Zones */}
                {routeData?.tariffZones?.map(zone => (
                    <div key={zone.id}>
                        {zone.type === 'POLYGON' && zone.geometry && (
                            <Polygon positions={zone.geometry} pathOptions={{ color: '#10b981', fillColor: '#10b981', fillOpacity: 0.15, dashArray: '5,5' }} />
                        )}
                        {zone.type === 'CIRCLE' && (
                            <Circle center={[zone.latitude, zone.longitude]} radius={zone.radiusMeters} pathOptions={{ color: '#fbbf24', fillColor: '#fbbf24', fillOpacity: 0.1 }} />
                        )}
                        {zone.type === 'POINT' && (
                            <Polyline positions={[[zone.latitude - 0.001, zone.longitude], [zone.latitude + 0.001, zone.longitude]]} color="#ef4444" weight={5} opacity={0.8} />
                        )}
                    </div>
                ))}

                {/* Radar Markers */}
                {routeData?.radars.map(r => (
                    <Marker key={r.id} position={[r.latitude, r.longitude]} icon={radarIcon}>
                        <Popup>{r.name} - Límite: {r.speedLimit} km/h</Popup>
                    </Marker>
                ))}

                <Marker position={position} icon={busIcon} />

                {alerts.map((a, idx) => (
                    <Marker key={idx} position={[a.lat, a.lng]}><Popup>{a.type}</Popup></Marker>
                ))}
            </MapContainer>

            {/* TOP BAR: Revenue HUD */}
            <div className={`absolute top-0 left-0 right-0 z-[1000] p-4 flex flex-col items-center gap-2 pointer-events-none transition-colors duration-500`}>
                <div className={`w-full max-w-2xl backdrop-blur-md border-b-4 p-4 rounded-3xl flex justify-between items-center shadow-2xl transition-all
                    ${isSpecialZone ? 'bg-emerald-900/90 border-emerald-400' : 'bg-slate-900/90 border-blue-500'}`}>

                    <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tarifa Actual</span>
                        <h2 className="text-2xl font-black text-white">{currentTariff}</h2>
                    </div>

                    <div className={`px-4 py-2 rounded-2xl flex items-center gap-2 font-bold ${isOverSpeed ? 'bg-red-600 animate-pulse' : 'bg-slate-800'}`}>
                        <span className="text-4xl text-white">{speed}</span>
                        <div className="flex flex-col">
                            <span className="text-[10px] text-slate-300">KM/H</span>
                            <span className="text-[8px] text-blue-400">{Math.round(heading)}°</span>
                        </div>
                    </div>
                </div>

                {/* Dynamic Alerts */}
                <div className="flex flex-col gap-2 w-full max-w-md pointer-events-auto">
                    {preAviso && (
                        <div className="bg-blue-600/95 text-white p-3 rounded-2xl text-center font-bold animate-bounce border border-blue-400 shadow-lg">
                            🔔 {preAviso}
                        </div>
                    )}
                    {radarAlert && (
                        <div className="bg-red-600/95 text-white p-4 rounded-2xl flex items-center gap-3 animate-pulse border border-red-400 shadow-xl">
                            <Camera className="w-8 h-8" />
                            <div>
                                <div className="font-black text-lg">CÁMARA {radarAlert.speedLimit} KM/H</div>
                                <div className="text-xs text-red-100">Reduzca velocidad de inmediato</div>
                            </div>
                        </div>
                    )}
                    {lookupResult && (
                        <div className="bg-indigo-600 text-white p-3 rounded-2xl text-center font-bold animate-in slide-in-from-top-4">
                            📍 Consulta: {lookupResult}
                        </div>
                    )}
                </div>
            </div>

            {/* Floating Info & Actions */}
            <div className="absolute bottom-6 right-6 z-[1000] flex flex-col gap-4 pointer-events-auto items-end">
                {isMenuOpen && (
                    <div className="flex flex-col gap-3 mb-2 animate-in slide-in-from-bottom-5">
                        <button onClick={() => handleReport('CALLE_CORTADA')} className="p-4 bg-orange-600 text-white rounded-2xl font-bold flex gap-2">⛔ Calle Cortada</button>
                        <button onClick={() => handleReport('ACCIDENTE')} className="p-4 bg-red-600 text-white rounded-2xl font-bold flex gap-2">💥 Accidente</button>
                        <button onClick={() => handleReport('INSPECTOR')} className="p-4 bg-indigo-600 text-white rounded-2xl font-bold flex gap-2">🚔 Inspector</button>
                    </div>
                )}
                <button onClick={() => setSelectedLine('')} className="bg-slate-800 text-white px-4 py-2 rounded-xl text-sm border border-slate-700">Cambiar Línea</button>
                <button
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className="w-20 h-20 bg-yellow-400 hover:bg-yellow-300 text-slate-900 rounded-full shadow-2xl flex items-center justify-center transition-transform active:scale-95 border-4 border-yellow-200"
                >
                    {isMenuOpen ? <AlertTriangle className="w-10 h-10" /> : <Plus className="w-10 h-10" />}
                </button>
            </div>
        </div>
    );
};

export default DriverNavigation;
