/**
 * BRTCorridorDashboard — Dashboard de Convivencia BRT
 * =====================================================
 * Módulo estratégico que muestra cómo UCOT convive con el BRT de Montevideo.
 * Visualiza impacto en líneas, oportunidades como operador alimentador,
 * y timeline del proyecto.
 *
 * DÓNDE AGREGAR:
 *   1. Crear archivo: frontend/src/pages/traffic/BRTCorridorDashboard.tsx
 *   2. Agregar ruta en tu router:
 *      { path: 'brt', element: <BRTCorridorDashboard /> }
 *   3. Agregar en el menú de navegación
 */

import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Train,
  AlertTriangle,
  TrendingUp,
  Clock,
  MapPin,
  ChevronRight,
  Info,
  DollarSign,
  Bus,
} from 'lucide-react';

// ─── Datos del Proyecto BRT ────────────────────────────────────────────────────

const BRT_DATA = {
  operativoEstimado: 2029,
  financiamiento: { BID: 500, CAF: 300, total: 800 }, // millones USD
  corredores: [
    {
      id: 'C1',
      nombre: 'Corredor 1 — 8 de Octubre',
      color: '#dc2626',
      tramo: 'Zonamérica → 18 de Julio → Ciudad Vieja',
      kmAproximados: 25,
      tiempoActualMin: 68,
      tiempoBRTMin: 43,
      reduccionMin: 25,
      tunnel: true,
      lineasUCOTAfectadas: ['300', '306', '316', '328', '329', '330'],
      // Coordenadas aproximadas del corredor (de este a oeste)
      coordenadas: [
        [-34.8665, -56.01] as [number, number], // Zonamérica
        [-34.8813, -56.052] as [number, number], // 8 de Octubre y Av Italia
        [-34.8982, -56.1012] as [number, number], // Propios
        [-34.9058, -56.162] as [number, number], // Tres Cruces
        [-34.9065, -56.188] as [number, number], // 18 de Julio centro
        [-34.9065, -56.21] as [number, number], // Ciudad Vieja
      ],
      estaciones: [
        { nombre: 'Zonamérica', lat: -34.8665, lng: -56.01 },
        { nombre: 'Av. Italia / 8 de Octubre', lat: -34.8813, lng: -56.052 },
        { nombre: 'Propios', lat: -34.8982, lng: -56.1012 },
        { nombre: 'Tres Cruces', lat: -34.9058, lng: -56.162 },
        { nombre: '18 de Julio Centro', lat: -34.9065, lng: -56.188 },
        { nombre: 'Ciudad Vieja', lat: -34.9065, lng: -56.21 },
      ],
    },
    {
      id: 'C2',
      nombre: 'Corredor 2 — Giannattasio',
      color: '#2563eb',
      tramo: 'El Pinar → Av. Italia → 18 de Julio → Ciudad Vieja',
      kmAproximados: 32,
      tiempoActualMin: 81,
      tiempoBRTMin: 54,
      reduccionMin: 27,
      tunnel: false,
      lineasUCOTAfectadas: [],
      coordenadas: [
        [-34.81, -55.93] as [number, number], // El Pinar
        [-34.85, -56.0] as [number, number], // Giannattasio
        [-34.8813, -56.052] as [number, number], // Av. Italia
        [-34.9058, -56.162] as [number, number], // Tres Cruces
        [-34.9065, -56.188] as [number, number], // 18 de Julio
        [-34.9065, -56.21] as [number, number], // Ciudad Vieja
      ],
      estaciones: [
        { nombre: 'El Pinar', lat: -34.81, lng: -55.93 },
        { nombre: 'Av. Italia', lat: -34.8813, lng: -56.052 },
        { nombre: 'Tres Cruces', lat: -34.9058, lng: -56.162 },
        { nombre: 'Ciudad Vieja', lat: -34.9065, lng: -56.21 },
      ],
    },
  ],
};

const TIMELINE = [
  { año: 2026, evento: 'Proyecto ejecutivo finalizado', estado: 'en_curso', trimestre: 'Q1-Q2' },
  {
    año: 2026,
    evento: 'Licitaciones abiertas (infraestructura + operadores)',
    estado: 'pendiente',
    trimestre: 'Q4',
  },
  { año: 2027, evento: 'Inicio de obras', estado: 'pendiente', trimestre: 'Q1' },
  {
    año: 2028,
    evento: 'Pruebas con biarticulados eléctricos',
    estado: 'pendiente',
    trimestre: 'Q3',
  },
  {
    año: 2029,
    evento: 'Sistema BRT operativo — Impacto total en UCOT',
    estado: 'pendiente',
    trimestre: 'Q1',
  },
];

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function BRTCorridorDashboard() {
  const [corredorActivo, setCorredorActivo] = useState<string>('C1');
  const [pestañaActiva, setPestañaActiva] = useState<
    'mapa' | 'impacto' | 'timeline' | 'oportunidad'
  >('mapa');
  const [añoActual] = useState(new Date().getFullYear());

  const corredor = BRT_DATA.corredores.find((c) => c.id === corredorActivo)!;
  const lineasUCOTTotal = [...new Set(BRT_DATA.corredores.flatMap((c) => c.lineasUCOTAfectadas))];

  const estacionIcon = L.divIcon({
    html: `<div style="width:12px;height:12px;border-radius:50%;background:${corredor.color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
    className: '',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
              <Train className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Proyecto BRT Montevideo</h1>
              <p className="text-sm text-slate-500">
                Impacto en UCOT · Operativo estimado {BRT_DATA.operativoEstimado}
              </p>
            </div>
          </div>

          {/* Financiamiento */}
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-xs text-slate-400">Financiamiento</p>
              <p className="font-bold text-slate-700">US$ {BRT_DATA.financiamiento.total}M</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-400">BID</p>
              <p className="font-semibold text-blue-700">US$ {BRT_DATA.financiamiento.BID}M</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-400">CAF</p>
              <p className="font-semibold text-green-700">US$ {BRT_DATA.financiamiento.CAF}M</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 border-b">
          {(['mapa', 'impacto', 'timeline', 'oportunidad'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setPestañaActiva(tab)}
              className={`px-4 py-2 text-sm font-medium capitalize rounded-t-lg transition-colors ${
                pestañaActiva === tab
                  ? 'bg-white border border-b-white text-slate-800 -mb-px'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab === 'mapa' && '🗺️ Mapa'}
              {tab === 'impacto' && '⚡ Impacto UCOT'}
              {tab === 'timeline' && '📅 Timeline'}
              {tab === 'oportunidad' && '🚀 Oportunidad'}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-auto p-6">
        {/* ── MAPA ── */}
        {pestañaActiva === 'mapa' && (
          <div className="space-y-4">
            {/* Selector de corredor */}
            <div className="flex gap-3">
              {BRT_DATA.corredores.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCorredorActivo(c.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                    corredorActivo === c.id
                      ? 'border-transparent text-white shadow-md'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                  style={corredorActivo === c.id ? { backgroundColor: c.color } : {}}
                >
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: c.color }} />
                  {c.nombre.split(' — ')[1]}
                </button>
              ))}
            </div>

            {/* Info del corredor */}
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-white rounded-xl border p-3 text-center">
                <p className="text-2xl font-bold text-slate-800">{corredor.kmAproximados}</p>
                <p className="text-xs text-slate-500 mt-0.5">km de recorrido</p>
              </div>
              <div className="bg-white rounded-xl border p-3 text-center">
                <p className="text-2xl font-bold text-slate-500 line-through">
                  {corredor.tiempoActualMin} min
                </p>
                <p className="text-xs text-slate-500 mt-0.5">Tiempo actual</p>
              </div>
              <div className="bg-white rounded-xl border p-3 text-center">
                <p className="text-2xl font-bold text-green-600">{corredor.tiempoBRTMin} min</p>
                <p className="text-xs text-slate-500 mt-0.5">Con BRT</p>
              </div>
              <div className="bg-white rounded-xl border p-3 text-center">
                <p className="text-2xl font-bold text-blue-600">-{corredor.reduccionMin} min</p>
                <p className="text-xs text-slate-500 mt-0.5">Ahorro por viaje</p>
              </div>
            </div>

            {/* Mapa */}
            <div
              className="rounded-xl overflow-hidden border shadow-sm"
              style={{ height: '420px' }}
            >
              <MapContainer
                center={[-34.88, -56.08]}
                zoom={12}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution="&copy; OpenStreetMap contributors"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* Trazar todos los corredores */}
                {BRT_DATA.corredores.map((c) => (
                  <Polyline
                    key={c.id}
                    positions={c.coordenadas}
                    color={c.color}
                    weight={c.id === corredorActivo ? 6 : 3}
                    opacity={c.id === corredorActivo ? 0.9 : 0.4}
                    dashArray={c.id === corredorActivo ? undefined : '8 4'}
                  />
                ))}

                {/* Estaciones del corredor activo */}
                {corredor.estaciones.map((est) => (
                  <Marker key={est.nombre} position={[est.lat, est.lng]} icon={estacionIcon}>
                    <Popup>
                      <div className="text-sm">
                        <p className="font-semibold">{est.nombre}</p>
                        <p className="text-slate-500 text-xs">Estación BRT — {corredor.nombre}</p>
                        {corredor.tunnel && est.nombre.includes('Julio') && (
                          <p className="text-blue-600 text-xs mt-1">
                            🚇 Estación subterránea (túnel)
                          </p>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>

            {corredor.tunnel && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
                <Info className="w-4 h-4 text-amber-600 shrink-0" />
                <p className="text-amber-700 text-sm">
                  Este corredor incluye un <strong>túnel de ~3.2 km bajo la Av. 18 de Julio</strong>{' '}
                  con 6 estaciones subterráneas (inversión adicional de US$ 200-300M).
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── IMPACTO UCOT ── */}
        {pestañaActiva === 'impacto' && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-800">
                  {lineasUCOTTotal.length} líneas de UCOT serán directamente afectadas
                </p>
                <p className="text-amber-700 text-sm mt-1">
                  El Corredor 1 atraviesa el eje 8 de Octubre, corazón geográfico de UCOT. Las
                  líneas {lineasUCOTTotal.join(', ')} deberán ser reasignadas como alimentadoras del
                  BRT.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Líneas afectadas */}
              <div className="bg-white rounded-xl border p-4">
                <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <Bus className="w-4 h-4" /> Líneas UCOT impactadas
                </h3>
                <div className="space-y-2">
                  {lineasUCOTTotal.map((linea) => (
                    <div
                      key={linea}
                      className="flex items-center justify-between p-2 bg-slate-50 rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-10 h-6 flex items-center justify-center bg-yellow-400 text-slate-900 text-xs font-bold rounded">
                          {linea}
                        </span>
                        <span className="text-sm text-slate-600">
                          Línea {linea} — Eje 8 de Octubre
                        </span>
                      </div>
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                        Reasignar
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Escenarios */}
              <div className="bg-white rounded-xl border p-4">
                <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" /> Escenarios para UCOT
                </h3>
                <div className="space-y-3">
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-green-800 font-medium text-sm">✅ Escenario Óptimo</p>
                    <p className="text-green-700 text-xs mt-1">
                      UCOT opera líneas alimentadoras desde barrios a estaciones BRT. Más
                      frecuencias, rutas cortas, menor desgaste de flota.
                    </p>
                  </div>
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-amber-800 font-medium text-sm">⚠️ Escenario Neutro</p>
                    <p className="text-amber-700 text-xs mt-1">
                      UCOT mantiene sus líneas en paralelo al BRT pero reduce frecuencias en el eje
                      8 de Octubre.
                    </p>
                  </div>
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-red-800 font-medium text-sm">❌ Escenario Riesgo</p>
                    <p className="text-red-700 text-xs mt-1">
                      Sin adaptación, las líneas paralelas al BRT perderían pasajeros al sistema
                      troncal. Impacto directo en ingresos.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TIMELINE ── */}
        {pestañaActiva === 'timeline' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border p-6">
              <h3 className="font-semibold text-slate-700 mb-6">
                Cronograma oficial del proyecto BRT
              </h3>
              <div className="relative">
                <div className="absolute left-6 top-2 bottom-2 w-0.5 bg-slate-200" />
                <div className="space-y-6">
                  {TIMELINE.map((item, i) => {
                    const esPasado = item.año < añoActual;
                    const esActual = item.estado === 'en_curso';
                    return (
                      <div key={i} className="relative flex items-start gap-4 pl-14">
                        <div
                          className={`absolute left-4 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            esPasado
                              ? 'bg-green-500 border-green-500'
                              : esActual
                                ? 'bg-blue-500 border-blue-500 animate-pulse'
                                : 'bg-white border-slate-300'
                          }`}
                        >
                          {esPasado && (
                            <svg
                              className="w-3 h-3 text-white"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={3}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </div>
                        <div
                          className={`flex-1 p-3 rounded-lg border ${
                            esActual ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <p
                              className={`font-semibold text-sm ${esActual ? 'text-blue-800' : 'text-slate-700'}`}
                            >
                              {item.evento}
                            </p>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full ${
                                esActual
                                  ? 'bg-blue-200 text-blue-800'
                                  : esPasado
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-slate-200 text-slate-600'
                              }`}
                            >
                              {item.año} {item.trimestre}
                            </span>
                          </div>
                          {item.año === 2029 && (
                            <p className="text-slate-500 text-xs mt-1">
                              ⚡ Fecha crítica para UCOT — Inicio de operaciones BRT completo
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── OPORTUNIDAD ── */}
        {pestañaActiva === 'oportunidad' && (
          <div className="space-y-4">
            <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-xl p-6 text-white">
              <h3 className="text-xl font-bold mb-2">🚀 UCOT como Operador Alimentador</h3>
              <p className="text-blue-100 text-sm">
                El BRT no elimina a UCOT — la posiciona como operador esencial para conectar barrios
                con los corredores troncales.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border p-4">
                <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center mb-3">
                  <DollarSign className="w-5 h-5 text-green-600" />
                </div>
                <h4 className="font-semibold text-slate-700 mb-2">Ingresos Estables</h4>
                <p className="text-slate-500 text-sm">
                  Las líneas alimentadoras tienen demanda garantizada: son el único acceso de zonas
                  residenciales al BRT. Menor competencia directa.
                </p>
              </div>
              <div className="bg-white rounded-xl border p-4">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center mb-3">
                  <Clock className="w-5 h-5 text-blue-600" />
                </div>
                <h4 className="font-semibold text-slate-700 mb-2">Menor Desgaste</h4>
                <p className="text-slate-500 text-sm">
                  Rutas más cortas significan menos kilómetros por unidad, menor consumo de
                  combustible y mayor vida útil de la flota.
                </p>
              </div>
              <div className="bg-white rounded-xl border p-4">
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center mb-3">
                  <MapPin className="w-5 h-5 text-purple-600" />
                </div>
                <h4 className="font-semibold text-slate-700 mb-2">Nuevas Zonas</h4>
                <p className="text-slate-500 text-sm">
                  Oportunidad para expandir a zonas hoy sin cobertura: Manga Norte, Toledo Chico,
                  Canelones Este — conectándolas al BRT.
                </p>
              </div>
            </div>

            {/* Líneas alimentadoras sugeridas */}
            <div className="bg-white rounded-xl border p-4">
              <h4 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <ChevronRight className="w-4 h-4" />
                Nuevas líneas alimentadoras sugeridas para UCOT
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {[
                  { linea: 'A-300', origen: 'Manga Norte', destino: 'Est. Propios (BRT)', km: 4.2 },
                  {
                    linea: 'A-306',
                    origen: 'Villa García',
                    destino: 'Est. 8 de Octubre (BRT)',
                    km: 5.8,
                  },
                  {
                    linea: 'A-316',
                    origen: 'Piedras Blancas Norte',
                    destino: 'Est. Propios (BRT)',
                    km: 3.5,
                  },
                  {
                    linea: 'A-328',
                    origen: 'Toledo Chico',
                    destino: 'Est. Tres Cruces (BRT)',
                    km: 7.1,
                  },
                  {
                    linea: 'A-NEW1',
                    origen: 'Canelones Este',
                    destino: 'Est. Av. Italia (BRT)',
                    km: 12.0,
                    nueva: true,
                  },
                  {
                    linea: 'A-NEW2',
                    origen: 'Santa Lucía del Este',
                    destino: 'Est. Zonamérica (BRT)',
                    km: 9.4,
                    nueva: true,
                  },
                ].map((l) => (
                  <div
                    key={l.linea}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      l.nueva ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-14 text-center py-0.5 text-xs font-bold rounded ${
                          l.nueva ? 'bg-green-500 text-white' : 'bg-yellow-400 text-slate-900'
                        }`}
                      >
                        {l.linea}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-slate-700">{l.origen}</p>
                        <p className="text-xs text-slate-500">→ {l.destino}</p>
                      </div>
                    </div>
                    <span className="text-xs text-slate-500">{l.km} km</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
