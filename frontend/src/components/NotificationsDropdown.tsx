
import { useState, useEffect, useRef } from 'react';
import { Bell, Info, AlertTriangle, CheckCircle } from 'lucide-react';
import { getAuthToken } from '../utils/auth';
import clsx from 'clsx';

interface Notification {
    id: number;
    title: string;
    message: string;
    isRead: boolean;
    type: 'INFO' | 'SUCCESS' | 'WARNING';
    createdAt: string;
}

const NotificationsDropdown = () => {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const loadNotifications = async () => {
        const token = getAuthToken();
        if (!token) return;

        try {
            const res = await fetch('/api/notifications', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    setNotifications(data);
                    setUnreadCount(data.filter((n: Notification) => !n.isRead).length);
                }
            }
        } catch (error) {
            console.error('Error loading notifications', error);
        }
    };

    useEffect(() => {
        loadNotifications();
        // Poll every 30 seconds
        const interval = setInterval(loadNotifications, 30000);
        return () => clearInterval(interval);
    }, []);

    const markAsRead = async (id: number) => {
        const token = getAuthToken();
        try {
            await fetch(`/api/notifications/${id}/read`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}` }
            });
            // Update local state
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (error) {
            console.error('Error marking as read', error);
        }
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

    const getIcon = (type: string) => {
        switch (type) {
            case 'SUCCESS': return <CheckCircle className="w-5 h-5 text-green-400" />;
            case 'WARNING': return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
            default: return <Info className="w-5 h-5 text-blue-400" />;
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={toggleDropdown}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all relative"
            >
                <Bell className="w-6 h-6" />
                {unreadCount > 0 && (
                    <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-slate-900 animate-pulse"></span>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-slate-900 border border-slate-700 rounded-2xl shadow-xl shadow-black/50 overflow-hidden z-50 animate-fade-in-up">
                    <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                        <h3 className="font-bold text-white"><span>Notificaciones</span></h3>
                        {unreadCount > 0 && (
                            <span className="text-xs bg-primary-500/20 text-primary-300 px-2 py-0.5 rounded-full"><span>{unreadCount} nuevas</span></span>
                        )}
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                        {notifications.length > 0 ? (
                            notifications.map(notif => (
                                <div
                                    key={notif.id}
                                    onClick={() => !notif.isRead && markAsRead(notif.id)}
                                    className={clsx(
                                        "p-4 border-b border-slate-800/50 hover:bg-slate-800 transition-colors cursor-pointer flex gap-3",
                                        !notif.isRead ? "bg-slate-800/20" : "opacity-70"
                                    )}
                                >
                                    <div className="mt-1">{getIcon(notif.type)}</div>
                                    <div>
                                        <h4 className={clsx("text-sm font-semibold", !notif.isRead ? "text-white" : "text-slate-400")}><span>{notif.title}</span></h4>
                                        <p className="text-xs text-slate-400 mt-1 leading-relaxed"><span>{notif.message}</span></p>
                                        <span className="text-[10px] text-slate-600 mt-2 block">
                                            <span>{new Date(notif.createdAt).toLocaleDateString()} {new Date(notif.createdAt).toLocaleTimeString()}</span>
                                        </span>
                                    </div>
                                    {!notif.isRead && (
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
