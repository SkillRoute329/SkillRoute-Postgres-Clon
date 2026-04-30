/**
 * GtfsSchedulePanel — Muestra frecuencias y horarios oficiales GTFS
 * de las empresas competidoras, para uso en análisis competitivo.
 *
 * Datos: colección `gtfs_horarios` (actualizada semanalmente desde la API IMM).
 * Cada empresa muestra: frecuencia pico/valle, primera/última salida,
 * y total de viajes por día.
 */

import { useEffect, useState } from 'react';
import { Clock, TrendingUp, Zap, Calendar } from 'lucide-react';
import {
  getHorariosByEmpresa,
  calcFrecuenciaRedPromedio,
  calcFrecuenciaPicoValle,
  type HorarioGTFS,
} from '../../services/gtfsSchedulesService';

const EMPRESAS = [
  { id: '50', nombre: 'CUTCSA', color: 'bg-blue-500',  text: 'text-blue-400',  border: 'border-blue-500/30' },
  { id: '20', nombre: 'COME',   color: 'bg-green-500', text: 'text-green-400', border: 'border-green-500/30' },
  { id: '10', nombre: 'COETC',  color: 'bg-orange-500',text: 'text-orange-400',border: 'border-orange-500/30' },
  { id: '70', nombre: 'UCOT',   color: 'bg-purple-500',text: 'text-purple-400',border: 'border-purple-500/30' },
];

interface EmpresaStats {
  agencyId: string;
  nombre: string;
  lineasTotal: number;
  frecuenciaRedProm: number;
  frecuenciaPico: number;
  frecuenciaValle: number;
  primerSalida: string;
  ultimaSalida: string;
  viajesDia: number;
  topLineas: Array<{ linea: string; frecMin: number; viajes: number }>;
}

function computeStats(agencyId: string, nombre: string, horarios: HorarioGTFS[]): EmpresaStats {
  const idas = horarios.filter(h => h.directionId === 0);

  const frecuenciaRedProm = calcFrecuenciaRedPromedio(idas);

  // Pico/Valle usando las salidas de todas las líneas combinadas
  const todasSalidas = idas.flatMap(h => h.salidas ?? []);
  const { pico, valle } = calcFrecuenciaPicoValle(todasSalidas);

  const primerSalida = idas
    .map(h => h.primerSalida)
    .filter(Boolean)
    .sort()[0] ?? '—';
  const ultimaSalida = idas
    .map(h => h.ultimaSalida)
    .filter(Boolean)
    .sort()
    .reverse()[0] ?? '—';

  const viajesDia = idas.reduce((acc, h) => acc + (h.totalViajes ?? 0), 0);

  const topLineas = idas
    .filter(h => h.frecuenciaPromMin > 0)
    .sort((a, b) => b.totalViajes - a.totalViajes)
    .slice(0, 5)
    .map(h => ({ linea: h.linea, frecMin: h.frecuenciaPromMin, viajes: h.totalViajes }));

  return {
    agencyId,
    nombre,
    lineasTotal: idas.length,
    frecuenciaRedProm,
    frecuenciaPico: pico,
    frecuenciaValle: valle,
    primerSalida,
    ultimaSalida,
    viajesDia,
    topLineas,
  };
}

function FrecBadge({ min, label }: { min: number; label: string }) {
  const color =
    min <= 10 ? 'text-emerald-400 bg-emerald-500/10' :
    min <= 20 ? 'text-blue-400 bg-blue-500/10' :
    min <= 40 ? 'text-yellow-400 bg-yellow-500/10' :
    'text-slate-400 bg-slate-700/50';
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>
        {min > 0 ? `${min} min` : '—'}
      </span>
      <span className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</span>
    </div>
  );
}

function EmpresaCard({
  meta,
  stats,
}: {
  meta: typeof EMPRESAS[0];
  stats: EmpresaStats | null;
  loading: boolean;
}) {
  if (!stats) {
    return (
      <div className={`bg-slate-900 border ${meta.border} rounded-xl p-4 animate-pulse`}>
        <div className="h-4 bg-slate-700 rounded w-24 mb-3" />
        <div className="h-8 bg-slate-800 rounded mb-2" />
        <div className="h-4 bg-slate-800 rounded w-3/4" />
      </div>
    );
  }

  return (
    <div className={`bg-slate-900 border ${meta.border} rounded-xl p-4 flex flex-col gap-3`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${meta.color}`} />
          <span className="font-bold text-white text-sm">{meta.nombre}</span>
        </div>
        <span className="text-xs text-slate-400">{stats.lineasTotal} líneas</span>
      </div>

      {/* Frecuencias */}
      <div className="flex justify-around bg-slate-800/50 rounded-lg py-3 px-2">
        <FrecBadge min={stats.frecuenciaPico} label="Pico" />
        <div className="w-px bg-slate-700" />
        <FrecBadge min={stats.frecuenciaRedProm} label="Promedio" />
        <div className="w-px bg-slate-700" />
        <FrecBadge min={stats.frecuenciaValle} label="Valle" />
      </div>

      {/* Horario y viajes */}
      <div className="flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span>{stats.primerSalida} – {stats.ultimaSalida}</span>
        </div>
        <div className="flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          <span>{stats.viajesDia.toLocaleString('es-UY')} viajes/día</span>
        </div>
      </div>

      {/* Top líneas */}
      {stats.topLineas.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest">Top líneas</p>
          {stats.topLineas.map(l => (
            <div key={l.linea} className="flex items-center justify-between text-xs">
              <span className={`font-medium ${meta.text}`}>Línea {l.linea}</span>
              <div className="flex items-center gap-2 text-slate-400">
                <span>{l.frecMin > 0 ? `c/ ${l.frecMin} min` : '—'}</span>
                <span className="text-slate-600">·</span>
                <span>{l.viajes} viajes</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function GtfsSchedulePanel() {
  const [stats, setStats] = useState<Map<string, EmpresaStats>>(new Map());
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string>('');

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      const results = new Map<string, EmpresaStats>();
      await Promise.all(
        EMPRESAS.map(async (emp) => {
          const horarios = await getHorariosByEmpresa(emp.id);
          if (horarios.length > 0) {
            results.set(emp.id, computeStats(emp.id, emp.nombre, horarios));
          }
        }),
      );
      if (!mounted) return;
      setStats(results);
      setUpdatedAt(new Date().toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' }));
      setLoading(false);
    };
    load();
    return () => { mounted = false; };
  }, []);

  const totalLineas = [...stats.values()].reduce((a, s) => a + s.lineasTotal, 0);
  const totalViajes = [...stats.values()].reduce((a, s) => a + s.viajesDia, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-200 flex items-center gap-2">
            <Zap className="w-4 h-4 text-blue-400" />
            Horarios Oficiales GTFS
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Fuente: API IMM · {totalLineas} líneas · {totalViajes.toLocaleString('es-UY')} viajes/día
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <TrendingUp className="w-3 h-3" />
          {updatedAt ? `Act. ${updatedAt}` : 'Cargando...'}
        </div>
      </div>

      {/* Cards por empresa */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {EMPRESAS.map(emp => (
          <EmpresaCard
            key={emp.id}
            meta={emp}
            stats={stats.get(emp.id) ?? null}
            loading={loading}
          />
        ))}
      </div>

      {!loading && stats.size === 0 && (
        <div className="text-center py-6 text-slate-500 text-sm">
          <p>Sin datos GTFS disponibles.</p>
          <p className="text-xs mt-1">Ejecutar importación: POST /gtfsImportRun</p>
        </div>
      )}
    </div>
  );
}
