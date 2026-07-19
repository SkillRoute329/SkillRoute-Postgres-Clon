import { useState, useEffect, useCallback } from 'react';
import {
  Users, Bus, CheckCircle, Search, Clock,
  UserCheck, Wrench, RefreshCw,
  UserX, CalendarPlus,
} from 'lucide-react';
import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';
import toast from 'react-hot-toast';
import { formatHoraMvd } from '../../utils/formatTimestamp';
import { getToken } from '../../utils/tokenStore';
import { ConsolaCorrelativos } from './components/ConsolaCorrelativos';
import { ModalEditarTurno } from './components/ModalEditarTurno';
import { ModalEditarConductor } from './components/ModalEditarConductor';
import { ModalGestionPersonal } from './components/ModalGestionPersonal';

// ─── Tipos ────────────────────────────────────────────────────────────────
type EstadoTurno = 'programado' | 'activo' | 'completado' | 'cancelado' | 'sin_conductor' | 'cubierto_reserva';
type TurnoNombre = 'madrugada' | 'mañana' | 'tarde' | 'noche';
type EstadoConductorHoy = 'disponible' | 'en_servicio' | 'ausente' | 'reserva' | 'franco' | 'licencia' | 'enfermo';

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
  impactoIngresosRiesgoUSD: number;
  lineasEnRiesgoIMM: string[];
}

// ─── Helpers visuales ──────────────────────────────────────────────────────
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

const ESTADO_CONDUCTOR_LABEL: Record<EstadoConductorHoy, string> = {
  disponible: 'Disponible',
  en_servicio: 'En servicio',
  ausente: 'Ausente',
  reserva: 'Reserva',
  franco: 'Franco',
  licencia: 'Licencia',
  enfermo: 'Enfermo',
};

async function apiFetch(path: string, opts?: RequestInit) {
  const token = getToken() ?? '';
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// ─── Componente Principal ─────────────────────────────────────────────────
export default function ListeroModule() {
  const hoy = new Date().toISOString().split('T')[0];
  const [fecha, setFecha] = useState(hoy);
  const [turnos, setTurnos] = useState<TurnoDia[]>([]);
  const [conductores, setConductores] = useState<ConductorDia[]>([]);
  const [resumen, setResumen] = useState<ResumenDiario | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchConductor, setSearchConductor] = useState('');
  const [filtroTurno, setFiltroTurno] = useState<TurnoNombre | 'todos'>('todos');
  
  const [modalEditarTurno, setModalEditarTurno] = useState<TurnoDia | null>(null);
  const [modalEditarConductor, setModalEditarConductor] = useState<ConductorDia | null>(null);
  const [showGestionPersonal, setShowGestionPersonal] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [vehiculos, setVehiculos] = useState<VehiculoDia[]>([]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { empresaPropia } = useEmpresaPropia();

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    try {
      const [turnosData, conductoresData, resumenData, vehiculosData] = await Promise.all([
        apiFetch(`/api/listero/turnos?fecha=${fecha}`),
        apiFetch(`/api/listero/conductores?fecha=${fecha}`),
        apiFetch(`/api/listero/resumen?fecha=${fecha}`),
        apiFetch(`/api/listero/vehiculos-reserva?fecha=${fecha}`),
      ]);
      setTurnos(turnosData.turnos ?? []);
      setConductores(conductoresData.conductores ?? []);
      setResumen(resumenData.resumen ?? null);
      setVehiculos(vehiculosData.vehiculos ?? []);
    } catch {
      setTurnos([]);
      setConductores([]);
      setVehiculos([]);
    } finally {
      setLoading(false);
    }
  }, [fecha]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

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

  // ─── Derivados ────────────────────────────────────────────────────────────
  const turnosFiltrados = turnos.filter((t) =>
    filtroTurno === 'todos' || t.turno === filtroTurno,
  );

  const conductoresDisponibles = conductores.filter(
    (c) =>
      (c.estadoHoy === 'disponible' || c.estadoHoy === 'reserva') &&
      (c.fullName.toLowerCase().includes(searchConductor.toLowerCase()) ||
        c.internalNumber.includes(searchConductor)),
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-slate-950 overflow-hidden">
      {/* Header */}
      <div className="flex-none px-5 py-3 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-indigo-400" />
          <div>
            <h1 className="text-lg font-black text-white leading-tight">Terminal del Listero</h1>
            <p className="text-[10px] text-slate-500">Programación Diaria & Asignación de Turnos</p>
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
        </div>
      )}

      {/* Main Body */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Grilla central de turnos */}
        <div className="flex-1 flex flex-col overflow-hidden">
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
          
          <div className="px-4 pt-2">
             <ConsolaCorrelativos fecha={fecha} onSuccess={cargarDatos} />
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
              </div>
            ) : turnosFiltrados.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-600">
                <Bus className="w-10 h-10 mb-3 text-slate-700" />
                <p className="text-sm">No hay servicios programados para este día/turno.</p>
                <p className="text-xs text-slate-700 mt-1">Usá "Generar día" para crear la programación.</p>
              </div>
            ) : (
              <>
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
                      <div>
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${tc}`}>
                          {turno.turno.toUpperCase()}
                        </span>
                        <p className="text-xs font-black text-white mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          {turno.horaSalida}
                        </p>
                      </div>

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

                      <div>
                        <p className="text-sm font-black text-white">L{turno.lineaId}</p>
                        <p className="text-[9px] text-slate-500 truncate">{turno.terminal}</p>
                      </div>

                      <div className="flex items-center gap-1 text-slate-300">
                        <Bus className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-xs font-bold">{turno.vehiculoInterno}</span>
                      </div>

                      <div>
                        <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${col.border} ${col.text} border`}>
                          {turno.estado.replace(/_/g, ' ')}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          title="Editar"
                          onClick={() => setModalEditarTurno(turno)}
                          className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
                        >
                          <Wrench className="w-3.5 h-3.5" />
                        </button>
                        {turno.conductorNombre && !turno.firmaConductor && turno.estado !== 'completado' && (
                          <button
                            title="Firmar"
                            onClick={() => firmarCarton(turno.id)}
                            className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
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

      {/* Modales */}
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
