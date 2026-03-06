import { useState, useEffect } from 'react';
import { ShiftService } from '../../services/api';
import { PDFService } from '../../services/pdf';
import { Search, TrendingUp, TrendingDown, DollarSign, ExternalLink, FileText } from 'lucide-react';
import clsx from 'clsx';

const AdminBalances = () => {
  const [stats, setStats] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- MODAL LOGIC (Hoisted) ---
  const [selectedUserForPayout, setSelectedUserForPayout] = useState<any>(null);
  const [payoutShifts, setPayoutShifts] = useState<any[]>([]);
  const [loadingPayout, setLoadingPayout] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ShiftService.getBalances();
      setStats(data);
    } catch (err) {
      console.error('Error loading balances:', err);
      setError('No se pudo cargar la información financiera. Intente nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Cargando análisis financiero...</div>;
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-400 mb-4">{error}</p>
        <button
          onClick={loadData}
          className="px-4 py-2 bg-slate-800 text-white rounded hover:bg-slate-700"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!stats) return null;

  const { globals, users } = stats;

  // Filter by search
  const filteredUsers = searchTerm
    ? users.filter(
        (u: any) =>
          u.internalNumber.includes(searchTerm) ||
          (u.firstName + ' ' + u.lastName).toLowerCase().includes(searchTerm.toLowerCase()),
      )
    : users;

  // Recalculate global balance for flow
  const balanceGlobal = Number(globals.totalTomados) - Number(globals.totalCedidos);

  const openPayoutModal = async (user: any) => {
    if (Number(user.balance) === 0) {
      alert('El saldo es cero, no se requiere acción.');
      return;
    }

    setSelectedUserForPayout(user);
    setLoadingPayout(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/shifts/unpaid/${user.user_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setPayoutShifts(data);
      }
    } catch (error) {
      console.error('Error loading unpaid shifts', error);
    } finally {
      setLoadingPayout(false);
    }
  };

  const handlePartialPayment = async (amount: number) => {
    if (!selectedUserForPayout) return;

    const currentBalance = Number(selectedUserForPayout.balance);
    const isDebt = currentBalance < 0;

    // If Debt (Negative Balance), collecting money acts as a "Negative Payment" in our formula
    // Formula: Balance = Shifts - Payments.
    // To reduce debt (increase balance from -1000 to -600), we need Payment to be -400.
    // -1000 - (-400) = -600.

    const finalAmount = isDebt ? -amount : amount;
    const actionType = isDebt ? 'COBRO' : 'PAGO';

    if (!confirm(`¿Confirmas un ${actionType} PARCIAL de $${amount.toLocaleString()}?`)) return;

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/shifts/payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: selectedUserForPayout.user_id,
          amount: finalAmount,
        }),
      });

      if (res.ok) {
        alert(`${actionType.toLowerCase()} parcial registrado correctamente.`);
        setSelectedUserForPayout(null);
        loadData();
      } else {
        alert('Error al registrar la operación.');
      }
    } catch (error) {
      console.error('Payment error', error);
    }
  };

  const handlePayBalance = async () => {
    if (!selectedUserForPayout) return;

    const balance = Number(selectedUserForPayout.balance);
    const actionText = balance >= 0 ? 'pagaste al chofer' : 'cobraste la deuda';
    const absBalance = Math.abs(balance).toLocaleString();

    if (
      !confirm(
        `¿Confirmas que ${actionText} el SALDO RESTANTE de $${absBalance}? \n\nEsta acción dejará el balance en $0.`,
      )
    )
      return;

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/shifts/pay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: selectedUserForPayout.user_id }),
      });

      if (res.ok) {
        const successMsg =
          balance > 0 ? 'Pago final registrado. Balance en $0.' : 'Deuda saldada. Balance en $0.';

        alert(successMsg);
        setSelectedUserForPayout(null);
        setPayoutShifts([]);
        loadData();
      } else {
        alert('Error al procesar la operación.');
      }
    } catch (error) {
      console.error('Payment error', error);
      alert('Error al conectar con el servidor.');
    }
  };

  // User Account Card Logic
  const activeUserCard = filteredUsers.length === 1 && searchTerm !== '' ? filteredUsers[0] : null;

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Payout Modal */}
      {selectedUserForPayout && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-panel border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-700 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-white">Detalle de Deuda</h2>
                <p className="text-slate-400">
                  Usuario: {selectedUserForPayout.firstName} {selectedUserForPayout.lastName} (#
                  {selectedUserForPayout.internalNumber})
                </p>
              </div>
              <button
                onClick={() => setSelectedUserForPayout(null)}
                className="text-slate-400 hover:text-white"
              >
                <ExternalLink className="rotate-45" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {loadingPayout ? (
                <div className="text-center py-10">Cargando viajes...</div>
              ) : (
                <>
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center mb-6">
                    <div className="text-sm text-red-300 uppercase font-bold">Total a Pagar</div>
                    <div className="text-3xl font-black text-white">
                      ${Math.abs(Number(selectedUserForPayout.balance)).toLocaleString()}
                    </div>
                  </div>

                  <h3 className="font-bold text-white mb-2">Historial de Viajes Pendientes</h3>
                  <div className="space-y-2">
                    {payoutShifts.map((s) => (
                      <div
                        key={s.id}
                        className="bg-slate-800/50 p-3 rounded-lg border border-slate-700 flex justify-between items-center"
                      >
                        <div>
                          <div className="text-white font-medium">
                            {s.date.split('T')[0]} - {s.time}
                          </div>
                          <div className="text-xs text-slate-400">
                            Línea {s.line} / Coche {s.carNumber}
                          </div>
                          <div className="text-xs text-slate-500">
                            Creado por: {s.creatorFirstName} {s.creatorLastName}
                          </div>
                        </div>
                        <div className="font-bold text-emerald-400">
                          ${Number(s.totalValue).toLocaleString()}
                        </div>
                      </div>
                    ))}
                    {payoutShifts.length === 0 && (
                      <div className="text-slate-500 text-center">No hay viajes pendientes.</div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="p-4 md:p-6 border-t border-slate-700 bg-slate-900/50 rounded-b-2xl space-y-4">
              {/* Partial Payment Input */}
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                  <input
                    type="number"
                    placeholder={
                      Number(selectedUserForPayout.balance) < 0
                        ? 'Monto a Cobrar...'
                        : 'Monto a Pagar...'
                    }
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg py-3 pl-8 pr-4 text-white focus:outline-none focus:border-primary-500"
                    id="partialAmountInput"
                  />
                </div>
                <button
                  onClick={() => {
                    const input = document.getElementById('partialAmountInput') as HTMLInputElement;
                    const amount = Number(input.value);
                    if (amount > 0) handlePartialPayment(amount);
                  }}
                  className={clsx(
                    'px-4 py-3 sm:py-2 text-white rounded-lg font-bold transition-colors w-full sm:w-auto',
                    Number(selectedUserForPayout.balance) < 0
                      ? 'bg-blue-600 hover:bg-blue-500' // Blue for Collection
                      : 'bg-emerald-600 hover:bg-emerald-500', // Green for Payout
                  )}
                >
                  {Number(selectedUserForPayout.balance) < 0 ? 'Registrar Cobro' : 'Registrar Pago'}
                </button>
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4 border-t border-slate-800/50">
                <button
                  onClick={() => setSelectedUserForPayout(null)}
                  className="px-4 py-3 sm:py-2 rounded-xl text-slate-300 hover:bg-slate-800 transition-colors w-full sm:w-auto"
                >
                  Cancelar
                </button>
                <button
                  onClick={handlePayBalance}
                  className={clsx(
                    'px-6 py-3 sm:py-2 rounded-xl text-white font-bold shadow-lg transition-all flex items-center justify-center gap-2 w-full sm:w-auto',
                    Number(selectedUserForPayout.balance) < 0
                      ? 'bg-red-600 hover:bg-red-500 shadow-red-900/20'
                      : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20',
                  )}
                >
                  <DollarSign className="w-5 h-5" />
                  <span className="truncate max-w-[200px] sm:max-w-none">
                    {Number(selectedUserForPayout.balance) < 0
                      ? 'Saldar Deuda Total'
                      : 'Saldar Pago Total'}
                  </span>
                  <span className="opacity-80 ml-1">
                    (${Math.abs(Number(selectedUserForPayout.balance)).toLocaleString()})
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Balances Generales</h1>
          <p className="text-slate-400">Resumen financiero consolidado (SQL Optimizado).</p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-all text-sm font-bold border border-slate-700 hover:border-slate-500"
          disabled={loading}
        >
          <div className={clsx('transition-transform duration-700', loading && 'rotate-[360deg]')}>
            <TrendingUp className="w-4 h-4" /> {/* Reusing icon or use RefreshCw if imported */}
          </div>
          {loading ? 'Actualizando...' : 'Actualizar Datos'}
        </button>
      </div>

      {/* Global Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-panel p-4 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <TrendingDown className="w-4 h-4" />
            <span className="text-xs font-bold uppercase">Total Cedidos</span>
          </div>
          <div className="text-xl font-bold text-white">
            $
            {globals.totalCedidos.toLocaleString('es-AR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        </div>
        <div className="glass-panel p-4 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <TrendingUp className="w-4 h-4" />
            <span className="text-xs font-bold uppercase">Total Realizados</span>
          </div>
          <div className="text-xl font-bold text-white">
            $
            {globals.totalTomados.toLocaleString('es-AR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        </div>

        <div className="glass-panel p-4 rounded-xl border border-slate-800 bg-purple-900/10 border-purple-500/20">
          <div className="flex items-center gap-2 text-purple-400 mb-1">
            <DollarSign className="w-4 h-4" />
            <span className="text-xs font-bold uppercase">A Cubrir (Admin)</span>
          </div>
          <div className="text-xl font-bold text-white">
            $
            {globals.totalDiscounts.toLocaleString('es-AR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <div className="text-[10px] text-purple-300/60 mt-1">
            Descuentos TransForma- (A Canje) Est.
          </div>
        </div>

        <div
          className={clsx(
            'p-4 rounded-xl border col-span-1 md:col-span-1 shadow-lg flex flex-col justify-center bg-slate-800/50 border-slate-700',
          )}
        >
          <div className="flex items-center gap-2 text-slate-400 mb-1">
            <DollarSign className="w-4 h-4" />
            <span className="text-xs font-bold uppercase">Flujo Neto</span>
          </div>
          <div className="text-2xl font-black text-white">
            ${' '}
            {balanceGlobal.toLocaleString('es-AR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        </div>
      </div>

      <div className="glass-panel rounded-2xl border border-slate-800 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <h3 className="font-bold text-white">Detalle por Usuario</h3>
          <div className="flex gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:flex-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar por Interno..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-white rounded-xl pl-9 pr-10 py-2 text-sm focus:border-primary-500 focus:outline-none w-full md:w-80"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white bg-slate-800 rounded-full p-1"
                  title="Limpiar búsqueda"
                >
                  ✕
                </button>
              )}
            </div>
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold rounded-xl transition-colors whitespace-nowrap"
              >
                Ver Todos
              </button>
            )}
          </div>
        </div>

        {/* ACTIVE USER CARD (Conditionally Rendered) */}
        {activeUserCard && (
          <div className="mb-8 bg-gradient-to-r from-slate-800 to-slate-900 border border-slate-600 rounded-2xl p-6 shadow-2xl relative overflow-hidden animate-fade-in">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <DollarSign className="w-32 h-32 text-white" />
            </div>

            {/* Back Button Overlay */}
            <div className="absolute top-4 right-4 z-20 md:hidden">
              <button
                onClick={() => setSearchTerm('')}
                className="bg-slate-800/80 p-2 rounded-full text-slate-300 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="w-full md:w-auto text-center md:text-left">
                <div className="flex items-center justify-center md:justify-start gap-3 mb-1">
                  <button
                    onClick={() => setSearchTerm('')}
                    className="hidden md:flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white transition-colors"
                  >
                    ← Volver
                  </button>
                  <span className="text-sm text-slate-400 font-bold uppercase tracking-wider">
                    Cuenta Corriente
                  </span>
                </div>
                <h2 className="text-2xl md:text-3xl font-black text-white capitalize">
                  {activeUserCard.lastName} {activeUserCard.firstName}
                </h2>
                <div className="text-primary-400 font-bold text-lg">
                  Interno #{activeUserCard.internalNumber}
                </div>
              </div>

              <div className="text-center md:text-right w-full md:w-auto bg-slate-800/50 md:bg-transparent p-4 md:p-0 rounded-2xl md:rounded-none">
                <div className="text-xs text-slate-400 font-bold uppercase mb-1">
                  Balance Actual
                </div>
                <div
                  className={clsx(
                    'text-4xl font-black mb-2',
                    Number(activeUserCard.balance) >= 0 ? 'text-emerald-400' : 'text-red-400',
                  )}
                >
                  {Number(activeUserCard.balance) >= 0 ? '+' : ''}$
                  {Number(activeUserCard.balance).toLocaleString('es-AR', {
                    minimumFractionDigits: 2,
                  })}
                </div>
                <div className="text-xs text-slate-500">
                  {Number(activeUserCard.balance) >= 0
                    ? 'A favor del chofer'
                    : 'Deuda con la administración'}
                </div>
              </div>

              <div className="w-full md:w-auto flex flex-col gap-2">
                <button
                  onClick={() => {
                    // Specific handler for PDF, using activeUserCard from text context
                    const token = localStorage.getItem('token');
                    fetch(`/api/shifts/unpaid/${activeUserCard.user_id}`, {
                      headers: { Authorization: `Bearer ${token}` },
                    })
                      .then((res) => res.json())
                      .then((data) => {
                        if (Array.isArray(data)) {
                          PDFService.generateUserStatement(activeUserCard, data);
                        }
                      });
                  }}
                  className="w-full md:w-auto px-6 py-2 rounded-xl font-bold border border-slate-600 hover:bg-slate-800 text-slate-300 transition-all flex items-center justify-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  Descargar Resumen
                </button>

                <button
                  onClick={() => openPayoutModal(activeUserCard)}
                  className={clsx(
                    'w-full md:w-auto px-6 py-3 rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2',
                    Number(activeUserCard.balance) === 0
                      ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                      : Number(activeUserCard.balance) > 0
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white hover:scale-105'
                        : 'bg-red-600 hover:bg-red-500 text-white hover:scale-105',
                  )}
                  disabled={Number(activeUserCard.balance) === 0}
                >
                  <DollarSign className="w-5 h-5" />
                  {Number(activeUserCard.balance) === 0 ? 'Al Día' : 'Saldar Cuentas'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="text-slate-500 text-xs uppercase font-bold border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Interno</th>
                <th className="px-4 py-3">Apellido y Nombre</th>
                <th className="px-4 py-3 text-right">Cedidos (-)</th>
                <th className="px-4 py-3 text-right">Realizados (+)</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredUsers.length > 0 ? (
                filteredUsers.map((user: any) => {
                  const balance = Number(user.balance);
                  return (
                    <tr
                      key={user.internalNumber}
                      className="hover:bg-white/5 transition-colors group"
                    >
                      <td className="px-4 py-4 font-bold text-primary-400">
                        #{user.internalNumber}
                      </td>
                      <td className="px-4 py-4 text-white capitalize">
                        {user.lastName} {user.firstName}
                      </td>
                      <td className="px-4 py-4 text-right text-red-300/80 font-medium">
                        $
                        {Number(user.cedidos).toLocaleString('es-AR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-4 py-4 text-right text-emerald-300/80 font-medium">
                        $
                        {Number(user.tomados).toLocaleString('es-AR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td
                        className={clsx(
                          'px-4 py-4 text-right font-black text-sm',
                          balance >= 0 ? 'text-emerald-400' : 'text-red-400',
                        )}
                      >
                        {balance >= 0 ? '+' : ''}$
                        {balance.toLocaleString('es-AR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <td className="px-4 py-4 text-right">
                          {/* Button removed. Use search to view detail/pay */}
                          <button
                            className="p-2 text-slate-600 cursor-default"
                            disabled
                            title="Use el buscador para ver detalles"
                          >
                            -
                          </button>
                        </td>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-500">
                    No se encontraron datos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card Layout */}
        <div className="md:hidden space-y-3">
          {filteredUsers.length > 0 ? (
            filteredUsers.map((user: any) => {
              const balance = Number(user.balance);
              return (
                <div
                  key={user.internalNumber}
                  className="glass-panel p-4 rounded-xl border border-slate-800 relative"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <span className="text-primary-400 font-bold text-sm">
                        #{user.internalNumber}
                      </span>
                      <div className="text-white font-bold capitalize">
                        {user.lastName} {user.firstName}
                      </div>
                    </div>
                    <div
                      className={clsx(
                        'font-black text-lg',
                        balance >= 0 ? 'text-emerald-400' : 'text-red-400',
                      )}
                    >
                      {balance >= 0 ? '+' : ''}$
                      {balance.toLocaleString('es-AR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-red-900/10 border border-red-500/20 rounded-lg p-2 text-center">
                      <div className="text-red-400/70 uppercase font-bold tracking-wider mb-1">
                        Cedidos
                      </div>
                      <div className="text-white font-bold">
                        ${Number(user.cedidos).toLocaleString('es-AR')}
                      </div>
                    </div>
                    <div className="bg-emerald-900/10 border border-emerald-500/20 rounded-lg p-2 text-center">
                      <div className="text-emerald-400/70 uppercase font-bold tracking-wider mb-1">
                        Realizados
                      </div>
                      <div className="text-white font-bold">
                        ${Number(user.tomados).toLocaleString('es-AR')}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-10 text-slate-500">No se encontraron datos.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminBalances;
