import React, { useEffect, useState } from 'react';
import {
  getTimetable,
  getProximasSalidasEnParada,
  getCurrentServiceType,
  nowToMinutes,
  type ProximaSalida,
} from '../../../services/gtfsTimetableService';
import { getOtpSummary, type OtpSummary } from '../../../services/otpService';

interface Props {
  agencyId: number;
  linea: string;
  directionId: number;
  stopId: string;
  stopName?: string;
  onClose: () => void;
}

export default function StopSchedulePanel({ agencyId, linea, directionId, stopId, stopName, onClose }: Props) {
  const [proximas, setProximas] = useState<ProximaSalida[]>([]);
  const [loading, setLoading] = useState(true);
  const [otp, setOtp] = useState<OtpSummary | null>(null);
  const [serviceType] = useState(getCurrentServiceType());
  const [refreshed, setRefreshed] = useState(new Date());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getTimetable(String(agencyId), linea, directionId, serviceType),
      getOtpSummary(agencyId, linea),
    ]).then(([tt, otpData]) => {
      if (cancelled) return;
      setOtp(otpData);
      if (!tt) { setProximas([]); setLoading(false); return; }
      const salidas = getProximasSalidasEnParada(tt, stopId, nowToMinutes());
      setProximas(salidas);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [agencyId, linea, directionId, stopId, serviceType, refreshed]);

  const servicioLabel: Record<string, string> = { HABIL: 'Día hábil', SABADO: 'Sábado', DOMINGO: 'Domingo' };

  return (
    <div className="bg-slate-900 border border-slate-700/60 rounded-xl mx-2 mt-2 mb-1 overflow-hidden shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/50 bg-slate-800/60">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-blue-400 text-sm shrink-0">🕐</span>
          <div className="min-w-0">
            <p className="text-white text-sm font-semibold truncate">
              {stopName ?? stopId}
            </p>
            <p className="text-slate-500 text-xs">{servicioLabel[serviceType] ?? serviceType}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setRefreshed(new Date())}
            className="text-slate-400 hover:text-blue-400 p-1 rounded transition-colors"
            title="Actualizar"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        {loading ? (
          <div className="flex items-center gap-2 py-2">
            <div className="w-3 h-3 border border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-slate-400 text-xs">Cargando horarios…</span>
          </div>
        ) : proximas.length === 0 ? (
          <p className="text-slate-500 text-xs py-2">Sin horarios disponibles para esta parada.</p>
        ) : (
          <div className="space-y-1">
            <p className="text-slate-500 text-xs uppercase tracking-widest mb-1.5">
              Próximas salidas
            </p>
            {proximas.map((p, i) => (
              <div
                key={p.hora}
                className={`flex items-center justify-between py-1 px-2 rounded-lg ${
                  i === 0
                    ? 'bg-blue-500/10 border border-blue-500/20'
                    : 'bg-slate-800/40'
                }`}
              >
                <span className={`font-mono text-sm font-bold ${i === 0 ? 'text-blue-300' : 'text-slate-200'}`}>
                  {p.hora}
                </span>
                <span className={`text-xs ${i === 0 ? 'text-blue-400' : 'text-slate-400'}`}>
                  {p.minutosRestantes === 0
                    ? 'Ahora'
                    : p.minutosRestantes === 1
                    ? 'En 1 min'
                    : `En ${p.minutosRestantes} min`}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Badge OTP — puntualidad de la línea en tiempo real */}
        {otp && otp.busesActivos > 0 && (
          <div className="mt-2 pt-2 border-t border-slate-700/40">
            <p className="text-slate-500 text-xs uppercase tracking-widest mb-1">
              Puntualidad ahora · Línea {linea}
            </p>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                otp.pctOnTime >= 80
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : otp.pctOnTime >= 60
                  ? 'bg-yellow-500/15 text-yellow-400'
                  : 'bg-red-500/15 text-red-400'
              }`}>
                {otp.pctOnTime}% a tiempo
              </span>
              <span className="text-slate-500 text-xs">
                {otp.busesActivos} bus{otp.busesActivos !== 1 ? 'es' : ''} activo{otp.busesActivos !== 1 ? 's' : ''}
              </span>
              {otp.retrasoPromedioMin > 0 && (
                <span className="text-orange-400 text-xs">
                  +{otp.retrasoPromedioMin} min prom.
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
