// src/components/MobileCartonCard.tsx
import React from 'react';
import type { ServiceDefinitionData } from './DigitalCarton';

interface MobileCartonCardProps {
  data: ServiceDefinitionData;
  onManage?: () => void;
}

export const MobileCartonCard: React.FC<MobileCartonCardProps> = ({ data, onManage }) => {
  return (
    <div className="bg-white/90 backdrop-blur-md shadow-xl rounded-xl p-4 flex flex-col gap-4 border border-slate-200 animate-fade-in-up">
      {/* Header: Line and Start Time */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Línea {data.line}</h2>
        <span className="text-lg font-medium text-slate-600">{data.startTime}</span>
      </div>
      {/* Body: Service title (used as "Coche") and Service number (used as "Chofer" placeholder) */}
      <div className="flex flex-col gap-1 text-slate-700">
        <p className="text-base">
          <strong>Coche:</strong> {data.title}
        </p>
        <p className="text-base">
          <strong>Chofer:</strong> {data.serviceNumber}
        </p>
      </div>
      {/* Action */}
      <button
        onClick={onManage}
        className="w-full bg-primary-600 hover:bg-primary-700 text-white py-2 rounded-lg transition-colors font-semibold"
      >
        Gestionar
      </button>
    </div>
  );
};

export default MobileCartonCard;
