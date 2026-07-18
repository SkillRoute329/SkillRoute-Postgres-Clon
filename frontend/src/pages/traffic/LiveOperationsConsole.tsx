import { useState, useEffect, useCallback, useRef } from 'react';
import { useLiveOperations, type ServicioActivo, type DesvioReportado, type IncidenciaReportada } from '../../hooks/useLiveOperations';
import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';
import { MapContainer, TileLayer, Marker, Popup, useMap, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Activity, AlertTriangle, Bus, TrendingUp, RefreshCw, 
  MapPin, Eye, Search, Zap, Siren, CheckCircle, Sliders,
  Building2, ArrowRight, X, Clock, ShieldAlert
} from 'lucide-react';
import { updateDoc, doc } from '../../config/firestoreShim';
import { db } from '../../config/firebase';
import TrafficAlertsBanner from '../../components/TrafficAlertsBanner';

const EMPRESA_COLORES: Record<string, string> = {
  UCOT:   '#eab308', // Amarillo
  CUTCSA: '#3b82f6', // Azul
  COETC:  '#ef4444', // Rojo
  COME:   '#22c55e', // Verde
};

const MONTEVIDEO_CENTER: [number, number] = [-34.9, -56.16];

// ─── Íconos Leaflet Customizados ──────────────────────────────────────────────

function makeBusIcon(color: string, label: string, tieneAlerta = false) {
  const borderStyle = tieneAlerta 
    ? 'border: 3px solid #f87171; box-shadow: 0 0 12px #ef4444;' 
    : 'border: 2px solid rgba(255,255,255,0.7); box-shadow: 0 2px 6px rgba(0,0,0,0.4);';
  
  const pulseClass = tieneAlerta ? 'animate-pulse' : '';

  return L.divIcon({
    html: `
      <div class="${pulseClass}" style="
        background:${color};
        color:#000;
        padding:3px 6px;
        border-radius:6px;
        font-size:10px;
        font-weight:900;
        white-space:nowrap;
        font-family:sans-serif;
        text-align:center;
        ${borderStyle}
      ">
        ${label}
      </div>
    `,
    className: '',
    iconSize: [44, 22],
    iconAnchor: [22, 11],
    popupAnchor: [0, -12]
  });
}

// ─── Control de Mapas ─────────────────────────────────────────────────────────

interface MapControllerProps {
  center: [number, number] | null;
  zoom?: number;
}

function MapController({ center, zoom = 14 }: MapControllerProps) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, zoom, { animate: true });
    }
  }, [center, map, zoom]);
  return null;
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function LiveOperationsConsole() {
  const { empresaPropia, setEmpresaPropia } = useEmpresaPropia();
  const {
    serviciosPropios,
    serviciosRivales,
    desvios,
    incidencias,
    bunching,
    kpis,
    loading,
    error,
    lastUpdate,
    empresaCfg,
    refrescar
  } = useLiveOperations();

  const [activeTab, setActiveTab] = useState<'alertas' | 'flota' | 'bunching'>('alertas');
  const [lineaFiltro, setLineaFiltro] = useState<string>('todas');
  const [buscarFiltro, setBuscarFiltro] = useState<string>('');
  const [mostrarRivales, setMostrarRivales] = useState<boolean>(true);
  const [paradaSel, setParadaSel] = useState<any>(null);
  
  // Para enfocar buses desde la lista lateral
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  
  // Referencias a los markers de Leaflet para abrirlos programáticamente
  const markersRef = useRef<Record<string, L.Marker>>({});

  const focusBusOnMap = (bus: ServicioActivo) => {
    setMapCenter([bus.lat, bus.lng]);
    setSelectedBusId(bus.id);
    setTimeout(() => {
      const marker = markersRef.current[bus.id];
      if (marker) {
        marker.openPopup();
      }
    }, 150);
  };

  // Resolver alertas en tiempo real
  const [resolviendoId, setResolviendoId] = useState<string | null>(null);
  const resolverDesvio = async (desvioId: string) => {
    setResolviendoId(desvioId);
    try {
      await updateDoc(doc(db, 'eventos_desvio', desvioId), { resuelto: true });
    } catch (err) {
      console.error('[LiveConsole] Error al resolver desvio:', err);
    } finally {
      setResolviendoId(null);
    }
  };

  // Filtrado de Buses Propios
  const lineasPropias = [...new Set(serviciosPropios.map(s => s.linea).filter(Boolean))].sort();

  const propiosFiltrados = serviciosPropios.filter(bus => {
    const cumpleLinea = lineaFiltro === 'todas' || bus.linea === lineaFiltro;
    
    const busqueda = buscarFiltro.toLowerCase().trim();
    const cumpleBusqueda = !busqueda || 
      bus.codigoBus.includes(busqueda) ||
      bus.linea.includes(busqueda) ||
      (bus.choferNombre && bus.choferNombre.toLowerCase().includes(busqueda)) ||
      (bus.choferLegajo && bus.choferLegajo.includes(busqueda));

    return cumpleLinea && cumpleBusqueda;
  });

  const todosEnMapa = mostrarRivales
    ? [...propiosFiltrados, ...serviciosRivales]
    : propiosFiltrados;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-slate-950 text-slate-100 overflow-hidden">
      <TrafficAlertsBanner />

      {/* ── Header Unificado ────────────────────────────────────────────────── */}
      <header className="flex-none px-6 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-4 flex-wrap z-10 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center border border-blue-500/20">
            <Activity className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-black text-white flex items-center gap-2">
              Consola de Servicios en Vía
              <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
                EN VIVO
              </span>
            </h1>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
              <Building2 className="w-3.5 h-3.5" />
              <select 
                value={empresaPropia} 
                onChange={(e) => setEmpresaPropia(Number(e.target.value))} 
                className="bg-slate-800 border border-slate-700 rounded-md px-2 py-0.5 text-xs text-white outline-none focus:border-blue-500"
              >
                <option value={70}>UCOT</option>
                <option value={50}>CUTCSA</option>
                <option value={20}>COME</option>
                <option value={10}>COETC</option>
              </select>
              {lastUpdate && (
                <span>
                  · Act. {lastUpdate.toLocaleTimeString('es-UY')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* KPIs de Control de Calidad */}
        <div className="flex items-center gap-2 flex-wrap max-w-full">
          {[
            { label: 'Propios', value: kpis.totalPropios, color: 'text-amber-400', icon: Bus },
            { label: 'Rivales', value: kpis.totalRivales, color: 'text-blue-400', icon: Activity },
            { label: 'Desvíos', value: kpis.desviosAbiertos, color: kpis.desviosAbiertos > 0 ? 'text-red-400' : 'text-slate-500', icon: AlertTriangle },
            { label: 'Incidencias', value: kpis.incidenciasAbiertas, color: kpis.incidenciasAbiertas > 0 ? 'text-orange-400' : 'text-slate-500', icon: Siren },
            { label: 'Bunching', value: kpis.bunchingPares, color: kpis.bunchingPares > 0 ? 'text-red-500 animate-pulse' : 'text-slate-500', icon: ShieldAlert },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} className="bg-slate-800/60 border border-slate-700/30 rounded-xl px-4 py-2 flex items-center gap-2.5 shadow-md">
              <Icon className={`w-4 h-4 flex-none ${color}`} />
              <div>
                <p className={`text-base font-black leading-none ${color}`}>{value}</p>
                <p className="text-[9px] text-slate-500 uppercase tracking-wider font-bold mt-1">{label}</p>
              </div>
            </div>
          ))}

          <button
            onClick={refrescar}
            disabled={loading}
            className="ml-2 p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700 transition-all disabled:opacity-50"
            title="Recargar datos GPS"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* ── Controles de Filtros Rápidos ────────────────────────────────────── */}
      <section className="flex-none px-6 py-3 bg-slate-900/40 border-b border-slate-800 flex items-center justify-between gap-4 flex-wrap z-10">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Selector de Línea */}
          <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Línea:</span>
            <select
              value={lineaFiltro}
              onChange={(e) => setLineaFiltro(e.target.value)}
              className="bg-transparent text-xs text-white outline-none border-none pr-2"
            >
              <option value="todas">Todas las líneas</option>
              {lineasPropias.map((l) => (
                <option key={l} value={l}>Línea {l}</option>
              ))}
            </select>
          </div>

          {/* Toggle Mostrar Rivales */}
          <button
            onClick={() => setMostrarRivales(v => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
              mostrarRivales
                ? 'bg-blue-900/10 border-blue-500/30 text-blue-300'
                : 'bg-slate-800/40 border-slate-700 text-slate-500'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            {mostrarRivales ? 'Mostrar Rivales' : 'Ocultar Rivales'}
          </button>
        </div>

        {/* Barra de Búsqueda Global */}
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={buscarFiltro}
            onChange={(e) => setBuscarFiltro(e.target.value)}
            placeholder="Buscar por interno, conductor o línea..."
            className="w-full pl-9 pr-8 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500"
          />
          {buscarFiltro && (
            <button 
              onClick={() => setBuscarFiltro('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </section>

      {/* ── Contenido Principal (Mapa + Panel Lateral) ─────────────────────── */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        
        {/* MAPA (Lado Izquierdo - 70%) */}
        <div className="flex-1 h-full relative z-0">
          {loading && (
            <div className="absolute inset-0 z-[1000] flex flex-col items-center justify-center bg-slate-950/75 backdrop-blur-sm gap-3">
              <RefreshCw className="w-10 h-10 animate-spin text-blue-400" />
              <p className="text-sm text-slate-400 font-semibold">Cargando consola y telemetría de tránsito...</p>
            </div>
          )}

          <MapContainer
            center={MONTEVIDEO_CENTER}
            zoom={13}
            className="h-full w-full"
            style={{ background: '#090d16' }}
          >
            <TileLayer
              attribution='&copy; OSM | IMM Montevideo'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />
            
            <MapController center={mapCenter} />

            {/* Marcadores de Servicios Activos */}
            {todosEnMapa.map((bus) => {
              const esPropio = bus.empresaId === empresaPropia;
              const color = esPropio ? '#eab308' : (EMPRESA_COLORES[bus.empresa] ?? '#94a3b8');
              const tieneAlerta = !!(bus.desvio || bus.incidencia);

              return (
                <Marker
                  key={bus.id}
                  position={[bus.lat, bus.lng]}
                  icon={makeBusIcon(color, `${bus.linea || '?'}`, tieneAlerta)}
                  ref={(ref) => {
                    if (ref) markersRef.current[bus.id] = ref;
                    else delete markersRef.current[bus.id];
                  }}
                >
                  <Popup>
                    <div className="text-xs min-w-[220px] font-sans text-slate-900 space-y-2">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                        <span className="font-black text-sm text-slate-800">
                          Línea {bus.linea}
                        </span>
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          {bus.empresa}
                        </span>
                      </div>

                      {/* Información de Conductor (Listero) */}
                      {esPropio ? (
                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 space-y-1">
                          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                            Conductor Asignado (Turno)
                          </div>
                          {bus.choferNombre ? (
                            <div>
                              <p className="font-bold text-slate-800 leading-none">
                                {bus.choferNombre}
                              </p>
                              {bus.choferLegajo && (
                                <p className="text-[10px] text-slate-500 mt-0.5">
                                  Legajo: {bus.choferLegajo} {bus.horaInicio ? `· Entrada: ${bus.horaInicio}` : ''}
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="text-slate-400 italic">No cargado en listero de hoy</p>
                          )}
                        </div>
                      ) : null}

                      <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-600">
                        <div>
                          <strong>Interno:</strong> {bus.codigoBus}
                        </div>
                        <div>
                          <strong>Velocidad:</strong> {bus.velocidad} km/h
                        </div>
                        {bus.sublinea && (
                          <div className="col-span-2">
                            <strong>Variante:</strong> {bus.sublinea}
                          </div>
                        )}
                        <div className="col-span-2 truncate">
                          <strong>Destino:</strong> {bus.destino}
                        </div>
                      </div>

                      {/* Alertas Operativas */}
                      {bus.desvio && (
                        <div className="bg-red-50 border border-red-200 text-red-700 p-2 rounded-lg space-y-1">
                          <div className="flex items-center gap-1.5 font-bold text-[10px] uppercase">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                            Alerta de Desvío
                          </div>
                          <p className="text-[10px]">
                            {bus.desvio.tipo === 'FUERA_DE_RUTA' ? 'Fuera de ruta oficial' : 'Fuera de desvío oficial'}
                            {bus.desvio.metros_fuera ? ` (${bus.desvio.metros_fuera}m)` : ''}
                          </p>
                          {esPropio && (
                            <button
                              onClick={() => resolverDesvio(bus.desvio!.id)}
                              disabled={resolviendoId === bus.desvio.id}
                              className="w-full mt-1 bg-red-600 hover:bg-red-700 text-white rounded py-1 text-[10px] font-bold transition-colors disabled:opacity-50"
                            >
                              {resolviendoId === bus.desvio.id ? 'Resolviendo...' : 'Resolver Desvío'}
                            </button>
                          )}
                        </div>
                      )}

                      {bus.incidencia && (
                        <div className="bg-orange-50 border border-orange-200 text-orange-700 p-2 rounded-lg space-y-1">
                          <div className="flex items-center gap-1.5 font-bold text-[10px] uppercase">
                            <Siren className="w-3.5 h-3.5 text-orange-500" />
                            Incidencia: {bus.incidencia.prioridad}
                          </div>
                          <p className="text-[10px] font-medium">{bus.incidencia.titulo}</p>
                        </div>
                      )}
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>

        {/* PANEL LATERAL DE DESPACHO (Lado Derecho - 30%) */}
        <div className="w-[380px] h-full flex flex-col bg-slate-900 border-l border-slate-800 z-10 shrink-0">
          
          {/* Navegación del Panel Lateral */}
          <div className="flex border-b border-slate-800 bg-slate-950/40">
            {[
              { key: 'alertas', label: 'Alertas', icon: Siren },
              { key: 'flota', label: 'Flota y Turnos', icon: Bus },
              { key: 'bunching', label: 'Bunching', icon: AlertTriangle },
            ].map(t => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key as any)}
                  className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 border-b-2 transition-all ${
                    activeTab === t.key 
                      ? 'border-blue-500 text-white bg-slate-800/40' 
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {t.label}
                  {t.key === 'alertas' && (kpis.desviosAbiertos + kpis.incidenciasAbiertas) > 0 && (
                    <span className="bg-red-500 text-white text-[10px] font-black rounded-full px-1.5 py-px animate-bounce">
                      {kpis.desviosAbiertos + kpis.incidenciasAbiertas}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Contenido del Panel según Tab */}
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            
            {/* TAB: Alertas y Despacho */}
            {activeTab === 'alertas' && (
              <div className="space-y-4">
                
                {/* Desvíos Activos */}
                <div className="space-y-2">
                  <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <AlertTriangle className="w-4.5 h-4.5 text-red-400" />
                    Alertas de Desvío Activas
                  </h3>
                  {desvios.filter(d => !d.resuelto).length === 0 ? (
                    <div className="bg-slate-950/30 border border-slate-800 rounded-xl p-6 text-center text-xs text-slate-500">
                      <CheckCircle className="w-8 h-8 mx-auto mb-2 text-emerald-500/60" />
                      No hay desvíos activos — Operación normal
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {desvios.filter(d => !d.resuelto).map(d => {
                        const busAsoc = propiosFiltrados.find(p => p.codigoBus === String(d.coche_id));
                        return (
                          <div 
                            key={d.id}
                            className="bg-slate-800/60 border border-slate-700/50 hover:border-red-500/30 rounded-xl p-3 flex flex-col gap-2.5 transition-all shadow-md group"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h4 className="text-xs font-bold text-slate-200">
                                  Coche {d.coche_id} · Línea {d.linea_id}
                                </h4>
                                <p className="text-[10px] text-slate-400 mt-1">
                                  {d.tipo === 'FUERA_DE_RUTA' ? 'Fuera de ruta oficial' : 'Fuera de desvío oficial'}
                                  {d.metros_fuera ? ` (${d.metros_fuera}m)` : ''}
                                </p>
                              </div>
                              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                                Desvío
                              </span>
                            </div>

                            {busAsoc && busAsoc.choferNombre && (
                              <div className="text-[10px] bg-slate-900/40 p-2 rounded-lg border border-slate-700/30">
                                <span className="text-slate-500">Conductor:</span> <span className="font-bold text-slate-300">{busAsoc.choferNombre}</span>
                              </div>
                            )}

                            <div className="flex items-center gap-2 mt-1">
                              {busAsoc && (
                                <button
                                  onClick={() => focusBusOnMap(busAsoc)}
                                  className="flex-1 bg-slate-800 border border-slate-700 hover:bg-slate-700 hover:border-slate-600 rounded-lg py-1.5 text-[10px] font-bold text-slate-300 flex items-center justify-center gap-1.5 transition-all"
                                >
                                  <MapPin className="w-3.5 h-3.5 text-blue-400" />
                                  Enfocar en Mapa
                                </button>
                              )}
                              <button
                                onClick={() => resolverDesvio(d.id)}
                                disabled={resolviendoId === d.id}
                                className="flex-1 bg-red-950/20 border border-red-500/30 hover:bg-red-500 hover:text-white rounded-lg py-1.5 text-[10px] font-bold text-red-400 transition-all disabled:opacity-50"
                              >
                                {resolviendoId === d.id ? 'Resolviendo...' : 'Resolver'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Incidencias */}
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Siren className="w-4.5 h-4.5 text-orange-400" />
                    Incidencias en Turno
                  </h3>
                  {incidencias.filter(i => i.estado !== 'cerrada').length === 0 ? (
                    <div className="bg-slate-950/30 border border-slate-800 rounded-xl p-6 text-center text-xs text-slate-500">
                      Sin incidencias activas
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {incidencias.filter(i => i.estado !== 'cerrada').map(inc => {
                        const busAsoc = propiosFiltrados.find(p => p.codigoBus === String(inc.coche_id));
                        return (
                          <div 
                            key={inc.id}
                            className="bg-slate-800/40 border border-slate-700/50 hover:border-orange-500/30 rounded-xl p-3 flex flex-col gap-2 transition-all shadow-md"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="text-xs font-bold text-slate-200 leading-tight">
                                {inc.titulo}
                              </h4>
                              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${
                                inc.prioridad === 'critica' 
                                  ? 'bg-red-500/10 text-red-400 border-red-500/20' 
                                  : 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                              }`}>
                                {inc.prioridad}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-[10px] text-slate-400">
                              <span>
                                {inc.coche_id ? `Coche: ${inc.coche_id}` : ''}
                                {inc.linea_id ? ` · Línea: ${inc.linea_id}` : ''}
                              </span>
                            </div>

                            {busAsoc && (
                              <button
                                onClick={() => focusBusOnMap(busAsoc)}
                                className="w-full mt-1 bg-slate-800 border border-slate-700 hover:bg-slate-700 hover:border-slate-600 rounded-lg py-1.5 text-[10px] font-bold text-slate-300 flex items-center justify-center gap-1.5 transition-all"
                              >
                                <MapPin className="w-3.5 h-3.5 text-blue-400" />
                                Enfocar Incidencia
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* TAB: Flota y Listero Activo */}
            {activeTab === 'flota' && (
              <div className="space-y-3">
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">
                  Vehículos en Servicio ({propiosFiltrados.length})
                </div>

                {propiosFiltrados.length === 0 ? (
                  <div className="text-center py-12 text-xs text-slate-500">
                    Sin buses para mostrar en los filtros activos
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {propiosFiltrados.map(bus => {
                      const tieneAlerta = !!(bus.desvio || bus.incidencia);
                      return (
                        <div
                          key={bus.id}
                          onClick={() => focusBusOnMap(bus)}
                          className={`w-full text-left bg-slate-800/40 border hover:bg-slate-800 hover:border-slate-600 rounded-xl p-3 flex items-center justify-between gap-3 cursor-pointer transition-all ${
                            selectedBusId === bus.id 
                              ? 'border-blue-500 bg-slate-800/80 shadow-md' 
                              : tieneAlerta 
                                ? 'border-red-500/20' 
                                : 'border-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-8.5 h-8.5 rounded-lg flex flex-col items-center justify-center flex-none ${
                              tieneAlerta ? 'bg-red-500/10 text-red-400' : 'bg-slate-700/40 text-amber-400'
                            }`}>
                              <span className="text-xs font-black leading-none">{bus.linea}</span>
                              <span className="text-[7px] font-bold uppercase tracking-wide mt-0.5">Línea</span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-200">
                                Coche {bus.codigoBus}
                              </p>
                              <p className="text-[10px] text-slate-400 truncate mt-0.5">
                                {bus.choferNombre ? bus.choferNombre : 'Sin conductor asignado'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-none">
                            {tieneAlerta && (
                              <AlertTriangle className="w-4 h-4 text-red-400 animate-pulse" />
                            )}
                            <div className="text-right text-[10px]">
                              <span className="font-mono text-slate-300 font-bold block">{bus.velocidad} km/h</span>
                              {bus.horaInicio && (
                                <span className="text-slate-500 flex items-center gap-1 mt-0.5 leading-none">
                                  <Clock className="w-2.5 h-2.5" />
                                  {bus.horaInicio}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB: Bunching y Headways */}
            {activeTab === 'bunching' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <ShieldAlert className="w-4.5 h-4.5 text-red-400" />
                    Conflictos de Bunching (Canibalización)
                  </h3>
                  {bunching.length === 0 ? (
                    <div className="bg-slate-950/30 border border-slate-800 rounded-xl p-6 text-center text-xs text-slate-500">
                      <CheckCircle className="w-8 h-8 mx-auto mb-2 text-emerald-500/60" />
                      Sin incidencias de bunching en vía
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {bunching.map((b, i) => {
                        const bus1Obj = propiosFiltrados.find(p => p.codigoBus === b.bus1);
                        const bus2Obj = propiosFiltrados.find(p => p.codigoBus === b.bus2);
                        return (
                          <div 
                            key={i}
                            className="bg-red-950/10 border border-red-500/25 rounded-xl p-3 flex flex-col gap-2 shadow-md"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-black text-red-400">
                                Línea {b.linea}
                              </span>
                              <span className="text-[10px] font-black bg-red-500/10 text-red-400 px-2 py-0.5 rounded border border-red-500/20">
                                {b.distanciaKm} km de dist.
                              </span>
                            </div>

                            <p className="text-[11px] text-slate-300">
                              Coche <span className="font-bold">{b.bus1}</span> y Coche <span className="font-bold">{b.bus2}</span> circulando excesivamente cerca en el mismo corredor.
                            </p>

                            <div className="flex gap-1.5 mt-1">
                              {bus1Obj && (
                                <button
                                  onClick={() => focusBusOnMap(bus1Obj)}
                                  className="flex-1 bg-slate-800/80 border border-slate-700 hover:bg-slate-700 rounded-lg py-1 text-[9px] font-bold text-slate-300 transition-all"
                                >
                                  Enfocar {b.bus1}
                                </button>
                              )}
                              {bus2Obj && (
                                <button
                                  onClick={() => focusBusOnMap(bus2Obj)}
                                  className="flex-1 bg-slate-800/80 border border-slate-700 hover:bg-slate-700 rounded-lg py-1 text-[9px] font-bold text-slate-300 transition-all"
                                >
                                  Enfocar {b.bus2}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* Footer de Consola */}
          <footer className="flex-none p-3.5 bg-slate-950/60 border-t border-slate-800 text-[10px] text-slate-500 flex justify-between items-center">
            <span>UCOT Cerebro Operativo</span>
            <span>Sistema Metropolitano 2026</span>
          </footer>

        </div>

      </div>

      <style>{`
        .leaflet-container { background: #090d16 !important; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #334155; }
      `}</style>

    </div>
  );
}
