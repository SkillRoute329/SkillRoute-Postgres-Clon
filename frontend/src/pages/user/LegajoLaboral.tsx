/**
 * LegajoLaboral.tsx — Módulo 10: RRHH Uruguay (Grupo 13)
 *
 * Panel del Conductor / Administrador que muestra el cuaderno laboral dinámico:
 *   • Días generados de licencia por antigüedad (Ley 12.590)
 *   • Estado de asistencia del mes con deducciones coercitivas
 *   • Información de escalafón y jornal
 *
 * RESTRICCIÓN: Cero aritmética en el cliente. Todo dato proviene de
 * v_legajo_laboral y fn_dias_licencia_grupo13() en PostgreSQL.
 */

import { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  User,
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingUp,
  Banknote,
  ShieldOff,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../clients/apiClient';
import clsx from 'clsx';

// ── Tipos ────────────────────────────────────────────────────────────────────

interface LegajoData {
  id: string;
  full_name: string;
  internal_number: string;
  role: string;
  categoria_laboral: string | null;
  sueldo_jornal_base: number;
  fecha_ingreso: string;
  fecha_egreso: string | null;
  estado_hoy: string;
  motivo_ausencia: string | null;
  antiguedad_anios: number;
  antiguedad_meses: number;
  dias_licencia_generados: number;
  monto_licencia_uyun: number;
  provision_aguinaldo_mensual: number;
  esta_bloqueado: boolean;
  asignaciones_activas: Array<{
    id: string;
    estado: string;
    hora_inicio: string;
    hora_fin: string;
    linea_id: string;
  }>;
  tramos_laborales: Array<{
    id: string;
    fecha_ingreso: string;
    fecha_egreso: string | null;
  }>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtUYU = (n: number) =>
  new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'UYU', maximumFractionDigits: 0 }).format(n);

const ESTADO_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle; bg: string }> = {
  disponible:  { label: 'Disponible',     color: 'text-emerald-400', icon: CheckCircle, bg: 'bg-emerald-500/10 border-emerald-500/30' },
  en_servicio: { label: 'En Servicio',    color: 'text-blue-400',    icon: TrendingUp,  bg: 'bg-blue-500/10 border-blue-500/30' },
  ausente:     { label: 'AUSENTE',        color: 'text-red-400',     icon: XCircle,     bg: 'bg-red-500/10 border-red-500/30' },
  enfermo:     { label: 'Enfermo',        color: 'text-orange-400',  icon: AlertTriangle, bg: 'bg-orange-500/10 border-orange-500/30' },
  licencia:    { label: 'De Licencia',    color: 'text-purple-400',  icon: Calendar,    bg: 'bg-purple-500/10 border-purple-500/30' },
  franco:      { label: 'Franco',         color: 'text-slate-400',   icon: Clock,       bg: 'bg-slate-500/10 border-slate-500/30' },
  reserva:     { label: 'En Reserva',     color: 'text-amber-400',   icon: ShieldOff,   bg: 'bg-amber-500/10 border-amber-500/30' },
};

// ── Componente principal ─────────────────────────────────────────────────────

interface LegajoLaboralProps {
  /** Si se pasa, muestra el legajo de ese empleado (modo admin).
   *  Si no, usa el id del usuario autenticado (modo conductor). */
  empleadoId?: string;
}

const LegajoLaboral = ({ empleadoId }: LegajoLaboralProps) => {
  const { user } = useAuth();
  const [legajo, setLegajo] = useState<LegajoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

  const targetId = empleadoId ?? (user as any)?.id;

  useEffect(() => {
    if (targetId) loadLegajo();
  }, [targetId]);

  const loadLegajo = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await apiClient.get<{ ok: boolean; legajo: LegajoData }>(
        `/api/admin/personal/${targetId}/legajo`
      );
      const data = (res.data as any)?.legajo ?? (res as any)?.legajo;
      setLegajo(data ?? null);
    } catch (err) {
      console.error('Error cargando legajo:', err);
      setError('No se pudo cargar el legajo laboral. Intente nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  // ── Estados de carga ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
          <p className="text-slate-400">Consultando legajo en PostgreSQL…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex gap-3 items-start">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-red-400 font-semibold">Error al cargar legajo</p>
            <p className="text-red-300 text-sm mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!legajo) {
    return (
      <div className="p-6 text-slate-400 text-center">
        No hay legajo activo para este empleado.
      </div>
    );
  }

  const estadoCfg = ESTADO_CONFIG[legajo.estado_hoy] ?? ESTADO_CONFIG['disponible'];
  const EstadoIcon = estadoCfg.icon;

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 pb-24 space-y-6">

      {/* ── Encabezado del legajo ─────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-600 to-blue-700 flex items-center justify-center shadow-lg shadow-emerald-900/40">
            <User className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{legajo.full_name}</h1>
            <p className="text-slate-400 text-sm">
              Interno #{legajo.internal_number}
              {legajo.categoria_laboral && (
                <span className="ml-2 px-2 py-0.5 bg-slate-700 rounded text-xs text-slate-300">
                  {legajo.categoria_laboral.replace('_', ' ')}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Badge de estado con bloqueo coercitivo */}
        <div className={clsx('flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold', estadoCfg.bg, estadoCfg.color)}>
          <EstadoIcon className="w-4 h-4" />
          {estadoCfg.label}
          {legajo.esta_bloqueado && (
            <span className="ml-2 text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full border border-red-500/30">
              VETADO LISTERÍA
            </span>
          )}
        </div>
      </div>

      {/* ── Alerta de bloqueo coercitivo ─────────────────────────────────── */}
      {legajo.esta_bloqueado && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-4 flex gap-3 items-center">
          <ShieldOff className="w-5 h-5 text-red-400 shrink-0" />
          <div>
            <p className="text-red-300 font-semibold text-sm">
              Conductor bloqueado coercitivamente de la listería
            </p>
            {legajo.motivo_ausencia && (
              <p className="text-red-400/80 text-xs mt-0.5">Motivo: {legajo.motivo_ausencia}</p>
            )}
          </div>
        </div>
      )}

      {/* ── KPIs principales (calculados en PostgreSQL) ───────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* Antigüedad */}
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-blue-400" />
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Antigüedad</p>
          </div>
          <p className="text-3xl font-black text-white">
            {legajo.antiguedad_anios ?? 0}
            <span className="text-lg font-semibold text-slate-400"> a </span>
            {legajo.antiguedad_meses ?? 0}
            <span className="text-lg font-semibold text-slate-400"> m</span>
          </p>
          <p className="text-xs text-emerald-400 mt-1 font-semibold flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            Certificado por sumatoria histórica
          </p>
        </div>

        {/* Días de licencia generados (Ley 12.590) */}
        <div className="bg-gradient-to-br from-purple-900/40 to-slate-900 border border-purple-500/30 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-purple-400" />
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Días de Licencia</p>
          </div>
          <p className="text-3xl font-black text-purple-300">
            {legajo.dias_licencia_generados}
            <span className="text-base font-semibold text-slate-400"> días</span>
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Monto est.: {fmtUYU(legajo.monto_licencia_uyun)} · Ley 12.590
          </p>
        </div>

        {/* Provisión aguinaldo */}
        <div className="bg-gradient-to-br from-emerald-900/40 to-slate-900 border border-emerald-500/30 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Banknote className="w-4 h-4 text-emerald-400" />
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Provisión Aguinaldo</p>
          </div>
          <p className="text-3xl font-black text-emerald-300">
            {fmtUYU(legajo.provision_aguinaldo_mensual)}
            <span className="text-base font-semibold text-slate-400">/mes</span>
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Jornal base: {fmtUYU(legajo.sueldo_jornal_base)}/día
          </p>
        </div>
      </div>

      {/* ── Tramos Laborales Históricos (Escenario 3) ────────────────────── */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden mt-6">
        <div className="bg-slate-800/50 px-5 py-3 border-b border-slate-700 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Historial de Tramos Laborales (Aportes Efectivos)</h2>
        </div>
        <div className="p-0">
          {legajo.tramos_laborales && legajo.tramos_laborales.length > 0 ? (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-800/30 text-xs text-slate-400 uppercase tracking-wider">
                  <th className="p-4 font-medium border-b border-slate-700/50">Alta (Ingreso)</th>
                  <th className="p-4 font-medium border-b border-slate-700/50">Baja (Egreso)</th>
                  <th className="p-4 font-medium border-b border-slate-700/50 text-right">Estado</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-slate-700/50">
                {legajo.tramos_laborales.map((tramo) => (
                  <tr key={tramo.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="p-4 font-mono text-slate-300">
                      {new Date(tramo.fecha_ingreso).toLocaleDateString('es-UY')}
                    </td>
                    <td className="p-4 font-mono text-slate-400">
                      {tramo.fecha_egreso ? new Date(tramo.fecha_egreso).toLocaleDateString('es-UY') : '—'}
                    </td>
                    <td className="p-4 text-right">
                      {!tramo.fecha_egreso ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold border border-emerald-500/20">
                          <CheckCircle className="w-3 h-3" /> ACTIVO
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-500/10 text-slate-400 text-xs font-semibold border border-slate-500/20">
                          CERRADO
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-6 text-center text-slate-500 text-sm">No hay tramos registrados.</div>
          )}
        </div>
      </div>

      {/* ── Asignaciones activas bloqueadas ──────────────────────────────── */}
      {legajo.asignaciones_activas.length > 0 && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden mt-6">
          <div className="px-5 py-3 border-b border-slate-700 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-slate-400" />
            <p className="text-sm font-semibold text-slate-300">
              Asignaciones Activas ({legajo.asignaciones_activas.length})
            </p>
          </div>
          <div className="divide-y divide-slate-800">
            {legajo.asignaciones_activas.map((a) => (
              <div key={a.id} className="px-5 py-3 flex items-center justify-between text-sm">
                <span className="text-slate-300 font-mono">Línea {a.linea_id}</span>
                <span className="text-slate-400">
                  {new Date(a.hora_inicio).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })}
                  {' – '}
                  {new Date(a.hora_fin).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span
                  className={clsx(
                    'px-2 py-0.5 rounded-full text-xs font-semibold',
                    a.estado === 'PROGRAMADO'   && 'bg-blue-500/20 text-blue-300',
                    a.estado === 'EN_CURSO'      && 'bg-emerald-500/20 text-emerald-300',
                    a.estado === 'CANCELADO'     && 'bg-red-500/20 text-red-300',
                  )}
                >
                  {a.estado}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Nota metodológica ─────────────────────────────────────────────── */}
      <p className="text-xs text-slate-600 text-center">
        Legajo calculado en tiempo real por PostgreSQL · función <code className="font-mono">fn_dias_licencia_grupo13()</code> · vista <code className="font-mono">v_legajo_laboral</code>
      </p>
    </div>
  );
};

export default LegajoLaboral;
