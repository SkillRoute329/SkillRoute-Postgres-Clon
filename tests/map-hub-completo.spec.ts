import { test, expect } from '@playwright/test';

const USUARIO = process.env.TEST_USER || '329';
const PASSWORD = process.env.TEST_PASSWORD || 'Skill329';
const BASE = process.env.BASE_URL || 'http://localhost:3006';

test.describe('E2E Map Hub Unificado', () => {
  test.beforeEach(async ({ page }) => {
    // Iniciar sesión
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.locator('input[type="text"]').fill(USUARIO);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole('button', { name: /Ingresar/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30000 });
  });

  test('La consola Map Hub carga correctamente en la ruta unificada y muestra el mapa Leaflet', async ({ page }) => {
    await page.goto(`${BASE}/dashboard/traffic/map-hub`);
    await expect(page).toHaveURL(/traffic\/map-hub/);
    
    // Validar cabecera y estado
    await expect(page.getByRole('heading', { name: 'Map Hub Unificado' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('SISTEMA VIVO', { exact: false })).toBeVisible();

    // Validar presencia del contenedor del mapa Leaflet
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 15000 });
  });

  test('Redirecciones desde rutas legacy a la consola unificada Map Hub', async ({ page }) => {
    // 1. /live-map
    await page.goto(`${BASE}/dashboard/traffic/live-map`);
    await expect(page).toHaveURL(/traffic\/map-hub\?layer=mapa/);
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10000 });

    // 2. /fleet-monitor
    await page.goto(`${BASE}/dashboard/traffic/fleet-monitor`);
    await expect(page).toHaveURL(/traffic\/map-hub\?layer=buses/);
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10000 });
  });

  test('Las capas y paneles de control son interactivos', async ({ page }) => {
    await page.goto(`${BASE}/dashboard/traffic/map-hub`);
    await expect(page).toHaveURL(/traffic\/map-hub/);

    // 1. Control de Capas - Toggle Capa de Paradas
    const stopsBtn = page.getByRole('button', { name: /Paradas GTFS/i });
    await expect(stopsBtn).toBeVisible({ timeout: 10000 });
    await stopsBtn.click();
    
    // 2. Click en Tab de Desvíos & Alertas en Sidebar
    const tabAlerts = page.getByRole('button', { name: /Desvíos & Alertas/i });
    await expect(tabAlerts).toBeVisible();
    await tabAlerts.click();
    await expect(page.getByText('Alertas de Desvío', { exact: true })).toBeVisible();

    // 3. Click en Tab de Bunching
    const tabBunching = page.getByRole('button', { name: /Bunching/i });
    await expect(tabBunching).toBeVisible();
    await tabBunching.click();
    await expect(page.getByText('Saturación de Frecuencia', { exact: false })).toBeVisible();

    // 4. Click en Tab de DRO
    const tabDro = page.getByRole('button', { name: /Superposición DRO/i });
    await expect(tabDro).toBeVisible();
    await tabDro.click();
    await expect(page.getByText('Cruces de Superposición Críticos', { exact: false })).toBeVisible();
  });
});
