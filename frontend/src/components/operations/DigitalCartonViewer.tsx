import React from 'react';
import type { ServiceCard } from '../../types/transport';

interface Props {
  card: ServiceCard;
}

export const DigitalCartonViewer: React.FC<Props> = ({ card }) => {
  return (
    <div className="relative overflow-hidden p-4 md:p-6 font-sans text-xs md:text-sm shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] rounded-2xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-800/90 max-w-full backdrop-blur-md text-gray-100 print:bg-white print:text-black print:shadow-none print:border-black">
      {/* Decorative background elements */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500 rounded-full mix-blend-overlay filter blur-[60px] opacity-20 pointer-events-none print:hidden" />
      <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-blue-600 rounded-full mix-blend-overlay filter blur-[60px] opacity-20 pointer-events-none print:hidden" />

      <div className="relative z-10 w-full">
        {/* Header / Title Block */}
        <div className="flex justify-between items-end border-b border-white/20 pb-4 mb-4 print:border-black">
          <div className="text-center w-1/4">
            <div className="text-[10px] uppercase tracking-widest text-blue-400 font-bold mb-1 print:text-gray-600">
              Línea Oficial STM
            </div>
            <div className="text-4xl font-extrabold text-white drop-shadow-md print:text-black print:drop-shadow-none">
              {card.line}
            </div>
          </div>

          <div className="flex-1 text-center px-4">
            <span className="text-[10px] uppercase tracking-widest text-teal-400 font-bold print:text-gray-600">
              U.C.O.T.
            </span>
            <div className="bg-green-500/20 border border-green-400/30 text-green-300 py-1.5 px-4 font-bold text-lg md:text-xl uppercase truncate rounded-lg backdrop-blur-sm shadow-inner mt-1 print:bg-green-200 print:border-black print:text-black">
              {card.title}
            </div>
          </div>

          <div className="text-center w-1/4">
            <div className="text-[10px] uppercase tracking-widest text-blue-400 font-bold mb-1 print:text-gray-600">
              Servicio N°
            </div>
            <div className="text-4xl font-bold bg-white/10 px-2 py-0.5 rounded-lg border border-white/10 backdrop-blur-sm inline-block print:bg-transparent print:border-none print:text-black">
              {card.serviceId}
            </div>
          </div>
        </div>

        {/* Grid Container */}
        <div className="overflow-x-auto scroller-glass pb-2">
          <table className="w-full border-collapse border border-white/10 print:border-2 print:border-black">
            <thead>
              <tr>
                {card.columns.map((col, idx) => (
                  <th
                    key={idx}
                    className="border-b border-r border-white/10 p-2 text-[10px] md:text-xs rotate-180 writing-vertical-lr h-32 bg-gray-800/50 text-blue-100 font-semibold tracking-wide print:border-black print:bg-gray-100 print:text-black relative group"
                  >
                    <span className="rotate-90 block transform-origin-center">{col}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {card.rows.map((row, rIdx) => (
                <tr
                  key={rIdx}
                  className={`${
                    row.isRelief
                      ? 'bg-red-500/20 text-red-100'
                      : 'hover:bg-white/5 transition-colors group'
                  } print:bg-white print:text-black`}
                >
                  {row.checkpoints.map((time, cIdx) => (
                    <td
                      key={cIdx}
                      className={`border-b border-r border-white/5 text-center p-2 font-mono text-sm ${
                        time === '11:54'
                          ? 'border-[2px] border-red-500 bg-red-500/20 text-red-200 font-bold shadow-[inset_0_0_8px_rgba(239,68,68,0.3)]'
                          : 'text-gray-300 group-hover:text-white'
                      } print:border-black print:text-black print:shadow-none print:bg-transparent`}
                    >
                      {time || '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {card.footerNotes && (
          <div className="mt-4 border border-amber-500/30 bg-amber-500/10 text-amber-200 text-center font-bold text-xs md:text-sm p-3 rounded-xl backdrop-blur-sm shadow-inner print:border-black print:bg-yellow-200 print:text-black">
            ⚠️ {card.footerNotes}
          </div>
        )}

        <div className="mt-4 flex justify-between items-center text-[10px] text-gray-500 uppercase tracking-widest print:text-gray-400">
          <span>{new Date().toLocaleDateString('es-UY')}</span>
          <span className="font-bold text-teal-500/50 print:text-black">
            Sistema TransForma v2.0 - Edición Oficial
          </span>
        </div>
      </div>
    </div>
  );
};
