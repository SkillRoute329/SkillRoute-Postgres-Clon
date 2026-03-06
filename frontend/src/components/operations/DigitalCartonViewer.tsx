import React from 'react';
import type { ServiceCard } from '../../types/transport';

interface Props {
  card: ServiceCard;
}

export const DigitalCartonViewer: React.FC<Props> = ({ card }) => {
  return (
    <div className="bg-white text-black p-4 md:p-8 font-mono text-xs md:text-sm overflow-x-auto shadow-2xl max-w-full print:p-0">
      {/* Header / Title Block */}
      <div className="flex justify-between items-end border-b-2 border-black pb-2 mb-2">
        <div className="text-center w-1/4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Linea</div>
          <div className="text-4xl font-bold text-blue-900">{card.line}</div>
        </div>

        <div className="flex-1 text-center px-4">
          <span className="text-[10px] uppercase text-slate-500">U.C.O.T.</span>
          <div className="bg-green-300 border-2 border-black py-1 px-4 font-bold text-lg md:text-xl uppercase truncate">
            {card.title}
          </div>
        </div>

        <div className="text-center w-1/4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Servicio N°</div>
          <div className="text-4xl font-bold text-black">{card.serviceId}</div>
        </div>
      </div>

      {/* Grid */}
      <table className="w-full border-collapse border-2 border-black">
        <thead>
          <tr>
            {card.columns.map((col, idx) => (
              <th
                key={idx}
                className="border border-black p-1 text-[10px] md:text-xs rotate-180 writing-vertical-lr h-32 bg-slate-50"
              >
                <span className="rotate-90 block">{col}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {card.rows.map((row, rIdx) => (
            <tr
              key={rIdx}
              className={row.isRelief ? 'bg-red-100' : rIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}
            >
              {row.checkpoints.map((time, cIdx) => (
                <td
                  key={cIdx}
                  className={`border border-black text-center p-1 font-bold ${time === '11:54' ? 'border-[3px] border-red-600' : ''}`}
                >
                  {time || '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Footer */}
      {card.footerNotes && (
        <div className="mt-2 border-t-2 border-black pt-1 bg-yellow-200 text-center font-bold text-[10px] md:text-sm p-1">
          {card.footerNotes}
        </div>
      )}

      <div className="mt-4 text-[10px] text-slate-400 text-right">
        Sistema TransForma v2.0 - Copia Fiel Digital
      </div>
    </div>
  );
};
