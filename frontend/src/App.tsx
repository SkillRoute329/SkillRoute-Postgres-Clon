import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import DashboardLayout from './layouts/DashboardLayout';
import LoginScreen from './pages/LoginScreen';

// Lazy Load Pages for Performance
// Lazy Load Pages
const DashboardHome = lazy(() => import('./pages/DashboardHome'));

const AdminShifts = lazy(() => import('./pages/admin/AdminShifts'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminBalances = lazy(() => import('./pages/admin/AdminBalances'));
const AdminCartones = lazy(() => import('./pages/admin/AdminCartones'));
const RotationMatrix = lazy(() => import('./pages/traffic/RotationMatrix'));
const AdminBoletines = lazy(() => import('./pages/admin/AdminBoletines'));
const Distribution = lazy(() => import('./pages/operations/Distribution'));
const AdminRRHH = lazy(() => import('./pages/admin/AdminRRHH'));
const AdminWhatsApp = lazy(() => import('./pages/admin/AdminWhatsApp'));
const AdminWhatsAppSettings = lazy(() => import('./pages/admin/AdminWhatsAppSettings'));
const MaintenanceDashboard = lazy(() => import('./pages/admin/MaintenanceDashboard'));
const TenantsManager = lazy(() => import('./pages/admin/TenantsManager'));

const VehicleList = lazy(() => import('./pages/fleet/VehicleList'));
const InspectionForm = lazy(() => import('./pages/fleet/InspectionForm'));
const UniversalPage = lazy(() => import('./pages/admin/UniversalPage'));

const CreateShift = lazy(() => import('./pages/user/CreateShift'));
const Marketplace = lazy(() => import('./pages/user/Marketplace'));
const MyShifts = lazy(() => import('./pages/user/MyShifts'));
const MyBalance = lazy(() => import('./pages/user/MyBalance'));
const DriverSchedule = lazy(() => import('./pages/driver/DriverSchedule'));
const DriverNavigation = lazy(() => import('./pages/driver/DriverNavigation'));
const ABLPage = lazy(() => import('./pages/abl/ABLPage'));
const PenalizationsPage = lazy(() => import('./pages/abl/penalizations/PenalizationsPage'));

// Loading Component
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
  </div>
);

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <AuthProvider>
          <div className="min-h-screen bg-slate-900 text-slate-100 font-sans">
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/login" element={<LoginScreen />} />

                {/* Temp Public Route for Visualization */}
                <Route path="/test-cartones" element={<div className="p-4"><AdminCartones /></div>} />

                <Route path="/dashboard" element={<DashboardLayout />}>
                  <Route index element={<DashboardHome />} />

                  {/* Admin Routes */}
                  <Route path="admin/shifts" element={<AdminShifts />} />
                  <Route path="admin/users" element={<AdminUsers />} />
                  <Route path="admin/balances" element={<AdminBalances />} />
                  <Route path="admin/rotation-matrix" element={<RotationMatrix />} />
                  <Route path="admin/cartones" element={<AdminCartones />} />
                  <Route path="admin/boletines" element={<AdminBoletines />} />
                  <Route path="operativa/distribucion" element={<Distribution />} />
                  <Route path="admin/rrhh" element={<AdminRRHH />} />
                  <Route path="admin/communications" element={<AdminWhatsApp />} />
                  <Route path="admin/whatsapp-bot" element={<AdminWhatsAppSettings />} />
                  <Route path="admin/maintenance" element={<MaintenanceDashboard />} />

                  {/* Super Admin Routes */}
                  <Route path="super-admin/tenants" element={<TenantsManager />} />

                  {/* Fleet Management Routes */}
                  <Route path="fleet" element={<VehicleList />} />
                  <Route path="fleet/inspect/:id" element={<InspectionForm />} />

                  {/* Universal Resource Manager Route */}
                  <Route path="universal/:entity" element={<UniversalPage />} />


                  {/* User Routes */}
                  <Route path="create-shift" element={<CreateShift />} />
                  <Route path="market" element={<Marketplace />} />
                  <Route path="abl" element={<ABLPage />} />
                  <Route path="abl/penalizations" element={<PenalizationsPage />} />
                  <Route path="my-shifts" element={<MyShifts />} />
                  <Route path="my-balance" element={<MyBalance />} />
                  <Route path="driver/schedule" element={<DriverSchedule />} />
                  <Route path="driver/navigation" element={<DriverNavigation />} />
                  {/* <Route path="my-stats" element={<MyStats />} /> */}
                </Route>

                <Route path="/" element={<Navigate to="/login" replace />} />
              </Routes>
            </Suspense>
          </div>
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
