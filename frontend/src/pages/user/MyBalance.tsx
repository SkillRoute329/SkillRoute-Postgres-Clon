import { useState, useEffect } from 'react';
import { ShiftService, type Shift } from '../../services/api';
import { Wallet, CircleArrowUp, CircleArrowDown, Download, Calendar, AlertCircle } from 'lucide-react';
import { getCurrentUser } from '../../utils/auth';
import clsx from 'clsx';

const MyBalance = () => {
    const [stats, setStats] = useState({
        totalBalance: 0,
        cededAmount: 0,
        assignedAmount: 0,
        totalShifts: 0,
        completedShifts: 0
    });
    const [displayShifts, setDisplayShifts] = useState<Shift[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        calculateBalance();
    }, []);

    const calculateBalance = async () => {
        try {
            const allShifts = await ShiftService.getAll();
            const currentUser = getCurrentUser();

            if (!currentUser) {
                setError('No se pudo identificar al usuario');
                return;
            }

            // 1. Turnos Asignados (Income): Shifts assigned to me (Public taken or Admin assigned)
            const assignedShifts = allShifts.filter(s =>
                String(s.assignedTo) === String(currentUser.id) ||
                String(s.assignedTo) === String(currentUser.internalNumber)
            );

            // 2. Turnos Cedidos (Outcome): Shifts created by me that were taken by someone else
            const cededShifts = allShifts.filter(s =>
                String(s.createdBy) === String(currentUser.id) && // Created by me
                s.assignedTo && // Becomes "taken" only if assignedTo exists
                String(s.assignedTo) !== String(currentUser.id) && // And not assigned to myself
                String(s.assignedTo) !== String(currentUser.internalNumber)
            );

            // Calculate totals
            const assignedTotal = assignedShifts.reduce((sum, s) => sum + Number(s.totalValue || 0), 0);
            const cededTotal = cededShifts.reduce((sum, s) => sum + Number(s.totalValue || 0), 0);

            // 3. Balance Total = assignedTotal - cededTotal
            const totalBalance = assignedTotal - cededTotal;

            setStats({
                totalBalance,
                cededAmount: cededTotal,
                assignedAmount: assignedTotal,
                totalShifts: assignedShifts.length,
                completedShifts: assignedShifts.filter(s => s.status === 'Completed').length
            });

            // Combine for table display, adding a 'type' property for the table logic if needed, or just handling it there
            setDisplayShifts([...assignedShifts, ...cededShifts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

        } catch (err) {
            console.error('Error calculating balance:', err);
            setError('Error al calcular el balance');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in-up">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">Mi Balance</h1>
                    <p className="text-slate-400">Resumen financiero de tus turnos trabajados y cedidos.</p>
                </div>

                <div className="flex gap-2">
                    {error && (
                        <div className="px-4 py-2 bg-red-500/10 border border-red-500/50 rounded-xl flex items-center gap-2 text-red-500 text-sm">
                            <AlertCircle className="w-4 h-4" />
                            {error}
                        </div>
                    )}
                    <button className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl border border-slate-700 transition-all text-sm font-medium">
                        <Download className="w-4 h-4" /> Descargar PDF
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-panel p-6 rounded-2xl border border-slate-800">
                    <div className="flex items-center gap-3 text-emerald-400 mb-2">
                        <CircleArrowUp className="w-5 h-5" />
                        <span className="text-sm font-medium uppercase tracking-wider">Turnos Realizados</span>
                    </div>
                    <div className="text-3xl font-bold text-white">${stats.assignedAmount.toLocaleString('es-AR')}</div>
                    <p className="text-slate-500 text-xs mt-2 font-medium">Dinero generado por trabajar</p>
                </div>

                <div className="glass-panel p-6 rounded-2xl border border-slate-800">
                    <div className="flex items-center gap-3 text-red-400 mb-2">
                        <CircleArrowDown className="w-5 h-5" />
                        <span className="text-sm font-medium uppercase tracking-wider">Turnos Cedidos</span>
                    </div>
                    <div className="text-3xl font-bold text-white">${stats.cededAmount.toLocaleString('es-AR')}</div>
                    <p className="text-slate-500 text-xs mt-2 font-medium">Dinero descontado por ceder</p>
                </div>

                <div className={clsx(
                    "p-6 rounded-2xl border shadow-xl relative overflow-hidden",
                    stats.totalBalance >= 0 ? "bg-primary-600/10 border-primary-500/30" : "bg-red-900/10 border-red-500/30"
                )}>
                    <div className="flex items-center gap-3 text-slate-300 mb-2 relative z-10">
                        <Wallet className="w-5 h-5" />
                        <span className="text-sm font-medium uppercase tracking-wider">Balance Total</span>
                    </div>
                    <div className="text-4xl font-extrabold text-white relative z-10">
                        {stats.totalBalance >= 0 ? '+' : ''}{stats.totalBalance.toLocaleString('es-AR')}
                    </div>
                    <div className="text-slate-400 text-xs mt-2 font-medium relative z-10">
                        Estado de cuenta con el administrador
                    </div>
                    {/* Decoration */}
                    <div className="absolute -right-4 -bottom-4 opacity-10">
                        <Wallet className="w-24 h-24 text-white" />
                    </div>
                </div>
            </div>

            {/* History Table */}
            <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
                <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                    <h3 className="font-bold text-white">Historial de Transacciones</h3>
                    <div className="flex items-center gap-2 text-slate-500 text-sm">
                        <Calendar className="w-4 h-4" />
                        Este Mes
                    </div>
                </div>

                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-900/50 text-slate-500 text-xs uppercase font-bold">
                            <tr>
                                <th className="px-6 py-4">Fecha</th>
                                <th className="px-6 py-4">Concepto</th>
                                <th className="px-6 py-4">Categoría</th>
                                <th className="px-6 py-4 text-right">Monto</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {displayShifts.map(shift => {
                                const currentUser = getCurrentUser();
                                const isAssignedToMe = String(shift.assignedTo) === String(currentUser?.id) || String(shift.assignedTo) === String(currentUser?.internalNumber);

                                return (
                                    <tr key={shift.id} className="hover:bg-white/5 transition-colors group">
                                        <td className="px-6 py-4 text-sm text-slate-400">{shift.date}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                {isAssignedToMe ? (
                                                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                                ) : (
                                                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                                )}
                                                <span className="text-sm font-medium text-white">
                                                    {isAssignedToMe ? 'Turno Trabajado' : 'Turno Cedido'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-400">{shift.category}</td>
                                        <td className={clsx(
                                            "px-6 py-4 text-right font-bold",
                                            isAssignedToMe ? "text-emerald-400" : "text-red-400"
                                        )}>
                                            {isAssignedToMe ? '+' : '-'}${Number(shift.totalValue).toLocaleString('es-AR')}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Mobile Feed View */}
                <div className="md:hidden divide-y divide-slate-800">
                    {displayShifts.map(shift => {
                        const currentUser = getCurrentUser();
                        const isAssignedToMe = String(shift.assignedTo) === String(currentUser?.id) || String(shift.assignedTo) === String(currentUser?.internalNumber);

                        return (
                            <div key={shift.id} className="p-4 flex items-center justify-between hover:bg-white/5">
                                <div className="flex items-center gap-3">
                                    <div className={clsx(
                                        "w-10 h-10 rounded-full flex items-center justify-center border",
                                        isAssignedToMe
                                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                            : "bg-red-500/10 border-red-500/30 text-red-400"
                                    )}>
                                        {isAssignedToMe ? <CircleArrowUp className="w-5 h-5" /> : <CircleArrowDown className="w-5 h-5" />}
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-white">
                                            {isAssignedToMe ? 'Turno Trabajado' : 'Turno Cedido'}
                                        </div>
                                        <div className="text-xs text-slate-500 flex items-center gap-2">
                                            <span>{shift.date}</span>
                                            <span className="w-1 h-1 rounded-full bg-slate-600"></span>
                                            <span>{shift.category}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className={clsx(
                                    "font-bold text-sm",
                                    isAssignedToMe ? "text-emerald-400" : "text-red-400"
                                )}>
                                    {isAssignedToMe ? '+' : '-'}${Number(shift.totalValue).toLocaleString('es-AR')}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    );
};

export default MyBalance;
