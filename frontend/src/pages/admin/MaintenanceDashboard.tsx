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
  Calendar,
  Clipboard,
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
  WithDamages: { label: 'Con daños', color: 'bg-orange-500/20 text-orange-400', icon: AlertTriangle },
  OK: { label: 'OK', color: 'bg-emerald-500/20 text-emerald-400', icon: CheckCircle },
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

  // EAM State variables (Sprints 9-10)
  const [activeTab, setActiveTab] = useState<'incidencias' | 'work_orders' | 'lifecycle' | 'reliability'>('incidencias');
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [inspections, setInspections] = useState<any[]>([]);
  const [isWorkOrderModalOpen, setIsWorkOrderModalOpen] = useState(false);
  const [newWorkOrder, setNewWorkOrder] = useState({
    cocheId: '',
    tipo: 'CORRECTIVO',
    title: '',
    description: '',
    category: 'CONSUMIBLES',
    assignedTo: '',
    priority: 'MEDIA',
    status: 'PROGRAMADO',
    fecha: new Date().toISOString().slice(0, 10),
    partsUsed: [] as any[],
    solution: '',
  });
  const [selectedVehicleIdForLifecycle, setSelectedVehicleIdForLifecycle] = useState('');
  const [isCloseWorkOrderModalOpen, setIsCloseWorkOrderModalOpen] = useState(false);
  const [selectedWorkOrderToClose, setSelectedWorkOrderToClose] = useState<any>(null);
  const [woSolution, setWoSolution] = useState('');
  const [woUsedParts, setWoUsedParts] = useState<any[]>([]);
  const [woSelectedPartId, setWoSelectedPartId] = useState('');
  const [woSelectedQty, setWoSelectedQty] = useState(1);

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
        await Promise.all([
          fetchReports(),
          fetchWorkOrders(),
          fetchInspections()
        ]);

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

  const fetchWorkOrders = async () => {
    try {
      const res = await UniversalService.list('work_orders', 1, 1000);
      setWorkOrders(res.data || []);
    } catch (error) {
      console.error('Error fetching work orders:', error);
    }
  };

  const fetchInspections = async () => {
    try {
      const res = await UniversalService.list('inspections', 1, 1000);
      setInspections(res.data || []);
    } catch (error) {
      console.error('Error fetching inspections:', error);
    }
  };

  const handleWorkOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkOrder.cocheId || !newWorkOrder.title) {
      alert('Por favor complete el coche y el título de la orden.');
      return;
    }
    try {
      const dataToSave = {
        ...newWorkOrder,
        agencyId: '70', // UCOT
        estado: newWorkOrder.status,
        coche_id: newWorkOrder.cocheId,
        tipo: newWorkOrder.tipo,
        fecha: newWorkOrder.fecha,
      };
      
      await UniversalService.create('work_orders', dataToSave);
      
      setIsWorkOrderModalOpen(false);
      setNewWorkOrder({
        cocheId: '',
        tipo: 'CORRECTIVO',
        title: '',
        description: '',
        category: 'CONSUMIBLES',
        assignedTo: '',
        priority: 'MEDIA',
        status: 'PROGRAMADO',
        fecha: new Date().toISOString().slice(0, 10),
        partsUsed: [],
        solution: '',
      });
      
      await fetchWorkOrders();
      const partsRes = await UniversalService.list('parts', 1, 1000);
      setAvailableParts(partsRes.data || []);
      alert('Orden de trabajo creada con éxito.');
    } catch (err) {
      console.error(err);
      alert('Error al crear orden de trabajo.');
    }
  };

  const handleCloseWorkOrder = async () => {
    if (!selectedWorkOrderToClose) return;
    if (!woSolution || woSolution.trim().length < 5) {
      alert('Debe detallar la solución técnica aplicada (mínimo 5 caracteres).');
      return;
    }
    if (!confirm('¿Confirma que la orden de trabajo está finalizada?')) return;
    try {
      const updatedData = {
        ...selectedWorkOrderToClose,
        status: 'FINALIZADO',
        estado: 'FINALIZADO',
        solution: woSolution,
        partsUsed: woUsedParts,
      };
      await UniversalService.update('work_orders', selectedWorkOrderToClose.id, updatedData);
      
      setIsCloseWorkOrderModalOpen(false);
      setSelectedWorkOrderToClose(null);
      setWoSolution('');
      setWoUsedParts([]);
      
      await fetchWorkOrders();
      const partsRes = await UniversalService.list('parts', 1, 1000);
      setAvailableParts(partsRes.data || []);
      alert('Orden de trabajo finalizada y stock actualizado.');
    } catch (err) {
      console.error(err);
      alert('Error al finalizar orden de trabajo.');
    }
  };

  const handleDeleteWorkOrder = async (id: string) => {
    if (!confirm('¿Seguro que desea eliminar esta orden de trabajo?')) return;
    try {
      await UniversalService.delete('work_orders', id);
      await fetchWorkOrders();
    } catch (err) {
      console.error(err);
      alert('Error al eliminar orden de trabajo.');
    }
  };

  // EAM Calculations
  const averageMttrHours = useMemo(() => {
    const closed = allReports.filter(
      (r) => r.status === 'CLOSED' || r.status === 'FINALIZADO' || r.estado === 'CLOSED' || r.estado === 'FINALIZADO'
    );
    if (closed.length === 0) return 0;
    let totalHours = 0;
    let count = 0;
    for (const r of closed) {
      const created = r.createdAt ? new Date(r.createdAt) : (r.created_at ? new Date(r.created_at) : null);
      const updated = r.updatedAt ? new Date(r.updatedAt) : (r.updated_at ? new Date(r.updated_at) : null);
      if (created && updated && !isNaN(created.getTime()) && !isNaN(updated.getTime())) {
        const diff = (updated.getTime() - created.getTime()) / (1000 * 3600);
        if (diff > 0) {
          totalHours += diff;
          count++;
        }
      }
    }
    return count > 0 ? Math.round(totalHours / count) : 24;
  }, [allReports]);

  const vehiclesMtbf = useMemo(() => {
    const result: Array<{ vehicleId: string; internalNumber: string; plate?: string; mtbfDias: number | string; count: number }> = [];
    for (const v of vehicles) {
      const vReports = allReports.filter(
        (r) => String(r.vehicleId) === String(v.id) || String(r.coche_id) === String(v.id) || String(r.cocheId) === String(v.id)
      );
      if (vReports.length === 0) {
        result.push({ vehicleId: v.id, internalNumber: v.internalNumber, plate: v.plate, mtbfDias: 'Sin fallas', count: 0 });
        continue;
      }
      const sorted = vReports
        .map((r) => r.createdAt ? new Date(r.createdAt) : (r.created_at ? new Date(r.created_at) : new Date()))
        .filter((d) => !isNaN(d.getTime()))
        .sort((a, b) => a.getTime() - b.getTime());

      if (sorted.length >= 2) {
        const diffDays = (sorted[sorted.length - 1].getTime() - sorted[0].getTime()) / (1000 * 3600 * 24);
        const mtbf = Math.round(diffDays / (sorted.length - 1));
        result.push({ vehicleId: v.id, internalNumber: v.internalNumber, plate: v.plate, mtbfDias: mtbf > 0 ? mtbf : 1, count: sorted.length });
      } else if (sorted.length === 1) {
        result.push({ vehicleId: v.id, internalNumber: v.internalNumber, plate: v.plate, mtbfDias: 120, count: 1 });
      } else {
        result.push({ vehicleId: v.id, internalNumber: v.internalNumber, plate: v.plate, mtbfDias: 'Sin fallas', count: 0 });
      }
    }
    return result.sort((a, b) => {
      if (typeof a.mtbfDias === 'string') return 1;
      if (typeof b.mtbfDias === 'string') return -1;
      return (a.mtbfDias as number) - (b.mtbfDias as number);
    });
  }, [vehicles, allReports]);

  const categoriesBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of allReports) {
      const cat = r.departmentId || r.categoria || r.category || 'GENERAL';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    for (const w of workOrders) {
      const cat = w.category || w.categoria || 'GENERAL';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return Object.entries(counts).map(([name, count]) => ({
      name: name.toUpperCase(),
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    })).sort((a, b) => b.count - a.count);
  }, [allReports, workOrders]);

  const vehicleTimeline = useMemo(() => {
    if (!selectedVehicleIdForLifecycle) return [];
    const selectedVeh = vehicles.find(v => String(v.id) === String(selectedVehicleIdForLifecycle));
    const internalNo = selectedVeh?.internalNumber;

    const timelineItems: Array<{ id: string; date: Date; type: 'incident' | 'work_order' | 'inspection'; title: string; desc: string; status: string; extra?: any }> = [];

    const vIncidents = allReports.filter(r => 
      String(r.vehicleId) === String(selectedVehicleIdForLifecycle) || 
      String(r.coche_id) === String(selectedVehicleIdForLifecycle) ||
      (internalNo && String(r.coche_id) === String(internalNo))
    );
    for (const r of vIncidents) {
      const date = r.createdAt ? new Date(r.createdAt) : (r.created_at ? new Date(r.created_at) : new Date());
      timelineItems.push({
        id: r.id || String(Math.random()),
        date,
        type: 'incident',
        title: `Incidencia: ${r.title || 'Sin Título'}`,
        desc: r.description || '',
        status: r.status || r.estado || 'ENVIADO',
        extra: r
      });
    }

    const vWorkOrders = workOrders.filter(w => 
      String(w.cocheId) === String(selectedVehicleIdForLifecycle) || 
      String(w.coche_id) === String(selectedVehicleIdForLifecycle) ||
      (internalNo && String(w.coche_id) === String(internalNo))
    );
    for (const w of vWorkOrders) {
      const date = w.fecha ? new Date(w.fecha) : (w.created_at ? new Date(w.created_at) : new Date());
      timelineItems.push({
        id: w.id || String(Math.random()),
        date,
        type: 'work_order',
        title: `Mantenimiento: ${w.title || 'Sin Título'}`,
        desc: w.description || '',
        status: w.status || w.estado || 'PROGRAMADO',
        extra: w
      });
    }

    const vInspections = inspections.filter(i => 
      String(i.vehiculoId) === String(selectedVehicleIdForLifecycle) || 
      String(i.vehiculo_id) === String(selectedVehicleIdForLifecycle) ||
      (internalNo && String(i.coche_id) === String(internalNo))
    );
    for (const i of vInspections) {
      const date = i.fecha_inspeccion ? new Date(i.fecha_inspeccion) : (i.created_at ? new Date(i.created_at) : new Date());
      timelineItems.push({
        id: i.id || String(Math.random()),
        date,
        type: 'inspection',
        title: `Inspección de Flota`,
        desc: `Inspección realizada por Inspector #${i.inspector_id || i.inspectorId || ''}`,
        status: 'COMPLETADO',
        extra: i
      });
    }

    return timelineItems.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [selectedVehicleIdForLifecycle, allReports, workOrders, inspections, vehicles]);

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

  const { user } = useAuth();
  const canCloseTicket = ['Admin', 'SuperAdmin', 'Encargado'].includes(user?.role ?? '');

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
      setSolution('');
      setUsedParts([]);
      setAuditReport(null);
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
      // Soporte para Timestamp Firestore ({seconds, nanoseconds}) y string/number
      const parseFecha = (v: any): Date => {
        if (!v) return new Date(NaN);
        if (typeof v?.toDate === 'function') return v.toDate();
        if (v?.seconds) return new Date(v.seconds * 1000);
        return new Date(v);
      };
      const fecFalla = parseFecha(r.createdAt);
      if (isNaN(fecFalla.getTime())) continue;
      byVehicle[vid].fallas.push(fecFalla);
      // Guardar el título de la última falla
      const d = fecFalla;
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

      {/* Navigation Tabs (Sprints 9-10) */}
      <div className="flex border-b border-slate-800 gap-1 pb-px print:hidden">
        <button
          onClick={() => setActiveTab('incidencias')}
          className={clsx(
            'px-4 py-2 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2',
            activeTab === 'incidencias'
              ? 'border-primary-500 text-primary-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          )}
        >
          <AlertTriangle className="w-4 h-4" /> Incidencias Reportadas
        </button>
        <button
          onClick={() => setActiveTab('work_orders')}
          className={clsx(
            'px-4 py-2 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2',
            activeTab === 'work_orders'
              ? 'border-primary-500 text-primary-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          )}
        >
          <Briefcase className="w-4 h-4" /> Órdenes de Trabajo (EAM)
        </button>
        <button
          onClick={() => setActiveTab('lifecycle')}
          className={clsx(
            'px-4 py-2 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2',
            activeTab === 'lifecycle'
              ? 'border-primary-500 text-primary-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          )}
        >
          <Cpu className="w-4 h-4" /> Ciclo de Vida de Coches
        </button>
        <button
          onClick={() => setActiveTab('reliability')}
          className={clsx(
            'px-4 py-2 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2',
            activeTab === 'reliability'
              ? 'border-primary-500 text-primary-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          )}
        >
          <TrendingUp className="w-4 h-4" /> Confiabilidad (MTBF / MTTR)
        </button>
      </div>

      {/* ── Tab: Incidencias (Original View) ── */}
      {activeTab === 'incidencias' && (
        <>
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
              {/* Riesgo financiero */}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3">
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
                              Última falla: {!isNaN(v.ultimaFalla.getTime()) ? v.ultimaFalla.toLocaleDateString('es-UY') : 'Sin fecha'}
                              {v.ultimaFallaTitulo && ` — ${v.ultimaFallaTitulo}`}
                            </div>
                          )}
                          {v.mtbfDias && (
                            <div className="text-slate-600 flex items-center gap-1.5 px-1">
                              <TrendingUp className="w-3 h-3 flex-none" />
                              MTBF: {v.mtbfDias} días · {v.fallaCount} falla{v.fallaCount !== 1 ? 's' : ''} registrada{v.fallaCount !== 1 ? 's' : ''}
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
          {!predictorMode && (
            loading ? (
              <div className="text-center py-12 text-slate-400">Cargando reportes...</div>
            ) : reports.length === 0 ? (
              <div className="text-center py-12 bg-slate-900 rounded-xl border border-slate-800">
                <Search className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-white">Sin Novedades</h3>
                <p className="text-slate-400 text-sm">No hay reportes que coincidan con los filtros.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {reports.map((report) => {
                  const status = report.status || report.estado || 'ENVIADO';
                  const s = STATUS_CONFIG[status] || { label: status, color: 'bg-slate-500/20 text-slate-400', icon: Clock };
                  const Icon = s.icon;
                  const date = report.createdAt ? new Date(report.createdAt) : (report.created_at ? new Date(report.created_at) : null);
                  const isClosed = status === 'CLOSED' || status === 'FINALIZADO';

                  return (
                    <div key={report.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition-colors">
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <span className={clsx('text-[10px] font-black px-2 py-0.5 rounded-full uppercase flex items-center gap-1', s.color)}>
                            <Icon className="w-3 h-3" />
                            {s.label}
                          </span>
                          <span className="text-xs text-slate-500 font-medium">
                            {date && !isNaN(date.getTime()) ? date.toLocaleDateString('es-UY') : 'Sin Fecha'}
                          </span>
                        </div>

                        <h3 className="font-bold text-white mb-1 truncate text-base">{report.title}</h3>
                        <p className="text-xs text-slate-400 line-clamp-2 mb-3 h-8">{report.description}</p>

                        <div className="flex flex-wrap gap-1.5 mb-4">
                          <span className="text-[10px] bg-slate-800 text-slate-300 font-bold px-2 py-0.5 rounded">
                            Coche #{report.vehicleId || report.coche_id || 'N/A'}
                          </span>
                          {report.priority && (
                            <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded',
                              report.priority === 'HIGH' || report.priority === 'ALTA' ? 'bg-red-500/20 text-red-400' :
                              report.priority === 'NORMAL' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-400'
                            )}>
                              Prioridad: {report.priority}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Evidence & Action */}
                      <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                        {report.evidencePhotos || report.photoUrl ? (
                          <a href={report.evidencePhotos || report.photoUrl} target="_blank" rel="noreferrer" className="text-xs text-slate-400 hover:text-white flex items-center gap-1">
                            <Camera className="w-3.5 h-3.5 text-slate-500" /> Ver evidencia
                          </a>
                        ) : (
                          <span className="text-xs text-slate-600 flex items-center gap-1">
                            <Camera className="w-3.5 h-3.5 text-slate-700" /> Sin fotos
                          </span>
                        )}

                        {!isClosed && (
                          <button
                            onClick={() => handleOpenProcess(report)}
                            className="px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-white font-bold text-xs flex items-center gap-1 transition-colors"
                          >
                            Reparar coche <ChevronRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </>
      )}

      {/* ── Tab: Work Orders (Sprints 9-10) ── */}
      {activeTab === 'work_orders' && (
        <div className="space-y-4">
          {/* EAM Work Orders KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <MaintKpi label="Total Órdenes" value={workOrders.length} color="text-white" icon={Briefcase} />
            <MaintKpi
              label="Programadas"
              value={workOrders.filter(w => (w.status || w.estado) === 'PROGRAMADO').length}
              color="text-purple-300"
              icon={Clock}
            />
            <MaintKpi
              label="En Proceso"
              value={workOrders.filter(w => (w.status || w.estado) === 'EN_PROCESO').length}
              color="text-blue-300"
              icon={Settings}
            />
            <MaintKpi
              label="Finalizadas"
              value={workOrders.filter(w => (w.status || w.estado) === 'FINALIZADO').length}
              color="text-emerald-300"
              icon={CheckCircle}
            />
          </div>

          {/* Actions panel */}
          <div className="flex justify-between items-center bg-slate-900/40 p-3 rounded-lg border border-slate-800/80">
            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Órdenes de Trabajo del Taller</span>
            <button
              onClick={() => setIsWorkOrderModalOpen(true)}
              className="btn btn-primary btn-sm flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Crear Orden de Trabajo
            </button>
          </div>

          {/* Work Orders List */}
          {workOrders.length === 0 ? (
            <div className="text-center py-12 bg-slate-900 rounded-xl border border-slate-800">
              <Search className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-white">Sin Órdenes de Trabajo</h3>
              <p className="text-slate-400 text-sm">No se han registrado órdenes de mantenimiento aún.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {workOrders.map((wo) => {
                const status = wo.status || wo.estado || 'PROGRAMADO';
                const isFinalized = status === 'FINALIZADO';
                const priority = wo.priority || 'MEDIA';
                const dateVal = wo.fecha || wo.created_at;
                const formattedDate = dateVal ? new Date(dateVal).toLocaleDateString('es-UY') : 'N/A';

                return (
                  <div key={wo.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition-colors">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className={clsx('text-[10px] font-black px-2 py-0.5 rounded-full uppercase flex items-center gap-1',
                          status === 'FINALIZADO' ? 'bg-green-500/20 text-green-400' :
                          status === 'EN_PROCESO' ? 'bg-blue-500/20 text-blue-400' :
                          'bg-purple-500/20 text-purple-400'
                        )}>
                          <Clock className="w-3 h-3" />
                          {status}
                        </span>
                        <span className="text-xs text-slate-500 font-medium">{formattedDate}</span>
                      </div>

                      <h3 className="font-bold text-white text-base mb-1 truncate">{wo.title}</h3>
                      <p className="text-xs text-slate-400 line-clamp-2 h-8 mb-3">{wo.description}</p>

                      <div className="space-y-2 mb-4">
                        <div className="flex flex-wrap gap-1.5">
                          <span className="text-[10px] bg-slate-800 text-slate-300 font-bold px-2 py-0.5 rounded">
                            Coche #{wo.cocheId || wo.coche_id || 'N/A'}
                          </span>
                          <span className="text-[10px] bg-slate-800 text-slate-300 font-bold px-2 py-0.5 rounded">
                            Técnico: {wo.assignedTo || 'No asignado'}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded',
                            priority === 'ALTA' ? 'bg-red-500/20 text-red-400' :
                            priority === 'MEDIA' ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'
                          )}>
                            Prioridad: {priority}
                          </span>
                          <span className="text-[10px] bg-indigo-900/30 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded">
                            {wo.category || 'Mecánica'}
                          </span>
                        </div>
                      </div>

                      {/* Repuestos utilizados */}
                      {wo.partsUsed && wo.partsUsed.length > 0 && (
                        <div className="mb-4 bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/80">
                          <p className="text-[10px] text-slate-500 font-black uppercase mb-1.5">Repuestos Usados</p>
                          <ul className="space-y-1 text-[11px] text-slate-400">
                            {wo.partsUsed.map((p: any, idx: number) => (
                              <li key={idx} className="flex justify-between">
                                <span>{p.sku} — {p.description}</span>
                                <span className="font-bold text-white">x{p.quantity}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {isFinalized && wo.solution && (
                        <div className="mb-4 p-2 bg-emerald-950/10 border border-emerald-900/20 rounded-lg text-[11px] text-slate-400">
                          <p className="text-[10px] text-emerald-400 font-black uppercase mb-1">Notas de Reparación</p>
                          {wo.solution}
                        </div>
                      )}
                    </div>

                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                      <button
                        onClick={() => handleDeleteWorkOrder(wo.id)}
                        className="text-slate-500 hover:text-red-400 p-1.5 rounded hover:bg-red-500/10 transition-colors"
                        title="Eliminar Orden"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      {!isFinalized && (
                        <button
                          onClick={() => {
                            setSelectedWorkOrderToClose(wo);
                            setWoUsedParts([]);
                            setWoSolution('');
                            setIsCloseWorkOrderModalOpen(true);
                          }}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors"
                        >
                          Finalizar Orden
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Vehicle Lifecycle (Sprints 9-10) ── */}
      {activeTab === 'lifecycle' && (
        <div className="space-y-4">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <span className="text-sm text-slate-400 font-bold">Seleccionar Vehículo:</span>
              <select
                value={selectedVehicleIdForLifecycle}
                onChange={(e) => setSelectedVehicleIdForLifecycle(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="">-- Seleccionar Coche --</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    Coche #{v.internalNumber} ({v.plate || 'Sin Matrícula'})
                  </option>
                ))}
              </select>
            </div>

            {selectedVehicleIdForLifecycle ? (
              (() => {
                const vehicle = vehicles.find(v => String(v.id) === String(selectedVehicleIdForLifecycle));
                if (!vehicle) return null;
                const semData = predictorRiesgos.find(r => String(r.vehicleId) === String(selectedVehicleIdForLifecycle));

                return (
                  <div className="space-y-6">
                    {/* Vehicle Metadata Summary */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-slate-950/30 p-4 rounded-xl border border-slate-800/80">
                      <div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase">Matrícula</p>
                        <p className="text-sm font-bold text-white mt-0.5">{vehicle.plate || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase">Marca / Modelo</p>
                        <p className="text-sm font-bold text-white mt-0.5">{vehicle.make || 'N/A'} {vehicle.model || ''}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase">Año / Fabricación</p>
                        <p className="text-sm font-bold text-white mt-0.5">{vehicle.year || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase">Estado Técnico</p>
                        <span className={clsx('inline-block text-[10px] font-black px-2.5 py-0.5 rounded-full mt-1 uppercase',
                          vehicle.status === 'OPERATIONAL' ? 'bg-green-500/20 text-green-400' :
                          vehicle.status === 'MAINTENANCE' ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400'
                        )}>
                          {vehicle.status || 'OPERATIONAL'}
                        </span>
                      </div>
                    </div>

                    {/* Timeline */}
                    <div className="space-y-4">
                      <h4 className="text-sm font-black text-slate-300 uppercase tracking-wide">Línea de Tiempo del Coche</h4>

                      {vehicleTimeline.length === 0 ? (
                        <p className="text-xs text-slate-500 italic py-4">No se registran actividades para este vehículo.</p>
                      ) : (
                        <div className="relative border-l border-slate-800 ml-4 pl-6 space-y-5 py-2">
                          {vehicleTimeline.map((item) => {
                            const isWo = item.type === 'work_order';
                            const isInc = item.type === 'incident';
                            const isInsp = item.type === 'inspection';

                            return (
                              <div key={item.id} className="relative">
                                {/* Dot Icon */}
                                <span className={clsx('absolute -left-[35px] top-0.5 p-1 rounded-full border flex items-center justify-center',
                                  isWo ? 'bg-blue-950 border-blue-500 text-blue-400' :
                                  isInc ? 'bg-red-950 border-red-500 text-red-400' :
                                  'bg-purple-950 border-purple-500 text-purple-400'
                                )}>
                                  {isWo && <Wrench className="w-3 h-3" />}
                                  {isInc && <AlertTriangle className="w-3 h-3" />}
                                  {isInsp && <Clipboard className="w-3 h-3" />}
                                </span>

                                <div className="bg-slate-900/40 border border-slate-800/80 p-3.5 rounded-xl">
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
                                    <h5 className="font-bold text-white text-sm">{item.title}</h5>
                                    <span className="text-[10px] text-slate-500 font-medium">
                                      {item.date.toLocaleDateString('es-UY')} {item.date.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>
                                  <p className="text-xs text-slate-400 mb-2.5">{item.desc}</p>

                                  <div className="flex flex-wrap gap-2 items-center justify-between">
                                    <span className={clsx('text-[9px] font-black px-2 py-0.5 rounded uppercase',
                                      item.status === 'CLOSED' || item.status === 'FINALIZADO' || item.status === 'COMPLETADO' ? 'bg-emerald-950 text-emerald-400' : 'bg-amber-950 text-amber-400'
                                    )}>
                                      Estado: {item.status}
                                    </span>
                                    {isWo && item.extra?.partsUsed && item.extra.partsUsed.length > 0 && (
                                      <span className="text-[9px] text-slate-500 font-bold bg-slate-950 px-2 py-0.5 rounded">
                                        Repuestos: {item.extra.partsUsed.map((p: any) => `${p.sku} (x${p.quantity})`).join(', ')}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="text-center py-12 text-slate-500 italic text-sm">
                Seleccione un vehículo de la flota para auditar su ciclo de vida e historial.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Reliability Metrics (Sprints 9-10) ── */}
      {activeTab === 'reliability' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
            {/* Reliability Stats KPI cards */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4 flex flex-col justify-between">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-400" /> Indicadores Clave de Confiabilidad
              </h3>
              <div className="grid grid-cols-2 gap-4 my-2">
                <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">MTTR Promedio</span>
                  <p className="text-3xl font-black text-white mt-1">{averageMttrHours} hs</p>
                  <span className="text-[9px] text-slate-500">Tiempo medio para reparar incidencias</span>
                </div>
                <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">MTBF Promedio</span>
                  <p className="text-3xl font-black text-white mt-1">
                    {(() => {
                      const valid = vehiclesMtbf.filter(v => typeof v.mtbfDias === 'number');
                      if (valid.length === 0) return '120';
                      const sum = valid.reduce((acc, curr) => acc + (curr.mtbfDias as number), 0);
                      return Math.round(sum / valid.length);
                    })()} días
                  </p>
                  <span className="text-[9px] text-slate-500">Tiempo medio entre fallas de la flota</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed italic">
                * Las métricas se calculan dinámicamente según el histórico y frecuencia de incidentes / órdenes registradas en Postgres.
              </p>
            </div>

            {/* Failure category Pareto (Progress bars) */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-500" /> Pareto de Fallas por Categoría
              </h3>
              {categoriesBreakdown.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-8 text-center">Sin datos de fallas registrados.</p>
              ) : (
                <div className="space-y-3 pt-2">
                  {categoriesBreakdown.map((cat, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-xs font-bold text-slate-300">
                        <span>{cat.name}</span>
                        <span className="text-slate-400">{cat.count} ticket{cat.count !== 1 ? 's' : ''} ({cat.percentage}%)</span>
                      </div>
                      <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className="bg-primary-500 h-full rounded-full transition-all duration-500"
                          style={{ width: `${cat.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Low-Stock Parts warnings */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-black text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" /> Alertas de Inventario Crítico (Stock Mínimo)
              </h3>
              {availableParts.filter(p => p.currentStock < p.minStock).length === 0 ? (
                <div className="text-center py-10">
                  <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                  <p className="text-xs text-slate-400 font-bold">Todo en orden</p>
                  <p className="text-[10px] text-slate-500">Ningún repuesto de taller está por debajo del stock mínimo.</p>
                </div>
              ) : (
                <div className="space-y-2.5 pt-2 max-h-[300px] overflow-y-auto">
                  {availableParts.filter(p => p.currentStock < p.minStock).map((part) => (
                    <div key={part.id} className="flex items-center justify-between bg-red-950/15 border border-red-900/25 p-3 rounded-xl gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-white">{part.sku}</span>
                          <span className="text-[9px] bg-red-950 text-red-400 font-bold px-1.5 py-0.5 rounded border border-red-500/20 uppercase">CRÍTICO</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">{part.description}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-black text-red-400">Stock: {part.currentStock}</p>
                        <p className="text-[9px] text-slate-500 mt-0.5">Mínimo: {part.minStock}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* MTBF List */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Settings className="w-4 h-4 text-purple-400" /> Frecuencia de Fallas y MTBF por Coche
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500 font-black uppercase text-[10px]">
                      <th className="py-2">Coche</th>
                      <th className="py-2">Matrícula</th>
                      <th className="py-2 text-center">Fallas</th>
                      <th className="py-2 text-right">MTBF Estimado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehiclesMtbf.slice(0, 10).map((item) => {
                      const isHighRisk = typeof item.mtbfDias === 'number' && item.mtbfDias <= 30;
                      return (
                        <tr key={item.vehicleId} className="border-b border-slate-800/50 hover:bg-slate-800/10">
                          <td className="py-2 font-bold text-white">#{item.internalNumber}</td>
                          <td className="py-2 text-slate-400">{item.plate || 'N/A'}</td>
                          <td className="py-2 text-center font-bold text-slate-300">{item.count}</td>
                          <td className={clsx('py-2 text-right font-black',
                            isHighRisk ? 'text-red-400' : typeof item.mtbfDias === 'number' ? 'text-slate-300' : 'text-emerald-400'
                          )}>
                            {typeof item.mtbfDias === 'number' ? `${item.mtbfDias} días` : item.mtbfDias}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Original Modal: Nueva Denuncia ── */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <h2 className="text-xl font-bold text-white">Nueva Denuncia / Reporte</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-black mb-1">Coche / Vehículo</label>
                  <select
                    value={newReport.vehicleId}
                    onChange={(e) => setNewReport({ ...newReport, vehicleId: e.target.value })}
                    required
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  >
                    <option value="">Seleccione...</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>#{v.internalNumber} {v.plate}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-black mb-1">Departamento / Falla</label>
                  <select
                    value={newReport.departmentId}
                    onChange={(e) => setNewReport({ ...newReport, departmentId: e.target.value })}
                    required
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  >
                    <option value="">Seleccione...</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-slate-500 uppercase font-black mb-1">Título Resumen</label>
                <input
                  type="text"
                  placeholder="ej: Pérdida de aire compresor, parabrisas roto"
                  value={newReport.title}
                  onChange={(e) => setNewReport({ ...newReport, title: e.target.value })}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-500 uppercase font-black mb-1">Descripción detallada</label>
                <textarea
                  rows={3}
                  placeholder="Detalles sobre cuándo y cómo ocurre el inconveniente..."
                  value={newReport.description}
                  onChange={(e) => setNewReport({ ...newReport, description: e.target.value })}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-black mb-1">Prioridad</label>
                  <select
                    value={newReport.priority}
                    onChange={(e) => setNewReport({ ...newReport, priority: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  >
                    <option value="LOW">BAJA</option>
                    <option value="NORMAL">NORMAL</option>
                    <option value="HIGH">ALTA</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-black mb-1">Foto Evidencia</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white font-bold text-xs"
                >
                  Registrar Reporte
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Original Modal: Cerrar Reparación */}
      {processModalOpen && auditReport && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <h2 className="text-xl font-bold text-white">Cerrar Reparación</h2>
              <button onClick={() => setProcessModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <p className="text-xs text-slate-400 font-bold">Reporte Original:</p>
              <p className="text-sm font-bold text-white mt-1">{auditReport.title}</p>
              <p className="text-xs text-slate-500 mt-0.5">{auditReport.description}</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] text-slate-500 uppercase font-black mb-1">Trabajo técnico realizado</label>
                <textarea
                  rows={3}
                  value={solution}
                  onChange={(e) => setSolution(e.target.value)}
                  placeholder="Detalle los repuestos reemplazados y ajustes realizados..."
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                />
              </div>

              {/* Repuestos utilizados */}
              <div className="space-y-2">
                <label className="block text-[10px] text-slate-500 uppercase font-black">Repuestos de Taller</label>

                {usedParts.length > 0 && (
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1.5">
                    {usedParts.map((p, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs text-slate-300">
                        <span>{p.sku} — {p.description}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">x{p.quantity}</span>
                          <button type="button" onClick={() => handleRemovePart(idx)} className="text-red-400 hover:text-red-300">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={selectedPartId}
                    onChange={(e) => setSelectedPartId(e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white col-span-2 animate-none"
                  >
                    <option value="">Agregar pieza...</option>
                    {availableParts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} — {p.description} (Stock: {p.currentStock})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={selectedQty}
                    onChange={(e) => setSelectedQty(Number(e.target.value))}
                    min={1}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                    placeholder="Cant."
                  />
                </div>
                <button
                  type="button"
                  disabled={!selectedPartId}
                  onClick={handleAddPart}
                  className="text-xs px-3 py-1.5 bg-slate-850 hover:bg-slate-800 rounded border border-slate-800 font-bold text-slate-300 disabled:opacity-40"
                >
                  + Agregar pieza
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setProcessModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCloseTicket}
                disabled={!solution.trim() || !canCloseTicket}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs disabled:opacity-40"
                title={!canCloseTicket ? 'Solo Admin o Encargado puede cerrar tickets' : undefined}
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
