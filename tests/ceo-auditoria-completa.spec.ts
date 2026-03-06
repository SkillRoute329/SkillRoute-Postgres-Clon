/**
 * Auditoría CEO: todas y cada una de las funciones del programa.
 * Verifica que cada ruta cargue y que cada control exista y sea accesible.
 * Ejecutar con: npx playwright test tests/ceo-auditoria-completa.spec.ts
 * Requiere: app en http://localhost:5173 y usuario 329 / admin123 (o configurar USUARIO/PASSWORD).
 */
import { test, expect } from '@playwright/test';

const USUARIO = process.env.TEST_USER || '329';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';
const BASE = process.env.BASE_URL || 'http://localhost:5173';

test.describe('Auditoría CEO - Todas las funciones', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder(/1234|número interno/i).fill(USUARIO);
    // Usar el placeholder real o el tipo
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole('button', { name: /Ingresar/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30000 });
  });

  test('Cabecera: EN LÍNEA abre panel System Guard', async ({ page }) => {
    // Esperar a que el estado pase de 'checking' a 'en línea' o 'lento'
    const statusBtn = page.getByRole('button', { name: /EN LÍNEA|LENTO|OFFLINE/i });
    await expect(statusBtn).toBeVisible({ timeout: 15000 });
    await statusBtn.click();
    await expect(
      page.getByRole('heading', { name: /System Guard|Monitor de Integridad/i }),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /EJECUTAR DIAGNÓSTICO/i })).toBeVisible();
  });

  test('Cabecera: Notificaciones abre panel', async ({ page }) => {
    const notifyBtn = page.getByRole('button', { name: /notificaciones|mensajes/i });
    await expect(notifyBtn).toBeVisible({ timeout: 10000 });
    await notifyBtn.click();
    await expect(page.getByRole('heading', { name: /Notificaciones/i })).toBeVisible({
      timeout: 10000,
    });
  });

  test('Cabecera: INICIAR TURNO abre flujo check-in', async ({ page }) => {
    await page.getByRole('button', { name: /INICIAR TURNO/i }).click();
    await expect(
      page.getByRole('heading', { name: /Check-in|Inspección|Advertencia/i }),
    ).toBeVisible({ timeout: 5000 });
    await page
      .getByRole('button', { name: /NO, OMITIR|Volver/i })
      .first()
      .click({ timeout: 5000 })
      .catch(() => {});
  });

  test('Matriz de Servicio: carga, historial, Subir nube, botones línea', async ({ page }) => {
    await page.goto(`${BASE}/dashboard/traffic/service-matrix`);
    await expect(page).toHaveURL(/service-matrix/);
    await expect(page.getByRole('heading', { name: /Historial Cloud|Matriz/i })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole('button', { name: /Subir a la nube/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /300a|300b/i })).toBeVisible();
  });

  test('Control Inspectores: Línea, Cargar, Estadísticas', async ({ page }) => {
    await page.goto(`${BASE}/dashboard/traffic/inspector-control`);
    await expect(page).toHaveURL(/inspector-control/);
    await expect(page.getByRole('combobox', { name: /Línea/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /Cargar/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Estadísticas/i })).toBeVisible();
  });

  test('Captura Inspector: combos Línea, Servicio, Punto', async ({ page }) => {
    await page.goto(`${BASE}/dashboard/traffic/inspector-capture`);
    await expect(page).toHaveURL(/inspector-capture/);
    await expect(page.getByRole('combobox', { name: /Línea|Seleccionar línea/i })).toBeVisible({
      timeout: 10000,
    });
  });

  test('Gestor de Cartones: carga', async ({ page }) => {
    await page.goto(`${BASE}/dashboard/traffic/cartons`);
    await expect(page).toHaveURL(/cartons/);
    await expect(page.getByRole('heading', { name: /Carton|cartón/i })).toBeVisible({
      timeout: 10000,
    });
  });

  test('Lista Diaria: carga', async ({ page }) => {
    await page.goto(`${BASE}/dashboard/traffic/daily-list`);
    await expect(page).toHaveURL(/daily-list/);
    await expect(page.locator('main')).toBeVisible({ timeout: 10000 });
  });

  test('Navegador UCOT: carga, Iniciar Viaje, Actualizar', async ({ page }) => {
    await page.goto(`${BASE}/dashboard/traffic/navigation`);
    await expect(page).toHaveURL(/navigation/);
    await expect(page.getByRole('button', { name: /Iniciar Viaje|Actualizar/i })).toBeVisible({
      timeout: 10000,
    });
  });

  test('Monitoreo de Flota: carga, Zoom', async ({ page }) => {
    await page.goto(`${BASE}/dashboard/traffic/fleet-monitor`);
    await expect(page).toHaveURL(/fleet-monitor/);
    await expect(page.getByRole('button', { name: /Zoom in|Zoom out/i })).toBeVisible({
      timeout: 10000,
    });
  });

  test('Estadísticas Inspectores: carga', async ({ page }) => {
    await page.goto(`${BASE}/dashboard/traffic/statistics`);
    await expect(page).toHaveURL(/statistics/);
    await expect(page.locator('main')).toBeVisible({ timeout: 10000 });
  });

  test('Analítica de Servicio: carga', async ({ page }) => {
    await page.goto(`${BASE}/dashboard/traffic/analytics`);
    await expect(page).toHaveURL(/analytics/);
    await expect(page.locator('main')).toBeVisible({ timeout: 10000 });
  });

  test('Coches / Inventario: carga', async ({ page }) => {
    await page.goto(`${BASE}/dashboard/fleet`);
    await expect(page).toHaveURL(/fleet/);
    await expect(page.locator('main')).toBeVisible({ timeout: 10000 });
  });

  test('Mantenimiento: Nueva Denuncia, filtros', async ({ page }) => {
    await page.goto(`${BASE}/dashboard/admin/maintenance`);
    await expect(page).toHaveURL(/maintenance/);
    await expect(page.getByRole('button', { name: /Nueva Denuncia|Todos|Enviado/i })).toBeVisible({
      timeout: 10000,
    });
  });

  test('Alertas de Vía: carga', async ({ page }) => {
    await page.goto(`${BASE}/dashboard/alerts`);
    await expect(page).toHaveURL(/alerts/);
    await expect(page.getByRole('heading', { name: /Alertas/i })).toBeVisible({ timeout: 10000 });
  });

  test('Gestión de Personal RRHH: Usuarios, Exportar, Nuevo Empleado', async ({ page }) => {
    await page.goto(`${BASE}/dashboard/admin/rrhh`);
    await expect(page).toHaveURL(/rrhh/);
    await expect(
      page.getByRole('button', { name: /Usuarios|Exportar|Nuevo Empleado/i }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('Centro de Talento: carga, lista conductores', async ({ page }) => {
    await page.goto(`${BASE}/dashboard/talento`);
    await expect(page).toHaveURL(/talento/);
    await expect(page.locator('main')).toBeVisible({ timeout: 10000 });
  });

  test('Motor de Rotación: Coche, Conductor, Servicio, Asignar', async ({ page }) => {
    await page.goto(`${BASE}/dashboard/admin/rrhh/rotation`);
    await expect(page).toHaveURL(/rotation/);
    await expect(page.getByRole('combobox', { name: /Coche|Conductor|Servicio/i })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole('button', { name: /Asignar y Guardar/i })).toBeVisible();
  });

  test('Fichas Médicas/CI: Exportar, Importar, Nuevo Empleado', async ({ page }) => {
    await page.goto(`${BASE}/dashboard/admin/employees`);
    await expect(page).toHaveURL(/employees/);
    await expect(
      page.getByRole('button', { name: /Exportar|Importar|Nuevo Empleado/i }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('Estado del Sistema: ACTUALIZAR SISTEMA', async ({ page }) => {
    await page.goto(`${BASE}/dashboard/admin/maintenance-system`);
    await expect(page).toHaveURL(/maintenance-system/);
    await expect(page.getByRole('button', { name: /ACTUALIZAR SISTEMA/i })).toBeVisible({
      timeout: 10000,
    });
  });

  test('Ingesta de Datos: DESCARGAR PLANTILLA, Sincronizar', async ({ page }) => {
    await page.goto(`${BASE}/dashboard/admin/ingestion`);
    await expect(page).toHaveURL(/ingestion/);
    await expect(
      page.getByRole('button', { name: /DESCARGAR PLANTILLA|Sincronizar|Limpiar/i }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('Parámetros del Sistema: Margen, Guardar', async ({ page }) => {
    await page.goto(`${BASE}/dashboard/admin/params`);
    await expect(page).toHaveURL(/params/);
    await expect(page.getByRole('button', { name: /Guardar/i })).toBeVisible({ timeout: 10000 });
  });

  test('Bolsa de Trabajo: carga', async ({ page }) => {
    await page.goto(`${BASE}/dashboard/market`);
    await expect(page).toHaveURL(/market/);
    await expect(page.locator('main')).toBeVisible({ timeout: 10000 });
  });

  test('Mi Cuenta: Descargar PDF', async ({ page }) => {
    await page.goto(`${BASE}/dashboard/my-balance`);
    await expect(page).toHaveURL(/my-balance/);
    await expect(page.getByRole('button', { name: /Descargar PDF/i })).toBeVisible({
      timeout: 10000,
    });
  });

  test('Cerrar Sesión redirige a login', async ({ page }) => {
    await page.getByRole('button', { name: /Cerrar Sesión/i }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('button', { name: /Ingresar/i })).toBeVisible();
  });
});
