
import { useState, useEffect } from 'react';
import { UserService } from '../services/api';
import { Search, User, X, CheckCircle, Loader2 } from 'lucide-react';
import clsx from 'clsx';

interface AssignShiftModalProps {
    onClose: () => void;
    onAssign: (userId: number) => void;
    currentAssigneeId?: number;
}

const AssignShiftModal = ({ onClose, onAssign, currentAssigneeId }: AssignShiftModalProps) => {
    const [users, setUsers] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

    useEffect(() => {
        const loadUsers = async () => {
            try {
                const data = await UserService.getAll();
                // Defensive check
                if (Array.isArray(data)) {
                    setUsers(data);
                } else {
                    console.error('UserService.getAll did not return an array:', data);
                    setUsers([]);
                }
            } catch (error) {
                console.error('Error loading users:', error);
                setUsers([]);
            } finally {
                setIsLoading(false);
            }
        };
        loadUsers();
    }, []);

    const safeUsers = Array.isArray(users) ? users : [];
    const filteredUsers = safeUsers.filter(user =>
        user.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.internalNumber?.toString().includes(searchTerm)
    );

    const handleAssign = () => {
        if (selectedUserId) {
            onAssign(selectedUserId);
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">

                {/* Header */}
                <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
                    <h2 className="text-xl font-bold text-white"><span>Asignar Turno</span></h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Search */}
                <div className="p-4 border-b border-slate-700 bg-slate-800/20">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Buscar por nombre o n° interno..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl pl-9 pr-4 py-3 focus:border-primary-500 focus:outline-none transition-all"
                            autoFocus
                        />
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {isLoading ? (
                        <div className="flex justify-center p-8 items-center flex-col gap-2 text-slate-500">
                            <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
                            <span className="text-sm">Cargando conductores...</span>
                        </div>
                    ) : filteredUsers.length > 0 ? (
                        filteredUsers.map(user => (
                            <button
                                key={user.id}
                                onClick={() => setSelectedUserId(user.id)}
                                className={clsx(
                                    "w-full p-3 rounded-xl flex items-center justify-between transition-all group",
                                    selectedUserId === user.id
                                        ? "bg-primary-600/20 border border-primary-500/50 text-white"
                                        : "hover:bg-slate-800 text-slate-300 border border-transparent"
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={clsx(
                                        "w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm",
                                        selectedUserId === user.id ? "bg-primary-600 text-white" : "bg-slate-800 text-slate-400 group-hover:bg-slate-700"
                                    )}>
                                        {user.internalNumber || <User className="w-5 h-5" />}
                                    </div>
                                    <div className="text-left">
                                        <div className="font-semibold">{user.fullName}</div>
                                        <div className="text-xs opacity-70">Interno: {user.internalNumber || 'N/A'}</div>
                                    </div>
                                </div>
                                {currentAssigneeId === user.id && (
                                    <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-full"><span>Actual</span></span>
                                )}
                                {selectedUserId === user.id && (
                                    <CheckCircle className="w-5 h-5 text-primary-500" />
                                )}
                            </button>
                        ))
                    ) : (
                        <div className="text-center py-8 text-slate-500">
                            <span>No se encontraron usuarios.</span>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-700 bg-slate-800/50">
                    <button
                        onClick={handleAssign}
                        disabled={!selectedUserId}
                        className="w-full bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl shadow-lg shadow-primary-900/50 transition-all flex items-center justify-center gap-2"
                    >
                        <User className="w-5 h-5" />
                        <span>{currentAssigneeId && selectedUserId !== currentAssigneeId ? 'Reasignar Conductor' : 'Asignar Conductor'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AssignShiftModal;
