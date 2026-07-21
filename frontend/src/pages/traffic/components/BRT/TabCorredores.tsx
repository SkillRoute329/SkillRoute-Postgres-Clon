import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Route, MapPin, Clock, Zap, Info, Layers, Edit2, Save, X } from 'lucide-react';
import { CORREDORES as FALLBACK_CORREDORES } from '../../data/brtData';
import { brtShapes } from '../../data/brtShapesData';

export default function TabCorredores() {
  const [corredores, setCorredores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [corredorSel, setCorredorSel] = useState<string>('A');
  const [mostrarAmbas, setMostrarAmbas] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchCorredores();
  }, []);

  const fetchCorredores = async () => {
    try {
      const res = await fetch('/api/brt/corredores');
      if (!res.ok) throw new Error('API Error');
      const { data } = await res.json();
      const mapped = data.map((d: any) => ({
        id: d.id,
        lineaRef: d.linea_ref,
        nombre: d.nombre,
        subtitulo: d.subtitulo,
        color: d.color,
        colorBg: d.color_bg,
        colorText: d.color_text,
        colorBorder: d.color_border,
        kmTroncal: Number(d.km_troncal),
        tiempoActualMin: Number(d.tiempo_actual_min),
        tiempoBRTMin: Number(d.tiempo_brt_min),
        pasajerosDiaDireccion: Number(d.pasajeros_dia_direccion),
        niveles: typeof d.niveles === 'string' ? JSON.parse(d.niveles) : d.niveles,
        paradas: typeof d.paradas === 'string' ? JSON.parse(d.paradas) : d.paradas,
        lineasUCOTAfectadas: typeof d.lineas_ucot_afectadas === 'string' ? JSON.parse(d.lineas_ucot_afectadas) : d.lineas_ucot_afectadas
      }));
      setCorredores(mapped);
      if (!mapped.find((c: any) => c.id === corredorSel) && mapped.length > 0) {
        setCorredorSel(mapped[0].id);
      }
    } catch (err) {
      console.warn('Usando fallback estático para corredores', err);
      setCorredores(FALLBACK_CORREDORES);
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (c: any) => {
    setEditForm({ ...c });
    setIsEditing(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        linea_ref: editForm.lineaRef,
        nombre: editForm.nombre,
        subtitulo: editForm.subtitulo,
        color: editForm.color,
        color_bg: editForm.colorBg,
        color_text: editForm.colorText,
        color_border: editForm.colorBorder,
        km_troncal: editForm.kmTroncal,
        tiempo_actual_min: editForm.tiempoActualMin,
        tiempo_brt_min: editForm.tiempoBRTMin,
        pasajeros_dia_direccion: editForm.pasajerosDiaDireccion,
        niveles: editForm.niveles,
        paradas: editForm.paradas,
        lineas_ucot_afectadas: editForm.lineasUCOTAfectadas,
      };

      const res = await fetch(`/api/brt/corredores/${editForm.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Error al guardar');
      await fetchCorredores();
      setIsEditing(false);
    } catch (err) {
      console.error(err);
      alert('Error guardando corredor. Revise la consola o intente si la BD local está encendida.');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return <div className="text-white p-4">Cargando corredores...</div>;

  const corredor = corredores.find((c: any) => c.id === corredorSel) || corredores[0];
  if (!corredor) return <div className="text-white p-4">Sin datos.</div>;

  return (
    <div className="space-y-5">
      {/* Selector corredor */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-3 items-center">
          {corredores.map((c: any) => (
            <button
              key={c.id}
              onClick={() => { setCorredorSel(c.id); setMostrarAmbas(false); setIsEditing(false); }}
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
            onClick={() => { setMostrarAmbas(v => !v); setIsEditing(false); }}
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
        {!mostrarAmbas && !isEditing && (
          <button
            onClick={() => handleEditClick(corredor)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center gap-2 text-sm transition-colors"
          >
            <Edit2 className="w-4 h-4" />
            Editar Corredor
          </button>
        )}
      </div>

      {isEditing ? (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 mb-5 shadow-xl">
          <div className="flex items-center justify-between mb-4 border-b border-slate-700 pb-3">
            <h3 className="text-white font-bold flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-emerald-400" />
              Editando: {corredor.nombre}
            </h3>
            <button onClick={() => setIsEditing(false)} className="text-slate-400 hover:text-white p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Nombre</label>
              <input
                type="text"
                value={editForm.nombre}
                onChange={e => setEditForm({...editForm, nombre: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Km Troncal</label>
              <input
                type="number"
                value={editForm.kmTroncal}
                onChange={e => setEditForm({...editForm, kmTroncal: Number(e.target.value)})}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Tiempo Actual (min)</label>
              <input
                type="number"
                value={editForm.tiempoActualMin}
                onChange={e => setEditForm({...editForm, tiempoActualMin: Number(e.target.value)})}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Tiempo BRT (min)</label>
              <input
                type="number"
                value={editForm.tiempoBRTMin}
                onChange={e => setEditForm({...editForm, tiempoBRTMin: Number(e.target.value)})}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
          <div className="mb-5">
            <label className="block text-xs font-semibold text-slate-400 mb-1">Pasajeros/Día/Dirección</label>
            <input
              type="number"
              value={editForm.pasajerosDiaDireccion}
              onChange={e => setEditForm({...editForm, pasajerosDiaDireccion: Number(e.target.value)})}
              className="w-full md:w-1/4 bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div className="flex justify-end gap-3 border-t border-slate-700 pt-4">
            <button
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 bg-transparent text-slate-300 hover:text-white rounded-lg text-sm"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold flex items-center gap-2 text-sm transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Datos del corredor seleccionado */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Longitud troncal', valor: `${corredor.kmTroncal} km`, sub: 'carril exclusivo', icon: Route },
              { label: 'Paradas', valor: corredor.paradas?.length || 0, sub: 'incluye 1 intercambiador', icon: MapPin },
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
        </>
      )}

      <div className="mb-3 flex items-start gap-2 bg-slate-800/40 border border-slate-700/40 rounded-xl p-3 text-[11px] text-slate-400">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-500" />
        <span>
          <strong className="text-slate-300">Trazado definitivo (V12).</strong>{' '}
          Las líneas conectan waypoints estratégicos del corredor; el trazado definitivo
          se ajustará al diseño geométrico del proyecto IMM.
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
          {corredores.map((c: any) => {
            const isSelected = c.id === corredorSel;
            const traza = (brtShapes as Record<string, [number, number][]>)[c.id] ?? [];
            if (traza.length < 2) return null;
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
          {(mostrarAmbas ? corredores : [corredor]).flatMap((c: any) =>
            (c.paradas || []).map((p: any) => {
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
        <div className="absolute bottom-3 left-3 z-[1000] bg-slate-950/90 border border-slate-700 rounded-xl px-3 py-2 flex flex-col gap-1.5 pointer-events-none">
          {corredores.map((c: any) => (
            <div key={c.id} className="flex items-center gap-2 text-xs font-bold">
              <span className="inline-block w-6 h-1.5 rounded-full" style={{ background: c.color, opacity: mostrarAmbas || corredorSel === c.id ? 1 : 0.2 }} />
              <span style={{ color: mostrarAmbas || corredorSel === c.id ? c.color : '#4b5563' }}>{c.nombre}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Lista de paradas */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden mt-3">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <p className="font-bold text-sm">{(corredor.paradas || []).length} paradas — {corredor.nombre}</p>
          <p className="text-xs text-slate-500">~500m entre paradas</p>
        </div>
        <div className="divide-y divide-slate-800/60 max-h-64 overflow-y-auto">
          {(corredor.paradas || []).map((p: any, i: number) => (
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
