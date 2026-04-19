/**
 * Vista comprensible del chofer: solo DriverTimeline (línea vertical, próximo hito, alerta -X MIN).
 * Sin tablas técnicas. Hora del sistema; sin GPS simulado.
 */
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ProgramacionDiariaService } from '../../services/firestore/programacionDiaria';
import { ServicioEstadoService } from '../../services/firestore/servicioEstado';
import { getMapeoOperativo } from '../../data/ucotMaster2026';
import { getMasterServicioById } from '../../data/ucotMaster';
import { DriverTimeline, type PuntoHito } from '../../components/traffic/DriverTimeline';
import { computeTimelineState } from '../../utils/driverTimelineUtils';
import { LogsIncidenciasService } from '../../services/firestore/logsIncidencias';
import { MensajesInternosService } from '../../services/firestore/mensajesInternos';
import { Calendar, MapPin, AlertTriangle, RefreshCw, CheckCircle, PenTool } from 'lucide-react';
import type { ProgramacionDiariaRecord } from '../../services/firestore/programacionDiaria';

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function formatHora(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Suma minutos a "HH:mm" y devuelve "HH:mm". */
function addMinutes(hora: string, min: number): string {
  const [hh, mm] = hora.split(':').map(Number);
  const total = (hh ?? 0) * 60 + (mm ?? 0) + min;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export default function DriverServiceView() {
  const { user } = useAuth();
  const [programacion, setProgramacion] = useState<ProgramacionDiariaRecord[]>([]);
  const [estadoAtraso, setEstadoAtraso] = useState<number | undefined>(undefined);
  const [horaSistema, setHoraSistema] = useState(formatHora(new Date()));
  const [reportando, setReportando] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const [firmando, setFirmando] = useState(false);

  const today = todayISO();
  const driverId = user?.uid ?? user?.id ?? '';

  useEffect(() => {
    ProgramacionDiariaService.getByDate(today)
      .then((list) => {
        setProgramacion(list.filter((p) => String(p.conductor) === String(driverId)));
      })
      .catch(() => setProgramacion([]));
  }, [today, driverId]);

  const asignacionHoy = programacion[0];
  const servicioId = asignacionHoy?.servicio ?? '';
  const horaInicio = asignacionHoy?.horaInicio ?? '08:00';

  useEffect(() => {
    if (!servicioId) return;
    ServicioEstadoService.getByServicioId(servicioId, today)
      .then((est) => {
        setEstadoAtraso(est?.atrasoMinutos);
      })
      .catch(() => setEstadoAtraso(undefined));
  }, [servicioId, today]);

  useEffect(() => {
    const t = setInterval(() => setHoraSistema(formatHora(new Date())), 30 * 1000);
    return () => clearInterval(t);
  }, []);

  const puntos: PuntoHito[] = useMemo(() => {
    const master = getMasterServicioById(servicioId);
    const mapeo = getMapeoOperativo(servicioId);
    const nombres = master?.puntosControl?.length ? master.puntosControl : (mapeo?.puntos ?? []);
    if (nombres.length === 0) return [];

    const filas = master?.horarios?.[0]?.filas;
    if (filas && filas.length >= nombres.length) {
      return nombres.map((nombre, i) => ({ nombre, hora: filas[i] ?? '--:--' }));
    }
    return nombres.map((nombre, i) => ({
      nombre,
      hora: i === 0 ? horaInicio : addMinutes(horaInicio, i * 25),
    }));
  }, [servicioId, horaInicio]);

  const servicioLabel = asignacionHoy
    ? `${asignacionHoy.linea} – Servicio ${asignacionHoy.servicio}`
    : undefined;

  const ultimoPuntoPasado = useMemo(() => {
    if (puntos.length === 0) return null;
    const state = computeTimelineState(puntos, horaSistema, estadoAtraso);
    if (state.indiceActual >= 0 && puntos[state.indiceActual])
      return puntos[state.indiceActual].nombre;
    return null;
  }, [puntos, horaSistema, estadoAtraso]);

  const handleReportarIncidente = async () => {
    if (!driverId) return;
    setReportando(true);
    try {
      await LogsIncidenciasService.createPrioridadAlta({
        driverId: String(driverId),
        servicioId: asignacionHoy?.servicio,
        ultimoPuntoControl: ultimoPuntoPasado ?? 'No registrado',
        mensaje: 'Incidente reportado desde app chofer',
      });
      alert('Incidente enviado al Listero con Prioridad Alta.');
    } catch (e) {
      console.error(e);
      alert('Error al enviar.');
    } finally {
      setReportando(false);
    }
  };

  const handleSolicitarCambioTurno = async () => {
    if (!driverId) return;
    setCambiando(true);
    try {
      await MensajesInternosService.create({
        fromUserId: String(driverId),
        toUserId: 'listero',
        tipo: 'cambio_turno',
        titulo: 'Solicitud de cambio de turno',
        mensaje: `Chofer solicita cambio de turno. Servicio: ${asignacionHoy?.linea ?? ''} ${asignacionHoy?.servicio ?? ''}. Fecha: ${today}`,
        servicioId: asignacionHoy?.servicio,
        date: today,
      });
      alert('Solicitud enviada al Listero. Verá la alerta en su panel.');
    } catch (e) {
      console.error(e);
      alert('Error al enviar.');
    } finally {
      setCambiando(false);
    }
  };

  const handleFirmarCarton = async () => {
    if (!asignacionHoy?.id) return;
    setFirmando(true);
    try {
      await ProgramacionDiariaService.update(asignacionHoy.id, {
        firmaConductor: true,
        fechaFirma: new Date().toISOString(),
      });
      alert('Cartón firmado exitosamente.');
      // Update local state to reflect the change immediately
      setProgramacion((prev) =>
        prev.map((p) =>
          p.id === asignacionHoy.id
            ? { ...p, firmaConductor: true, fechaFirma: new Date().toISOString() }
            : p,
        ),
      );
    } catch (e) {
      console.error(e);
      alert('Error al firmar cartón.');
    } finally {
      setFirmando(false);
    }
  };

  if (!driverId) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <p className="text-slate-400">Inicie sesión para ver su servicio.</p>
      </div>
    );
  }

  if (!asignacionHoy) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <Calendar className="w-16 h-16 text-slate-600 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Mi servicio hoy</h2>
        <p className="text-slate-400 text-center">
          No tiene asignación para hoy. Consulte con el listero.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 pb-28">
      <div className="max-w-lg mx-auto space-y-5">
        <h1 className="text-2xl font-black flex items-center gap-3 text-white">
          <MapPin className="w-8 h-8 text-emerald-500 shrink-0" aria-hidden />
          Mi servicio hoy
        </h1>
        <DriverTimeline
          puntos={puntos}
          horaActual={horaSistema}
          atrasoMinutos={estadoAtraso}
          servicioLabel={servicioLabel}
        />
        <div className="space-y-3">
          {asignacionHoy?.firmaConductor ? (
            <div className="w-full min-h-[52px] rounded-2xl bg-emerald-900/50 border border-emerald-800 text-emerald-400 font-bold text-sm flex flex-col items-center justify-center p-2">
              <span className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5" />
                Cartón Firmado y Aceptado
              </span>
              <span className="text-xs font-normal opacity-80">
                {asignacionHoy.fechaFirma &&
                  new Date(asignacionHoy.fechaFirma).toLocaleString('es-UY')}
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleFirmarCarton}
              disabled={firmando}
              className="w-full min-h-[52px] rounded-2xl bg-primary-600 hover:bg-primary-500 text-white font-black text-base flex items-center justify-center gap-3 disabled:opacity-50 touch-manipulation shadow-lg shadow-primary-900/20"
            >
              <PenTool className="w-6 h-6 shrink-0" aria-hidden />
              {firmando ? 'Firmando...' : 'Firmar Cartón de Servicio'}
            </button>
          )}

          <button
            type="button"
            onClick={handleReportarIncidente}
            disabled={reportando}
            className="w-full min-h-[52px] rounded-2xl bg-red-600 hover:bg-red-500 text-white font-black text-base flex items-center justify-center gap-3 disabled:opacity-50 touch-manipulation shadow-lg"
          >
            <AlertTriangle className="w-6 h-6 shrink-0" aria-hidden />
            {reportando ? 'Enviando…' : 'Reportar Incidente'}
          </button>
          <button
            type="button"
            onClick={handleSolicitarCambioTurno}
            disabled={cambiando}
            className="w-full min-h-[52px] rounded-2xl bg-amber-600 hover:bg-amber-500 text-white font-black text-base flex items-center justify-center gap-3 disabled:opacity-50 touch-manipulation shadow-lg"
          >
            <RefreshCw className="w-6 h-6 shrink-0" aria-hidden />
            {cambiando ? 'Enviando…' : 'Solicitar Cambio de Turno'}
          </button>
        </div>
      </div>
    </div>
  );
}
