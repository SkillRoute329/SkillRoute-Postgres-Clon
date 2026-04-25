/**
 * Navegador — {empresaCfg.label} — guía visual de líneas (estilo Waze para conductores).
 * Ruta: /dashboard/traffic/navigation
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Map,
  RefreshCw,
  AlertTriangle,
  Plus,
  Loader2,
  Navigation,
  Square,
  Volume2,
  VolumeX,
  DollarSign,
  X,
  Pencil,
  ArrowUpDown,
  Check,
  Route,
  Building2,
} from 'lucide-react';
import { useEmpresaPropia, EMPRESAS_OPCIONES } from '../../hooks/useEmpresaPropia';
import { collection, doc, setDoc, updateDoc, serverTimestamp, GeoPoint } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import {
  syncLineaFromAPI,
  type LineaUCOTResumen,
} from '../../services/ucotLinesService';
import { getLineasByAgency, getLineaDataByAgency } from '../../services/linesService';
import {
  getOverride,
  setOverride,
  applyOverride,
  swapOrigenDestino,
  getRouteOverride,
  setRouteOverride,
  clearRouteOverride,
  hasRouteOverride,
  type LatLng,
} from '../../services/lineOverrides';
import { getMasterServicios } from '../../data/ucotMaster';
import type { LineaUCOT } from '../../types/lineasUcot';
import RouteMap from '../../components/traffic/RouteMap';
import RouteEditorMap from '../../components/traffic/RouteEditorMap';
import StopsList from '../../components/traffic/StopsList';
import DesvioMapEditor from '../../components/traffic/DesvioMapEditor';
import DesvioPanel from '../../components/traffic/DesvioPanel';
import IncidenciaRapida from '../../components/traffic/IncidenciaRapida';
import type { DesvioGuardado } from '../../services/desviosService';
import { contarDesviosLocal, getDesviosPorLinea } from '../../services/desviosService';
import { contarIncidenciasAbiertas } from '../../services/incidenciasService';

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
  const { empresaPropia, setEmpresaPropia, empresaCfg } = useEmpresaPropia();
    const [searchParams] = useSearchParams();
  const lineaParam = searchParams.get('linea') ?? '';
  const [listCompleta, setListCompleta] = useState<LineaUCOTResumen[]>([]);
  const [selectedCodigo, setSelectedCodigo] = useState<string>('');
  const [linea, setLinea] = useState<LineaUCOT | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [userPosition, setUserPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [viajeIniciado, setViajeIniciado] = useState(false);
  const [filterLinea, setFilterLinea] = useState<string>(TODAS);
  const [searchTerm, setSearchTerm] = useState('');
  const [isNavigating, setIsNavigating] = useState(false);

  // ── Edición de nombre/origen/destino ──
  const [showLineEditor, setShowLineEditor] = useState(false);
  const [editNombre, setEditNombre] = useState('');
  const [editOrigen, setEditOrigen] = useState('');
  const [editDestino, setEditDestino] = useState('');
  const [overridesVersion, setOverridesVersion] = useState(0);

  // ── Editor de recorrido (drag tipo Google Maps) ──
  const [showRouteEditor, setShowRouteEditor] = useState(false);
  const [routeHasOverride, setRouteHasOverride] = useState(false);

  // ── Nuevo sistema de desvíos v2 (basado en mapa, reemplaza DesvioEditor) ──
  const [showDesvioMapEditor, setShowDesvioMapEditor] = useState(false);
  const [editingDesvio, setEditingDesvio] = useState<DesvioGuardado | undefined>(undefined);
  const [showDesvioPanel, setShowDesvioPanel] = useState(false);
  const [_desviosVersion, setDesviosVersion] = useState(0);
  const [showIncidencias, setShowIncidencias] = useState(false);
  const [incidenciasAbiertas, setIncidenciasAbiertas] = useState<number>(0);
  useEffect(() => {
    // Resolver cuenta asíncronamente
    contarIncidenciasAbiertas()
      .then((count) => setIncidenciasAbiertas(count))
      .catch(() => {});
  }, [showIncidencias]);
  // Contador para badge de desvíos en UI (se recalcula al cambiar línea o al guardar un desvío)
  const [desviosCount, setDesviosCount] = useState<{ total: number; activos: number }>({
    total: 0,
    activos: 0,
  });
  // Desvíos completos para renderizar en el mapa como líneas punteadas
  const [desviosEnMapa, setDesviosEnMapa] = useState<DesvioGuardado[]>([]);

  const [navigationPosition, setNavigationPosition] = useState<{
    lat: number;
    lng: number;
    heading?: number | null;
  } | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const viajeDocIdRef = useRef<string | null>(null);
  const announcedStopsRef = useRef<Set<string>>(new Set());
  const voiceEnabledRef = useRef(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const paradasRef = useRef<LineaUCOT['paradas']>([]);
  const [showTarifario, setShowTarifario] = useState(false);
  const [tarifas, setTarifas] = useState<TarifaSTM[]>([]);

  useEffect(() => {
    // Importación dinámica para evitar ciclos
    import('../../services/tarifarioService')
      .then(({ listenToTarifas, setSeedTarfias }) => {
        const unsubscribe = listenToTarifas(async (datosTarifas) => {
          if (datosTarifas.length === 0) {
            // Seed initial data si está vacío (por estar en DEV/TEST phase de Firebase)
            const defaultTarifas: TarifaSTM[] = [
              { id: '1', nombre: 'Boleto Común', precio: 55, categoria: 'URBANO' },
              { id: '2', nombre: 'Zonal', precio: 27, categoria: 'ZONAL' },
              { id: '3', nombre: 'Suburbano Anillo 1', precio: 70, categoria: 'SUBURBANO' },
              { id: '4', nombre: 'Diferencial', precio: 90, categoria: 'DIFERENCIAL' },
            ];
            await setSeedTarfias(defaultTarifas);
            // No devolvemos nada, el snapshopt emitirá un nuevo evento inmediatamente tras el seed
          } else {
            setTarifas(datosTarifas);
          }
        });
        return unsubscribe;
      })
      .catch(console.error);
  }, []);

  const { user } = useAuth();
  const conductorMode = isConductorMode();

  voiceEnabledRef.current = voiceEnabled;
  paradasRef.current = linea?.paradas ?? [];

  const lineasUnicas = useMemo(() => {
    const set = new Set<string>();
    listCompleta.forEach((item) => {
      // Extraer código base sin sufijo a/b para agrupar IDA/VUELTA bajo un número
      const base = item.codigo.replace(/[ab]$/i, '');
      if (base) set.add(base);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [listCompleta]);

  const lineasDisponibles = useMemo(() => {
    return listCompleta
      .filter((item) => {
        if (!item.codigo || String(item.codigo).startsWith('linea-')) return false;
        if (String(item.nombre).startsWith('Competencia:')) return false;
        // getLineasByAgency ya filtra por operador propio
        if (filterLinea !== TODAS && item.codigo.replace(/[ab]$/i, '') !== filterLinea)
          return false;
        return true;
      })
      .map((item) => applyOverride(item.codigo, item));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listCompleta, filterLinea, overridesVersion]);

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

  // Carga desvíos one-shot (getDocs) en lugar de onSnapshot.
  // El SDK Firestore retorna permission-denied en onSnapshot para colecciones
  // vacías incluso con rules correctas (bug conocido del cliente SDK); getDocs
  // no tiene ese problema. _desviosVersion fuerza re-fetch cuando se crea/edita.
  useEffect(() => {
    if (!selectedCodigo || !user?.uid) {
      setDesviosCount({ total: 0, activos: 0 });
      setDesviosEnMapa([]);
      return;
    }
    let cancelled = false;
    getDesviosPorLinea(selectedCodigo).then((snapshots) => {
      if (cancelled) return;
      setDesviosEnMapa(snapshots);
      setDesviosCount(contarDesviosLocal(snapshots));
    }).catch(() => {
      if (!cancelled) { setDesviosEnMapa([]); setDesviosCount({ total: 0, activos: 0 }); }
    });
    return () => { cancelled = true; };
  }, [selectedCodigo, _desviosVersion, user?.uid]);

  // Resuelve el código de línea dado un id (necesario para getLineaDataByAgency cross-op)
  const getLineCodigo = useCallback(
    (id: string) => listCompleta.find((l) => l.id === id)?.codigo ?? id,
    [listCompleta],
  );

  useEffect(() => {
    setListCompleta([]);
    setSelectedCodigo('');
    setFilterLinea(TODAS);
    setLoading(true);
    getLineasByAgency(empresaPropia)
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
  }, [lineaParam, empresaPropia]);

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
    const lineCodigo = getLineCodigo(selectedCodigo);
    getLineaDataByAgency(empresaPropia, lineCodigo)
      .then((data) => {
        setLinea(data);
        setSelectedStopId(null);
        // Auto-sync recorrido desde GeoServer solo para UCOT (tiene API pública)
        if (empresaPropia === 70 && data && (!data.recorrido || data.recorrido.length === 0)) {
          const baseNumero = String(data.codigo ?? lineCodigo).replace(/[ab]$/i, '') || lineCodigo;
          setSyncing(true);
          syncLineaFromAPI(selectedCodigo, baseNumero)
            .then(() => getLineaDataByAgency(70, lineCodigo))
            .then((newData) => { if (newData) setLinea(newData); })
            .catch(console.error)
            .finally(() => setSyncing(false));
        }
      })
      .finally(() => setLoading(false));
  }, [selectedCodigo, empresaPropia, getLineCodigo]);

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

  // Helper to format line direction (apply manual overrides)
  const formatNombreRecorrido = useCallback((item: LineaUCOTResumen) => {
    const ov = applyOverride(item.codigo, item);
    let text = ov.nombre || ov.codigo;
    if (ov.origen && ov.destino) {
      text = `${ov.codigo.replace(/[ab]$/i, '')} \u2014 ${ov.origen} \u2192 ${ov.destino}`;
    } else if (text === ov.codigo.replace(/[ab]$/i, '')) {
      text = `L\u00ednea ${ov.codigo.toUpperCase()}`;
    }

    if (ov.sentido && !text.toUpperCase().includes(ov.sentido)) {
      text += ` (${ov.sentido})`;
    } else if (ov.codigo.endsWith('a') && !text.toUpperCase().includes('IDA')) {
      text += ' (IDA)';
    } else if (ov.codigo.endsWith('b') && !text.toUpperCase().includes('VUELTA')) {
      text += ' (VUELTA)';
    }

    return text;
  }, []);

  /** Abre el editor con los valores actuales de la l\u00ednea seleccionada. */
  const openLineEditor = useCallback(() => {
    if (!selectedCodigo) return;
    const current = lineasDisponibles.find((l) => l.id === selectedCodigo);
    const ov = getOverride(selectedCodigo);
    setEditNombre(ov?.nombre || current?.nombre || '');
    setEditOrigen(ov?.origen || current?.origen || '');
    setEditDestino(ov?.destino || current?.destino || '');
    setShowLineEditor(true);
  }, [selectedCodigo, lineasDisponibles]);

  /** Guarda las correcciones del editor. */
  const saveLineEditor = useCallback(() => {
    if (!selectedCodigo) return;
    setOverride(selectedCodigo, {
      nombre: editNombre,
      origen: editOrigen,
      destino: editDestino,
    });
    setOverridesVersion((v) => v + 1);
    setShowLineEditor(false);
    // Tambi\u00e9n actualizar el objeto linea en memoria
    if (linea) {
      setLinea({
        ...linea,
        ...(editNombre.trim() ? { nombre: editNombre.trim() } : {}),
        ...(editOrigen.trim() ? { origen: editOrigen.trim() } : {}),
        ...(editDestino.trim() ? { destino: editDestino.trim() } : {}),
      });
    }
  }, [selectedCodigo, editNombre, editOrigen, editDestino, linea]);

  /** Intercambio r\u00e1pido de origen \u2194 destino. */
  const handleSwapOrigenDestino = useCallback(() => {
    const cur = lineasDisponibles.find((l) => l.id === selectedCodigo);
    if (!cur) return;
    const ov = getOverride(selectedCodigo);
    const currentOrigen = ov?.origen || cur.origen || '';
    const currentDestino = ov?.destino || cur.destino || '';
    swapOrigenDestino(selectedCodigo, currentOrigen, currentDestino);
    setOverridesVersion((v) => v + 1);
    if (linea) {
      setLinea({ ...linea, origen: currentDestino, destino: currentOrigen });
    }
  }, [selectedCodigo, lineasDisponibles, linea]);

  /** Abre el editor de recorrido y verifica si ya existe un override guardado. */
  const openRouteEditor = useCallback(() => {
    if (!selectedCodigo) return;
    setRouteHasOverride(hasRouteOverride(selectedCodigo));
    setShowRouteEditor(true);
  }, [selectedCodigo]);

  /** Guarda el recorrido editado y lo aplica a la línea en memoria. */
  const handleRouteSave = useCallback(
    (newPoints: LatLng[]) => {
      if (!selectedCodigo || !linea) return;
      setRouteOverride(selectedCodigo, newPoints);
      setRouteHasOverride(true);
      setShowRouteEditor(false);
      // Aplicar inmediatamente al objeto linea en memoria
      setLinea({ ...linea, recorrido: newPoints });
    },
    [selectedCodigo, linea],
  );

  /** Restaura el recorrido original desde el GeoServer. */
  const handleRouteReset = useCallback(() => {
    if (!selectedCodigo) return;
    clearRouteOverride(selectedCodigo);
    setRouteHasOverride(false);
    setShowRouteEditor(false);
    getLineaDataByAgency(empresaPropia, getLineCodigo(selectedCodigo))
      .then(setLinea)
      .catch(() => {});
  }, [selectedCodigo, empresaPropia, getLineCodigo]);

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
      const heading = position.coords.heading;
      setNavigationPosition({ lat, lng, heading });

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

    // Conductor Real: Seguimos el GPS del dispositivo y NO simulamos,
    // tal como lo requiere el uso en la vida real.
    let watchId: number | null = null;
    watchId = navigator.geolocation.watchPosition(onPosition, () => {}, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 10000,
    });
    watchIdRef.current = watchId;

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchIdRef.current = null;
      const docId = viajeDocIdRef.current;
      if (docId) {
        const ref = doc(db, VIAJES_ACTIVOS_COL, docId);
        updateDoc(ref, { estado: 'finalizado', updatedAt: serverTimestamp() }).catch(() => {});
        viajeDocIdRef.current = null;
      }
      setNavigationPosition(null);
    };
  }, [navigationActive, selectedCodigo, linea, user, conductorMode, viajeIniciado, isNavigating]);

  const handleActualizar = async () => {
    if (!selectedCodigo) return;
    setSyncing(true);
    try {
      const lineCodigo = getLineCodigo(selectedCodigo);
      if (empresaPropia === 70) {
        const baseNumero = String(lineCodigo).replace(/[ab]$/i, '') || lineCodigo;
        await syncLineaFromAPI(selectedCodigo, baseNumero);
      }
      const data = await getLineaDataByAgency(empresaPropia, lineCodigo);
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

  const siguienteParada = useMemo(() => {
    if (!viajeIniciado && !isNavigating) return null;
    if (!linea?.paradas.length) return null;
    const currentPos = isNavigating ? navigationPosition : conductorMode ? userPosition : null;
    if (!currentPos) return null;

    // Solo verificamos paradas que TODAVÍA NO superamos
    const paradasRestantes = linea.paradas.filter((p) => !announcedStopsRef.current.has(p.id));
    if (paradasRestantes.length === 0) return null; // Fin de recorrido

    let minDist = Infinity;
    let closestIndex = 0;

    // Si queremos obligar al orden, podríamos solo tomar la primera que nos falta (paradasRestantes[0]).
    // Pero asume que el chofer hace el recorrido en orden. Si entra a la mitad, se rompe.
    // Buscamos la distancia a todas las que NO han sido anunciadas, y tomamos la más proxima
    // Pero solo consideramos paradas que tengan coordenadas válidas para calcular la distancia.
    paradasRestantes.forEach((p, idx) => {
      if (p.lat === 0 || p.lng === 0) {
        // Si no tiene coordenadas (está en Null Island / fallback), no la tomamos como mínimo.
        // Pero si es la única, deberíamos decir N/A
        return;
      }
      const d = haversineDistanceMeters(currentPos.lat, currentPos.lng, p.lat, p.lng);
      if (d < minDist) {
        minDist = d;
        closestIndex = idx;
      }
    });

    return {
      parada: paradasRestantes[closestIndex],
      distanciaMetros: minDist === Infinity ? -1 : Math.round(minDist),
    };
  }, [
    linea?.paradas,
    navigationPosition,
    userPosition,
    isNavigating,
    viajeIniciado,
    conductorMode,
  ]);

  return (
    <div className="flex flex-col h-full min-h-0 w-full max-w-full overflow-x-hidden">
      <header className="relative z-10 shrink-0 p-4 border-b border-slate-800 bg-slate-900/95 w-full max-w-full">
        <h1 className="text-xl font-bold flex items-center gap-2 text-white">
          <Map className="w-6 h-6 text-primary-500" />
          Navegador — {empresaCfg.label}
        </h1>
        <p className="text-slate-400 text-sm mt-1">Recorrido, paradas y desvíos por línea</p>

        {!isNavigating && (
          <div className="mt-4 flex flex-wrap gap-3 items-end touch-manipulation select-none">

            {/* ── Paso 1: Empresa ──────────────────────────────────────── */}
            <div className="flex flex-col gap-1 min-w-[130px]">
              <label className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Empresa</label>
              <select
                value={empresaPropia}
                onChange={(e) => setEmpresaPropia(Number(e.target.value))}
                className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm hover:bg-slate-700 focus:ring-2 focus:ring-primary-500 focus:outline-none touch-manipulation cursor-pointer"
                aria-label="Seleccionar empresa"
              >
                {EMPRESAS_OPCIONES.map((emp) => (
                  <option key={emp.codigo} value={emp.codigo}>{emp.label}</option>
                ))}
              </select>
            </div>

            {/* ── Paso 2: Línea ─────────────────────────────────────────── */}
            <div className="flex flex-col gap-1 min-w-[120px]">
              <label className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Línea</label>
              <select
                value={filterLinea}
                onChange={(e) => setFilterLinea(e.target.value)}
                disabled={loading || lineasUnicas.length === 0}
                className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm hover:bg-slate-700 focus:ring-2 focus:ring-primary-500 focus:outline-none disabled:opacity-50 touch-manipulation cursor-pointer"
                aria-label="Seleccionar línea"
              >
                <option value={TODAS}>{loading ? 'Cargando…' : '— Todas —'}</option>
                {lineasUnicas.map((cod) => (
                  <option key={cod} value={cod}>{cod}</option>
                ))}
              </select>
            </div>

            {/* ── Paso 3: Sentido / Destino ─────────────────────────────── */}
            <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
              <label className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Sentido / Destino</label>
              <div className="flex items-center gap-2">
                <select
                  value={selectedCodigo}
                  onChange={(e) => setSelectedCodigo(e.target.value)}
                  disabled={opcionesRecorrido.length === 0}
                  className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm flex-1 min-w-0 hover:bg-slate-700 focus:ring-2 focus:ring-primary-500 focus:outline-none disabled:opacity-50 touch-manipulation cursor-pointer"
                  aria-label="Seleccionar sentido y destino"
                >
                  {opcionesRecorrido.length === 0 && (
                    <option value="">Seleccioná una línea primero</option>
                  )}
                  {opcionesRecorrido.map((item) => (
                    <option key={item.id} value={item.id}>
                      {formatNombreRecorrido(item)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleSwapOrigenDestino}
                  disabled={!selectedCodigo}
                  className="flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-amber-400 disabled:opacity-50 touch-manipulation"
                  title="Invertir sentido"
                  aria-label="Invertir sentido"
                >
                  <ArrowUpDown className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={openLineEditor}
                  disabled={!selectedCodigo}
                  className="flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-blue-400 disabled:opacity-50 touch-manipulation"
                  title="Editar nombre / origen / destino"
                  aria-label="Editar datos de la línea"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* ── Sin resultados ────────────────────────────────────────── */}
            {!loading && listCompleta.length === 0 && (
              <div className="basis-full flex flex-wrap items-center gap-2 p-3 rounded-xl bg-amber-900/30 border border-amber-600/50">
                <span className="text-amber-200 text-sm">No hay líneas cargadas para {empresaCfg.label}.</span>
                <button
                  type="button"
                  onClick={() => {
                    setLoading(true);
                    getLineasByAgency(empresaPropia)
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

            {/* ── Banner de desvíos: visible cuando la línea tiene desvíos configurados ── */}
            {selectedCodigo && desviosCount.total > 0 && (
              <div className="basis-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-orange-900/20 border border-orange-700/40">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="shrink-0 w-2 h-2 rounded-full bg-orange-400" />
                  <span className="text-orange-200 text-xs font-medium">
                    Esta línea tiene <strong>{desviosCount.total}</strong>{' '}
                    {desviosCount.total === 1 ? 'desvío' : 'desvíos'} configurados
                    {desviosCount.activos > 0 && (
                      <span className="text-green-400">
                        {' '}
                        ({desviosCount.activos} activo{desviosCount.activos > 1 ? 's' : ''})
                      </span>
                    )}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDesvioPanel(true)}
                  className="shrink-0 min-h-[32px] px-3 py-1 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold touch-manipulation"
                >
                  Ver desvíos
                </button>
              </div>
            )}

            {!conductorMode && (
              <button
                type="button"
                onClick={() => setIsNavigating(true)}
                disabled={!selectedCodigo}
                className="flex items-center justify-center gap-2 min-h-[44px] px-5 py-3 rounded-xl bg-green-600 hover:bg-green-500 active:bg-green-400 text-white font-medium shadow-md disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
              >
                <Navigation className="w-5 h-5" />
                Iniciar Viaje GPS
              </button>
            )}
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
                  onClick={() => setShowDesvioPanel(true)}
                  disabled={!selectedCodigo}
                  className="relative flex items-center justify-center gap-2 min-h-[44px] px-4 py-3 rounded-xl bg-primary-600 hover:bg-primary-500 active:bg-primary-400 text-white disabled:opacity-50 touch-manipulation"
                  title="Ver y gestionar desvíos de la línea"
                >
                  <Plus className="w-4 h-4" />
                  Desvíos
                  {desviosCount.total > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-bold shadow-lg border border-slate-900">
                      {desviosCount.total}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowIncidencias(true)}
                  disabled={!selectedCodigo}
                  className="relative flex items-center justify-center gap-2 min-h-[44px] px-4 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 active:bg-amber-400 text-white disabled:opacity-50 touch-manipulation"
                  title="Reportar situación en ruta"
                >
                  <span className="text-base leading-none">🚨</span>
                  Incidencias
                  {incidenciasAbiertas > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-black px-1">
                      {incidenciasAbiertas}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={openRouteEditor}
                  disabled={!selectedCodigo || !linea}
                  className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-3 rounded-xl bg-violet-700 hover:bg-violet-600 active:bg-violet-500 text-white disabled:opacity-50 touch-manipulation"
                  title="Editar el trazado del recorrido arrastrando puntos"
                >
                  <Route className="w-4 h-4" />
                  {routeHasOverride ? 'Recorrido editado ●' : 'Editar recorrido'}
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
                  onClick={() => setShowIncidencias(true)}
                  disabled={!selectedCodigo}
                  className="relative flex items-center justify-center gap-2 min-h-[44px] px-4 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 active:bg-amber-400 text-white disabled:opacity-50 font-medium shadow-lg touch-manipulation"
                  title="Reportar situación en ruta"
                >
                  <span className="text-base leading-none">🚨</span>
                  Incidencias
                  {incidenciasAbiertas > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-black px-1">
                      {incidenciasAbiertas}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDesvioPanel(true)}
                  disabled={!selectedCodigo || !linea}
                  className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white disabled:opacity-50 touch-manipulation"
                  title="Ver y gestionar desvíos de la línea"
                >
                  <ArrowUpDown className="w-4 h-4" />
                  Desvíos
                  {desviosCount.total > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-bold border border-slate-900">
                      {desviosCount.total}
                    </span>
                  )}
                </button>
              </>
            )}
          </div>
        )}

        {(isNavigating || (conductorMode && viajeIniciado)) && linea && (
          <>
            <div className="mt-4 md:mx-0 md:rounded-xl md:shadow-xl md:backdrop-blur-md p-4 bg-slate-800/95 border border-slate-600 flex flex-wrap items-center justify-between gap-3 fixed md:relative bottom-0 left-0 right-0 w-full md:w-auto rounded-t-3xl z-[30]">
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

      {/* Status Simplificado en Cabecera (Desktop) */}
      {(viajeIniciado || isNavigating) && linea && !conductorMode && (
        <div className="shrink-0 mx-4 mt-2 p-3 rounded-xl bg-green-900/40 border border-green-600/50 flex flex-wrap items-center gap-3">
          <Navigation className="w-5 h-5 text-green-400 shrink-0 animate-pulse" />
          <div className="text-sm text-green-200">
            <strong>Viaje activo (simulado proxy):</strong> — {linea.nombre}
          </div>
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
          ) : selectedCodigo && linea && (
              linea.recorrido.length === 0 ||
              linea.paradas.every((p) => p.lat === 0 && p.lng === 0)
          ) ? (
            <div className="w-full h-full min-h-[300px] bg-slate-800 rounded-xl border border-amber-700/50 flex flex-col items-center justify-center p-6 text-center">
              <AlertTriangle className="w-12 h-12 text-amber-500 mb-3" />
              <p className="text-amber-200 font-medium">
                Esta línea aún no tiene shape ni paradas georreferenciadas
              </p>
              <p className="text-slate-400 text-sm mt-2 max-w-md">
                La sincronización con STM API está temporalmente fuera de servicio (endpoint
                legacy bloqueado por la IMM). Las paradas se muestran a la derecha con sus
                nombres pero sin coordenadas.
              </p>
              <p className="text-slate-500 text-xs mt-3">
                Próxima migración: cargar shapes desde el feed GTFS importado a{' '}
                <code className="mx-1 px-1 py-0.5 rounded bg-slate-900">shapes_cross_operator</code>.
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
                isNavigating={isNavigating || viajeIniciado}
                onMapClick={() => {}}
                desviosGuardados={desviosEnMapa}
              />

              {/* HUD: Panel Gigante (Head-Up Display) de Próxima Parada para Conducción */}
              {(isNavigating || (conductorMode && viajeIniciado)) && siguienteParada && (
                <div className="absolute top-4 left-4 right-4 z-[20] pointer-events-none">
                  <div className="bg-slate-900/90 backdrop-blur-md rounded-2xl shadow-2xl overflow-hidden border border-slate-700/50 max-w-xl mx-auto flex">
                    {/* Distancia Indicator */}
                    <div className="bg-emerald-600 text-white font-bold px-6 py-4 flex flex-col items-center justify-center min-w-[100px]">
                      <span className="text-3xl tracking-tighter shadow-md">
                        {siguienteParada.distanciaMetros === -1
                          ? '--'
                          : siguienteParada.distanciaMetros > 999
                            ? (siguienteParada.distanciaMetros / 1000).toFixed(1)
                            : siguienteParada.distanciaMetros}
                      </span>
                      <span className="text-xs font-semibold uppercase opacity-90">
                        {siguienteParada.distanciaMetros === -1
                          ? 'GPS N/A'
                          : siguienteParada.distanciaMetros > 999
                            ? 'km'
                            : 'metros'}
                      </span>
                    </div>
                    {/* Nombre Indicator */}
                    <div className="px-5 py-4 flex-1 flex flex-col justify-center">
                      <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">
                        Próxima Parada
                      </p>
                      <h2 className="text-white text-xl md:text-2xl font-black leading-tight truncate">
                        {siguienteParada.parada.nombre || `Parada #${siguienteParada.parada.orden}`}
                      </h2>
                    </div>
                  </div>
                </div>
              )}

              {conductorMode && selectedCodigo && (
                <button
                  type="button"
                  onClick={() => setShowIncidencias(true)}
                  className="absolute bottom-4 right-4 z-[20] min-h-[56px] min-w-[56px] flex items-center justify-center gap-2 px-4 py-3 rounded-full bg-amber-500 hover:bg-amber-400 active:bg-amber-300 text-slate-900 font-bold shadow-lg touch-manipulation"
                  aria-label="Reportar incidencia"
                  title="Reportar situación en ruta"
                >
                  <span className="text-xl leading-none">🚨</span>
                  {incidenciasAbiertas > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-black px-1">
                      {incidenciasAbiertas}
                    </span>
                  )}
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

      {/* ── Panel de gestión de desvíos ── */}
      {showDesvioPanel && selectedCodigo && linea && (
        <div className="fixed inset-0 z-[90] flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm md:p-4">
          <div className="w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col rounded-t-3xl md:rounded-2xl bg-slate-900 border border-slate-700 shadow-xl">
            <div className="flex items-center justify-between p-4 border-b border-slate-700 shrink-0">
              <h3 className="text-lg font-bold text-white">
                Desvíos — Línea {selectedCodigo.replace(/[ab]$/i, '').toUpperCase()}
              </h3>
              <button
                type="button"
                onClick={() => setShowDesvioPanel(false)}
                aria-label="Cerrar panel de desvíos"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-slate-700 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-4">
              <DesvioPanel
                lineaCodigo={selectedCodigo}
                lineaNombre={`${linea.nombre || selectedCodigo} — ${linea.origen || ''} → ${linea.destino || ''}`}
                onOpenEditor={(desvioExistente) => {
                  setEditingDesvio(desvioExistente);
                  setShowDesvioPanel(false);
                  setShowDesvioMapEditor(true);
                }}
                onDesviosChange={() => setDesviosVersion((v) => v + 1)}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Panel de incidencias rápidas ── */}
      {showIncidencias && (
        <IncidenciaRapida
          lineaCodigo={selectedCodigo ?? undefined}
          lineaNombre={
            linea
              ? `${linea.nombre || selectedCodigo} — ${linea.origen || ''} → ${linea.destino || ''}`
              : undefined
          }
          conductorUid={user?.uid}
          posicionActual={navigationPosition}
          onClose={() => {
            setShowIncidencias(false);
            contarIncidenciasAbiertas()
              .then((count) => setIncidenciasAbiertas(count))
              .catch(() => {});
          }}
        />
      )}
      {showLineEditor && selectedCodigo && (
        <div className="fixed inset-0 z-[90] flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm md:p-4">
          <div className="w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col rounded-t-3xl md:rounded-2xl bg-slate-800 border border-slate-600 shadow-xl">
            <div className="flex items-center justify-between p-4 border-b border-slate-700 shrink-0">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Pencil className="w-5 h-5 text-blue-400 shrink-0" />
                Editar L\u00ednea {selectedCodigo.replace(/[ab]$/i, '').toUpperCase()}
              </h3>
              <button
                type="button"
                onClick={() => setShowLineEditor(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-lg hover:bg-slate-700 active:bg-slate-600 text-slate-400 touch-manipulation"
                aria-label="Cerrar editor"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-4">
              <div>
                <label className="block text-slate-400 text-sm font-medium mb-1">
                  Nombre de la l\u00ednea
                </label>
                <input
                  type="text"
                  value={editNombre}
                  onChange={(e) => setEditNombre(e.target.value)}
                  placeholder="Ej: 300 \u2014 Cer. Central \u2192 Instrucciones"
                  className="w-full min-h-[44px] px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="block text-slate-400 text-sm font-medium mb-1">Origen</label>
                  <input
                    type="text"
                    value={editOrigen}
                    onChange={(e) => setEditOrigen(e.target.value)}
                    placeholder="Terminal de salida"
                    className="w-full min-h-[44px] px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const tmp = editOrigen;
                    setEditOrigen(editDestino);
                    setEditDestino(tmp);
                  }}
                  className="flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-xl bg-amber-600 hover:bg-amber-500 active:bg-amber-400 text-white touch-manipulation"
                  title="Intercambiar origen / destino"
                  aria-label="Intercambiar origen y destino"
                >
                  <ArrowUpDown className="w-5 h-5" />
                </button>
                <div className="flex-1">
                  <label className="block text-slate-400 text-sm font-medium mb-1">Destino</label>
                  <input
                    type="text"
                    value={editDestino}
                    onChange={(e) => setEditDestino(e.target.value)}
                    placeholder="Terminal de llegada"
                    className="w-full min-h-[44px] px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>
              <p className="text-slate-500 text-xs">
                Las correcciones se guardan localmente y se aplican autom\u00e1ticamente al
                seleccionar esta l\u00ednea.
              </p>
            </div>
            <div className="p-4 border-t border-slate-700 flex gap-3">
              <button
                type="button"
                onClick={() => setShowLineEditor(false)}
                className="flex-1 min-h-[44px] px-4 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-medium touch-manipulation"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveLineEditor}
                className="flex-1 min-h-[44px] px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-400 text-white font-medium flex items-center justify-center gap-2 touch-manipulation"
              >
                <Check className="w-4 h-4" />
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Editor de recorrido (pantalla completa, drag tipo Google Maps) ── */}
      {showRouteEditor && selectedCodigo && linea && (
        <RouteEditorMap
          lineaNombre={`${linea.nombre || selectedCodigo} — ${linea.origen || ''} → ${linea.destino || ''}`}
          initialPoints={
            getRouteOverride(selectedCodigo) ??
            linea.recorrido.filter((p) => p.lat !== 0 || p.lng !== 0)
          }
          onSave={handleRouteSave}
          onClose={() => setShowRouteEditor(false)}
          onReset={handleRouteReset}
          hasOverride={routeHasOverride}
        />
      )}

      {/* ── Editor de desvío en mapa (pantalla completa, 2 pasos) ── */}
      {showDesvioMapEditor && selectedCodigo && linea && (
        <DesvioMapEditor
          lineaCodigo={selectedCodigo}
          lineaNombre={`${linea.nombre || selectedCodigo} — ${linea.origen || ''} → ${linea.destino || ''}`}
          rutaBase={
            getRouteOverride(selectedCodigo) ??
            linea.recorrido.filter((p) => p.lat !== 0 || p.lng !== 0)
          }
          desvioExistente={editingDesvio}
          onSaved={() => {
            setDesviosVersion((v) => v + 1);
            setShowDesvioMapEditor(false);
            setEditingDesvio(undefined);
            setShowDesvioPanel(true);
          }}
          onClose={() => {
            setShowDesvioMapEditor(false);
            setEditingDesvio(undefined);
            setShowDesvioPanel(true);
          }}
        />
      )}
    </div>
  );
}
