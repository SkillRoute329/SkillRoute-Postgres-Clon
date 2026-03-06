/**
 * Mapa Leaflet con recorrido, paradas y desvíos (Navegador UCOT).
 */
import { useEffect } from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Popup,
  useMap,
  CircleMarker,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { LineaUCOT, PuntoLatLng } from '../../types/lineasUcot';

const DEFAULT_CENTER: [number, number] = [-34.9, -56.16];
const DEFAULT_ZOOM = 13;

const blueOptions = { color: '#2563eb', weight: 5 };
const orangeOptions = { color: '#ea580c', weight: 4 };

function FitBounds({ points }: { points: PuntoLatLng[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length < 2) return;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }, [map, points]);
  return null;
}

function CenterOnStop({
  stopId,
  paradas,
}: {
  stopId: string | null;
  paradas: LineaUCOT['paradas'];
}) {
  const map = useMap();
  useEffect(() => {
    if (!stopId || !paradas.length) return;
    const stop = paradas.find((p) => p.id === stopId);
    if (stop) map.flyTo([stop.lat, stop.lng], 16, { animate: true });
  }, [map, stopId, paradas]);
  return null;
}

const GUIA_ZOOM = 17;

/** Centra el mapa en la posición del conductor cuando está en viaje (guía tipo Waze). */
function FollowUser({
  userPosition,
  active,
}: {
  userPosition: { lat: number; lng: number } | null;
  active: boolean;
}) {
  const map = useMap();
  useEffect(() => {
    if (!active || !userPosition || (userPosition.lat === 0 && userPosition.lng === 0)) return;
    map.flyTo([userPosition.lat, userPosition.lng], GUIA_ZOOM, { duration: 1.2 });
  }, [map, active, userPosition?.lat, userPosition?.lng]);
  return null;
}

const createIcon = (label: string, color: string) =>
  L.divIcon({
    html: `<span style="background:${color};color:white;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:bold;box-shadow:0 1px 3px rgba(0,0,0,0.3)">${label}</span>`,
    className: 'custom-marker',
    iconSize: [60, 24],
    iconAnchor: [30, 12],
  });

const LABEL_TEMPORAL: Record<string, string> = {
  accidente: 'Accidente',
  obra_temp: 'Obra',
  corte: 'Corte',
  pozo: 'Pozo',
  desvio_momentaneo: 'Desvío',
  obstaculo: 'Obstáculo',
  otro: 'Otro',
};

function isValidPoint(p: { lat: number; lng: number }): boolean {
  return typeof p?.lat === 'number' && typeof p?.lng === 'number' && (p.lat !== 0 || p.lng !== 0);
}

interface RouteMapProps {
  linea: LineaUCOT | null;
  /** Parada seleccionada para centrar (desde StopsList). */
  highlightStopId: string | null;
  /** Vista conductor: centrar en ubicación del usuario. */
  userPosition: { lat: number; lng: number } | null;
  /** Modo mobile: solo mapa + paradas, sin paneles admin. */
  conductorMode?: boolean;
  /** Viaje iniciado: el mapa sigue la posición del conductor (guía). */
  followUser?: boolean;
  /** Navegación activa: dibujar paradas como CircleMarkers (ámbar). */
  isNavigating?: boolean;
}

export default function RouteMap({
  linea,
  highlightStopId,
  userPosition,
  conductorMode = false,
  followUser = false,
  isNavigating = false,
}: RouteMapProps) {
  if (!linea) {
    return (
      <div className="w-full h-full min-h-[300px] bg-slate-800 flex items-center justify-center text-slate-500">
        <p>Seleccione una línea</p>
      </div>
    );
  }

  const positions = linea.recorrido.map((p) => [p.lat, p.lng] as [number, number]);
  const desviosActivosFijos = linea.desviosFijos.filter((d) => d.activo);
  const desviosActivosTemp = linea.desviosTemporales.filter((d) => d.activo);

  return (
    <div className="w-full h-full min-h-[300px] rounded-xl overflow-hidden border border-slate-700 relative z-[1]">
      <MapContainer
        center={positions.length ? positions[Math.floor(positions.length / 2)] : DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        className="h-full w-full"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {positions.length > 1 && !followUser && <FitBounds points={linea.recorrido} />}
        {followUser && <FollowUser userPosition={userPosition} active={followUser} />}
        {!followUser && <CenterOnStop stopId={highlightStopId} paradas={linea.paradas} />}

        {/* Recorrido principal */}
        <Polyline positions={positions} pathOptions={blueOptions} />

        {/* Paradas como CircleMarkers en modo navegación (contraste ámbar) */}
        {isNavigating &&
          linea.paradas.length > 0 &&
          linea.paradas.map((p) => (
            <CircleMarker
              key={p.id}
              center={[p.lat, p.lng]}
              radius={10}
              color="#d97706"
              fillColor="#f59e0b"
              fillOpacity={0.9}
              weight={2}
            >
              <Popup>{p.nombre || `Parada ${p.orden}`}</Popup>
            </CircleMarker>
          ))}

        {/* Ruta alternativa (desvíos fijos) */}
        {desviosActivosFijos.map((d) =>
          d.rutaAlternativa.length > 1 ? (
            <Polyline
              key={d.id}
              positions={d.rutaAlternativa.map((p) => [p.lat, p.lng])}
              pathOptions={orangeOptions}
            />
          ) : null,
        )}

        {/* Marcadores de desvíos temporales (tipo Waze) */}
        {desviosActivosTemp
          .filter((d) => isValidPoint(d.puntoAfectado))
          .map((d) => (
            <Marker
              key={d.id}
              position={[d.puntoAfectado.lat, d.puntoAfectado.lng]}
              icon={L.divIcon({
                html: `<span style="background:#dc2626;color:white;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:bold;box-shadow:0 1px 3px rgba(0,0,0,0.3)">⚠ ${LABEL_TEMPORAL[d.tipo] ?? d.tipo}</span>`,
                className: '',
                iconSize: [80, 26],
                iconAnchor: [40, 13],
              })}
            >
              <Popup>
                <strong>{LABEL_TEMPORAL[d.tipo] ?? d.tipo}</strong>
                <br />
                {d.descripcion}
              </Popup>
            </Marker>
          ))}

        {/* Marcadores desvíos fijos (desde/hasta si tienen coordenadas) */}
        {desviosActivosFijos
          .filter((d) => isValidPoint(d.puntoDesde) || isValidPoint(d.puntoHasta))
          .flatMap((d) => {
            const markers: React.ReactNode[] = [];
            if (isValidPoint(d.puntoDesde)) {
              markers.push(
                <Marker
                  key={`${d.id}-desde`}
                  position={[d.puntoDesde.lat, d.puntoDesde.lng]}
                  icon={L.divIcon({
                    html: `<span style="background:#ea580c;color:white;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:bold">Desvío</span>`,
                    className: '',
                    iconSize: [60, 24],
                    iconAnchor: [30, 12],
                  })}
                >
                  <Popup>
                    <strong>Desvío fijo</strong>
                    <br />
                    {d.descripcion}
                  </Popup>
                </Marker>,
              );
            }
            if (
              isValidPoint(d.puntoHasta) &&
              (d.puntoHasta.lat !== d.puntoDesde?.lat || d.puntoHasta.lng !== d.puntoDesde?.lng)
            ) {
              markers.push(
                <Marker
                  key={`${d.id}-hasta`}
                  position={[d.puntoHasta.lat, d.puntoHasta.lng]}
                  icon={L.divIcon({
                    html: `<span style="background:#ea580c;color:white;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:bold">Desvío</span>`,
                    className: '',
                    iconSize: [60, 24],
                    iconAnchor: [30, 12],
                  })}
                >
                  <Popup>
                    <strong>Desvío fijo</strong>
                    <br />
                    {d.descripcion}
                  </Popup>
                </Marker>,
              );
            }
            return markers;
          })}

        {/* Paradas */}
        {linea.paradas.map((p, i) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={createIcon(
              i === 0 ? 'I' : i === linea.paradas.length - 1 ? 'F' : String(p.orden || i + 1),
              i === 0 ? '#059669' : i === linea.paradas.length - 1 ? '#dc2626' : '#475569',
            )}
          >
            <Popup>
              <strong>{p.nombre}</strong>
              <br />
              Orden: {p.orden || i + 1}
            </Popup>
          </Marker>
        ))}

        {/* Ubicación del usuario (vista conductor) */}
        {userPosition && (
          <Marker
            position={[userPosition.lat, userPosition.lng]}
            icon={L.divIcon({
              html: '<div style="width:16px;height:16px;background:#2563eb;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>',
              className: '',
              iconSize: [22, 22],
              iconAnchor: [11, 11],
            })}
          >
            <Popup>Su ubicación</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
