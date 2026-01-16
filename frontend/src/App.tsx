import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import LoginScreen from './pages/LoginScreen';
import AdminShifts from './pages/admin/AdminShifts';
import AdminUsers from './pages/admin/AdminUsers';
import AdminBalances from './pages/admin/AdminBalances';
import CreateShift from './pages/user/CreateShift';
import Marketplace from './pages/user/Marketplace';
import MyShifts from './pages/user/MyShifts';
import MyBalance from './pages/user/MyBalance';
import DashboardLayout from './layouts/DashboardLayout';
import AdminWhatsApp from './pages/admin/AdminWhatsApp';
import AdminConfig from './pages/admin/AdminConfig';
import AdminWhatsAppSettings from './pages/admin/AdminWhatsAppSettings';
import TenantsManager from './pages/admin/TenantsManager';
import VehicleList from './pages/fleet/VehicleList';
import InspectionForm from './pages/fleet/InspectionForm';

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <AuthProvider>
          <div className="min-h-screen bg-slate-900 text-slate-100 font-sans">
            <Routes>
              <Route path="/login" element={<LoginScreen />} />

              <Route path="/dashboard" element={<DashboardLayout />}>
                <Route index element={<div className="text-white">Bienvenido al Panel</div>} />

                {/* Admin Routes */}
                <Route path="admin/shifts" element={<AdminShifts />} />
                <Route path="admin/users" element={<AdminUsers />} />
                <Route path="admin/balances" element={<AdminBalances />} />
                <Route path="admin/communications" element={<AdminWhatsApp />} />
                <Route path="admin/whatsapp-bot" element={<AdminWhatsAppSettings />} />
                <Route path="admin/config" element={<AdminConfig />} />

                {/* Super Admin Routes */}
                <Route path="super-admin/tenants" element={<TenantsManager />} />

                {/* Fleet Management Routes */}
                <Route path="fleet" element={<VehicleList />} />
                <Route path="fleet/inspect/:id" element={<InspectionForm />} />


                {/* User Routes */}
                <Route path="create-shift" element={<CreateShift />} />
                <Route path="market" element={<Marketplace />} />
                <Route path="my-shifts" element={<MyShifts />} />
                <Route path="my-balance" element={<MyBalance />} />
              </Route>

              <Route path="/" element={<Navigate to="/login" replace />} />
            </Routes>
          </div>
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
