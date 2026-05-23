/**
 * FleetEtaPanel — Panel de próximos arriibos en una parada.
 * Se activa cuando el usuario clickea una parada en el mapa del Radar de Flota.
 * Llama al endpoint /immEta con las líneas activas del sistema.
 */
import { useState, useEffect } from 'react';
import { X, Clock, Bus, MapPin } from 'lucide-react';

interface EtaBus {
  busId:        number;
  company:      string;
  line:         string;
  etaMin:       number;
  distanciaM:   number;
  acceso:       string;
  climatizacion: string;
  emisiones:    string;
}

interface Parada {
  id:     number;
  calle1: string;
  calle2: string;
}

interface Props {
  parada:  Parada | null;
  lineas:  string[];          // líneas activas del sistema (del estado GPS)
  onClose: () => void;
}

const IMM_ETA = import.meta.env.VITE_IMM_ETA_URL || 'http://localhost:3001/api/audit/eta-snapshot';

const EMPRESA_COLORES: Record<string, string> = {
  UCOT: '#eab308', CUTCSA: '#3b82f6', COETC: '#ef4444', COME: '#22c55e',
};

export default function FleetEtaPanel({ parada, lineas, onClose }: Props) {
  const [buses, setBuses]   = useState<EtaBus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!parada || lineas.length === 0) return;

    setLoading(true);
    setError(null);
    setBuses([]);

    // Pasar hasta 30 líneas activas; la API devuelve solo las que pasan por esta parada
    const linesParam = lineas.slice(0, 30).join(',');
    const url = `${IMM_ETA}?busstopId=${parada.id}&amountPerLine=3&lines=${encodeURIComponent(linesParam)}`;

    fetch(url)
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          setBuses(d.buses ?? []);
          if ((d.buses ?? []).length === 0) setError('Sin arriibos próximos en este momento');
        } else {
          setError('Sin información de arribo disponible');
        }
      })
      .catch(() => setError('No se pudo conectar con la API IMM'))
      .finally(() => setLoading(false));
  }, [parada, lineas]);

  if (!parada) return null;

  return (
    <div className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-[1000] bg-slate-900/95 backdrop-blur-sm border border-slate-700 rounded-xl shadow-2xl overflow-hidden">

      {/* Cabecera */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700/50 bg-slate-800/60">
        <div className="flex items-center gap-2 min-w-0">
          <MapPin className="w-3.5 h-3.5 text-blue-400 flex-none" />
          <div className="min-w-0">
            <p className="text-xs font-bold text-white truncate">{parada.calle1}</p>
            <p className="text-[10px] text-slate-400">esq. {parada.calle2} · #{parada.id}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-500 hover:text-white transition-colors flex-none ml-2"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Contenido */}
      <div className="p-3 max-h-60 overflow-y-auto space-y-1.5">

        {loading && (
          <div className="flex items-center justify-center gap-2 text-slate-400 text-xs py-6">
            <Clock className="w-4 h-4 animate-pulse text-blue-400" />
            Consultando próximos arriibos…
          </div>
        )}

        {!loading && error && (
          <p className="text-[11px] text-slate-500 text-center py-4">{error}</p>
        )}

        {!loading && !error && buses.map((b, i) => {
          const color = EMPRESA_COLORES[b.company] ?? '#94a3b8';
          const esProximo = b.etaMin <= 3;
          return (
            <div
              key={i}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 border ${
                esProximo
                  ? 'bg-emerald-900/20 border-emerald-500/30'
                  : 'bg-slate-800/60 border-slate-700/40'
              }`}
            >
              <Bus className="w-3.5 h-3.5 flex-none" style={{ color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-white">L{b.line}</span>
                  <span className="text-[10px]" style={{ color }}>{b.company}</span>
                  {b.acceso === 'PISO BAJO' && (
                    <span className="text-[9px] text-blue-400" title="Piso bajo">♿</span>
                  )}
                  {b.climatizacion && b.climatizacion !== 'SIN DATOS' && (
                    <span className="text-[9px] text-cyan-400" title="Aire acondicionado">❄</span>
                  )}
                  {b.emisiones && b.emisiones !== 'SIN DATOS' && (
                    <span className="text-[9px] text-emerald-400" title="Cero emisiones">⚡</span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500">{b.distanciaM} m</p>
              </div>
              <div className="text-right flex-none">
                <p className={`text-sm font-black ${esProximo ? 'text-emerald-400' : 'text-white'}`}>
                  {b.etaMin === 0 ? '< 1' : b.etaMin} min
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pie */}
      <div className="px-4 py-1.5 border-t border-slate-800 bg-slate-950/40">
        <p className="text-[9px] text-slate-600 text-center">API oficial IMM · Actualiza al reabrir</p>
      </div>
    </div>
  );
}
