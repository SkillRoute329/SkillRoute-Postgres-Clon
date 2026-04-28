import { Suspense, lazy, useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import DashboardLayout from './layouts/DashboardLayout';
import LoginScreen from './pages/LoginScreen';
import { ToastProvider } from './components/ToastProvider';
import PrivateRoute from './components/PrivateRoute';

// Lazy-loaded to keep the initial bundle small
const CloudUploadTest = lazy(() =>
  import('./components/CloudUploadTest').then((m) => ({ default: m.CloudUploadTest })),
);
const SystemMonitor = lazy(() =>
  import('./components/SystemMonitor').then((m) => ({ default: m.SystemMonitor })),
);

import { SystemIntegrity } from './services/SystemIntegrity';
import { usePushNotifications } from './hooks/usePushNotifications';

const PushNotificationInit = () => {
  usePushNotifications();
  return null;
};

// Network status — browser APIs (Capacitor plugins solo disponibles en APK nativa)


// Lazy Load Pages
const DashboardHome = lazy(() => import('./pages/DashboardHome'));
const RoleBasedLanding = lazy(() => import('./pages/RoleBasedLanding'));

const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminBalances = lazy(() => import('./pages/admin/AdminBalances'));
const AdminRRHH = lazy(() => import('./pages/admin/AdminRRHH'));
const RotationManager = lazy(() => import('./pages/admin/rrhh/RotationManager'));
const FeriadosPage = lazy(() => import('./pages/admin/rrhh/FeriadosPage'));
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
const DriverCompliance = lazy(() => import('./pages/driver/DriverCompliance'));
const ABLPage = lazy(() => import('./pages/abl/ABLPage'));
const PenalizationsPage = lazy(() => import('./pages/abl/penalizations/PenalizationsPage'));
const ServiceMatrix = lazy(() => import('./pages/traffic/ServiceMatrix'));
const InspectorDashboard = lazy(() => import('./pages/operations/InspectorDashboard'));
const InspectorCapture = lazy(() => import('./pages/traffic/InspectorCapture'));
const AutoStatsModule = lazy(() => import('./pages/traffic/AutoStatsModule'));
const ServiceAnalytics = lazy(() => import('./pages/traffic/ServiceAnalytics'));
const CartonManager = lazy(() => import('./pages/traffic/CartonManager'));
const CartonDetail = lazy(() => import('./pages/traffic/CartonDetail'));
const NavigationModule = lazy(() => import('./pages/traffic/NavigationModule'));
const FleetMonitorModule = lazy(() => import('./pages/traffic/FleetMonitorModule'));
const CUTCSAFleetDashboard = lazy(() => import('./pages/traffic/CUTCSAFleetDashboard'));
const TerminalListero = lazy(() => import('./pages/traffic/TerminalListero'));
const ListeroModule = lazy(() => import('./pages/traffic/ListeroModule'));
const DistribucionDiaria = lazy(() => import('./pages/traffic/DistribucionDiaria'));
const BoletinInspeccion = lazy(() => import('./pages/traffic/BoletinInspeccion'));
const PersonalUcot = lazy(() => import('./pages/traffic/PersonalUcot'));
const CEODashboard = lazy(() => import('./pages/traffic/CEODashboard'));
const CEODashboardV7 = lazy(() => import('./pages/traffic/CEODashboardV7'));
const TalentCenter = lazy(() => import('./pages/talento/TalentCenter'));
const AdminStressTest = lazy(() => import('./pages/admin/AdminStressTest'));
const SystemParamsPage = lazy(() => import('./pages/admin/SystemParamsPage'));
const RoadAlertsPage = lazy(() => import('./pages/alerts/RoadAlertsPage'));
const BRTCorridorDashboard = lazy(() => import('./pages/traffic/BRTCorridorDashboard'));
const EVChargeOptimizer = lazy(() => import('./pages/fleet/EVChargeOptimizer'));
const ComplianceHub = lazy(() => import('./pages/admin/ComplianceHub'));
const ServiceCategoryPage = lazy(() => import('./pages/admin/ServiceCategoryPage'));

// Restored Orphaned Pages (were on disk but missing routes)
const AdminBoletines = lazy(() => import('./pages/admin/AdminBoletines'));
const AdminConfig = lazy(() => import('./pages/admin/AdminConfig'));
const AdminParametros = lazy(() => import('./pages/admin/AdminParametros'));
// Fase 1 (2026-04-23): UI Super Admin para parámetros operativos (tarifa, costos, elasticidad, radio competencia…)
const AdminParametrosOperativos = lazy(() => import('./pages/admin/AdminParametrosOperativos'));
// 2026-04-25: UI por operador para turnos personales + umbrales OTP + ventanas pico
const AdminTurnosOperativos = lazy(() => import('./pages/admin/ParametrosOperativos'));
// 2026-04-25: Admin Audit Log — trazabilidad de cambios
const AdminAuditLog = lazy(() => import('./pages/admin/AdminAuditLog'));
// Trim+ #69 (2026-04-23): gestión de disrupciones operacionales
// Migrado a feature-first 2026-04-24 (ADR 002)
const AdminDisruptionsPage = lazy(() => import('./features/disruptions').then(m => ({ default: m.AdminDisruptionsPage })));
const AdminOrganization = lazy(() => import('./pages/admin/AdminOrganization'));
const AdminSeed = lazy(() => import('./pages/admin/AdminSeed'));
const AsignacionVehiculos = lazy(() => import('./pages/admin/AsignacionVehiculos'));
const AdminSetup = lazy(() => import('./pages/admin/AdminSetup'));
const AdminShifts = lazy(() => import('./pages/admin/AdminShifts'));
const CrossOpCoverage = lazy(() => import('./pages/admin/CrossOpCoverage'));
const BusNavigation = lazy(() => import('./pages/driver/BusNavigation'));
const Distribution = lazy(() => import('./pages/operations/Distribution'));
const RotationMatrix = lazy(() => import('./pages/traffic/RotationMatrix'));
const VehicleCheck = lazy(() => import('./pages/fleet/VehicleCheck'));
const CompetitorIntelligencePage = lazy(() => import('./pages/traffic/CompetitorIntelligencePage'));
const DigitalAgentsModule = lazy(() => import('./pages/traffic/DigitalAgentsModule'));
const OTPDashboard = lazy(() => import('./pages/traffic/OTPDashboard'));
const IncidentCommandCenter = lazy(() => import('./pages/traffic/IncidentCommandCenter'));
const EconomicProjectionsPage = lazy(() => import('./pages/traffic/EconomicProjectionsPage'));
const ContingencyManagementPage = lazy(() => import('./pages/traffic/ContingencyManagementPage'));
const ShadowRadar = lazy(() => import('./pages/traffic/ShadowRadar'));
const CorridorIntelligence = lazy(() => import('./pages/traffic/CorridorIntelligence'));
const CorridorMap = lazy(() => import('./pages/traffic/CorridorMap'));
const LiveMapPage = lazy(() => import('./pages/traffic/LiveMapPage'));
const ShadowAnalytics = lazy(() => import('./pages/traffic/ShadowAnalytics'));
const MarketPenetration = lazy(() => import('./pages/traffic/MarketPenetration'));
const CorridorMarketShare = lazy(() => import('./pages/traffic/CorridorMarketShare'));
const ROICalculator = lazy(() => import('./pages/traffic/ROICalculator'));
const GestionDesviosPage = lazy(() => import('./pages/traffic/GestionDesviosPage'));
const StmScraperStatus = lazy(() => import('./pages/admin/StmScraperStatus'));
const HeadwayInsights = lazy(() => import('./pages/traffic/HeadwayInsights'));
const GPSPlayback = lazy(() => import('./pages/traffic/GPSPlayback'));
const CentroTurnoDashboard = lazy(() => import('./pages/traffic/CentroTurnoDashboard'));
const PanelFinancieroOperativo = lazy(() => import('./pages/traffic/PanelFinancieroOperativo'));
const DisponibilidadFlota = lazy(() => import('./pages/fleet/DisponibilidadFlota'));
const PanelRendicionCuentas = lazy(() => import('./pages/admin/PanelRendicionCuentas'));
const DiagnosticoCumplimiento = lazy(() => import('./pages/traffic/DiagnosticoCumplimiento'));
const RankingCoches = lazy(() => import('./pages/traffic/RankingCoches'));
// Hubs unificados (wrapper de tabs — no reemplazan los componentes originales)
const CumplimientoHub      = lazy(() => import('./pages/traffic/CumplimientoHub'));
const CorredoresHub        = lazy(() => import('./pages/traffic/CorredoresHub'));
const TurnoVivoHub         = lazy(() => import('./pages/traffic/TurnoVivoHub'));
const MapaFlotaHub         = lazy(() => import('./pages/traffic/MapaFlotaHub'));
const IncidenciasHub       = lazy(() => import('./pages/traffic/IncidenciasHub'));
const ListeroHub           = lazy(() => import('./pages/traffic/ListeroHub'));
const PlanificacionHub     = lazy(() => import('./pages/traffic/PlanificacionHub'));
const FinancieroHub        = lazy(() => import('./pages/traffic/FinancieroHub'));
const MapasHub             = lazy(() => import('./pages/traffic/MapasHub'));
const GestionFlotaHub      = lazy(() => import('./pages/fleet/GestionFlotaHub'));
const GestionPersonalHub   = lazy(() => import('./pages/admin/GestionPersonalHub'));
const InspectoresHub       = lazy(() => import('./pages/admin/InspectoresHub'));
const SistemaAdminHub      = lazy(() => import('./pages/admin/SistemaAdminHub'));
const RegulatorioHub       = lazy(() => import('./pages/admin/RegulatorioHub'));
// Sprint 1 (2026-04-25): Pricing público — accesible sin auth
const PricingPage = lazy(() => import('./pages/public/PricingPage'));
const OnboardingPage = lazy(() => import('./pages/public/OnboardingPage'));


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
    setIsOffline(!navigator.onLine);

    // 2. Listen for changes
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);

    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  return (
    <ErrorBoundary>
      <Router>
        <AuthProvider>
          <PushNotificationInit />
          <Suspense fallback={null}>
            <SystemMonitor />
          </Suspense>
          <ToastProvider>
            {isOffline && <OfflineBanner />}
            <div className="h-screen w-screen max-w-[100vw] overflow-hidden bg-slate-950 text-slate-100 font-sans">
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/login" element={<LoginScreen />} />
                  <Route path="/pricing" element={<PricingPage />} />
                  <Route path="/pricing/onboarding" element={<OnboardingPage />} />

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
                    <Route index element={<RoleBasedLanding />} />

                    {/* Admin Routes — require ADMIN role */}
                    <Route path="admin/users" element={<PrivateRoute roles={['ADMIN']}><AdminUsers /></PrivateRoute>} />
                    <Route path="admin/balances" element={<PrivateRoute roles={['ADMIN']}><AdminBalances /></PrivateRoute>} />
                    <Route path="admin/rrhh" element={<PrivateRoute roles={['ADMIN','RRHH']}><GestionPersonalHub /></PrivateRoute>} />
                    <Route path="admin/rrhh/rotation" element={<Navigate to="/dashboard/admin/rrhh" replace />} />
                    <Route path="admin/rrhh/feriados" element={<Navigate to="/dashboard/admin/rrhh" replace />} />
                    <Route path="admin/communications" element={<PrivateRoute roles={['ADMIN']}><AdminWhatsApp /></PrivateRoute>} />
                    <Route path="admin/whatsapp-bot" element={<PrivateRoute roles={['ADMIN']}><AdminWhatsAppSettings /></PrivateRoute>} />
                    <Route path="admin/maintenance" element={<Navigate to="/dashboard/admin/sistema" replace />} />
                    <Route path="admin/maintenance-system" element={<Navigate to="/dashboard/admin/sistema" replace />} />
                    <Route path="admin/ingestion" element={<Navigate to="/dashboard/admin/sistema" replace />} />
                    <Route path="admin/cartones" element={<PrivateRoute roles={['ADMIN','TRAFFIC','LISTERO']}><AdminCartones /></PrivateRoute>} />
                    <Route path="admin/users/create" element={<PrivateRoute roles={['ADMIN']}><UserManagement /></PrivateRoute>} />
                    <Route path="admin/asignacion-vehiculos" element={<PrivateRoute roles={['ADMIN','TRAFFIC']}><AsignacionVehiculos /></PrivateRoute>} />
                    <Route path="admin/employees" element={<Navigate to="/dashboard/admin/rrhh" replace />} />
                    <Route path="admin/stress-test" element={<PrivateRoute roles={['ADMIN']}><AdminStressTest /></PrivateRoute>} />
                    <Route path="admin/params" element={<PrivateRoute roles={['ADMIN']}><SystemParamsPage /></PrivateRoute>} />
                    <Route path="admin/service-categories" element={<PrivateRoute roles={['ADMIN','TRAFFIC']}><ServiceCategoryPage /></PrivateRoute>} />
                    <Route path="admin/boletines" element={<PrivateRoute roles={['ADMIN']}><AdminBoletines /></PrivateRoute>} />
                    <Route path="admin/config" element={<Navigate to="/dashboard/admin/sistema" replace />} />
                    <Route path="admin/parametros" element={<Navigate to="/dashboard/admin/sistema" replace />} />
                    <Route path="admin/parametros-operativos" element={<PrivateRoute roles={['ADMIN','SUPERADMIN']}><AdminParametrosOperativos /></PrivateRoute>} />
                    <Route path="admin/turnos-operativos" element={<Navigate to="/dashboard/admin/sistema" replace />} />
                    <Route path="admin/audit-log" element={<Navigate to="/dashboard/admin/regulatorio" replace />} />
                    <Route path="admin/disruptions" element={<PrivateRoute roles={['ADMIN','SUPERADMIN','TRAFFIC']}><AdminDisruptionsPage /></PrivateRoute>} />
                    <Route path="admin/organization" element={<PrivateRoute roles={['ADMIN']}><AdminOrganization /></PrivateRoute>} />
                    <Route path="admin/setup" element={<Navigate to="/dashboard/admin/sistema" replace />} />
                    <Route path="admin/seed" element={<Navigate to="/dashboard/admin/sistema" replace />} />
                    <Route path="admin/shifts" element={<Navigate to="/dashboard/admin/rrhh" replace />} />
                    <Route path="admin/cross-op-coverage" element={<Navigate to="/dashboard/admin/regulatorio" replace />} />

                    {/* Super Admin Routes */}
                    <Route path="super-admin/tenants" element={<PrivateRoute roles={['SUPERADMIN']}><TenantsManager /></PrivateRoute>} />

                    {/* Alertas de Vía (menú Gestión de Flota) */}
                    <Route path="alerts" element={<RoadAlertsPage />} />

                    {/* Fleet Management Routes */}
                    <Route path="fleet" element={<GestionFlotaHub />} />
                    <Route path="fleet/inspect/:id" element={<InspectionForm />} />
                    <Route path="fleet/check" element={<Navigate to="/dashboard/fleet" replace />} />

                    {/* Universal Resource Manager Route */}
                    <Route path="universal/:entity" element={<UniversalPage />} />

                    {/* Traffic Department Routes — require TRAFFIC or ADMIN */}
                    <Route path="traffic/service-matrix" element={<Navigate to="/dashboard/traffic/planificacion" replace />} />
                    <Route path="traffic/inspector-control" element={<PrivateRoute roles={['ADMIN','TRAFFIC','INSPECTOR']}><InspectoresHub /></PrivateRoute>} />
                    <Route path="traffic/inspector-capture" element={<Navigate to="/dashboard/traffic/inspector-control" replace />} />
                    {/* Redirect legacy: Estadisticas Inspectores deprecada -> CEO Dashboard */}
                    <Route path="traffic/statistics" element={<Navigate to="/dashboard/traffic/ceo" replace />} />
                    <Route path="traffic/autostats" element={<PrivateRoute roles={['ADMIN','TRAFFIC']}><AutoStatsModule /></PrivateRoute>} />
                    <Route path="traffic/analytics" element={<PrivateRoute roles={['ADMIN','TRAFFIC']}><ServiceAnalytics /></PrivateRoute>} />
                    <Route path="traffic/cartons" element={<Navigate to="/dashboard/traffic/planificacion" replace />} />
                    <Route
                      path="traffic/cartons/detail/:lineId/:serviceId"
                      element={<PrivateRoute roles={['ADMIN','TRAFFIC','LISTERO']}><CartonDetail /></PrivateRoute>}
                    />
                    <Route path="traffic/navigation" element={<PrivateRoute roles={['ADMIN','TRAFFIC','LISTERO','DRIVER','CONDUCTOR']}><NavigationModule /></PrivateRoute>} />
                    <Route path="traffic/fleet-monitor" element={<PrivateRoute roles={['ADMIN','TRAFFIC']}><MapaFlotaHub /></PrivateRoute>} />
                    <Route path="traffic/cutcsa-fleet" element={<PrivateRoute roles={['ADMIN','TRAFFIC']}><CUTCSAFleetDashboard /></PrivateRoute>} />
                    <Route path="traffic/listero" element={<PrivateRoute roles={['ADMIN','TRAFFIC','LISTERO']}><ListeroHub /></PrivateRoute>} />
                    <Route path="traffic/listero-cascada" element={<Navigate to="/dashboard/traffic/listero" replace />} />
                    <Route path="traffic/distribucion" element={<Navigate to="/dashboard/traffic/listero" replace />} />
                    <Route path="traffic/boletin" element={<Navigate to="/dashboard/traffic/planificacion" replace />} />
                    <Route path="traffic/personal" element={<PrivateRoute roles={['ADMIN','TRAFFIC','RRHH']}><PersonalUcot /></PrivateRoute>} />
                    {/* Promovido 2026-04-25: V7 es ahora el dashboard ejecutivo default. */}
                    <Route path="traffic/ceo" element={<PrivateRoute roles={['ADMIN','TRAFFIC']}><CEODashboardV7 /></PrivateRoute>} />
                    {/* /ceo-v7 redirige a /ceo para preservar bookmarks. El legacy CEODashboard.tsx
                        sigue importado por si hace falta comparar A/B; queda accesible sólo via URL
                        directa /traffic/ceo-legacy (no en sidebar). */}
                    <Route path="traffic/ceo-v7" element={<Navigate to="/dashboard/traffic/ceo" replace />} />
                    <Route path="traffic/ceo-legacy" element={<PrivateRoute roles={['ADMIN','TRAFFIC']}><CEODashboard /></PrivateRoute>} />
                    <Route path="traffic/rotation-matrix" element={<PrivateRoute roles={['ADMIN','TRAFFIC','RRHH']}><RotationMatrix /></PrivateRoute>} />
                    {/* Redirect legacy: Centro de Inteligencia → Inteligencia de Corredores (v3) */}
                    <Route path="traffic/intelligence" element={<Navigate to="/dashboard/traffic/corridor-intelligence" replace />} />
                    {/* Redirect legacy: Mapa en Vivo STM → Mapa de Corredores (v4, más capas + DRO) */}
                    {/* Restaurado 2026-04-25: LiveMapPage tiene heatmap de demanda que CorridorMap no cubre. Ambos conviven con roles distintos. */}
                    <Route path="traffic/live-map" element={<PrivateRoute roles={['ADMIN','TRAFFIC','INSPECTOR']}><LiveMapPage /></PrivateRoute>} />
                    <Route path="traffic/shadow-radar" element={<PrivateRoute roles={['ADMIN','TRAFFIC']}><ShadowRadar /></PrivateRoute>} />
                    {/* Hub: Inteligencia de Corredores + Participación km en tabs */}
                    <Route path="traffic/corridor-intelligence" element={<PrivateRoute roles={['ADMIN','TRAFFIC']}><CorredoresHub /></PrivateRoute>} />
                    {/* Redirect: market-share ahora es tab del hub de corredores */}
                    <Route path="traffic/market-share" element={<Navigate to="/dashboard/traffic/corridor-intelligence" replace />} />
                    <Route path="traffic/corridor-map" element={<PrivateRoute roles={['ADMIN','TRAFFIC']}><MapasHub /></PrivateRoute>} />
                    <Route path="traffic/shadow-analytics" element={<Navigate to="/dashboard/traffic/corridor-intelligence" replace />} />
                    <Route path="traffic/penetration" element={<Navigate to="/dashboard/traffic/corridor-intelligence" replace />} />
                    <Route path="traffic/roi-calculator" element={<Navigate to="/dashboard/traffic/financiero" replace />} />
                    <Route path="traffic/desvios" element={<Navigate to="/dashboard/traffic/centro-turno" replace />} />
                    <Route path="traffic/centro-turno" element={<PrivateRoute roles={['ADMIN','TRAFFIC']}><TurnoVivoHub /></PrivateRoute>} />
                    {/* Hub: Diagnóstico por Línea + Ranking de Coches en tabs */}
                    <Route path="traffic/diagnostico-cumplimiento" element={<PrivateRoute roles={['ADMIN','TRAFFIC']}><CumplimientoHub /></PrivateRoute>} />
                    {/* Redirect: ranking-coches ahora es tab del hub de cumplimiento */}
                    <Route path="traffic/ranking-coches" element={<Navigate to="/dashboard/traffic/diagnostico-cumplimiento" replace />} />
                    <Route path="traffic/financiero-operativo" element={<Navigate to="/dashboard/traffic/financiero" replace />} />
                    <Route path="fleet/disponibilidad" element={<Navigate to="/dashboard/fleet" replace />} />
                    <Route path="admin/rendicion-cuentas" element={<Navigate to="/dashboard/admin/regulatorio" replace />} />
                    <Route path="traffic/scraper-status" element={<Navigate to="/dashboard/admin/sistema" replace />} />
                    <Route path="traffic/headway-insights" element={<Navigate to="/dashboard/traffic/corridor-intelligence" replace />} />
                    <Route path="traffic/gps-playback" element={<Navigate to="/dashboard/traffic/corridor-map" replace />} />
                    <Route path="traffic/agents" element={<Navigate to="/dashboard/traffic/intelligence" replace />} />
                    <Route path="traffic/brt" element={<PrivateRoute roles={['ADMIN','TRAFFIC']}><BRTCorridorDashboard /></PrivateRoute>} />
                    <Route path="traffic/otp" element={<PrivateRoute roles={['ADMIN','TRAFFIC','INSPECTOR']}><OTPDashboard /></PrivateRoute>} />
                    <Route path="traffic/incidents" element={<PrivateRoute roles={['ADMIN','TRAFFIC','INSPECTOR']}><IncidenciasHub /></PrivateRoute>} />
                    <Route path="traffic/projections" element={<Navigate to="/dashboard/traffic/financiero" replace />} />
                    <Route path="traffic/contingency" element={<Navigate to="/dashboard/traffic/incidents" replace />} />
                    <Route path="fleet/ev-charge" element={<EVChargeOptimizer />} />
                    <Route path="admin/compliance" element={<Navigate to="/dashboard/admin/regulatorio" replace />} />
                    <Route path="talento" element={<TalentCenter />} />

                    {/* Hubs nuevos — rutas que no existían antes de la consolidación */}
                    <Route path="traffic/planificacion" element={<PrivateRoute roles={['ADMIN','TRAFFIC','LISTERO']}><PlanificacionHub /></PrivateRoute>} />
                    <Route path="traffic/financiero" element={<PrivateRoute roles={['ADMIN','TRAFFIC']}><FinancieroHub /></PrivateRoute>} />
                    <Route path="admin/sistema" element={<PrivateRoute roles={['ADMIN']}><SistemaAdminHub /></PrivateRoute>} />
                    <Route path="admin/regulatorio" element={<PrivateRoute roles={['ADMIN','SUPERADMIN']}><RegulatorioHub /></PrivateRoute>} />

                    {/* User Routes — require login */}
                    <Route path="create-shift" element={<PrivateRoute><CreateShift /></PrivateRoute>} />
                    <Route path="market" element={<PrivateRoute><Marketplace /></PrivateRoute>} />
                    <Route path="abl" element={<PrivateRoute roles={['ADMIN','TRAFFIC','ABL']}><ABLPage /></PrivateRoute>} />
                    <Route path="abl/penalizations" element={<PrivateRoute roles={['ADMIN','TRAFFIC','ABL']}><PenalizationsPage /></PrivateRoute>} />
                    <Route path="my-shifts" element={<PrivateRoute><MyShifts /></PrivateRoute>} />
                    <Route path="my-balance" element={<PrivateRoute><MyBalance /></PrivateRoute>} />
                    <Route path="driver/schedule" element={<PrivateRoute roles={['ADMIN','DRIVER','CONDUCTOR']}><DriverSchedule /></PrivateRoute>} />
                    <Route path="driver/mi-servicio" element={<PrivateRoute roles={['ADMIN','DRIVER','CONDUCTOR']}><DriverServiceView /></PrivateRoute>} />
                    <Route path="driver/navigation" element={<PrivateRoute roles={['ADMIN','DRIVER','CONDUCTOR']}><DriverNavigation /></PrivateRoute>} />
                    <Route path="driver/report" element={<PrivateRoute roles={['ADMIN','DRIVER','CONDUCTOR']}><NewReport /></PrivateRoute>} />
                    <Route path="driver/bus-navigation" element={<PrivateRoute roles={['ADMIN','DRIVER','CONDUCTOR']}><BusNavigation /></PrivateRoute>} />
                    <Route path="driver/compliance" element={<PrivateRoute roles={['ADMIN','DRIVER','CONDUCTOR']}><DriverCompliance /></PrivateRoute>} />

                    {/* Operations Routes */}
                    <Route path="operations/distribution" element={<PrivateRoute roles={['ADMIN','TRAFFIC','LISTERO']}><Distribution /></PrivateRoute>} />

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
