/**
 * Componente: Mapa de Vehículos en Vivo
 * Muestra ubicación en tiempo real de todos los vehículos
 */

import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { useLocationUpdates, useSocketLatency } from '../../hooks/useRealtimeData';
import { useSocket } from '../../hooks/useSocket';
import { joinRoom, leaveRoom } from '../../services/socketService';

// Icono personalizado para vehículos
const vehicleIcon = new L.Icon({
  iconUrl:
    'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIGZpbGw9IiNFRjQ0NDQiIHJ4PSI0Ii8+PHBhdGggZD0iTTEyIDZDMTAuODk1IDYgMTAgNi44OTUgMTAgOFY5SDhWOEM4IDYuMzQzIDkuMzQzIDUgMTEgNUgxM0MxNC42NTcgNSAxNiA2LjM0MyAxNiA4Vjl2NMNWNDU4IC43OTQgMTEuMjA1IDEwIDE5VjE4SDcuNkMxLjY2IDEyLjkzMyAwIDEwIC41IDE0LjE4OEwxMCA4Ljc1TDE0IDEwLjVWN0gxMFY2WiIgZmlsbD0id2hpdGUiLz48L3N2Zz4=',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16],
});

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
  const { connected } = useSocket(
    {
      id: 'map-component',
      internalNumber: '0000',
      fullName: 'Map Viewer',
      role: 'User',
    },
    { autoConnect: false },
  );

  // Unirse a salas de monitoreo específico
  useEffect(() => {
    if (monitorSpecificVehicles.length > 0) {
      monitorSpecificVehicles.forEach((vehicleId) => {
        joinRoom(`vehicle-${vehicleId}`);
      });

      return () => {
        monitorSpecificVehicles.forEach((vehicleId) => {
          leaveRoom(`vehicle-${vehicleId}`);
        });
      };
    }
  }, [monitorSpecificVehicles]);

  // Obtener vehículos a mostrar
  const vehiclesToShow = Object.entries(locations)
    .filter(([vehicleId]) => {
      if (monitorSpecificVehicles.length === 0) return true;
      return monitorSpecificVehicles.includes(vehicleId);
    })
    .map(([id, location]) => ({
      ...location,
      vehicleId: id,
    }));

  // Centro del mapa (promedio de ubicaciones)
  const center: [number, number] =
    vehiclesToShow.length > 0
      ? [
          vehiclesToShow.reduce((sum, loc) => sum + loc.latitude, 0) / vehiclesToShow.length,
          vehiclesToShow.reduce((sum, loc) => sum + loc.longitude, 0) / vehiclesToShow.length,
        ]
      : [40.7128, -74.006]; // NYC por defecto

  return (
    <div className="w-full bg-white rounded-lg shadow">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-gray-800">{title}</h2>
          <p className="text-sm text-gray-500">{vehiclesToShow.length} vehículos en línea</p>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-4">
          {latency && (
            <div className="text-xs text-gray-600">
              Latencia: <span className="font-bold">{latency}ms</span>
            </div>
          )}

          <div
            className={`px-3 py-1 rounded-full text-sm font-medium ${
              connected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}
          >
            {connected ? '🟢 En vivo' : '🔴 Fuera de línea'}
          </div>
        </div>
      </div>

      {/* Mapa */}
      <style>{`.live-map-wrapper { height: ${height}; width: 100%; } .live-map-container { height: 100%; z-index: 0; }`}</style>
      <div className="relative live-map-wrapper">
        {vehiclesToShow.length > 0 ? (
          <MapContainer center={center} zoom={zoom} className="live-map-container">
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
            />

            {/* Markers de vehículos */}
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
                    {vehicle.speed && <p>Velocidad: {vehicle.speed} km/h</p>}
                    <p className="text-xs text-gray-500">
                      {new Date(vehicle.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        ) : (
          <div className="h-full flex items-center justify-center bg-gray-50">
            <p className="text-gray-500">
              {connected ? 'Esperando datos de ubicación...' : 'Conectando a Socket.io...'}
            </p>
          </div>
        )}
      </div>

      {/* Footer con lista de vehículos */}
      <div className="p-4 border-t border-gray-200 max-h-40 overflow-y-auto">
        <h3 className="font-semibold text-sm text-gray-700 mb-2">Vehículos en línea:</h3>
        <div className="grid grid-cols-2 gap-2">
          {vehiclesToShow.map((vehicle) => (
            <div key={vehicle.vehicleId} className="text-xs p-2 bg-gray-50 rounded">
              <p className="font-medium">{vehicle.vehicleId}</p>
              <p className="text-gray-600">{vehicle.speed ? `${vehicle.speed} km/h` : 'Parado'}</p>
              <p className="text-gray-500 text-xs">
                {new Date(vehicle.timestamp).toLocaleTimeString()}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LiveVehicleMap;
