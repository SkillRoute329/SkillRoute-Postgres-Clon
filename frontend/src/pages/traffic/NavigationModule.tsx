/**
 * Navegador UCOT — guía visual de líneas (estilo Waze para conductores).
 * Ruta: /dashboard/traffic/navigation
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Map,
  RefreshCw,
  AlertTriangle,
  Plus,
  Loader2,
  Locate,
  Navigation,
  Square,
  Volume2,
  VolumeX,
  DollarSign,
  X,
} from 'lucide-react';
import { collection, doc, setDoc, updateDoc, serverTimestamp, GeoPoint } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import {
  getLineasUCOT,
  getLineaData,
  syncLineaFromAPI,
  type LineaUCOTResumen,
} from '../../services/ucotLinesService';
import { getMasterServicios } from '../../data/ucotMaster';
import type { LineaUCOT } from '../../types/lineasUcot';
import RouteMap from '../../components/traffic/RouteMap';
import StopsList from '../../components/traffic/StopsList';
import DesvioEditor from '../../components/traffic/DesvioEditor';

const VIAJES_ACTIVOS_COL = 'viajes_activos';
const PROXIMITY_METERS = 100;

export interface TarifaSTM {
  id: string;
  nombre: string;
  precio: number;
  categoria: 'URBANO' | 'SUBURBANO' | 'ZONAL' | 'DIFERENCIAL';
}

/** Distancia en metros entre dos puntos (fórmula de Haversine). */
function haversineDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function speak(text: string): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'es-UY';
  window.speechSynthesis.speak(utterance);
}

const isConductorMode = () => {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  return isMobile && window.innerWidth < 768;
};

const TODAS = '';

export default function NavigationModule() {
  const [searchParams] = useSearchParams();
  const lineaParam = searchParams.get('linea') ?? '';
  const [listCompleta, setListCompleta] = useState<LineaUCOTResumen[]>([]);
  const [selectedCodigo, setSelectedCodigo] = useState<string>('');
  const [linea, setLinea] = useState<LineaUCOT | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [showDesvioEditor, setShowDesvioEditor] = useState(false);
  const [userPosition, setUserPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [viajeIniciado, setViajeIniciado] = useState(false);
  const [filterCompania, setFilterCompania] = useState<string>(TODAS);
  const [filterLinea, setFilterLinea] = useState<string>(TODAS);
  const [searchTerm, setSearchTerm] = useState('');
  const [isNavigating, setIsNavigating] = useState(false);
  const [navigationPosition, setNavigationPosition] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const watchIdRef = useRef<number | null>(null);
  const viajeDocIdRef = useRef<string | null>(null);
  const announcedStopsRef = useRef<Set<string>>(new Set());
  const voiceEnabledRef = useRef(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const paradasRef = useRef<LineaUCOT['paradas']>([]);
  const [showTarifario, setShowTarifario] = useState(false);
  // TODO: Cargar desde colección 'tarifario_stm' en Firestore.
  const [tarifas] = useState<TarifaSTM[]>([
    { id: '1', nombre: 'Boleto Común', precio: 55, categoria: 'URBANO' },
    { id: '2', nombre: 'Zonal', precio: 27, categoria: 'ZONAL' },
    { id: '3', nombre: 'Suburbano Anillo 1', precio: 70, categoria: 'SUBURBANO' },
    { id: '4', nombre: 'Diferencial', precio: 90, categoria: 'DIFERENCIAL' },
  ]);
  const { user } = useAuth();
  const conductorMode = isConductorMode();

  voiceEnabledRef.current = voiceEnabled;
  paradasRef.current = linea?.paradas ?? [];

  const companiasUnicas = useMemo(() => {
    const set = new Set<string>();
    listCompleta.forEach((item) => {
      if (item.empresa) set.add(item.empresa);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [listCompleta]);

  const lineasUnicas = useMemo(() => {
    const set = new Set<string>();
    listCompleta.forEach((item) => set.add(item.codigo));
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [listCompleta]);

  const lineasDisponibles = useMemo(() => {
    return listCompleta.filter((item) => {
      if (filterCompania !== TODAS && item.empresa !== filterCompania) return false;
      if (filterLinea !== TODAS && item.codigo !== filterLinea) return false;
      return true;
    });
  }, [listCompleta, filterCompania, filterLinea]);

  const lineasFiltradas = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return lineasDisponibles;
    return lineasDisponibles.filter((item) => {
      const codigo = (item.codigo ?? '').toLowerCase();
      const nombre = (item.nombre ?? '').toLowerCase();
      const origen = (item.origen ?? '').toLowerCase();
      const destino = (item.destino ?? '').toLowerCase();
      return (
        codigo.includes(term) ||
        nombre.includes(term) ||
        origen.includes(term) ||
        destino.includes(term)
      );
    });
  }, [lineasDisponibles, searchTerm]);

  const opcionesRecorrido = useMemo(() => {
    if (!selectedCodigo) return lineasFiltradas;
    const inFiltered = lineasFiltradas.some((l) => l.id === selectedCodigo);
    if (inFiltered) return lineasFiltradas;
    const selected = lineasDisponibles.find((l) => l.id === selectedCodigo);
    if (selected) return [selected, ...lineasFiltradas];
    return lineasFiltradas;
  }, [lineasFiltradas, lineasDisponibles, selectedCodigo]);

  useEffect(() => {
    setViajeIniciado(false);
  }, [selectedCodigo]);

  useEffect(() => {
    getLineasUCOT()
      .then((list) => {
        setListCompleta(list);
        if (list.length > 0) {
          if (lineaParam) {
            const byCodigo = list.find((l) => String(l.codigo) === String(lineaParam));
            setSelectedCodigo(byCodigo ? byCodigo.id : list[0].id);
          } else {
            setSelectedCodigo(list[0].id);
          }
        }
      })
      .finally(() => setLoading(false));
  }, [lineaParam]);

  useEffect(() => {
    if (
      lineasDisponibles.length > 0 &&
      selectedCodigo &&
      !lineasDisponibles.some((l) => l.id === selectedCodigo)
    ) {
      setSelectedCodigo(lineasDisponibles[0].id);
    }
  }, [lineasDisponibles, selectedCodigo]);

  useEffect(() => {
    if (!selectedCodigo) {
      setLinea(null);
      return;
    }
    setLoading(true);
    getLineaData(selectedCodigo)
      .then((data) => {
        setLinea(data);
        setSelectedStopId(null);
      })
      .finally(() => setLoading(false));
  }, [selectedCodigo]);

  useEffect(() => {
    if (!conductorMode) return;
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => setUserPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [conductorMode]);

  const navigationActive = isNavigating || (conductorMode && viajeIniciado);
  useEffect(() => {
    if (!navigationActive || !selectedCodigo || !linea) {
      if (!navigationActive) {
        if (watchIdRef.current !== null && navigator.geolocation) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
        const docId = viajeDocIdRef.current;
        if (docId) {
          const ref = doc(db, VIAJES_ACTIVOS_COL, docId);
          updateDoc(ref, { estado: 'finalizado', updatedAt: serverTimestamp() }).catch(() => {});
          viajeDocIdRef.current = null;
        }
        setNavigationPosition(null);
      }
      return;
    }
    if (!navigator.geolocation) return;

    announcedStopsRef.current = new Set();

    const onPosition = (position: GeolocationPosition) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      setNavigationPosition({ lat, lng });

      const payload = {
        lineaId: selectedCodigo,
        empresa: linea?.empresa ?? '',
        codigoLinea: linea?.codigo ?? '',
        posicion: new GeoPoint(lat, lng),
        updatedAt: serverTimestamp(),
        estado: 'activo' as const,
        userId: (user as { uid?: string })?.uid ?? null,
      };

      const docId = viajeDocIdRef.current;
      if (docId) {
        const ref = doc(db, VIAJES_ACTIVOS_COL, docId);
        updateDoc(ref, { posicion: payload.posicion, updatedAt: payload.updatedAt }).catch(
          () => {},
        );
      } else {
        const ref = doc(collection(db, VIAJES_ACTIVOS_COL));
        viajeDocIdRef.current = ref.id;
        setDoc(ref, { ...payload, id: ref.id }).catch(() => {});
      }

      const paradas = paradasRef.current;
      if (paradas.length > 0 && voiceEnabledRef.current) {
        for (const parada of paradas) {
          const dist = haversineDistanceMeters(lat, lng, parada.lat, parada.lng);
          if (dist < PROXIMITY_METERS && !announcedStopsRef.current.has(parada.id)) {
            announcedStopsRef.current.add(parada.id);
            speak('Próxima parada: ' + (parada.nombre || `Parada ${parada.orden}`));
            break;
          }
        }
      }
    };

    const watchId = navigator.geolocation.watchPosition(onPosition, () => {}, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 10000,
    });
    watchIdRef.current = watchId;

    return () => {
      navigator.geolocation.clearWatch(watchId);
      watchIdRef.current = null;
      const docId = viajeDocIdRef.current;
      if (docId) {
        const ref = doc(db, VIAJES_ACTIVOS_COL, docId);
        updateDoc(ref, { estado: 'finalizado', updatedAt: serverTimestamp() }).catch(() => {});
        viajeDocIdRef.current = null;
      }
      setNavigationPosition(null);
    };
  }, [
    navigationActive,
    selectedCodigo,
    linea?.empresa,
    linea?.codigo,
    user,
    conductorMode,
    viajeIniciado,
    isNavigating,
  ]);

  const handleActualizar = async () => {
    if (!selectedCodigo) return;
    setSyncing(true);
    try {
      const numeroAPI =
        linea?.codigo ??
        lineasDisponibles.find((l) => l.id === selectedCodigo)?.codigo ??
        selectedCodigo;
      const baseNumero = String(numeroAPI).replace(/[ab]$/i, '') || numeroAPI;
      await syncLineaFromAPI(selectedCodigo, baseNumero);
      const data = await getLineaData(selectedCodigo);
      setLinea(data);
    } catch (e) {
      console.error(e);
    } finally {
      setSyncing(false);
    }
  };

  const desviosActivos = [
    ...(linea?.desviosFijos.filter((d) => d.activo) ?? []),
    ...(linea?.desviosTemporales.filter((d) => d.activo) ?? []),
  ];
  const affectedStopIds = new Set<string>();

  /** Hitos teóricos del JSON Maestro cuando no hay coordenadas (línea sin datos en Firestore). */
  const hitosTeoricos = useMemo(() => {
    if (!selectedCodigo) return [];
    const codigoBase = String(selectedCodigo).replace(/[ab]$/i, '').trim() || selectedCodigo;
    const servicios = [
      ...getMasterServicios(selectedCodigo),
      ...(codigoBase !== selectedCodigo ? getMasterServicios(codigoBase) : []),
    ];
    const puntos = new globalThis.Map<string, number>();
    servicios.forEach((s) => {
      (s.puntosControl ?? []).forEach((p, i) => {
        const name = String(p || '').trim();
        if (name && !puntos.has(name)) puntos.set(name, i);
      });
    });
    return Array.from(puntos.keys()).sort((a, b) => (puntos.get(a) ?? 0) - (puntos.get(b) ?? 0));
  }, [selectedCodigo]);

  const siguienteParada = (() => {
    if (!viajeIniciado || !linea?.paradas.length || !userPosition) return null;
    const dist = (p: { lat: number; lng: number }) =>
      Math.hypot(p.lat - userPosition.lat, p.lng - userPosition.lng);
    const sorted = [...linea.paradas].sort((a, b) => dist(a) - dist(b));
    return sorted[0];
  })();

  return (
    <div className="flex flex-col h-full min-h-0 w-full max-w-full overflow-x-hidden">
      <header className="relative z-10 shrink-0 p-4 border-b border-slate-800 bg-slate-900/95 w-full max-w-full">
        <h1 className="text-xl font-bold flex items-center gap-2 text-white">
          <Map className="w-6 h-6 text-primary-500" />
          Navegador UCOT
        </h1>
        <p className="text-slate-400 text-sm mt-1">Recorrido, paradas y desvíos por línea</p>

        {!isNavigating && (
          <div
            className="mt-4 flex flex-wrap gap-3 items-center touch-manipulation select-none"
            style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
          >
            {!loading && listCompleta.length === 0 && (
              <div className="basis-full flex flex-wrap items-center gap-2 p-3 rounded-xl bg-amber-900/30 border border-amber-600/50">
                <span className="text-amber-200 text-sm">No hay líneas cargadas.</span>
                <button
                  type="button"
                  onClick={() => {
                    setLoading(true);
                    getLineasUCOT()
                      .then((list) => {
                        setListCompleta(list);
                        if (list.length > 0 && !selectedCodigo) setSelectedCodigo(list[0].id);
                      })
                      .finally(() => setLoading(false));
                  }}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium touch-manipulation"
                >
                  Reintentar
                </button>
              </div>
            )}
            <div className="flex items-center gap-2 min-w-0 flex-1 basis-full md:basis-auto">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar línea (ej. 300, cc1)..."
                className="min-h-[44px] w-full max-w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm placeholder-slate-500 focus:ring-2 focus:ring-primary-500 focus:outline-none touch-manipulation"
                style={{ WebkitTapHighlightColor: 'transparent' }}
                aria-label="Buscar línea por código o nombre"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-slate-400 text-sm font-medium shrink-0">Compañía</label>
              <select
                value={filterCompania}
                onChange={(e) => setFilterCompania(e.target.value)}
                className="min-h-[44px] px-3 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm min-w-0 w-full max-w-[200px] hover:bg-slate-700 active:bg-slate-600 focus:ring-2 focus:ring-primary-500 focus:outline-none disabled:opacity-50 touch-manipulation cursor-pointer select-none"
                style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                aria-label="Filtrar por compañía"
              >
                <option value={TODAS}>Todas</option>
                {companiasUnicas.map((emp) => (
                  <option key={emp} value={emp}>
                    {emp}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-slate-400 text-sm font-medium shrink-0">Línea</label>
              <select
                value={filterLinea}
                onChange={(e) => setFilterLinea(e.target.value)}
                className="min-h-[44px] px-3 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm min-w-0 w-full max-w-[180px] hover:bg-slate-700 active:bg-slate-600 focus:ring-2 focus:ring-primary-500 focus:outline-none disabled:opacity-50 touch-manipulation cursor-pointer select-none"
                style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                aria-label="Filtrar por línea"
              >
                <option value={TODAS}>Todas</option>
                {lineasUnicas.map((cod) => (
                  <option key={cod} value={cod}>
                    {cod}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <label className="text-slate-400 text-sm font-medium shrink-0">Recorrido</label>
              <select
                value={selectedCodigo}
                onChange={(e) => setSelectedCodigo(e.target.value)}
                className="min-h-[44px] px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white w-full max-w-full min-w-0 hover:bg-slate-700 active:bg-slate-600 focus:ring-2 focus:ring-primary-500 focus:outline-none disabled:opacity-50 touch-manipulation cursor-pointer select-none"
                style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                aria-label="Seleccionar recorrido"
              >
                {opcionesRecorrido.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre ||
                      (item.origen && item.destino
                        ? `${item.codigo} - ${item.origen} → ${item.destino}`
                        : item.codigo)}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setIsNavigating(true)}
              disabled={!selectedCodigo}
              className="flex items-center justify-center gap-2 min-h-[44px] px-5 py-3 rounded-xl bg-green-600 hover:bg-green-500 active:bg-green-400 text-white font-medium shadow-md disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
            >
              <Navigation className="w-5 h-5" />
              Iniciar Viaje
            </button>
            {!conductorMode && (
              <>
                <button
                  type="button"
                  onClick={handleActualizar}
                  disabled={syncing || !selectedCodigo}
                  className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white disabled:opacity-50 touch-manipulation"
                >
                  {syncing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  Actualizar datos
                </button>
                <button
                  type="button"
                  onClick={() => setShowDesvioEditor(true)}
                  disabled={!selectedCodigo}
                  className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-3 rounded-xl bg-primary-600 hover:bg-primary-500 active:bg-primary-400 text-white disabled:opacity-50 touch-manipulation"
                >
                  <Plus className="w-4 h-4" />
                  Agregar desvío
                </button>
              </>
            )}
            {conductorMode && (
              <>
                {!viajeIniciado ? (
                  <button
                    type="button"
                    onClick={() => setViajeIniciado(true)}
                    disabled={!selectedCodigo}
                    className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-3 rounded-xl bg-green-600 hover:bg-green-500 active:bg-green-400 text-white disabled:opacity-50 font-medium shadow-lg touch-manipulation"
                  >
                    <Navigation className="w-4 h-4" />
                    Iniciar viaje
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setViajeIniciado(false)}
                    className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-3 rounded-xl bg-red-600 hover:bg-red-500 active:bg-red-400 text-white font-medium shadow-lg touch-manipulation"
                  >
                    <Square className="w-4 h-4" />
                    Finalizar viaje
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowDesvioEditor(true)}
                  disabled={!selectedCodigo}
                  className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 active:bg-amber-400 text-white disabled:opacity-50 font-medium shadow-lg touch-manipulation"
                >
                  <Plus className="w-4 h-4" />
                  Reportar en ruta
                </button>
              </>
            )}
          </div>
        )}

        {(isNavigating || (conductorMode && viajeIniciado)) && linea && (
          <>
            <div className="mt-4 md:mt-4 md:mx-0 md:rounded-xl md:shadow-xl md:backdrop-blur-md p-4 bg-slate-800/95 border border-slate-600 flex flex-wrap items-center justify-between gap-3 fixed md:relative bottom-0 left-0 right-0 w-full md:w-auto rounded-t-3xl md:rounded-xl z-[30]">
              <div className="text-white font-medium min-w-0 flex-1">
                <span className="text-slate-400 text-sm block">Viaje en curso</span>
                <span className="text-lg block truncate">
                  {linea.empresa ?? '—'} - {linea.codigo} - {linea.origen ?? '?'} →{' '}
                  {linea.destino ?? '?'}
                </span>
                <div className="flex items-center gap-2 mt-2 text-sm font-normal">
                  {navigationPosition ? (
                    <>
                      <span
                        className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0"
                        aria-hidden
                      />
                      <span className="text-green-400">GPS Activo</span>
                    </>
                  ) : (
                    <span className="text-amber-400">Buscando señal...</span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                <button
                  type="button"
                  onClick={() => setVoiceEnabled((v) => !v)}
                  className="flex items-center justify-center gap-2 min-h-[44px] px-3 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white touch-manipulation"
                  title={voiceEnabled ? 'Silenciar voz' : 'Activar voz'}
                  aria-label={voiceEnabled ? 'Silenciar voz' : 'Activar voz'}
                >
                  {voiceEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                  <span className="text-sm">{voiceEnabled ? 'Voz on' : 'Voz off'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowTarifario(true)}
                  className="flex items-center justify-center gap-2 min-h-[44px] px-3 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-500 text-white touch-manipulation"
                  title="Ver tarifas"
                  aria-label="Ver tarifas"
                >
                  <DollarSign className="w-5 h-5" />
                  <span className="text-sm">Tarifas</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsNavigating(false);
                    setViajeIniciado(false);
                  }}
                  className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-3 rounded-xl bg-red-600 hover:bg-red-500 active:bg-red-400 text-white font-medium touch-manipulation"
                >
                  <Square className="w-5 h-5" />
                  Finalizar Viaje
                </button>
              </div>
            </div>
          </>
        )}

        {showTarifario && (
          <div className="fixed inset-0 z-[90] flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm md:p-4">
            <div className="w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col rounded-t-3xl md:rounded-2xl bg-slate-800 border border-slate-600 shadow-xl">
              <div className="flex items-center justify-between p-4 border-b border-slate-700 shrink-0">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-emerald-400 shrink-0" />
                  Billetera de Tarifas
                </h3>
                <button
                  type="button"
                  onClick={() => setShowTarifario(false)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-lg hover:bg-slate-700 active:bg-slate-600 text-slate-400 touch-manipulation"
                  aria-label="Cerrar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-4">
                {(['URBANO', 'ZONAL', 'SUBURBANO', 'DIFERENCIAL'] as const).map((cat) => {
                  const items = tarifas.filter((t) => t.categoria === cat);
                  if (items.length === 0) return null;
                  return (
                    <div key={cat} className="mb-4">
                      <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
                        {cat}
                      </h4>
                      <ul className="space-y-2">
                        {items.map((t) => (
                          <li
                            key={t.id}
                            className="flex items-center justify-between py-2 px-3 rounded-xl bg-slate-900/80 border border-slate-700"
                          >
                            <span className="text-white font-medium">{t.nombre}</span>
                            <span className="text-emerald-400 font-bold">${t.precio}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </header>

      {viajeIniciado && linea && (
        <div className="shrink-0 mx-4 mt-2 p-3 rounded-xl bg-green-900/40 border border-green-600/50 flex flex-wrap items-center gap-3">
          <Navigation className="w-5 h-5 text-green-400 shrink-0 animate-pulse" />
          <div className="text-sm text-green-200">
            <strong>Viaje en curso</strong> — {linea.nombre}
            {linea.paradas.length > 0 && (
              <span className="text-green-300/90 ml-2">· {linea.paradas.length} paradas</span>
            )}
          </div>
          {siguienteParada && (
            <div className="text-sm text-green-100 bg-green-800/50 px-3 py-1.5 rounded-lg border border-green-600/50">
              <span className="text-green-300/90">Próxima parada:</span>{' '}
              {siguienteParada.nombre || `Parada ${siguienteParada.orden}`}
            </div>
          )}
        </div>
      )}

      {desviosActivos.length > 0 && (
        <div className="shrink-0 mx-4 mt-2 p-3 rounded-xl bg-amber-900/30 border border-amber-600/50 flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-200">
            <strong>Desvíos activos:</strong> {desviosActivos.map((d) => d.descripcion).join(' — ')}
          </div>
        </div>
      )}

      <div
        className={`flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 min-h-0 w-full max-w-full ${(isNavigating || (conductorMode && viajeIniciado)) && linea ? 'pb-40 md:pb-4' : ''}`}
      >
        <div
          className={`${conductorMode ? 'order-2' : ''} lg:col-span-2 min-h-[280px] flex flex-col relative min-w-0`}
        >
          {loading ? (
            <div className="flex-1 flex items-center justify-center bg-slate-800 rounded-xl">
              <Loader2 className="w-10 h-10 animate-spin text-primary-500" />
            </div>
          ) : selectedCodigo && !linea && hitosTeoricos.length > 0 ? (
            <div className="w-full h-full min-h-[300px] bg-slate-800 rounded-xl border border-slate-700 flex flex-col items-center justify-center p-6 text-center">
              <Map className="w-12 h-12 text-slate-500 mb-3" />
              <p className="text-slate-300 font-medium">Sin coordenadas para esta línea</p>
              <p className="text-slate-500 text-sm mt-1">
                Los puntos de control del JSON Maestro se muestran en la lista a la derecha.
              </p>
              <p className="text-slate-500 text-xs mt-3">
                Use «Actualizar datos» para cargar paradas y recorrido desde la API.
              </p>
            </div>
          ) : (
            <>
              <RouteMap
                linea={linea}
                highlightStopId={selectedStopId}
                userPosition={
                  isNavigating ? navigationPosition : conductorMode ? userPosition : null
                }
                conductorMode={conductorMode}
                followUser={(viajeIniciado && conductorMode) || isNavigating}
                isNavigating={isNavigating}
              />
              {conductorMode && selectedCodigo && (
                <button
                  type="button"
                  onClick={() => setShowDesvioEditor(true)}
                  className="absolute bottom-4 right-4 z-[20] min-h-[44px] min-w-[44px] flex items-center justify-center gap-2 px-4 py-3 rounded-full bg-amber-500 hover:bg-amber-400 active:bg-amber-300 text-slate-900 font-bold shadow-lg touch-manipulation"
                  aria-label="Reportar en ruta"
                >
                  <Plus className="w-5 h-5" />
                  Reportar
                </button>
              )}
            </>
          )}
        </div>
        <div
          className={`${conductorMode ? 'order-1' : ''} flex flex-col bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden min-w-0 w-full`}
        >
          <div className="p-3 border-b border-slate-700 flex items-center gap-2">
            <span className="text-slate-400 text-sm font-medium">Paradas</span>
            {linea && (
              <span className="text-slate-500 text-xs">{linea.paradas.length} paradas</span>
            )}
          </div>
          <div className="flex-1 overflow-auto min-h-[200px]">
            {linea ? (
              <StopsList
                paradas={linea.paradas}
                affectedStopIds={affectedStopIds}
                selectedStopId={selectedStopId}
                onSelectStop={setSelectedStopId}
              />
            ) : selectedCodigo && hitosTeoricos.length > 0 ? (
              <div className="p-4">
                <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">
                  Puntos de control (JSON Maestro — sin coordenadas)
                </p>
                <ul className="space-y-1.5">
                  {hitosTeoricos.map((nombre: string, idx: number) => (
                    <li
                      key={`${nombre}-${idx}`}
                      className="flex items-center gap-2 py-2 px-3 rounded-lg bg-slate-900/60 border border-slate-700 text-slate-200 text-sm"
                    >
                      <span className="text-slate-500 font-mono w-6">{idx + 1}</span>
                      {nombre}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="p-4 text-slate-500 text-sm">
                {selectedCodigo
                  ? 'Sin paradas en mapa ni hitos en maestro para esta línea. Use «Actualizar datos» para cargar desde la API.'
                  : 'Seleccione una línea para ver las paradas.'}
              </div>
            )}
          </div>
        </div>
      </div>

      {showDesvioEditor && selectedCodigo && (
        <DesvioEditor
          lineaCodigo={selectedCodigo}
          onClose={() => setShowDesvioEditor(false)}
          onSaved={() => {
            getLineaData(selectedCodigo).then(setLinea);
          }}
          userPosition={conductorMode ? userPosition : null}
          conductorMode={conductorMode}
        />
      )}
    </div>
  );
}
