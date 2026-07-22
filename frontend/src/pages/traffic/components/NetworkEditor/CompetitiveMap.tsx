import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

function MapBoundsFitter({ bounds }: { bounds: [number, number][] | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length > 0) {
      map.fitBounds(bounds as any, { padding: [50, 50] });
    }
  }, [bounds, map]);
  return null;
}

import type { HotspotOptimizationData } from './types';

interface CompetitiveMapProps {
  routeCoordinates: [number, number][];
  routeStops: any[];
  competitorCoordinates: [number, number][];
  competitorStops: any[];
  sharedSegments?: [number, number][][];
  selectedLinea: string;
  hotspotData?: HotspotOptimizationData | null;
}

export const CompetitiveMap: React.FC<CompetitiveMapProps> = ({
  routeCoordinates,
  routeStops,
  competitorCoordinates,
  competitorStops,
  sharedSegments = [],
  selectedLinea,
  hotspotData
}) => {
  // Find hotspot coordinates
  let hotspotCoords: [number, number] | null = null;
  if (hotspotData?.hotspot && routeStops.length > 0) {
    // Attempt to match by id or name
    const foundStop = routeStops.find(s => s.id === hotspotData.hotspot?.stop_id || s.nombre === hotspotData.hotspot?.stop_name);
    if (foundStop) {
      hotspotCoords = [foundStop.lat, foundStop.lng];
    }
  }

  return (
    <div className="flex-1 flex flex-col relative bg-[#1a1c23] min-h-0">
      <div className="flex-none h-[30%] lg:h-[40%] min-h-[200px] relative">
        <MapContainer center={[-34.8833, -56.1667]} zoom={13} zoomControl={false} className="h-full w-full">
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
          
          {sharedSegments.map((segment, idx) => (
            <Polyline key={`shared-${idx}`} positions={segment} color="#eab308" weight={8} opacity={1} />
          ))}
          
          {hotspotCoords && (
            <CircleMarker 
              center={hotspotCoords} 
              radius={12} 
              color="#f43f5e" 
              fillColor="#fb7185" 
              fillOpacity={0.8}
              weight={3}
              className="animate-pulse"
            >
              <Popup className="text-slate-900 font-sans">
                <div className="font-bold text-sm mb-1 text-rose-600 flex items-center gap-1">
                  🔥 EPICENTRO: {hotspotData?.hotspot?.stop_name}
                </div>
                <div className="text-xs text-slate-700">
                  Volumen: {hotspotData?.hotspot?.total_boardings.toLocaleString()} pasajeros
                </div>
              </Popup>
            </CircleMarker>
          )}

          {routeCoordinates.length > 0 && (
            <>
              <Polyline positions={routeCoordinates} color="#6366f1" weight={5} opacity={0.9} />
              {routeStops.map((stop, idx) => (
                <CircleMarker 
                  key={`base-stop-${idx}`} 
                  center={[stop.lat, stop.lng]} 
                  radius={4} 
                  color="#4f46e5" 
                  fillColor="#6366f1" 
                  fillOpacity={1}
                  weight={2}
                >
                  <Popup className="text-slate-900 font-sans">
                    <div className="font-bold text-sm mb-1">{stop.nombre}</div>
                    <div className="text-xs text-slate-500">Parada ID: {stop.id}</div>
                  </Popup>
                </CircleMarker>
              ))}
              <MapBoundsFitter bounds={routeCoordinates} />
            </>
          )}

          {competitorCoordinates.length > 0 && (
            <>
              <Polyline positions={competitorCoordinates} color="#f43f5e" weight={3} opacity={0.7} dashArray="10, 10" />
              {competitorStops.map((stop, idx) => (
                <CircleMarker 
                  key={`comp-stop-${idx}`} 
                  center={[stop.lat, stop.lng]} 
                  radius={3} 
                  color="#be123c" 
                  fillColor="#f43f5e" 
                  fillOpacity={0.8}
                  weight={1}
                >
                  <Popup className="text-slate-900 font-sans">
                    <div className="font-bold text-sm mb-1">{stop.nombre}</div>
                    <div className="text-xs text-slate-500">Parada ID: {stop.id}</div>
                  </Popup>
                </CircleMarker>
              ))}
            </>
          )}
        </MapContainer>
        <div className="absolute top-4 right-4 z-[400] bg-slate-900/80 backdrop-blur border border-slate-700 rounded-lg p-3 shadow-lg pointer-events-none">
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <div className="w-4 h-4 rounded-full bg-indigo-500"></div>
            Línea Base: {selectedLinea ? `${selectedLinea.replace(/[ab]$/i, '')} (${selectedLinea.toLowerCase().endsWith('b') ? 'Vuelta' : 'Ida'})` : 'Ninguna'}
          </div>
        </div>
      </div>
    </div>
  );
};
