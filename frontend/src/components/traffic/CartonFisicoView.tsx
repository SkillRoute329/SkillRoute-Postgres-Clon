/**
 * Cartón Espejo 1:1 – Fidelidad absoluta al cartón real UCOT.
 * Estilo: fondo blanco, bordes negros finos (papel/Excel).
 * Cabezales: paradas (Puntos de Control) en vertical en la parte superior.
 * Alertas: filas de texto completo ("SACA COCHE A LA HORA...", "EXPRESO A GUARDAR...") que interrumpen la cuadrícula.
 * Resaltado: celdas amarillas para cambios de estado ("Cva. Tab.") o avisos de terminal.
 */
import { useMemo } from 'react';

const RE_ALERTA_FILA =
  /^(SACA COCHE|EXPRESO A|AVISO|CAMBIO|ATENCIÓN|RELEVO|GUARDAR|TERMINAL|EN CASO DE PARAR)/i;
const RE_CELDA_AMARILLA = /(Cva\.\s*Tab\.|Terminal|Corte|Espera|Relevo)/i;

export type CartonFisicoData = {
  id: string;
  linea: string;
  servicio: string;
  cabeceras: string[];
  grilla: string[][];
  notasCabecera: string[];
  notasPie: string[];
  sheetName?: string;
  totalHoras?: string;
  esperas?: string;
  turno1?: string;
  turno2?: string;
  kilometros?: string;
};

type CartonFisicoViewProps = {
  /** Datos del cartón físico (cartones_completados). Si se pasa, se usa este modo Espejo. */
  cartonFisico?: CartonFisicoData | null;
  /** Modo legacy: cartón desde service_definitions (headers + rawMatrix). */
  carton?: {
    id: string;
    linea: string;
    serviceNumber?: string;
    headers?: Array<{ id: string; location?: string }>;
    rawMatrix?: Array<{ checkpoints: string[] }>;
    instruccionesEspeciales?: string;
  } | null;
  onSaveParadas?: (
    cartonDocId: string,
    paradas: Array<{ nombre: string; tiempos?: string[] }>,
  ) => void;
};

function isAlertRow(cells: string[]): boolean {
  const text = cells.join(' ').trim();
  if (text.length < 10) return false;
  if (cells.filter((v) => /^\d{1,2}[:.]\d{2}$/.test(v)).length >= 2) return false;
  return RE_ALERTA_FILA.test(text);
}

function cellNeedsYellow(value: string): boolean {
  return RE_CELDA_AMARILLA.test(value);
}

export default function CartonFisicoView({
  cartonFisico,
  carton,
  onSaveParadas,
}: CartonFisicoViewProps) {
  const esFisico = Boolean(cartonFisico?.cabeceras?.length);

  const {
    cabeceras,
    grilla,
    notasCabecera,
    notasPie,
    totalHoras,
    esperas,
    turno1,
    turno2,
    kilometros,
  } = useMemo(() => {
    if (cartonFisico) {
      return {
        cabeceras: cartonFisico.cabeceras || [],
        grilla: cartonFisico.grilla || [],
        notasCabecera: cartonFisico.notasCabecera || [],
        notasPie: cartonFisico.notasPie || [],
        totalHoras: cartonFisico.totalHoras,
        esperas: cartonFisico.esperas,
        turno1: cartonFisico.turno1,
        turno2: cartonFisico.turno2,
        kilometros: cartonFisico.kilometros,
      };
    }
    const headers = carton?.headers ?? [];
    const rows = carton?.rawMatrix ?? [];
    return {
      cabeceras: headers.map((h) => h.location ?? h.id),
      grilla: rows.map((r) => r.checkpoints ?? []),
      notasCabecera: [],
      notasPie: [],
      totalHoras: undefined,
      esperas: undefined,
      turno1: undefined,
      turno2: undefined,
      kilometros: undefined,
    };
  }, [cartonFisico, carton]);

  const displayLinea = cartonFisico?.linea ?? carton?.linea ?? '';
  const displayServicio = cartonFisico?.servicio ?? carton?.serviceNumber ?? carton?.id ?? '';

  if (!esFisico && !carton) return null;

  return (
    <div
      className="relative overflow-hidden max-w-full mx-auto shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-800/90 text-gray-100 font-sans backdrop-blur-md"
      style={{ minWidth: '320px' }}
      data-testid="carton-fisico-view"
    >
      {/* Decorative blobs for glassmorphism */}
      <div className="absolute -top-10 -left-10 w-40 h-40 bg-blue-500 rounded-full mix-blend-overlay filter blur-[50px] opacity-30 pointer-events-none" />
      <div className="absolute top-20 -right-10 w-40 h-40 bg-teal-400 rounded-full mix-blend-overlay filter blur-[50px] opacity-20 pointer-events-none" />

      <div className="relative z-10 w-full">
        {/* Instrucciones / avisos de cabecera */}
        {carton?.instruccionesEspeciales && (
          <div className="px-4 py-2 border-b border-white/10 bg-amber-500/20 text-amber-200 text-sm font-semibold flex items-center justify-center gap-2 backdrop-blur-sm shadow-inner">
            <span>⚠️</span> {carton.instruccionesEspeciales}
          </div>
        )}
        {notasCabecera.length > 0 && (
          <div className="px-4 py-3 border-b border-white/10 text-sm bg-gray-900/40">
            {notasCabecera.map((line, i) => (
              <div key={i} className="border-b border-white/5 last:border-0 py-1 text-gray-300">
                {line}
              </div>
            ))}
          </div>
        )}

        {/* Título Línea / Servicio */}
        <header className="px-5 py-4 border-b border-white/20 flex justify-between items-center bg-gray-900/60 shadow-md">
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-widest text-blue-400 font-bold mb-0.5">
              Línea Oficial STM
            </span>
            <span className="font-extrabold text-2xl text-white tracking-tight drop-shadow-md">
              {displayLinea}
            </span>
          </div>
          <div className="flex flex-col text-right">
            <span className="text-xs uppercase tracking-widest text-teal-400 font-bold mb-0.5">
              Servicio
            </span>
            <span className="text-xl font-bold bg-white/10 px-3 py-1 rounded-lg border border-white/10 backdrop-blur-sm text-gray-100">
              {displayServicio}
            </span>
          </div>
        </header>

        {/* Cuadrícula */}
        <div className="overflow-x-auto scroller-glass pb-2">
          <table className="w-full border-collapse text-sm" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th className="w-12 min-w-[3rem] border-b border-r border-white/10 bg-gray-800/50 p-2 align-bottom font-bold text-xs text-center uppercase tracking-wider text-gray-400">
                  Sec
                </th>
                {cabeceras.map((c, i) => (
                  <th
                    key={i}
                    className="border-b border-white/10 p-2 align-bottom bg-gray-800/50 font-semibold text-xs whitespace-nowrap text-blue-100 relative group"
                    style={{
                      minWidth: '2.5rem',
                      maxWidth: '4rem',
                      height: '5rem',
                      verticalAlign: 'bottom',
                    }}
                    title={c}
                  >
                    <span
                      className="inline-block origin-left whitespace-nowrap transition-colors duration-300 group-hover:text-cyan-300 drop-shadow-sm"
                      style={{
                        transformOrigin: 'left bottom',
                        width: '4rem',
                        textAlign: 'left',
                        transform: 'rotate(-65deg) translateX(-10px)',
                      }}
                    >
                      {c || `P${i + 1}`}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grilla.map((fila, rIdx) => {
                if (isAlertRow(fila)) {
                  return (
                    <tr key={rIdx} className="hover:bg-white/5 transition-colors">
                      <td
                        colSpan={(cabeceras.length || 1) + 1}
                        className="border-b border-white/10 px-4 py-2 bg-gradient-to-r from-amber-500/20 to-orange-500/10 text-amber-200 font-semibold text-center text-xs tracking-wide shadow-inner"
                      >
                        {fila.filter(Boolean).join(' ')}
                      </td>
                    </tr>
                  );
                }
                const numCols = Math.max(cabeceras.length, fila.length);
                return (
                  <tr key={rIdx} className="hover:bg-white/5 transition-colors group">
                    <td className="border-b border-r border-white/10 p-1.5 text-center bg-gray-900/40 font-mono text-xs text-gray-500 font-medium group-hover:text-gray-300 transition-colors">
                      {String(rIdx + 1).padStart(2, '0')}
                    </td>
                    {Array.from({ length: numCols }, (_, cIdx) => {
                      const value = fila[cIdx] ?? '—';
                      const yellow = cellNeedsYellow(value);
                      return (
                        <td
                          key={cIdx}
                          className={`border-b border-white/5 p-2 text-center font-mono text-xs transition-colors ${
                            yellow
                              ? 'bg-amber-500/20 text-amber-300 font-bold shadow-[inset_0_0_8px_rgba(245,158,11,0.2)]'
                              : 'text-gray-300 group-hover:bg-white/5'
                          }`}
                        >
                          {value}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pie: Total de Horas, Esperas, 1° / 2° TURNO, Kilómetros y notas al pie */}
        {(totalHoras || esperas || turno1 || turno2 || kilometros || notasPie.length > 0) && (
          <footer className="border-t border-white/20 px-5 py-4 bg-gray-900/80 text-sm shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] backdrop-blur-lg">
            {(totalHoras || esperas || turno1 || turno2 || kilometros) && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3 mb-3 font-medium text-xs uppercase tracking-wider text-gray-400">
                {totalHoras != null && totalHoras !== '' && (
                  <span className="flex flex-col">
                    <span className="text-gray-500 text-[10px]">Total Horas</span>
                    <span className="text-gray-200 font-mono text-sm">{totalHoras}</span>
                  </span>
                )}
                {esperas != null && esperas !== '' && (
                  <span className="flex flex-col">
                    <span className="text-gray-500 text-[10px]">Esperas</span>
                    <span className="text-gray-200 font-mono text-sm">{esperas}</span>
                  </span>
                )}
                {turno1 != null && turno1 !== '' && (
                  <span className="flex flex-col">
                    <span className="text-gray-500 text-[10px]">1° Turno</span>
                    <span className="text-blue-300 font-mono text-sm">{turno1}</span>
                  </span>
                )}
                {turno2 != null && turno2 !== '' && (
                  <span className="flex flex-col">
                    <span className="text-gray-500 text-[10px]">2° Turno</span>
                    <span className="text-teal-300 font-mono text-sm">{turno2}</span>
                  </span>
                )}
                {kilometros != null && kilometros !== '' && (
                  <span className="flex flex-col">
                    <span className="text-gray-500 text-[10px]">Kilómetros</span>
                    <span className="text-gray-200 font-mono text-sm">{kilometros} KM</span>
                  </span>
                )}
              </div>
            )}
            {notasPie.length > 0 && (
              <div className="border-t border-white/10 pt-3 text-gray-400 text-xs mt-2 italic flex flex-col gap-1">
                {notasPie.map((line, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-blue-500 font-bold">•</span> {line}
                  </div>
                ))}
              </div>
            )}
          </footer>
        )}
      </div>
    </div>
  );
}
