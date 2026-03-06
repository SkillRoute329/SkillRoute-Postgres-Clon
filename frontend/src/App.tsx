import { Suspense, lazy, useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import DashboardLayout from './layouts/DashboardLayout';
import LoginScreen from './pages/LoginScreen';
import { ToastProvider } from './components/ToastProvider';
import { VersionGuard } from './components/VersionGuard';
import { CloudUploadTest } from './components/CloudUploadTest';

import { SystemMonitor } from './components/SystemMonitor';
import { SystemIntegrity } from './services/SystemIntegrity';

// Native Plugins
import { Network } from '@capacitor/network';
import { Toast } from '@capacitor/toast';

// Lazy Load Pages
const DashboardHome = lazy(() => import('./pages/DashboardHome'));

const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminBalances = lazy(() => import('./pages/admin/AdminBalances'));
const AdminRRHH = lazy(() => import('./pages/admin/AdminRRHH'));
const RotationManager = lazy(() => import('./pages/admin/rrhh/RotationManager'));
const AdminWhatsApp = lazy(() => import('./pages/admin/AdminWhatsApp'));
const AdminWhatsAppSettings = lazy(() => import('./pages/admin/AdminWhatsAppSettings'));
const MaintenanceDashboard = lazy(() => import('./pages/admin/MaintenanceDashboard'));
const TenantsManager = lazy(() => import('./pages/admin/TenantsManager'));
const AppMaintenance = lazy(() => import('./pages/admin/AppMaintenance'));

const VehicleList = lazy(() => import('./pages/fleet/VehicleList'));
const InspectionForm = lazy(() => import('./pages/fleet/InspectionForm'));
const UniversalPage = lazy(() => import('./pages/admin/UniversalPage'));
const DataIngestion = lazy(() => import('./pages/admin/DataIngestion'));
const UserManagement = lazy(() => import('./pages/admin/UserManagement'));
const Employees = lazy(() => import('./pages/admin/Employees'));
const SystemDoctor = lazy(() => import('./pages/SystemDoctor'));

const AdminCartones = lazy(() => import('./pages/admin/AdminCartones'));
const CreateShift = lazy(() => import('./pages/user/CreateShift'));
const Marketplace = lazy(() => import('./pages/user/Marketplace'));
const MyShifts = lazy(() => import('./pages/user/MyShifts'));
const MyBalance = lazy(() => import('./pages/user/MyBalance'));
const DriverSchedule = lazy(() => import('./pages/driver/DriverSchedule'));
const DriverServiceView = lazy(() => import('./pages/driver/DriverServiceView'));
const DriverNavigation = lazy(() => import('./pages/driver/DriverNavigation'));
const NewReport = lazy(() => import('./pages/driver/NewReport'));
const ABLPage = lazy(() => import('./pages/abl/ABLPage'));
const PenalizationsPage = lazy(() => import('./pages/abl/penalizations/PenalizationsPage'));
const ServiceMatrix = lazy(() => import('./pages/traffic/ServiceMatrix'));
const InspectorDashboard = lazy(() => import('./pages/operations/InspectorDashboard'));
const InspectorCapture = lazy(() => import('./pages/traffic/InspectorCapture'));
const ServiceStatistics = lazy(() => import('./pages/traffic/ServiceStatistics'));
const ServiceAnalytics = lazy(() => import('./pages/traffic/ServiceAnalytics'));
const CartonManager = lazy(() => import('./pages/traffic/CartonManager'));
const CartonDetail = lazy(() => import('./pages/traffic/CartonDetail'));
const NavigationModule = lazy(() => import('./pages/traffic/NavigationModule'));
const FleetMonitorModule = lazy(() => import('./pages/traffic/FleetMonitorModule'));
const DailyListManager = lazy(() => import('./pages/traffic/DailyListManager'));
const CEODashboard = lazy(() => import('./pages/traffic/CEODashboard'));
const TalentCenter = lazy(() => import('./pages/talento/TalentCenter'));
const AdminStressTest = lazy(() => import('./pages/admin/AdminStressTest'));
const SystemParamsPage = lazy(() => import('./pages/admin/SystemParamsPage'));
const RoadAlertsPage = lazy(() => import('./pages/alerts/RoadAlertsPage'));

// Loading Component
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
  </div>
);

// Offline Banner Component
const OfflineBanner = () => (
  <div className="fixed top-0 left-0 right-0 bg-red-600/90 text-white text-xs font-bold text-center py-1 z-[99999] backdrop-blur animate-fade-in-up">
    ⚠️ MODO OFFLINE ACTIVADO - Los datos se guardarán localmente
  </div>
);

function App() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    // 0. INTEGRITY CHECK (Cloud Command)
    SystemIntegrity.checkAndEnforce();

    // 1. Initial Status
    Network.getStatus().then((status) => setIsOffline(!status.connected));

    // 2. Listen for changes
    const handler = Network.addListener('networkStatusChange', (status) => {
      const offline = !status.connected;
      setIsOffline(offline);
      if (offline) {
        Toast.show({
          text: '⚠️ Conexión Perdida. Activando Modo Túnel.',
          duration: 'long',
        });
      } else {
        Toast.show({
          text: '🟢 Conexión Restaurada. Sincronizando...',
          duration: 'short',
        });
      }
    });

    return () => {
      handler.then((h) => h.remove());
    };
  }, []);

  return (
    <ErrorBoundary>
      <Router>
        <AuthProvider>
          <SystemMonitor />
          <ToastProvider>
            <VersionGuard />
            {isOffline && <OfflineBanner />}
            <div className="h-screen w-screen max-w-[100vw] overflow-hidden bg-slate-950 text-slate-100 font-sans">
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/login" element={<LoginScreen />} />

                  {/* Test Route for Cloud Upload */}
                  <Route
                    path="/test-upload"
                    element={
                      <div className="p-4">
                        <CloudUploadTest />
                      </div>
                    }
                  />
                  {/* Debug Routes */}
                  <Route path="/admin/debug" element={<SystemDoctor />} />

                  <Route path="/dashboard" element={<DashboardLayout />}>
                    <Route index element={<DashboardHome />} />

                    {/* Admin Routes */}
                    <Route path="admin/users" element={<AdminUsers />} />
                    <Route path="admin/balances" element={<AdminBalances />} />

                    <Route path="admin/rrhh" element={<AdminRRHH />} />
                    <Route path="admin/rrhh/rotation" element={<RotationManager />} />
                    <Route path="admin/communications" element={<AdminWhatsApp />} />
                    <Route path="admin/whatsapp-bot" element={<AdminWhatsAppSettings />} />
                    <Route path="admin/maintenance" element={<MaintenanceDashboard />} />
                    <Route path="admin/maintenance-system" element={<AppMaintenance />} />
                    <Route path="admin/ingestion" element={<DataIngestion />} />
                    <Route path="admin/cartones" element={<AdminCartones />} />
                    <Route path="admin/users/create" element={<UserManagement />} />
                    <Route path="admin/employees" element={<Employees />} />
                    <Route path="admin/stress-test" element={<AdminStressTest />} />
                    <Route path="admin/params" element={<SystemParamsPage />} />

                    {/* Super Admin Routes */}
                    <Route path="super-admin/tenants" element={<TenantsManager />} />

                    {/* Alertas de Vía (menú Gestión de Flota) */}
                    <Route path="alerts" element={<RoadAlertsPage />} />

                    {/* Fleet Management Routes */}
                    <Route path="fleet" element={<VehicleList />} />
                    <Route path="fleet/inspect/:id" element={<InspectionForm />} />

                    {/* Universal Resource Manager Route */}
                    <Route path="universal/:entity" element={<UniversalPage />} />

                    {/* Traffic Department Routes */}
                    <Route path="traffic/service-matrix" element={<ServiceMatrix />} />
                    <Route path="traffic/inspector-control" element={<InspectorDashboard />} />
                    <Route path="traffic/inspector-capture" element={<InspectorCapture />} />
                    <Route path="traffic/statistics" element={<ServiceStatistics />} />
                    <Route path="traffic/analytics" element={<ServiceAnalytics />} />
                    <Route path="traffic/cartons" element={<CartonManager />} />
                    <Route
                      path="traffic/cartons/detail/:lineId/:serviceId"
                      element={<CartonDetail />}
                    />
                    <Route path="traffic/navigation" element={<NavigationModule />} />
                    <Route path="traffic/fleet-monitor" element={<FleetMonitorModule />} />
                    <Route path="traffic/daily-list" element={<DailyListManager />} />
                    <Route path="traffic/ceo" element={<CEODashboard />} />
                    <Route path="talento" element={<TalentCenter />} />

                    {/* User Routes */}
                    <Route path="create-shift" element={<CreateShift />} />
                    <Route path="market" element={<Marketplace />} />
                    <Route path="abl" element={<ABLPage />} />
                    <Route path="abl/penalizations" element={<PenalizationsPage />} />
                    <Route path="my-shifts" element={<MyShifts />} />
                    <Route path="my-balance" element={<MyBalance />} />
                    <Route path="driver/schedule" element={<DriverSchedule />} />
                    <Route path="driver/mi-servicio" element={<DriverServiceView />} />
                    <Route path="driver/navigation" element={<DriverNavigation />} />
                    <Route path="driver/report" element={<NewReport />} />

                    {/* Fallback for dead/removed routes (Critical Fix) */}
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                  </Route>
                  <Route
                    path="/navigation"
                    element={<Navigate to="/dashboard/driver/navigation" replace />}
                  />

                  <Route path="/" element={<Navigate to="/login" replace />} />
                </Routes>
              </Suspense>
            </div>
          </ToastProvider>
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
