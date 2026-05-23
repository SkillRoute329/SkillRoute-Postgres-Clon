/**
 * RouteEditorMap — Editor de recorrido UCOT tipo Google Maps.
 *
 * Permite al usuario:
 *  1. Ver el trazado actual con puntos de arrastre (nodos = azul, midpoints = gris).
 *  2. Arrastrar un nodo para moverlo a la calle correcta.
 *  3. Arrastrar un midpoint para insertar un nuevo punto.
 *  4. Hacer doble clic sobre un nodo para eliminarlo.
 *  5. Guardar / descartar / restaurar al original del GeoServer.
 *
 * Arquitectura: Leaflet puro (sin react-leaflet) dentro de un MapContainer,
 * porque leaflet-editable / leaflet-path-drag operan directamente sobre la
 * instancia L.Map. Usamos useEffect + ref para acceder a la instancia.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Save, RotateCcw, X, MousePointer2, Trash2 } from 'lucide-react';
import type { LatLng } from '../../services/lineOverrides';
import { splitIntoSegments, getDistance } from '../../utils/tacticalGeom';

interface RouteEditorMapProps {
  /** Nombre para mostrar en el encabezado */
  lineaNombre: string;
  /** Trazado actual (override o GeoServer) */
  initialPoints: LatLng[];
  /** Callback al guardar — devuelve el nuevo array de puntos */
  onSave: (points: LatLng[]) => void;
  /** Callback al cerrar sin guardar */
  onClose: () => void;
  /** Callback al restaurar al original */
  onReset: () => void;
  /** Si existe un override guardado (para mostrar botón Restaurar) */
  hasOverride: boolean;
}

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** Crea el ícono de un nodo draggable (punto de la ruta). */
function createNodeIcon(isEndpoint: boolean) {
  const color = isEndpoint ? '#22c55e' : '#2563eb';
  return L.divIcon({
    html: `<div style="
      width: 14px; height: 14px;
      background: ${color};
      border: 2px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 5px rgba(0,0,0,0.4);
      cursor: grab;
    "></div>`,
    className: '',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

/** Crea el ícono de un punto intermedio (midpoint) para insertar. */
function createMidIcon() {
  return L.divIcon({
    html: `<div style="
      width: 10px; height: 10px;
      background: rgba(100,116,139,0.7);
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

export default function RouteEditorMap({
  lineaNombre,
  initialPoints,
  onSave,
  onClose,
  onReset,
  hasOverride,
}: RouteEditorMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const pointsRef = useRef<LatLng[]>([...initialPoints]);
  const markersRef = useRef<L.Marker[]>([]);
  const midMarkersRef = useRef<L.Marker[]>([]);
  const polylineRef = useRef<L.Polyline | null>(null);
  const [pointCount, setPointCount] = useState(initialPoints.length);
  const [isDirty, setIsDirty] = useState(false);

  /** Reconstruye toda la capa visual a partir de pointsRef.current */
  const rebuildLayer = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const pts = pointsRef.current;

    // Limpiar marcadores anteriores
    markersRef.current.forEach((m) => map.removeLayer(m));
    midMarkersRef.current.forEach((m) => map.removeLayer(m));
    markersRef.current = [];
    midMarkersRef.current = [];

    // Actualizar polyline usando segmentos contiguos para evitar zig-zags
    if (polylineRef.current) {
      const segments = splitIntoSegments(pts);
      const polylinePositions = segments.map((seg) =>
        seg.map((p) => [p.lat, p.lng] as [number, number])
      );
      polylineRef.current.setLatLngs(polylinePositions);
    }

    // Crear marcadores draggables en cada nodo
    pts.forEach((pt, idx) => {
      const isEndpoint = idx === 0 || idx === pts.length - 1;
      const marker = L.marker([pt.lat, pt.lng], {
        icon: createNodeIcon(isEndpoint),
        draggable: true,
        zIndexOffset: 500,
      });

      marker.on('drag', (e) => {
        const latlng = (e as L.LeafletMouseEvent).latlng;
        pointsRef.current[idx] = { lat: latlng.lat, lng: latlng.lng };
        
        const segments = splitIntoSegments(pointsRef.current);
        const polylinePositions = segments.map((seg) =>
          seg.map((p) => [p.lat, p.lng] as [number, number])
        );
        polylineRef.current?.setLatLngs(polylinePositions);
      });

      marker.on('dragend', () => {
        setIsDirty(true);
        setPointCount(pointsRef.current.length);
        rebuildLayer(); // reconstruye midpoints
      });

      // Doble clic para eliminar (solo nodos intermedios)
      marker.on('dblclick', () => {
        if (pts.length <= 2) return; // mínimo 2 puntos
        if (idx === 0 || idx === pts.length - 1) return; // no borrar extremos
        pointsRef.current.splice(idx, 1);
        setIsDirty(true);
        setPointCount(pointsRef.current.length);
        rebuildLayer();
      });

      marker.addTo(map);
      markersRef.current.push(marker);
    });

    // Crear midpoints entre nodos consecutivos (para insertar)
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];

      // Ignorar saltos espaciales mayores a 800m (para no crear midpoints flotantes)
      if (getDistance(a, b) > 800) continue;

      const midLat = (a.lat + b.lat) / 2;
      const midLng = (a.lng + b.lng) / 2;
      const capturedI = i;

      const midMarker = L.marker([midLat, midLng], {
        icon: createMidIcon(),
        draggable: true,
        zIndexOffset: 400,
      });

      // Al empezar a arrastrar un midpoint → se convierte en nodo real
      midMarker.on('dragstart', () => {
        const insertAt = capturedI + 1;
        const midPt = midMarker.getLatLng();
        pointsRef.current.splice(insertAt, 0, { lat: midPt.lat, lng: midPt.lng });
        // Convertir el ícono a nodo real
        midMarker.setIcon(createNodeIcon(false));
      });

      midMarker.on('drag', (e) => {
        const idx2 = capturedI + 1;
        const latlng = (e as L.LeafletMouseEvent).latlng;
        pointsRef.current[idx2] = { lat: latlng.lat, lng: latlng.lng };
        
        const segments = splitIntoSegments(pointsRef.current);
        const polylinePositions = segments.map((seg) =>
          seg.map((p) => [p.lat, p.lng] as [number, number])
        );
        polylineRef.current?.setLatLngs(polylinePositions);
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

  // Inicializar el mapa una sola vez
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const pts = pointsRef.current.filter((p) => p.lat !== 0 || p.lng !== 0);
    const center: [number, number] =
      pts.length > 0
        ? [pts[Math.floor(pts.length / 2)].lat, pts[Math.floor(pts.length / 2)].lng]
        : [-34.9, -56.16];

    const map = L.map(mapContainerRef.current, {
      center,
      zoom: 14,
      doubleClickZoom: false, // evita zoom al doble-clic (lo usamos para borrar puntos)
    });

    L.tileLayer(TILE_URL, { attribution: TILE_ATTR }).addTo(map);

    // Polyline base dividida en segmentos contiguos
    const segments = splitIntoSegments(pts);
    const polylinePositions = segments.map((seg) =>
      seg.map((p) => [p.lat, p.lng] as [number, number])
    );
    const polyline = L.polyline(
      polylinePositions,
      {
        color: '#2563eb',
        weight: 5,
        opacity: 0.9,
      },
    ).addTo(map);
    polylineRef.current = polyline;

    mapRef.current = map;

    // Ajustar bounds al recorrido
    if (pts.length >= 2) {
      const bounds = L.latLngBounds(pts.map((p) => [p.lat, p.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }

    rebuildLayer();

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = useCallback(() => {
    const pts = pointsRef.current.filter((p) => p.lat !== 0 || p.lng !== 0);
    if (pts.length < 2) return;
    onSave(pts);
  }, [onSave]);

  const handleReset = useCallback(() => {
    if (
      window.confirm(
        '¿Restaurar el recorrido original del GeoServer? Se perderán los cambios guardados.',
      )
    ) {
      onReset();
    }
  }, [onReset]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-slate-900">
      {/* Encabezado */}
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-800 border-b border-slate-700 shrink-0">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">
            Editor de Recorrido
          </p>
          <h2 className="text-white font-bold truncate">{lineaNombre}</h2>
          <p className="text-slate-500 text-xs mt-0.5">
            {pointCount} puntos — {isDirty ? '● sin guardar' : 'sin cambios'}
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

      {/* Instrucciones */}
      <div className="flex items-center gap-3 px-4 py-2 bg-blue-950/60 border-b border-blue-900/50 shrink-0 overflow-x-auto">
        <div className="flex items-center gap-1.5 shrink-0 text-blue-300 text-xs">
          <MousePointer2 className="w-3.5 h-3.5 shrink-0" />
          <span>
            Arrastrá los puntos <span className="text-blue-400 font-semibold">azules</span> para
            moverlos
          </span>
        </div>
        <span className="text-slate-600 shrink-0">·</span>
        <div className="flex items-center gap-1.5 shrink-0 text-slate-400 text-xs">
          <MousePointer2 className="w-3.5 h-3.5 shrink-0" />
          <span>
            Arrastrá los puntos <span className="text-slate-300 font-semibold">grises</span> para
            insertar
          </span>
        </div>
        <span className="text-slate-600 shrink-0">·</span>
        <div className="flex items-center gap-1.5 shrink-0 text-red-400 text-xs">
          <Trash2 className="w-3.5 h-3.5 shrink-0" />
          <span>Doble clic en azul para eliminar punto</span>
        </div>
      </div>

      {/* Mapa (ocupa el resto) */}
      <div ref={mapContainerRef} className="flex-1 w-full min-h-0" />

      {/* Pie de botones */}
      <div className="flex items-center gap-2 p-3 bg-slate-800 border-t border-slate-700 shrink-0">
        {hasOverride && (
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-red-900/60 hover:bg-red-800/70 text-red-300 text-sm font-medium touch-manipulation"
            title="Restaurar recorrido original del GeoServer"
          >
            <RotateCcw className="w-4 h-4" />
            Restaurar original
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
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty}
          className="flex items-center gap-2 min-h-[44px] px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold touch-manipulation"
        >
          <Save className="w-4 h-4" />
          Guardar recorrido
        </button>
      </div>
    </div>
  );
}
