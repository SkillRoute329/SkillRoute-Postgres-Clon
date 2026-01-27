
import UserList from '../../components/UserList';

const AdminUsers = () => {
    return (
        <div className="container mx-auto max-w-7xl animate-fade-in-up p-4 md:p-8">
            <h1 className="text-2xl font-bold text-white mb-2">Gestión de Personal y Finanzas</h1>
            <p className="text-slate-400 mb-6">Administración de RRHH, asignación de flota y control de haberes en tiempo real.</p>
            <UserList />
        </div>
    );
};

export default AdminUsers;
