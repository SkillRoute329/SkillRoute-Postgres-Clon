import { useState, useEffect } from 'react';
import { db } from '../config/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { UserCheck, UserX, Search, Filter } from 'lucide-react';
import StatsRibbon from './StatsRibbon';

interface User {
  id: string;
  internalNumber: string;
  fullName: string;
  driverStatus: 'A_LA_ORDEN' | 'EFECTIVO_COCHE' | 'LICENCIA_MEDICA';
  roleName: string;
  role: string;
  monthlyAccrued?: number;
  assignedVehicleId?: string;
  assignedVehiclePlate?: string;
  rotationPact?: string; // NEW: Pacto de rotación
}

const UserList = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState({
    accruedWages: 0,
    surchargeInvestment: 0,
    pendingDocs: 0,
  });

  useEffect(() => {
    // Query principal ordenada por número interno
    const q = query(collection(db, 'users'), orderBy('internalNumber', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: User[] = [];
      let totalWages = 0;
      // let totalSurcharge = 0;

      snapshot.forEach((doc) => {
        const data = doc.data() as User;
        items.push({ ...data, id: doc.id });

        // Live calc for StatsRibbon
        totalWages += Number(data.monthlyAccrued || 0);
      });

      setUsers(items);
      setStats((prev) => ({ ...prev, accruedWages: totalWages }));
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Derived State
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.internalNumber.includes(searchTerm);
    const matchesStatus = filterStatus === 'ALL' || u.driverStatus === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const calculateLiquid = (gross: number) => {
    // 15% BPS + Est. IRPF (Visual check only)
    // This should mirror PayrollService roughly
    return Math.round(gross * 0.82); // Rough 18% deduction average for quick view
  };

  return (
    <div className="space-y-6">
      {/* 1. Stats Ribbon Integration */}
      <StatsRibbon stats={stats} />

      {/* 2. Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
          <input
            className="w-full bg-slate-800 border-none rounded-lg py-2 pl-9 text-sm text-white focus:ring-1 focus:ring-primary-500"
            placeholder="Buscar por Interno (ej. 329) o Nombre"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setFilterStatus('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${filterStatus === 'ALL' ? 'bg-primary-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
          >
            TODOS
          </button>
          <button
            onClick={() => setFilterStatus('A_LA_ORDEN')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${filterStatus === 'A_LA_ORDEN' ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'}`}
          >
            EN LISTA
          </button>
          <button
            onClick={() => setFilterStatus('EFECTIVO_COCHE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${filterStatus === 'EFECTIVO_COCHE' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'bg-slate-800 text-slate-400'}`}
          >
            ASIGNADO (COCHE)
          </button>
        </div>
      </div>

      {/* 3. Data Grid */}
      <div className="grid grid-cols-1 gap-3">
        {loading ? (
          <p className="text-center text-slate-500 py-8">Cargando personal...</p>
        ) : (
          filteredUsers.map((user) => (
            <div
              key={user.internalNumber}
              className="bg-slate-900/50 border border-slate-800/50 hover:bg-slate-800/50 transition-colors p-4 rounded-xl flex flex-col md:flex-row gap-4 items-center group"
            >
              {/* Avatar & ID */}
              <div className="flex items-center gap-4 w-full md:w-1/4">
                <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center font-black text-slate-500 text-xs border border-slate-700">
                  {user.internalNumber}
                </div>
                <div>
                  <h4 className="font-bold text-white text-sm">{user.fullName}</h4>
                  <span
                    className={`text-[10px] font-bold px-1.5 rounded ${user.roleName === 'Micrero' ? 'bg-amber-500/10 text-amber-500' : 'text-slate-500'}`}
                  >
                    {user.roleName || user.role}
                  </span>
                </div>
              </div>

              {/* Status & Rotation */}
              <div className="w-full md:w-1/4">
                {user.driverStatus === 'EFECTIVO_COCHE' ? (
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2 text-blue-400 text-xs font-bold bg-blue-500/10 px-2 py-1 rounded w-fit mb-1">
                      <UserCheck className="w-3 h-3" />
                      COCHE {user.assignedVehicleId || '---'}
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {user.rotationPact ? `Pacto: ${user.rotationPact}` : 'Sin pacto registrado'}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold bg-emerald-500/10 px-2 py-1 rounded w-fit">
                    <Filter className="w-3 h-3" />A LA ORDEN
                  </div>
                )}
              </div>

              {/* Financials (Real Time) */}
              <div className="w-full md:w-1/4 flex flex-col items-end md:items-start border-l border-slate-800 pl-0 md:pl-4">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                  Salario (Devengado)
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-white font-mono font-bold">
                    $ {(user.monthlyAccrued || 0).toLocaleString()}
                  </span>
                  <span className="text-[10px] text-slate-600">Nominal</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-emerald-500 font-mono font-bold text-sm">
                    $ {calculateLiquid(user.monthlyAccrued || 0).toLocaleString()}
                  </span>
                  <span className="text-[10px] text-emerald-500/50">Líquido Est.</span>
                </div>
              </div>

              {/* Actions */}
              <div className="w-full md:w-1/4 flex justify-end">
                <button
                  onClick={() => (window.location.href = `/dashboard/admin/employees/${user.id}`)}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-lg transition-colors border border-slate-700"
                >
                  Ver Ficha
                </button>
              </div>
            </div>
          ))
        )}

        {filteredUsers.length === 0 && !loading && (
          <div className="text-center py-12 text-slate-500 border-2 border-dashed border-slate-800 rounded-xl">
            <UserX className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No se encontraron trabajadores con ese criterio.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserList;
