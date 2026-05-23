/**
 * DesvioMapEditor — Editor de desvíos UCOT tipo Google Maps.
 *
 * Flujo en 2 pasos:
 *  Paso 1 → Configurar nombre, tipo y horario:
 *            · Puntual: fecha + rango horario (ej: evento, partido)
 *            · Semanal: días de la semana + rango horario (ej: ferias vecinales)
 *            · Indefinido: siempre activo (ej: obra permanente)
 *  Paso 2 → Dibujar el recorrido alternativo arrastrando puntos en el mapa.
 *
 * Al guardar, crea/actualiza un DesvioGuardado en localStorage via desviosService.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Save,
  X,
  MousePointer2,
  Trash2,
  Calendar,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  Clock,
  Infinity as InfinityIcon,
  AlertTriangle,
} from 'lucide-react';
import {
  crearDesvio,
  actualizarDesvio,
  type DesvioGuardado,
  type LatLng,
  type TipoDesvio,
} from '../../services/desviosService';
import { splitIntoSegments } from '../../utils/tacticalGeom';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface DesvioMapEditorProps {
  /** Código de la línea UCOT (ej: "17A") */
  lineaCodigo: string;
  /** Nombre visible de la línea */
  lineaNombre: string;
  /** Trazado base de la línea (puntos del GeoServer o override) */
  rutaBase: LatLng[];
  /** Desvío existente que se está editando (undefined = nuevo). */
  desvioExistente?: DesvioGuardado;
  /** Callback al guardar con éxito */
  onSaved: (desvio: DesvioGuardado) => void;
  /** Callback al cerrar sin guardar */
  onClose: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const DIAS_SEMANA = [
  { idx: 1, label: 'Lun', abr: 'L' },
  { idx: 2, label: 'Mar', abr: 'M' },
  { idx: 3, label: 'Mié', abr: 'X' },
  { idx: 4, label: 'Jue', abr: 'J' },
  { idx: 5, label: 'Vie', abr: 'V' },
  { idx: 6, label: 'Sáb', abr: 'S' },
  { idx: 0, label: 'Dom', abr: 'D' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Íconos Leaflet
// ─────────────────────────────────────────────────────────────────────────────

function createNodeIcon(isEndpoint: boolean, isDesvio = false) {
  const color = isDesvio
    ? isEndpoint
      ? '#f97316'
      : '#ea580c' // naranja = desvío
    : isEndpoint
      ? '#22c55e'
      : '#2563eb'; // verde/azul = ruta base
  return L.divIcon({
    html: `<div style="
      width: 14px; height: 14px;
      background: ${color};
      border: 2px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 5px rgba(0,0,0,0.5);
      cursor: grab;
    "></div>`,
    className: '',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function createMidIcon() {
  return L.divIcon({
    html: `<div style="
      width: 10px; height: 10px;
      background: rgba(251,146,60,0.6);
      border: 1.5px solid white;
      border-radius: 50%;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
      cursor: crosshair;
    "></div>`,
    className: '',
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────────────────────

export default function DesvioMapEditor({
  lineaCodigo,
  lineaNombre,
  rutaBase,
  desvioExistente,
  onSaved,
  onClose,
}: DesvioMapEditorProps) {
  // ── Paso actual del wizard ────────────────────────────────────────────────
  const [paso, setPaso] = useState<1 | 2>(1);

  // ── Estado formulario (paso 1) ────────────────────────────────────────────
  const [nombre, setNombre] = useState(desvioExistente?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(desvioExistente?.descripcion ?? '');
  const [tipo, setTipo] = useState<TipoDesvio>(desvioExistente?.tipo ?? 'puntual');

  // Puntual
  const today = new Date().toISOString().slice(0, 10);
  const [fecha, setFecha] = useState(desvioExistente?.fecha ?? today);
  const [horaInicio, setHoraInicio] = useState(desvioExistente?.horaInicio ?? '06:00');
  const [horaFin, setHoraFin] = useState(desvioExistente?.horaFin ?? '22:00');

  // Semanal
  const [diasSemana, setDiasSemana] = useState<number[]>(desvioExistente?.diasSemana ?? [2]); // Martes por defecto
  const [horaInicioSem, setHoraInicioSem] = useState(desvioExistente?.horaInicioSemanal ?? '06:00');
  const [horaFinSem, setHoraFinSem] = useState(desvioExistente?.horaFinSemanal ?? '22:00');

  // ── Estado mapa (paso 2) ──────────────────────────────────────────────────
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const pointsRef = useRef<LatLng[]>(
    // Si editamos un desvío existente → cargamos su ruta guardada.
    // Si es nuevo → vacío: el usuario dibuja SOLO los puntos del tramo alternativo.
    desvioExistente?.rutaAlternativa?.length ? [...desvioExistente.rutaAlternativa] : [],
  );
  const markersRef = useRef<L.Marker[]>([]);
  const midMarkersRef = useRef<L.Marker[]>([]);
  const desvioPolyRef = useRef<L.Polyline | null>(null);
  const basePolyRef = useRef<L.Polyline | null>(null);

  const [pointCount, setPointCount] = useState(pointsRef.current.length);
  const [isDirty, setIsDirty] = useState(!!desvioExistente?.rutaAlternativa?.length);
  const [saving, setSaving] = useState(false);

  // ── Toggle día de la semana ───────────────────────────────────────────────
  const toggleDia = (idx: number) => {
    setDiasSemana((prev) => (prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx]));
  };

  // ── Validación paso 1 ─────────────────────────────────────────────────────
  const paso1Valido = nombre.trim().length >= 3 && (tipo !== 'semanal' || diasSemana.length > 0);

  // ─────────────────────────────────────────────────────────────────────────
  // Lógica del mapa (paso 2)
  // ─────────────────────────────────────────────────────────────────────────

  const rebuildLayer = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const pts = pointsRef.current;

    markersRef.current.forEach((m) => map.removeLayer(m));
    midMarkersRef.current.forEach((m) => map.removeLayer(m));
    markersRef.current = [];
    midMarkersRef.current = [];

    desvioPolyRef.current?.setLatLngs(pts.map((p) => [p.lat, p.lng]));

    pts.forEach((pt, idx) => {
      const isEndpoint = idx === 0 || idx === pts.length - 1;
      const marker = L.marker([pt.lat, pt.lng], {
        icon: createNodeIcon(isEndpoint, true),
        draggable: true,
        zIndexOffset: 500,
      });

      marker.on('drag', (e) => {
        const latlng = (e as L.LeafletMouseEvent).latlng;
        pointsRef.current[idx] = { lat: latlng.lat, lng: latlng.lng };
        desvioPolyRef.current?.setLatLngs(pointsRef.current.map((p) => [p.lat, p.lng]));
      });

      marker.on('dragend', () => {
        setIsDirty(true);
        setPointCount(pointsRef.current.length);
        rebuildLayer();
      });

      marker.on('dblclick', () => {
        if (pts.length <= 2) return;
        if (idx === 0 || idx === pts.length - 1) return;
        pointsRef.current.splice(idx, 1);
        setIsDirty(true);
        setPointCount(pointsRef.current.length);
        rebuildLayer();
      });

      marker.addTo(map);
      markersRef.current.push(marker);
    });

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const midMarker = L.marker([(a.lat + b.lat) / 2, (a.lng + b.lng) / 2], {
        icon: createMidIcon(),
        draggable: true,
        zIndexOffset: 400,
      });

      const capturedI = i;

      midMarker.on('dragstart', () => {
        const midPt = midMarker.getLatLng();
        pointsRef.current.splice(capturedI + 1, 0, { lat: midPt.lat, lng: midPt.lng });
        midMarker.setIcon(createNodeIcon(false, true));
      });

      midMarker.on('drag', (e) => {
        const latlng = (e as L.LeafletMouseEvent).latlng;
        pointsRef.current[capturedI + 1] = { lat: latlng.lat, lng: latlng.lng };
        desvioPolyRef.current?.setLatLngs(pointsRef.current.map((p) => [p.lat, p.lng]));
      });

      midMarker.on('dragend', () => {
        setIsDirty(true);
        setPointCount(pointsRef.current.length);
        rebuildLayer();
      });

      midMarker.addTo(map);
      midMarkersRef.current.push(midMarker);
    }
  }, []);

  // Inicializar mapa cuando se llega al paso 2
  useEffect(() => {
    if (paso !== 2) return;
    // Esperar un tick para que el DOM esté renderizado
    const timer = setTimeout(() => {
      if (!mapContainerRef.current || mapRef.current) return;

      const pts = pointsRef.current.filter((p) => p.lat !== 0 || p.lng !== 0);
      const basePts = rutaBase.filter((p) => p.lat !== 0 || p.lng !== 0);
      const center: [number, number] =
        pts.length > 0
          ? [pts[Math.floor(pts.length / 2)].lat, pts[Math.floor(pts.length / 2)].lng]
          : [-34.9, -56.16];

      const map = L.map(mapContainerRef.current, {
        center,
        zoom: 14,
        doubleClickZoom: false,
      });

      L.tileLayer(TILE_URL, { attribution: TILE_ATTR }).addTo(map);

      // Ruta base (gris semitransparente, referencia)
      if (basePts.length >= 2) {
        const baseSegments = splitIntoSegments(basePts);
        const basePositions = baseSegments.map((seg) =>
          seg.map((p) => [p.lat, p.lng] as [number, number])
        );
        basePolyRef.current = L.polyline(basePositions, {
          color: '#64748b',
          weight: 4,
          opacity: 0.45,
          dashArray: '8 6',
        }).addTo(map);
      }

      // Desvío (naranja, editable)
      desvioPolyRef.current = L.polyline(
        pts.map((p) => [p.lat, p.lng] as [number, number]),
        { color: '#f97316', weight: 5, opacity: 0.9 },
      ).addTo(map);

      // Evento click: agrega puntos al final del desvío
      map.on('click', (e: L.LeafletMouseEvent) => {
        pointsRef.current.push({ lat: e.latlng.lat, lng: e.latlng.lng });
        desvioPolyRef.current?.setLatLngs(pointsRef.current.map((p) => [p.lat, p.lng]));
        setIsDirty(true);
        setPointCount(pointsRef.current.length);
        rebuildLayer();
      });

      mapRef.current = map;

      // Centrar: si hay puntos del desvío → ajustar a ellos; si no → a la ruta base
      if (pts.length >= 2) {
        const bounds = L.latLngBounds(pts.map((p) => [p.lat, p.lng] as [number, number]));
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      } else if (basePts.length >= 2) {
        const bounds = L.latLngBounds(basePts.map((p) => [p.lat, p.lng] as [number, number]));
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      }

      rebuildLayer();
    }, 50);

    return () => {
      clearTimeout(timer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso]);

  // ── Guardar desvío ────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    const rutaAlternativa = pointsRef.current.filter((p) => p.lat !== 0 || p.lng !== 0);
    if (rutaAlternativa.length < 2) return;

    setSaving(true);
    try {
      const base = {
        lineaCodigo,
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || undefined,
        tipo,
        rutaAlternativa,
        activo: true,
        // Puntual
        fecha: tipo === 'puntual' ? fecha : undefined,
        horaInicio: tipo === 'puntual' ? horaInicio : undefined,
        horaFin: tipo === 'puntual' ? horaFin : undefined,
        // Semanal
        diasSemana: tipo === 'semanal' ? diasSemana : undefined,
        horaInicioSemanal: tipo === 'semanal' ? horaInicioSem : undefined,
        horaFinSemanal: tipo === 'semanal' ? horaFinSem : undefined,
      };

      let resultado: DesvioGuardado;
      if (desvioExistente) {
        await actualizarDesvio(desvioExistente.id, base);
        resultado = {
          ...desvioExistente,
          ...base,
          actualizadoEn: new Date().toISOString(),
        } as DesvioGuardado;
      } else {
        resultado = await crearDesvio(base);
      }
      onSaved(resultado);
    } catch (err) {
      console.error('Error al guardar desvío:', err);
    } finally {
      setSaving(false);
    }
  }, [
    lineaCodigo,
    nombre,
    descripcion,
    tipo,
    fecha,
    horaInicio,
    horaFin,
    diasSemana,
    horaInicioSem,
    horaFinSem,
    desvioExistente,
    onSaved,
  ]);

  // ── Resetear al recorrido base ────────────────────────────────────────────
  const handleResetToBase = useCallback(() => {
    if (!window.confirm('¿Reemplazar el desvío actual con el recorrido base de la línea?')) return;
    pointsRef.current = [...rutaBase.filter((p) => p.lat !== 0 || p.lng !== 0)];
    setPointCount(pointsRef.current.length);
    setIsDirty(true);
    desvioPolyRef.current?.setLatLngs(pointsRef.current.map((p) => [p.lat, p.lng]));
    rebuildLayer();
  }, [rutaBase, rebuildLayer]);

  // ── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-slate-900">
      {/* ── Encabezado ── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-800 border-b border-slate-700 shrink-0">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-orange-400 font-medium uppercase tracking-wider">
            {desvioExistente ? 'Editar desvío' : 'Nuevo desvío'} — Paso {paso}/2
          </p>
          <h2 className="text-white font-bold truncate">{lineaNombre}</h2>
          <p className="text-slate-500 text-xs mt-0.5">
            {paso === 1
              ? 'Configurar programación'
              : `${pointCount} puntos — ${isDirty ? '● modificado' : 'sin cambios'}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-slate-700 text-slate-400 touch-manipulation"
          aria-label="Cerrar editor"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* ── Indicador de progreso ── */}
      <div className="flex shrink-0 bg-slate-800/50 border-b border-slate-700">
        {(['1. Programación', '2. Trazado'] as const).map((label, i) => (
          <div
            key={label}
            className={`flex-1 py-2 text-center text-xs font-medium border-b-2 transition-colors ${
              paso === i + 1
                ? 'border-orange-500 text-orange-400'
                : paso > i + 1
                  ? 'border-green-600 text-green-400'
                  : 'border-transparent text-slate-500'
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════
          PASO 1 — Configurar nombre, tipo y horario
      ══════════════════════════════════════════════════ */}
      {paso === 1 && (
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
          {/* Nombre */}
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-1.5">
              Nombre del desvío <span className="text-orange-400">*</span>
            </label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Feria Pocitos, Obra Av. Italia…"
              className="w-full min-h-[44px] px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:ring-2 focus:ring-orange-500 focus:outline-none"
            />
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-1.5">
              Descripción <span className="text-slate-500 font-normal">(opcional)</span>
            </label>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Detalle del motivo del desvío…"
              rows={2}
              className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:ring-2 focus:ring-orange-500 focus:outline-none resize-none"
            />
          </div>

          {/* Tipo de desvío */}
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-3">
              Tipo de programación <span className="text-orange-400">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { val: 'puntual', icon: Calendar, label: 'Puntual', sub: 'Una fecha específica' },
                  {
                    val: 'semanal',
                    icon: RefreshCw,
                    label: 'Semanal',
                    sub: 'Días fijos (ej: ferias)',
                  },
                  {
                    val: 'indefinido',
                    icon: InfinityIcon,
                    label: 'Indefinido',
                    sub: 'Siempre activo',
                  },
                ] as const
              ).map(({ val, icon: Icon, label, sub }) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setTipo(val)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center touch-manipulation ${
                    tipo === val
                      ? 'border-orange-500 bg-orange-900/30 text-orange-300'
                      : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs font-semibold">{label}</span>
                  <span className="text-[10px] opacity-70 leading-tight">{sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Opciones según tipo ── */}

          {/* PUNTUAL */}
          {tipo === 'puntual' && (
            <div className="space-y-3 p-4 rounded-xl bg-slate-800/60 border border-slate-700">
              <div className="flex items-center gap-2 text-orange-400 mb-2">
                <Calendar className="w-4 h-4" />
                <span className="text-sm font-semibold">Fecha del desvío</span>
              </div>
              <div>
                <label htmlFor="desvio-fecha" className="block text-xs text-slate-400 mb-1">
                  Fecha
                </label>
                <input
                  id="desvio-fecha"
                  type="date"
                  value={fecha}
                  min={today}
                  onChange={(e) => setFecha(e.target.value)}
                  title="Fecha del desvío"
                  className="w-full min-h-[44px] px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white focus:ring-2 focus:ring-orange-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="desvio-hora-inicio" className="block text-xs text-slate-400 mb-1">
                    Hora inicio
                  </label>
                  <input
                    id="desvio-hora-inicio"
                    type="time"
                    value={horaInicio}
                    onChange={(e) => setHoraInicio(e.target.value)}
                    title="Hora de inicio del desvío"
                    className="w-full min-h-[44px] px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white focus:ring-2 focus:ring-orange-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="desvio-hora-fin" className="block text-xs text-slate-400 mb-1">
                    Hora fin
                  </label>
                  <input
                    id="desvio-hora-fin"
                    type="time"
                    value={horaFin}
                    onChange={(e) => setHoraFin(e.target.value)}
                    title="Hora de fin del desvío"
                    className="w-full min-h-[44px] px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white focus:ring-2 focus:ring-orange-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* SEMANAL */}
          {tipo === 'semanal' && (
            <div className="space-y-3 p-4 rounded-xl bg-slate-800/60 border border-slate-700">
              <div className="flex items-center gap-2 text-orange-400 mb-2">
                <RefreshCw className="w-4 h-4" />
                <span className="text-sm font-semibold">Días de la semana</span>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {DIAS_SEMANA.map(({ idx, label, abr }) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleDia(idx)}
                    title={label}
                    className={`w-10 h-10 rounded-xl text-sm font-bold transition-all touch-manipulation ${
                      diasSemana.includes(idx)
                        ? 'bg-orange-500 text-white shadow-lg shadow-orange-900/40'
                        : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                    }`}
                  >
                    {abr}
                  </button>
                ))}
              </div>
              {diasSemana.length === 0 && (
                <p className="text-xs text-red-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Seleccioná al menos un día
                </p>
              )}
              <div className="flex items-center gap-2 pt-1">
                <Clock className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-400 font-medium">Horario en esos días</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="desvio-sem-inicio" className="block text-xs text-slate-400 mb-1">
                    Hora inicio
                  </label>
                  <input
                    id="desvio-sem-inicio"
                    type="time"
                    value={horaInicioSem}
                    onChange={(e) => setHoraInicioSem(e.target.value)}
                    title="Hora de inicio del desvío semanal"
                    className="w-full min-h-[44px] px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white focus:ring-2 focus:ring-orange-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="desvio-sem-fin" className="block text-xs text-slate-400 mb-1">
                    Hora fin
                  </label>
                  <input
                    id="desvio-sem-fin"
                    type="time"
                    value={horaFinSem}
                    onChange={(e) => setHoraFinSem(e.target.value)}
                    title="Hora de fin del desvío semanal"
                    className="w-full min-h-[44px] px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white focus:ring-2 focus:ring-orange-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* INDEFINIDO */}
          {tipo === 'indefinido' && (
            <div className="p-4 rounded-xl bg-amber-900/20 border border-amber-800/40">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-amber-300 text-sm font-semibold">Desvío permanente</p>
                  <p className="text-amber-400/80 text-xs mt-1">
                    Este desvío estará siempre activo hasta que lo desactives manualmente. Usalo
                    para obras de largo plazo o cambios de recorrido definitivos.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          PASO 2 — Dibujar el trazado en el mapa
      ══════════════════════════════════════════════════ */}
      {paso === 2 && (
        <>
          {/* Instrucciones */}
          <div className="flex items-center gap-3 px-4 py-2 bg-orange-950/50 border-b border-orange-900/40 shrink-0 overflow-x-auto">
            <div className="flex items-center gap-1.5 shrink-0 text-orange-300 text-xs">
              <MousePointer2 className="w-3.5 h-3.5 shrink-0" />
              <span>
                <span className="text-orange-400 font-semibold">Clic</span> en el mapa para agregar
                puntos del tramo alternativo
              </span>
            </div>
            <span className="text-slate-600 shrink-0">·</span>
            <div className="flex items-center gap-1.5 shrink-0 text-slate-400 text-xs">
              <MousePointer2 className="w-3.5 h-3.5 shrink-0" />
              <span>
                Arrastrá puntos <span className="text-orange-400 font-semibold">naranjas</span> para
                ajustar
              </span>
            </div>
            <span className="text-slate-600 shrink-0">·</span>
            <div className="flex items-center gap-1.5 shrink-0 text-slate-500 text-xs">
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              <span>Doble clic para eliminar punto</span>
            </div>
          </div>

          {/* Leyenda */}
          <div className="flex items-center gap-4 px-4 py-1.5 bg-slate-800/60 border-b border-slate-700/50 shrink-0">
            <div className="flex items-center gap-1.5">
              <div className="w-8 h-1 rounded-full bg-slate-400/40 border-b-2 border-dashed border-slate-400/60" />
              <span className="text-[10px] text-slate-500">Ruta original</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-8 h-1 rounded-full bg-orange-500" />
              <span className="text-[10px] text-orange-400">Desvío</span>
            </div>
          </div>

          {/* Mapa */}
          <div ref={mapContainerRef} className="flex-1 w-full min-h-0" />
        </>
      )}

      {/* ── Pie: navegación entre pasos y AccionFinal ── */}
      <div className="flex items-center gap-2 p-3 bg-slate-800 border-t border-slate-700 shrink-0">
        {paso === 2 && (
          <button
            type="button"
            onClick={handleResetToBase}
            className="flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium touch-manipulation"
            title="Restablecer al recorrido base de la línea"
          >
            <RefreshCw className="w-4 h-4" />
            Usar ruta base
          </button>
        )}

        <div className="flex-1" />

        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] px-5 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium touch-manipulation"
        >
          Cancelar
        </button>

        {paso === 1 ? (
          <button
            type="button"
            disabled={!paso1Valido}
            onClick={() => setPaso(2)}
            className="flex items-center gap-2 min-h-[44px] px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold touch-manipulation"
          >
            Dibujar trazado
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setPaso(1)}
              className="flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium touch-manipulation"
            >
              <ChevronLeft className="w-4 h-4" />
              Atrás
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || pointCount < 2}
              className="flex items-center gap-2 min-h-[44px] px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold touch-manipulation"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Guardando…' : 'Guardar desvío'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
