import { CheckCircle, AlertTriangle, Info } from 'lucide-react';
import type { Bloque4Result, Recomendacion } from '../../services/diagnosticoEjecutivoService';

interface Props { data: Bloque4Result; }

const PRIORIDAD_CONFIG = {
  alta: {
    label: 'ALTA',
    icon: AlertTriangle,
    containerColor: 'bg-red-500/5 border border-red-500/25',
    badgeColor: 'bg-red-500/20 text-red-300 border border-red-500/30',
    iconColor: 'text-red-400',
  },
  media: {
    label: 'MEDIA',
    icon: Info,
    containerColor: 'bg-orange-500/5 border border-orange-500/20',
    badgeColor: 'bg-orange-500/20 text-orange-300 border border-orange-500/30',
    iconColor: 'text-orange-400',
  },
  baja: {
    label: 'BAJA',
    icon: CheckCircle,
    containerColor: 'bg-slate-800/50 border border-slate-700/50',
    badgeColor: 'bg-slate-700/60 text-slate-400 border border-slate-600/30',
    iconColor: 'text-slate-400',
  },
} as const;

function RecomendacionCard({ r, idx }: { r: Recomendacion; idx: number }) {
  const cfg = PRIORIDAD_CONFIG[r.prioridad];
  const Icon = cfg.icon;
  return (
    <div className={`rounded-lg p-4 ${cfg.containerColor}`}>
      <div className="flex items-start gap-3">
        <div className="pt-0.5 shrink-0">
          <Icon className={`w-4 h-4 ${cfg.iconColor}`} />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-500 text-xs font-bold">{idx + 1}.</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cfg.badgeColor}`}>
              {cfg.label}
            </span>
            <p className="text-sm font-semibold text-slate-100">{r.titulo}</p>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">{r.razon}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span className="text-xs text-blue-400">
              Impacto: {r.impactoEstimado}
            </span>
            <span className="text-xs text-slate-500">
              Plazo: {r.plazo}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BloqueRecomendaciones({ data }: Props) {
  if (data.recomendaciones.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <CheckCircle className="w-10 h-10 text-emerald-400/40" />
        <p className="text-sm text-slate-400">{data.conclusion}</p>
      </div>
    );
  }

  const altas = data.recomendaciones.filter(r => r.prioridad === 'alta');
  const medias = data.recomendaciones.filter(r => r.prioridad === 'media');
  const bajas = data.recomendaciones.filter(r => r.prioridad === 'baja');

  let globalIdx = 0;

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-300 leading-relaxed">{data.conclusion}</p>

      {altas.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-red-400 uppercase tracking-widest">
            Prioridad alta ({altas.length})
          </h4>
          {altas.map(r => <RecomendacionCard key={globalIdx} r={r} idx={globalIdx++} />)}
        </div>
      )}

      {medias.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-orange-400 uppercase tracking-widest">
            Prioridad media ({medias.length})
          </h4>
          {medias.map(r => <RecomendacionCard key={globalIdx} r={r} idx={globalIdx++} />)}
        </div>
      )}

      {bajas.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
            Prioridad baja ({bajas.length})
          </h4>
          {bajas.map(r => <RecomendacionCard key={globalIdx} r={r} idx={globalIdx++} />)}
        </div>
      )}
    </div>
  );
}
