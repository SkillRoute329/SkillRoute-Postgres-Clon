import { useState, useEffect } from 'react';
import { eamService, type EamWorkOrder } from '../../services/eamService';
import { FleetService } from '../../services/firestore/fleet';
import {
  Wrench,
  Plus,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  PlayCircle,
  Bus
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function WorkOrders() {
  const [orders, setOrders] = useState<EamWorkOrder[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [formData, setFormData] = useState<Partial<EamWorkOrder>>({
    type: 'Correctivo',
    priority: 'MEDIA',
    status: 'PENDIENTE',
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [fetchedOrders, fetchedVehicles] = await Promise.all([
        eamService.getWorkOrders(),
        FleetService.getVehicles(),
      ]);
      setOrders(fetchedOrders);
      setVehicles(fetchedVehicles);
    } catch (error) {
      console.error('Error loading EAM data', error);
      toast.error('Error al cargar órdenes de trabajo');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.vehicleId || !formData.description) {
      toast.error('Coche y descripción son requeridos');
      return;
    }
    try {
      await eamService.createWorkOrder(formData as any);
      toast.success('Orden de Trabajo creada');
      setIsModalOpen(false);
      setFormData({ type: 'Correctivo', priority: 'MEDIA', status: 'PENDIENTE' });
      loadData();
    } catch (error) {
      toast.error('Error al crear orden');
    }
  };

  const updateStatus = async (id: string, newStatus: EamWorkOrder['status']) => {
    try {
      const updateData: Partial<EamWorkOrder> = { status: newStatus };
      if (newStatus === 'EN_PROCESO') {
        updateData.startedAt = new Date().toISOString();
      } else if (newStatus === 'CERRADO') {
        updateData.completedAt = new Date().toISOString();
      }
      await eamService.updateWorkOrder(id, updateData);
      toast.success(`Estado actualizado a ${newStatus}`);
      loadData();
    } catch (error) {
      toast.error('Error al actualizar estado');
    }
  };

  const getStatusBadge = (status: EamWorkOrder['status']) => {
    switch (status) {
      case 'PENDIENTE':
        return <span className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-xs font-semibold flex items-center gap-1 w-fit"><Clock className="w-3 h-3" /> PENDIENTE</span>;
      case 'EN_PROCESO':
        return <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs font-semibold flex items-center gap-1 w-fit"><PlayCircle className="w-3 h-3" /> EN PROCESO</span>;
      case 'CERRADO':
        return <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded text-xs font-semibold flex items-center gap-1 w-fit"><CheckCircle className="w-3 h-3" /> CERRADO</span>;
      case 'CANCELADO':
        return <span className="px-2 py-1 bg-slate-500/20 text-slate-400 rounded text-xs font-semibold flex items-center gap-1 w-fit"><XCircle className="w-3 h-3" /> CANCELADO</span>;
      default:
        return null;
    }
  };

  const getPriorityBadge = (priority: EamWorkOrder['priority']) => {
    switch (priority) {
      case 'CRITICA': return <span className="text-red-500 font-bold text-xs"><AlertTriangle className="w-3 h-3 inline mr-1" /> CRÍTICA</span>;
      case 'ALTA': return <span className="text-orange-500 font-semibold text-xs">ALTA</span>;
      case 'MEDIA': return <span className="text-amber-500 text-xs">MEDIA</span>;
      case 'BAJA': return <span className="text-slate-400 text-xs">BAJA</span>;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Wrench className="text-blue-400 w-6 h-6" />
            Órdenes de Trabajo (EAM)
          </h1>
          <p className="text-slate-400 text-sm mt-1">Gestión integral del ciclo de mantenimiento</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nueva Orden
        </button>
      </div>

      {loading ? (
        <div className="text-slate-400 p-8 text-center animate-pulse">Cargando órdenes de trabajo...</div>
      ) : (
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-800/50 text-xs uppercase text-slate-500 font-semibold border-b border-slate-700">
                <tr>
                  <th className="px-4 py-3">Coche / Vehículo</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Descripción</th>
                  <th className="px-4 py-3">Prioridad</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Fecha Creación</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      No hay órdenes de trabajo registradas.
                    </td>
                  </tr>
                ) : (
                  orders.map((wo) => {
                    const vehicle = vehicles.find((v) => v.id === wo.vehicleId || String(v.internalNumber) === wo.vehicleId);
                    return (
                      <tr key={wo.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-white flex items-center gap-2">
                          <Bus className="w-4 h-4 text-slate-400" />
                          #{vehicle?.internalNumber || wo.vehicleId}
                        </td>
                        <td className="px-4 py-3">{wo.type}</td>
                        <td className="px-4 py-3 truncate max-w-xs" title={wo.description}>{wo.description}</td>
                        <td className="px-4 py-3">{getPriorityBadge(wo.priority)}</td>
                        <td className="px-4 py-3">{getStatusBadge(wo.status)}</td>
                        <td className="px-4 py-3 text-slate-400">
                          {new Date(wo.createdAt).toLocaleDateString('es-UY')}
                        </td>
                        <td className="px-4 py-3 flex gap-2 justify-end">
                          {wo.status === 'PENDIENTE' && (
                            <button
                              onClick={() => updateStatus(wo.id!, 'EN_PROCESO')}
                              className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded text-xs hover:bg-blue-600/40 transition"
                            >
                              Iniciar
                            </button>
                          )}
                          {wo.status === 'EN_PROCESO' && (
                            <button
                              onClick={() => updateStatus(wo.id!, 'CERRADO')}
                              className="px-2 py-1 bg-emerald-600/20 text-emerald-400 rounded text-xs hover:bg-emerald-600/40 transition"
                            >
                              Cerrar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Nueva Orden */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Wrench className="w-5 h-5 text-blue-400" />
                Crear Orden de Trabajo
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateOrder} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400 uppercase">Vehículo / Coche</label>
                <select
                  required
                  value={formData.vehicleId || ''}
                  onChange={(e) => setFormData({ ...formData, vehicleId: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:border-blue-500 outline-none"
                >
                  <option value="" disabled>Seleccione un vehículo</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>Coche #{v.internalNumber} ({v.plate})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400 uppercase">Tipo</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:border-blue-500 outline-none"
                  >
                    <option value="Correctivo">Correctivo</option>
                    <option value="Preventivo">Preventivo</option>
                    <option value="Inspeccion">Inspección</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400 uppercase">Prioridad</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:border-blue-500 outline-none"
                  >
                    <option value="BAJA">Baja</option>
                    <option value="MEDIA">Media</option>
                    <option value="ALTA">Alta</option>
                    <option value="CRITICA">Crítica</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400 uppercase">Descripción</label>
                <textarea
                  required
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:border-blue-500 outline-none h-24 resize-none"
                  placeholder="Detalle la falla o tarea a realizar..."
                />
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-300 hover:bg-slate-800 rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition shadow-lg shadow-blue-500/20"
                >
                  Crear Orden
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
