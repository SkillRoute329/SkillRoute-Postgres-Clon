import { AlertTriangle, Gauge, Bus } from 'lucide-react';
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

      {/* Sin datos de etapas */}
      {data.etapasSinDatos && (
        <div className="flex items-center gap-2 text-xs text-slate-500 italic border border-slate-800 rounded-lg px-4 py-3">
          <AlertTriangle className="w-3.5 h-3.5 text-slate-600 shrink-0" />
          Análisis por etapa (desvío parada a parada) pendiente — colección etapa_stats sin datos.
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
