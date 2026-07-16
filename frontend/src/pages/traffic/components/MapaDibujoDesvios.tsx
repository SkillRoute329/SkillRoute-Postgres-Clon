import { useState } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

interface Props {
  onWaypointsChange: (points: [number, number][]) => void;
  initialCenter?: [number, number];
}

const ClickHandler = ({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) => {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

export default function MapaDibujoDesvios({ onWaypointsChange, initialCenter = [-34.89, -56.16] }: Props) {
  const [waypoints, setWaypoints] = useState<[number, number][]>([]);

  const handleMapClick = (lat: number, lng: number) => {
    const newPoints: [number, number][] = [...waypoints, [lat, lng]];
    setWaypoints(newPoints);
    onWaypointsChange(newPoints);
  };

  const undoLast = () => {
    if (waypoints.length === 0) return;
    const newPoints = waypoints.slice(0, -1);
    setWaypoints(newPoints);
    onWaypointsChange(newPoints);
  };

  const clearAll = () => {
    setWaypoints([]);
    onWaypointsChange([]);
  };

  return (
    <div className="relative w-full h-[400px] bg-slate-800 rounded-xl overflow-hidden border border-slate-700">
      <div className="absolute top-2 right-2 z-[400] flex flex-col gap-2">
        <button 
          onClick={undoLast}
          className="bg-slate-900/90 text-white px-3 py-1.5 rounded border border-slate-700 shadow text-xs font-bold hover:bg-slate-800"
        >
          Deshacer Punto
        </button>
        <button 
          onClick={clearAll}
          className="bg-red-900/90 text-white px-3 py-1.5 rounded border border-red-700 shadow text-xs font-bold hover:bg-red-800"
        >
          Limpiar Todo
        </button>
      </div>
      
      <div className="absolute bottom-2 left-2 z-[400] bg-slate-900/80 p-2 rounded border border-slate-700 text-xs text-slate-300 pointer-events-none">
        Haz clic en el mapa para trazar la ruta de desvío.
      </div>

      <MapContainer 
        center={initialCenter} 
        zoom={14} 
        style={{ width: '100%', height: '100%' }}
        preferCanvas
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; OpenStreetMap contributors &copy; CARTO'
        />
        <ClickHandler onMapClick={handleMapClick} />
        
        {waypoints.length > 0 && (
          <Polyline positions={waypoints} color="#ef4444" weight={4} dashArray="5, 10" />
        )}
        
        {waypoints.map((pt, i) => (
          <CircleMarker 
            key={i} 
            center={pt} 
            radius={i === 0 ? 6 : i === waypoints.length - 1 ? 6 : 4} 
            color="#ef4444" 
            fillColor={i === 0 ? "#3b82f6" : "#ef4444"} 
            fillOpacity={1}
            weight={2}
          />
        ))}
      </MapContainer>
    </div>
  );
}
