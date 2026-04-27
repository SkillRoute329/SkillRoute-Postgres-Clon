import React, { useEffect, useState, useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Plus,
  Search,
  Settings,
  Briefcase,
  Trash2,
  Camera,
  Cpu,
  TrendingUp,
  DollarSign,
  ChevronRight,
  Building2,
  Download,
  Printer,
  Wrench,
  X,
} from 'lucide-react';
import {
  MaintenanceService,
  FleetService,
  DepartmentService,
  UniversalService,
} from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';
import * as XLSX from 'xlsx';
import clsx from 'clsx';
import {
  getAllVersiones, getValorActual, PARAMETRO_META as PM_META,
  type VersionParametro, type ParametroId,
} from '../../services/parametrosService';

const STATUS_CONFIG: any = {
  ENVIADO: { label: 'Enviado', color: 'bg-yellow-500/20 text-yellow-400', icon: Clock },
  RECIBIDO: { label: 'Recibido', color: 'bg-blue-500/20 text-blue-400', icon: CheckCircle },
  EN_PROCESO: { label: 'En Proceso', color: 'bg-indigo-500/20 text-indigo-400', icon: Settings },
  PROGRAMADO: { label: 'Programado', color: 'bg-purple-500/20 text-purple-400', icon: Clock },
  DESCARTADO: { label: 'Descartado', color: 'bg-slate-500/20 text-slate-400', icon: AlertTriangle },
  FINALIZADO: { label: 'Finalizado', color: 'bg-green-500/20 text-green-400', icon: CheckCircle },
};

const MaintenanceDashboard = () => {
  const { empresaPropia, setEmpresaPropia, empresaCfg } = useEmpresaPropia();
  const [reports, setReports] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCheck, setFilterCheck] = useState('all'); // all, pending, process
  const [predictorMode, setPredictorMode] = useState(false);
  const [allReports, setAllReports] = useState<any[]>([]);
  const [simParams, setSimParams] = useState<Record<ParametroId, VersionParametro[]> | null>(null);

  // Create Report Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newReport, setNewReport] = useState({
    vehicleId: '',
    departmentId: '',
    title: '',
    description: '',
    priority: 'NORMAL',
    photoUrl: '', // Will keep compatibility
    evidencePhotos: '', // Base64
  });

  // Solve/Close Ticket Modal State
  const [processModalOpen, setProcessModalOpen] = useState(false);
  const [auditReport, setAuditReport] = useState<any>(null);
  const [solution, setSolution] = useState('');
  const [availableParts, setAvailableParts] = useState<any[]>([]);
  const [selectedPartId, setSelectedPartId] = useState('');
  const [selectedQty, setSelectedQty] = useState(1);
  const [usedParts, setUsedParts] = useState<any[]>([]); // { partId, sku, description, quantity }

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const [vData, dData] = await Promise.all([
          FleetService.getVehicles(),
          DepartmentService.getAll(),
        ]);
        setVehicles(vData);
        setDepartments(dData);
        fetchReports();

        // Fetch Parts for autocomplete
        UniversalService.list('parts', 1, 1000)
          .then((res: any) => {
            setAvailableParts(res.data || []);
          })
          .catch(() => console.error('Error loading parts'));
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // Cargar todos los reportes (sin filtro) para el predictor
  useEffect(() => {
    MaintenanceService.getAll({} as any)
      .then((data: any[]) => setAllReports(data))
      .catch(() => {});
    getAllVersiones().then(setSimParams).catch(() => {});
  }, []);

  const fetchReports = async () => {
    try {
      const data = await MaintenanceService.getAll(
        (filterCheck !== 'all' ? { status: filterCheck } : {}) as { vehicleId?: string },
      );
      setReports(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Optimistic Loading State or dedicated upload state could be used
      // but we reuse the main form since it blocks submit usually
      // Here we just fire and forget, blocking via async if we wanted.

      try {
        const res = await MaintenanceService.uploadFile(file);
        if (res.url) {
          setNewReport({ ...newReport, evidencePhotos: res.url });
          // Optional: Toast success
        }
      } catch (error) {
        console.error('Upload failed', error);
        alert('Error al subir imagen');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await MaintenanceService.create(newReport);
      setIsModalOpen(false);
      fetchReports();
      setNewReport({
        vehicleId: '',
        departmentId: '',
        title: '',
        description: '',
        priority: 'NORMAL',
        photoUrl: '',
        evidencePhotos: '',
      });
    } catch (error) {
      alert('Error al crear reporte');
    }
  };

  const handleOpenProcess = (report: any) => {
    setAuditReport(report);
    setSolution('');
    setUsedParts([]);
    setProcessModalOpen(true);
  };

  const handleAddPart = () => {
    if (!selectedPartId) return;
    const part = availableParts.find((p) => String(p.id) === selectedPartId);
    if (!part) return;

    setUsedParts((prev) => [
      ...prev,
      {
        partId: part.id,
        sku: part.sku,
        description: part.description,
        quantity: selectedQty,
      },
    ]);

    setSelectedPartId('');
    setSelectedQty(1);
  };

  const handleRemovePart = (index: number) => {
    setUsedParts((prev) => prev.filter((_, i) => i !== index));
  };

  // --- RBAC CHECK ---
  const { user } = useAuth(); // Import useAuth hook at top level first! This snippet assumes useAuth is imported.
  // However, I need to add useAuth import at top of file first.

  const handleCloseTicket = async () => {
    if (!auditReport) return;

    // RBAC: Only Admin/SuperAdmin/Encargado
    // Assuming 'Encargado' role exists or is mapped to Admin/SuperAdmin permissions for this module.
    // If strictly 'Encargado' is a role string:
    const authorizedRoles = ['Admin', 'SuperAdmin', 'Encargado'];
    if (!user || !authorizedRoles.includes(user.role)) {
      alert('Acceso Denegado: Solo el Encargado de Taller o Admin puede cerrar tickets.');
      return;
    }

    // VALIDATION: Mandatory Description
    if (!solution || solution.trim().length < 5) {
      alert(
        'REQUISITO: Debe detallar la solución técnica aplicada par poder cerrar la incidencia.',
      );
      return;
    }

    // Confirmation (Implicit in "Confirmar y Cerrar" button, but let's be double sure if critical)
    if (!confirm('¿Confirma que el vehículo está reparado y listo para operar?')) return;

    try {
      await MaintenanceService.closeTicket(auditReport.id, {
        solution,
        partsUsed: usedParts,
      });
      setProcessModalOpen(false);
      fetchReports();
      alert('Ticket cerrado correctamente. Stock actualizado.');
    } catch (error) {
      console.error(error);
      alert('Error al cerrar ticket');
    }
  };

  // ── Predictor de Quiebres ────────────────────────────────────────────────
  const predictorRiesgos = useMemo(() => {
    if (vehicles.length === 0 && allReports.length === 0) return [];

    const costoFallaBajo = simParams
      ? getValorActual(simParams.costo_falla_bajo, PM_META.costo_falla_bajo.defaultValor)
      : PM_META.costo_falla_bajo.defaultValor;
    const costoFallaAlto = simParams
      ? getValorActual(simParams.costo_falla_alto, PM_META.costo_falla_alto.defaultValor)
      : PM_META.costo_falla_alto.defaultValor;

    const MTBF_DEFAULT_DIAS = 120; // si solo hay 1 falla registrada, asumimos 120 días entre fallas

    // Agrupar reportes FINALIZADO por vehículo
    const byVehicle: Record<string, { internalNumber: string; plate?: string; fallas: Date[]; titulo: string }> = {};

    // Inicializar todos los vehículos
    for (const v of vehicles) {
      byVehicle[v.id] = { internalNumber: v.internalNumber, plate: v.plate, fallas: [], titulo: '' };
    }

    // Agregar fechas de falla
    for (const r of allReports) {
      if (r.status !== 'FINALIZADO') continue;
      const vid = r.vehicleId;
      if (!vid) continue;
      if (!byVehicle[vid]) {
        byVehicle[vid] = {
          internalNumber: r.vehicle?.internalNumber ?? vid,
          plate: r.vehicle?.plate,
          fallas: [],
          titulo: '',
        };
      }
      byVehicle[vid].fallas.push(new Date(r.createdAt));
      // Guardar el título de la última falla
      const d = new Date(r.createdAt);
      const last = byVehicle[vid].fallas.reduce((a, b) => (a > b ? a : b), new Date(0));
      if (d >= last) byVehicle[vid].titulo = r.title ?? '';
    }

    const hoy = new Date();

    return Object.entries(byVehicle).map(([vehicleId, info]) => {
      const fallas = info.fallas.sort((a, b) => a.getTime() - b.getTime());
      const fallaCount = fallas.length;

      let mtbfDias: number | null = null;
      let diasHastaProxima: number | null = null;
      let ultimaFalla: Date | null = null;

      if (fallaCount >= 2) {
        let totalDiff = 0;
        for (let i = 1; i < fallas.length; i++) {
          totalDiff += (fallas[i].getTime() - fallas[i - 1].getTime()) / 86_400_000;
        }
        mtbfDias = Math.round(totalDiff / (fallas.length - 1));
        ultimaFalla = fallas[fallas.length - 1];
        diasHastaProxima = Math.round(
          (ultimaFalla.getTime() + mtbfDias * 86_400_000 - hoy.getTime()) / 86_400_000,
        );
      } else if (fallaCount === 1) {
        ultimaFalla = fallas[0];
        mtbfDias = MTBF_DEFAULT_DIAS;
        diasHastaProxima = Math.round(
          (ultimaFalla.getTime() + MTBF_DEFAULT_DIAS * 86_400_000 - hoy.getTime()) / 86_400_000,
        );
      }

      let semaforo: 'rojo' | 'amarillo' | 'verde' | 'desconocido';
      if (diasHastaProxima === null) semaforo = 'desconocido';
      else if (diasHastaProxima <= 30) semaforo = 'rojo';
      else if (diasHastaProxima <= 90) semaforo = 'amarillo';
      else semaforo = 'verde';

      return {
        vehicleId,
        internalNumber: info.internalNumber,
        plate: info.plate,
        fallaCount,
        ultimaFalla,
        ultimaFallaTitulo: info.titulo,
        mtbfDias,
        diasHastaProxima,
        semaforo,
        costoFallaBajo,
        costoFallaAlto,
      };
    }).sort((a, b) => {
      const orden = { rojo: 0, amarillo: 1, verde: 2, desconocido: 3 };
      if (orden[a.semaforo] !== orden[b.semaforo]) return orden[a.semaforo] - orden[b.semaforo];
      return (a.diasHastaProxima ?? 999) - (b.diasHastaProxima ?? 999);
    });
  }, [vehicles, allReports, simParams]);

  const rojosCount   = predictorRiesgos.filter(v => v.semaforo === 'rojo').length;
  const riesgoTotal  = rojosCount * Math.round(
    ((simParams ? getValorActual(simParams.costo_falla_bajo, PM_META.costo_falla_bajo.defaultValor) : PM_META.costo_falla_bajo.defaultValor) +
     (simParams ? getValorActual(simParams.costo_falla_alto, PM_META.costo_falla_alto.defaultValor) : PM_META.costo_falla_alto.defaultValor)) / 2,
  );

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total = reports.length;
    const counts: Record<string, number> = {};
    for (const r of reports) {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
    }
    return {
      total,
      enviados: counts.ENVIADO ?? 0,
      enProceso: (counts.EN_PROCESO ?? 0) + (counts.RECIBIDO ?? 0),
      finalizados: counts.FINALIZADO ?? 0,
      programados: counts.PROGRAMADO ?? 0,
    };
  }, [reports]);

  // ── Acciones ─────────────────────────────────────────────────────────────
  const handleExport = () => {
    if (reports.length === 0) return;
    const wb = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(
      reports.map((r) => ({
        Coche: r.vehicle?.internalNumber ?? r.vehicleId ?? '',
        Departamento: r.department?.name ?? '',
        Título: r.title ?? '',
        Descripción: r.description ?? '',
        Prioridad: r.priority ?? '',
        Estado: STATUS_CONFIG[r.status]?.label ?? r.status,
        Solución: r.solution ?? '',
        'Creado': r.createdAt ?? '',
        'Resuelto': r.solvedAt ?? '',
      })),
    );
    XLSX.utils.book_append_sheet(wb, sheet, 'Mantenimiento');
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `mantenimiento-${empresaCfg.label}-${stamp}.xlsx`);
  };

  const handlePrint = () => window.print();

  return (
    <div className="space-y-4 animate-fade-in-up print:space-y-2">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Settings className="w-8 h-8 text-primary-500" />
            Mantenimiento y Denuncias
            <span className="text-primary-400">— {empresaCfg.label}</span>
          </h1>
          <p className="text-slate-400">Gestión de novedades, roturas y mantenimientos de flota.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Building2 className="w-3 h-3 text-slate-500" />
          <select
            value={empresaPropia}
            onChange={(e) => setEmpresaPropia(Number(e.target.value))}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
            title="Operador propio (sincronizado)"
          >
            <option value={70}>UCOT</option>
            <option value={50}>CUTCSA</option>
            <option value={20}>COME</option>
            <option value={10}>COETC</option>
          </select>
          <button
            onClick={handleExport}
            disabled={reports.length === 0}
            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-600/40 text-emerald-300 rounded-lg text-xs font-bold disabled:opacity-40"
          >
            <Download className="w-3 h-3" /> Excel
          </button>
          <button
            onClick={handlePrint}
            disabled={reports.length === 0}
            className="flex items-center gap-1 px-3 py-1.5 bg-slate-700/40 hover:bg-slate-700/80 border border-slate-600 text-slate-300 rounded-lg text-xs font-bold disabled:opacity-40"
          >
            <Printer className="w-3 h-3" /> Print
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus className="w-5 h-5" /> Nueva Denuncia
          </button>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block print:p-3 print:border-b print:border-slate-400">
        <h1 className="text-xl font-black text-black">
          Mantenimiento {empresaCfg.label} — {new Date().toLocaleDateString('es-UY')}
        </h1>
        <p className="text-xs text-slate-700 mt-1">
          {kpis.total} reportes · {kpis.enProceso} en proceso · {kpis.finalizados} finalizados
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
        <MaintKpi label="Total reportes" value={kpis.total} color="text-white" icon={Wrench} />
        <MaintKpi label="Enviados" value={kpis.enviados} color="text-yellow-300" icon={Clock} />
        <MaintKpi
          label="En proceso"
          value={kpis.enProceso}
          color="text-blue-300"
          icon={Settings}
        />
        <MaintKpi
          label="Programados"
          value={kpis.programados}
          color="text-purple-300"
          icon={Clock}
        />
        <MaintKpi
          label="Finalizados"
          value={kpis.finalizados}
          color="text-emerald-300"
          icon={CheckCircle}
        />
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setPredictorMode(true)}
          className={clsx(
            'px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2',
            predictorMode
              ? 'bg-amber-600 text-white'
              : 'bg-amber-900/30 border border-amber-600/30 text-amber-400 hover:bg-amber-800/40',
          )}
        >
          <Cpu className="w-3.5 h-3.5" /> Predictor de Quiebres
          {rojosCount > 0 && (
            <span className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">{rojosCount}</span>
          )}
        </button>
        {['all', 'ENVIADO', 'EN_PROCESO', 'FINALIZADO'].map((status) => (
          <button
            key={status}
            onClick={() => { setFilterCheck(status); setPredictorMode(false); }}
            className={clsx(
              'px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap',
              !predictorMode && filterCheck === status
                ? 'bg-primary-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white',
            )}
          >
            {status === 'all' ? 'Todos' : STATUS_CONFIG[status]?.label || status}
          </button>
        ))}
      </div>

      {/* ── Predictor de Quiebres ── */}
      {predictorMode && (
        <div className="space-y-4">
          {/* Número grande: riesgo financiero */}
          <div className="bg-amber-950/30 border border-amber-500/30 rounded-2xl p-6 text-center">
            <p className="text-[10px] text-amber-400/70 uppercase tracking-widest font-bold mb-2">
              Riesgo financiero próximos 30 días
            </p>
            <p className="text-5xl font-black text-amber-400 tracking-tight">
              ${riesgoTotal.toLocaleString('en-US')} USD
            </p>
            <p className="text-xs text-amber-400/50 mt-2">
              {rojosCount} coche{rojosCount !== 1 ? 's' : ''} en zona roja ·
              Costo estimado ${(simParams ? getValorActual(simParams.costo_falla_bajo, PM_META.costo_falla_bajo.defaultValor) : 5000).toLocaleString('en-US')}–$
              {(simParams ? getValorActual(simParams.costo_falla_alto, PM_META.costo_falla_alto.defaultValor) : 15000).toLocaleString('en-US')} USD por falla
              {!simParams && <span className="text-slate-500"> · parámetros por defecto</span>}
            </p>
          </div>

          {/* Semáforo por coche */}
          {predictorRiesgos.length === 0 ? (
            <div className="text-center py-12 bg-slate-900 rounded-xl border border-slate-800">
              <Search className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">Sin datos de vehículos aún.</p>
              <p className="text-slate-600 text-xs mt-1">Los tickets FINALIZADO se usarán para calcular el historial de fallas.</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {predictorRiesgos.map((v) => {
                const colorMap = {
                  rojo:        { bg: 'bg-red-950/40 border-red-500/40',     dot: 'bg-red-500',     text: 'text-red-400',    label: 'FALLA INMINENTE' },
                  amarillo:    { bg: 'bg-amber-950/30 border-amber-500/30', dot: 'bg-amber-400',   text: 'text-amber-400',  label: 'RIESGO MEDIO'    },
                  verde:       { bg: 'bg-emerald-950/20 border-emerald-700/30', dot: 'bg-emerald-500', text: 'text-emerald-400', label: 'ESTABLE'     },
                  desconocido: { bg: 'bg-slate-900 border-slate-700/40',   dot: 'bg-slate-600',   text: 'text-slate-500',  label: 'SIN HISTORIAL'   },
                };
                const c = colorMap[v.semaforo];

                return (
                  <div key={v.vehicleId} className={`border rounded-xl p-4 ${c.bg}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-full flex-none ${c.dot} ${v.semaforo === 'rojo' ? 'animate-pulse' : ''}`} />
                        <span className="text-base font-black text-white">Coche #{v.internalNumber}</span>
                        {v.plate && <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">{v.plate}</span>}
                      </div>
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${c.bg} ${c.text}`}>{c.label}</span>
                    </div>

                    {v.semaforo !== 'desconocido' && v.diasHastaProxima !== null && (
                      <div className="mb-3">
                        <p className={`text-2xl font-black ${c.text}`}>
                          {v.diasHastaProxima <= 0 ? 'HOY' : `${v.diasHastaProxima} días`}
                        </p>
                        <p className="text-[10px] text-slate-500">hasta próxima falla estimada</p>
                      </div>
                    )}

                    <div className="space-y-1 text-[11px]">
                      {v.semaforo === 'rojo' && (
                        <div className="flex items-center gap-1.5 text-red-300 bg-red-500/10 rounded-lg px-2.5 py-1.5">
                          <DollarSign className="w-3 h-3 flex-none" />
                          <span className="font-bold">${v.costoFallaBajo.toLocaleString('en-US')}–${v.costoFallaAlto.toLocaleString('en-US')} USD estimado</span>
                        </div>
                      )}
                      {v.ultimaFalla && (
                        <div className="text-slate-500 flex items-center gap-1.5 px-1">
                          <Clock className="w-3 h-3 flex-none" />
                          Última falla: {v.ultimaFalla.toLocaleDateString('es-UY')}
                          {v.ultimaFallaTitulo && ` — ${v.ultimaFallaTitulo}`}
                        </div>
                      )}
                      {v.mtbfDias && (
                        <div className="text-slate-600 flex items-center gap-1.5 px-1">
                          <TrendingUp className="w-3 h-3 flex-none" />
                          MTBF: {v.mtbfDias} días · {v.fallaCount} falla{v.fallaCount !== 1 ? 's' : ''} registrada{v.fallaCount !== 1 ? 's' : ''}
                          {v.fallaCount === 1 && <span className="text-[9px] text-slate-700"> (estimado)</span>}
                        </div>
                      )}
                      {v.semaforo === 'desconocido' && (
                        <p className="text-slate-600 px-1">Sin tickets FINALIZADO — imposible predecir.</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Reports Grid */}
      {!predictorMode && (loading ? (
        <div className="text-center py-12 text-slate-400">Cargando reportes...</div>
      ) : reports.length === 0 ? (
        <div className="text-center py-12 bg-slate-900 rounded-xl border border-slate-800">
          <Search className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-white">Sin Novedades</h3>
          <p className="text-slate-400">No hay reportes que coincidan con los filtros.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {reports.map((report) => (
            <div
              key={report.id}
              className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors flex flex-col relative group"
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <div className="font-bold text-xl text-white">
                    Unit {report.vehicle?.internalNumber}
                  </div>
                  {report.vehicle?.plate && (
                    <div className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                      {report.vehicle.plate}
                    </div>
                  )}
                </div>
                <div
                  className={clsx(
                    'px-2 py-1 rounded text-xs font-bold flex items-center gap-1',
                    STATUS_CONFIG[report.status]?.color,
                  )}
                >
                  {STATUS_CONFIG[report.status]?.label || report.status}
                </div>
              </div>

              <h3 className="font-medium text-white mb-1 truncate">{report.title}</h3>
              <p className="text-sm text-slate-400 line-clamp-2 mb-4 flex-1">
                {report.description}
              </p>

              {/* Process Button Overlay */}
              {report.status !== 'FINALIZADO' && (
                <div className="absolute top-4 right-4">
                  <button
                    onClick={() => handleOpenProcess(report)}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white p-2 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Resolver / Cerrar Ticket"
                  >
                    <CheckCircle className="w-5 h-5" />
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-800 text-xs text-slate-500">
                <div className="flex items-center gap-1">
                  <Briefcase className="w-3 h-3" />
                  {report.department?.name || 'General'}
                </div>
                <div>{new Date(report.createdAt).toLocaleDateString()}</div>
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* New Report Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 w-full max-w-lg rounded-2xl border border-slate-800 shadow-xl p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">Nueva Denuncia / Reporte</h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Vehículo / Coche</label>
                  <select
                    className="input-field w-full"
                    value={newReport.vehicleId}
                    onChange={(e) => setNewReport({ ...newReport, vehicleId: e.target.value })}
                    required
                  >
                    <option value="">Seleccionar...</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.internalNumber} - {v.plate}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Área Destino</label>
                  <select
                    className="input-field w-full"
                    value={newReport.departmentId}
                    onChange={(e) => setNewReport({ ...newReport, departmentId: e.target.value })}
                  >
                    <option value="">General / Sin Asignar</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Título Breve</label>
                <input
                  type="text"
                  className="input-field w-full"
                  placeholder="Ej. Luz trasera quemada, Aire no enfría"
                  value={newReport.title}
                  onChange={(e) => setNewReport({ ...newReport, title: e.target.value })}
                  required
                />
              </div>

              {/* Evidence Photo Upload */}
              <div>
                <label className="block text-sm text-slate-400 mb-1 cursor-pointer flex items-center gap-2">
                  <Camera className="w-4 h-4" />
                  Foto de Evidencia
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="block w-full text-sm text-slate-400
                                        file:mr-4 file:py-2 file:px-4
                                        file:rounded-full file:border-0
                                        file:text-sm file:font-semibold
                                        file:bg-primary-600 file:text-white
                                        hover:file:bg-primary-500
                                    "
                />
                {newReport.evidencePhotos && (
                  <div className="mt-2">
                    <img
                      src={newReport.evidencePhotos}
                      alt="Preview"
                      className="h-20 w-auto rounded border border-slate-700 object-cover"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Descripción Detallada</label>
                <textarea
                  className="input-field w-full"
                  rows={3}
                  placeholder="Describa el problema..."
                  value={newReport.description}
                  onChange={(e) => setNewReport({ ...newReport, description: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Prioridad</label>
                <div className="flex gap-4">
                  {['LOW', 'NORMAL', 'HIGH', 'CRITICAL'].map((p) => (
                    <label key={p} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="priority"
                        value={p}
                        checked={newReport.priority === p}
                        onChange={(e) => setNewReport({ ...newReport, priority: e.target.value })}
                        className="accent-primary-500"
                      />
                      <span className="text-sm text-slate-300 capitalize">{p.toLowerCase()}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2 text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button type="submit" className="flex-1 btn btn-primary py-2">
                  Crear Reporte
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Process/Close Ticket Modal */}
      {processModalOpen && auditReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 w-full max-w-lg rounded-2xl border border-slate-800 shadow-xl p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">Cerrar Reparación</h2>
              <button
                onClick={() => setProcessModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Body */}
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                  Solución / Trabajo realizado
                </label>
                <textarea
                  value={solution}
                  onChange={(e) => setSolution(e.target.value)}
                  rows={4}
                  className="input-field w-full mt-1"
                  placeholder="Describí el trabajo y partes reemplazadas..."
                />
              </div>

              {/* Lista de piezas usadas */}
              {usedParts.length > 0 && (
                <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2">
                    Piezas usadas ({usedParts.length})
                  </p>
                  <ul className="space-y-1">
                    {usedParts.map((p, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between text-xs bg-slate-800 rounded px-2 py-1"
                      >
                        <span className="text-slate-300">
                          {p.sku} — {p.description}
                        </span>
                        <span className="text-slate-400">x{p.quantity}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Selector autocomplete de piezas */}
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={selectedPartId}
                  onChange={(e) => setSelectedPartId(e.target.value)}
                  className="input-field col-span-2"
                >
                  <option value="">Agregar pieza...</option>
                  {availableParts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} — {p.description}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={selectedQty}
                  onChange={(e) => setSelectedQty(Number(e.target.value))}
                  min={1}
                  className="input-field"
                  placeholder="Cant."
                />
              </div>
              <button
                type="button"
                disabled={!selectedPartId}
                onClick={() => {
                  const part = availableParts.find((p) => String(p.id) === selectedPartId);
                  if (!part) return;
                  setUsedParts((prev) => [
                    ...prev,
                    { partId: part.id, sku: part.sku, description: part.description, quantity: selectedQty },
                  ]);
                  setSelectedPartId('');
                  setSelectedQty(1);
                }}
                className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded font-bold text-slate-300 disabled:opacity-40"
              >
                + Agregar pieza
              </button>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setProcessModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!auditReport) return;
                  try {
                    await MaintenanceService.solveReport(auditReport.id, {
                      solution,
                      partsUsed: usedParts,
                    });
                    setProcessModalOpen(false);
                    setSolution('');
                    setUsedParts([]);
                    setAuditReport(null);
                    fetchReports();
                  } catch (e) {
                    console.error(e);
                    alert('Error al cerrar reparación');
                  }
                }}
                disabled={!solution.trim()}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm disabled:opacity-40"
              >
                Cerrar reparación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Helper KPI mantenimiento ─────────────────────────────────────────────
function MaintKpi({
  label,
  value,
  color,
  icon: Icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 print:bg-white print:border-slate-400">
      <div className="text-[9px] text-slate-500 uppercase tracking-wider font-bold flex items-center gap-1 print:text-black">
        <Icon className="w-3 h-3" />
        {label}
      </div>
      <div className={`text-xl font-black mt-0.5 tabular-nums ${color} print:text-black`}>
        {value.toLocaleString('es-UY')}
      </div>
    </div>
  );
}

export default MaintenanceDashboard;
