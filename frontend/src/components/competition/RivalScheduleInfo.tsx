/**
 * RivalScheduleInfo — Lee la colección Firestore `competidores` y muestra
 * los horarios reales (cuando están enriquecidos) de las empresas rivales
 * detectadas en el análisis competitivo.
 *
 * Se alimenta de:
 *   - Cron `refreshCompetidoresTick` (cada 10min): identidad + buses activos
 *   - Endpoint manual `POST /api/competition/enrich-horarios/:competidorId`:
 *     scrape JSF de horarios reales por línea (operación pesada, opt-in).
 *
 * Si los horarios no están enriquecidos, muestra solo el conteo de buses
 * activos del último snapshot. Si el doc del competidor no existe aún,
 * el widget no se renderiza (no rompe la página).
 */

import { useEffect, useState } from 'react';
import { Calendar, Clock, AlertCircle } from 'lucide-react';
import { doc, getDoc } from '../../config/firestoreShim';
import { db } from '../../config/firebase';

interface HorarioBlock {
  origen?: string;
  destino?: string;
  horaInicio?: string;
  horaFin?: string;
  frecuenciaMinutos?: number;
  totalSalidas?: number;
}

interface LineaRival {
  numeroLineaTexto?: string;
  numeroLinea?: number;
  operador?: string;
  frecuencia?: number;
  horarios?: HorarioBlock[];
  busesActivosUltimoSnapshot?: number;
  destinos?: string[];
}

interface CompetidorDoc {
  id?: string;
  nombre?: string;
  lineas?: LineaRival[];
  ultimaActualizacion?: { toDate?: () => Date } | Date;
  ultimaEnrichmentHorarios?: { toDate?: () => Date } | Date;
}

export interface RivalRef {
  empresa: number | string;
  linea: string | null;
}

function uniqueRivals(refs: RivalRef[]): RivalRef[] {
  const seen = new Set<string>();
  const out: RivalRef[] = [];
  for (const r of refs) {
    if (!r.linea) continue;
    const key = `${r.empresa}:${r.linea}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function tsToDate(v: CompetidorDoc['ultimaActualizacion']): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof (v as any).toDate === 'function') return (v as any).toDate();
  return null;
}

interface RivalRow {
  empresa: number | string;
  numeroLinea: string;
  operador: string;
  frecuencia: number;
  horarios: HorarioBlock[];
  busesActivos: number;
  destinos: string[];
  enriched: boolean;
}

export default function RivalScheduleInfo({ rivals }: { rivals: RivalRef[] }) {
  const [rows, setRows] = useState<RivalRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hadError, setHadError] = useState(false);

  useEffect(() => {
    const refs = uniqueRivals(rivals);
    if (refs.length === 0) {
      setRows([]);
      return;
    }

    setLoading(true);
    setHadError(false);

    const empresasUnicas = Array.from(new Set(refs.map((r) => String(r.empresa))));

    (async () => {
      try {
        const docs = await Promise.all(
          empresasUnicas.map(async (codigo) => {
            try {
              const snap = await getDoc(doc(db, 'competidores', `emp-${codigo}`));
              return { codigo, data: snap.exists() ? (snap.data() as CompetidorDoc) : null };
            } catch {
              return { codigo, data: null };
            }
          })
        );

        const byCodigo = new Map<string, CompetidorDoc | null>();
        for (const d of docs) byCodigo.set(d.codigo, d.data);

        const next: RivalRow[] = [];
        for (const r of refs) {
          const data = byCodigo.get(String(r.empresa));
          if (!data) continue;
          const lineas = data.lineas ?? [];
          const linea = lineas.find(
            (l) =>
              l.numeroLineaTexto === r.linea ||
              String(l.numeroLinea) === r.linea
          );
          if (!linea) continue;
          next.push({
            empresa: r.empresa,
            numeroLinea: r.linea!,
            operador: linea.operador ?? data.nombre ?? `Empresa ${r.empresa}`,
            frecuencia: linea.frecuencia ?? 0,
            horarios: Array.isArray(linea.horarios) ? linea.horarios : [],
            busesActivos: linea.busesActivosUltimoSnapshot ?? 0,
            destinos: Array.isArray(linea.destinos) ? linea.destinos : [],
            enriched:
              !!linea.frecuencia ||
              (Array.isArray(linea.horarios) && linea.horarios.length > 0),
          });
        }
        setRows(next);
      } catch (err) {
        console.warn('[RivalScheduleInfo] Error leyendo competidores:', err);
        setHadError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [rivals]);

  if (loading) {
    return (
      <div className="space-y-2">
        <div className="h-3 w-40 bg-slate-700/60 rounded animate-pulse" />
        <div className="h-12 rounded-lg bg-slate-800/50 animate-pulse" />
      </div>
    );
  }

  if (hadError) {
    return (
      <div className="text-[10px] text-slate-500 flex items-center gap-1">
        <AlertCircle className="w-3 h-3" />
        No se pudo leer info adicional del rival (Firestore).
      </div>
    );
  }

  if (rows.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
        <Calendar className="w-3.5 h-3.5" />
        Horario rival (datos reales)
      </h3>
      {rows.map((r, i) => {
        const principal = r.horarios[0];
        return (
          <div
            key={`${r.empresa}-${r.numeroLinea}-${i}`}
            className="bg-slate-800/40 border border-slate-700/40 rounded-lg p-3 text-xs"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-bold text-white">
                {r.operador} · Línea {r.numeroLinea}
              </span>
              <span className="text-[10px] text-slate-500">
                {r.busesActivos} bus{r.busesActivos !== 1 ? 'es' : ''} activo
                {r.busesActivos !== 1 ? 's' : ''}
              </span>
            </div>

            {r.enriched ? (
              <>
                {principal && (
                  <div className="flex items-center gap-2 text-slate-300">
                    <Clock className="w-3 h-3 text-slate-500" />
                    <span className="truncate">
                      {principal.horaInicio ?? '—'} → {principal.horaFin ?? '—'}
                    </span>
                    {r.frecuencia > 0 && (
                      <span className="ml-auto text-emerald-400 font-bold">
                        cada {r.frecuencia} min
                      </span>
                    )}
                  </div>
                )}
                {principal?.origen && principal?.destino && (
                  <p className="text-[10px] text-slate-500 mt-1 truncate">
                    {principal.origen} → {principal.destino}
                    {principal.totalSalidas
                      ? ` · ${principal.totalSalidas} salidas/día`
                      : ''}
                  </p>
                )}
                {r.horarios.length > 1 && (
                  <p className="text-[10px] text-slate-600 mt-1">
                    + {r.horarios.length - 1} variante{r.horarios.length - 1 !== 1 ? 's' : ''} adicional{r.horarios.length - 1 !== 1 ? 'es' : ''}
                  </p>
                )}
              </>
            ) : (
              <p className="text-[10px] text-slate-500 italic">
                Horarios aún no enriquecidos. Disparar
                <code className="mx-1 text-slate-400">
                  POST /api/competition/enrich-horarios/emp-{r.empresa}
                </code>
                (admin) para scraping JSF.
              </p>
            )}

            {r.destinos.length > 0 && !r.enriched && (
              <p className="text-[10px] text-slate-500 mt-1 truncate">
                Destinos vistos: {r.destinos.slice(0, 3).join(' · ')}
                {r.destinos.length > 3 ? ` +${r.destinos.length - 3}` : ''}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
