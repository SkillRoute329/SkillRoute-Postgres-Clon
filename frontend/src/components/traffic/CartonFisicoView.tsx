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
      className="bg-white text-black overflow-hidden max-w-full mx-auto border-2 border-black shadow-lg"
      style={{ minWidth: '320px' }}
      data-testid="carton-fisico-view"
    >
      {/* Instrucciones / avisos de cabecera (filas de texto completo) */}
      {carton?.instruccionesEspeciales && (
        <div className="px-3 py-2 border-b border-black bg-amber-200 text-black text-sm font-semibold text-center">
          {carton.instruccionesEspeciales}
        </div>
      )}
      {notasCabecera.length > 0 && (
        <div className="px-3 py-2 border-b border-black text-sm">
          {notasCabecera.map((line, i) => (
            <div key={i} className="border-b border-gray-300 last:border-0 py-0.5">
              {line}
            </div>
          ))}
        </div>
      )}

      {/* Título Línea / Servicio */}
      <header className="px-3 py-2 border-b-2 border-black flex justify-between items-center">
        <span className="font-bold text-lg">Línea {displayLinea}</span>
        <span className="text-sm font-medium">Servicio {displayServicio}</span>
      </header>

      {/* Cuadrícula: cabezales verticales (paradas) arriba; en pantalla estrecha rotación tipo cartón real */}
      <div className="overflow-x-auto">
        <table
          className="w-full border-collapse text-sm carton-espejo-table"
          style={{ tableLayout: 'fixed' }}
        >
          <thead>
            <tr>
              <th className="w-10 min-w-[2.5rem] border border-black bg-gray-100 p-1 align-bottom font-bold text-xs">
                #
              </th>
              {cabeceras.map((c, i) => (
                <th
                  key={i}
                  className="border border-black p-1 align-bottom bg-gray-100 font-bold text-xs whitespace-nowrap carton-parada-header"
                  style={{
                    minWidth: '2.5rem',
                    maxWidth: '4rem',
                    height: '4rem',
                    verticalAlign: 'bottom',
                  }}
                  title={c}
                >
                  <span
                    className="inline-block origin-left whitespace-nowrap"
                    style={{
                      transformOrigin: 'left bottom',
                      width: '4rem',
                      textAlign: 'left',
                      transform: 'rotate(-65deg)',
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
                  <tr key={rIdx}>
                    <td
                      colSpan={(cabeceras.length || 1) + 1}
                      className="border border-black px-2 py-1.5 bg-amber-100 text-black font-semibold text-center"
                    >
                      {fila.filter(Boolean).join(' ')}
                    </td>
                  </tr>
                );
              }
              const numCols = Math.max(cabeceras.length, fila.length);
              return (
                <tr key={rIdx}>
                  <td className="border border-black p-1 text-center bg-gray-50 font-mono text-xs w-10">
                    {rIdx + 1}
                  </td>
                  {Array.from({ length: numCols }, (_, cIdx) => {
                    const value = fila[cIdx] ?? '—';
                    const yellow = cellNeedsYellow(value);
                    return (
                      <td
                        key={cIdx}
                        className={`border border-black p-1 text-center font-mono text-xs ${
                          yellow ? 'bg-amber-200 font-semibold' : 'bg-white'
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

      {/* Pie: Total de Horas, Esperas, 1° / 2° TURNO, Kilómetros y todas las notas al pie (Espejo sin omisiones) */}
      {(totalHoras || esperas || turno1 || turno2 || kilometros || notasPie.length > 0) && (
        <footer className="border-t-2 border-black px-3 py-2 bg-gray-100 text-sm">
          {(totalHoras || esperas || turno1 || turno2 || kilometros) && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-2 font-medium">
              {totalHoras != null && totalHoras !== '' && <span>Total de Horas: {totalHoras}</span>}
              {esperas != null && esperas !== '' && <span>Esperas: {esperas}</span>}
              {turno1 != null && turno1 !== '' && <span>1° TURNO: {turno1}</span>}
              {turno2 != null && turno2 !== '' && <span>2° TURNO: {turno2}</span>}
              {kilometros != null && kilometros !== '' && <span>Kilómetros: {kilometros}</span>}
            </div>
          )}
          {notasPie.length > 0 && (
            <div className="border-t border-gray-400 pt-1 text-gray-800">
              {notasPie.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          )}
        </footer>
      )}
    </div>
  );
}
