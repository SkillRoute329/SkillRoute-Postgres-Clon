import { useState, useEffect } from 'react';
import { UserPlus, Edit, Trash2, Phone, MessageCircle } from 'lucide-react';
import clsx from 'clsx';

interface User {
    id: number;
    internalNumber: string;
    firstName: string;
    lastName: string;
    fullName: string;
    phoneNumber?: string;
    whatsappLink?: string;
    role: string;
    isActive: boolean;
    createdAt: string;
    departmentId?: number;
    department?: {
        id: number;
        name: string;
    };
}

interface Department {
    id: number;
    name: string;
}

const AdminUsers = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [formData, setFormData] = useState({
        internalNumber: '',
        firstName: '',
        lastName: '',
        phoneNumber: '',
        whatsappLink: '',
        password: '',
        role: 'User',
        departmentId: '',
        isActive: true
    });

    useEffect(() => {
        loadUsers();
        loadDepartments();
    }, []);

    const loadDepartments = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/departments', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (res.ok) {
                const data = await res.json();
                setDepartments(data);
            }
        } catch (error) {
            console.error('Error loading departments:', error);
        }
    };

    const loadUsers = async () => {
        setIsLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/users', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const data = await res.json();
            if (res.ok && Array.isArray(data)) {
                setUsers(data);
            } else {
                console.error('Failed to load users:', data);
                setUsers([]);
            }
        } catch (error) {
            console.error('Error loading users:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('token');
            const method = editingUser ? 'PUT' : 'POST';
            const url = editingUser
                ? `/api/users/${editingUser.id}`
                : '/api/users';

            // Process Phone and WhatsApp
            const cleanPhone = formData.phoneNumber?.replace(/\D/g, '') || '';
            const fullPhone = cleanPhone ? `+598 ${cleanPhone}` : '';
            const waLink = cleanPhone ? `https://wa.me/598${cleanPhone.replace(/^0+/, '')}` : '';

            // Only send password if it's filled
            const payload = {
                ...formData,
                phoneNumber: fullPhone,
                whatsappLink: waLink,
                departmentId: formData.departmentId ? parseInt(formData.departmentId) : null,
                password: (editingUser && !formData.password) ? undefined : formData.password
            };

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const error = await res.json();
                alert(error.message || 'Error al guardar usuario');
                return;
            }

            alert(editingUser ? 'Usuario actualizado' : 'Usuario creado exitosamente');
            setShowModal(false);
            setEditingUser(null);
            resetForm();
            loadUsers();
        } catch (error) {
            console.error('Error saving user:', error);
            alert('Error al guardar usuario: ' + (error as any).message);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('¿Estás seguro de eliminar este usuario?')) return;

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/users/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!res.ok) {
                const error = await res.json();
                alert(error.message || 'Error al eliminar usuario');
                return;
            }

            alert('Usuario eliminado');
            loadUsers();
        } catch (error) {
            console.error('Error deleting user:', error);
            alert('Error al eliminar usuario');
        }
    };

    const openEditModal = (user: User) => {
        setEditingUser(user);
        setFormData({
            internalNumber: user.internalNumber,
            firstName: user.firstName,
            lastName: user.lastName,
            phoneNumber: user.phoneNumber || '',
            whatsappLink: user.whatsappLink || '',
            password: '',
            role: user.role,
            departmentId: user.departmentId ? user.departmentId.toString() : '',
            isActive: user.isActive
        });
        setShowModal(true);
    };

    const openCreateModal = () => {
        setEditingUser(null);
        resetForm();
        setShowModal(true);
    };

    const resetForm = () => {
        setFormData({
            internalNumber: '',
            firstName: '',
            lastName: '',
            phoneNumber: '',
            whatsappLink: '',
            password: '',
            role: 'User',
            departmentId: '',
            isActive: true
        });
    };

    return (
        <div className="space-y-6 animate-fade-in-up">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white"><span>Usuarios</span></h1>
                    <p className="text-slate-400"><span>Gestiona los usuarios del sistema</span></p>
                </div>
                <button
                    onClick={openCreateModal}
                    className="w-full sm:w-auto bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-primary-900/50">
                    <UserPlus className="w-5 h-5" />
                    <span>Nuevo Usuario</span>
                </button>
            </div>

            {/* Content */}
            {isLoading ? (
                <div className="text-center py-20 text-slate-500 animate-pulse"><span>Cargando usuarios...</span></div>
            ) : (
                <>
                    {/* Desktop Table (Hidden on Mobile) */}
                    <div className="hidden md:block glass-panel rounded-2xl border border-slate-800 overflow-x-auto touch-pan-x">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-900/50 text-slate-500 text-xs uppercase font-bold border-b border-slate-800">
                                <tr>
                                    <th className="px-6 py-4"><span>Interno</span></th>
                                    <th className="px-6 py-4"><span>Apellido</span></th>
                                    <th className="px-6 py-4"><span>Nombre</span></th>
                                    <th className="px-6 py-4"><span>Celular</span></th>
                                    <th className="px-6 py-4"><span>Rol</span></th>
                                    <th className="px-6 py-4"><span>Depto.</span></th>
                                    <th className="px-6 py-4"><span>Estado</span></th>
                                    <th className="px-6 py-4 text-right"><span>Acciones</span></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {users.map(user => (
                                    <tr key={user.id} className="hover:bg-white/5 transition-colors">
                                        <td className="px-6 py-4 font-bold text-primary-400"><span>#{user.internalNumber}</span></td>
                                        <td className="px-6 py-4 text-white"><span>{user.lastName}</span></td>
                                        <td className="px-6 py-4 text-white"><span>{user.firstName}</span></td>
                                        <td className="px-6 py-4 text-slate-300">
                                            <div className="flex items-center gap-2">
                                                {user.phoneNumber && (
                                                    <>
                                                        <Phone className="w-4 h-4 text-slate-500" />
                                                        <span>{user.phoneNumber}</span>
                                                        {user.whatsappLink && (
                                                            <a href={user.whatsappLink} target="_blank" rel="noopener noreferrer"
                                                                className="text-green-500 hover:text-green-400 transition-colors">
                                                                <MessageCircle className="w-4 h-4" />
                                                            </a>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={clsx(
                                                "text-xs px-2.5 py-1 rounded-full font-semibold",
                                                user.role === 'Admin'
                                                    ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                                                    : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                                            )}>
                                                <span>{user.role}</span>
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            {user.department ? (
                                                <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-slate-700 text-slate-300 border border-slate-600">
                                                    {user.department.name}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-slate-600">-</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={clsx(
                                                "text-xs px-2.5 py-1 rounded-full font-semibold",
                                                user.isActive
                                                    ? "bg-green-500/20 text-green-400 border border-green-500/30"
                                                    : "bg-red-500/20 text-red-400 border border-red-500/30"
                                            )}>
                                                <span>{user.isActive ? 'Activo' : 'Inactivo'}</span>
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex gap-2 justify-end">
                                                <button
                                                    onClick={() => openEditModal(user)}
                                                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
                                                    <Edit className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(user.id)}
                                                    className="p-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Card View (Visible on Mobile) */}
                    <div className="md:hidden space-y-4">
                        {users.map(user => (
                            <div key={user.id} className="glass-panel p-4 rounded-xl border border-slate-800 relative">
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <span className="text-primary-400 font-bold text-lg">#{user.internalNumber}</span>
                                        <div className="text-white font-bold text-lg leading-tight">
                                            {user.firstName} {user.lastName}
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        <span className={clsx(
                                            "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase",
                                            user.role === 'Admin'
                                                ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                                                : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                        )}>
                                            {user.role}
                                        </span>
                                        <span className={clsx(
                                            "w-2 h-2 rounded-full",
                                            user.isActive ? "bg-emerald-500" : "bg-red-500 shadow-[0_0_8px] shadow-red-500/50"
                                        )} title={user.isActive ? 'Activo' : 'Inactivo'}></span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 text-sm text-slate-400 mb-4 bg-slate-900/50 p-2 rounded-lg">
                                    <Phone className="w-4 h-4 text-slate-500" />
                                    <span>{user.phoneNumber || 'Sin teléfono'}</span>
                                    {user.whatsappLink && (
                                        <a href={user.whatsappLink} target="_blank" rel="noopener noreferrer" className="ml-auto text-green-500">
                                            <MessageCircle className="w-5 h-5" />
                                        </a>
                                    )}
                                </div>

                                <div className="flex gap-2">
                                    <button
                                        onClick={() => openEditModal(user)}
                                        className="flex-1 py-2 bg-slate-800 text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-700 hover:text-white transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Edit className="w-4 h-4" /> Editar
                                    </button>
                                    <button
                                        onClick={() => handleDelete(user.id)}
                                        className="px-3 py-2 bg-red-900/20 text-red-400 rounded-lg hover:bg-red-900/40 transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="glass-panel border border-slate-700 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <h2 className="text-2xl font-bold text-white mb-6">
                            <span>{editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}</span>
                        </h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-2">
                                        <span>Número de Interno *</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.internalNumber}
                                        onChange={(e) => setFormData({ ...formData, internalNumber: e.target.value })}
                                        className="input-field w-full bg-slate-800 border-slate-700 text-white placeholder-slate-500"
                                        placeholder="Ej. 1234"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-2">
                                        <span>Rol *</span>
                                    </label>
                                    <select
                                        value={formData.role}
                                        onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                        className="input-field w-full bg-slate-800 border-slate-700 text-white placeholder-slate-500">
                                        <option value="User">Usuario</option>
                                        <option value="Admin">Administrador</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-2">
                                    <span>Departamento</span>
                                </label>
                                <select
                                    value={formData.departmentId}
                                    onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                                    className="input-field w-full bg-slate-800 border-slate-700 text-white placeholder-slate-500">
                                    <option value="">Sin departamento</option>
                                    {departments.map(dep => (
                                        <option key={dep.id} value={dep.id}>{dep.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-2">
                                        <span>Apellido *</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.lastName}
                                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                        className="input-field w-full bg-slate-800 border-slate-700 text-white placeholder-slate-500"
                                        placeholder="Apellido"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-2">
                                        <span>Nombre *</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.firstName}
                                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                        className="input-field w-full bg-slate-800 border-slate-700 text-white placeholder-slate-500"
                                        placeholder="Nombre"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-slate-400 text-sm mb-1"><span>Teléfono</span></label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium z-10 select-none">
                                        🇺🇾 +598
                                    </span>
                                    <input
                                        type="tel"
                                        placeholder="99123456"
                                        value={formData.phoneNumber?.replace('+598 ', '') || ''}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/\D/g, '');
                                            setFormData({ ...formData, phoneNumber: val });
                                        }}
                                        className="w-full bg-slate-800 border-slate-700 text-white placeholder-slate-500 pl-20 pr-4 py-2 rounded-lg focus:outline-none focus:border-primary-500"
                                    />
                                </div>
                                <p className="text-xs text-slate-500 mt-1"><span>Ingresa el número sin el 0 inicial (ej: 99123456)</span></p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-2">
                                    <span>Contraseña {editingUser && '(dejar en blanco para no cambiar)'}</span>
                                </label>
                                <input
                                    type="password"
                                    required={!editingUser}
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    className="input-field w-full bg-slate-800 border-slate-700 text-white placeholder-slate-500"
                                    placeholder="••••••••"
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="isActive"
                                    checked={formData.isActive}
                                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                                    className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-primary-600"
                                />
                                <label htmlFor="isActive" className="text-sm text-slate-300">
                                    <span>Usuario activo</span>
                                </label>
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button
                                    type="submit"
                                    className="flex-1 bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-xl font-medium transition-colors">
                                    <span>{editingUser ? 'Actualizar' : 'Crear Usuario'}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowModal(false);
                                        setEditingUser(null);
                                        resetForm();
                                    }}
                                    className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl font-medium transition-colors">
                                    <span>Cancelar</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminUsers;
