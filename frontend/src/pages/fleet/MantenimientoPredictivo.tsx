import { useState, useEffect, useMemo } from 'react';
import {
  Wrench,
  AlertTriangle,
  CheckCircle,
  Clock,
  Zap,
  Fuel,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Bus,
} from 'lucide-react';
import { FleetService } from '../../services/firestore/fleet';
import { MaintenanceService } from '../../services/firestore/maintenance';
import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';
import { useAuth } from '../../context/AuthContext';

// ─── Constantes ──────────────────────────────────────────────────────────────

const EMPRESAS = [
  { id: '70', nombre: 'UCOT',   color: 'blue'   },
  { id: '50', nombre: 'CUTCSA', color: 'purple' },
  { id: '20', nombre: 'COME',   color: 'green'  },
  { id: '10', nombre: 'COETC',  color: 'orange' },
] as const;

type EmpresaId = '70' | '50' | '20' | '10';

const EMPRESA_COLOR: Record<EmpresaId, string> = {
  '70': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  '50': 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  '20': 'bg-green-500/15 text-green-400 border-green-500/30',
  '10': 'bg-orange-500/15 text-orange-400 border-orange-500/30',
};

interface Intervalo {
  km: number;
  dias: number;
  label: string;
  tipo: string;
}

const INTERVALOS: Record<'diesel' | 'electrico', Intervalo[]> = {
  diesel: [
    { km: 10000, dias: 120, label: 'Cambio de aceite',   tipo: 'aceite'    },
    { km: 20000, dias: 240, label: 'Filtros',            tipo: 'filtros'   },
    { km: 50000, dias: 365, label: 'Revisión general',   tipo: 'revision'  },
    { km: 80000, dias: 730, label: 'Neumáticos',         tipo: 'neumaticos'},
  ],
  electrico: [
    { km: 15000, dias:  30, label: 'Revisión batería',       tipo: 'bateria'   },
    { km: 30000, dias:  60, label: 'Motor eléctrico',        tipo: 'motor'     },
    { km: 50000, dias:  90, label: 'Actualización firmware', tipo: 'firmware'  },
  ],
};

// Palabras clave para identificar tipo de mantenimiento en historial
const TIPO_KEYWORDS: Record<string, string[]> = {
  aceite:     ['aceite', 'oil', 'lubricante'],
  filtros:    ['filtro', 'filter'],
  revision:   ['revisión', 'revision', 'general', 'mantenimiento'],
  neumaticos: ['neumático', 'neumatico', 'goma', 'rueda', 'tire'],
  bateria:    ['batería', 'bateria', 'battery'],
  motor:      ['motor'],
  firmware:   ['firmware', 'software', 'actualización', 'actualizacion'],
};

// ─── Tipos internos ───────────────────────────────────────────────────────────

type EstadoUrgencia = 'CRITICO' | 'PROXIMO' | 'AL_DIA' | 'SIN_DATOS';
type FiltroEstado = 'todos' | 'critico' | 'proximo' | 'al_dia';
type FiltroCombustible = 'todos' | 'diesel' | 'electrico';

interface EstadoIntervalo {
  intervalo: Intervalo;
  kmRestantes: number | null;
  diasRestantes: number | null;
  urgencia: EstadoUrgencia;
  ultimaFecha: string | null;
  ultimoKm: number | null;
}

interface VehiculoAnalizado {
  id: string;
  internalNumber: string;
  empresaId: EmpresaId;
  kmActual: number | null;
  combustible: 'diesel' | 'electrico';
  estadosIntervalos: EstadoIntervalo[];
  urgenciaPrincipal: EstadoUrgencia;
  proximoServicio: string;
  kmRestantesMinimos: number | null;
  diasRestantesMinimos: number | null;
  historial: any[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectarCombustible(v: any): 'diesel' | 'electrico' {
  const texto = [
    v.fuelType, v.combustible, v.tipoCombustible,
    v.category, v.features?.fuelType,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (texto.includes('elec') || texto.includes('battery') || texto.includes('bater')) {
    return 'electrico';
  }
  return 'diesel';
}

function extraerKm(v: any): number | null {
  const raw = v.km ?? v.kmActual ?? v.km_actual ?? v.odometro ?? v.odometer ?? v.mileage;
  if (raw == null) return null;
  const n = Number(raw);
  return isNaN(n) ? null : n;
}

function detectarTipoHistorial(incidencia: any): string | null {
  const texto = [incidencia.tipo, incidencia.title, incidencia.description, incidencia.categoria]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  for (const [tipo, keywords] of Object.entries(TIPO_KEYWORDS)) {
    if (keywords.some((k) => texto.includes(k))) return tipo;
  }
  return null;
}

function calcularEstadoIntervalo(
  intervalo: Intervalo,
  kmActual: number | null,
  historial: any[],
): EstadoIntervalo {
  // Buscar última ocurrencia de este tipo en el historial
  const coincidentes = historial
    .filter((h) => detectarTipoHistorial(h) === intervalo.tipo)
    .sort((a, b) => {
      const ta = new Date(a.timestamp ?? a.fecha ?? 0).getTime();
      const tb = new Date(b.timestamp ?? b.fecha ?? 0).getTime();
      return tb - ta;
    });

  const ultimo = coincidentes[0] ?? null;
  const ultimaFecha: string | null = ultimo
    ? (ultimo.timestamp ?? ultimo.fecha ?? null)
    : null;
  const ultimoKm: number | null = ultimo ? (extraerKm(ultimo) ?? null) : null;

  // Calcular km restantes
  let kmRestantes: number | null = null;
  if (kmActual !== null && ultimoKm !== null) {
    kmRestantes = intervalo.km - (kmActual - ultimoKm);
  } else if (kmActual !== null && ultimoKm === null) {
    // Sin referencia de km: estimamos que están próximos
    kmRestantes = null;
  }

  // Calcular días restantes
  let diasRestantes: number | null = null;
  if (ultimaFecha) {
    const msTranscurridos = Date.now() - new Date(ultimaFecha).getTime();
    const diasTranscurridos = msTranscurridos / (1000 * 60 * 60 * 24);
    diasRestantes = Math.round(intervalo.dias - diasTranscurridos);
  }

  // Sin datos suficientes
  if (kmRestantes === null && diasRestantes === null) {
    return { intervalo, kmRestantes, diasRestantes, urgencia: 'SIN_DATOS', ultimaFecha, ultimoKm };
  }

  // Determinar urgencia por el criterio más restrictivo
  const urgenciaKm: EstadoUrgencia | null =
    kmRestantes !== null
      ? kmRestantes <= 500
        ? 'CRITICO'
        : kmRestantes <= 2000
        ? 'PROXIMO'
        : 'AL_DIA'
      : null;

  const urgenciaDias: EstadoUrgencia | null =
    diasRestantes !== null
      ? diasRestantes <= 7
        ? 'CRITICO'
        : diasRestantes <= 30
        ? 'PROXIMO'
        : 'AL_DIA'
      : null;

  const ORDEN: Record<EstadoUrgencia, number> = {
    CRITICO: 0, PROXIMO: 1, AL_DIA: 2, SIN_DATOS: 3,
  };

  let urgencia: EstadoUrgencia = 'AL_DIA';
  if (urgenciaKm && urgenciaDias) {
    urgencia =
      ORDEN[urgenciaKm] < ORDEN[urgenciaDias] ? urgenciaKm : urgenciaDias;
  } else if (urgenciaKm) urgencia = urgenciaKm;
  else if (urgenciaDias) urgencia = urgenciaDias;

  return { intervalo, kmRestantes, diasRestantes, urgencia, ultimaFecha, ultimoKm };
}

function analizarVehiculo(v: any, historial: any[]): VehiculoAnalizado {
  const kmActual = extraerKm(v);
  const combustible = detectarCombustible(v);
  const intervalos = INTERVALOS[combustible];

  const estadosIntervalos = intervalos.map((iv) =>
    calcularEstadoIntervalo(iv, kmActual, historial),
  );

  const ORDEN: Record<EstadoUrgencia, number> = {
    CRITICO: 0, PROXIMO: 1, AL_DIA: 2, SIN_DATOS: 3,
  };

  const masUrgente = estadosIntervalos.reduce(
    (min, e) => (ORDEN[e.urgencia] < ORDEN[min.urgencia] ? e : min),
    estadosIntervalos[0],
  );

  const urgenciaPrincipal: EstadoUrgencia =
    kmActual === null ? 'SIN_DATOS' : masUrgente.urgencia;

  const proximoServicio =
    urgenciaPrincipal === 'SIN_DATOS'
      ? 'Datos insuficientes'
      : masUrgente.intervalo.label;

  const empresaId = (v.agencyId ?? v.empresaId ?? v.empresa ?? '70') as EmpresaId;

  return {
    id: String(v.id),
    internalNumber: String(v.internalNumber ?? v.id),
    empresaId,
    kmActual,
    combustible,
    estadosIntervalos,
    urgenciaPrincipal,
    proximoServicio,
    kmRestantesMinimos: masUrgente.kmRestantes,
    diasRestantesMinimos: masUrgente.diasRestantes,
    historial: historial.slice(0, 3),
  };
}

// ─── Componentes auxiliares ───────────────────────────────────────────────────

const URGENCIA_STYLE: Record<EstadoUrgencia, { badge: string; label: string }> = {
  CRITICO:   { badge: 'bg-red-500/10 text-red-400 border border-red-500/30',         label: 'CRÍTICO'  },
  PROXIMO:   { badge: 'bg-amber-500/10 text-amber-400 border border-amber-500/30',   label: 'PRÓXIMO'  },
  AL_DIA:    { badge: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30', label: 'AL DÍA' },
  SIN_DATOS: { badge: 'bg-slate-500/10 text-slate-400 border border-slate-600/30',   label: 'SIN DATOS' },
};

function BadgeUrgencia({ estado }: { estado: EstadoUrgencia }) {
  const s = URGENCIA_STYLE[estado];
  return (
    <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${s.badge}`}>
      {s.label}
    </span>
  );
}

function BadgeEmpresa({ empresaId }: { empresaId: EmpresaId }) {
  const empresa = EMPRESAS.find((e) => e.id === empresaId);
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${EMPRESA_COLOR[empresaId] ?? 'bg-slate-700 text-slate-300 border-slate-600'}`}>
      {empresa?.nombre ?? empresaId}
    </span>
  );
}

function KpiCard({
  label,
  value,
  color,
  icon: Icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: React.ElementType;
}) {
  return (
    <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-black text-white">{value}</p>
        <p className="text-xs text-slate-400 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function PanelDetalle({
  vehiculo,
  onClose,
}: {
  vehiculo: VehiculoAnalizado;
  onClose: () => void;
}) {
  return (
    <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-6 mt-4">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <Bus className="w-5 h-5 text-blue-400" />
          <span className="text-white font-bold text-base">
            Coche #{vehiculo.internalNumber}
          </span>
          <BadgeEmpresa empresaId={vehiculo.empresaId} />
        </div>
        <button
          onClick={onClose}
          className="text-slate-500 hover:text-slate-300 text-xs px-3 py-1 rounded-lg border border-slate-700 hover:border-slate-500 transition-colors"
        >
          Cerrar
        </button>
      </div>

      {/* Todos los intervalos */}
      <div className="mb-5">
        <p className="text-xs text-slate-500 uppercase tracking-widest mb-3">
          Intervalos de mantenimiento
        </p>
        <div className="space-y-2">
          {vehiculo.estadosIntervalos.map((e) => (
            <div
              key={e.intervalo.tipo}
              className="flex items-center justify-between bg-slate-800/50 rounded-lg px-4 py-3 border border-slate-700/30"
            >
              <div className="flex items-center gap-3">
                <Wrench className="w-4 h-4 text-slate-500" />
                <span className="text-sm text-slate-200">{e.intervalo.label}</span>
              </div>
              <div className="flex items-center gap-4">
                {e.kmRestantes !== null && (
                  <span className="text-xs text-slate-400">
                    {e.kmRestantes >= 0
                      ? `${e.kmRestantes.toLocaleString('es-UY')} km restantes`
                      : `${Math.abs(e.kmRestantes).toLocaleString('es-UY')} km vencido`}
                  </span>
                )}
                {e.diasRestantes !== null && (
                  <span className="text-xs text-slate-400">
                    {e.diasRestantes >= 0
                      ? `${e.diasRestantes}d restantes`
                      : `${Math.abs(e.diasRestantes)}d vencido`}
                  </span>
                )}
                <BadgeUrgencia estado={e.urgencia} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Historial reciente */}
      {vehiculo.historial.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-3">
            Últimos mantenimientos registrados
          </p>
          <div className="space-y-2">
            {vehiculo.historial.map((h: any, i: number) => (
              <div
                key={h.id ?? i}
                className="flex items-center justify-between bg-slate-800/30 rounded-lg px-4 py-2.5 border border-slate-700/20"
              >
                <div>
                  <p className="text-sm text-slate-200">
                    {h.title ?? h.tipo ?? 'Mantenimiento'}
                  </p>
                  {h.description && (
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                      {h.description}
                    </p>
                  )}
                </div>
                <span className="text-xs text-slate-500 flex-shrink-0 ml-4">
                  {h.timestamp
                    ? new Date(h.timestamp).toLocaleDateString('es-UY')
                    : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {vehiculo.historial.length === 0 && (
        <p className="text-sm text-slate-500 italic">Sin historial de mantenimiento registrado.</p>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function MantenimientoPredictivo() {
  const { user } = useAuth();
  const { empresaPropia } = useEmpresaPropia();
  const esSuperAdmin = (user?.role ?? (user as any)?.rol ?? '').toUpperCase() === 'SUPERADMIN';

  const [vehiculos, setVehiculos] = useState<VehiculoAnalizado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [empresaFiltro, setEmpresaFiltro] = useState<string>(
    esSuperAdmin ? 'todas' : (empresaPropia ?? '70'),
  );
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('todos');
  const [filtroCombustible, setFiltroCombustible] = useState<FiltroCombustible>('todos');
  const [vehiculoDetalle, setVehiculoDetalle] = useState<string | null>(null);

  // ── Carga de datos ────────────────────────────────────────────────────────
  useEffect(() => {
    let activo = true;

    async function cargar() {
      setCargando(true);
      setError(null);
      try {
        const todosVehiculos = await FleetService.getVehicles();

        // Filtrar por empresa si aplica
        const filtrados = todosVehiculos.filter((v: any) => {
          if (empresaFiltro === 'todas') return true;
          const agId = String(v.agencyId ?? v.empresaId ?? v.empresa ?? '70');
          return agId === empresaFiltro;
        });

        // Cargar historial de mantenimiento para cada vehículo en paralelo
        const analizados = await Promise.all(
          filtrados.map(async (v: any) => {
            try {
              const historial = await MaintenanceService.getAll({ vehicleId: String(v.id) }) as any[];
              return analizarVehiculo(v, historial);
            } catch {
              return analizarVehiculo(v, []);
            }
          }),
        );

        if (!activo) return;
        setVehiculos(analizados);
      } catch (e: any) {
        if (!activo) return;
        setError(e?.message ?? 'Error al cargar datos');
      } finally {
        if (activo) setCargando(false);
      }
    }

    cargar();
    return () => { activo = false; };
  }, [empresaFiltro]);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total    = vehiculos.length;
    const criticos = vehiculos.filter((v) => v.urgenciaPrincipal === 'CRITICO').length;
    const proximos = vehiculos.filter((v) => v.urgenciaPrincipal === 'PROXIMO').length;
    const alDia    = vehiculos.filter((v) => v.urgenciaPrincipal === 'AL_DIA').length;
    return { total, criticos, proximos, alDia };
  }, [vehiculos]);

  // ── Tabla filtrada ────────────────────────────────────────────────────────
  const vehiculosFiltrados = useMemo(() => {
    return vehiculos
      .filter((v) => {
        if (filtroEstado === 'critico') return v.urgenciaPrincipal === 'CRITICO';
        if (filtroEstado === 'proximo') return v.urgenciaPrincipal === 'PROXIMO';
        if (filtroEstado === 'al_dia')  return v.urgenciaPrincipal === 'AL_DIA';
        return true;
      })
      .filter((v) => {
        if (filtroCombustible === 'diesel')   return v.combustible === 'diesel';
        if (filtroCombustible === 'electrico') return v.combustible === 'electrico';
        return true;
      })
      .sort((a, b) => {
        const ORDEN: Record<EstadoUrgencia, number> = {
          CRITICO: 0, PROXIMO: 1, AL_DIA: 2, SIN_DATOS: 3,
        };
        return ORDEN[a.urgenciaPrincipal] - ORDEN[b.urgenciaPrincipal];
      });
  }, [vehiculos, filtroEstado, filtroCombustible]);

  const detalleVehiculo = useMemo(
    () => vehiculos.find((v) => v.id === vehiculoDetalle) ?? null,
    [vehiculos, vehiculoDetalle],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-200 flex items-center gap-2">
            <Wrench className="w-6 h-6 text-blue-400" />
            Mantenimiento Predictivo
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Proyección de próximos mantenimientos basada en km recorridos e intervalos estándar
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total analizados"  value={kpis.total}    color="bg-blue-500/15 text-blue-400"    icon={Bus}           />
        <KpiCard label="Críticos"          value={kpis.criticos} color="bg-red-500/15 text-red-400"       icon={AlertTriangle} />
        <KpiCard label="Próximos"          value={kpis.proximos} color="bg-amber-500/15 text-amber-400"  icon={Clock}         />
        <KpiCard label="Al día"            value={kpis.alDia}    color="bg-emerald-500/15 text-emerald-400" icon={CheckCircle} />
      </div>

      {/* Filtros */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 flex flex-wrap gap-4 items-center">
        {/* Selector empresa (solo SUPERADMIN) */}
        {esSuperAdmin && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 uppercase tracking-widest">Empresa</label>
            <select
              value={empresaFiltro}
              onChange={(e) => setEmpresaFiltro(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="todas">Todas</option>
              {EMPRESAS.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.nombre}</option>
              ))}
            </select>
          </div>
        )}

        {/* Filtro estado */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 uppercase tracking-widest">Estado</label>
          <div className="flex gap-1">
            {(
              [
                { key: 'todos',   label: 'Todos'    },
                { key: 'critico', label: 'Críticos' },
                { key: 'proximo', label: 'Próximos' },
                { key: 'al_dia',  label: 'Al día'   },
              ] as { key: FiltroEstado; label: string }[]
            ).map((f) => (
              <button
                key={f.key}
                onClick={() => setFiltroEstado(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  filtroEstado === f.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Filtro combustible */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 uppercase tracking-widest">Combustible</label>
          <div className="flex gap-1">
            {(
              [
                { key: 'todos',     label: 'Todos',     icon: null },
                { key: 'diesel',    label: 'Diesel',    icon: Fuel },
                { key: 'electrico', label: 'Eléctrico', icon: Zap  },
              ] as { key: FiltroCombustible; label: string; icon: any }[]
            ).map((f) => (
              <button
                key={f.key}
                onClick={() => setFiltroCombustible(f.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  filtroCombustible === f.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {f.icon && <f.icon className="w-3 h-3" />}
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Estado de carga / error / vacío */}
      {cargando && (
        <div className="flex items-center justify-center py-20 gap-3">
          <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
          <span className="text-slate-400 text-sm">Analizando flota…</span>
        </div>
      )}

      {!cargando && error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
          <p className="text-red-400 font-semibold">Error al cargar datos</p>
          <p className="text-slate-400 text-sm mt-1">{error}</p>
        </div>
      )}

      {!cargando && !error && vehiculosFiltrados.length === 0 && (
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-10 text-center">
          <Bus className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-300 font-semibold">No se encontraron vehículos</p>
          <p className="text-slate-500 text-sm mt-1">
            No hay vehículos registrados para los filtros seleccionados.
          </p>
        </div>
      )}

      {/* Tabla principal */}
      {!cargando && !error && vehiculosFiltrados.length > 0 && (
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 bg-slate-800/30">
                  <th className="text-left text-xs text-slate-500 uppercase tracking-widest px-4 py-3 font-semibold">
                    Coche
                  </th>
                  {esSuperAdmin && (
                    <th className="text-left text-xs text-slate-500 uppercase tracking-widest px-4 py-3 font-semibold">
                      Empresa
                    </th>
                  )}
                  <th className="text-left text-xs text-slate-500 uppercase tracking-widest px-4 py-3 font-semibold">
                    Combustible
                  </th>
                  <th className="text-left text-xs text-slate-500 uppercase tracking-widest px-4 py-3 font-semibold">
                    Km actuales
                  </th>
                  <th className="text-left text-xs text-slate-500 uppercase tracking-widest px-4 py-3 font-semibold">
                    Próximo servicio
                  </th>
                  <th className="text-left text-xs text-slate-500 uppercase tracking-widest px-4 py-3 font-semibold">
                    Km / Días restantes
                  </th>
                  <th className="text-left text-xs text-slate-500 uppercase tracking-widest px-4 py-3 font-semibold">
                    Estado
                  </th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {vehiculosFiltrados.map((v) => {
                  const abierto = vehiculoDetalle === v.id;
                  return (
                    <>
                      <tr
                        key={v.id}
                        onClick={() => setVehiculoDetalle(abierto ? null : v.id)}
                        className={`cursor-pointer transition-colors ${
                          abierto
                            ? 'bg-slate-800/60'
                            : 'hover:bg-slate-800/30'
                        }`}
                      >
                        <td className="px-4 py-3 font-semibold text-white">
                          #{v.internalNumber}
                        </td>
                        {esSuperAdmin && (
                          <td className="px-4 py-3">
                            <BadgeEmpresa empresaId={v.empresaId} />
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {v.combustible === 'electrico' ? (
                              <>
                                <Zap className="w-3.5 h-3.5 text-yellow-400" />
                                <span className="text-slate-300">Eléctrico</span>
                              </>
                            ) : (
                              <>
                                <Fuel className="w-3.5 h-3.5 text-blue-400" />
                                <span className="text-slate-300">Diesel</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          {v.kmActual !== null
                            ? v.kmActual.toLocaleString('es-UY') + ' km'
                            : <span className="text-slate-600 italic">Sin datos</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          {v.proximoServicio}
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs space-y-0.5">
                          {v.kmRestantesMinimos !== null && (
                            <div>
                              {v.kmRestantesMinimos >= 0
                                ? `${v.kmRestantesMinimos.toLocaleString('es-UY')} km`
                                : <span className="text-red-400">Vencido ({Math.abs(v.kmRestantesMinimos).toLocaleString('es-UY')} km)</span>}
                            </div>
                          )}
                          {v.diasRestantesMinimos !== null && (
                            <div>
                              {v.diasRestantesMinimos >= 0
                                ? `${v.diasRestantesMinimos}d`
                                : <span className="text-red-400">Vencido ({Math.abs(v.diasRestantesMinimos)}d)</span>}
                            </div>
                          )}
                          {v.kmRestantesMinimos === null && v.diasRestantesMinimos === null && (
                            <span className="text-slate-600 italic">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <BadgeUrgencia estado={v.urgenciaPrincipal} />
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {abierto
                            ? <ChevronUp className="w-4 h-4" />
                            : <ChevronDown className="w-4 h-4" />}
                        </td>
                      </tr>
                      {abierto && detalleVehiculo && (
                        <tr key={`${v.id}-detalle`}>
                          <td colSpan={esSuperAdmin ? 8 : 7} className="px-4 pb-4">
                            <PanelDetalle
                              vehiculo={detalleVehiculo}
                              onClose={() => setVehiculoDetalle(null)}
                            />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pie de tabla */}
          <div className="px-4 py-3 border-t border-slate-800/50 text-xs text-slate-500">
            {vehiculosFiltrados.length} vehículo{vehiculosFiltrados.length !== 1 ? 's' : ''} mostrado{vehiculosFiltrados.length !== 1 ? 's' : ''} de {vehiculos.length} total
          </div>
        </div>
      )}

      {/* Nota metodológica */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
        <p className="text-xs text-slate-500">
          <span className="text-slate-400 font-semibold">Metodología:</span>{' '}
          Los km restantes se calculan como{' '}
          <span className="font-mono text-slate-400">Intervalo − (Km actuales − Km en último mantenimiento)</span>.
          Los días restantes se calculan desde la fecha del último mantenimiento del mismo tipo.
          Vehículos sin odómetro registrado aparecen como "Sin datos".
        </p>
      </div>
    </div>
  );
}
