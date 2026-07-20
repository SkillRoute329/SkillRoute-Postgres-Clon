/**
 * ContingencyManagementPage — Centro de Gestión de Contingencias
 *
 * Interfaz para el motor contingencyEngine.ts:
 *  - Selecciona vehículo averiado/fuera de servicio
 *  - Muestra servicios afectados del día
 *  - Sugiere vehículo de reemplazo + conductor retén
 *  - Genera hoja de reemplazo exportable
 *
 * Lee datos reales de: Firestore (daily_shifts, vehiculos, users)
 * Sin simulaciones.
 */

import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, where, orderBy } from '../../config/firestoreShim';
import { db } from '../../config/firebase';
import { handleServiceInterruption } from '../../services/contingencyEngine';
import type { ServiceInterruptionResult } from '../../services/contingencyEngine';
import type { Vehicle } from '../../services/firestore/types';
import type { User } from '../../services/firestore/types';
import {
  AlertTriangle,
  Bus,
  User as UserIcon,
  CheckCircle,
  RefreshCw,
  MapPin,
  Shield,
  Zap,
  Download,
  Clock,
} from 'lucide-react';
import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import toast from 'react-hot-toast';

/* ─── Component ───────────────────────────────────────── */

export default function ContingencyManagementPage() {
  const { empresaPropia, setEmpresaPropia, empresaCfg } = useEmpresaPropia();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<User[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [result, setResult] = useState<ServiceInterruptionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  
  // Obtener fecha local en formato YYYY-MM-DD (Evita el salto de día por UTC a las 21hs de Uruguay)
  const [today] = useState(() => {
    const d = new Date();
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOffset).toISOString().split('T')[0];
  });

  /* ── Load vehicles and drivers ── */
  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setDataLoading(true);
      try {
        const [vSnap, dSnap] = await Promise.all([
          getDocs(query(collection(db, 'vehiculos'), orderBy('internalNumber', 'asc'))),
          getDocs(
            query(
              collection(db, 'users'),
              where('role', 'in', ['conductor', 'CONDUCTOR', 'driver', 'DRIVER']),
            ),
          ),
        ]);
        if (!isMounted) return;
        setVehicles(vSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Vehicle, 'id'>) })));
        setDrivers(dSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<User, 'id'>) })));
      } catch (e) {
        console.error('[Contingency] Load error:', e);
        if (isMounted) toast.error('Fallo al cargar la base de datos de la flota');
      } finally {
        if (isMounted) setDataLoading(false);
      }
    };
    void load();
    return () => { isMounted = false; };
  }, []);

  /* ── Ejecutar análisis de contingencia ── */
  const analizar = useCallback(async () => {
    if (!selectedVehicleId) return;
    setLoading(true);
    setResult(null);
    try {
      // 1. Obtener matriz original (ShiftService / Distribution)
      const shiftsSnap = await getDocs(
        query(collection(db, 'daily_shifts'), where('date', '==', today)),
      );

      // 2. Obtener historial real de Listero (ProgramacionDiaria) para OIT
      const { ProgramacionDiariaService } =
        await import('../../services/firestore/programacionDiaria');
      const todayProg = await ProgramacionDiariaService.getByDate(today);

      // Calcular ayer a las 12:00 local para asegurar que la resta de un día sea exacta y no salte por timezone
      const d = new Date(`${today}T12:00:00`);
      d.setDate(d.getDate() - 1);
      const tzOffset = d.getTimezoneOffset() * 60000;
      const yesterday = new Date(d.getTime() - tzOffset).toISOString().split('T')[0];
      
      const yesterdayProg = await ProgramacionDiariaService.getByDate(yesterday);

      const assignedVehicleIds = new Set<string>();
      const assignedDriverIds = new Set<string>();
      const lastEndByDriver = new Map<string, string>();

      // Matriz base
      shiftsSnap.docs.forEach((docSnap) => {
        const s = docSnap.data();
        if (s.vehicleId) assignedVehicleIds.add(String(s.vehicleId));
        if (s.driverId) {
          assignedDriverIds.add(String(s.driverId));
          const end = (s.endTime ?? s.end ?? '') as string;
          if (end) lastEndByDriver.set(String(s.driverId), end);
        }
      });

      // Verdad de campo (Listero - Operativa actual del día)
      todayProg.forEach((p) => {
        if (p.vehiculo) assignedVehicleIds.add(String(p.vehiculo));
        if (p.conductor) {
          assignedDriverIds.add(String(p.conductor));
          if (p.horaInicio) {
            const [h, m] = p.horaInicio.split(':').map(Number);
            const endH = String((h + 8) % 24).padStart(2, '0');
            lastEndByDriver.set(String(p.conductor), `${endH}:${String(m).padStart(2, '0')}`);
          }
        }
      });

      // Historial del día anterior (Listero - para regla OIT de choferes retén)
      yesterdayProg.forEach((p) => {
        if (
          p.conductor &&
          !assignedDriverIds.has(String(p.conductor)) &&
          !lastEndByDriver.has(String(p.conductor))
        ) {
          if (p.horaInicio) {
            const [h, m] = p.horaInicio.split(':').map(Number);
            const endH = String((h + 8) % 24).padStart(2, '0');
            lastEndByDriver.set(String(p.conductor), `${endH}:${String(m).padStart(2, '0')}`);
          }
        }
      });

      const res = await handleServiceInterruption(
        selectedVehicleId,
        today,
        vehicles,
        drivers,
        assignedVehicleIds,
        assignedDriverIds,
        lastEndByDriver,
      );
      setResult(res);
      toast.success('Análisis completado');
    } catch (e) {
      console.error('[Contingency] Analysis error:', e);
      toast.error('Error al ejecutar el cruce de datos de contingencia');
    } finally {
      setLoading(false);
    }
  }, [selectedVehicleId, today, vehicles, drivers]);

  /* ── Export PDF ── */
  const exportPDF = () => {
    if (!result) return;
    const doc = new jsPDF();
    const vehicle = vehicles.find((v) => String(v.id) === String(selectedVehicleId));

    doc.setFontSize(16);
    doc.text('Hoja de Contingencia — UCOT', 14, 20);
    doc.setFontSize(9);
    doc.text(`Fecha: ${today} | Unidad afectada: ${result.cocheInternalNumber}`, 14, 28);
    doc.text(`Placa / ID: ${vehicle?.plate ?? vehicle?.id ?? '—'}`, 14, 33);

    doc.setFontSize(11);
    doc.text('Servicios afectados:', 14, 42);
    autoTable(doc, {
      head: [['Servicio', 'Línea', 'Hora inicio']],
      body: result.serviciosAfectados.map((s) => [s.servicioId, s.linea, s.horaInicio ?? '—']),
      startY: 46,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [220, 38, 38] },
    });

    const afterTable =
      ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 46) + 8;
    doc.setFontSize(11);
    doc.text('Vehículos disponibles para reemplazo:', 14, afterTable);
    autoTable(doc, {
      head: [['Interno', 'Placa', 'Estado']],
      body: result.cochesLibres
        .slice(0, 5)
        .map((v) => [
          String(v.internalNumber ?? v.id),
          String(v.plate ?? '—'),
          String(v.status ?? 'OPERATIVO'),
        ]),
      startY: afterTable + 4,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [22, 163, 74] },
    });

    doc.save(`contingencia_${today}_unidad_${result.cocheInternalNumber}.pdf`);
  };

  const vehicleSelected = vehicles.find((v) => String(v.id) === selectedVehicleId);

  /* ─── RENDER ─────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center">
            <Shield className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">
              Centro de Contingencias
            </h1>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
              Reemplazo automático de vehículos · {today}
              {result?.esFeriado && (
                <span className="px-2 py-0.5 rounded bg-cyan-900/40 text-cyan-400 font-bold tracking-wider uppercase text-[10px] border border-cyan-800">
                  FERIADO: Grilla {result.tipoHorario ?? 'DOMINGO'}
                </span>
              )}
            </p>
          </div>
        </div>
        {result && (
          <button
            onClick={exportPDF}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-600/80 border border-blue-500/30 text-xs text-white hover:bg-blue-600 transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            Hoja PDF
          </button>
        )}
      </div>

      {/* Selector de vehículo */}
      <div className="rounded-2xl border border-white/[0.06] bg-slate-900/60 p-5">
        <h2 className="text-sm font-black text-white mb-4 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-orange-400" />
          Vehículo fuera de servicio
        </h2>
        {dataLoading ? (
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Cargando flota desde Firestore…
          </div>
        ) : (
          <div className="flex flex-col md:flex-row gap-3">
            <select
              aria-label="Seleccionar vehículo averiado"
              value={selectedVehicleId}
              onChange={(e) => {
                setSelectedVehicleId(e.target.value);
                setResult(null);
              }}
              className="flex-1 bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500/60"
            >
              <option value="">— Seleccionar vehículo averiado —</option>
              {vehicles.map((v) => (
                <option key={v.id} value={String(v.id)}>
                  Interno #{v.internalNumber ?? v.id} · {v.plate ?? 'Sin placa'} ·{' '}
                  {String(v.status ?? 'ACTIVO')}
                </option>
              ))}
            </select>
            <button
              onClick={() => void analizar()}
              disabled={!selectedVehicleId || loading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-bold hover:bg-orange-500 transition-all disabled:opacity-40"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              Analizar Contingencia
            </button>
          </div>
        )}

        {vehicleSelected && (
          <div className="mt-3 flex items-center gap-3 text-xs text-slate-400">
            <Bus className="w-3.5 h-3.5" />
            Interno #{vehicleSelected.internalNumber ?? vehicleSelected.id} ·{' '}
            <span className="text-white">{vehicleSelected.plate ?? '—'}</span> · Estado:{' '}
            <span className="text-orange-400 font-bold">
              {String(vehicleSelected.status ?? '—')}
            </span>
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-orange-500" />
        </div>
      )}

      {/* Resultado */}
      {result && !loading && (
        <div className="space-y-4">
          {/* Servicios afectados */}
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
            <h2 className="text-sm font-black text-red-300 mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Servicios afectados hoy ({result.serviciosAfectados.length})
            </h2>
            {result.serviciosAfectados.length === 0 ? (
              <p className="text-sm text-slate-500">
                Este vehículo no tiene servicios asignados para hoy.
              </p>
            ) : (
              <div className="space-y-2">
                {result.serviciosAfectados.map((s) => (
                  <div
                    key={s.servicioId}
                    className="flex items-center gap-3 bg-slate-900/60 rounded-xl p-3"
                  >
                    <Bus className="w-4 h-4 text-red-400 shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-white">{s.servicioId}</p>
                      <p className="text-xs text-slate-500">
                        Línea {s.linea}
                        {s.horaInicio && (
                          <>
                            {' '}
                            · <Clock className="w-3 h-3 inline" /> {s.horaInicio}
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Coches disponibles */}
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
            <h2 className="text-sm font-black text-emerald-300 mb-3 flex items-center gap-2">
              <Bus className="w-4 h-4" />
              Vehículos disponibles ({result.cochesLibres.length})
            </h2>
            {result.cochesLibres.length === 0 ? (
              <p className="text-sm text-amber-400 font-semibold">
                ⚠️ Sin vehículos libres disponibles. Consultar reserva externa.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {result.cochesLibres.slice(0, 9).map((v, i) => (
                  <div
                    key={String(v.id)}
                    className={`rounded-xl p-3 border ${i === 0 ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-white/5 bg-slate-900/60'}`}
                  >
                    <div className="flex items-center gap-2">
                      {i === 0 && <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />}
                      <div>
                        <p className="text-sm font-bold text-white">
                          #{v.internalNumber ?? v.id}
                          {i === 0 && (
                            <span className="ml-2 text-xs text-emerald-400 font-bold">
                              SUGERIDO
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500">
                          {String(v.plate ?? '—')} · {String(v.status ?? 'OPERATIVO')}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                {result.cochesLibres.length > 9 && (
                  <div className="rounded-xl p-3 border border-white/5 bg-slate-800/40 flex items-center justify-center">
                    <span className="text-xs text-slate-500">
                      +{result.cochesLibres.length - 9} más disponibles
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Conductores retén */}
          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-5">
            <h2 className="text-sm font-black text-blue-300 mb-3 flex items-center gap-2">
              <UserIcon className="w-4 h-4" />
              Conductores retén disponibles ({result.choferesReten.length})
            </h2>
            {result.choferesReten.length === 0 ? (
              <p className="text-sm text-amber-400 font-semibold">
                ⚠️ Sin conductores disponibles. Verificar horas trabajadas y turnos.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {result.choferesReten.slice(0, 6).map((d, i) => (
                  <div
                    key={String(d.id ?? d.uid)}
                    className={`rounded-xl p-3 border ${i === 0 ? 'border-blue-500/40 bg-blue-500/10' : 'border-white/5 bg-slate-900/60'}`}
                  >
                    <div className="flex items-center gap-2">
                      <UserIcon className="w-4 h-4 text-blue-400 shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-white">
                          {String(d.displayName ?? d.name ?? d.email ?? d.id)}
                          {i === 0 && (
                            <span className="ml-2 text-xs text-blue-400 font-bold">SUGERIDO</span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500">{String(d.email ?? '—')}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sugerencias por punto de control */}
          {result.sugerenciaPorPuntoControl.length > 0 && (
            <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-5">
              <h2 className="text-sm font-black text-purple-300 mb-3 flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Sugerencia de intervención por Punto de Control
              </h2>
              <div className="space-y-2">
                {result.sugerenciaPorPuntoControl.map((s, i) => (
                  <div
                    key={`${s.puntoControl}-${i}`}
                    className="flex items-center gap-3 bg-slate-900/60 rounded-xl p-3"
                  >
                    <MapPin className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <p className="text-sm text-white">
                      <span className="font-bold">{s.puntoControl}</span>
                      <span className="text-slate-400 ml-2">
                        → Servicio {s.servicioId} · Línea {s.linea}
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sin resultado y sin selección */}
      {!result && !loading && !selectedVehicleId && !dataLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
          <Shield className="w-12 h-12 text-slate-700" />
          <p className="text-sm font-semibold">
            Selecciona un vehículo para ejecutar el análisis de contingencia
          </p>
          <p className="text-xs text-slate-600">
            El sistema identificará servicios afectados y propondrá reemplazos automáticamente
          </p>
        </div>
      )}
    </div>
  );
}
