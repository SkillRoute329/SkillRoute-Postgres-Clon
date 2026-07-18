import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getLineaData, getLineVariants } from '../services/ucotLinesService';
import { on as socketOn } from '../clients/socketClient';
import type { LineaUCOT } from '../types/lineasUcot';

interface LiveBus {
  id: string;
  linea: string;
  lat: number;
  lng: number;
  heading: number;
  empresa: string | number;
  direction_id?: number;
}

interface STMLayeredMapProps {
  liveBuses: LiveBus[];
  ucotPath?: Array<{ lat: number; lng: number }>;
  rivalPaths?: Array<{ lineId: string; color: string; path: Array<{ lat: number; lng: number }> }>;
  selectedLineId?: string;
  corridorLabel?: string;
  corridorTerminals?: string;
  corridorRivals?: string[];
  scheduleInfo?: any;
  threatLevel?: 'CRITICAL' | 'WARN' | 'SAFE';
  recommendation?: string;
}

// ─── ICONOS VECTORIALES LEAFLET ────────────────────────────────────────────────
const createBusIcon = (color: string, heading: number, isPulsing: boolean) => {
  return L.divIcon({
    className: 'custom-bus-icon',
    html: `
      <div style="
        position: relative;
        width: 24px;
        height: 24px;
        background-color: ${color};
        border: 2px solid white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 0 5px rgba(0,0,0,0.5);
        ${isPulsing ? 'animation: pulse-red 1s infinite;' : ''}
      ">
        <div style="
          position: absolute;
          width: 0; 
          height: 0; 
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          border-bottom: 10px solid ${color};
          top: -10px;
          transform: rotate(${heading}deg);
          transform-origin: 6px 22px;
        "></div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
};

// ─── COMPONENTE INTERNO DE CONTROL DE CÁMARA Y SOCKETS ──────────────────────────
const MapController: React.FC<{
  setDesvioRuta: (state: boolean) => void;
  setPanicData: (data: any) => void;
}> = ({ setDesvioRuta, setPanicData }) => {
  const map = useMap();

  useEffect(() => {
    const handleIncident = (data: any) => {
      if (data.tipo_incidente === 'DESVIO') {
        setDesvioRuta(true);
      }
      if (data.estado === 'CRITICO' || data.panic_active) {
        setPanicData(data);
        map.flyTo([data.latitud, data.longitud], 17, { animate: true, duration: 1.5 });
      }
    };

    socketOn('incident_reports', handleIncident);
    return () => {
      socketOff('incident_reports', handleIncident);
    };
  }, [map, setDesvioRuta, setPanicData]);

  return null;
};

// ─── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────────
const STMLayeredMap: React.FC<STMLayeredMapProps> = ({
  liveBuses,
  ucotPath,
  rivalPaths,
  selectedLineId,
  corridorRivals,
}) => {
  const [internalUcotPath, setInternalUcotPath] = useState<Array<{ lat: number; lng: number }> | null>(null);
  const [internalRivalPaths, setInternalRivalPaths] = useState<any[] | null>(null);
  
  const [desvioRuta, setDesvioRuta] = useState(false);
  const [panicData, setPanicData] = useState<any>(null);

  // Carga de paths internos
  useEffect(() => {
    let mounted = true;
    if (!ucotPath && selectedLineId) {
      const baseLine = selectedLineId.split(' ')[0];
      getLineVariants(baseLine).then(({ ida }) => {
        if (mounted && ida?.recorrido) {
          setInternalUcotPath(ida.recorrido.filter((p) => p.lat !== 0 && p.lng !== 0));
        }
      });
    }
    return () => { mounted = false; };
  }, [selectedLineId, ucotPath]);

  useEffect(() => {
    let mounted = true;
    if (!rivalPaths && corridorRivals?.length) {
      Promise.allSettled(corridorRivals.map((id) => getLineaData(id))).then((results) => {
        if (!mounted) return;
        const loaded = results
          .map((r, i) => (r.status === 'fulfilled' ? { ...r.value, _id: corridorRivals[i] } : null))
          .filter((r): r is LineaUCOT & { _id: string } => r !== null && !!r.recorrido)
          .map((r) => ({
            lineId: r._id,
            color: '#ef4444',
            path: r.recorrido!.filter((p) => p.lat !== 0 && p.lng !== 0),
          }));
        setInternalRivalPaths(loaded);
      });
    }
    return () => { mounted = false; };
  }, [corridorRivals, rivalPaths]);

  const effectiveUcotPath = ucotPath || internalUcotPath;
  const effectiveRivalPaths = rivalPaths || internalRivalPaths;

  // Renderizado optimizado de vehículos usando mapeo por ID (O(1))
  const renderBuses = useCallback(() => {
    return liveBuses.map((bus) => {
      if (bus.lat === 0 && bus.lng === 0) return null;

      const isUCOT = bus.empresa === 'UCOT' || bus.empresa === 2 || bus.id?.includes('sim-ucot');
      const isPanic = panicData && (panicData.vehicle_id === bus.id || panicData.cocheId === bus.id);
      
      let color = '#9ca3af'; // Gris por defecto (Competencia)
      
      if (isUCOT) {
        if (bus.direction_id === 0) color = '#3b82f6'; // Azul: Ida (ej. Portones)
        else if (bus.direction_id === 1) color = '#22c55e'; // Verde: Vuelta (ej. Cerro)
        else color = '#06b6d4'; // Cyan genérico
      }

      return (
        <Marker 
          key={bus.id} 
          position={[bus.lat, bus.lng]} 
          icon={createBusIcon(color, bus.heading, !!isPanic)}
        >
          <Popup>
            <strong>Coche {bus.id}</strong><br/>
            Línea: {bus.linea}<br/>
            Sentido: {bus.direction_id === 0 ? 'Ida' : bus.direction_id === 1 ? 'Vuelta' : 'N/A'}
          </Popup>
        </Marker>
      );
    });
  }, [liveBuses, panicData]);

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden shadow-2xl bg-slate-900 border border-slate-700">
      
      {/* Modal de Emergencia Sorda / Pánico */}
      {panicData && (
        <div className="absolute top-4 left-4 z-[999] bg-red-950/90 border-2 border-red-500 rounded-lg p-4 shadow-xl text-white max-w-sm animate-pulse">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">🚨</span>
            <h3 className="font-bold text-red-400">ALERTA CRÍTICA: PÁNICO EN CABINA</h3>
          </div>
          <p className="text-sm font-medium">Vehículo: {panicData.vehicle_id || panicData.cocheId}</p>
          <p className="text-xs text-red-200 mt-1">Conductor ID: {panicData.driver_id}</p>
          <p className="text-xs text-red-200">Cartón Activo: {panicData.carton_id}</p>
          <div className="mt-3 text-[10px] text-red-300">Transmitiendo a 1 Hz. Cámara fijada en el incidente.</div>
        </div>
      )}

      {/* CSS inline para pulse */}
      <style>{`
        @keyframes pulse-red {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
          70% { box-shadow: 0 0 0 20px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
      `}</style>

      <MapContainer 
        center={[-34.8952, -56.1663]} 
        zoom={13} 
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        />

        <MapController setDesvioRuta={setDesvioRuta} setPanicData={setPanicData} />

        {effectiveRivalPaths?.map((rival) => (
          <Polyline 
            key={rival.lineId} 
            positions={rival.path} 
            pathOptions={{ color: rival.color, weight: 2, dashArray: '5, 5' }} 
          />
        ))}

        {effectiveUcotPath && (
          <Polyline 
            positions={effectiveUcotPath} 
            pathOptions={{ 
              color: desvioRuta ? '#f97316' : '#06b6d4', 
              weight: 4, 
              opacity: 0.8 
            }} 
          />
        )}

        {renderBuses()}
      </MapContainer>
    </div>
  );
};

export default STMLayeredMap;
