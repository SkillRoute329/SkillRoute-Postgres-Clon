import { AlertTriangle, Gauge, Bus, MapPin, Layers } from 'lucide-react';
import type { Bloque2Result } from '../../services/diagnosticoEjecutivoService';

interface Props { data: Bloque2Result; }

function OTPBadge({ otp }: { otp: number }) {
  const color = otp < 55 ? 'bg-red-500/20 text-red-300 border-red-500/40'
    : otp < 65 ? 'bg-orange-500/20 text-orange-300 border-orange-500/40'
    : 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40';
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-bold ${color}`}>
      {otp}% OTP
    </span>
  );
}

export default function BloqueInconsistenciasInternas({ data }: Props) {
  if (data.sinDatos) {
    return (
      <p className="text-sm text-slate-400 italic py-4">
        Sin datos suficientes para auditoría interna (mínimo 20 eventos).
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-300 leading-relaxed">{data.conclusion}</p>

      {/* OTP crítico */}
      {data.otpCritico.length > 0 && (
        <div>
          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-orange-400 uppercase tracking-widest mb-2">
            <Gauge className="w-3.5 h-3.5" />
            Líneas con OTP crítico (&lt;65%)
          </h4>
          <div className="bg-orange-500/5 border border-orange-500/20 rounded-lg divide-y divide-slate-800">
            {data.otpCritico.map((l, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-200">
                    L{l.linea} <span className="text-slate-500">{l.sentido}</span>
                  </p>
                  <p className="text-xs text-slate-500">{l.totalPasadas} pasadas registradas</p>
                </div>
                <OTPBadge otp={l.otpPromedio} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Coches anómalos */}
      {data.cochesAnomalos.length > 0 && (
        <div>
          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-red-400 uppercase tracking-widest mb-2">
            <Bus className="w-3.5 h-3.5" />
            Coches con rendimiento anómalo (−20 pts vs línea)
          </h4>
          <div className="bg-red-500/5 border border-red-500/20 rounded-lg divide-y divide-slate-800">
            {data.cochesAnomalos.map((c, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-200">
                    Coche {c.idBus} — L{c.linea}
                  </p>
                  <p className="text-xs text-slate-500">{c.muestras} pasadas · {c.diferencia} pts bajo promedio</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-red-300 font-bold">{c.otpCoche}% coche</p>
                  <p className="text-xs text-slate-500">{c.otpLinea}% línea</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Etapas críticas */}
      {data.etapasCriticas.length > 0 && (
        <div>
          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-yellow-400 uppercase tracking-widest mb-2">
            <MapPin className="w-3.5 h-3.5" />
            Paradas con baja puntualidad (&lt;60%)
          </h4>
          <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg divide-y divide-slate-800">
            {data.etapasCriticas.map((e, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-200">
                    L{e.linea} <span className="text-slate-500">{e.directionId === 0 ? 'IDA' : 'VUELTA'}</span>
                    <span className="text-slate-500 mx-1">—</span>
                    <span className="text-slate-300">{e.nombreParada}</span>
                  </p>
                  <p className="text-xs text-slate-500">{e.totalEventos} pasadas registradas</p>
                </div>
                <span className="text-xs font-bold text-yellow-400">{e.pctEnTiempo}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bunching */}
      {data.bunchingAlertas.length > 0 && (
        <div>
          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-purple-400 uppercase tracking-widest mb-2">
            <Layers className="w-3.5 h-3.5" />
            Bunching detectado (coches operando juntos)
          </h4>
          <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg divide-y divide-slate-800">
            {data.bunchingAlertas.map((b, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-200">
                    L{b.linea} <span className="text-slate-500">{b.sentido}</span>
                    <span className="text-slate-500 mx-1">—</span>
                    coches #{b.coche1} y #{b.coche2}
                  </p>
                  <p className="text-xs text-slate-500">
                    Intervalo: {b.duracionMin} min ·{' '}
                    {new Date(b.ts).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <span className="text-xs font-bold text-purple-400">~{b.duracionMin} min</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.totalDetecciones === 0 && (
        <p className="text-xs text-slate-500 italic">
          No se detectaron inconsistencias internas significativas en el período analizado.
        </p>
      )}
    </div>
  );
}
