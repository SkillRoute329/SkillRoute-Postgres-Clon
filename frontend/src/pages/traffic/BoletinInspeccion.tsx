/**
 * BoletinInspeccion — Matriz de inspección oficial UCOT
 * Muestra los horarios de cada servicio en cada parada de control.
 * Usado por inspectores en calle para verificar puntualidad.
 */
import { useState, useEffect, useRef } from 'react';
import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';
import { FileText, RefreshCw, ChevronDown, Sun, Sunrise, Sunset, Moon, Search, ArrowLeftRight, Building2 } from 'lucide-react';

interface PaseServicio {
  servicio: string;
  horarios: Record<string, string>;
}

interface BoletinData {
  linea: string;
  direccion: string;
  paradas: string[];
  pases: PaseServicio[];
  totalPases: number;
  temporada?: string;
}

type Temporada = 'invierno' | 'verano';

const LINEAS = [
  '300', '306', '316', '317', '328', '329', '330',
  '370', '371', '379', '396', '221',
  'L-12', 'L-13', 'L-31', 'L-32', 'L-33',
  'CE1', 'DM1', 'XA1', 'XA2',
];

function horaAMinutos(h: string): number {
  if (!h || h.includes('----') || h.length < 4) return -1;
  const [hh, mm] = h.split(':').map(Number);
  return (hh || 0) * 60 + (mm || 0);
}

function franjaHora(hora: string): string {
  const m = horaAMinutos(hora);
  if (m < 0) return 'sin';
  if (m < 6 * 60) return 'madrugada';
  if (m < 9 * 60) return 'manana';
  if (m < 13 * 60) return 'mediodia';
  if (m < 18 * 60) return 'tarde';
  if (m < 21 * 60) return 'noche';
  return 'nocturna';
}

const FRANJA_STYLE: Record<string, string> = {
  madrugada: 'text-violet-300',
  manana: 'text-amber-300',
  mediodia: 'text-yellow-300',
  tarde: 'text-orange-300',
  noche: 'text-sky-300',
  nocturna: 'text-indigo-300',
  sin: 'text-slate-600',
};

const FRANJA_ICON: Record<string, React.ReactNode> = {
  madrugada: <Moon className="w-3 h-3" />,
  manana: <Sunrise className="w-3 h-3" />,
  mediodia: <Sun className="w-3 h-3" />,
  tarde: <Sun className="w-3 h-3 text-orange-400" />,
  noche: <Sunset className="w-3 h-3" />,
  nocturna: <Moon className="w-3 h-3 text-indigo-400" />,
};

export default function BoletinInspeccion() {
  const { empresaPropia, setEmpresaPropia, empresaCfg } = useEmpresaPropia();
  const [linea, setLinea] = useState('300');
  const [direccion, setDireccion] = useState<'a' | 'b'>('a');
  const [temporada, setTemporada] = useState<Temporada>('invierno');
  const [boletin, setBoletin] = useState<BoletinData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [franjaFiltro, setFranjaFiltro] = useState('');
  const tableRef = useRef<HTMLDivElement>(null);

  const fetchBoletin = async () => {
    setLoading(true);
    setError('');
    setBoletin(null);
    const endpoint = temporada === 'verano'
      ? `/api/boletin-verano/${linea}${direccion}`
      : `/api/boletin/${linea}${direccion}`;
    try {
      const res = await fetch(endpoint);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setBoletin(data.boletin);
    } catch (e: any) {
      setError(e.message || 'Error al cargar boletín');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBoletin();
  }, []);

  const pasesFiltrados = (boletin?.pases ?? []).filter(p => {
    if (busqueda && !p.servicio.includes(busqueda)) return false;
    if (franjaFiltro) {
      const primeraHora = Object.values(p.horarios).find(h => h && !h.includes('----'));
      if (!primeraHora || franjaHora(primeraHora) !== franjaFiltro) return false;
    }
    return true;
  });

  const paradas = boletin?.paradas ?? [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <FileText className="w-7 h-7 text-emerald-400" />
          Boletín de Inspección — {empresaCfg.label}
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Matriz de horarios oficial {empresaCfg.label} por parada de control. Para uso de inspectores en calle.
        </p>
      <div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-slate-400" /><select value={empresaPropia} onChange={(e) => setEmpresaPropia(Number(e.target.value))} className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white" title="Operador propio"><option value={70}>UCOT</option><option value={50}>CUTCSA</option><option value={20}>COME</option><option value={10}>COETC</option></select></div>
      </div>

      {/* Controles */}
      <div className="flex flex-wrap gap-3 mb-6">
        {/* Temporada */}
        <div className="flex rounded-xl overflow-hidden border border-slate-700 text-sm">
          <button
            onClick={() => setTemporada('invierno')}
            className={`px-4 py-2 transition-colors ${temporada === 'invierno' ? 'bg-primary-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'}`}
          >
            Invierno 2026
          </button>
          <button
            onClick={() => setTemporada('verano')}
            className={`px-4 py-2 transition-colors ${temporada === 'verano' ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'}`}
          >
            Verano 2026
          </button>
        </div>

        {/* Línea */}
        <div className="relative">
          <select
            value={linea}
            onChange={e => setLinea(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-xl pl-4 pr-8 py-2 text-sm text-white focus:outline-none appearance-none"
          >
            {LINEAS.map(l => <option key={l} value={l}>Línea {l}</option>)}
          </select>
          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* Dirección */}
        <div className="flex rounded-xl overflow-hidden border border-slate-700 text-sm">
          <button
            onClick={() => setDireccion('a')}
            className={`px-4 py-2 transition-colors ${direccion === 'a' ? 'bg-slate-700 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'}`}
          >
            → Sentido A
          </button>
          <button
            onClick={() => setDireccion('b')}
            className={`px-4 py-2 transition-colors ${direccion === 'b' ? 'bg-slate-700 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'}`}
          >
            ← Sentido B
          </button>
        </div>

        <button
          onClick={fetchBoletin}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 rounded-xl text-sm font-medium transition-colors"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Cargar
        </button>
      </div>

      {/* Filtros secundarios */}
      {boletin && (
        <div className="flex flex-wrap gap-3 mb-5">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              placeholder="Buscar servicio..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="bg-transparent text-white text-sm w-32 focus:outline-none placeholder:text-slate-500"
            />
          </div>

          <div className="flex gap-1 flex-wrap">
            {['', 'madrugada', 'manana', 'mediodia', 'tarde', 'noche', 'nocturna'].map(f => (
              <button
                key={f}
                onClick={() => setFranjaFiltro(f)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                  franjaFiltro === f
                    ? 'bg-slate-700 text-white'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {f ? FRANJA_ICON[f] : null}
                {f || 'Todas'}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2 text-xs text-slate-400">
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>{pasesFiltrados.length} de {boletin.totalPases} servicios · {paradas.length} paradas</span>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl border border-red-600/40 bg-red-950/20 text-red-400 text-sm mb-5">
          {error.includes('encontrada') || error.includes('404')
            ? `Sin boletín cargado para línea ${linea}${direccion} (temporada ${temporada}). Solicitá al equipo de planificación que cargue el archivo oficial.`
            : error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-8 h-8 animate-spin text-emerald-400" />
        </div>
      )}

      {/* Tabla de inspección */}
      {!loading && boletin && paradas.length > 0 && (
        <div ref={tableRef} className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="text-xs border-collapse min-w-full">
            <thead>
              <tr className="bg-slate-900/80">
                <th className="sticky left-0 z-10 bg-slate-900 px-3 py-3 text-left text-slate-300 font-semibold border-r border-slate-800 min-w-[80px]">
                  Servicio
                </th>
                {paradas.map((p, i) => (
                  <th key={i} className="px-2 py-3 text-slate-400 font-medium whitespace-nowrap border-r border-slate-800/50 min-w-[90px] text-center">
                    <span className="block text-[10px] leading-tight">{p}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pasesFiltrados.map((pase, idx) => {
                const primeraHora = Object.values(pase.horarios).find(h => h && !h.includes('----') && h.includes(':'));
                const franja = primeraHora ? franjaHora(primeraHora) : 'sin';
                return (
                  <tr key={`${pase.servicio}-${idx}`} className={`border-b border-slate-800/40 hover:bg-slate-900/40 ${idx % 2 === 0 ? '' : 'bg-slate-900/20'}`}>
                    <td className="sticky left-0 z-10 bg-slate-950 border-r border-slate-800 px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`${FRANJA_STYLE[franja]} flex-shrink-0`}>{FRANJA_ICON[franja]}</span>
                        <span className="font-mono font-bold text-white">{pase.servicio}</span>
                      </div>
                    </td>
                    {paradas.map((p, i) => {
                      const hora = pase.horarios[p];
                      const esHora = hora && hora.includes(':');
                      const frColor = esHora ? FRANJA_STYLE[franjaHora(hora)] : 'text-slate-600';
                      return (
                        <td key={i} className="px-2 py-2 text-center border-r border-slate-800/30">
                          {hora && hora !== '----' ? (
                            <span className={`font-mono ${esHora ? frColor : 'text-slate-500 italic text-[10px]'}`}>
                              {hora}
                            </span>
                          ) : (
                            <span className="text-slate-800">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Leyenda */}
      {boletin && (
        <div className="mt-5 flex flex-wrap gap-4 text-xs text-slate-500">
          {Object.entries(FRANJA_STYLE).filter(([k]) => k !== 'sin').map(([franja, cls]) => (
            <span key={franja} className={`flex items-center gap-1 ${cls}`}>
              {FRANJA_ICON[franja]}
              {franja.charAt(0).toUpperCase() + franja.slice(1)}
            </span>
          ))}
          <span className="ml-auto text-slate-600">
            Temporada {boletin.temporada || temporada} · Línea {boletin.linea}{boletin.direccion.toUpperCase()}
          </span>
        </div>
      )}
    </div>
  );
}
