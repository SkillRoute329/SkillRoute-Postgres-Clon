/**
 * MotorConfigPanel — UI admin del motor de consecuencias (FASE 5.33, 2026-05-22)
 *
 * Editor en vivo de los parámetros que rigen el motor: tarifas monetarias,
 * umbrales de detección automática (retraso, fuera-de-servicio, bunching,
 * cobertura) y cooldowns. Los cambios surten efecto en ≤60s sin reinicio.
 *
 * GET/PUT /api/admin/config-motor (requireAdmin).
 */

import { useEffect, useState } from 'react';
import { Save, RefreshCw, AlertCircle, Zap, DollarSign, AlertTriangle, Network } from 'lucide-react';
import { apiClient } from '../../clients/apiClient';

interface MotorConfig {
  tarifaHoraUyu: number;
  subsidioPorKmUyu: number;
  costoReservaExtraUyu: number;
  retrasoThresholdPct: number;
  retrasoMinBuses: number;
  cocheFdsMinMin: number;
  bunchingDistanciaMetros: number;
  coberturaMinBusesPorLinea: number;
  cooldownLineaMs: number;
  cooldownCocheMs: number;
}

const FIELDS: Array<{
  key: keyof MotorConfig;
  label: string;
  hint: string;
  unidad: string;
  group: 'tarifas' | 'umbrales' | 'cooldowns';
  scale?: number; // para mostrar ms como minutos
}> = [
  { key: 'tarifaHoraUyu', label: 'Tarifa por hora (jornal)', hint: 'UYU/h para cálculo de impacto Nómina al perder un turno.', unidad: 'UYU/h', group: 'tarifas' },
  { key: 'subsidioPorKmUyu', label: 'Subsidio STM por km', hint: 'UYU/km que la IMM paga al operador. Cada km no realizado lo descuenta.', unidad: 'UYU/km', group: 'tarifas' },
  { key: 'costoReservaExtraUyu', label: 'Costo extra activar reserva', hint: 'UYU para llamar un conductor de reserva fuera de turno.', unidad: 'UYU', group: 'tarifas' },
  { key: 'retrasoThresholdPct', label: 'Umbral % ATRASADOS por línea', hint: 'Si más del X% de los buses de una línea están atrasados, se dispara automáticamente RETRASO_OPERATIVO.', unidad: '%', group: 'umbrales' },
  { key: 'retrasoMinBuses', label: 'Mínimo buses por línea', hint: 'Se ignoran líneas con menos buses GPS que este número (evita falsos positivos).', unidad: 'buses', group: 'umbrales' },
  { key: 'cocheFdsMinMin', label: 'Mín. minutos en FUERA_DE_SERVICIO', hint: 'Un coche debe estar FDS al menos N min antes de gatillar VEHICULO_FUERA_DE_SERVICIO (evita transitorios del poller).', unidad: 'min', group: 'umbrales' },
  { key: 'bunchingDistanciaMetros', label: 'Distancia para bunching', hint: 'Dos buses misma línea + sentido a menos de N metros = bunching detectado.', unidad: 'm', group: 'umbrales' },
  { key: 'coberturaMinBusesPorLinea', label: 'Cobertura GPS mínima por línea', hint: 'Una línea operativa con menos buses GPS reportando que este número dispara BAJA_COBERTURA.', unidad: 'buses', group: 'umbrales' },
  { key: 'cooldownLineaMs', label: 'Cooldown por línea', hint: 'Una línea no vuelve a gatillar el mismo tipo de evento hasta que pase este tiempo.', unidad: 'min', group: 'cooldowns', scale: 1 / 60000 },
  { key: 'cooldownCocheMs', label: 'Cooldown por coche', hint: 'Un coche no vuelve a gatillar VEHICULO_FUERA_DE_SERVICIO hasta este tiempo.', unidad: 'h', group: 'cooldowns', scale: 1 / 3600000 },
];

const GROUP_META: Record<string, { label: string; icon: typeof Zap; color: string; descripcion: string }> = {
  tarifas: { label: 'Tarifas monetarias', icon: DollarSign, color: 'text-emerald-300 border-emerald-500/30', descripcion: 'Valores que el motor usa para calcular impacto en Nómina, Subsidio y Finanzas.' },
  umbrales: { label: 'Umbrales de detección automática', icon: AlertTriangle, color: 'text-amber-300 border-amber-500/30', descripcion: 'Cuándo el sistema considera que algo es anómalo y dispara consecuencias.' },
  cooldowns: { label: 'Cooldowns', icon: Network, color: 'text-purple-300 border-purple-500/30', descripcion: 'Tiempo mínimo entre disparos repetidos para la misma entidad — evita spam.' },
};

export default function MotorConfigPanel() {
  const [cfg, setCfg] = useState<MotorConfig | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const cargar = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await apiClient.get<MotorConfig>('/api/admin/config-motor');
      const data = (res as unknown as { data?: MotorConfig }).data ?? null;
      if (data) {
        setCfg(data);
        const d: Record<string, string> = {};
        for (const f of FIELDS) {
          const val = (data as unknown as Record<string, number>)[f.key];
          const shown = f.scale ? val * f.scale : val;
          d[f.key] = String(shown);
        }
        setDraft(d);
      }
    } catch (e) {
      setMsg({ kind: 'err', text: 'Error cargando config: ' + String(e).slice(0, 120) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void cargar(); }, []);

  const dirty = cfg && FIELDS.some((f) => {
    const orig = (cfg as unknown as Record<string, number>)[f.key];
    const shown = f.scale ? orig * f.scale : orig;
    return String(shown) !== String(draft[f.key] ?? '');
  });

  const guardar = async () => {
    if (!cfg) return;
    setSaving(true);
    setMsg(null);
    try {
      const partial: Record<string, number> = {};
      for (const f of FIELDS) {
        const v = Number(draft[f.key]);
        if (!Number.isFinite(v) || v < 0) {
          throw new Error(`Valor inválido en "${f.label}": ${draft[f.key]}`);
        }
        const real = f.scale ? v / f.scale : v;
        partial[f.key as string] = real;
      }
      const res = await apiClient.put<MotorConfig>('/api/admin/config-motor', partial);
      const updated = (res as unknown as { data?: MotorConfig }).data;
      if (updated) {
        setCfg(updated);
        setMsg({ kind: 'ok', text: 'Cambios guardados. Efecto en próximo cálculo (≤60s).' });
      }
    } catch (e) {
      setMsg({ kind: 'err', text: 'Error guardando: ' + String(e).slice(0, 200) });
    } finally {
      setSaving(false);
    }
  };

  const resetear = () => {
    if (!cfg) return;
    const d: Record<string, string> = {};
    for (const f of FIELDS) {
      const val = (cfg as unknown as Record<string, number>)[f.key];
      const shown = f.scale ? val * f.scale : val;
      d[f.key] = String(shown);
    }
    setDraft(d);
    setMsg(null);
  };

  const grupos = (['tarifas', 'umbrales', 'cooldowns'] as const).map((g) => ({
    id: g,
    ...GROUP_META[g],
    items: FIELDS.filter((f) => f.group === g),
  }));

  return (
    <div className="space-y-6 animate-fade-in-up max-w-5xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20">
            <Zap className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Configuración del Motor de Consecuencias</h1>
            <p className="text-sm text-slate-400">
              Tarifas, umbrales de detección automática y cooldowns. Los cambios surten efecto en ≤60s sin reiniciar el sistema.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void cargar()}
            disabled={loading || saving}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Recargar
          </button>
          <button
            onClick={resetear}
            disabled={!dirty || saving}
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700 disabled:opacity-50"
          >
            Descartar
          </button>
          <button
            onClick={() => void guardar()}
            disabled={!dirty || saving}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold border border-purple-500 disabled:opacity-50"
          >
            <Save className={`w-3.5 h-3.5 ${saving ? 'animate-pulse' : ''}`} />
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm border ${msg.kind === 'ok' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
          <AlertCircle className="w-4 h-4" />
          {msg.text}
        </div>
      )}

      {grupos.map((g) => {
        const Icon = g.icon;
        return (
          <div key={g.id} className={`bg-slate-900 border rounded-xl ${g.color}`}>
            <div className="p-4 border-b border-slate-800 flex items-start gap-3">
              <div className="p-1.5 rounded-lg bg-slate-800/60">
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold">{g.label}</h2>
                <p className="text-[11px] text-slate-500 mt-0.5">{g.descripcion}</p>
              </div>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {g.items.map((f) => (
                <div key={f.key} className="space-y-1">
                  <label className="block text-xs font-bold text-slate-300">{f.label}</label>
                  <div className="flex items-stretch gap-2">
                    <input
                      type="number"
                      min={0}
                      step={f.unidad === '%' ? 1 : (f.key === 'tarifaHoraUyu' ? 50 : 1)}
                      value={draft[f.key] ?? ''}
                      onChange={(e) => setDraft((p) => ({ ...p, [f.key]: e.target.value }))}
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-purple-500 outline-none"
                    />
                    <span className="px-3 flex items-center text-xs text-slate-500 bg-slate-800/50 rounded-lg border border-slate-700 font-mono">
                      {f.unidad}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500">{f.hint}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="text-[10px] text-slate-500 text-center">
        Persistencia: <code className="bg-slate-800 px-1.5 py-0.5 rounded">system_config.key=config_motor_consecuencias</code> · Cache TTL 60s · Endpoint:{' '}
        <code className="bg-slate-800 px-1.5 py-0.5 rounded">PUT /api/admin/config-motor</code>
      </div>
    </div>
  );
}
