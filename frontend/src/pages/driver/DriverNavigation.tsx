
import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import io from 'socket.io-client';
import { AlertTriangle, Navigation, Plus } from 'lucide-react';
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
    type: 'ACCIDENTE' | 'FERIA' | 'DESVIO' | 'MANIFESTACION' | 'OBRAS';
    lat: number;
    lng: number;
    description?: string;
}

interface PlannedDetour {
    id: number;
    name: string;
    geometry: [number, number][];
}

// Map Updater Component for "Tracking Mode"
// Rotation unused for now as Leaflet native rotation is complex without plugins
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const MapController = ({ center }: { center: [number, number], rotation?: number }) => {
    const map = useMap();
    useEffect(() => {
        map.setView(center, 18, { animate: true });
    }, [center, map]);
    return null;
};

// Custom Bus Icon
const busIcon = new L.DivIcon({
    className: 'custom-bus-icon',
    html: `<div style="background-color: blue; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5);"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10]
});

const DriverNavigation = () => {
    // State
    const [position, setPosition] = useState<[number, number] | null>(null);
    const [heading, setHeading] = useState(0);
    const [alerts, setAlerts] = useState<AlertType[]>([]);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [socket, setSocket] = useState<any>(null);
    const [routeData, setRouteData] = useState<{ baseRoute: [number, number][], activeDetours: PlannedDetour[] } | null>(null);

    useEffect(() => {
        // Fetch Route Data
        const loadRoute = async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await fetch(`${API_URL}/navigation/route/370`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {}
                });
                const data = await res.json();
                setRouteData(data);
            } catch (error) {
                console.error("Error loading route:", error);
            }
        };
        loadRoute();

        // Init Socket
        const newSocket = io(API_URL.replace('/api', '')); // Connect to root
        setSocket(newSocket);

        newSocket.on('connect', () => {
            console.log('Connected to socket');
            newSocket.emit('join_line', '370'); // Hardcoded line for demo
        });

        newSocket.on('new_alert', (alert: AlertType) => {
            setAlerts(prev => [...prev, alert]);
        });

        return () => {
            newSocket.disconnect();
        };
    }, []);

    useEffect(() => {
        // Watch Position
        if (navigator.geolocation) {
            const watchId = navigator.geolocation.watchPosition(
                (pos) => {
                    setPosition([pos.coords.latitude, pos.coords.longitude]);
                    if (pos.coords.heading) setHeading(pos.coords.heading);

                    // Simple Deviation Check logic placeholder
                    // distanceToLine(pos) > 50m -> setDeviated(true)
                },
                (err) => console.error(err),
                { enableHighAccuracy: true }
            );
            return () => navigator.geolocation.clearWatch(watchId);
        }
    }, []);

    const handleReport = (type: AlertType['type']) => {
        if (!position || !socket) return;

        const newAlert = {
            type,
            lat: position[0],
            lng: position[1],
            line: '370',
            description: `Reporte de ${type}`
        };

        // Emit to backend
        socket.emit('report_alert', newAlert);

        // Optimistic UI update
        setAlerts(prev => [...prev, newAlert]);
        setIsMenuOpen(false);
    };

    if (!position) return <div className="h-screen flex items-center justify-center bg-slate-900 text-white">Buscando GPS...</div>;

    const hasActiveDetour = routeData?.activeDetours && routeData.activeDetours.length > 0;

    return (
        <div className="relative w-full h-screen bg-slate-900 overflow-hidden">
            <MapContainer
                center={position}
                zoom={18}
                className="w-full h-full z-0"
                zoomControl={false}
            >
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                />

                <MapController center={position} rotation={heading} />

                {/* Base Route */}
                {routeData?.baseRoute && (
                    <Polyline positions={routeData.baseRoute} color="blue" weight={6} opacity={0.5} />
                )}

                {/* Active Detours */}
                {routeData?.activeDetours?.map(detour => (
                    <Polyline key={detour.id} positions={detour.geometry as any} color="orange" weight={6} opacity={0.9} dashArray="10, 10" />
                ))}

                {/* Bus Marker */}
                <Marker position={position} icon={busIcon} />

                {/* Alerts */}
                {alerts.map((alert, idx) => (
                    <Marker key={idx} position={[alert.lat, alert.lng]}>
                        <Popup>{alert.type}</Popup>
                    </Marker>
                ))}
            </MapContainer>

            {/* HUD / UI Overlay */}
            <div className="absolute top-4 left-4 right-4 z-[1000] flex flex-col gap-2 pointer-events-none">
                <div className="bg-slate-900/80 backdrop-blur p-4 rounded-2xl border border-slate-700 pointer-events-auto flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <Navigation className="w-5 h-5 text-blue-400" />
                            Línea 370
                        </h2>
                        <p className="text-slate-400 text-sm">Próxima: Av. Italia</p>
                    </div>
                </div>

                {/* DETOUR ALERT */}
                {hasActiveDetour && (
                    <div className="bg-orange-600/90 backdrop-blur p-4 rounded-2xl border border-orange-500 pointer-events-auto animate-pulse flex items-center gap-3 shadow-lg shadow-orange-900/50">
                        <AlertTriangle className="w-8 h-8 text-white" />
                        <div>
                            <h3 className="font-bold text-white text-lg">DESVÍO ACTIVO</h3>
                            <p className="text-orange-100 text-sm">
                                {routeData!.activeDetours[0].name}. Siga la línea naranja.
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Floating Action Button (FAB) */}
            <div className="absolute bottom-6 right-6 z-[1000] flex flex-col gap-4 items-end pointer-events-auto">
                {isMenuOpen && (
                    <div className="flex flex-col gap-3 mb-2 animate-in slide-in-from-bottom-5">
                        <button onClick={() => handleReport('ACCIDENTE')} className="p-4 bg-red-600 rounded-full shadow-lg text-white font-bold flex items-center gap-2">
                            💥 Accidente
                        </button>
                        <button onClick={() => handleReport('DESVIO')} className="p-4 bg-orange-600 rounded-full shadow-lg text-white font-bold flex items-center gap-2">
                            ⛔ Desvío
                        </button>
                        <button onClick={() => handleReport('MANIFESTACION')} className="p-4 bg-indigo-600 rounded-full shadow-lg text-white font-bold flex items-center gap-2">
                            📢 Protesta
                        </button>
                    </div>
                )}

                <button
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className="w-16 h-16 bg-yellow-500 hover:bg-yellow-400 text-slate-900 rounded-full shadow-2xl flex items-center justify-center transition-transform active:scale-95"
                >
                    {isMenuOpen ? <AlertTriangle className="w-8 h-8" /> : <Plus className="w-8 h-8" />}
                </button>
            </div>
        </div>
    );
};

export default DriverNavigation;
