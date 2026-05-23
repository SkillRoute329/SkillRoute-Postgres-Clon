/**
 * InformeAccionableLineas — el INFORME línea por línea que IMM pidió.
 *
 * Cada línea: identidad (nombre/destino), venta de boletos precisa mes a
 * mes, hora pico, horario programado, competidor real con su horario,
 * servicio/cartón UCOT que la cubre y la ACCIÓN concreta a tomar.
 * Redactado para que un decisor sin contexto técnico pueda actuar.
 * Pensado también para imprimir (window.print del contenedor padre).
 */
import type { LineaDiagnostico, AuditoriaGlobal } from '../../services/comandoService';
import {
  TrendingDown,
  TrendingUp,
  Minus,
  Bus,
  Clock,
  Swords,
  FileText,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';

const fmt = (n: number) => n.toLocaleString('es-UY');

function TendBadge({ t }: { t: LineaDiagnostico['validaciones']['tendencia'] }) {
  const map = {
    BAJA: { c: 'text-red-300 bg-red-500/15 border-red-500/40', I: TrendingDown, l: 'BAJA INTERANUAL' },
    SUBE: { c: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/40', I: TrendingUp, l: 'SUBE INTERANUAL' },
    ESTABLE: { c: 'text-slate-300 bg-slate-700/40 border-slate-600/40', I: Minus, l: 'ESTABLE INTERANUAL' },
    NO_CONCLUYENTE: {
      c: 'text-amber-300 bg-amber-500/10 border-amber-500/40',
      I: Minus,
      l: 'TENDENCIA NO CONCLUYENTE',
    },
  }[t];
  const I = map.I;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border ${map.c}`}>
      <I className="w-3 h-3" />
      {map.l}
    </span>
  );
}

export default function InformeAccionableLineas({
  data,
}: {
  data: {
    empresa: string;
    mesAnalizado: string | null;
    mesComparado: string | null;
    lineas: LineaDiagnostico[];
    nota: string;
    auditoria: AuditoriaGlobal;
  };
}) {
  const a = data.auditoria;
  const auditOk = a && a.discrepancias === 0;
  if (!data.lineas.length) {
    return (
      <p className="text-sm text-slate-500">
        Sin líneas con venta STM para este operador en el dataset disponible.
      </p>
    );
  }
  return (
    <div className="space-y-4 print:space-y-3">
      <div className="text-xs text-slate-500 print:text-gray-600">
        Operador <span className="text-slate-300 font-semibold">{data.empresa}</span> · Mes
        analizado <span className="text-slate-300">{data.mesAnalizado ?? '—'}</span>
        {data.mesComparado ? (
          <>
            {' '}vs <span className="text-slate-300">{data.mesComparado}</span> (interanual)
          </>
        ) : (
          <span className="text-amber-400">
            {' '}· sin base interanual (no hay mismo mes del año anterior)
          </span>
        )}
      </div>
      <div className="text-[11px] text-amber-300/90 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2 print:text-gray-700 print:border-gray-300">
        <span className="font-semibold">Método:</span>{' '}
        {data.lineas[0]?.metodologia ??
          'Comparación interanual sobre validaciones por día hábil (estándar APTA/FTA-NTD).'}
      </div>

      {/* CERTIFICADO DE AUDITORÍA — reanálisis independiente */}
      {a && (
        <div
          className={`rounded-lg px-3 py-2.5 border text-xs print:border-gray-400 ${
            auditOk
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200 print:text-green-800'
              : 'bg-red-500/10 border-red-500/40 text-red-200 print:text-red-800'
          }`}
        >
          <div className="flex items-center gap-2 font-bold">
            {auditOk ? (
              <ShieldCheck className="w-4 h-4" />
            ) : (
              <ShieldAlert className="w-4 h-4" />
            )}
            {a.certificado}
          </div>
          <div className="mt-1 text-[11px] opacity-90">
            {a.ok}/{a.totalChecks} verificaciones OK · {a.discrepancias} discrepancias
            {a.lineasConDiscrepancia.length > 0
              ? ` (líneas: ${a.lineasConDiscrepancia.join(', ')})`
              : ''}{' '}
            · sello <span className="font-mono">{a.selloVerificacion}</span> ·{' '}
            {new Date(a.verificadoEn).toLocaleString('es-UY')}
          </div>
          <div className="mt-1 text-[10px] opacity-70">{a.metodoVerificacion}</div>
        </div>
      )}

      {data.lineas.map((l) => (
        <div
          key={l.linea}
          className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 print:border-gray-300 print:break-inside-avoid"
        >
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Bus className="w-4 h-4 text-blue-400" />
            <span className="text-base font-bold text-slate-100">Línea {l.linea}</span>
            <span className="text-sm text-slate-400">— {l.nombre}</span>
            <TendBadge t={l.validaciones.tendencia} />
            {l.auditoria && (
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border ${
                  l.auditoria.estado === 'AUDITADO_OK'
                    ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/40'
                    : 'text-red-300 bg-red-500/15 border-red-500/40'
                }`}
                title="Cada número de esta línea fue recomputado de forma independiente y confrontado"
              >
                {l.auditoria.estado === 'AUDITADO_OK' ? (
                  <ShieldCheck className="w-3 h-3" />
                ) : (
                  <ShieldAlert className="w-3 h-3" />
                )}
                {l.auditoria.estado === 'AUDITADO_OK' ? 'AUDITADO OK' : 'DISCREPANCIA'}
              </span>
            )}
          </div>

          {/* Métrica profesional: validaciones por DÍA HÁBIL (normalizada) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-sm">
            <div>
              <div className="text-[10px] text-slate-500 uppercase">
                Val/día hábil {l.validaciones.mesActual}
              </div>
              <div className="text-slate-100 font-bold">
                {l.validaciones.promDiaHabilActual != null
                  ? fmt(l.validaciones.promDiaHabilActual)
                  : '—'}
              </div>
              <div className="text-[9px] text-slate-600">
                {fmt(l.validaciones.totalActual)} en el mes
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase">
                {l.validaciones.baseComparacion === 'INTERANUAL'
                  ? `Val/día hábil ${l.validaciones.mesPrevio} (año ant.)`
                  : 'Comparación interanual'}
              </div>
              <div className="text-slate-300">
                {l.validaciones.promDiaHabilComparado != null
                  ? fmt(l.validaciones.promDiaHabilComparado)
                  : 'no disponible'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Variación interanual</div>
              {l.validaciones.baseComparacion === 'INTERANUAL' &&
              l.validaciones.variacionPct != null ? (
                <div
                  className={
                    l.validaciones.variacionPct < 0
                      ? 'text-red-400 font-bold'
                      : 'text-emerald-400 font-bold'
                  }
                >
                  {l.validaciones.variacionPct > 0 ? '+' : ''}
                  {l.validaciones.variacionPct}%
                </div>
              ) : (
                <div className="text-amber-400 font-semibold text-xs">
                  No concluyente (sin año anterior)
                </div>
              )}
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Hora pico (día hábil)</div>
              <div className="text-slate-100">
                {l.validaciones.horaPico != null
                  ? `${String(l.validaciones.horaPico).padStart(2, '0')}:00 · ${fmt(
                      l.validaciones.validacionesHoraPico,
                    )}`
                  : '—'}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-400 mb-3">
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" /> Servicio IMM {l.primeraSalida ?? '—'}–{l.ultimaSalida ?? '—'}
              {l.frecuenciaProgMin ? ` · ~${l.frecuenciaProgMin} min` : ''}
            </span>
            <span>Destino: {l.destino}</span>
          </div>

          {/* Competencia */}
          {l.competidores.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] text-amber-400 uppercase font-bold flex items-center gap-1 mb-1">
                <Swords className="w-3 h-3" /> Competencia real
              </div>
              <div className="space-y-1">
                {l.competidores.slice(0, 3).map((c, k) => (
                  <div key={k} className="text-xs text-slate-300">
                    Línea <span className="font-semibold">{c.linea}</span> de{' '}
                    <span className="font-semibold">{c.empresa}</span> — solapa{' '}
                    <span className="text-amber-300">{c.kmCompartidos} km ({c.pctSolape}%)</span>
                    {c.primeraSalidaRival
                      ? `, sale ${c.primeraSalidaRival}${
                          c.frecuenciaRivalMin ? ` cada ~${c.frecuenciaRivalMin} min` : ''
                        }`
                      : ''}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Servicios/cartones UCOT */}
          {l.serviciosUcot.length > 0 && (
            <div className="mb-3 text-xs text-slate-400">
              <span className="text-[10px] text-slate-500 uppercase font-bold flex items-center gap-1 mb-1">
                <FileText className="w-3 h-3" /> Servicios/cartón que la cubren
              </span>
              <div className="flex flex-wrap gap-2">
                {l.serviciosUcot.slice(0, 8).map((s, k) => (
                  <span key={k} className="bg-slate-800/60 border border-slate-700 rounded px-2 py-0.5">
                    {s.servicio}
                    {s.origen ? ` · ${s.origen}` : ''}
                    {s.horaSalida ? ` ${s.horaSalida}` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Diagnóstico + acción (texto redactado, accionable) */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 print:bg-gray-50 print:border-gray-300">
            <p className="text-xs text-slate-300 leading-relaxed">{l.diagnostico}</p>
            <p className="text-sm text-blue-200 font-semibold mt-2 leading-relaxed print:text-blue-800">
              ▶ Acción sugerida: {l.accionSugerida}
            </p>
            <p className="text-[11px] text-slate-400 mt-2 leading-relaxed print:text-gray-600">
              <span className="font-semibold text-slate-300 print:text-gray-700">
                Fundamento:
              </span>{' '}
              {l.fundamento}
            </p>
          </div>

          {l.fuentes?.length > 0 && (
            <details className="mt-2 print:open" open>
              <summary className="text-[10px] text-slate-500 uppercase tracking-wider cursor-pointer print:text-gray-500">
                Fuentes de los datos (verificable contra el sistema IMM)
              </summary>
              <ul className="mt-1 text-[10px] text-slate-500 list-disc list-inside space-y-0.5 print:text-gray-500">
                {l.fuentes.map((f, k) => (
                  <li key={k}>{f}</li>
                ))}
              </ul>
            </details>
          )}

          {l.auditoria?.checks?.length > 0 && (
            <details className="mt-2 print:open" open>
              <summary className="text-[10px] text-slate-500 uppercase tracking-wider cursor-pointer print:text-gray-500">
                Auditoría (reanálisis independiente — informe vs recomputado)
              </summary>
              <div className="mt-1 overflow-x-auto">
                <table className="w-full text-[10px] text-slate-400 print:text-gray-600">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="text-left pr-2">Campo</th>
                      <th className="text-right pr-2">Informe</th>
                      <th className="text-right pr-2">Recomputado</th>
                      <th className="text-center pr-2">✓</th>
                      <th className="text-left">Método de recomputo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {l.auditoria.checks.map((c, k) => (
                      <tr key={k}>
                        <td className="pr-2">{c.campo}</td>
                        <td className="text-right pr-2 font-mono">{String(c.valorInforme)}</td>
                        <td className="text-right pr-2 font-mono">
                          {String(c.valorRecomputado)}
                        </td>
                        <td
                          className={`text-center pr-2 font-bold ${
                            c.ok ? 'text-emerald-400' : 'text-red-400'
                          }`}
                        >
                          {c.ok ? 'OK' : '✗'}
                        </td>
                        <td className="text-slate-600 print:text-gray-500">{c.metodoRecomputo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      ))}

      <p className="text-[10px] text-slate-600 print:text-gray-500">{data.nota}</p>
    </div>
  );
}
