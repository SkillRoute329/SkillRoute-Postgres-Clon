import React, { useState } from 'react';
import { apiFetch } from '../../../services/api';

interface Props {
  fecha: string;
  onSuccess: () => void;
}

export const ConsolaCorrelativos: React.FC<Props> = ({ fecha, onSuccess }) => {
  const [internoA, setInternoA] = useState('');
  const [internoB, setInternoB] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!internoA || !internoB) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await apiFetch('/listero/correlativos', {
        method: 'POST',
        body: JSON.stringify({ internoA, internoB, fecha }),
      });

      if (!res.ok) {
        setError(res.error || res.message || 'Error procesando correlativo.');
      } else {
        setSuccess(res.message || 'Correlativo aprobado.');
        setInternoA('');
        setInternoB('');
        onSuccess(); // Refresh data
      }
    } catch (err: any) {
      setError(err.message || 'Error de conexión.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#1e1e1e] border border-gray-700 rounded-lg p-4 mb-4">
      <h3 className="text-white font-semibold mb-3 flex items-center">
        <svg className="w-5 h-5 mr-2 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
        Consola de Correlativos
      </h3>
      <form onSubmit={handleSubmit} className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="block text-xs text-gray-400 mb-1">Chofer que toma (Interno)</label>
          <input
            type="text"
            className="w-full bg-[#2a2a2a] text-white border border-gray-600 rounded px-3 py-1.5 focus:border-blue-500 focus:outline-none"
            placeholder="Ej: 329"
            value={internoA}
            onChange={(e) => setInternoA(e.target.value)}
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-gray-400 mb-1">Turno a cubrir (Interno)</label>
          <input
            type="text"
            className="w-full bg-[#2a2a2a] text-white border border-gray-600 rounded px-3 py-1.5 focus:border-blue-500 focus:outline-none"
            placeholder="Ej: 3017"
            value={internoB}
            onChange={(e) => setInternoB(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={loading || !internoA || !internoB}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded font-medium disabled:opacity-50 transition-colors"
        >
          {loading ? 'Validando...' : 'Cruzar'}
        </button>
      </form>
      
      {error && (
        <div className="mt-3 bg-red-900/30 border border-red-500/50 text-red-200 px-3 py-2 rounded text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mt-3 bg-green-900/30 border border-green-500/50 text-green-200 px-3 py-2 rounded text-sm">
          {success}
        </div>
      )}
    </div>
  );
};
