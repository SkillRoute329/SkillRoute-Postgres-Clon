/**
 * Formulario para agregar/editar desvíos (Navegador UCOT).
 * Desvíos fijos: admin o inspector. Temporales: cualquier usuario o conductor (reporte tipo Waze).
 * En modo conductor puede usarse la ubicación actual como punto afectado.
 */
import { useState } from 'react';
import { X, Save, MapPin } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { DesvioFijo, DesvioTemporal, TipoDesvioTemporal } from '../../types/lineasUcot';

type TipoFijo = 'feria' | 'obra' | 'permanente';

const TIPOS_TEMPORAL: { value: TipoDesvioTemporal; label: string }[] = [
  { value: 'accidente', label: 'Accidente' },
  { value: 'obra_temp', label: 'Obra temporal' },
  { value: 'corte', label: 'Corte de calle' },
  { value: 'desvio_momentaneo', label: 'Desvío momentáneo' },
  { value: 'pozo', label: 'Pozo / bache' },
  { value: 'obstaculo', label: 'Obstáculo en vía' },
  { value: 'otro', label: 'Otro' },
];

interface DesvioEditorProps {
  lineaCodigo: string;
  onClose: () => void;
  onSaved: () => void;
  /** En modo conductor: usar ubicación actual como punto del reporte (tipo Waze). */
  userPosition?: { lat: number; lng: number } | null;
  /** Si true, título y flujo orientados a "Reportar en ruta". */
  conductorMode?: boolean;
}

export default function DesvioEditor({
  lineaCodigo,
  onClose,
  onSaved,
  userPosition = null,
  conductorMode = false,
}: DesvioEditorProps) {
  const { user } = useAuth();
  const [tipoCategoria, setTipoCategoria] = useState<'fijo' | 'temporal'>('temporal');
  const [tipoFijo, setTipoFijo] = useState<TipoFijo>('obra');
  const [tipoTemporal, setTipoTemporal] = useState<TipoDesvioTemporal>('accidente');
  const [descripcion, setDescripcion] = useState('');
  const [saving, setSaving] = useState(false);

  const role = (user as { role?: string })?.role ?? '';
  const canCreateFijo = role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'Inspector';
  const puntoAfectado =
    userPosition && userPosition.lat && userPosition.lng ? userPosition : { lat: 0, lng: 0 };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!descripcion.trim()) return;

    setSaving(true);
    try {
      const { doc, getDoc, setDoc, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('../../config/firebase');
      const ref = doc(db, 'lineas_ucot', lineaCodigo);
      const snap = await getDoc(ref);
      const data = snap.exists() ? snap.data() : {};

      const id = `d-${Date.now()}`;
      const now = serverTimestamp();

      if (tipoCategoria === 'fijo' && canCreateFijo) {
        const nuevo: DesvioFijo = {
          id,
          tipo: tipoFijo,
          descripcion: descripcion.trim(),
          puntoDesde: { lat: 0, lng: 0 },
          puntoHasta: { lat: 0, lng: 0 },
          rutaAlternativa: [],
          activo: true,
          creadoEn: now as DesvioFijo['creadoEn'],
        };
        const list = Array.isArray(data.desviosFijos) ? [...data.desviosFijos] : [];
        await setDoc(
          ref,
          { ...data, desviosFijos: [...list, nuevo], ultimaActualizacion: now },
          { merge: true },
        );
      } else {
        const nuevo: DesvioTemporal = {
          id,
          tipo: tipoTemporal,
          descripcion: descripcion.trim(),
          puntoAfectado,
          activo: true,
          creadoEn: now as DesvioTemporal['creadoEn'],
          expiraEn: null,
          reportadoPor:
            (user as { uid?: string })?.uid ?? (user as { email?: string })?.email ?? 'conductor',
        };
        const list = Array.isArray(data.desviosTemporales) ? [...data.desviosTemporales] : [];
        await setDoc(
          ref,
          { ...data, desviosTemporales: [...list, nuevo], ultimaActualizacion: now },
          { merge: true },
        );
      }
      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-xl w-full max-w-md max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h3 className="text-lg font-bold text-white">
            {conductorMode ? 'Reportar en ruta' : 'Agregar desvío'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-lg hover:bg-slate-700 active:bg-slate-600 text-slate-400 touch-manipulation"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {conductorMode && puntoAfectado.lat && puntoAfectado.lng && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-primary-900/30 border border-primary-600/50 text-primary-200 text-sm">
              <MapPin className="w-4 h-4 shrink-0" />
              <span>Se usará tu ubicación actual en el mapa para este reporte.</span>
            </div>
          )}

          {!conductorMode && (
            <div>
              <label className="block text-slate-400 text-sm font-medium mb-2">Tipo</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTipoCategoria('temporal')}
                  className={`min-h-[44px] px-4 py-3 rounded-xl text-sm font-medium touch-manipulation ${
                    tipoCategoria === 'temporal'
                      ? 'bg-primary-600 text-white'
                      : 'bg-slate-700 text-slate-400 hover:bg-slate-600 active:bg-slate-500'
                  }`}
                >
                  Temporal
                </button>
                <button
                  type="button"
                  onClick={() => setTipoCategoria('fijo')}
                  disabled={!canCreateFijo}
                  className={`min-h-[44px] px-4 py-3 rounded-xl text-sm font-medium touch-manipulation ${
                    tipoCategoria === 'fijo'
                      ? 'bg-primary-600 text-white'
                      : 'bg-slate-700 text-slate-400 hover:bg-slate-600 active:bg-slate-500'
                  } disabled:opacity-50`}
                >
                  Fijo
                </button>
              </div>
            </div>
          )}

          {tipoCategoria === 'fijo' ? (
            <div>
              <label className="block text-slate-400 text-sm font-medium mb-2">
                Tipo de desvío fijo
              </label>
              <select
                value={tipoFijo}
                onChange={(e) => setTipoFijo(e.target.value as TipoFijo)}
                className="w-full min-h-[44px] px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white hover:bg-slate-800 focus:ring-2 focus:ring-primary-500 focus:outline-none disabled:opacity-50"
              >
                <option value="feria">Feria vecinal</option>
                <option value="obra">Obra</option>
                <option value="permanente">Permanente</option>
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-slate-400 text-sm font-medium mb-2">
                {conductorMode ? '¿Qué estás reportando?' : 'Tipo de desvío temporal'}
              </label>
              <select
                value={tipoTemporal}
                onChange={(e) => setTipoTemporal(e.target.value as TipoDesvioTemporal)}
                className="w-full min-h-[44px] px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white hover:bg-slate-800 focus:ring-2 focus:ring-primary-500 focus:outline-none disabled:opacity-50"
              >
                {TIPOS_TEMPORAL.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-slate-400 text-sm font-medium mb-2">Descripción</label>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder={
                conductorMode
                  ? 'Ej: Pozo grande en carril derecho, desvío por Bvar. Artigas...'
                  : 'Ej: Feria de Tristán Narvaja, desvío por...'
              }
              rows={3}
              className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 resize-none"
              required
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-[44px] py-3 rounded-xl border border-slate-600 text-slate-300 font-medium hover:bg-slate-700 active:bg-slate-600 touch-manipulation"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 min-h-[44px] py-3 rounded-xl bg-primary-600 hover:bg-primary-500 active:bg-primary-400 text-white font-medium flex items-center justify-center gap-2 disabled:opacity-50 touch-manipulation"
            >
              {saving ? 'Guardando…' : 'Guardar'}
              <Save className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
