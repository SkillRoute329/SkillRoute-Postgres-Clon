/**
 * Motor de Consecuencias — SkillRoute
 * =====================================
 * Simula en tiempo real la cascada de efectos de cualquier evento operativo.
 * "¿Qué pasa si el conductor X falta el lunes?"
 * → El sistema calcula el impacto en RRHH, Nómina, OTP, Subsidio y Finanzas.
 */

import { useState, useCallback } from 'react';
import { collection, addDoc, serverTimestamp } from '../../config/firestoreShim';
import { db } from '../../config/firebase';
import {
  AlertTriangle, CheckCircle2, Info, Zap, Users, DollarSign,
  TrendingDown, Bus, FileText, ChevronDown, ChevronRight,
  Play, RotateCcw, Loader2, Network, Send
} from 'lucide-react';

// ── Tipos (espejo del backend) ────────────────────────────────────────────────

type TipoEvento =
  | 'CONDUCTOR_AUSENTE'
  | 'CONDUCTOR_ASIGNADO'
  | 'VEHICULO_FUERA_DE_SERVICIO'
  | 'VIAJE_TARDIO'
  | 'VIAJE_CANCELADO';

type DominioEfecto = 'RRHH' | 'NOMINA' | 'OPERACIONES' | 'OTP' | 'SUBSIDIO' | 'FINANZAS' | 'DISCIPLINA';
type Severidad = 'info' | 'advertencia' | 'critico';

interface EfectoConsecuencia {
  dominio: DominioEfecto;
  severidad: Severidad;
  titulo: string;
  descripcion: string;
  delta?: number;
  unidad?: string;
  entidadAfectadaId: string;
  entidadAfectadaTipo: string;
  requiereAccion: boolean;
  accionSugerida?: string;
}

interface ResumenCascada {
  impactoNomina: number;
  impactoSubsidio: number;
  deltaOTP: number;
  viajesEnRiesgo: number;
  kmPerdidos: number;
  severidadGlobal: Severidad;
  requiereIntervencionInmediata: boolean;
}

interface ResultadoPropagacion {
  evento: any;
  efectos: EfectoConsecuencia[];
  resumen: ResumenCascada;
  timestamp: string;
}

// ── Formularios de evento por tipo ────────────────────────────────────────────

interface FormState {
  tipo: TipoEvento;
  empresaId: string;
  conductorId: string;
  conductorNombre: string;
  codigoAusencia: string;
  fecha: string;
  turnoId: string;
  lineaId: string;
  cocheId: string;
  cocheNumero: string;
  motivoVehiculo: string;
  horasEstimadas: number;
  minutosRetraso: number;
  kmPerdidos: number;
  horaInicio: number;
  duracionHoras: number;
  esTurnoPartido: boolean;
  tipoDia: string;
  kmEsperados: number;
  aniosAntiguedad: number;
  causaViaje: string;
}

const FORM_DEFAULT: FormState = {
  tipo: 'CONDUCTOR_AUSENTE',
  empresaId: '70',
  conductorId: 'conductor-001',
  conductorNombre: 'Juan Pérez',
  codigoAusencia: 'ausencia_injustificada',
  fecha: new Date().toISOString().slice(0, 10),
  turnoId: 'turno-manana-001',
  lineaId: '183',
  cocheId: 'coche-412',
  cocheNumero: '412',
  motivoVehiculo: 'averia',
  horasEstimadas: 4,
  minutosRetraso: 12,
  kmPerdidos: 36,
  horaInicio: 6,
  duracionHoras: 8,
  esTurnoPartido: false,
  tipoDia: 'habil',
  kmEsperados: 120,
  aniosAntiguedad: 5,
  causaViaje: 'avería de vehículo',
};

// ── Configuración visual por dominio ─────────────────────────────────────────

const DOMINIO_CONFIG: Record<DominioEfecto, { label: string; icon: any; color: string; bg: string }> = {
  RRHH:        { label: 'RRHH',         icon: Users,        color: 'text-blue-400',    bg: 'bg-blue-500/10'    },
  NOMINA:      { label: 'Nómina',       icon: DollarSign,   color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  OPERACIONES: { label: 'Operaciones',  icon: Bus,          color: 'text-purple-400',  bg: 'bg-purple-500/10'  },
  OTP:         { label: 'OTP',          icon: TrendingDown, color: 'text-orange-400',  bg: 'bg-orange-500/10'  },
  SUBSIDIO:    { label: 'Subsidio STM', icon: FileText,     color: 'text-yellow-400',  bg: 'bg-yellow-500/10'  },
  FINANZAS:    { label: 'Finanzas',     icon: DollarSign,   color: 'text-teal-400',    bg: 'bg-teal-500/10'    },
  DISCIPLINA:  { label: 'Disciplina',   icon: AlertTriangle,color: 'text-red-400',     bg: 'bg-red-500/10'     },
};

const SEVERIDAD_CONFIG: Record<Severidad, { icon: any; color: string; border: string }> = {
  info:        { icon: Info,          color: 'text-slate-400', border: 'border-slate-700' },
  advertencia: { icon: AlertTriangle, color: 'text-amber-400', border: 'border-amber-500/30' },
  critico:     { icon: AlertTriangle, color: 'text-red-400',   border: 'border-red-500/40'  },
};

// ── Componente principal ─────────────────────────────────────────────────────

export default function MotorConsecuencias() {
  const [form, setForm] = useState<FormState>(FORM_DEFAULT);
  const [resultado, setResultado] = useState<ResultadoPropagacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dominiosExpandidos, setDominiosExpandidos] = useState<Set<DominioEfecto>>(
    new Set(['RRHH', 'NOMINA', 'OPERACIONES', 'OTP', 'SUBSIDIO', 'FINANZAS', 'DISCIPLINA'])
  );
  const [ejecutando, setEjecutando] = useState(false);
  const [ejecutado, setEjecutado] = useState(false);

  const toggleDominio = (d: DominioEfecto) => {
    setDominiosExpandidos((prev) => {
      const next = new Set(prev);
      next.has(d) ? next.delete(d) : next.add(d);
      return next;
    });
  };

  const set = (k: keyof FormState, v: any) => setForm((f) => ({ ...f, [k]: v }));

  // ── Construir el evento según el tipo seleccionado ─────────────────────────
  const construirEvento = useCallback(() => {
    const base = { empresaId: form.empresaId };
    switch (form.tipo) {
      case 'CONDUCTOR_AUSENTE':
        return { ...base, tipo: form.tipo, conductorId: form.conductorId, conductorNombre: form.conductorNombre, fecha: form.fecha, codigoAusencia: form.codigoAusencia, turnoId: form.turnoId || undefined, lineaId: form.lineaId || undefined };
      case 'CONDUCTOR_ASIGNADO':
        return { ...base, tipo: form.tipo, conductorId: form.conductorId, conductorNombre: form.conductorNombre, turnoId: form.turnoId, lineaId: form.lineaId, cocheId: form.cocheId, fecha: form.fecha, horaInicio: form.horaInicio, duracionHoras: form.duracionHoras, esTurnoPartido: form.esTurnoPartido, tipoDia: form.tipoDia, kmEsperados: form.kmEsperados, aniosAntiguedad: form.aniosAntiguedad };
      case 'VEHICULO_FUERA_DE_SERVICIO':
        return { ...base, tipo: form.tipo, cocheId: form.cocheId, cocheNumero: form.cocheNumero, motivo: form.motivoVehiculo, lineaId: form.lineaId || undefined, horasEstimadas: form.horasEstimadas };
      case 'VIAJE_TARDIO':
        return { ...base, tipo: form.tipo, viajeId: 'viaje-sim-001', lineaId: form.lineaId, conductorId: form.conductorId || undefined, minutosRetraso: form.minutosRetraso, parada: 'Parada simulada', causa: form.causaViaje as any };
      case 'VIAJE_CANCELADO':
        return { ...base, tipo: form.tipo, viajeId: 'viaje-sim-001', lineaId: form.lineaId, kmPerdidos: form.kmPerdidos, causa: form.causaViaje };
    }
  }, [form]);

  // Ejecuta el evento real en Firestore → dispara el trigger automático
  const ejecutar = useCallback(async () => {
    if (!resultado) return;
    setEjecutando(true);
    try {
      const evento = construirEvento() as any;
      switch (form.tipo) {
        case 'CONDUCTOR_AUSENTE':
          await addDoc(collection(db, 'licencias_personal'), {
            employeeId:      evento.conductorId,
            employeeName:    evento.conductorNombre,
            empresaId:       evento.empresaId,
            startDate:       evento.fecha,
            tipoLicencia:    evento.codigoAusencia,
            lineaId:         evento.lineaId ?? null,
            turnoId:         evento.turnoId ?? null,
            origen:          'motor_consecuencias',
            createdAt:       serverTimestamp(),
          });
          break;
        case 'CONDUCTOR_ASIGNADO':
          await addDoc(collection(db, 'daily_shifts'), {
            conductorId:     evento.conductorId,
            conductorNombre: evento.conductorNombre,
            empresaId:       evento.empresaId,
            lineaId:         evento.lineaId,
            cocheId:         evento.cocheId,
            date:            evento.fecha,
            horaInicio:      evento.horaInicio,
            duracionHoras:   evento.duracionHoras,
            esTurnoPartido:  evento.esTurnoPartido,
            tipoDia:         evento.tipoDia,
            kmEsperados:     evento.kmEsperados,
            aniosAntiguedad: evento.aniosAntiguedad,
            estado:          'asignado',
            origen:          'motor_consecuencias',
            createdAt:       serverTimestamp(),
          });
          break;
        case 'VEHICULO_FUERA_DE_SERVICIO':
          await addDoc(collection(db, 'vehicle_events'), {
            codigoVehiculo:  evento.cocheNumero,
            empresaId:       evento.empresaId,
            lineaId:         evento.lineaId ?? null,
            estado:          'fuera_de_servicio',
            motivo:          evento.motivo,
            horasEstimadas:  evento.horasEstimadas,
            origen:          'motor_consecuencias',
            timestamp:       serverTimestamp(),
          });
          break;
        default:
          throw new Error('Este tipo de evento no se puede ejecutar directamente desde el simulador.');
      }
      setEjecutado(true);
    } catch (e: any) {
      setError(e.message ?? 'Error al ejecutar el evento');
    } finally {
      setEjecutando(false);
    }
  }, [resultado, form, construirEvento]);

  const simular = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const evento = construirEvento();
      const res = await fetch('/api/consequencePreview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evento }),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'Error en simulación');
      setResultado(data as ResultadoPropagacion);
    } catch (e: any) {
      setError(e.message ?? 'No se pudo conectar con el motor');
    } finally {
      setCargando(false);
    }
  }, [construirEvento]);

  // Agrupar efectos por dominio
  const efectosPorDominio = resultado
    ? (Object.keys(DOMINIO_CONFIG) as DominioEfecto[]).reduce<Record<DominioEfecto, EfectoConsecuencia[]>>(
        (acc, d) => {
          acc[d] = resultado.efectos.filter((e) => e.dominio === d);
          return acc;
        },
        {} as any
      )
    : null;

  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 mt-0.5">
          <Network className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-200">Motor de Consecuencias</h1>
          <p className="text-sm text-slate-400 mt-0.5">Simulá el impacto en cascada de cualquier evento operativo — antes de que suceda</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Panel izquierdo: formulario */}
        <div className="xl:col-span-2 space-y-4">
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Configurar evento</h2>

            {/* Tipo de evento */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500 uppercase tracking-widest">Tipo de evento</label>
              <select
                value={form.tipo}
                onChange={(e) => set('tipo', e.target.value as TipoEvento)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none"
              >
                <option value="CONDUCTOR_AUSENTE">Conductor ausente</option>
                <option value="CONDUCTOR_ASIGNADO">Asignación de turno</option>
                <option value="VEHICULO_FUERA_DE_SERVICIO">Vehículo fuera de servicio</option>
                <option value="VIAJE_TARDIO">Viaje con retraso</option>
                <option value="VIAJE_CANCELADO">Viaje cancelado</option>
              </select>
            </div>

            {/* Empresa */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500 uppercase tracking-widest">Empresa</label>
              <select
                value={form.empresaId}
                onChange={(e) => set('empresaId', e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none"
              >
                {/* FASE 5.19: el motor opera con datos de cartón UCOT
                    (único con descarga oficial automatizada). Se quitaron
                    las opciones "próximamente" ilustrativas. */}
                <option value="70">UCOT (70)</option>
              </select>
            </div>

            {/* Campos dinámicos según tipo */}
            <CamposDinamicos form={form} set={set} />

            <button
              onClick={simular}
              disabled={cargando}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:opacity-50 rounded-xl px-4 py-3 font-semibold text-white transition-all"
            >
              {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {cargando ? 'Calculando cascada...' : 'Simular consecuencias'}
            </button>

            {resultado && (
              <button
                onClick={() => { setResultado(null); setError(null); setEjecutado(false); }}
                className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-slate-300 text-sm transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Nueva simulación
              </button>
            )}
          </div>

          {/* Leyenda */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2">
            <p className="text-xs text-slate-500 uppercase tracking-widest font-medium">Cómo leer los resultados</p>
            <div className="space-y-1.5 text-xs text-slate-400">
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-500" />Crítico — requiere acción inmediata</div>
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-amber-500" />Advertencia — monitorear</div>
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-slate-500" />Informativo — sin acción requerida</div>
            </div>
          </div>
        </div>

        {/* Panel derecho: resultados */}
        <div className="xl:col-span-3 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-300">Error en simulación</p>
                <p className="text-xs text-red-400 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {!resultado && !cargando && !error && (
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-12 text-center">
              <Zap className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">Configurá un evento y presioná "Simular" para ver la cascada de consecuencias</p>
            </div>
          )}

          {resultado && (
            <>
              {/* Resumen ejecutivo */}
              <ResumenEjecutivo resumen={resultado.resumen} />

              {/* Botón Ejecutar */}
              {!ejecutado ? (
                <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-200">¿Confirmar y ejecutar este evento?</p>
                    <p className="text-xs text-slate-500 mt-0.5">Se registrará en el sistema real y disparará el motor automáticamente.</p>
                  </div>
                  <button
                    onClick={ejecutar}
                    disabled={ejecutando}
                    className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 rounded-xl px-4 py-2.5 font-semibold text-white text-sm whitespace-nowrap transition-all"
                  >
                    {ejecutando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {ejecutando ? 'Ejecutando...' : 'Ejecutar'}
                  </button>
                </div>
              ) : (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-emerald-300">Evento ejecutado</p>
                    <p className="text-xs text-emerald-500 mt-0.5">El motor automático calculó la cascada y las alertas aparecen en el dashboard.</p>
                  </div>
                </div>
              )}

              {/* Efectos por dominio */}
              {(Object.keys(DOMINIO_CONFIG) as DominioEfecto[]).map((dominio) => {
                const efectos = efectosPorDominio![dominio];
                if (!efectos || efectos.length === 0) return null;
                const cfg = DOMINIO_CONFIG[dominio];
                const expandido = dominiosExpandidos.has(dominio);
                const Icon = cfg.icon;
                const tieneCritico = efectos.some((e) => e.severidad === 'critico');
                const tieneAdv = efectos.some((e) => e.severidad === 'advertencia');

                return (
                  <div key={dominio} className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
                    <button
                      onClick={() => toggleDominio(dominio)}
                      className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-800/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`p-1.5 rounded-lg ${cfg.bg}`}>
                          <Icon className={`w-4 h-4 ${cfg.color}`} />
                        </span>
                        <span className="font-medium text-slate-200 text-sm">{cfg.label}</span>
                        <span className="text-xs text-slate-500">{efectos.length} efecto{efectos.length !== 1 ? 's' : ''}</span>
                        {tieneCritico && <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 font-medium">Crítico</span>}
                        {!tieneCritico && tieneAdv && <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium">Advertencia</span>}
                      </div>
                      {expandido ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                    </button>

                    {expandido && (
                      <div className="px-5 pb-4 space-y-3">
                        {efectos.map((efecto, i) => (
                          <TarjetaEfecto key={i} efecto={efecto} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              <p className="text-xs text-slate-600 text-center">
                Simulación — {new Date(resultado.timestamp).toLocaleString('es-UY')} · No modifica datos reales
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Subcomponente: resumen ejecutivo ─────────────────────────────────────────

function ResumenEjecutivo({ resumen }: { resumen: ResumenCascada }) {
  const globColor = resumen.severidadGlobal === 'critico'
    ? 'border-red-500/40 bg-red-500/5'
    : resumen.severidadGlobal === 'advertencia'
    ? 'border-amber-500/30 bg-amber-500/5'
    : 'border-slate-700 bg-slate-900';

  return (
    <div className={`border rounded-xl p-5 ${globColor}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-300">Impacto total estimado</h3>
        {resumen.requiereIntervencionInmediata && (
          <span className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/15 px-2.5 py-1 rounded-full font-medium animate-pulse">
            <AlertTriangle className="w-3.5 h-3.5" /> Intervención inmediata
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricaResumen
          label="Impacto nómina"
          value={resumen.impactoNomina}
          unidad="UYU"
          negativo={resumen.impactoNomina < 0}
        />
        <MetricaResumen
          label="Subsidio afectado"
          value={resumen.impactoSubsidio}
          unidad="UYU"
          negativo={resumen.impactoSubsidio < 0}
        />
        <MetricaResumen
          label="Δ OTP"
          value={resumen.deltaOTP}
          unidad="%"
          negativo={resumen.deltaOTP < 0}
        />
        <MetricaResumen
          label="Viajes en riesgo"
          value={resumen.viajesEnRiesgo}
          unidad=""
          negativo={resumen.viajesEnRiesgo > 0}
        />
      </div>
    </div>
  );
}

function MetricaResumen({ label, value, unidad, negativo }: { label: string; value: number; unidad: string; negativo: boolean }) {
  const display = Math.abs(value);
  const formatted = unidad === 'UYU'
    ? `${negativo ? '-' : value > 0 ? '+' : ''}$${Math.round(display).toLocaleString('es-UY')}`
    : `${negativo ? '-' : value > 0 ? '+' : ''}${display % 1 === 0 ? display : display.toFixed(1)}${unidad}`;

  return (
    <div className="text-center">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-lg font-bold ${negativo ? 'text-red-400' : value === 0 ? 'text-slate-500' : 'text-emerald-400'}`}>
        {display === 0 ? '—' : formatted}
      </p>
    </div>
  );
}

// ── Subcomponente: tarjeta de efecto individual ───────────────────────────────

function TarjetaEfecto({ efecto }: { efecto: EfectoConsecuencia }) {
  const [expandida, setExpandida] = useState(efecto.requiereAccion);
  const sev = SEVERIDAD_CONFIG[efecto.severidad];
  const SevIcon = sev.icon;

  return (
    <div className={`border rounded-lg p-3.5 ${sev.border} bg-slate-800/40`}>
      <button
        onClick={() => setExpandida(!expandida)}
        className="w-full flex items-start justify-between gap-3 text-left"
      >
        <div className="flex items-start gap-2.5">
          <SevIcon className={`w-4 h-4 ${sev.color} shrink-0 mt-0.5`} />
          <div>
            <p className="text-sm font-medium text-slate-200">{efecto.titulo}</p>
            {efecto.delta !== undefined && (
              <p className={`text-xs font-mono mt-0.5 ${efecto.delta < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {efecto.delta > 0 ? '+' : ''}{efecto.unidad === 'UYU'
                  ? `$${Math.round(Math.abs(efecto.delta)).toLocaleString('es-UY')} UYU`
                  : `${efecto.delta}${efecto.unidad ?? ''}`}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {efecto.requiereAccion && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">Acción</span>
          )}
          {expandida ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />}
        </div>
      </button>

      {expandida && (
        <div className="mt-3 pl-6 space-y-2 border-l border-slate-700">
          <p className="text-xs text-slate-400 leading-relaxed">{efecto.descripcion}</p>
          {efecto.accionSugerida && (
            <div className="flex items-start gap-2 bg-amber-500/8 border border-amber-500/20 rounded-lg p-2.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300">{efecto.accionSugerida}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Subcomponente: campos del formulario según tipo ───────────────────────────

function CamposDinamicos({ form, set }: { form: FormState; set: (k: keyof FormState, v: any) => void }) {
  const inputClass = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none";
  const labelClass = "text-xs text-slate-500 uppercase tracking-widest";

  const campo = (label: string, key: keyof FormState, type = 'text') => (
    <div className="space-y-1.5">
      <label className={labelClass}>{label}</label>
      <input
        type={type}
        value={form[key] as string}
        onChange={(e) => set(key, type === 'number' ? Number(e.target.value) : e.target.value)}
        className={inputClass}
      />
    </div>
  );

  const select = (label: string, key: keyof FormState, options: { value: string; label: string }[]) => (
    <div className="space-y-1.5">
      <label className={labelClass}>{label}</label>
      <select value={form[key] as string} onChange={(e) => set(key, e.target.value)} className={inputClass}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  switch (form.tipo) {
    case 'CONDUCTOR_AUSENTE':
      return (
        <>
          {campo('Nombre del conductor', 'conductorNombre')}
          {campo('Fecha', 'fecha', 'date')}
          {campo('Línea afectada', 'lineaId')}
          {select('Código de ausencia', 'codigoAusencia', [
            { value: 'ausencia_injustificada', label: 'Ausencia injustificada' },
            { value: 'licencia_medica', label: 'Licencia médica' },
            { value: 'licencia_gremial', label: 'Licencia gremial' },
            { value: 'ausencia_justificada', label: 'Ausencia justificada' },
            { value: 'accidente_trabajo', label: 'Accidente de trabajo' },
          ])}
        </>
      );
    case 'CONDUCTOR_ASIGNADO':
      return (
        <>
          {campo('Nombre del conductor', 'conductorNombre')}
          {campo('Línea', 'lineaId')}
          {campo('Nro. de coche', 'cocheId')}
          {campo('Hora de inicio', 'horaInicio', 'number')}
          {campo('Duración (horas)', 'duracionHoras', 'number')}
          {campo('Km esperados', 'kmEsperados', 'number')}
          {campo('Años de antigüedad', 'aniosAntiguedad', 'number')}
          {select('Tipo de día', 'tipoDia', [
            { value: 'habil', label: 'Día hábil' },
            { value: 'sabado', label: 'Sábado' },
            { value: 'domingo', label: 'Domingo' },
            { value: 'feriado', label: 'Feriado' },
          ])}
          <div className="flex items-center gap-3">
            <input type="checkbox" id="turnoPartido" checked={form.esTurnoPartido} onChange={(e) => set('esTurnoPartido', e.target.checked)} className="rounded" />
            <label htmlFor="turnoPartido" className="text-sm text-slate-300">Turno partido</label>
          </div>
        </>
      );
    case 'VEHICULO_FUERA_DE_SERVICIO':
      return (
        <>
          {campo('Número de coche', 'cocheNumero')}
          {campo('Línea afectada', 'lineaId')}
          {campo('Horas estimadas fuera de servicio', 'horasEstimadas', 'number')}
          {select('Motivo', 'motivoVehiculo', [
            { value: 'averia', label: 'Avería no planificada' },
            { value: 'mantenimiento_preventivo', label: 'Mantenimiento preventivo' },
            { value: 'accidente', label: 'Accidente' },
            { value: 'inspeccion_tecnica', label: 'Inspección técnica' },
          ])}
        </>
      );
    case 'VIAJE_TARDIO':
      return (
        <>
          {campo('Línea', 'lineaId')}
          {campo('Minutos de retraso', 'minutosRetraso', 'number')}
          {select('Causa', 'causaViaje', [
            { value: 'trafico', label: 'Tráfico' },
            { value: 'incidente', label: 'Incidente en ruta' },
            { value: 'carga_pasajeros', label: 'Carga de pasajeros' },
            { value: 'conductor', label: 'Atribuible al conductor' },
            { value: 'vehiculo', label: 'Falla del vehículo' },
            { value: 'desconocida', label: 'Causa desconocida' },
          ])}
        </>
      );
    case 'VIAJE_CANCELADO':
      return (
        <>
          {campo('Línea', 'lineaId')}
          {campo('Km perdidos', 'kmPerdidos', 'number')}
          {campo('Causa', 'causaViaje')}
        </>
      );
    default:
      return null;
  }
}
