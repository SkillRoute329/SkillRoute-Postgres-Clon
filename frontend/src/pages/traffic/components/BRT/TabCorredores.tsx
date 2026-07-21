import React, { useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Route, MapPin, Clock, Zap, Info, Layers } from 'lucide-react';
import { CORREDORES } from '../../data/brtData';
import { brtShapes } from '../../data/brtShapesData';

export default function TabCorredores() {
  const [corredorSel, setCorredorSel] = useState<'A' | 'B'>('A');
  const [mostrarAmbas, setMostrarAmbas] = useState(false);

  const corredor = CORREDORES.find(c => c.id === corredorSel) ?? CORREDORES[0];

  return (
    <div className="space-y-5">
      {/* Selector corredor */}
      <div className="flex flex-wrap gap-3 items-center">
        {CORREDORES.map(c => (
          <button
            key={c.id}
            onClick={() => { setCorredorSel(c.id as 'A' | 'B'); setMostrarAmbas(false); }}
            className={`flex-1 md:flex-none px-4 py-3 rounded-xl border text-sm font-bold transition-all ${
              !mostrarAmbas && corredorSel === c.id
                ? 'bg-slate-800 text-white'
                : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600'
            }`}
            style={{ borderColor: !mostrarAmbas && corredorSel === c.id ? c.color : undefined }}
          >
            <span style={{ color: c.color }}>●</span> {c.nombre}
          </button>
        ))}
        <button
          onClick={() => setMostrarAmbas(v => !v)}
          className={`px-4 py-3 rounded-xl border text-sm font-bold transition-all flex items-center gap-2 ${
            mostrarAmbas
              ? 'bg-slate-700 border-slate-500 text-white'
              : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500'
          }`}
        >
          <Layers className="w-4 h-4" />
          Vista general
        </button>
      </div>

      {/* Datos del corredor seleccionado */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Longitud troncal', valor: `${corredor.kmTroncal} km`, sub: 'carril exclusivo', icon: Route },
          { label: 'Paradas', valor: corredor.paradas.length, sub: 'incluye 1 intercambiador', icon: MapPin },
          { label: 'Tiempo actual', valor: `${corredor.tiempoActualMin} min`, sub: 'extremo a extremo', icon: Clock },
          { label: 'Tiempo BRT', valor: `${corredor.tiempoBRTMin} min`, sub: `${corredor.tiempoActualMin - corredor.tiempoBRTMin} min menos`, icon: Zap },
        ].map(({ label, valor, sub, icon: Icon }) => (
          <div key={label} className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon className="w-4 h-4 text-slate-500" />
              <p className="text-slate-400 text-xs">{label}</p>
            </div>
            <p className="text-2xl font-black text-white">{valor}</p>
            <p className="text-slate-500 text-xs mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Descripción del recorrido */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
        <p className="text-slate-400 text-xs uppercase font-bold mb-2">Recorrido</p>
        <p className="text-white text-sm">{corredor.subtitulo}</p>
        {corredor.id === 'A' && (
          <div className="mt-3 flex items-start gap-2 bg-amber-900/20 border border-amber-700/30 rounded-xl p-3 text-xs text-amber-300">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Línea A circula en <strong>nivel -2</strong> dentro del intercambiador subterráneo de Tres Cruces. El túnel de 8 de Octubre será reconstruido para este nodo.</span>
          </div>
        )}
        {corredor.id === 'B' && (
          <div className="mt-3 flex items-start gap-2 bg-blue-900/20 border border-blue-700/30 rounded-xl p-3 text-xs text-blue-300">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Línea B circula en <strong>nivel -1</strong>. Incluye <strong>5 pasos a desnivel</strong> en Av. Italia para eliminar semáforos críticos.</span>
          </div>
        )}
      </div>

      <div className="mb-3 flex items-start gap-2 bg-slate-800/40 border border-slate-700/40 rounded-xl p-3 text-[11px] text-slate-400">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-500" />
        <span>
          <strong className="text-slate-300">Trazado definitivo (V12).</strong>{' '}
          Las líneas conectan waypoints estratégicos del corredor; el trazado definitivo
          se ajustará al diseño geométrico del proyecto IMM (calles reales, carriles
          exclusivos, accesos a estaciones). Las posiciones de las paradas sí son las
          coordenadas reales propuestas.
        </span>
      </div>

      {/* Mapa */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden relative" style={{ height: 420 }}>
        <MapContainer
          center={[-34.88, -56.09]}
          zoom={12}
          style={{ height: '100%', width: '100%' }}
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; OpenStreetMap'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          {CORREDORES.map(c => {
            const isSelected = c.id === corredorSel;
            const traza = (brtShapes as Record<string, [number, number][]>)[c.id] ?? [];
            if (traza.length < 2) return null; // sin shape real → no se dibuja
            if (mostrarAmbas) {
              return (
                <Polyline
                  key={c.id}
                  positions={traza}
                  color={c.color}
                  weight={5}
                  opacity={0.95}
                />
              );
            }
            if (!isSelected) {
              return (
                <Polyline
                  key={c.id}
                  positions={traza}
                  color={c.color}
                  weight={3}
                  opacity={0.4}
                  dashArray="6,8"
                />
              );
            }
            return (
              <Polyline
                key={c.id}
                positions={traza}
                color={c.color}
                weight={7}
                opacity={1}
              />
            );
          })}
          {(mostrarAmbas ? CORREDORES : [corredor]).flatMap(c =>
            c.paradas.map(p => {
              const isIntercambiador = p.tipo === 'intercambiador';
              const isTerminal = p.tipo === 'terminal';
              const icon = L.divIcon({
                html: `<div style="width:${isIntercambiador ? 16 : isTerminal ? 12 : 8}px;height:${isIntercambiador ? 16 : isTerminal ? 12 : 8}px;border-radius:50%;background:${isIntercambiador ? '#f59e0b' : c.color};border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.5)"></div>`,
                className: '',
                iconSize: [isIntercambiador ? 16 : 10, isIntercambiador ? 16 : 10],
                iconAnchor: [isIntercambiador ? 8 : 5, isIntercambiador ? 8 : 5],
              });
              return (
                <Marker key={`${c.id}-${p.nombre}`} position={[p.lat, p.lng]} icon={icon}>
                  <Popup>
                    <div className="text-xs font-semibold">{p.nombre}</div>
                    <div className="text-xs" style={{ color: c.color }}>{c.nombre}</div>
                    <div className="text-xs text-gray-500">{p.tipo === 'intercambiador' ? '⬇ Nodo subterráneo' : p.tipo}</div>
                  </Popup>
                </Marker>
              );
            })
          )}
          {/* Intercambiador Tres Cruces */}
          <CircleMarker
            center={[-34.896, -56.156]}
            radius={12}
            color="#f59e0b"
            fillColor="#f59e0b"
            fillOpacity={0.25}
            weight={2}
          >
            <Popup>
              <strong>Intercambiador Tres Cruces</strong><br />
              Subterráneo — 2 niveles<br />
              Línea A: nivel -2 · Línea B: nivel -1
            </Popup>
          </CircleMarker>
        </MapContainer>
        {/* Leyenda superpuesta */}
        <div className="absolute bottom-3 left-3 z-[1000] bg-slate-950/90 border border-slate-700 rounded-xl px-3 py-2 flex flex-col gap-1.5 pointer-events-none">
          {CORREDORES.map(c => (
            <div key={c.id} className="flex items-center gap-2 text-xs font-bold">
              <span className="inline-block w-6 h-1.5 rounded-full" style={{ background: c.color, opacity: mostrarAmbas || corredorSel === c.id ? 1 : 0.2 }} />
              <span style={{ color: mostrarAmbas || corredorSel === c.id ? c.color : '#4b5563' }}>{c.nombre}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Lista de paradas */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <p className="font-bold text-sm">{corredor.paradas.length} paradas — {corredor.nombre}</p>
          <p className="text-xs text-slate-500">~500m entre paradas</p>
        </div>
        <div className="divide-y divide-slate-800/60">
          {corredor.paradas.map((p, i) => (
            <div key={p.nombre} className={`flex items-center gap-3 px-4 py-2.5 ${p.tipo === 'intercambiador' ? 'bg-amber-900/10' : ''}`}>
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0"
                style={{ background: p.tipo === 'intercambiador' ? '#f59e0b' : corredor.color, color: 'white' }}
              >
                {i + 1}
              </div>
              <div className="flex-1">
                <p className="text-sm text-white font-medium">{p.nombre}</p>
              </div>
              {p.tipo === 'intercambiador' && (
                <span className="text-[10px] bg-amber-900/40 text-amber-300 border border-amber-700/50 px-2 py-0.5 rounded">
                  INTERCAMBIADOR
                </span>
              )}
              {p.tipo === 'terminal' && (
                <span className="text-[10px] bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded">
                  TERMINAL
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
