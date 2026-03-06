// @ts-nocheck
import { type Shift } from '../services/api';
import { Clock, Bus, User, CheckCircle, XCircle, Edit, Trash2, UserPlus } from 'lucide-react';
import clsx from 'clsx';

interface ShiftCardProps {
  shift: Shift;
  onAction?: (
    action: 'approve' | 'reject' | 'take' | 'assign' | 'edit' | 'delete',
    id: number | string,
  ) => void;
  variant?: 'admin' | 'user' | 'public';
}

const ShiftCard = ({ shift, onAction, variant = 'user' }: ShiftCardProps) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Created':
        return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'Public':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'Assigned':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      default:
        return 'bg-slate-700 text-slate-400';
    }
  };

  // Format totalValue to show 2 decimals
  const formattedTotal = Number(shift.totalValue || 0).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // Format date to DD/MM/YYYY
  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    // const date = new Date(dateString); // Unused
    // Adjust for timezone offset to prevent off-by-one errors if string is UTC
    // Adjust for timezone offset to prevent off-by-one errors if string is UTC
    // const userTimezoneOffset = date.getTimezoneOffset() * 60000; // Unused
    // const adjustedDate = new Date(date.getTime() + userTimezoneOffset); // Unused, removing to fix lint

    return new Intl.DateTimeFormat('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(dateString)); // Use original string with UTC timezone to be safe/consistent
  };

  return (
    <div className="glass-panel p-5 rounded-2xl border border-slate-700/50 hover:border-primary-500/30 transition-all duration-300 group mb-4 shadow-lg shadow-black/20">
      {/* Header: Service ID + Status Badge */}
      <div className="flex justify-between items-start mb-3 border-b border-slate-700/50 pb-3">
        <div className="flex flex-col">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            Servicio #{shift.serviceNumber}
          </span>
          <h3 className="text-xl font-black text-white mt-1 group-hover:text-primary-400 transition-colors tracking-tight">
            {shift.category}
          </h3>
        </div>
        <span
          className={clsx(
            'text-[10px] font-bold px-3 py-1 rounded-full border shadow-sm uppercase tracking-wide',
            getStatusColor(shift.status),
          )}
        >
          {shift.status === 'Created'
            ? 'Pendiente'
            : shift.status === 'Public'
              ? 'Disponible'
              : shift.status === 'Assigned'
                ? 'Asignado'
                : shift.status}
        </span>
      </div>

      {/* Main Hierarchy: Driver or Assignee is King */}
      {shift.assigneeName && (
        <div className="mb-4 bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-300">
            <User className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 uppercase font-bold">Conductor Asignado</div>
            <div className="text-white font-bold text-lg leading-tight">{shift.assigneeName}</div>
          </div>
        </div>
      )}

      {/* Price & Details Grid */}
      <div className="flex justify-between items-end mb-4">
        <div>
          <div className="px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black text-2xl inline-flex items-center gap-1">
            <span className="text-lg opacity-70">$</span>
            {formattedTotal}
          </div>
          {shift.extraHours > 0 && (
            <div className="text-xs text-slate-500 mt-1 font-medium ml-1">
              + {Number(shift.extraHours).toFixed(1)}hs extra
            </div>
          )}
        </div>
        {shift.transformaFacil && (
          <div className="flex items-center gap-1.5 text-primary-400 bg-primary-900/20 px-2 py-1 rounded-lg border border-primary-500/20">
            <CheckCircle className="w-3.5 h-3.5" />
            <span className="text-xs font-bold">TransForma-</span>
          </div>
        )}
      </div>
      {/* Critical Info Grid - High Visibility */}
      {/* Critical Info Grid - High Visibility */}
      <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50 space-y-3 mb-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400">
              <Bus className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                Línea / Coche
              </div>
              <div className="text-white font-bold">
                {shift.line} <span className="text-slate-600">/</span> {shift.carNumber}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
              Fecha
            </div>
            <div className="text-white font-medium">{formatDate(shift.date)}</div>
          </div>
        </div>

        <div className="h-px bg-slate-700/50 w-full" />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                Horario
              </div>
              <div className="text-white font-bold flex items-center gap-2">
                {shift.time} Hs
                {shift.endTime && (
                  <span className="text-slate-500 font-normal text-xs">➔ {shift.endTime} Hs</span>
                )}
              </div>
            </div>
          </div>
          {shift.relief && (
            <div className="text-right">
              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                Relevo
              </div>
              <div className="text-slate-300 font-medium">{shift.relief}</div>
            </div>
          )}
        </div>
      </div>

      {/* Actions - Tactile & Spaced */}
      <div className="flex flex-col gap-3">
        <div className="flex gap-3 h-12">
          {/* Buttons Logic (Simplified for brevity, ensuring classes are updated) */}
          {/* IF ADMIN & CREATED */}
          {variant === 'admin' && shift.status === 'Created' && (
            <>
              <button
                onClick={() => onAction?.('approve', shift.id)}
                className="flex-1 bg-green-600 hover:bg-green-500 text-white rounded-xl shadow-lg shadow-green-900/20 font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                <CheckCircle className="w-5 h-5" /> Aprobar
              </button>
              <button
                onClick={() => onAction?.('reject', shift.id)}
                className="w-14 bg-slate-800 hover:bg-slate-700 text-red-400 rounded-xl border border-slate-700 flex items-center justify-center transition-all active:scale-95"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </>
          )}

          {/* IF ADMIN & PUBLIC */}
          {variant === 'admin' && shift.status === 'Public' && (
            <>
              <div className="flex-1 flex gap-2">
                <button
                  onClick={() => onAction?.('assign', shift.id)}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20 active:scale-95 transition-all"
                >
                  <UserPlus className="w-5 h-5" /> Asignar
                </button>
                <button
                  onClick={() => onAction?.('edit', shift.id)}
                  className="w-12 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 flex items-center justify-center active:scale-95 transition-all"
                >
                  <Edit className="w-5 h-5" />
                </button>
                <button
                  onClick={() => onAction?.('delete', shift.id)}
                  className="w-12 bg-red-900/20 hover:bg-red-900/30 text-red-400 rounded-xl border border-red-900/30 flex items-center justify-center active:scale-95 transition-all"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </>
          )}

          {/* IF ADMIN & ASSIGNED/COMPLETED */}
          {variant === 'admin' && (shift.status === 'Assigned' || shift.status === 'Completed') && (
            <div className="flex-1 flex gap-2">
              <button
                onClick={() => onAction?.('assign', shift.id)}
                className="flex-1 bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-500 border border-yellow-600/30 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                <User className="w-5 h-5" /> Reasignar
              </button>
              <button
                onClick={() => onAction?.('edit', shift.id)}
                className="w-12 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 flex items-center justify-center active:scale-95 transition-all"
              >
                <Edit className="w-5 h-5" />
              </button>
              <button
                onClick={() => onAction?.('delete', shift.id)}
                className="w-12 bg-red-900/20 hover:bg-red-900/30 text-red-400 rounded-xl border border-red-900/30 flex items-center justify-center active:scale-95 transition-all"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        {/* WhatsApp Block (Full Width) */}
        {variant === 'admin' &&
          (shift.status === 'Assigned' || shift.status === 'Completed') &&
          shift.assigneePhone && (
            <button
              onClick={() => {
                const phone = shift.assigneePhone?.replace(/\D/g, '');
                if (!phone) return alert('Número de teléfono inválido');

                const message =
                  `👋 Hola ${shift.assigneeName || 'Chofer'}, tienes un nuevo turno asignado:\n` +
                  `📅 Fecha: ${formatDate(shift.date)}\n` +
                  `⏰ Hora: ${shift.time} Hs${shift.endTime ? ` - ${shift.endTime} Hs` : ''}\n` +
                  `🚌 Coche: ${shift.carNumber} (Línea ${shift.line})\n` +
                  `💵 Valor: $${Number(shift.totalValue).toLocaleString()}\n\n` +
                  `Por favor ingresa a la app para gestionarlo: ${window.location.origin}`;

                const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
                window.open(url, '_blank');
              }}
              className="w-full bg-green-600 hover:bg-green-500 text-white h-12 rounded-xl shadow-lg shadow-green-900/20 transition-all flex justify-center items-center gap-2 text-sm font-bold active:scale-95"
            >
              <svg
                viewBox="0 0 24 24"
                className="w-5 h-5 fill-current"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
              </svg>
              Enviar Detalle
            </button>
          )}

        {/* Public User Actions */}
        {variant === 'public' && shift.status === 'Public' && (
          <button
            onClick={() => onAction?.('take', shift.id)}
            className="w-full bg-primary-600 hover:bg-primary-500 text-white h-12 rounded-xl shadow-lg shadow-primary-900/50 transition-all flex justify-center items-center gap-2 text-sm font-bold active:scale-95"
          >
            Tomar Turno
          </button>
        )}

        {/* Regular User Actions */}
        {variant === 'user' && (shift.status === 'Created' || shift.status === 'Public') && (
          <button
            onClick={() => onAction?.('delete', shift.id)}
            className="w-full bg-red-600/20 hover:bg-red-600/30 text-red-400 h-10 rounded-xl border border-red-600/30 transition-colors flex justify-center items-center gap-2 text-sm font-medium"
          >
            <Trash2 className="w-4 h-4" /> Eliminar Turno
          </button>
        )}
      </div>
    </div>
  );
};

export default ShiftCard;
