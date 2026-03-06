import type { CartonFisicoDoc } from '../services/firestoreUCOT';
import clsx from 'clsx';

interface CartonGridProps {
  carton: CartonFisicoDoc;
  className?: string;
}

// Helper to format time strings from Excel raw values if needed
const formatTime = (val: any): string => {
  if (!val) return '';
  const str = String(val);
  if (str.includes(':')) return str;
  if (!isNaN(Number(str)) && Number(str) > 0 && Number(str) < 1) {
    const totalMinutes = Math.round(Number(str) * 24 * 60);
    const h = Math.floor(totalMinutes / 60) % 24;
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  return str;
};

export default function CartonGrid({ carton, className = '' }: CartonGridProps) {
  const paradas = carton.paradas || [];
  const viajes = carton.viajes || [];
  const numCols = Math.max(paradas.length, ...viajes.map((v) => v.tiempos?.length ?? 0));

  return (
    <div
      className={clsx(
        'w-full bg-white text-black p-6 rounded-sm shadow-2xl border-[1px] border-black/10 overflow-auto',
        'font-sans',
        className,
      )}
      style={{
        backgroundImage:
          'linear-gradient(#f1f5f9 1px, transparent 1px), linear-gradient(90deg, #f1f5f9 1px, transparent 1px)',
        backgroundSize: '20px 20px',
        minHeight: '600px',
      }}
    >
      {/* Physical Header Style */}
      <div className="flex justify-between items-end border-b-[3px] border-black pb-4 mb-6">
        <div className="text-center w-32">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
            LÍNEA
          </p>
          <p className="text-4xl font-black">{carton.linea || '---'}</p>
        </div>
        <div className="flex-1 text-center">
          <h2 className="text-xs font-bold tracking-[0.2em] text-slate-400 uppercase mb-1">
            U.C.O.T.
          </h2>
          <div className="inline-block border-[2px] border-black py-2 px-6 font-black text-xl uppercase transform -rotate-1 bg-[#f8fafc]">
            PLANILLA DE SERVICIO
          </div>
        </div>
        <div className="text-center w-32">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
            SERVICIO N°
          </p>
          <p className="text-4xl font-black">{carton.servicio || '---'}</p>
        </div>
      </div>

      {carton.notasCabecera?.length > 0 && (
        <div className="mb-4 p-3 border-2 border-black/10 bg-blue-50/30 font-bold text-xs uppercase tracking-tight italic">
          {carton.notasCabecera.join(' | ')}
        </div>
      )}

      <div className="border-[2px] border-black overflow-hidden bg-white">
        <table className="w-full text-center border-collapse table-fixed">
          <thead>
            <tr className="bg-white">
              <th className="border-r border-black p-1 bg-slate-50 w-10 text-[10px] font-bold">
                #
              </th>
              {Array.from({ length: numCols }, (_, i) => (
                <th
                  key={i}
                  className="border-r border-black p-1 bg-white align-bottom h-32 w-12 relative"
                >
                  <div className="h-full w-full flex items-end justify-center pb-2">
                    <div className="[writing-mode:vertical-rl] transform rotate-180 whitespace-nowrap text-left font-bold text-[10px] h-28 w-4">
                      {paradas[i] || `Punto ${i + 1}`}
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {viajes.map((viaje, rIdx) => (
              <tr key={rIdx} className="h-8 border-t border-black">
                <td className="border-r border-black bg-slate-50 text-[10px] font-bold text-slate-400">
                  {viaje.fila ?? rIdx + 1}
                </td>
                {Array.from({ length: numCols }, (_, cIdx) => (
                  <td
                    key={cIdx}
                    className="border-r border-black p-1 font-bold text-[12px] whitespace-nowrap"
                  >
                    {formatTime(viaje.tiempos?.[cIdx]) || '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {carton.notasPie?.length > 0 && (
        <div className="mt-6 p-4 border-t-2 border-dotted border-slate-300">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2">
            Observaciones del Servicio
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {carton.notasPie.map((nota, i) => (
              <div
                key={i}
                className="text-xs font-medium text-slate-700 hover:text-black transition-colors"
              >
                • {nota}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
