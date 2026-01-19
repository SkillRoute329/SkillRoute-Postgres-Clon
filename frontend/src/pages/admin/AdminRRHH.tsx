import { useState, useEffect } from 'react';
import {
    Building2, Users, Receipt, Plus, Trash2, Edit2,
    X, DollarSign, Percent
} from 'lucide-react';
import { DepartmentService, DiscountService, UserService } from '../../services/api';
import clsx from 'clsx';

const AdminRRHH = () => {
    const [activeTab, setActiveTab] = useState<'users' | 'structure' | 'discounts'>('users');

    return (
        <div className="p-4 md:p-6 max-w-7xl mx-auto animate-fade-in-up pb-24">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-white mb-1 md:mb-2 flex items-center gap-2">
                        <Users className="w-8 h-8 text-primary-500" />
                        Recursos Humanos (RRHH)
                    </h1>
                    <p className="text-slate-400 text-sm md:text-base">Gestión de personal, estructura organizacional y compensaciones.</p>
                </div>
            </div>

            <div className="flex border-b border-slate-700 mb-6 overflow-x-auto">
                <button
                    onClick={() => setActiveTab('users')}
                    className={clsx("px-6 py-3 font-medium text-sm transition-colors border-b-2", activeTab === 'users' ? "border-primary-500 text-primary-400" : "border-transparent text-slate-400 hover:text-white")}
                >
                    Usuarios
                </button>
                <button
                    onClick={() => setActiveTab('structure')}
                    className={clsx("px-6 py-3 font-medium text-sm transition-colors border-b-2", activeTab === 'structure' ? "border-primary-500 text-primary-400" : "border-transparent text-slate-400 hover:text-white")}
                >
                    Estructura y Cargos
                </button>
                <button
                    onClick={() => setActiveTab('discounts')}
                    className={clsx("px-6 py-3 font-medium text-sm transition-colors border-b-2", activeTab === 'discounts' ? "border-primary-500 text-primary-400" : "border-transparent text-slate-400 hover:text-white")}
                >
                    Descuentos y Retenciones
                </button>
            </div>

            <div className="min-h-[400px]">
                {activeTab === 'users' && <UsersTab />}
                {activeTab === 'structure' && <StructureTab />}
                {activeTab === 'discounts' && <DiscountsTab />}
            </div>
        </div>
    );
};

// --- TAB: USERS ---
const UsersTab = () => {
    const [users, setUsers] = useState<any[]>([]);
    const [depts, setDepts] = useState<any[]>([]);
    const [showModal, setShowModal] = useState(false);

    const [editingUser, setEditingUser] = useState<any>(null); // EDIT MODE

    const [formData, setFormData] = useState({
        internalNumber: '', firstName: '', lastName: '', phoneNumber: '',
        departmentId: '', jobRoleId: '', password: 'user123'
    });

    useEffect(() => {
        load();
    }, []);

    const load = async () => {
        const [u, d] = await Promise.all([UserService.getAll(), DepartmentService.getAll()]);
        setUsers(u);
        setDepts(d);
    };

    const handleEditUser = (u: any) => {
        setEditingUser(u);
        setFormData({
            internalNumber: u.internalNumber,
            firstName: u.firstName,
            lastName: u.lastName,
            phoneNumber: u.phoneNumber || '',
            departmentId: u.departmentId ? String(u.departmentId) : '',
            jobRoleId: u.jobRoleId ? String(u.jobRoleId) : '',
            password: ''
        });
        setShowModal(true);
    };

    const handleDeleteUser = async (id: number) => {
        if (!confirm('¿Eliminar usuario permanentemente? Esta acción no se puede deshacer.')) return;
        try {
            await UserService.delete(id);
            load();
            alert('Usuario eliminado correctamente');
        } catch (e) {
            console.error(e);
            alert('Error al eliminar usuario. Verifique que no tenga datos asociados (como turnos).');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingUser) {
                await UserService.update(editingUser.id, formData);
            } else {
                await UserService.create(formData);
            }
            setShowModal(false);
            setEditingUser(null);
            setFormData({ internalNumber: '', firstName: '', lastName: '', phoneNumber: '', departmentId: '', jobRoleId: '', password: 'user123' });
            load();
            alert(editingUser ? 'Usuario actualizado' : 'Usuario creado');
        } catch (err) {
            alert('Error');
        }
    };

    // Helper to get roles for selected dept
    const activeRoles = depts.find(d => d.id === Number(formData.departmentId))?.jobRoles || [];

    return (
        <div>
            <div className="flex justify-end mb-4">
                <button onClick={() => { setEditingUser(null); setFormData({ internalNumber: '', firstName: '', lastName: '', phoneNumber: '', departmentId: '', jobRoleId: '', password: 'user123' }); setShowModal(true); }} className="btn btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> Nuevo Usuario</button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {users.map(u => (
                    <div key={u.id} className="glass-panel p-4 flex gap-4 items-center justify-between group">
                        <div className="flex gap-4 items-center">
                            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-500">
                                {u.firstName[0]}
                            </div>
                            <div>
                                <h3 className="font-bold text-white">{u.fullName}</h3>
                                <p className="text-xs text-slate-400">Int: {u.internalNumber} {u.phoneNumber && `| ${u.phoneNumber}`}</p>
                                <div className="flex gap-2 mt-1">
                                    {u.department?.name && <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded">{u.department.name}</span>}
                                    {u.jobRole?.name && <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded">{u.jobRole.name}</span>}
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleEditUser(u)} className="p-1.5 bg-slate-800 hover:text-white text-slate-400 rounded"><Edit2 className="w-3 h-3" /></button>
                            <button onClick={() => handleDeleteUser(u.id)} className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded"><Trash2 className="w-3 h-3" /></button>
                        </div>
                    </div>
                ))}
            </div>

            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
                    <div className="bg-slate-900 w-full max-w-md p-6 rounded-xl border border-slate-800">
                        <h3 className="text-xl font-bold text-white mb-4">{editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}</h3>
                        <form onSubmit={handleSubmit} className="space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                                <input className="input-field w-full" placeholder="Legajo" value={formData.internalNumber} onChange={e => setFormData({ ...formData, internalNumber: e.target.value })} required />
                                <input className="input-field w-full" placeholder="WhatsApp (Ej. 099123456)" value={formData.phoneNumber} onChange={e => setFormData({ ...formData, phoneNumber: e.target.value })} />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <input className="input-field w-full" placeholder="Nombre" value={formData.firstName} onChange={e => setFormData({ ...formData, firstName: e.target.value })} required />
                                <input className="input-field w-full" placeholder="Apellido" value={formData.lastName} onChange={e => setFormData({ ...formData, lastName: e.target.value })} required />
                            </div>

                            <select className="input-field w-full" value={formData.departmentId} onChange={e => setFormData({ ...formData, departmentId: e.target.value, jobRoleId: '' })}>
                                <option value="">Seleccionar Área...</option>
                                {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>

                            <select className="input-field w-full" value={formData.jobRoleId} onChange={e => setFormData({ ...formData, jobRoleId: e.target.value })} disabled={!formData.departmentId}>
                                <option value="">Seleccionar Cargo...</option>
                                {activeRoles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                            </select>

                            {!editingUser && (
                                <input type="password" className="input-field w-full" placeholder="Contraseña Inicial" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} required />
                            )}

                            <button className="btn btn-primary w-full mt-4">Guardar Usuario</button>
                            <button type="button" onClick={() => setShowModal(false)} className="w-full text-center text-slate-500 text-sm mt-2">Cancelar</button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- TAB: STRUCTURE ---
const StructureTab = () => {
    const [depts, setDepts] = useState<any[]>([]);

    // UI State
    const [editingDept, setEditingDept] = useState<any>(null); // For Dept Edit Modal
    const [activeDeptId, setActiveDeptId] = useState<number | null>(null); // For Role Add Modal

    // Modal Forms
    const [showDeptModal, setShowDeptModal] = useState(false);
    const [deptForm, setDeptForm] = useState({ name: '', description: '' });

    const [showRoleModal, setShowRoleModal] = useState(false);
    const [roleForm, setRoleForm] = useState({ name: '', description: '', baseSalary: '', extraHourValue: '' });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const data = await DepartmentService.getAll();
        setDepts(data);
    };

    const handleSaveDept = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingDept) {
                await DepartmentService.update(editingDept.id, deptForm);
            } else {
                await DepartmentService.create(deptForm);
            }
            setShowDeptModal(false);
            setEditingDept(null);
            setDeptForm({ name: '', description: '' });
            loadData();
        } catch (e) { alert('Error'); }
    };

    const handleDeleteDept = async (id: number) => {
        if (!confirm('Se eliminará el área y sus cargos. ¿Confirmar?')) return;
        await DepartmentService.delete(id);
        loadData();
    };

    const handleSaveRole = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeDeptId) return;
        try {
            await DepartmentService.addRole(activeDeptId, {
                ...roleForm,
                baseSalary: Number(roleForm.baseSalary),
                extraHourValue: Number(roleForm.extraHourValue)
            });
            setShowRoleModal(false);
            setRoleForm({ name: '', description: '', baseSalary: '', extraHourValue: '' });
            loadData();
        } catch (e) { alert('Error'); }
    };

    const handleDeleteRole = async (roleId: number) => {
        if (!confirm('¿Eliminar cargo?')) return;
        await DepartmentService.deleteRole(roleId);
        loadData();
    };


    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <button
                    onClick={() => { setEditingDept(null); setDeptForm({ name: '', description: '' }); setShowDeptModal(true); }}
                    className="btn btn-primary flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" /> Nueva Área
                </button>
            </div>

            <div className="grid gap-6">
                {depts.map(dept => (
                    <div key={dept.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                        <div className="p-4 bg-slate-800/50 flex justify-between items-center border-b border-slate-800">
                            <div>
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <Building2 className="w-5 h-5 text-blue-400" />
                                    {dept.name}
                                </h3>
                                <p className="text-sm text-slate-400">{dept.description}</p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => { setEditingDept(dept); setDeptForm({ name: dept.name, description: dept.description }); setShowDeptModal(true); }} className="p-2 hover:bg-slate-700 rounded text-slate-400"><Edit2 className="w-4 h-4" /></button>
                                <button onClick={() => handleDeleteDept(dept.id)} className="p-2 hover:bg-red-500/20 rounded text-red-400"><Trash2 className="w-4 h-4" /></button>
                            </div>
                        </div>

                        <div className="p-4">
                            <div className="flex justify-between items-center mb-3">
                                <h4 className="text-sm font-semibold text-slate-500 uppercase">Cargos / Roles</h4>
                                <button
                                    onClick={() => { setActiveDeptId(dept.id); setShowRoleModal(true); }}
                                    className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
                                >
                                    <Plus className="w-3 h-3" /> Agregar Cargo
                                </button>
                            </div>

                            {dept.jobRoles.length === 0 ? (
                                <p className="text-sm text-slate-600 italic">Sin cargos definidos.</p>
                            ) : (
                                <div className="space-y-2">
                                    {dept.jobRoles.map((role: any) => (
                                        <div key={role.id} className="flex items-center justify-between p-3 bg-slate-950/50 rounded-lg border border-slate-800/50">
                                            <div>
                                                <div className="font-medium text-slate-200">{role.name}</div>
                                                <div className="text-xs text-slate-500 flex gap-4 mt-1">
                                                    <span>Jornal: <span className="text-green-400">${role.baseSalary}</span></span>
                                                    <span>Hora Extra: <span className="text-blue-400">${role.extraHourValue}</span></span>
                                                </div>
                                            </div>
                                            <button onClick={() => handleDeleteRole(role.id)} className="text-slate-600 hover:text-red-400"><X className="w-4 h-4" /></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* DEPT MODAL */}
            {showDeptModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
                    <div className="bg-slate-900 w-full max-w-sm p-6 rounded-xl border border-slate-800">
                        <h3 className="font-bold text-white mb-4">{editingDept ? 'Editar Área' : 'Nueva Área'}</h3>
                        <form onSubmit={handleSaveDept} className="space-y-3">
                            <input className="input-field w-full" placeholder="Nombre (ej. Mantenimiento)" value={deptForm.name} onChange={e => setDeptForm({ ...deptForm, name: e.target.value })} required />
                            <input className="input-field w-full" placeholder="Descripción" value={deptForm.description} onChange={e => setDeptForm({ ...deptForm, description: e.target.value })} />
                            <button className="btn btn-primary w-full">Guardar</button>
                            <button type="button" onClick={() => setShowDeptModal(false)} className="w-full text-center text-sm mt-2 text-slate-500">Cancelar</button>
                        </form>
                    </div>
                </div>
            )}

            {/* ROLE MODAL */}
            {showRoleModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
                    <div className="bg-slate-900 w-full max-w-sm p-6 rounded-xl border border-slate-800">
                        <h3 className="font-bold text-white mb-4">Nuevo Cargo</h3>
                        <form onSubmit={handleSaveRole} className="space-y-3">
                            <input className="input-field w-full" placeholder="Nombre (ej. Oficial Mecánico)" value={roleForm.name} onChange={e => setRoleForm({ ...roleForm, name: e.target.value })} required />

                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[10px] uppercase text-slate-500 font-bold">Valor Jornal</label>
                                    <input type="number" className="input-field w-full" placeholder="0.00" value={roleForm.baseSalary} onChange={e => setRoleForm({ ...roleForm, baseSalary: e.target.value })} />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase text-slate-500 font-bold">Valor H. Extra</label>
                                    <input type="number" className="input-field w-full" placeholder="0.00" value={roleForm.extraHourValue} onChange={e => setRoleForm({ ...roleForm, extraHourValue: e.target.value })} />
                                </div>
                            </div>

                            <button className="btn btn-primary w-full mt-2">Guardar Cargo</button>
                            <button type="button" onClick={() => setShowRoleModal(false)} className="w-full text-center text-sm mt-2 text-slate-500">Cancelar</button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- TAB: DISCOUNTS ---
const DiscountsTab = () => {
    const [discounts, setDiscounts] = useState<any[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({ name: '', type: 'PERCENTAGE', value: '' });

    useEffect(() => { load(); }, []);

    const load = async () => {
        try {
            const data = await DiscountService.getAll();
            setDiscounts(data);
        } catch (e) {
            console.error(e);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await DiscountService.create(formData);
            setShowModal(false);
            setFormData({ name: '', type: 'PERCENTAGE', value: '' });
            load();
        } catch (err) { alert('Error'); }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Eliminar descuento?')) return;
        await DiscountService.delete(id);
        load();
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-blue-500/10 p-4 rounded-xl border border-blue-500/20">
                <div className="flex gap-3">
                    <Receipt className="w-10 h-10 text-blue-400" />
                    <div>
                        <h3 className="font-bold text-white hidden md:block">Categorías de Descuentos</h3>
                        <p className="text-sm text-blue-300">Defina descuentos fijos o porcentuales (BPS, IRPF, Sindicato).</p>
                    </div>
                </div>
                <button onClick={() => setShowModal(true)} className="btn btn-primary whitespace-nowrap"><Plus className="w-4 h-4 inline mr-2" /> Nuevo Descuento</button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {discounts.map(d => (
                    <div key={d.id} className="glass-panel p-5 flex flex-col justify-between group relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-100 transition-opacity">
                            {d.type === 'PERCENTAGE' ? <Percent className="w-16 h-16" /> : <DollarSign className="w-16 h-16" />}
                        </div>
                        <div>
                            <h4 className="font-bold text-lg text-white mb-1">{d.name}</h4>
                            <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-bold text-primary-400">
                                    {d.type === 'PERCENTAGE' ? `${d.value}%` : `$${d.value}`}
                                </span>
                                <span className="text-xs text-slate-500 uppercase font-semibold">
                                    {d.type === 'PERCENTAGE' ? 'Del Salario' : 'Monto Fijo'}
                                </span>
                            </div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-slate-800 flex justify-end">
                            <button onClick={() => handleDelete(d.id)} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"><Trash2 className="w-3 h-3" /> Eliminar</button>
                        </div>
                    </div>
                ))}
            </div>

            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
                    <div className="bg-slate-900 w-full max-w-sm p-6 rounded-xl border border-slate-800">
                        <h3 className="font-bold text-white mb-4">Nuevo Descuento</h3>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="text-sm text-slate-400">Nombre (Concepto)</label>
                                <input className="input-field w-full" placeholder="Ej. BPS" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm text-slate-400">Tipo</label>
                                    <select className="input-field w-full" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}>
                                        <option value="PERCENTAGE">Porcentaje (%)</option>
                                        <option value="FIXED">Fijo ($)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm text-slate-400">Valor</label>
                                    <input type="number" className="input-field w-full" placeholder="15" value={formData.value} onChange={e => setFormData({ ...formData, value: e.target.value })} required />
                                </div>
                            </div>

                            <p className="text-xs text-slate-500 italic">
                                {formData.type === 'PERCENTAGE' ? `Se descontará el ${formData.value || 0}% del salario bruto.` : `Se descontarán $${formData.value || 0} fijos.`}
                            </p>

                            <button className="btn btn-primary w-full mt-2">Crear Descuento</button>
                            <button type="button" onClick={() => setShowModal(false)} className="w-full text-center text-sm mt-2 text-slate-500">Cancelar</button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminRRHH;
