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
  useMapEvents,
  CircleMarker,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { LineaUCOT, PuntoLatLng } from '../../types/lineasUcot';
import type { DesvioGuardado } from '../../services/desviosService';
import type { BusLive } from '../../hooks/useLiveBusesByLine';
import { splitIntoSegments } from '../../utils/tacticalGeom';

function MapClickHandler({ onMapClick }: { onMapClick?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      if (onMapClick) onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export type UserPositionData = { lat: number; lng: number; heading?: null | number };

const DEFAULT_CENTER: [number, number] = [-34.9, -56.16];
const DEFAULT_ZOOM = 13;

const blueOptions = { color: '#2563eb', weight: 5, smoothFactor: 0 };
const orangeOptions = { color: '#ea580c', weight: 4, smoothFactor: 0 };

function FitBounds({ points }: { points: PuntoLatLng[] }) {
  const map = useMap();
  useEffect(() => {
    // Filtrar (0,0) antes de construir bounds — previene zoom al Golfo de Guinea
    const validPoints = points.filter((p) => p.lat !== 0 || p.lng !== 0);
    if (validPoints.length < 2) return;
    const bounds = L.latLngBounds(validPoints.map((p) => [p.lat, p.lng] as [number, number]));
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
    // GUARD: never flyTo (0,0) — Null Island / África
    if (stop && (stop.lat !== 0 || stop.lng !== 0)) {
      map.flyTo([stop.lat, stop.lng], 16, { animate: true });
    }
  }, [map, stopId, paradas]);
  return null;
}

const GUIA_ZOOM = 17;

/** Centra el mapa en la posición del conductor cuando está en viaje (guía tipo Waze). */
function FollowUser({
  userPosition,
  active,
}: {
  userPosition: UserPositionData | null;
  active: boolean;
}) {
  const map = useMap();
  useEffect(() => {
    if (!active || !userPosition || (userPosition.lat === 0 && userPosition.lng === 0)) return;
    map.flyTo([userPosition.lat, userPosition.lng], GUIA_ZOOM, { duration: 1.2 });
  }, [map, active, userPosition]);
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
  userPosition: UserPositionData | null;
  /** Modo mobile: solo mapa + paradas, sin paneles admin. */
  conductorMode?: boolean;
  /** Viaje iniciado: el mapa sigue la posición del conductor (guía). */
  followUser?: boolean;
  /** Navegación activa: dibujar paradas como CircleMarkers (ámbar). */
  isNavigating?: boolean;
  onMapClick?: (lat: number, lng: number) => void;
  pickedTemporal?: { lat: number; lng: number } | null;
  pickedDesde?: { lat: number; lng: number } | null;
  pickedHasta?: { lat: number; lng: number } | null;
  /** Desvíos guardados en localStorage para mostrar como overlay punteado. */
  desviosGuardados?: DesvioGuardado[];
  /** Buses en vivo de la línea (GPS ahora mismo). */
  liveBuses?: BusLive[];
}

/** Color por fuente del bus (mismo patrón que ShadowRadar). */
const BUS_COLOR_BY_FUENTE: Record<BusLive['fuente'], string> = {
  viajes_activos: '#10b981', // green-500
  vehicle_events: '#3b82f6', // blue-500
  competidores: '#a855f7',   // purple-500
};

function busIcon(b: BusLive): L.DivIcon {
  const color = BUS_COLOR_BY_FUENTE[b.fuente];
  const heading = typeof b.heading === 'number' ? b.heading : 0;
  return L.divIcon({
    html: `<div style="
      width: 26px; height: 26px;
      background: ${color}; color: white;
      border: 2px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 6px rgba(0,0,0,0.45);
      display: flex; align-items: center; justify-content: center;
      transform: rotate(${heading}deg);
      transition: transform .4s ease;
    ">
      <div style="
        width: 0; height: 0;
        border-left: 5px solid transparent;
        border-right: 5px solid transparent;
        border-bottom: 9px solid white;
        margin-top: -2px;
      "></div>
    </div>`,
    className: 'bus-live-marker',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

export default function RouteMap({
  linea,
  highlightStopId,
  userPosition,
  conductorMode: _conductorMode = false,
  followUser = false,
  isNavigating = false,
  onMapClick,
  pickedTemporal,
  pickedDesde,
  pickedHasta,
  desviosGuardados = [],
  liveBuses = [],
}: RouteMapProps) {
  // Si no hay línea NI buses live, no hay nada que renderizar.
  if (!linea && liveBuses.length === 0) {
    return (
      <div className="w-full h-full min-h-[300px] bg-slate-800 flex items-center justify-center text-slate-500">
        <p>Seleccione una línea</p>
      </div>
    );
  }

  // Filtrar puntos inválidos y dividir en segmentos contiguos para evitar zig-zags
  const basePoints = (linea?.recorrido ?? []).filter(isValidPoint);
  const segments = splitIntoSegments(basePoints);
  const positions = segments.map((seg) => seg.map((p) => [p.lat, p.lng] as [number, number]));
  const desviosActivosFijos = linea?.desviosFijos.filter((d) => d.activo) ?? [];
  const desviosActivosTemp = linea?.desviosTemporales.filter((d) => d.activo) ?? [];

  // Para FitBounds: combinar puntos del recorrido + posiciones de buses live.
  const allFitPoints: PuntoLatLng[] = [
    ...((linea?.recorrido ?? []).filter(isValidPoint)),
    ...liveBuses.map((b) => ({ lat: b.lat, lng: b.lng })),
  ];
  const fitCenter: [number, number] =
    allFitPoints.length > 0
      ? [allFitPoints[Math.floor(allFitPoints.length / 2)].lat, allFitPoints[Math.floor(allFitPoints.length / 2)].lng]
      : DEFAULT_CENTER;

  return (
    <div className="w-full h-full min-h-[300px] rounded-xl overflow-hidden border border-slate-700 relative z-[1]">
      <MapContainer
        center={fitCenter}
        zoom={DEFAULT_ZOOM}
        className="h-full w-full"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapClickHandler onMapClick={onMapClick} />
        {allFitPoints.length > 1 && !followUser && <FitBounds points={allFitPoints} />}
        {followUser && <FollowUser userPosition={userPosition} active={followUser} />}
        {!followUser && linea && <CenterOnStop stopId={highlightStopId} paradas={linea.paradas} />}

        {/* Recorrido principal */}
        <Polyline positions={positions} pathOptions={blueOptions} />

        {/* ── Desvíos guardados (localStorage): overlay punteado sobre el mapa ── */}
        {desviosGuardados
          .filter((d) => d.rutaAlternativa && d.rutaAlternativa.length >= 2)
          .map((d) => {
            const isActivo = d.activo;
            const color = isActivo ? '#f97316' : '#eab308';
            const opacity = isActivo ? 0.9 : 0.5;
            const weight = isActivo ? 5 : 3;

            const tipoLabel: Record<string, string> = {
              puntual: 'Puntual',
              semanal: 'Semanal (feria/evento)',
              indefinido: 'Indefinido (obra)',
            };

            let vigenciaInfo = '';
            if (d.tipo === 'semanal' && d.diasSemana && d.diasSemana.length > 0) {
              const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
              vigenciaInfo = `Activo los: ${d.diasSemana.map((n) => dias[n] ?? n).join(', ')}`;
              if (d.horaInicioSemanal && d.horaFinSemanal) {
                vigenciaInfo += ` (${d.horaInicioSemanal}–${d.horaFinSemanal})`;
              }
            } else if (d.tipo === 'puntual' && d.fecha) {
              vigenciaInfo = `Fecha: ${d.fecha}`;
              if (d.horaInicio && d.horaFin) vigenciaInfo += ` ${d.horaInicio}–${d.horaFin}`;
            } else if (d.tipo === 'indefinido') {
              vigenciaInfo = 'Siempre activo';
            }

            return (
              <Polyline
                key={d.id}
                positions={d.rutaAlternativa.map((p) => [p.lat, p.lng] as [number, number])}
                pathOptions={{
                  color,
                  weight,
                  opacity,
                  dashArray: '10, 8',
                  lineCap: 'round',
                  lineJoin: 'round',
                  smoothFactor: 0,
                }}
              >
                <Popup>
                  <div className="desvio-popup">
                    <strong className="desvio-popup__title">
                      {isActivo ? '⚠️' : '🗓️'} {d.nombre || d.descripcion || 'Desvío'}
                    </strong>
                    <span className="desvio-popup__type">{tipoLabel[d.tipo] ?? d.tipo}</span>
                    {vigenciaInfo && <div className="desvio-popup__vigencia">{vigenciaInfo}</div>}
                    <div
                      className={`desvio-popup__estado${isActivo ? '' : ' desvio-popup__estado--inactivo'}`}
                    >
                      Estado: {isActivo ? '✅ Activo' : '⏸️ Inactivo'}
                    </div>
                  </div>
                </Popup>
              </Polyline>
            );
          })}

        {/* Paradas como CircleMarkers en modo navegación (contraste ámbar) */}
        {isNavigating &&
          linea &&
          linea.paradas.length > 0 &&
          linea.paradas.map((p) => {
            if (p.lat === 0 && p.lng === 0) return null;
            return (
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
            );
          })}

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
        {linea &&
          linea.paradas.map((p, i) => {
            if (p.lat === 0 && p.lng === 0) return null;
            return (
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
            );
          })}

        {/* ── Buses en vivo (GPS actual de la flota operando esta línea) ── */}
        {liveBuses.map((b) => (
          <Marker key={b.id} position={[b.lat, b.lng]} icon={busIcon(b)}>
            <Popup>
              <strong>{b.empresa} · {b.codigoLinea}</strong>
              <br />
              Coche {b.cocheId}
              <br />
              {b.velocidad != null ? `${Math.round(b.velocidad)} km/h · ` : ''}
              hace {b.hacieCuantoMin} min
              <br />
              <span style={{ opacity: 0.6, fontSize: 11 }}>fuente: {b.fuente}</span>
            </Popup>
          </Marker>
        ))}

        {/* Ubicación del usuario (vista conductor/navegaciòn estilo Waze) */}
        {userPosition && (
          <Marker
            position={[userPosition.lat, userPosition.lng]}
            icon={L.divIcon({
              html: `<div style="
                  width: 32px; height: 32px; 
                  background-color: #3b82f6; 
                  border: 3px solid white; 
                  border-radius: 50%; 
                  box-shadow: 0 4px 8px rgba(0,0,0,0.5); 
                  display: flex; 
                  align-items: center; 
                  justify-content: center;
                  transform: rotate(${userPosition.heading ?? 0}deg);
                  transition: transform 0.5s ease;
                ">
                  <!-- Flecha Blanca apuntando hacia arriba visualmente -->
                  <div style="
                    width: 0; 
                    height: 0; 
                    border-left: 6px solid transparent; 
                    border-right: 6px solid transparent; 
                    border-bottom: 12px solid white; 
                    margin-top: -10px;
                  "></div>
                </div>`,
              className: '',
              iconSize: [32, 32],
              iconAnchor: [16, 16],
            })}
          >
            <Popup>Su ubicación</Popup>
          </Marker>
        )}

        {/* Picked Locations */}
        {pickedTemporal && (
          <Marker
            position={[pickedTemporal.lat, pickedTemporal.lng]}
            icon={createIcon('📍 Temp', '#2563eb')}
          />
        )}
        {pickedDesde && (
          <Marker
            position={[pickedDesde.lat, pickedDesde.lng]}
            icon={createIcon('📍 Inicio', '#ea580c')}
          />
        )}
        {pickedHasta && (
          <Marker
            position={[pickedHasta.lat, pickedHasta.lng]}
            icon={createIcon('📍 Fin', '#dc2626')}
          />
        )}
      </MapContainer>
    </div>
  );
}
