import { useState, useEffect, useRef } from 'react';
import { Bell, Info, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { MensajesInternosService } from '../services/firestore/mensajesInternos';
import type { MensajeInternoEntry } from '../services/firestore/mensajesInternos';
import clsx from 'clsx';

const NotificationsDropdown = () => {
  const { user } = useAuth();
  const uid = user?.uid ?? user?.id ?? '';
  const [notifications, setNotifications] = useState<MensajeInternoEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!uid) return;
    const unsub = MensajesInternosService.subscribeByUser(String(uid), (list) => {
      setNotifications(list);
      setUnreadCount(list.filter((n) => !n.readAt).length);
    });
    return () => unsub();
  }, [uid]);

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const toggleDropdown = () => setIsOpen(!isOpen);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getIcon = (tipo: string) => {
    switch (tipo) {
      case 'cambio_turno':
        return <AlertTriangle className="w-5 h-5 text-amber-400" />;
      case 'aviso':
        return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
      default:
        return <Info className="w-5 h-5 text-blue-400" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={toggleDropdown}
        className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all relative touch-manipulation"
        aria-label="Notificaciones y mensajes internos (Listero / Chofer)"
        title="Notificaciones y mensajes"
      >
        <Bell className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-slate-900 animate-pulse"></span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-slate-900 border border-slate-700 rounded-2xl shadow-xl shadow-black/50 overflow-hidden z-50 animate-fade-in-up">
          <div className="p-4 border-b border-slate-800 flex justify-between items-center">
            <h3 className="font-bold text-white">Notificaciones y mensajes</h3>
            {unreadCount > 0 && (
              <span className="text-xs bg-primary-500/20 text-primary-300 px-2 py-0.5 rounded-full">
                <span>{unreadCount} nuevas</span>
              </span>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length > 0 ? (
              notifications.map((notif) => (
                <div
                  key={notif.id ?? ''}
                  onClick={() => !notif.readAt && notif.id && markAsRead(notif.id)}
                  className={clsx(
                    'p-4 border-b border-slate-800/50 hover:bg-slate-800 transition-colors cursor-pointer flex gap-3',
                    !notif.readAt ? 'bg-slate-800/20' : 'opacity-70',
                  )}
                >
                  <div className="mt-1">{getIcon(notif.tipo)}</div>
                  <div>
                    <h4
                      className={clsx(
                        'text-sm font-semibold',
                        !notif.readAt ? 'text-white' : 'text-slate-400',
                      )}
                    >
                      <span>{notif.titulo}</span>
                    </h4>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      <span>{notif.mensaje}</span>
                    </p>
                    <span className="text-[10px] text-slate-600 mt-2 block">
                      <span>
                        {notif.createdAt ? new Date(notif.createdAt).toLocaleDateString() : ''}{' '}
                        {notif.createdAt ? new Date(notif.createdAt).toLocaleTimeString() : ''}
                      </span>
                    </span>
                  </div>
                  {!notif.readAt && (
                    <div className="flex items-center">
                      <div className="w-2 h-2 bg-primary-500 rounded-full"></div>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-slate-500 text-sm">
                <span>No tienes notificaciones.</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationsDropdown;
