import React, { useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Tooltip,
  ZoomControl,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { PuntoLatLng } from '../types/lineasUcot';
import { findFrictionZones } from '../utils/tacticalGeom';

interface BusPosition {
  id: string;
  linea: string;
  lat: number;
  lng: number;
  heading: number;
  empresa: string | number;
}

interface TacticalWarMapProps {
  ucotPath: PuntoLatLng[];
  rivalPath?: PuntoLatLng[];
  liveBuses: BusPosition[];
  selectedLineId?: string;
}

const TacticalWarMap: React.FC<TacticalWarMapProps> = ({
  ucotPath,
  rivalPath = [],
  liveBuses,
  selectedLineId,
}) => {
  const frictionZones = useMemo(() => {
    if (ucotPath.length === 0 || rivalPath.length === 0) return [];
    return findFrictionZones(ucotPath, rivalPath, 60);
  }, [ucotPath, rivalPath]);

  // Centro inicial del mapa (Montevideo centro si no hay path)
  const center = ucotPath.length > 0 ? [ucotPath[0].lat, ucotPath[0].lng] : [-34.9011, -56.1645];

  return (
    <div className="h-full w-full bg-slate-900 overflow-hidden relative border border-white/10 rounded-lg">
      <MapContainer
        center={center as [number, number]}
        zoom={14}
        scrollWheelZoom={true}
        className="h-full w-full"
        zoomControl={false}
      >
        {/* Capa de Mapa Dark (CartoDB Dark Matter) */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        <ZoomControl position="bottomright" />

        {/* 1. Recorrido UCOT (Cian) */}
        {ucotPath.length > 0 && (
          <Polyline
            positions={ucotPath.map((p) => [p.lat, p.lng])}
            pathOptions={{
              color: '#06b6d4',
              weight: 4,
              opacity: 0.6,
              lineCap: 'round',
            }}
          />
        )}

        {/* 2. Recorrido Rival (Rojo) */}
        {rivalPath.length > 0 && (
          <Polyline
            positions={rivalPath.map((p) => [p.lat, p.lng])}
            pathOptions={{
              color: '#ef4444',
              weight: 3,
              opacity: 0.4,
              dashArray: '5, 10',
            }}
          />
        )}

        {/* 3. Zonas de Fricción (Glow Púrpura) */}
        {frictionZones.map((zone, idx) => (
          <Polyline
            key={`friction-${idx}`}
            positions={zone.map((p) => [p.lat, p.lng])}
            pathOptions={{
              color: '#a855f7',
              weight: 8,
              opacity: 0.8,
              lineCap: 'round',
            }}
          >
            <Tooltip sticky>ZONA DE FRICCIÓN DETECTADA</Tooltip>
          </Polyline>
        ))}

        {/* 4. Buses en Tiempo Real - Marcadores Direccionales */}
        {liveBuses.map((bus) => {
          const isUCOT =
            bus.empresa === 'UCOT' || bus.empresa === 2 || bus.id?.includes('sim-ucot');
          const isSelected = bus.linea === selectedLineId;

          return (
            <CircleMarker
              key={bus.id}
              center={[bus.lat, bus.lng]}
              radius={isSelected ? 10 : 8}
              pathOptions={{
                fillColor: isUCOT ? '#06b6d4' : '#ef4444',
                color: isSelected ? '#fff' : isUCOT ? '#0e7490' : '#7f1d1d',
                weight: isSelected ? 3 : 1,
                fillOpacity: 1,
              }}
            >
              {/* Tactical Label Overlay */}
              <Tooltip permanent direction="center" className="tactical-unit-label" opacity={1}>
                <div className="flex flex-col items-center">
                  {/* Arrow indicator */}
                  <div
                    ref={(el) => {
                      if (el) el.style.setProperty('--heading', `${bus.heading}deg`);
                    }}
                    className={`tactical-heading-arrow w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[10px] ${isUCOT ? 'border-b-cyan-200' : 'border-b-red-200'}`}
                  ></div>

                  {/* High Visibility ID */}
                  <div
                    className={`mt-3 px-1.5 py-0.5 rounded-sm text-[8px] font-black tracking-tighter shadow-2xl ${
                      isUCOT
                        ? 'bg-cyan-500 text-slate-950 border border-cyan-400'
                        : 'bg-red-600 text-white border border-red-400'
                    }`}
                  >
                    {bus.linea}
                  </div>
                </div>
              </Tooltip>

              <Tooltip direction="top" offset={[0, -20]}>
                <div className="bg-slate-950 text-white p-2 text-[9px] rounded border border-white/10 font-mono shadow-2xl">
                  <div className={`font-black mb-1 ${isUCOT ? 'text-cyan-400' : 'text-red-500'}`}>
                    {isUCOT ? '>> UNIDAD ALIADA' : '!! AMENAZA DETECTADA'}
                  </div>
                  LÍNEA: {bus.linea} | RUMBO: {Math.round(bus.heading)}°
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* Dynamic Map Header Overlay */}
      <div className="absolute top-4 right-16 z-[1000] flex items-center gap-3">
        <div className="bg-slate-950/90 backdrop-blur-md px-4 py-2 border border-white/10 rounded-lg shadow-2xl flex items-center gap-3">
          <div
            className={`h-2 w-2 rounded-full animate-pulse ${selectedLineId ? 'bg-primary-500 shadow-[0_0_8px_#3b82f6]' : 'bg-emerald-500 shadow-[0_0_8px_#10b981]'}`}
          ></div>
          <span className="text-[10px] font-black text-white tracking-[0.2em] uppercase">
            {selectedLineId ? `MODO TÁCTICO: LÍNEA ${selectedLineId}` : 'MONITOREO GLOBAL DE FLOTA'}
          </span>
        </div>
      </div>

      {/* Enhanced Tactical Legend */}
      <div className="absolute top-4 left-4 z-[1000] bg-slate-950/95 backdrop-blur-xl p-4 border border-white/10 rounded-xl shadow-[0_0_30px_rgba(0,0,0,0.5)] pointer-events-none">
        <div className="text-[8px] font-black text-slate-500 mb-3 tracking-widest uppercase border-b border-white/5 pb-1 italic">
          Tactical Assets
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 group">
            <div className="relative">
              <div className="absolute -inset-1 bg-cyan-500/20 blur-sm rounded-full"></div>
              <div className="relative w-4 h-4 rounded-full bg-cyan-500 border-2 border-slate-950 flex items-center justify-center">
                <div className="w-1 h-1 bg-white rounded-full"></div>
              </div>
            </div>
            <span className="text-[9px] font-black text-cyan-400 uppercase tracking-tighter">
              Unidades UCOT
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute -inset-1 bg-red-500/20 blur-sm rounded-full"></div>
              <div className="relative w-4 h-4 rounded-full bg-red-600 border-2 border-slate-950 flex items-center justify-center">
                <div className="w-1 h-1 bg-white rounded-full"></div>
              </div>
            </div>
            <span className="text-[9px] font-black text-red-500 uppercase tracking-tighter">
              Buses Competencia
            </span>
          </div>

          <div className="h-px bg-white/5 my-1"></div>

          <div className="flex items-center gap-3">
            <div className="w-6 h-1 bg-purple-500 shadow-[0_0_10px_#a855f7]"></div>
            <span className="text-[9px] font-black text-purple-400 uppercase tracking-tighter">
              Zona de Fricción
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TacticalWarMap;
