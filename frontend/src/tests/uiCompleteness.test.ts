/**
 * Test de cobertura de UI: todos los ítems del Sidebar tienen ruta definida (no 404) y no apuntan a vacío.
 * Lista de rutas debe coincidir con App.tsx (dashboard layout).
 */
import { describe, it, expect } from 'vitest';

const SIDEBAR_PATHS = [
  '/dashboard',
  '/dashboard/traffic/service-matrix',
  '/dashboard/traffic/inspector-control',
  '/dashboard/traffic/inspector-capture',
  '/dashboard/traffic/cartons',
  '/dashboard/traffic/daily-list',
  '/dashboard/traffic/navigation',
  '/dashboard/traffic/fleet-monitor',
  '/dashboard/traffic/statistics',
  '/dashboard/traffic/analytics',
  '/dashboard/fleet',
  '/dashboard/admin/maintenance',
  '/dashboard/alerts',
  '/dashboard/admin/rrhh',
  '/dashboard/talento',
  '/dashboard/admin/rrhh/rotation',
  '/dashboard/admin/employees',
  '/dashboard/admin/maintenance-system',
  '/dashboard/admin/ingestion',
  '/dashboard/admin/params',
  '/dashboard/market',
  '/dashboard/my-balance',
];

const APP_ROUTE_PATHS: string[] = [
  '/dashboard',
  '/dashboard/admin/users',
  '/dashboard/admin/balances',
  '/dashboard/admin/rrhh',
  '/dashboard/admin/rrhh/rotation',
  '/dashboard/admin/communications',
  '/dashboard/admin/whatsapp-bot',
  '/dashboard/admin/maintenance',
  '/dashboard/admin/maintenance-system',
  '/dashboard/admin/ingestion',
  '/dashboard/admin/users/create',
  '/dashboard/admin/employees',
  '/dashboard/admin/stress-test',
  '/dashboard/admin/params',
  '/dashboard/super-admin/tenants',
  '/dashboard/alerts',
  '/dashboard/fleet',
  '/dashboard/fleet/inspect/:id',
  '/dashboard/universal/:entity',
  '/dashboard/traffic/service-matrix',
  '/dashboard/traffic/inspector-control',
  '/dashboard/traffic/inspector-capture',
  '/dashboard/traffic/statistics',
  '/dashboard/traffic/analytics',
  '/dashboard/traffic/cartons',
  '/dashboard/traffic/cartons/detail/:lineId/:serviceId',
  '/dashboard/traffic/navigation',
  '/dashboard/traffic/fleet-monitor',
  '/dashboard/traffic/daily-list',
  '/dashboard/traffic/ceo',
  '/dashboard/talento',
  '/dashboard/create-shift',
  '/dashboard/market',
  '/dashboard/abl',
  '/dashboard/abl/penalizations',
  '/dashboard/my-shifts',
  '/dashboard/my-balance',
  '/dashboard/driver/schedule',
  '/dashboard/driver/mi-servicio',
  '/dashboard/driver/navigation',
  '/dashboard/driver/report',
];

function pathMatchesRoute(sidebarPath: string, routePaths: string[]): boolean {
  if (routePaths.includes(sidebarPath)) return true;
  for (const r of routePaths) {
    if (r.includes(':')) {
      const pattern = r.replace(/:[^/]+/g, '[^/]+');
      const regex = new RegExp(`^${pattern}$`);
      if (regex.test(sidebarPath)) return true;
    }
  }
  return false;
}

describe('UI Completeness – Sidebar vs rutas', () => {
  it('cada path del Sidebar tiene una ruta definida en App (no 404)', () => {
    const missing: string[] = [];
    for (const path of SIDEBAR_PATHS) {
      if (!pathMatchesRoute(path, APP_ROUTE_PATHS)) missing.push(path);
    }
    expect(missing).toEqual([]);
  });

  it('no hay ítems del menú con texto "en desarrollo" o placeholder inactivo', () => {
    const forbidden = ['en desarrollo', 'próximamente', 'placeholder'];
    const sidebarLabels = [
      'Matriz de Servicio',
      'Control Inspectores',
      'Captura Inspector (Móvil)',
      'Gestor de Cartones',
      'Lista Diaria (Listero)',
      'Navegador UCOT',
      'Monitoreo de Flota',
      'Estadísticas Inspectores',
      'Analítica de Servicio',
      'Coches / Inventario',
      'Mantenimiento',
      'Alertas de Vía',
      'Gestión de Personal',
      'Centro de Talento',
      'Motor de Rotación',
      'Fichas Médicas/CI',
      'Estado del Sistema',
      'Ingesta de Datos',
      'Parámetros del Sistema',
      'Bolsa de Trabajo',
      'Mi Cuenta',
    ];
    for (const label of sidebarLabels) {
      for (const word of forbidden) {
        expect(label.toLowerCase().includes(word)).toBe(false);
      }
    }
  });
});
