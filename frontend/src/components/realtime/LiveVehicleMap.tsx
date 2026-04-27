import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { useLocationUpdates, useSocketLatency } from '../../hooks/useRealtimeData';

const vehicleIcon = new L.Icon({
  iconUrl:
    'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIGZpbGw9IiMzQjgyRjYiIHJ4PSI0Ii8+PHBhdGggZD0iTTEyIDZDMTAuODk1IDYgMTAgNi44OTUgMTAgOFY5SDhWOEM4IDYuMzQzIDkuMzQzIDUgMTEgNUgxM0MxNC42NTcgNSAxNiA2LjM0MyAxNiA4Vjl2NMNWNDU4IC43OTQgMTEuMjA1IDEwIDE5VjE4SDdIVjE0LjE4OEwxMCA4Ljc1TDE0IDEwLjVWN0gxMFY2WiIgZmlsbD0id2hpdGUiLz48L3N2Zz4=',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16],
});

// Centro por defecto: Montevideo
const MONTEVIDEO: [number, number] = [-34.9011, -56.1645];

interface LiveVehicleMapProps {
  title?: string;
  height?: string;
  zoom?: number;
  monitorSpecificVehicles?: string[];
}

export const LiveVehicleMap: React.FC<LiveVehicleMapProps> = ({
  title = 'Flota en Vivo',
  height = '500px',
  zoom = 12,
  monitorSpecificVehicles = [],
}) => {
  const { locations } = useLocationUpdates();
  const { latency } = useSocketLatency();

  const vehiclesToShow = Object.entries(locations)
    .filter(([vehicleId]) =>
      monitorSpecificVehicles.length === 0 || monitorSpecificVehicles.includes(vehicleId),
    )
    .map(([id, location]) => ({ ...location, vehicleId: id }));

  const center: [number, number] =
    vehiclesToShow.length > 0
      ? [
          vehiclesToShow.reduce((sum, loc) => sum + loc.latitude, 0) / vehiclesToShow.length,
          vehiclesToShow.reduce((sum, loc) => sum + loc.longitude, 0) / vehiclesToShow.length,
        ]
      : MONTEVIDEO;

  const isLive = vehiclesToShow.length > 0;

  return (
    <div className="w-full bg-slate-900 rounded-xl border border-slate-800 shadow-xl">
      <div className="p-4 border-b border-slate-800 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <p className="text-sm text-slate-400">{vehiclesToShow.length} vehículos en línea</p>
        </div>
        <div className="flex items-center gap-3">
          {latency != null && (
            <span className="text-xs text-slate-500">
              Latencia: <span className="font-bold text-slate-300">{latency}ms</span>
            </span>
          )}
          <span
            className={`px-3 py-1 rounded-full text-xs font-bold ${
              isLive
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-slate-800 text-slate-500 border border-slate-700'
            }`}
          >
            {isLive ? 'EN VIVO' : 'SIN DATOS'}
          </span>
        </div>
      </div>

      <style>{`.live-map-wrapper { height: ${height}; width: 100%; } .live-map-container { height: 100%; z-index: 0; border-radius: 0; }`}</style>
      <div className="relative live-map-wrapper">
        {isLive ? (
          <MapContainer center={center} zoom={zoom} className="live-map-container">
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="© OpenStreetMap"
            />
            {vehiclesToShow.map((vehicle) => (
              <Marker
                key={vehicle.vehicleId}
                position={[vehicle.latitude, vehicle.longitude]}
                icon={vehicleIcon}
              >
                <Popup>
                  <div className="text-sm">
                    <p className="font-bold">{vehicle.vehicleId}</p>
                    <p>Lat: {vehicle.latitude.toFixed(4)}</p>
                    <p>Lon: {vehicle.longitude.toFixed(4)}</p>
                    {vehicle.speed ? <p>Velocidad: {vehicle.speed} km/h</p> : null}
                    <p className="text-xs text-gray-500">
                      {new Date(vehicle.timestamp).toLocaleTimeString('es-UY')}
                    </p>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        ) : (
          <MapContainer center={MONTEVIDEO} zoom={zoom} className="live-map-container">
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="© OpenStreetMap"
            />
          </MapContainer>
        )}
        {!isLive && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 z-10">
            <p className="text-slate-400 text-sm">Esperando datos GPS…</p>
          </div>
        )}
      </div>

      {vehiclesToShow.length > 0 && (
        <div className="p-4 border-t border-slate-800 max-h-40 overflow-y-auto">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            Vehículos activos
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {vehiclesToShow.map((vehicle) => (
              <div key={vehicle.vehicleId} className="text-xs p-2 bg-slate-800 rounded-lg">
                <p className="font-medium text-white">{vehicle.vehicleId}</p>
                <p className="text-slate-400">
                  {vehicle.speed ? `${vehicle.speed} km/h` : 'Detenido'}
                </p>
                <p className="text-slate-500 text-[10px]">
                  {new Date(vehicle.timestamp).toLocaleTimeString('es-UY')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveVehicleMap;
