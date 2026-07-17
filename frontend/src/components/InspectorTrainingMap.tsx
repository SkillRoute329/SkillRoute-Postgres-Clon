import React from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  Tooltip,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { PuntoLatLng } from '../types/lineasUcot';

export interface RivalPathData {
  id: string;
  empresa: string;
  linea: string;
  color: string;
  path: PuntoLatLng[];
}

interface InspectorTrainingMapProps {
  ucotPath: PuntoLatLng[];
  ucotLinea: string;
  rivals: RivalPathData[];
}

const InspectorTrainingMap: React.FC<InspectorTrainingMapProps> = ({
  ucotPath,
  ucotLinea,
  rivals,
}) => {
  // Centro por defecto: si tenemos path principal lo centramos ahí, sino Montevideo centro.
  const center: [number, number] = ucotPath.length > 0 
    ? [ucotPath[Math.floor(ucotPath.length / 2)].lat, ucotPath[Math.floor(ucotPath.length / 2)].lng] 
    : [-34.9011, -56.1645];

  return (
    <div className="w-full h-[400px] rounded-xl overflow-hidden border border-slate-700 shadow-inner">
      <MapContainer
        center={center}
        zoom={14}
        style={{ height: '100%', width: '100%', background: '#0f172a' }}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        {/* Ruta UCOT */}
        {ucotPath.length > 0 && (
          <Polyline
            positions={ucotPath.map((p) => [p.lat, p.lng])}
            color="#3b82f6" // blue-500
            weight={6}
            opacity={0.8}
          >
            <Tooltip sticky className="bg-slate-900 border-blue-500 text-slate-100 font-bold">
              UCOT Lína {ucotLinea}
            </Tooltip>
          </Polyline>
        )}

        {/* Rutas Rivales */}
        {rivals.map((rival) => (
          <Polyline
            key={rival.id}
            positions={rival.path.map((p) => [p.lat, p.lng])}
            color={rival.color}
            weight={4}
            opacity={0.7}
            dashArray="10, 10" // Hacerlas punteadas para diferenciarlas visualmente
          >
            <Tooltip sticky className="bg-slate-900 text-slate-100 font-bold" style={{ borderColor: rival.color }}>
              {rival.empresa} - Línea {rival.linea}
            </Tooltip>
          </Polyline>
        ))}
      </MapContainer>
    </div>
  );
};

export default InspectorTrainingMap;
