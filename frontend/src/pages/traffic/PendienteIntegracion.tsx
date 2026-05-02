import { Lock, Info, Mail } from 'lucide-react';

const EMPRESA_LABEL: Record<string, string> = {
  '70': 'UCOT',
  '50': 'CUTCSA',
  '20': 'COME',
  '10': 'COETC',
};

interface PendienteIntegracionProps {
  empresaId: string;
  nombreModulo: string;
}

export default function PendienteIntegracion({ empresaId, nombreModulo }: PendienteIntegracionProps) {
  const empresa = EMPRESA_LABEL[empresaId] ?? empresaId;

  const handleSolicitar = () => {
    const asunto = encodeURIComponent(`Solicitud integración ${empresa} - SkillRoute`);
    window.open(`mailto:integraciones@skillroute.uy?subject=${asunto}`, '_blank');
  };

  return (
    <div className="flex items-center justify-center min-h-[400px] p-8">
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-8 max-w-md w-full space-y-5">
        {/* Encabezado */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 rounded-lg border border-amber-500/20">
            <Lock className="w-5 h-5 text-amber-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-200">
            Integración pendiente
          </h3>
        </div>

        {/* Descripción principal */}
        <p className="text-slate-400 text-sm leading-relaxed">
          Los <span className="text-slate-200 font-medium">{nombreModulo}</span> de{' '}
          <span className="text-slate-200 font-medium">{empresa}</span> no están
          integrados aún en SkillRoute.
        </p>

        <p className="text-slate-400 text-sm leading-relaxed">
          Esta sección requiere acceso al sistema interno de programación de{' '}
          <span className="text-slate-200 font-medium">{empresa}</span>. Una vez
          integrado, los documentos se mostrarán aquí automáticamente.
        </p>

        {/* Nota informativa */}
        <div className="flex gap-3 bg-blue-500/8 border border-blue-500/15 rounded-lg p-4">
          <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-slate-400 leading-relaxed">
            Los datos GPS e información de red de{' '}
            <span className="text-slate-200 font-medium">{empresa}</span> sí están
            disponibles en las otras secciones del módulo.
          </p>
        </div>

        {/* CTA */}
        <button
          onClick={handleSolicitar}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 rounded-xl px-4 py-2.5 font-semibold text-white text-sm transition-all"
        >
          <Mail className="w-4 h-4" />
          Solicitar integración
        </button>
      </div>
    </div>
  );
}
