/**
 * SimuladorEscenarios — Movimiento #2 (FASE 5.19).
 *
 * Estimador de impacto TRANSPARENTE: el usuario plantea un escenario
 * (más coches / headway objetivo / capacidad) sobre una línea y ve
 * baseline vs escenario por hora, con la demanda STM real y la oferta GPS
 * real. Se muestran los SUPUESTOS explícitos (no es caja negra, no es un
 * modelo de equilibrio de red — eso se declara).
 */
import { useState, useCallback } from 'react';
import { Search, RefreshCw, AlertTriangle, FlaskConical, Info } from 'lucide-react';
import { getSimulacion, type SimulacionResultado } from '../../services/comandoService';

const OPS = [
  { id: '', n: 'Todos' },
  { id: '70', n: 'UCOT' },
  { id: '50', n: 'CUTCSA' },
  { id: '20', n: 'COME' },
  { id: '10', n: 'COETC' },
];

export default function SimuladorEscenarios() {
  const [linea, setLinea] = useState('');
  const [op, setOp] = useState('50');
  const [tipoDia, setTipoDia] = useState('habil');
  const [modo, setModo] = useState<'delta' | 'headway'>('delta');
  const [deltaPct, setDeltaPct] = useState(25);
  const [headway, setHeadway] = useState(6);
  const [capacidad, setCapacidad] = useState(90);
  const [data, setData] = useState<SimulacionResultado | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (!linea.trim()) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await getSimulacion({
        linea: linea.trim(),
        op: op || undefined,
        tipo_dia: tipoDia,
        capacidadBus: capacidad,
        ...(modo === 'delta'
          ? { deltaVehiculosPct: deltaPct }
          : { headwayObjetivoMin: headway }),
      });
      setData(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [linea, op, tipoDia, modo, deltaPct, headway, capacidad]);

  const fOcupColor = (v: number) =>
    v > 1 ? 'text-red-400' : v > 0.85 ? 'text-amber-400' : 'text-emerald-400';

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <h2 className="text-xl font-bold text-white flex items-center gap-2">
        <FlaskConical className="w-5 h-5 text-cyan-400" />
        Simulador de Escenarios
      </h2>
      <p className="text-sm text-slate-400 mt-1 mb-4">
        Estimador de impacto con datos medidos (demanda STM oficial + oferta GPS real). Transparente:
        cada número trazable a una medición + fórmula declarada. No es un modelo de equilibrio de red.
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-5 bg-slate-900/60 border border-slate-800 rounded-lg p-4">
        <div>
          <label className="block text-[10px] text-slate-500 uppercase tracking-widest mb-1">Línea</label>
          <input
            value={linea}
            onChange={(e) => setLinea(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
            placeholder="ej. 103"
            className="w-24 bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-[10px] text-slate-500 uppercase tracking-widest mb-1">Operador</label>
          <select
            value={op}
            onChange={(e) => setOp(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white text-sm"
          >
            {OPS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.n}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-slate-500 uppercase tracking-widest mb-1">Tipo día</label>
          <select
            value={tipoDia}
            onChange={(e) => setTipoDia(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white text-sm"
          >
            <option value="habil">Hábil</option>
            <option value="sabado">Sábado</option>
            <option value="festivo">Festivo</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-slate-500 uppercase tracking-widest mb-1">Escenario</label>
          <select
            value={modo}
            onChange={(e) => setModo(e.target.value as 'delta' | 'headway')}
            className="bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white text-sm"
          >
            <option value="delta">Δ % coches</option>
            <option value="headway">Headway objetivo</option>
          </select>
        </div>
        {modo === 'delta' ? (
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-widest mb-1">Δ coches %</label>
            <input
              type="number"
              value={deltaPct}
              onChange={(e) => setDeltaPct(Number(e.target.value))}
              className="w-20 bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white text-sm"
            />
          </div>
        ) : (
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-widest mb-1">Headway min</label>
            <input
              type="number"
              value={headway}
              onChange={(e) => setHeadway(Number(e.target.value))}
              className="w-20 bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white text-sm"
            />
          </div>
        )}
        <div>
          <label className="block text-[10px] text-slate-500 uppercase tracking-widest mb-1">Cap. bus</label>
          <input
            type="number"
            value={capacidad}
            onChange={(e) => setCapacidad(Number(e.target.value))}
            className="w-20 bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white text-sm"
          />
        </div>
        <button
          onClick={run}
          disabled={loading || !linea.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-semibold rounded-md"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Simular
        </button>
      </div>

      {err && (
        <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm mb-4">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {err}
        </div>
      )}

      {data && (
        <>
          <div className="bg-slate-900/60 border border-cyan-500/20 rounded-lg p-4 mb-4">
            <div className="text-sm text-white font-semibold mb-1">
              Línea {data.linea} · {data.operador ?? '—'} · {data.tipoDia} · demanda STM{' '}
              {data.mesDemanda ?? '?'}
            </div>
            <div className="text-sm text-cyan-300">{data.veredicto}</div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Kpi
              label="Pax no atendidos/día"
              base={data.resumen.paxNoAtendidoBaseDia}
              esc={data.resumen.paxNoAtendidoEscDia}
              mejorMenor
            />
            <Kpi
              label="Factor ocupación medio"
              base={data.resumen.factorOcupMedioBase}
              esc={data.resumen.factorOcupMedioEsc}
              mejorMenor
            />
            <Kpi
              label="Espera media (min)"
              base={data.resumen.esperaMediaBaseMin}
              esc={data.resumen.esperaMediaEscMin}
              mejorMenor
            />
            <Kpi
              label="Coche-hora/día"
              base={data.resumen.vehiculosDiaBase}
              esc={data.resumen.vehiculosDiaEsc}
            />
          </div>

          <div className="overflow-x-auto border border-slate-800 rounded-lg mb-3">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2 text-center">Hora</th>
                  <th className="px-3 py-2 text-center">Pax/día</th>
                  <th className="px-3 py-2 text-center bg-slate-800/40" colSpan={3}>
                    Baseline (medido)
                  </th>
                  <th className="px-3 py-2 text-center bg-cyan-500/10" colSpan={3}>
                    Escenario
                  </th>
                </tr>
                <tr className="bg-slate-900/60 text-slate-500 text-[10px]">
                  <th className="px-3 py-1"></th>
                  <th className="px-3 py-1"></th>
                  <th className="px-3 py-1 text-center bg-slate-800/40">veh/h</th>
                  <th className="px-3 py-1 text-center bg-slate-800/40">f.ocup</th>
                  <th className="px-3 py-1 text-center bg-slate-800/40">no atend</th>
                  <th className="px-3 py-1 text-center bg-cyan-500/10">veh/h</th>
                  <th className="px-3 py-1 text-center bg-cyan-500/10">f.ocup</th>
                  <th className="px-3 py-1 text-center bg-cyan-500/10">no atend</th>
                </tr>
              </thead>
              <tbody>
                {data.filas.map((f, i) => (
                  <tr key={f.hora} className={i % 2 ? 'bg-slate-900/40' : 'bg-slate-900/20'}>
                    <td className="px-3 py-2 text-center text-slate-300 font-mono">
                      {String(f.hora).padStart(2, '0')}h
                    </td>
                    <td className="px-3 py-2 text-center text-slate-200">{f.paxDia.toLocaleString()}</td>
                    <td className="px-3 py-2 text-center text-slate-400 bg-slate-800/20">{f.vehHoraBase}</td>
                    <td className={`px-3 py-2 text-center font-mono bg-slate-800/20 ${fOcupColor(f.factorOcupBase)}`}>
                      {f.factorOcupBase}
                    </td>
                    <td className="px-3 py-2 text-center text-red-300 bg-slate-800/20">
                      {f.paxNoAtendBase || ''}
                    </td>
                    <td className="px-3 py-2 text-center text-slate-300 bg-cyan-500/5">{f.vehHoraEsc}</td>
                    <td className={`px-3 py-2 text-center font-mono bg-cyan-500/5 ${fOcupColor(f.factorOcupEsc)}`}>
                      {f.factorOcupEsc}
                    </td>
                    <td className="px-3 py-2 text-center text-amber-300 bg-cyan-500/5">
                      {f.paxNoAtendEsc || ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.efectoRed && data.efectoRed.transfTotalMes > 0 && (
            <div className="bg-slate-900/60 border border-violet-500/20 rounded-lg p-4 mb-3">
              <div className="text-sm font-bold text-violet-300 mb-1">
                Efecto red — esta línea NO es aislada
              </div>
              <p className="text-xs text-slate-400 mb-3">
                {data.efectoRed.transfTotalMes.toLocaleString()} transbordos/mes conectan la línea{' '}
                {data.linea} con el resto de la red (matriz OD real STM, {data.efectoRed.mes}). Un
                cambio acá propaga a estas líneas:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">
                    Líneas que ALIMENTAN a la {data.linea} (transbordan hacia ella)
                  </div>
                  {data.efectoRed.alimentanEstaLinea.length === 0 ? (
                    <div className="text-xs text-slate-600">—</div>
                  ) : (
                    data.efectoRed.alimentanEstaLinea.map((x) => (
                      <div key={'a' + x.linea} className="flex justify-between text-xs py-0.5">
                        <span className="text-slate-300">Línea {x.linea}</span>
                        <span className="font-mono text-emerald-400">
                          {x.transbordos.toLocaleString()}/mes
                        </span>
                      </div>
                    ))
                  )}
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">
                    La {data.linea} ALIMENTA a (sus pasajeros transbordan hacia)
                  </div>
                  {data.efectoRed.estaLineaAlimenta.length === 0 ? (
                    <div className="text-xs text-slate-600">—</div>
                  ) : (
                    data.efectoRed.estaLineaAlimenta.map((x) => (
                      <div key={'s' + x.linea} className="flex justify-between text-xs py-0.5">
                        <span className="text-slate-300">Línea {x.linea}</span>
                        <span className="font-mono text-amber-400">
                          {x.transbordos.toLocaleString()}/mes
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <p className="text-[11px] text-slate-500 mt-3">{data.efectoRed.nota}</p>
            </div>
          )}

          <div className="text-[11px] text-slate-500 bg-slate-900/40 border border-slate-800 rounded-md p-3">
            <div className="flex items-center gap-1.5 text-slate-400 font-semibold mb-1">
              <Info className="w-3.5 h-3.5" /> Supuestos declarados (transparencia)
            </div>
            <ul className="list-disc pl-5 space-y-0.5">
              {data.supuestos.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        </>
      )}

      {!data && !loading && !err && (
        <div className="text-center text-slate-500 py-16 text-sm">
          Ingresá una línea y un escenario para estimar el impacto con datos reales.
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  base,
  esc,
  mejorMenor,
}: {
  label: string;
  base: number;
  esc: number;
  mejorMenor?: boolean;
}) {
  const mejora = mejorMenor ? esc < base : esc > base;
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2.5">
      <div className="text-[10px] text-slate-500 uppercase tracking-widest">{label}</div>
      <div className="text-sm mt-1">
        <span className="text-slate-400">{base.toLocaleString()}</span>
        <span className="text-slate-600 mx-1">→</span>
        <span className={`font-bold ${esc === base ? 'text-slate-300' : mejora ? 'text-emerald-400' : 'text-amber-400'}`}>
          {esc.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
