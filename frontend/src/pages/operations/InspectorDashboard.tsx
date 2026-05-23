import { useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Timestamp } from '../../config/firestoreShim';
import { useAuth } from '../../context/AuthContext';
import { BulletinService, CartonService, InspectionService } from '../../services/api';
import { ActiveAssignmentsService } from '../../services/firestore';
import { Search, Users, BarChart3, Check, Car, Building2 } from 'lucide-react';
import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';
import { ShadowDispatcherService, type AlertaRegulacion } from '../../services/ShadowDispatcherService';

// Types

const InspectorDashboard = () => {
  const { empresaPropia, setEmpresaPropia, empresaCfg } = useEmpresaPropia();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [availableLines, setAvailableLines] = useState<string[]>([]);
  const [line, setLine] = useState('');
  const [matrixMode, setMatrixMode] = useState(false);

  // Líneas dinámicas desde Firestore. Sin datos de prueba.
  useEffect(() => {
    CartonService.getLineIds().then(setAvailableLines).catch(console.error);
  }, []);

  // Matrix Data
  const [headers, setHeaders] = useState<Array<{ id: string; location: string; isStop: boolean }>>(
    [],
  );
  const [rows, setRows] = useState<
    Array<{ id: string; serviceNumber: string; times: Record<string, string> }>
  >([]);

  // Control Data (Synced with Cloud)
  // Key: `${date}_${line}_${service}_${headerId}` -> Value: { actual, diff }
  const [controls, setControls] = useState<
    Record<string, { actualTime: string; diff: number; status: 'Completed' }>
  >({});
  const [loads, setLoads] = useState<Record<string, string>>({}); // Key: ServiceNr -> Value: 'Malo'|'Regular'|'Bueno'|'Excelente'
  const [offsets, setOffsets] = useState<Record<string, number>>({}); // Key: ServiceNr -> Value: minutes (+/-)

  // Active assignments mapping: cartonServiceId -> cocheId
  const [cocheAssignments, setCocheAssignments] = useState<Record<string, string>>({});
  // Active alerts mapping: cocheId -> AlertaRegulacion
  const [activeAlerts, setActiveAlerts] = useState<Record<string, AlertaRegulacion>>({});
  
  // Timer for TTL evaluation on active alerts
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 30000); // 30s update
    return () => clearInterval(t);
  }, []);

  // Coches que pasaron por un punto de control en la última hora (ActiveAssignmentsService.getByDate + inspecciones)
  const [lastHourPasses, setLastHourPasses] = useState<
    Array<{
      controlPointId: string;
      lineId: string;
      serviceId: string;
      cocheId: string | null;
      time: string;
    }>
  >([]);
  const [lastHourLoading, setLastHourLoading] = useState(false);

  // Modal Interaction (Deprecated in favor of Inline Check)
  // const [selectedCell, setSelectedCell] = useState<MatrixCell | null>(null);

  const loadMatrix = async () => {
    if (!line) return;

    try {
      // 1. Fetch Matrix Definition (Carton)
      const cloudDefinitions = await CartonService.getAll(line);

      if (cloudDefinitions && cloudDefinitions.length > 0) {
        // TRANSFORM CLOUD DATA -> UI MATRIX
        const sample = cloudDefinitions[0];
        const cleanHeaders = (
          ((sample as { headers?: Array<{ id: string; location: string }> }).headers ||
            []) as Array<{
            id: string;
            location: string;
          }>
        ).map((h) => ({
          id: h.id,
          location: h.location,
          isStop: true,
        }));

        const cleanRows = cloudDefinitions
          .map((def) => {
            const times: Record<string, string> = {};
            cleanHeaders.forEach((h: { id: string }, idx: number) => {
              times[h.id] = def.rawMatrix?.[0]?.checkpoints?.[idx] ?? '--:--';
            });
            return {
              id: def.id,
              serviceNumber: def.serviceNumber ?? String(def.id).split('_')[0],
              times,
            };
          })
          .sort((a, b) => {
            const tA = (Object.values(a.times)[0] as string) || '';
            const tB = (Object.values(b.times)[0] as string) || '';
            return tA.localeCompare(tB);
          });

        setHeaders(cleanHeaders);
        setRows(cleanRows);
        setMatrixMode(true);
        loadActuals();
        return;
      }

      alert(
        'No hay definiciones de matriz para esta línea en la nube. Realice una ingesta previa.',
      );
    } catch (e) {
      console.error('Matrix Load Failed', e);
      alert('Error cargando matriz.');
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];

  const loadLastHourPasses = useCallback(async () => {
    setLastHourLoading(true);
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    try {
      const list = await InspectionService.getForDate(todayStr);
      const inLastHour = list.filter((i) => {
        const at = i.actualPassedAt?.toDate?.();
        return at && at.getTime() >= oneHourAgo;
      });
      const passes = await Promise.all(
        inLastHour.map(async (i) => {
          const assign = await ActiveAssignmentsService.get(i.cartonServiceId, i.serviceDate);
          const time = i.actualPassedAt?.toDate?.()
            ? `${String(i.actualPassedAt.toDate().getHours()).padStart(2, '0')}:${String(i.actualPassedAt.toDate().getMinutes()).padStart(2, '0')}`
            : '--:--';
          return {
            controlPointId: i.controlPointId,
            lineId: i.lineId,
            serviceId: i.cartonServiceId,
            cocheId: assign?.cocheId ?? null,
            time,
          };
        }),
      );
      setLastHourPasses(passes);
    } catch {
      setLastHourPasses([]);
    } finally {
      setLastHourLoading(false);
    }
  }, [todayStr]);

  useEffect(() => {
    loadLastHourPasses();
    const t = setInterval(loadLastHourPasses, 60000);
    return () => clearInterval(t);
  }, [todayStr, loadLastHourPasses]);

  useEffect(() => {
    if (!line) return;
    // Load assignments for today
    ActiveAssignmentsService.getByDate(todayStr).then(assignments => {
      const mapping: Record<string, string> = {};
      assignments.forEach(a => {
        if (a.cocheId) mapping[a.servicioId] = a.cocheId;
      });
      setCocheAssignments(mapping);
    });
  }, [line, todayStr]);

  const loadActuals = async () => {
    try {
      const list = await InspectionService.getForDate(todayStr, line);
      const newControls: Record<string, { actualTime: string; diff: number; status: string }> = {};
      const newLoads: Record<string, string> = {};

      list.forEach((i) => {
        const key = `${i.cartonServiceId}_${i.controlPointId}`;
        const actualTime = i.actualPassedAt?.toDate?.()
          ? `${String(i.actualPassedAt.toDate().getHours()).padStart(2, '0')}:${String(i.actualPassedAt.toDate().getMinutes()).padStart(2, '0')}`
          : '--:--';
        newControls[key] = {
          actualTime,
          diff: i.timeDeltaMinutes ?? 0,
          status: 'Completed',
        };
        if (i.passengerLoad != null) {
          newLoads[i.cartonServiceId] =
            typeof i.passengerLoad === 'number' ? String(i.passengerLoad) : i.passengerLoad;
        }
      });

      setControls(newControls as any);
      setLoads(newLoads);
      console.log('Loaded inspections (actuals):', list.length);
    } catch (e) {
      console.error(e);
    }
  };

  // Listener en tiempo real: inspecciones del día para la línea seleccionada (5.4) + Alertas Regulacion
  useEffect(() => {
    if (!line || !matrixMode) return;
    const unsub = InspectionService.subscribeForDate(todayStr, line, (list) => {
      const newControls: Record<string, { actualTime: string; diff: number; status: string }> = {};
      const newLoads: Record<string, string> = {};
      list.forEach((i) => {
        const key = `${i.cartonServiceId}_${i.controlPointId}`;
        const actualTime = i.actualPassedAt?.toDate?.()
          ? `${String(i.actualPassedAt.toDate().getHours()).padStart(2, '0')}:${String(i.actualPassedAt.toDate().getMinutes()).padStart(2, '0')}`
          : '--:--';
        newControls[key] = { actualTime, diff: i.timeDeltaMinutes ?? 0, status: 'Completed' };
        if (i.passengerLoad != null)
          newLoads[i.cartonServiceId] =
            typeof i.passengerLoad === 'number' ? String(i.passengerLoad) : i.passengerLoad;
      });
      setControls(newControls as any);
      setLoads(newLoads);
    });

    const unsubAlerts = ShadowDispatcherService.subscribeAlertasPorLinea(line, (alertas) => {
      const active: Record<string, AlertaRegulacion> = {};
      alertas.forEach(a => {
        if (a.coche_id) {
          active[a.coche_id] = a;
        }
      });
      setActiveAlerts(active);
    });

    return () => {
        unsub();
        unsubAlerts();
    };
  }, [line, matrixMode, todayStr]);

  /**
   * ⚡ CORE LOGIC: "Check" Button
   * Captures Device Time, Calculates Diff, Saves to Cloud.
   */
  const handleQuickCheck = async (
    row: { id: string; serviceNumber: string; times: Record<string, string> },
    header: { id: string },
  ) => {
    const schedTime = row.times[header.id];
    if (!schedTime) return;

    const now = new Date();
    const currentHHMM =
      now.getHours().toString().padStart(2, '0') +
      ':' +
      now.getMinutes().toString().padStart(2, '0');

    // Calculate Diff (Minutes)
    const [schedH, schedM] = schedTime.split(':').map(Number);
    const [actH, actM] = currentHHMM.split(':').map(Number);

    const schedMins = schedH * 60 + schedM;
    const actMins = actH * 60 + actM;

    // "Adelantado" (Early) = Sched > Actual. Wait.
    // User: "paso 5 adelantado genera +5". If Sched=10:00, Act=09:55 -> 600 - 595 = +5.
    // User: "paso atrasado marcara en negativo -10". If Sched=10:00, Act=10:10 -> 600 - 610 = -10.
    // Formula: Scheduled - Actual.

    let diff = schedMins - actMins;

    // Handle Midnight crossing if needed (simple logic for now)
    if (diff > 720) diff -= 1440; // Likely wrong day assumption
    if (diff < -720) diff += 1440;

    const key = `${row.id}_${header.id}`;

    // Optimistic UI Update
    const newEntry = {
      actualTime: currentHHMM,
      diff: diff,
      status: 'Completed' as const,
    };

    setControls((prev) => ({ ...prev, [key]: newEntry }));

    // Save to Cloud: colección inspecciones (delta = hora real - programada; positivo = atraso)
    const timeDeltaMinutes = actMins - schedMins;
    const serviceDate = new Date().toISOString().split('T')[0];
    try {
      await InspectionService.create({
        cartonServiceId: row.id,
        lineId: line,
        controlPointId: header.id,
        serviceDate,
        scheduledTime: schedTime,
        actualPassedAt: Timestamp.now(),
        timeDeltaMinutes,
        passengerLoad: 'MEDIO',
        inspectorId: (user as { uid?: string })?.uid,
      });
    } catch (e) {
      console.error('Save Check Failed', e);
      alert('Error al guardar check (Offline?)');
    }
  };

  /**
   * ⚡ ADVANCE / DELAY SERVICE
   */
  const adjustService = async (serviceNumber: string, delta: number) => {
    const current = offsets[serviceNumber] || 0;
    const newValue = current + delta;

    setOffsets((prev) => ({ ...prev, [serviceNumber]: newValue }));

    try {
      await BulletinService.save({
        type: 'OFFSET',
        line,
        date: new Date().toISOString().split('T')[0],
        serviceNumber,
        value: newValue,
      });
    } catch (e) {
      console.error('adjustService save error', e);
    }
  };

  /**
   * ⚡ LOAD REGISTRATION
   */
  const setServiceLoad = async (serviceNumber: string, value: string) => {
    setLoads((prev) => ({ ...prev, [serviceNumber]: value }));

    await BulletinService.save({
      type: 'LOAD',
      line,
      date: new Date().toISOString().split('T')[0],
      serviceNumber,
      value,
    });
  };

  /** Verde = puntual (|delta| ≤ 3 min), Rojo = tarde (delta > 3), Amarillo = adelantado (delta < -3), Gris = sin dato. */
  const getDiffColor = (diff: number) => {
    if (Math.abs(diff) <= 3) return 'text-emerald-400';
    if (diff > 3) return 'text-red-400';
    return 'text-amber-400';
  };
  const getDiffBg = (diff: number) => {
    if (Math.abs(diff) <= 3) return 'bg-emerald-500/20';
    if (diff > 3) return 'bg-red-500/20';
    return 'bg-amber-500/20';
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-white overflow-hidden pb-16">
      <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Users className="text-primary-500" />
            <span className="hidden md:inline">Control Inspectores V2 (EN VIVO)</span>
          </h1>
          <div className="flex items-center gap-2">
            <select
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 font-mono text-white min-w-[100px]"
              value={line}
              onChange={(e) => setLine(e.target.value)}
              aria-label="Línea"
            >
              <option value="">Línea</option>
              {availableLines.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <button onClick={loadMatrix} className="bg-primary-600 px-3 py-2 rounded font-bold">
              Cargar
            </button>
          </div>
        </div>
        <button
          onClick={() => navigate('/dashboard/traffic/statistics')}
          className="bg-slate-800 border border-slate-700 hover:bg-slate-700 px-4 py-2 rounded-lg font-bold flex items-center gap-2"
        >
          <BarChart3 className="w-4 h-4 text-purple-400" />
          <span className="hidden sm:inline">Estadísticas</span>
        </button>
      </div>

      <div className="shrink-0 border-b border-slate-800 bg-slate-900/80 px-4 py-3">
        <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2 mb-2">
          <Car className="w-4 h-4 text-primary-500" />
          Coches que pasaron por un punto de control (última hora)
        </h3>
        {lastHourLoading ? (
          <p className="text-slate-500 text-sm">Cargando…</p>
        ) : lastHourPasses.length === 0 ? (
          <p className="text-slate-500 text-sm">Ningún paso registrado en la última hora.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {lastHourPasses.map((p, idx) => (
              <li
                key={`${p.serviceId}-${p.controlPointId}-${idx}`}
                className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm"
              >
                <span className="font-mono">{p.time}</span>
                <span className="mx-2">·</span>
                <span>L{p.lineId}</span>
                <span className="mx-2">·</span>
                <span>#{p.serviceId}</span>
                <span className="mx-2">·</span>
                <span>{p.controlPointId}</span>
                {p.cocheId && (
                  <>
                    <span className="mx-2">·</span>
                    <span className="text-primary-400">Coche {p.cocheId}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {!matrixMode ? (
        <div className="flex-1 flex items-center justify-center p-8 text-slate-500 text-center">
          <div>
            <Search className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p>Ingrese Línea y presione Cargar</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto custom-scrollbar relative">
          <div className="w-full overflow-x-auto shadow-sm rounded-lg">
            <table className="w-full text-xs border-collapse min-w-[500px]">
              <thead className="sticky top-0 z-10 bg-slate-900 border-b border-slate-700 shadow-xl">
                <tr>
                  <th className="p-3 text-left font-bold text-slate-400 min-w-[140px] border-r border-slate-800 sticky left-0 bg-slate-900 z-20">
                    Servicio / Ajuste
                  </th>
                  {headers.map((h) => (
                    <th
                      key={h.id}
                      className="p-2 text-center font-medium text-slate-300 min-w-[90px] border-r border-slate-800"
                    >
                      {h.location}
                    </th>
                  ))}
                  <th className="p-2 text-center font-bold text-slate-300 min-w-[120px] bg-slate-900 z-20">
                    Carga
                  </th>
                </tr>
              </thead>
              <tbody className="bg-slate-900/50">
                {rows.map((row) => (
                  <tr
                    key={row.serviceNumber}
                    className="hover:bg-slate-800 transition-colors border-b border-slate-800/50"
                  >
                    {/* SERVICE & OFFSET */}
                    <td className="p-2 border-r border-slate-800 sticky left-0 bg-slate-900/90 z-10 w-[160px]">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                            <span className="font-bold text-base text-white">#{row.serviceNumber}</span>
                            {cocheAssignments[row.id] && !activeAlerts[cocheAssignments[row.id]] && (
                                <span className="text-[10px] text-slate-500 font-mono bg-slate-800 px-1 rounded">
                                    Coche {cocheAssignments[row.id]}
                                </span>
                            )}
                        </div>
                        {/* INSTRUCCIONES SHADOW DISPATCHER */}
                        {(() => {
                          const cocheId = cocheAssignments[row.id];
                          if (!cocheId) return null;
                          const alerta = activeAlerts[cocheId];
                          if (!alerta || !alerta.timestamp) return null;
                          
                          // TTL 3 minutes max
                          const ageMs = nowTick - (alerta.timestamp.seconds * 1000);
                          if (ageMs > 3 * 60 * 1000) return null;

                          const ui = ShadowDispatcherService.getInstruccionUI(alerta.instruccion);
                          return (
                            <div 
                                className={`mt-1 flex flex-col p-1.5 rounded border bg-slate-950/80 shadow-[0_0_8px_rgba(0,0,0,0.5)] ${ui.bordeClase}`}
                            >
                                <div className={`flex items-center gap-1 text-[10px] font-bold ${ui.textoClase}`}>
                                    <span>{ui.icono}</span>
                                    <span>Coche {cocheId}</span>
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-wider leading-tight mt-0.5 text-white">{ui.etiqueta}</span>
                            </div>
                          );
                        })()}
                        <div className="flex items-center gap-1 bg-slate-800 rounded p-1 mt-1">
                          <button
                            onClick={() => adjustService(row.serviceNumber, -1)}
                            className="w-6 h-6 flex items-center justify-center bg-red-500/20 text-red-400 rounded hover:bg-red-500/40"
                          >
                            -
                          </button>
                          <span
                            className={`font-mono font-bold w-6 text-center ${offsets[row.serviceNumber] ? 'text-white' : 'text-slate-600'}`}
                          >
                            {offsets[row.serviceNumber] || 0}
                          </span>
                          <button
                            onClick={() => adjustService(row.serviceNumber, 1)}
                            className="w-6 h-6 flex items-center justify-center bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/40"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </td>

                    {/* TIMINGS & CHECKS */}
                    {headers.map((h) => {
                      const key = `${row.id}_${h.id}`;
                      const control = controls[key];
                      const sched = row.times[h.id];

                      return (
                        <td
                          key={h.id}
                          className="p-2 text-center border-r border-slate-800/50 align-top"
                        >
                          {sched ? (
                            <div className="flex flex-col items-center gap-2">
                              <span className="font-mono text-slate-400 text-xs">{sched}</span>

                              {control ? (
                                <div
                                  className={`flex flex-col items-center animate-in fade-in zoom-in rounded-lg p-1.5 min-w-[3rem] ${getDiffBg(control.diff)}`}
                                >
                                  <span className="text-[10px] text-slate-500 font-mono">
                                    {control.actualTime}
                                  </span>
                                  <span
                                    className={`text-sm font-black ${getDiffColor(control.diff)}`}
                                  >
                                    {control.diff > 0 ? `+${control.diff}` : control.diff}
                                  </span>
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleQuickCheck(row, h)}
                                  className="w-8 h-8 rounded-full bg-slate-800 border-2 border-slate-600 hover:border-emerald-500 hover:bg-emerald-500/20 text-slate-500 hover:text-emerald-400 transition-all flex items-center justify-center"
                                  aria-label="Registrar paso"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-700">-</span>
                          )}
                        </td>
                      );
                    })}

                    {/* LOAD */}
                    <td className="p-2 bg-slate-900/50 z-10 align-middle">
                      <div className="grid grid-cols-2 gap-1 w-full max-w-[120px]">
                        {['Malo', 'Regular', 'Bueno', 'Excelente'].map((opt) => (
                          <button
                            key={opt}
                            onClick={() => setServiceLoad(row.serviceNumber, opt)}
                            className={`
                                                        text-[9px] font-bold uppercase py-1 rounded border transition-all
                                                        ${
                                                          loads[row.serviceNumber] === opt
                                                            ? 'bg-blue-600 border-blue-500 text-white'
                                                            : 'bg-slate-800 border-slate-700 text-slate-500 hover:bg-slate-700'
                                                        }
                                                    `}
                          >
                            {opt.substring(0, 3)}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default InspectorDashboard;
