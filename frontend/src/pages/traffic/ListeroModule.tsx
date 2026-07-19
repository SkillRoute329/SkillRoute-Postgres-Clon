/**
 * ListeroModule — Terminal Digital del Listero — {empresaCfg.label}
 *
 * Reemplaza el proceso manual de papel/WhatsApp con:
 * - Grilla diaria: conductor + vehículo + línea + turno + hora salida
 * - Marcado de ausencias con cascada automática (busca reserva, alerta inspector)
 * - Firma digital del cartón (conductor confirma su servicio)
 * - Panel de alertas en tiempo real (Socket.io)
 * - Resumen del día: cobertura, impacto ingresos, riesgo IMM
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Users, Bus, AlertTriangle, CheckCircle, Search, Clock,
  UserCheck, Wrench, RefreshCw,
  ShieldAlert, TrendingDown, Bell, UserX, ArrowRight, CalendarPlus,
} from 'lucide-react';
import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';
import toast from 'react-hot-toast';
import { formatHoraMvd } from '../../utils/formatTimestamp';
import { getToken } from '../../utils/tokenStore';
import { ConsolaCorrelativos } from './components/ConsolaCorrelativos';
import { ModalEditarTurno } from './components/ModalEditarTurno';
import { ModalEditarConductor } from './components/ModalEditarConductor';
import { ModalGestionPersonal } from './components/ModalGestionPersonal';

// ─── Tipos (espejo del backend) ───────────────────────────────────────────────

type EstadoTurno = 'programado' | 'activo' | 'completado' | 'cancelado' | 'sin_conductor' | 'cubierto_reserva';
type TurnoNombre = 'madrugada' | 'mañana' | 'tarde' | 'noche';
type EstadoConductorHoy = 'disponible' | 'en_servicio' | 'ausente' | 'reserva' | 'franco' | 'licencia' | 'enfermo';
type UrgenciaAlerta = 'baja' | 'media' | 'alta' | 'critica';

interface TurnoDia {
  id: string;
  fecha: string;
  conductorId: string | null;
  conductorNombre: string | null;
  conductorInterno: string | null;
  vehiculoId: string;
  vehiculoInterno: string;
  lineaId: string;
  turno: TurnoNombre;
  horaSalida: string;
  horaLlegadaEstimada: string;
  terminal: string;
  estado: EstadoTurno;
  reservaActivada: boolean;
  conductorReservaId: string | null;
  conductorReservaNombre: string | null;
  importanciaLinea: number;
  impactoIngresosEstimado: number | null;
  firmaConductor: boolean;
  horaFirma: string | null;
  observaciones: string | null;
}

interface ConductorDia {
  id: string;
  internalNumber: string;
  fullName: string;
  rol: string;
  estadoHoy: EstadoConductorHoy;
  turnoAsignado: TurnoNombre | null;
  lineaAsignada: string | null;
  vehiculoAsignado: string | null;
  esConductorReserva: boolean;
  telefono: string | null;
  data_jsonb?: any;
}

interface VehiculoDia {
  id: string;
  interno: string;
}

interface AlertaOperativa {
  id: string;
  tipo: string;
  urgencia: UrgenciaAlerta;
  lineaId: string | null;
  titulo: string;
  mensaje: string;
  accionSugerida: string | null;
  impactoIngresosUSD: number | null;
  atendida: boolean;
  datosExtra: Record<string, unknown>;
  createdAt: { seconds: number } | null;
}

interface ResumenDiario {
  fecha: string;
  turnosTotal: number;
  turnosCubiertos: number;
  turnosSinConductor: number;
  conductoresDisponibles: number;
  conductoresAusentes: number;
  conductoresReservaLibres: number;
  vehiculosEnTaller: number;
  coberturaFlota: number;
  alertasActivas: number;
  impactoIngresosRiesgoUSD: number;
  lineasEnRiesgoIMM: string[];
}

// ─── Helpers visuales ────────────────────────────────────────────────────────

const TURNO_COLORS: Record<TurnoNombre, string> = {
  madrugada: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30',
  mañana: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  tarde: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  noche: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
};

const ESTADO_COLORS: Record<EstadoTurno, { bg: string; border: string; text: string }> = {
  programado:       { bg: 'bg-slate-800/60',    border: 'border-slate-700/50', text: 'text-slate-300' },
  activo:           { bg: 'bg-emerald-900/20',   border: 'border-emerald-500/40', text: 'text-emerald-300' },
  completado:       { bg: 'bg-slate-800/30',     border: 'border-slate-700/30', text: 'text-slate-500' },
  cancelado:        { bg: 'bg-red-900/20',        border: 'border-red-500/40', text: 'text-red-400' },
  sin_conductor:    { bg: 'bg-amber-900/30',     border: 'border-amber-500/50', text: 'text-amber-300' },
  cubierto_reserva: { bg: 'bg-sky-900/20',        border: 'border-sky-500/40', text: 'text-sky-300' },
};

const URGENCIA_COLORS: Record<UrgenciaAlerta, { ring: string; badge: string; icon: string }> = {
  baja:    { ring: 'border-slate-600',   badge: 'bg-slate-700 text-slate-300',   icon: 'text-slate-400' },
  media:   { ring: 'border-amber-500/50', badge: 'bg-amber-900/40 text-amber-300', icon: 'text-amber-400' },
  alta:    { ring: 'border-orange-500/60', badge: 'bg-orange-900/40 text-orange-300', icon: 'text-orange-400' },
  critica: { ring: 'border-red-500/70',   badge: 'bg-red-900/40 text-red-300',   icon: 'text-red-400' },
};

const ESTADO_CONDUCTOR_LABEL: Record<EstadoConductorHoy, string> = {
  disponible: 'Disponible',
  en_servicio: 'En servicio',
  ausente: 'Ausente',
  reserva: 'Reserva',
  franco: 'Franco',
  licencia: 'Licencia',
  enfermo: 'Enfermo',
};

// ─── Hook de datos ────────────────────────────────────────────────────────────

function useFecha() {
  const hoy = new Date().toISOString().split('T')[0];
  const [fecha, setFecha] = useState(hoy);
  return { fecha, setFecha, hoy };
}

async function apiFetch(path: string, opts?: RequestInit) {
  const token = getToken() ?? '';
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ListeroModule() {
  const { fecha, setFecha } = useFecha();
  const { empresaPropia, setEmpresaPropia, empresaCfg } = useEmpresaPropia();
    const [turnos, setTurnos] = useState<TurnoDia[]>([]);
  const [conductores, setConductores] = useState<ConductorDia[]>([]);
  const [alertas, setAlertas] = useState<AlertaOperativa[]>([]);
  const [resumen, setResumen] = useState<ResumenDiario | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchConductor, setSearchConductor] = useState('');
  const [filtroTurno, setFiltroTurno] = useState<TurnoNombre | 'todos'>('todos');
  const [modalAusencia, setModalAusencia] = useState<TurnoDia | null>(null);
  const [modalEditarTurno, setModalEditarTurno] = useState<TurnoDia | null>(null);
  const [modalEditarConductor, setModalEditarConductor] = useState<ConductorDia | null>(null);
  const [showGestionPersonal, setShowGestionPersonal] = useState(false);
  const [motivoAusencia, setMotivoAusencia] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [panelAlertas, setPanelAlertas] = useState(true);
  const [vehiculos, setVehiculos] = useState<VehiculoDia[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Carga de datos ─────────────────────────────────────────────────────────

  const cargarAlertas = useCallback(async () => {
    try {
      const data = await apiFetch(`/api/listero/alertas?fecha=${fecha}`);
      setAlertas((prev) => {
        const nuevas = (data.alertas ?? []) as AlertaOperativa[];
        // Notificar alertas nuevas
        const prevIds = new Set(prev.map((a) => a.id));
        for (const a of nuevas) {
          if (!prevIds.has(a.id)) {
            const emo = { critica: '🔴', alta: '🟠', media: '🟡', baja: '⚪' }[a.urgencia] ?? '';
            toast(`${emo} ${a.titulo}`, { duration: a.urgencia === 'critica' ? 8000 : 5000 });
          }
        }
        return nuevas;
      });
    } catch { /* silencioso — red caída */ }
  }, [fecha]);

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    try {
      const [turnosData, conductoresData, alertasData, resumenData, vehiculosData] = await Promise.all([
        apiFetch(`/api/listero/turnos?fecha=${fecha}`),
        apiFetch(`/api/listero/conductores?fecha=${fecha}`),
        apiFetch(`/api/listero/alertas?fecha=${fecha}`),
        apiFetch(`/api/listero/resumen?fecha=${fecha}`),
        apiFetch(`/api/listero/vehiculos-reserva?fecha=${fecha}`),
      ]);
      setTurnos(turnosData.turnos ?? []);
      setConductores(conductoresData.conductores ?? []);
      setAlertas(alertasData.alertas ?? []);
      setResumen(resumenData.resumen ?? null);
      setVehiculos(vehiculosData.vehiculos ?? []);
    } catch {
      setTurnos([]);
      setConductores([]);
      setAlertas([]);
      setVehiculos([]);
    } finally {
      setLoading(false);
    }
  }, [fecha]);

  // Carga inicial + polling de alertas cada 15s
  useEffect(() => {
    cargarDatos();
    pollRef.current = setInterval(cargarAlertas, 15_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [cargarDatos, cargarAlertas]);

  // ─── Acciones ──────────────────────────────────────────────────────────────

  const generarProgramacion = async () => {
    setProcesando(true);
    try {
      const data = await apiFetch('/api/listero/generar-programacion', {
        method: 'POST',
        body: JSON.stringify({ fecha }),
      });
      if (data.created > 0) {
        toast.success(`✅ ${data.created} turnos generados para ${fecha}`);
        cargarDatos();
      } else {
        toast(`Ya existen turnos para ${fecha}`, { icon: 'ℹ️' });
      }
    } catch {
      toast.error('Error al generar programación');
    } finally {
      setProcesando(false);
    }
  };

  const registrarAusencia = async () => {
    if (!modalAusencia || !motivoAusencia.trim()) {
      toast.error('Ingresá el motivo de la ausencia');
      return;
    }
    setProcesando(true);
    try {
      await apiFetch('/api/listero/ausencia', {
        method: 'POST',
        body: JSON.stringify({
          conductorId: modalAusencia.conductorId,
          conductorNombre: modalAusencia.conductorNombre,
          fecha,
          motivo: motivoAusencia,
        }),
      });
      toast.success('Ausencia registrada. Sistema buscando reservas...');
      setModalAusencia(null);
      setMotivoAusencia('');
      setTimeout(cargarDatos, 1500);
    } catch {
      toast.error('Error al registrar ausencia');
    } finally {
      setProcesando(false);
    }
  };

  const asignarReserva = async (turnoId: string, reservaId: string, reservaNombre: string) => {
    setProcesando(true);
    try {
      await apiFetch('/api/listero/reserva', {
        method: 'POST',
        body: JSON.stringify({ turnoId, conductorReservaId: reservaId, conductorReservaNombre: reservaNombre }),
      });
      toast.success(`${reservaNombre} asignado como reserva`);
      cargarDatos();
    } catch {
      toast.error('Error al asignar reserva');
    } finally {
      setProcesando(false);
    }
  };

  const marcarVehiculoTaller = async (turno: TurnoDia, motivo: string) => {
    setProcesando(true);
    try {
      await apiFetch('/api/listero/vehiculo-taller', {
        method: 'POST',
        body: JSON.stringify({ vehiculoId: turno.vehiculoId, vehiculoInterno: turno.vehiculoInterno, motivo, fecha }),
      });
      toast.success(`Coche ${turno.vehiculoInterno} enviado a taller`);
      cargarDatos();
    } catch {
      toast.error('Error al registrar vehículo en taller');
    } finally {
      setProcesando(false);
    }
  };

  const atenderAlerta = async (alertaId: string) => {
    try {
      await apiFetch(`/api/listero/alertas/${alertaId}/atender`, { method: 'PATCH' });
      setAlertas((prev) => prev.map((a) => (a.id === alertaId ? { ...a, atendida: true } : a)));
    } catch {
      toast.error('Error al marcar alerta como atendida');
    }
  };

  const firmarCarton = async (turnoId: string) => {
    try {
      const hora = formatHoraMvd(new Date());
      await apiFetch('/api/listero/firma', {
        method: 'POST',
        body: JSON.stringify({ turnoId, horaFirma: hora }),
      });
      toast.success(`Cartón firmado a las ${hora}`);
      cargarDatos();
    } catch {
      toast.error('Error al registrar firma');
    }
  };

  // ─── Derivados ─────────────────────────────────────────────────────────────

  const turnosFiltrados = turnos.filter((t) =>
    filtroTurno === 'todos' || t.turno === filtroTurno,
  );

  const conductoresDisponibles = conductores.filter(
    (c) =>
      (c.estadoHoy === 'disponible' || c.estadoHoy === 'reserva') &&
      (c.fullName.toLowerCase().includes(searchConductor.toLowerCase()) ||
        c.internalNumber.includes(searchConductor)),
  );

  const alertasActivas = alertas.filter((a) => !a.atendida);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-slate-950 overflow-hidden">
      {showGestionPersonal && <ModalGestionPersonal onClose={() => setShowGestionPersonal(false)} />}

      {/* Header */}
      <div className="flex-none px-5 py-3 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-indigo-400" />
          <div>
            <h1 className="text-lg font-black text-white leading-tight">Terminal del Listero</h1>
            <p className="text-[10px] text-slate-500">Programación diaria · Ausencias · Cascada operativa</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white"
          />
          <button
            onClick={() => setShowGestionPersonal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors text-xs font-bold"
          >
            <Users className="w-3.5 h-3.5" />
            Gestión de Personal
          </button>
          <button
            onClick={generarProgramacion}
            disabled={procesando}
            title="Generar programación automática del día"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-600/30 transition-colors text-xs font-bold disabled:opacity-50"
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            Generar día
          </button>
          <button
            onClick={cargarDatos}
            className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setPanelAlertas((v) => !v)}
            className={`relative p-2 rounded-lg border transition-colors ${alertasActivas.length > 0 ? 'bg-red-900/30 border-red-500/50 text-red-400' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
          >
            <Bell className="w-4 h-4" />
            {alertasActivas.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                {alertasActivas.length > 9 ? '9+' : alertasActivas.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Resumen del día */}
      {resumen && (
        <div className="flex-none px-5 py-2 border-b border-slate-800 bg-slate-900/40">
          <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
            {[
              { label: 'Cobertura flota', value: resumen.turnosTotal > 0 ? `${resumen.coberturaFlota}%` : '—', color: resumen.turnosTotal === 0 ? 'text-slate-500' : resumen.coberturaFlota >= 90 ? 'text-emerald-400' : resumen.coberturaFlota >= 75 ? 'text-amber-400' : 'text-red-400' },
              { label: 'Turnos cubiertos', value: `${resumen.turnosCubiertos}/${resumen.turnosTotal}`, color: 'text-white' },
              { label: 'Sin conductor', value: resumen.turnosSinConductor, color: resumen.turnosSinConductor > 0 ? 'text-amber-400' : 'text-slate-500' },
              { label: 'Conductores libres', value: resumen.conductoresDisponibles, color: 'text-sky-400' },
              { label: 'Reservas libres', value: resumen.conductoresReservaLibres, color: 'text-indigo-400' },
              { label: 'Ausentes hoy', value: resumen.conductoresAusentes, color: resumen.conductoresAusentes > 0 ? 'text-red-400' : 'text-slate-500' },
              { label: 'En taller', value: resumen.vehiculosEnTaller, color: resumen.vehiculosEnTaller > 0 ? 'text-orange-400' : 'text-slate-500' },
              { label: 'Riesgo ingresos', value: `$${resumen.impactoIngresosRiesgoUSD}`, color: resumen.impactoIngresosRiesgoUSD > 0 ? 'text-red-400' : 'text-slate-500' },
            ].map((item) => (
              <div key={item.label} className="bg-slate-800/40 rounded-lg px-2 py-1.5 text-center">
                <p className={`text-base font-black leading-tight ${item.color}`}>{item.value}</p>
                <p className="text-[9px] text-slate-500 uppercase tracking-wide mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>
          {resumen.lineasEnRiesgoIMM.length > 0 && (
            <div className="mt-1.5 flex items-center gap-2 text-[10px] text-red-400">
              <ShieldAlert className="w-3 h-3" />
              Líneas en riesgo IMM: <strong>{resumen.lineasEnRiesgoIMM.join(', ')}</strong>
            </div>
          )}
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">

        {/* Panel de alertas (izquierda, colapsable) */}
        {panelAlertas && (
          <div className="w-72 flex-none border-r border-slate-800 flex flex-col bg-slate-900/60">
            <div className="flex-none px-3 py-2 border-b border-slate-800 flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                <Bell className="w-3 h-3" />
                Alertas activas ({alertasActivas.length})
              </span>
              <button onClick={cargarDatos} className="text-slate-600 hover:text-slate-400">
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
              {alertasActivas.length === 0 && (
                <div className="text-center text-slate-600 text-xs mt-8">
                  <CheckCircle className="w-6 h-6 mx-auto mb-2 text-slate-700" />
                  Sin alertas activas
                </div>
              )}
              {alertasActivas.map((alerta) => {
                const uc = URGENCIA_COLORS[alerta.urgencia];
                return (
                  <div key={alerta.id} className={`rounded-xl border p-2.5 ${uc.ring}`}>
                    <div className="flex items-start justify-between gap-1 mb-1">
                      <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${uc.badge}`}>
                        {alerta.urgencia}
                      </span>
                      {alerta.lineaId && (
                        <span className="text-[9px] text-slate-500">L{alerta.lineaId}</span>
                      )}
                    </div>
                    <p className="text-[10px] font-bold text-white leading-snug">{alerta.titulo}</p>
                    <p className="text-[9px] text-slate-400 mt-1 leading-relaxed">{alerta.mensaje}</p>
                    {alerta.accionSugerida && (
                      <p className="text-[9px] text-indigo-300 mt-1.5 leading-relaxed border-t border-slate-700 pt-1.5">
                        <strong>Acción:</strong> {alerta.accionSugerida}
                      </p>
                    )}
                    {alerta.impactoIngresosUSD != null && alerta.impactoIngresosUSD > 0 && (
                      <p className="text-[9px] text-red-400 mt-1 flex items-center gap-1">
                        <TrendingDown className="w-2.5 h-2.5" />
                        Impacto: USD {alerta.impactoIngresosUSD}
                      </p>
                    )}
                    {/* Acción rápida: asignar reserva desde alerta */}
                    {alerta.tipo === 'reserva_disponible' && alerta.datosExtra?.reservaId && (
                      <button
                        onClick={() => {
                          const turnoId = String(alerta.datosExtra.turnoId ?? '');
                          if (turnoId) asignarReserva(
                            turnoId,
                            String(alerta.datosExtra.reservaId),
                            String(alerta.datosExtra.reservaNombre ?? ''),
                          );
                        }}
                        className="mt-2 w-full text-[9px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-lg py-1 hover:bg-indigo-500/30 transition-colors"
                      >
                        Asignar {String(alerta.datosExtra.reservaNombre ?? 'reserva')}
                      </button>
                    )}
                    <button
                      onClick={() => atenderAlerta(alerta.id)}
                      className="mt-1.5 w-full text-[9px] text-slate-500 hover:text-slate-300 border border-slate-700/50 rounded-lg py-0.5 transition-colors"
                    >
                      Marcar atendida
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Grilla central de turnos */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Filtros */}
          <div className="flex-none px-4 py-2 border-b border-slate-800 flex items-center gap-3">
            <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg p-1">
              {(['todos', 'madrugada', 'mañana', 'tarde', 'noche'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setFiltroTurno(t)}
                  className={`text-[10px] font-bold px-2.5 py-1 rounded-md transition-all capitalize ${
                    filtroTurno === t ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <span className="text-[10px] text-slate-500">{turnosFiltrados.length} servicios</span>
          </div>
          
          {/* Consola de correlativos opcional */}
          <div className="px-4 pt-2">
             <ConsolaCorrelativos fecha={fecha} onSuccess={cargarDatos} />
          </div>

          {/* Tabla de turnos */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
              </div>
            ) : turnosFiltrados.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-600">
                <Bus className="w-10 h-10 mb-3 text-slate-700" />
                <p className="text-sm">No hay servicios programados para este día/turno.</p>
                <p className="text-xs text-slate-700 mt-1">Usá "Generar día" para crear la programación automáticamente.</p>
              </div>
            ) : (
              <div className="p-4 space-y-2">
                {/* Encabezado de columnas */}
                <div className="grid grid-cols-[1fr_2fr_1.5fr_1fr_1fr_auto] gap-2 px-3 text-[9px] font-black text-slate-600 uppercase tracking-widest">
                  <span>Turno / Salida</span>
                  <span>Conductor</span>
                  <span>Línea / Terminal</span>
                  <span>Coche</span>
                  <span>Estado</span>
                  <span>Acciones</span>
                </div>

                {turnosFiltrados.map((turno) => {
                  const col = ESTADO_COLORS[turno.estado];
                  const tc = TURNO_COLORS[turno.turno];
                  const esCritico = turno.estado === 'sin_conductor' && turno.importanciaLinea >= 4;

                  return (
                    <div
                      key={turno.id}
                      className={`grid grid-cols-[1fr_2fr_1.5fr_1fr_1fr_auto] gap-2 items-center px-3 py-2.5 rounded-xl border transition-all ${col.bg} ${col.border} ${esCritico ? 'ring-1 ring-red-500/40' : ''}`}
                    >
                      {/* Turno + hora */}
                      <div>
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${tc}`}>
                          {turno.turno.toUpperCase()}
                        </span>
                        <p className="text-xs font-black text-white mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          {turno.horaSalida}
                        </p>
                      </div>

                      {/* Conductor */}
                      <div className="min-w-0">
                        {turno.conductorNombre ? (
                          <div>
                            <p className="text-xs font-bold text-white truncate">{turno.conductorNombre}</p>
                            {turno.conductorInterno && (
                              <p className="text-[9px] text-slate-500">INT {turno.conductorInterno}</p>
                            )}
                            {turno.reservaActivada && (
                              <span className="text-[9px] font-bold text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded">
                                RESERVA: {turno.conductorReservaNombre}
                              </span>
                            )}
                            {turno.firmaConductor && (
                              <span className="text-[9px] font-bold text-emerald-400 flex items-center gap-0.5 mt-0.5">
                                <CheckCircle className="w-2.5 h-2.5" />
                                Firmado {turno.horaFirma}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-amber-400">
                            <UserX className="w-3.5 h-3.5" />
                            <span className="text-xs font-bold">Sin conductor</span>
                          </div>
                        )}
                      </div>

                      {/* Línea + terminal */}
                      <div>
                        <p className="text-sm font-black text-white">L{turno.lineaId}</p>
                        <p className="text-[9px] text-slate-500 truncate">{turno.terminal}</p>
                        {turno.importanciaLinea >= 4 && (
                          <span className="text-[8px] font-black text-red-400 uppercase">alta prioridad</span>
                        )}
                      </div>

                      {/* Coche */}
                      <div className="flex items-center gap-1 text-slate-300">
                        <Bus className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-xs font-bold">{turno.vehiculoInterno}</span>
                      </div>

                      {/* Estado */}
                      <div>
                        <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${col.border} ${col.text} border`}>
                          {turno.estado.replace(/_/g, ' ')}
                        </span>
                        {turno.impactoIngresosEstimado != null && turno.estado === 'sin_conductor' && (
                          <p className="text-[8px] text-red-400 mt-0.5 flex items-center gap-0.5">
                            <TrendingDown className="w-2 h-2" />
                            -USD {turno.impactoIngresosEstimado}
                          </p>
                        )}
                      </div>

                      {/* Acciones */}
                      <div className="flex items-center gap-1">
                        <button
                          title="Editar manualmente"
                          onClick={() => setModalEditarTurno(turno)}
                          className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
                        >
                           {/* Icono de lápiz genérico (lucide-react no siempre lo tiene importado, usar texto o Wrench) */}
                          <Wrench className="w-3.5 h-3.5" />
                        </button>
                        {turno.conductorNombre && !turno.firmaConductor && turno.estado !== 'completado' && (
                          <button
                            title="Registrar firma del cartón"
                            onClick={() => firmarCarton(turno.id)}
                            className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {turno.conductorNombre && turno.estado !== 'sin_conductor' && (
                          <button
                            title="Registrar ausencia"
                            onClick={() => { setModalAusencia(turno); setMotivoAusencia(''); }}
                            className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
                          >
                            <UserX className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          title="Enviar coche a taller"
                          onClick={() => {
                            const motivo = prompt(`Motivo del ingreso a taller — Coche ${turno.vehiculoInterno}:`);
                            if (motivo) marcarVehiculoTaller(turno, motivo);
                          }}
                          className="p-1.5 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/20 transition-colors"
                        >
                          <Wrench className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Panel lateral: conductores disponibles */}
        <div className="w-60 flex-none border-l border-slate-800 flex flex-col bg-slate-900/60">
          <div className="flex-none px-3 py-2 border-b border-slate-800">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
              <Users className="w-3 h-3" />
              Retén / Reservas
            </span>
            <div className="mt-1.5 relative">
              <Search className="w-3 h-3 absolute left-2 top-2 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar..."
                value={searchConductor}
                onChange={(e) => setSearchConductor(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-6 pr-2 py-1.5 text-[11px] text-white"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
            {conductoresDisponibles.length === 0 && (
              <p className="text-center text-slate-600 text-xs mt-8">Sin conductores libres</p>
            )}
            {conductoresDisponibles.map((c) => (
              <div
                key={c.id}
                onClick={() => setModalEditarConductor(c)}
                className={`rounded-lg border p-2 cursor-pointer hover:bg-slate-700/50 transition-colors ${c.estadoHoy === 'reserva' ? 'border-indigo-500/30 bg-indigo-900/10' : 'border-slate-700/50 bg-slate-800/40'}`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-white truncate">{c.fullName}</p>
                  {c.esConductorReserva && (
                    <span className="text-[8px] font-black text-indigo-400 bg-indigo-500/10 px-1 py-0.5 rounded">RSV</span>
                  )}
                </div>
                <p className="text-[9px] text-slate-500">INT {c.internalNumber}</p>
                <span className={`text-[8px] font-bold mt-0.5 inline-block ${c.estadoHoy === 'reserva' ? 'text-indigo-400' : 'text-emerald-400'}`}>
                  {ESTADO_CONDUCTOR_LABEL[c.estadoHoy]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modal de ausencia */}
      {modalAusencia && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="font-black text-white text-base mb-1 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Registrar ausencia
            </h3>
            <p className="text-sm text-slate-400 mb-3">
              <strong className="text-white">{modalAusencia.conductorNombre}</strong> — L{modalAusencia.lineaId} salida {modalAusencia.horaSalida}, coche {modalAusencia.vehiculoInterno}
            </p>

            <label className="block text-xs text-slate-400 mb-1">Motivo *</label>
            <div className="grid grid-cols-2 gap-1.5 mb-3">
              {['Enfermedad', 'Accidente', 'Franco extra', 'Sin aviso', 'Licencia', 'Otro'].map((m) => (
                <button
                  key={m}
                  onClick={() => setMotivoAusencia(m)}
                  className={`text-xs py-1.5 px-2 rounded-lg border transition-all ${motivoAusencia === m ? 'bg-amber-500/20 border-amber-500/60 text-amber-300' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}
                >
                  {m}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Detalle adicional..."
              value={motivoAusencia.length > 0 && !['Enfermedad','Accidente','Franco extra','Sin aviso','Licencia','Otro'].includes(motivoAusencia) ? motivoAusencia : ''}
              onChange={(e) => setMotivoAusencia(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white mb-4"
            />

            {modalAusencia.importanciaLinea >= 4 && (
              <div className="mb-3 p-2.5 bg-red-900/20 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-start gap-2">
                <ShieldAlert className="w-3.5 h-3.5 flex-none mt-0.5" />
                <span>Línea de alta prioridad — ausencia sin cobertura puede generar infracción IMM.</span>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setModalAusencia(null)}
                className="flex-1 py-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white transition-colors text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={registrarAusencia}
                disabled={procesando || !motivoAusencia.trim()}
                className="flex-1 py-2 rounded-xl bg-amber-500 text-white font-bold text-sm hover:bg-amber-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-1"
              >
                {procesando ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modales de edición */}
      {modalEditarTurno && (
        <ModalEditarTurno
          turno={modalEditarTurno}
          conductores={conductores}
          vehiculos={vehiculos}
          onClose={() => setModalEditarTurno(null)}
          onSuccess={() => { setModalEditarTurno(null); cargarDatos(); }}
        />
      )}
      
      {modalEditarConductor && (
        <ModalEditarConductor
          conductor={modalEditarConductor}
          onClose={() => setModalEditarConductor(null)}
          onSuccess={() => { setModalEditarConductor(null); cargarDatos(); }}
        />
      )}

      {showGestionPersonal && (
        <ModalGestionPersonal
          onClose={() => setShowGestionPersonal(false)}
        />
      )}
    </div>
  );
}
