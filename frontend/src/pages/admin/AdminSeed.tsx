/**
 * AdminSeed — Panel de carga inicial de datos UCOT
 * Permite ejecutar cada seed de forma independiente o todo junto.
 * Solo visible para ADMIN / SUPERADMIN.
 */
import { useState } from 'react';
import { CheckCircle2, AlertTriangle, Loader2, Database, Bus, FileText, Users, CalendarDays, PlayCircle } from 'lucide-react';
import {
  seedFlota,
  seedCartones,
  seedPersonal,
  seedCochePersonal,
  seedProgramacionSemanal,
  seedUcotCompleto,
} from '../../utils/seedUcotCompleto';

type SeedStatus = 'idle' | 'running' | 'ok' | 'error';

interface SeedTask {
  id: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  fn: () => Promise<void>;
}

const TASKS: SeedTask[] = [
  {
    id: 'flota',
    label: 'Flota de Ómnibus',
    desc: '257 vehículos (Volvo, Agrale, Yutong, Mercedes, BYD)',
    icon: <Bus className="w-5 h-5" />,
    fn: seedFlota,
  },
  {
    id: 'cartones',
    label: 'Cartones de Servicio',
    desc: '185 cartones hábiles + 113 sabaderos — Línea 300 con horarios T1/T2',
    icon: <FileText className="w-5 h-5" />,
    fn: seedCartones,
  },
  {
    id: 'personal',
    label: 'Personal (Conductores)',
    desc: '134 conductores extraídos de la Distribución de Personal 12-13/04/2026',
    icon: <Users className="w-5 h-5" />,
    fn: seedPersonal,
  },
  {
    id: 'coche_personal',
    label: 'Coche ↔ Personal',
    desc: '78 coches con su personal asignado y turno base (T1/T2)',
    icon: <Database className="w-5 h-5" />,
    fn: seedCochePersonal,
  },
  {
    id: 'programacion',
    label: 'Programación Semanal',
    desc: 'Distribución de coches del fin de semana 12/04 (Sáb) y 13/04 (Dom) 2026',
    icon: <CalendarDays className="w-5 h-5" />,
    fn: seedProgramacionSemanal,
  },
];

export default function AdminSeed() {
  const [statuses, setStatuses] = useState<Record<string, SeedStatus>>({});
  const [logs, setLogs] = useState<Record<string, string>>({});
  const [runningAll, setRunningAll] = useState(false);

  const setStatus = (id: string, s: SeedStatus) =>
    setStatuses((prev) => ({ ...prev, [id]: s }));
  const appendLog = (id: string, msg: string) =>
    setLogs((prev) => ({ ...prev, [id]: (prev[id] || '') + msg + '\n' }));

  const run = async (task: SeedTask) => {
    setStatus(task.id, 'running');
    appendLog(task.id, `▶ Iniciando ${task.label}...`);
    try {
      await task.fn();
      setStatus(task.id, 'ok');
      appendLog(task.id, '✅ Completado');
    } catch (e: unknown) {
      setStatus(task.id, 'error');
      appendLog(task.id, '❌ Error: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const runAll = async () => {
    setRunningAll(true);
    try {
      await seedUcotCompleto();
      for (const t of TASKS) setStatus(t.id, 'ok');
    } catch (e: unknown) {
      setLogs((prev) => ({ ...prev, all: '❌ ' + (e instanceof Error ? e.message : String(e)) }));
    } finally {
      setRunningAll(false);
    }
  };

  const statusIcon = (s: SeedStatus) => {
    if (s === 'running') return <Loader2 className="w-4 h-4 animate-spin text-primary-400" />;
    if (s === 'ok') return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    if (s === 'error') return <AlertTriangle className="w-4 h-4 text-red-400" />;
    return <span className="w-4 h-4 rounded-full border border-slate-600 inline-block" />;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <Database className="w-7 h-7 text-primary-400" />
          Carga Inicial de Datos UCOT
        </h1>
        <p className="text-slate-400 mt-1 text-sm">
          Poblar Firestore con flota, cartones, personal y programación semanal.
          Ejecutá cada sección por separado o todo de una vez.
        </p>
      </div>

      {/* Botón seed completo */}
      <div className="mb-6">
        <button
          type="button"
          disabled={runningAll}
          onClick={runAll}
          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-bold text-sm transition-colors"
        >
          {runningAll ? <Loader2 className="w-5 h-5 animate-spin" /> : <PlayCircle className="w-5 h-5" />}
          {runningAll ? 'Ejecutando seed completo...' : 'Ejecutar todo el seed'}
        </button>
        {logs.all && (
          <p className="mt-2 text-xs font-mono text-red-400">{logs.all}</p>
        )}
      </div>

      {/* Tareas individuales */}
      <div className="space-y-3">
        {TASKS.map((task) => {
          const status = statuses[task.id] ?? 'idle';
          const log = logs[task.id] ?? '';
          return (
            <div
              key={task.id}
              className={`rounded-xl border p-4 transition-colors ${
                status === 'ok'
                  ? 'border-emerald-600/40 bg-emerald-950/20'
                  : status === 'error'
                    ? 'border-red-600/40 bg-red-950/20'
                    : status === 'running'
                      ? 'border-primary-600/40 bg-primary-950/20'
                      : 'border-slate-800 bg-slate-900/40'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-slate-400">{task.icon}</span>
                  <div>
                    <p className="font-semibold text-white text-sm">{task.label}</p>
                    <p className="text-slate-500 text-xs mt-0.5">{task.desc}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {statusIcon(status)}
                  <button
                    type="button"
                    disabled={status === 'running' || runningAll}
                    onClick={() => run(task)}
                    className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white text-xs font-medium transition-colors"
                  >
                    {status === 'running' ? 'Ejecutando...' : status === 'ok' ? 'Re-ejecutar' : 'Ejecutar'}
                  </button>
                </div>
              </div>
              {log && (
                <pre className="mt-3 text-[11px] font-mono text-slate-400 bg-slate-950 rounded-lg p-2 max-h-24 overflow-y-auto whitespace-pre-wrap">
                  {log}
                </pre>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-8 p-4 rounded-xl border border-amber-600/30 bg-amber-950/20 text-amber-200 text-xs space-y-1">
        <p className="font-bold flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Importante</p>
        <p>• El seed usa <code className="bg-slate-800 px-1 rounded">merge: true</code> — no borra datos existentes, solo actualiza.</p>
        <p>• Ejecutar varias veces es seguro (idempotente).</p>
        <p>• El personal se crea como usuarios sin contraseña — deben activarse desde Firebase Auth.</p>
        <p>• Los cartones de sábado corresponden al temporada verano 2026 (Febrero-Marzo).</p>
      </div>
    </div>
  );
}
